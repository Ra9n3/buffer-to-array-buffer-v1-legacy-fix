/**
 * ALLOY — the one shared transport controller (Task 8.1).
 *
 * Owns play/pause/stop/seek, the listening source, the playhead and the bounded
 * producer lifecycle. Rooms do not own playback state; they read this controller
 * through the reactive wrapper in store.svelte.ts. The audio output, source
 * opener and clock are injected, so the same state machine is tested in Node with
 * synthetic sources and driven in the browser by Web Audio.
 *
 * Recovery rule: pause, stop, seek and restart all stop the current output
 * generation and discard scheduled audio before a new attempt begins. Live DSP
 * state is continuous only inside one unbroken playback attempt; a new attempt
 * reinitializes the engine at the requested frame, so no stale limiter/reverb/
 * compressor state can leak across a locate.
 */

import { MixEngine } from "../engine/mix-engine";
import {
  RenderCancelledError,
  renderProject,
  type RenderChunk,
  type RenderResult,
  type RenderSink,
  type RenderSource,
} from "../engine/render";
import type { Project, TrackId } from "../project/model";
import { createPreviewSession, createRawSession, type PlaybackSession } from "./sessions";
import {
  clampFrame,
  closeSources,
  DEFAULT_PLAYBACK_CHUNK_FRAMES,
  DEFAULT_RENDER_PLAYBACK_CHUNK_FRAMES,
  initialPlaybackState,
  sourceDurationFrames,
  STOP_BEHAVIOUR_OFF,
  type ListeningSource,
  type LoopRegion,
  type PlaybackControllerOptions,
  type PlaybackState,
  type PcmChunk,
  type StopBehaviour,
} from "./types";

export class PlaybackController {
  private state: PlaybackState;
  private readonly listeners = new Set<(state: PlaybackState) => void>();
  private readonly getProject: () => Project;
  private readonly openSources: (project: Project) => Promise<ReadonlyMap<TrackId, RenderSource>>;
  private readonly output: PlaybackControllerOptions["output"];
  private readonly clock: PlaybackControllerOptions["clock"];
  private readonly chunkFrames: number;
  private readonly renderChunkFrames: number;
  private readonly tailSeconds?: number;
  /** Task 10.1: the Stop preferences, read per Stop (both off when injected without one). */
  private readonly stopBehaviour: () => StopBehaviour;
  /** Task 10.1: the active loop region, polled while playing (none when injected without one). */
  private readonly loop: () => LoopRegion | null;
  private abort: AbortController | null = null;
  private generation = 0;
  /**
   * Task 10.1: true while a restart is in the async gap between cancelling
   * the old attempt and beginning the new one (openSources + begin). While
   * it is true the output is already stopped — its clock reads 0 — so the
   * poll and `positionFramesNow` must hold the TARGET instead of sampling
   * the dead clock, or every wrap and locate would blip the playhead to the
   * project start for the length of the gap. Cleared once the new attempt
   * has begun (or errored); a superseded attempt leaves it to its successor.
   */
  private restarting = false;
  /**
   * Task 9.1.3: counts mixes made, for the life of the controller. Monotonic on
   * purpose — `clearMix` sets the *state* back to null but must not rewind this, or
   * the mix after a cleared one would reuse the number of the mix before it.
   */
  private mixRevisions = 0;
  private cancelPoll: () => void;
  private disposed = false;

  constructor(options: PlaybackControllerOptions) {
    this.getProject = options.getProject;
    this.openSources = options.openSources;
    this.output = options.output;
    this.clock = options.clock;
    this.chunkFrames = options.chunkFrames ?? DEFAULT_PLAYBACK_CHUNK_FRAMES;
    this.renderChunkFrames = options.renderChunkFrames ?? DEFAULT_RENDER_PLAYBACK_CHUNK_FRAMES;
    this.tailSeconds = options.tailSeconds;
    this.stopBehaviour = options.stopBehaviour ?? (() => STOP_BEHAVIOUR_OFF);
    this.loop = options.loop ?? (() => null);
    this.state = initialPlaybackState(options.output.sampleRate);
    this.cancelPoll = options.clock.schedule(() => this.syncPosition(), 50);
  }

  getState(): PlaybackState {
    return { ...this.state };
  }

  subscribe(listener: (state: PlaybackState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  private set(patch: Partial<PlaybackState>): void {
    this.state = { ...this.state, ...patch };
    const snapshot = this.getState();
    for (const listener of this.listeners) listener(snapshot);
  }

  private defaultTailSeconds(project: Project): number {
    if (this.tailSeconds !== undefined) return this.tailSeconds;
    const engine = new MixEngine(project, { sampleRate: this.output.sampleRate, maxFramesPerBlock: 1 });
    const tail = engine.tailSeconds;
    engine.reset();
    return tail;
  }

  setSource(source: ListeningSource): void {
    if (this.state.source === source) return;
    const wasPlaying = this.state.status === "playing" || this.state.status === "rendering";
    const position = this.state.positionFrames;
    this.stop();
    // The duration is NOT blanked here (Task 9.1): it belongs to the project, not to
    // the listening mode, and zeroing it made the playhead's range (and therefore
    // Previous/Next) collapse every time the user changed how they were listening.
    // The new mode's duration is recomputed below; until it arrives the old one is a
    // better bound than nothing.
    this.set({ source, positionFrames: position, renderProgress: null, error: null });
    void this.refreshDuration();
    if (wasPlaying) void this.play();
  }

  /**
   * Recompute `durationFrames` without playing, seeking or changing status.
   *
   * The duration is a property of the project and the listening mode, so the transport
   * must know it before the first Play: Previous/Next, the readout and the playhead's
   * clamp all read it while the transport is stopped. Opening the sources is the only
   * way to know the longest stem, so this costs one pass over them — the shell calls it
   * when the project's structure changes (an import, a project switch), which is exactly
   * when the answer can differ.
   */
  async refreshDuration(): Promise<void> {
    if (this.disposed) return;
    const generation = this.generation;
    const source = this.state.source;
    const project = this.getProject();
    let sources: ReadonlyMap<TrackId, RenderSource> | null = null;
    try {
      sources = await this.openSources(project);
    } catch {
      // A duration refresh is a convenience, never a failure: the transport stays
      // usable and the next play reports anything that is really wrong.
      return;
    }
    try {
      if (generation !== this.generation || this.disposed) return;
      const tail = source === "raw" ? 0 : this.defaultTailSeconds(project);
      const duration = sourceDurationFrames(sources, source, this.output.sampleRate, tail);
      this.set({ durationFrames: duration });
    } finally {
      await closeSources(sources);
    }
  }

  async play(): Promise<void> {
    if (this.disposed || this.state.status === "playing" || this.state.status === "rendering") return;
    const duration = this.state.durationFrames;
    // At or past the end, Play replays from the last fresh start (Task 10.1:
    // the spec's restart; until one exists that is frame 0).
    const from = duration > 0 && this.state.positionFrames >= duration
      ? this.state.startFrame
      : this.state.positionFrames;
    // Task 10.1 (§2/§3): a fresh start — from stopped, error, or a replay from
    // the end — records `startFrame` (the spec's lastPlaybackStartPosition).
    // A resume from PAUSED continues at the frozen position and must not
    // move it (§3: Pause never changes lastPlaybackStartPosition).
    if (this.state.status !== "paused") this.set({ startFrame: from });
    await this.startPlayback(from);
  }

  async render(): Promise<void> {
    if (this.disposed) return;
    this.setSource("render");
    await this.play();
  }

  pause(): void {
    if (this.state.status !== "playing" && this.state.status !== "rendering") return;
    const position = this.output.positionFrames();
    this.cancelAttempt();
    this.set({ status: "paused", positionFrames: clampFrame(position, this.state.durationFrames), renderProgress: null });
  }

  /**
   * Task 10.1 (§3). Stop, the pause-resume distinction and the two Stop
   * preferences, in one place:
   *
   *   · while playing/rendering: freeze at the output's own clock (where the
   *     audio actually stopped), record it as `stoppedPosition`, and either
   *     leave the playhead there (the default) or return it to the last fresh
   *     start (`returnToStartOnStop`);
   *   · while paused: the same, freezing at the held position — a pause
   *     followed by Stop is still a stop;
   *   · while stopped: the second Stop. With `secondStopReturnsToStart` it
   *     returns the playhead to the last fresh start; without it it is a
   *     no-op. `startFrame` (lastPlaybackStartPosition) is never rewritten by
   *     any Stop — §3 keeps it as the last START's memory;
   *   · while in error: only clears the error and stands the transport up.
   */
  stop(): void {
    const behaviour = this.stopBehaviour();
    const wasPlaying = this.state.status === "playing" || this.state.status === "rendering";
    const wasPaused = this.state.status === "paused";
    if (wasPlaying || wasPaused) {
      const freeze = wasPlaying
        ? clampFrame(this.output.positionFrames(), this.state.durationFrames)
        : clampFrame(this.state.positionFrames, this.state.durationFrames);
      this.cancelAttempt();
      this.set({
        status: "stopped",
        positionFrames: behaviour.returnToStartOnStop ? this.state.startFrame : freeze,
        stoppedPosition: freeze,
        renderProgress: null,
        error: null,
      });
    } else if (this.state.status === "error") {
      this.cancelAttempt();
      this.set({ status: "stopped", error: null });
    } else if (behaviour.secondStopReturnsToStart) {
      this.set({ positionFrames: this.state.startFrame });
    }
  }

  seek(frames: number): void {
    const target = this.state.durationFrames > 0
      ? clampFrame(frames, this.state.durationFrames)
      : Math.max(0, Math.floor(Number.isFinite(frames) ? frames : 0));
    const wasPlaying = this.state.status === "playing" || this.state.status === "rendering";
    if (!wasPlaying) {
      this.cancelAttempt();
      this.set({ positionFrames: target, renderProgress: null, error: null });
      return;
    }
    // Task 10.1 (§8): a locate while playing continues playback from the new
    // position, and the new position becomes the last fresh start.
    this.set({ startFrame: target });
    this.restartAt(target);
  }

  togglePlay(): void {
    if (this.state.status === "playing" || this.state.status === "rendering") this.pause();
    else void this.play();
  }

  syncPosition(): void {
    if (this.state.status !== "playing" && this.state.status !== "rendering") return;
    if (this.restarting) return;
    // Task 10.1 (§7): at the loop end, wrap to the loop start. A wrap restarts
    // the attempt but is NOT a locate — `startFrame` keeps the user's last
    // fresh start, so looping can never rewrite it. The wrap rides the 50 ms
    // poll (the same clock that already keeps `positionFrames` fresh); the
    // up-to-50 ms overshoot is the honest limit of wrapping a bounded
    // producer from outside — sample-accurate looping belongs to the session
    // producers, not the transport.
    const loop = this.loop();
    if (loop) {
      const end = Math.min(loop.endFrame, this.state.durationFrames > 0 ? this.state.durationFrames : loop.endFrame);
      if (end > loop.startFrame && this.output.positionFrames() >= end) {
        // The guard is here, not in restartAt: a poll-fired wrap must not stack
        // on a restart still landing, but a user seek during that gap is a
        // real locate and must go straight through.
        if (!this.restarting) this.restartAt(loop.startFrame);
        return;
      }
    }
    const position = clampFrame(this.output.positionFrames(), this.state.durationFrames);
    if (position !== this.state.positionFrames) this.set({ positionFrames: position });
  }

  /**
   * Task 10.1: the LIVE playhead position for rendering — the output's own
   * clock while an attempt is running (the Web Audio sample clock, so the
   * line can never drift from what is audible), the held position otherwise.
   * This is the number panels draw at the browser's animation rate; the
   * 50 ms poll keeps the reactive `positionFrames` fresh for readouts.
   */
  positionFramesNow(): number {
    if (this.restarting) return this.state.positionFrames;
    if (this.state.status === "playing" || this.state.status === "rendering") {
      return clampFrame(this.output.positionFrames(), this.state.durationFrames);
    }
    return this.state.positionFrames;
  }

  private cancelAttempt(): void {
    this.generation++;
    this.abort?.abort();
    this.abort = null;
    this.output.stop();
  }

  /**
   * Task 10.1: cancel everything and begin a new attempt at `frame` — the one
   * path a locate-while-playing and a loop wrap share. Callers record
   * `startFrame` themselves (a wrap deliberately does not). Never re-entrancy
   * guarded: the wrap trigger guards itself, so a user locate always wins.
   */
  private restartAt(frame: number): void {
    this.restarting = true;
    this.cancelAttempt();
    this.set({ positionFrames: frame, renderProgress: null, error: null });
    void this.startPlayback(frame);
  }

  private async startPlayback(fromFrame: number): Promise<void> {
    this.cancelAttempt();
    const generation = this.generation;
    const abort = new AbortController();
    this.abort = abort;
    const project = this.getProject();
    const source = this.state.source;
    this.set({ status: source === "render" ? "rendering" : "playing", positionFrames: fromFrame, error: null, renderProgress: source === "render" ? 0 : null });

    let sources: ReadonlyMap<TrackId, RenderSource> | null = null;
    try {
      sources = await this.openSources(project);
      if (generation !== this.generation || abort.signal.aborted) {
        await closeSources(sources);
        return;
      }
      const tail = source === "raw" ? 0 : this.defaultTailSeconds(project);
      const duration = sourceDurationFrames(sources, source, this.output.sampleRate, tail);
      const start = clampFrame(fromFrame, duration);
      this.set({ durationFrames: duration, positionFrames: start });
      await this.output.begin(start);
      if (generation !== this.generation || abort.signal.aborted) return;
      // The new attempt is live: the poll and positionFramesNow may sample the
      // output's clock again (Task 10.1's restart guard).
      this.restarting = false;
      if (source === "render") await this.runRender(project, sources, start, duration, abort.signal, generation);
      else await this.runLive(project, sources, source, start, abort.signal, generation);
    } catch (error) {
      if (generation !== this.generation || abort.signal.aborted || error instanceof RenderCancelledError) return;
      this.output.stop();
      this.restarting = false;
      this.set({ status: "error", error: error instanceof Error ? error.message : String(error), renderProgress: null });
    } finally {
      if (sources) await closeSources(sources);
    }
  }

  private async runLive(
    project: Project,
    sources: ReadonlyMap<TrackId, RenderSource>,
    source: ListeningSource,
    start: number,
    signal: AbortSignal,
    generation: number,
  ): Promise<void> {
    const session: PlaybackSession = source === "raw"
      ? createRawSession(project, sources, start, this.chunkFrames)
      : createPreviewSession(project, sources, start, this.chunkFrames, this.tailSeconds);
    this.set({ durationFrames: session.durationFrames });
    try {
      for (;;) {
        if (signal.aborted || generation !== this.generation) return;
        const chunk = await session.next(signal);
        if (!chunk) break;
        if (signal.aborted || generation !== this.generation) return;
        await this.output.write(chunk);
        await this.clock.yieldBetween();
      }
      if (signal.aborted || generation !== this.generation) return;
      await this.output.drain?.();
      if (signal.aborted || generation !== this.generation) return;
      // Task 10.1: the natural end is a stop at the project's end — the
      // playhead stays there, visible, and `stoppedPosition` records it (§11).
      this.set({ status: "stopped", positionFrames: this.state.durationFrames, stoppedPosition: this.state.durationFrames, renderProgress: null });
    } finally {
      await session.close();
    }
  }

  private async runRender(
    project: Project,
    sources: ReadonlyMap<TrackId, RenderSource>,
    start: number,
    duration: number,
    signal: AbortSignal,
    generation: number,
  ): Promise<void> {
    const sink: RenderSink = {
      write: async (chunk: RenderChunk): Promise<void> => {
        if (signal.aborted || generation !== this.generation) throw new RenderCancelledError();
        const end = chunk.startFrame + chunk.frames;
        if (end <= start) return;
        const offset = Math.max(0, start - chunk.startFrame);
        const playable: PcmChunk = {
          startFrame: chunk.startFrame + offset,
          frames: chunk.frames - offset,
          channels: [
            chunk.channels[0].subarray(offset, chunk.frames),
            chunk.channels[1].subarray(offset, chunk.frames),
          ],
        };
        await this.output.write(playable);
      },
      finish: (result: RenderResult): void => {
        if (generation !== this.generation) return;
        this.set({ durationFrames: result.frames, renderProgress: 1 });
      },
      abort: (): void => {
        // The controller owns transport state; the renderer owns sink cleanup.
      },
    };
    await renderProject(project, sources, sink, {
      sampleRate: this.output.sampleRate,
      chunkFrames: this.renderChunkFrames,
      tailSeconds: this.tailSeconds,
      signal,
      yieldBetween: () => this.clock.yieldBetween(),
      onProgress: (progress) => {
        if (generation === this.generation) this.set({ renderProgress: progress.fraction });
      },
    });
    if (signal.aborted || generation !== this.generation) return;
    await this.output.drain?.();
    if (signal.aborted || generation !== this.generation) return;
    // Task 9.1.3: record that a mix finished *before* clearing the gauge. Clearing
    // `renderProgress` here is correct — it is a live gauge and nothing is rendering
    // any more — but it used to also erase the only evidence that a mix had ever
    // completed, so the Console's "Mixed / Rerun available" could never appear.
    this.set({
      status: "stopped",
      positionFrames: duration,
      renderProgress: null,
      mixRevision: ++this.mixRevisions,
      mixedAt: this.clock.now(),
      stoppedPosition: duration,
    });
  }

  /**
   * Task 9.1.3: the mix no longer describes the project (it was edited, replaced or
   * reopened), so stop claiming it is current. Kept separate from `setSource`, which
   * only chooses what to listen to and must not discard a mix the user still has.
   */
  clearMix(): void {
    if (this.state.mixRevision !== null) this.set({ mixRevision: null, mixedAt: null });
  }

  dispose(): void {
    this.disposed = true;
    this.restarting = false;
    this.cancelAttempt();
    this.cancelPoll();
    this.output.dispose?.();
    this.listeners.clear();
  }
}
