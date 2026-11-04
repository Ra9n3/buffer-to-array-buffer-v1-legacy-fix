/**
 * ALLOY — shared playback contracts (Task 8.1).
 *
 * The transport is one app-level state, not a room-local fixture. These types are
 * the boundary between the transport controller, the bounded audio producers and
 * the browser output. They are deliberately small and injected so Node tests can
 * drive the same controller with deterministic synthetic audio and a fake clock.
 */

import type { RenderSource } from "../engine/render";
import type { Project, TrackId } from "../project/model";

/** Plan §6 listening modes. The Console prints the source as text (D2.3.2). */
export type ListeningSource = "raw" | "preview" | "render";

export type TransportStatus = "stopped" | "playing" | "paused" | "rendering" | "error";

export interface PlaybackState {
  readonly status: TransportStatus;
  readonly source: ListeningSource;
  readonly sampleRate: number;
  /** Current playhead, in frames at `sampleRate`. */
  readonly positionFrames: number;
  /** Stop returns here. Task 8.1 uses the project start, frame 0. */
  readonly startFrame: number;
  /** Longest source, plus the processed tail for preview/render. */
  readonly durationFrames: number;
  /** 0–1 while a rendered mix is being produced; null otherwise. */
  readonly renderProgress: number | null;
  readonly error: string | null;
}

/** One bounded stereo PCM chunk. The producer may reuse the arrays after `write` resolves. */
export interface PcmChunk {
  readonly startFrame: number;
  readonly frames: number;
  readonly channels: readonly [Float32Array, Float32Array];
}

/**
 * A scheduled audio output. `begin` starts a generation at `startFrame`; `write`
 * applies backpressure so a producer cannot queue a whole project; `stop` must
 * silence and discard every scheduled chunk of the current generation.
 */
export interface PlaybackOutput {
  readonly sampleRate: number;
  begin(startFrame: number): void | Promise<void>;
  write(chunk: PcmChunk): Promise<void>;
  positionFrames(): number;
  /** Resolves when scheduled audio has been heard (or the generation was stopped). */
  drain?(): Promise<void>;
  stop(): void;
  dispose?(): void | Promise<void>;
}

export interface PlaybackClock {
  /** A repeating macrotask (the shell: setInterval). Returns a cancel function. */
  schedule(fn: () => void, ms: number): () => void;
  /** Awaited between bounded producer blocks so the page can paint. */
  yieldBetween(): Promise<void>;
}

export interface PlaybackControllerOptions {
  readonly getProject: () => Project;
  /** Opens the current project's imported stems as seekable render sources. */
  readonly openSources: (project: Project) => Promise<ReadonlyMap<TrackId, RenderSource>>;
  readonly output: PlaybackOutput;
  readonly clock: PlaybackClock;
  /** Raw/preview producer block. Bounded and independent of project duration. */
  readonly chunkFrames?: number;
  /** Rendered-mix orchestration block (Task 7.4 default is 4096). */
  readonly renderChunkFrames?: number;
  /** Processed silence after the longest input for preview/render. */
  readonly tailSeconds?: number;
}

export const DEFAULT_PLAYBACK_CHUNK_FRAMES = 2048;
export const DEFAULT_RENDER_PLAYBACK_CHUNK_FRAMES = 4096;
/** About one second of scheduled audio is enough to hide timer jitter without a project-sized queue. */
export const PLAYBACK_QUEUE_SECONDS = 1;

export function initialPlaybackState(sampleRate: number): PlaybackState {
  return {
    status: "stopped",
    source: "raw",
    sampleRate,
    positionFrames: 0,
    startFrame: 0,
    durationFrames: 0,
    renderProgress: null,
    error: null,
  };
}

export function clampFrame(value: number, durationFrames: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(Math.floor(value), Math.max(0, Math.floor(durationFrames))));
}

export function sourceDurationFrames(
  sources: ReadonlyMap<TrackId, RenderSource>,
  source: ListeningSource,
  sampleRate: number,
  tailSeconds: number,
): number {
  let inputFrames = 0;
  for (const item of sources.values()) inputFrames = Math.max(inputFrames, item.frames);
  if (source === "raw") return inputFrames;
  return inputFrames + Math.ceil(Math.max(0, tailSeconds) * sampleRate);
}

export async function closeSources(sources: ReadonlyMap<TrackId, RenderSource>): Promise<void> {
  const unique = new Set(sources.values());
  for (const source of unique) {
    try {
      await source.close?.();
    } catch {
      // Cleanup is best-effort; the actionable error is the playback failure.
    }
  }
}
