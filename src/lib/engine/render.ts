/**
 * ALLOY — bounded-chunk rendering (Task 7.4).
 *
 * This is orchestration, not a second DSP engine. One `MixEngine` is built for
 * the whole attempt and is fed fixed-capacity blocks, so every filter, envelope,
 * detector, delay line and reverb network keeps its own state across boundaries.
 * Source audio is read by frame range into reused stereo buffers; rendered audio
 * is handed to a sink in bounded chunks. Neither the input stems nor the output
 * mix is accumulated here.
 *
 * Timeline contract:
 *   - inputs start at frame 0 (the current imported-stem arrangement);
 *   - shorter inputs are padded with silence to the longest input;
 *   - `engine.tailSeconds` of silence is then processed through the full graph,
 *     so Return tails and detector releases are rendered, not merely flushed;
 *   - the master limiter's `latencyFrames` leading output frames are dropped and
 *     the same number of frames are flushed at the end (data-model §15.6), so
 *     the delivered timeline is aligned with the input and keeps its full tail.
 *
 * Recovery contract: each call owns a fresh engine and fresh scratch buffers.
 * On success the sink's `finish` commits once. On cancellation or failure the
 * sink's `abort` is called once and `finish` is never called. Sources are closed
 * and the engine is reset on either path. A retry is a new call; no attempt
 * state is shared. Sinks own durable/atomic storage; this module owns no files.
 */

import { requireBuffers } from "../dsp/buffers";
import { DSP_SAMPLE_RATE, requireSampleRate } from "../dsp/params";
import { byteSourceOf, readStoredFormat, SliceDecoder, type ByteSource } from "../analysis/decode";
import { judgeFormat } from "../audio/import-rules";
import type { Project, TrackId } from "../project/model";
import { MixEngine, type MixEngineOptions, type StereoBlock, type TrackInputs } from "./mix-engine";

/** Default block: the engine's 4096-frame block, about 85 ms at 48 kHz. */
export const DEFAULT_RENDER_CHUNK_FRAMES = 4096;
 /** A hard cap on one orchestration block, about 1.37 s at 48 kHz. */
export const MAX_RENDER_CHUNK_FRAMES = 65536;

/**
 * A seekable stereo source. `read` writes exactly `frames` frames into `target`
 * (both channels) and returns that count. The renderer zeroes the target before
 * each read and reuses it after the read resolves. A mono file source duplicates
 * its channel here; the engine itself always receives stereo.
 */
export interface RenderSource {
  readonly sampleRate: number;
  readonly frames: number;
  read(frameStart: number, target: StereoBlock, frames: number): number | Promise<number>;
  close?(): void | Promise<void>;
}

/** One aligned output chunk. Its arrays are reused after `write` resolves. */
export interface RenderChunk {
  readonly startFrame: number;
  readonly frames: number;
  readonly channels: StereoBlock;
}

export interface RenderResult {
  readonly sampleRate: number;
  readonly channels: 2;
  /** Longest input, before the rendered tail. */
  readonly inputFrames: number;
  readonly tailFrames: number;
  /** Delivered, latency-compensated frames: inputFrames + tailFrames. */
  readonly frames: number;
  readonly chunkFrames: number;
  readonly chunks: number;
  readonly latencyFrames: number;
}

export interface RenderProgress {
  readonly framesWritten: number;
  readonly totalFrames: number;
  readonly fraction: number;
  readonly phase: "input" | "tail";
}

/**
 * A streaming destination. `write` may be async (backpressure). `finish` is the
 * commit point and is called only after every chunk and cleanup succeeded;
 * `abort` discards any partial destination. A sink that keeps audio must copy or
 * persist it before `write` resolves.
 */
export interface RenderSink {
  write(chunk: RenderChunk): void | Promise<void>;
  finish?(result: RenderResult): void | Promise<void>;
  abort?(error: unknown): void | Promise<void>;
}

export interface RenderOptions extends Omit<MixEngineOptions, "maxFramesPerBlock"> {
  readonly chunkFrames?: number;
  /** Silence rendered after the longest input. Defaults to the engine's conservative Return tail. */
  readonly tailSeconds?: number;
  readonly signal?: AbortSignal;
  /** Awaited between engine blocks so a browser controller can yield to the page. */
  readonly yieldBetween?: () => Promise<void>;
  readonly onProgress?: (progress: RenderProgress) => void;
}

export class RenderCancelledError extends Error {
  constructor(cause?: unknown) {
    super("Alloy render cancelled", { cause });
    this.name = "RenderCancelledError";
  }
}

export class RenderProjectChangedError extends Error {
  constructor() {
    super("Alloy render project changed during the attempt; output was not committed");
    this.name = "RenderProjectChangedError";
  }
}

/**
 * A conservative, deterministic fingerprint of the project as handed to the
 * renderer. Functions (ChainParam.spec.format) carry no audio state and are
 * omitted; everything else is compared literally. This is metadata-sized, never
 * audio-sized, and is checked at the boundaries where an async render can observe
 * a caller edit.
 */
function projectFingerprint(project: Project): string {
  return JSON.stringify(project, (_key, value: unknown) => (typeof value === "function" ? undefined : value));
}

function zeroPair(frames: number): [Float32Array, Float32Array] {
  return [new Float32Array(frames), new Float32Array(frames)];
}

function checkAbort(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new RenderCancelledError(signal.reason);
}

function validateChunkFrames(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > MAX_RENDER_CHUNK_FRAMES) {
    throw new Error(`Alloy Renderer: chunkFrames must be a whole number from 1 to ${MAX_RENDER_CHUNK_FRAMES}, not ${String(value)}`);
  }
  return value;
}

/**
 * Render the current project to a streaming sink. The project is treated as
 * read-only for the attempt. A controller should still cancel and start a new
 * render when it edits the project, but the renderer also fingerprints the
 * project and checks it before each engine block, after sink writes, and before
 * commit; an observed change aborts the sink and throws RenderProjectChangedError
 * so inconsistent output cannot finish. Masking is not recomputed per chunk: pass
 * the resolved project and `maskingDynamicBands` from Task 7.3 so the approved
 * decisions and sidechain edges stay fixed while the stateful DSP runs.
 */
export async function renderProject(
  project: Project,
  sources: ReadonlyMap<TrackId, RenderSource>,
  sink: RenderSink,
  options: RenderOptions = {},
): Promise<RenderResult> {
  const sampleRate = requireSampleRate(options.sampleRate ?? DSP_SAMPLE_RATE);
  const chunkFrames = validateChunkFrames(options.chunkFrames ?? DEFAULT_RENDER_CHUNK_FRAMES);
  if (options.tailSeconds !== undefined && (!Number.isFinite(options.tailSeconds) || options.tailSeconds < 0)) {
    throw new Error(`Alloy Renderer: tailSeconds must be finite and ≥ 0, not ${String(options.tailSeconds)}`);
  }
  if (typeof sink.write !== "function") throw new Error("Alloy Renderer: the sink must provide write()");

  const trackIds = new Set(project.tracks.map((track) => track.id));
  let inputFrames = 0;
  for (const [id, source] of sources) {
    if (!trackIds.has(id)) throw new Error(`Alloy Renderer: source ${id} is not a track in this project`);
    if (!Number.isSafeInteger(source.frames) || source.frames < 0) {
      throw new Error(`Alloy Renderer: source ${id} must declare a whole, non-negative frame count`);
    }
    if (source.sampleRate !== sampleRate) {
      throw new Error(`Alloy Renderer: source ${id} is ${source.sampleRate} Hz; this render is ${sampleRate} Hz (no resampling)`);
    }
    if (typeof source.read !== "function") throw new Error(`Alloy Renderer: source ${id} must provide read()`);
    inputFrames = Math.max(inputFrames, source.frames);
  }

  const expectedProject = projectFingerprint(project);
  const checkProject = (): void => {
    if (projectFingerprint(project) !== expectedProject) throw new RenderProjectChangedError();
  };

  let engine: MixEngine | null = null;
  let raw: StereoBlock | null = null;
  let output: StereoBlock | null = null;
  const inputBuffers = new Map<TrackId, StereoBlock>();
  let result: RenderResult | null = null;
  let failure: unknown = null;

  try {
    checkAbort(options.signal);
    checkProject();
    engine = new MixEngine(project, {
      sampleRate,
      maxFramesPerBlock: chunkFrames,
      maskingDynamicBands: options.maskingDynamicBands,
    });
    const tailSeconds = options.tailSeconds ?? engine.tailSeconds;
    const tailFrames = Math.ceil(tailSeconds * sampleRate);
    const totalFrames = inputFrames + tailFrames;
    if (!Number.isSafeInteger(totalFrames)) throw new Error("Alloy Renderer: the render length is too large to count safely");

    raw = zeroPair(chunkFrames);
    output = zeroPair(chunkFrames);
    for (const track of project.tracks) inputBuffers.set(track.id, zeroPair(chunkFrames));
    const activeSources = [...sources.entries()];

    let latencyToDrop = engine.latencyFrames;
    let outputFill = 0;
    let framesWritten = 0;
    let chunks = 0;

    const writeOutput = async (frames: number): Promise<void> => {
      checkAbort(options.signal);
      if (frames === 0) return;
      await sink.write({ startFrame: framesWritten, frames, channels: output as StereoBlock });
      framesWritten += frames;
      chunks++;
      checkAbort(options.signal);
      checkProject();
      options.onProgress?.({
        framesWritten,
        totalFrames,
        fraction: totalFrames === 0 ? 1 : framesWritten / totalFrames,
        phase: framesWritten <= inputFrames ? "input" : "tail",
      });
      for (let c = 0; c < 2; c++) (output as StereoBlock)[c].fill(0);
      outputFill = 0;
    };

    // Drop only the limiter's reported leading latency. After that, each raw
    // sample is already the aligned output sample; no whole-render shift buffer.
    const pushRaw = async (frames: number): Promise<void> => {
      let at = 0;
      if (latencyToDrop > 0) {
        const skipped = Math.min(latencyToDrop, frames);
        latencyToDrop -= skipped;
        at = skipped;
      }
      while (at < frames) {
        const take = Math.min(chunkFrames - outputFill, frames - at);
        for (let c = 0; c < 2; c++) {
          const to = (output as StereoBlock)[c];
          const from = (raw as StereoBlock)[c];
          for (let i = 0; i < take; i++) to[outputFill + i] = from[at + i];
        }
        outputFill += take;
        at += take;
        if (outputFill === chunkFrames) await writeOutput(outputFill);
      }
    };

    const fillInputs = async (at: number, frames: number): Promise<void> => {
      for (const buffer of inputBuffers.values()) {
        buffer[0].fill(0, 0, frames);
        buffer[1].fill(0, 0, frames);
      }
      for (const [id, source] of activeSources) {
        if (at >= source.frames) continue;
        checkAbort(options.signal);
        const count = Math.min(frames, source.frames - at);
        const target = inputBuffers.get(id) as StereoBlock;
        const written = await source.read(at, target, count);
        checkAbort(options.signal);
        if (written !== count) {
          throw new Error(`Alloy Renderer: source ${id} returned ${String(written)} frames at ${at}; ${count} were required`);
        }
      }
    };

    const engineFrames = inputFrames + tailFrames;
    for (let at = 0; at < engineFrames; at += chunkFrames) {
      checkAbort(options.signal);
      const count = Math.min(chunkFrames, engineFrames - at);
      await fillInputs(at, count);
      checkAbort(options.signal);
      checkProject();
      engine.process(inputBuffers as TrackInputs, raw, count);
      await pushRaw(count);
      if (at + count < engineFrames) {
        await options.yieldBetween?.();
        checkAbort(options.signal);
      }
    }

    // MixEngine.flush drains the limiter's lookahead. The Return tails were
    // already advanced by the silent blocks above, through the same full graph.
    let remaining = engine.latencyFrames;
    while (remaining > 0) {
      checkAbort(options.signal);
      const count = Math.min(chunkFrames, remaining);
      engine.flush(raw, count);
      await pushRaw(count);
      remaining -= count;
    }
    if (outputFill > 0) await writeOutput(outputFill);
    checkAbort(options.signal);
    if (framesWritten !== totalFrames) {
      throw new Error(`Alloy Renderer: delivered ${framesWritten} frames instead of ${totalFrames}`);
    }

    result = {
      sampleRate,
      channels: 2,
      inputFrames,
      tailFrames,
      frames: totalFrames,
      chunkFrames,
      chunks,
      latencyFrames: engine.latencyFrames,
    };
  } catch (error) {
    failure = error;
  }

  // Cleanup happens before commit. A failed close/reset aborts the destination;
  // a successful render never reports completion while temporary state is live.
  let cleanupFailure: unknown = null;
  try {
    engine?.reset();
  } catch (error) {
    cleanupFailure = error;
  }
  for (const buffer of inputBuffers.values()) {
    buffer[0].fill(0);
    buffer[1].fill(0);
  }
  if (raw) for (let c = 0; c < 2; c++) raw[c].fill(0);
  if (output) for (let c = 0; c < 2; c++) output[c].fill(0);
  const uniqueSources = new Set(sources.values());
  for (const source of uniqueSources) {
    try {
      await source.close?.();
    } catch (error) {
      cleanupFailure ??= error;
    }
  }
  if (failure === null && options.signal?.aborted) failure = new RenderCancelledError(options.signal.reason);

  if (failure === null && cleanupFailure === null && result !== null) {
    try {
      checkProject();
      await sink.finish?.(result);
      return result;
    } catch (error) {
      failure = error;
    }
  }

  const finalError = failure ?? cleanupFailure ?? new Error("Alloy Renderer: render ended without a result");
  try {
    await sink.abort?.(finalError);
  } catch {
    // The original rendering/cancellation error remains the actionable one.
    // The engine and source cleanup above already ran; the sink owns its store.
  }
  throw finalError;
}

/**
 * Adapt an imported WAV byte source using Task 5.2's header reader and slice
 * decoder. Only the approved import formats are admitted (48 kHz, 24-bit PCM or
 * 32-bit float, mono/stereo); mono is duplicated to stereo. Non-finite float
 * samples are a corrupt source, not silently repaired during a render.
 */
export async function openWavRenderSource(bytes: Blob | Uint8Array | ByteSource): Promise<RenderSource> {
  const source: ByteSource = "read" in bytes && typeof bytes.read === "function" ? bytes : byteSourceOf(bytes as Blob | Uint8Array);
  const format = await readStoredFormat(source);
  const verdict = judgeFormat(format);
  if (!verdict.ok) throw new Error(`Alloy Renderer: ${verdict.detail}`);
  let decoder: SliceDecoder | null = new SliceDecoder(source, format);
  return {
    sampleRate: format.sampleRate,
    frames: format.frames,
    async read(frameStart, target, frames) {
      if (decoder === null) throw new Error("Alloy Renderer: the WAV source is closed");
      requireBuffers("Alloy Renderer (WAV source)", 2, target, target, frames);
      const slice = await decoder.read(frameStart, frames);
      if (slice.count !== frames) throw new Error("Alloy Renderer: the WAV source ended before its declared length");
      const bad = slice.nonFinite.reduce((sum, value) => sum + value, 0);
      if (bad > 0) throw new Error(`Alloy Renderer: the WAV source contains ${bad} non-finite sample(s)`);
      for (let c = 0; c < 2; c++) {
        const from = slice.channels[format.channels === 1 ? 0 : c];
        const to = target[c];
        for (let i = 0; i < frames; i++) to[i] = from[i];
      }
      return frames;
    },
    close() {
      decoder = null;
    },
  };
}
