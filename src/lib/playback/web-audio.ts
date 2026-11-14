/**
 * ALLOY — Web Audio scheduled-chunk output (Task 8.1).
 *
 * The browser backend for the shared transport. It does not decode whole stems
 * and does not run DSP: producers hand it bounded stereo chunks, it copies each
 * chunk into a short AudioBuffer and schedules it at the sample-clock time that
 * matches the shared playhead. A generation counter plus explicit stop/disconnect
 * guarantees a seek or stop cannot leave an old scheduled chunk audible.
 *
 * Backpressure is part of the contract: `write` waits while roughly one second of
 * audio is already scheduled, so a fast render cannot accumulate a project-sized
 * queue in memory.
 */

import { PLAYBACK_QUEUE_SECONDS, type PlaybackOutput } from "./types";
import { DEFAULT_PROJECT_RATE } from "../audio/rates";

const LEAD_SECONDS = 0.03;
const POLL_MS = 10;

export interface WebAudioOutputOptions {
  readonly sampleRate?: number;
  readonly queueSeconds?: number;
  readonly createContext?: () => AudioContext;
}

export function createWebAudioOutput(options: WebAudioOutputOptions = {}): PlaybackOutput {
  // Task 11.1: the context is created at the PROJECT's rate (the shell passes
  // it); the DEVICE's own rate may differ, and that conversion is Web Audio's
  // business — there is no custom output path here.
  const sampleRate = options.sampleRate ?? DEFAULT_PROJECT_RATE;
  // Stage 0: the queue depth is settable per attempt (the controller sets it to
  // LIVE_PLAYBACK_QUEUE_SECONDS for raw/preview and back to the shared
  // PLAYBACK_QUEUE_SECONDS for render); the option stays the construction default.
  let queueSeconds = options.queueSeconds ?? PLAYBACK_QUEUE_SECONDS;
  let maxQueueFrames = Math.ceil(sampleRate * queueSeconds);
  let underrunCount = 0;
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let epoch: number | null = null;
  let generation = 0;
  let scheduledUntil = 0;
  // Stage 1: the played-frames clock of the CURRENT attempt. `attemptStartFrame`
  // is the frame the attempt began at (attempt frame 0), `firstChunkAt` the
  // context time the attempt's first chunk was actually scheduled for, and
  // `frozenPlayed` the value playedFrames() froze at when the attempt was
  // stopped or paused — it stays frozen until the next begin resets it.
  let attemptStartFrame = 0;
  let firstChunkAt: number | null = null;
  let frozenPlayed: number | null = null;
  const nodes = new Set<AudioBufferSourceNode>();

  const ensureContext = (): AudioContext => {
    if (context) return context;
    const Ctor = options.createContext
      ?? (() => {
        const win = window as unknown as {
          AudioContext?: typeof AudioContext;
          webkitAudioContext?: typeof AudioContext;
        };
        const Factory = win.AudioContext ?? win.webkitAudioContext;
        if (!Factory) throw new Error("Alloy playback: Web Audio is not available in this browser");
        return new Factory({ sampleRate });
      });
    const ctx = Ctor();
    context = ctx;
    master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);
    return ctx;
  };

  const positionFrames = (): number => {
    if (!context || epoch === null) return 0;
    return Math.max(0, Math.round((context.currentTime - epoch) * sampleRate));
  };

  /**
   * Stage 1: frames of the CURRENT attempt that have reached the speakers —
   * attempt frame 0 is the first frame delivered to the output (the producer
   * has already dropped the engine's lookahead by then). The sample clock the
   * playhead already uses (`epoch`, the first chunk's intended time) is reused
   * with the attempt-relative offset, the output latency subtracted, and the
   * result clamped to [0, frames scheduled so far]. After a stop or pause it
   * stays frozen at the value it had at that moment; every new `begin` resets
   * the clock for the new attempt.
   */
  const playedFrames = (): number => {
    if (frozenPlayed !== null) return frozenPlayed;
    if (!context || epoch === null || firstChunkAt === null) return 0;
    // outputLatency when the browser reports it, otherwise baseLatency, otherwise 0.
    const ctx = context as AudioContext & { outputLatency?: number; baseLatency?: number };
    const latencySeconds = typeof ctx.outputLatency === "number" ? ctx.outputLatency : typeof ctx.baseLatency === "number" ? ctx.baseLatency : 0;
    const played = (context.currentTime - firstChunkAt) * sampleRate - latencySeconds * sampleRate;
    const scheduled = Math.max(0, scheduledUntil - attemptStartFrame);
    return Math.max(0, Math.min(played, scheduled));
  };

  const stop = (): void => {
    // Stage 1: freeze the played-frames clock at the value it has at this
    // moment — the attempt is over, and playedFrames() must not move again
    // until the next begin resets it. (A stop with no attempt behind it freezes
    // nothing: there is no clock to freeze.)
    if (epoch !== null || firstChunkAt !== null) frozenPlayed = playedFrames();
    generation++;
    epoch = null;
    scheduledUntil = 0;
    for (const node of nodes) {
      try {
        node.onended = null;
        node.stop();
      } catch {
        // A source that never started or already ended is still disconnected.
      }
      node.disconnect();
    }
    nodes.clear();
  };

  const waitForCapacity = async (gen: number): Promise<void> => {
    while (generation === gen && epoch !== null && scheduledUntil - positionFrames() > maxQueueFrames) {
      await new Promise<void>((resolve) => setTimeout(resolve, POLL_MS));
    }
    if (generation !== gen || epoch === null) throw new Error("Alloy playback: output generation stopped");
  };

  return {
    sampleRate,
    async begin(startFrame) {
      const ctx = ensureContext();
      if (ctx.state === "suspended") await ctx.resume();
      stop();
      // Stage 0: underruns are counted per generation — a new attempt starts at zero.
      underrunCount = 0;
      epoch = ctx.currentTime + LEAD_SECONDS - startFrame / sampleRate;
      scheduledUntil = startFrame;
      // Stage 1: the new attempt's played-frames clock starts here — frame 0 is
      // the first frame delivered to the output, and the frozen value of the
      // attempt before this one is discarded.
      attemptStartFrame = startFrame;
      firstChunkAt = null;
      frozenPlayed = null;
    },
    async write(chunk) {
      const ctx = ensureContext();
      if (epoch === null) throw new Error("Alloy playback: output has not begun");
      const gen = generation;
      await waitForCapacity(gen);
      if (chunk.frames <= 0) return;
      const end = chunk.startFrame + chunk.frames;
      if (end <= positionFrames()) return;
      const buffer = ctx.createBuffer(2, chunk.frames, sampleRate);
      for (let c = 0; c < 2; c++) buffer.getChannelData(c).set(chunk.channels[c].subarray(0, chunk.frames));
      const node = ctx.createBufferSource();
      node.buffer = buffer;
      node.connect(master as GainNode);
      const intended = epoch + chunk.startFrame / sampleRate;
      // Stage 0: an underrun is a chunk whose intended start time is already
      // earlier than the clock when it is scheduled.
      if (intended < ctx.currentTime) underrunCount++;
      const at = Math.max(ctx.currentTime, intended);
      // Stage 1: the first chunk actually scheduled defines the attempt's
      // audible start; playedFrames() measures from it.
      if (firstChunkAt === null) firstChunkAt = at;
      nodes.add(node);
      node.onended = () => {
        nodes.delete(node);
        node.disconnect();
      };
      node.start(at);
      scheduledUntil = Math.max(scheduledUntil, end);
    },
    positionFrames,
    playedFrames,
    setQueueSeconds(seconds: number): void {
      queueSeconds = seconds;
      maxQueueFrames = Math.ceil(sampleRate * seconds);
    },
    get underruns(): number {
      return underrunCount;
    },
    async drain() {
      const gen = generation;
      while (generation === gen && epoch !== null && positionFrames() < scheduledUntil) {
        await new Promise<void>((resolve) => setTimeout(resolve, POLL_MS));
      }
    },
    stop,
    dispose() {
      stop();
      master?.disconnect();
      void context?.close();
      context = null;
      master = null;
    },
  };
}
