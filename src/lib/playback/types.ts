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
  /**
   * The position the last FRESH Play started from — the spec's
   * `lastPlaybackStartPosition` (Task 10.1: click bar 3, press Play, and this
   * is bar 3 until the next fresh start or locate-while-playing). A
   * pause-resume never touches it; a loop wrap never rewrites it. Previous
   * locates here; Return-to-start-on-stop returns the playhead here; a
   * replay from the end restarts here. Task 8.1 used the project start,
   * frame 0, until the first Play moves it.
   */
  readonly startFrame: number;
  /** Longest source, plus the processed tail for preview/render. */
  readonly durationFrames: number;
  /**
   * Task 10.1: the position where playback last STOPPED — recorded by Stop
   * (the freeze point, even when Return-to-start then moves the playhead)
   * and by the natural end. Null until one of those happens. The spec's
   * `stoppedPosition`; reading it says where the last run ended, not where
   * the playhead is now (that is `positionFrames`).
   */
  readonly stoppedPosition: number | null;
  /** 0–1 while a rendered mix is being produced; null otherwise. */
  readonly renderProgress: number | null;
  /**
   * Task 9.1.3: the revision of a mix that finished, or null until one has.
   *
   * `renderProgress` alone cannot carry this: it is a *live* gauge, so every
   * path that ends a run has to clear it (a stop, a seek, a new source). That
   * means the moment a render finishes is exactly the moment its `renderProgress`
   * of 1 is replaced by null — the Console could never observe "complete". This
   * field survives those clears and is dropped only when the project changes
   * underneath the mix, which is what makes it the honest answer to "is the mix
   * I am listening to up to date?".
   */
  readonly mixRevision: number | null;
  /** The wall-clock time (HH:MM) the recorded mix finished; null with no mix. */
  readonly mixedAt: string | null;
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
  /**
   * Stage 0: set the queue depth for the attempt that follows. Raw and preview
   * play with `LIVE_PLAYBACK_QUEUE_SECONDS`; render keeps `PLAYBACK_QUEUE_SECONDS`.
   * Optional so test doubles need not implement it.
   */
  setQueueSeconds?(seconds: number): void;
  /**
   * Stage 0: chunks scheduled after their intended start time had already passed,
   * counted since the last `begin`. Optional so test doubles need not implement it.
   */
  readonly underruns?: number;
}

export interface PlaybackClock {
  /** A repeating macrotask (the shell: setInterval). Returns a cancel function. */
  schedule(fn: () => void, ms: number): () => void;
  /** Awaited between bounded producer blocks so the page can paint. */
  yieldBetween(): Promise<void>;
  /**
   * Task 9.1.3: the wall clock, as HH:MM, for the time a finished mix was made.
   * Injected like the rest of the clock so the controller reads no globals and a
   * test can name the minute rather than race it.
   */
  now(): string;
}

/**
 * Task 10.1: the two Stop preferences (the spec's §3), read live so a change
 * in Settings applies to the very next Stop without rebuilding the shell.
 * Omitted (and in Node tests by default): both off — the §3 default.
 */
export interface StopBehaviour {
  readonly returnToStartOnStop: boolean;
  readonly secondStopReturnsToStart: boolean;
}

/** Task 10.1: the active loop region in frames, or null when no loop is set. */
export interface LoopRegion {
  readonly startFrame: number;
  readonly endFrame: number;
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
  /** Task 10.1: the Stop preferences, read per Stop; both off when omitted. */
  readonly stopBehaviour?: () => StopBehaviour;
  /** Task 10.1: the active loop region, polled while playing; none when omitted. */
  readonly loop?: () => LoopRegion | null;
}

/** The Task 10.1 default Stop behaviour: both preferences off. */
export const STOP_BEHAVIOUR_OFF: Readonly<StopBehaviour> = { returnToStartOnStop: false, secondStopReturnsToStart: false };

export const DEFAULT_PLAYBACK_CHUNK_FRAMES = 2048;
export const DEFAULT_RENDER_PLAYBACK_CHUNK_FRAMES = 4096;
/** About one second of scheduled audio is enough to hide timer jitter without a project-sized queue. */
export const PLAYBACK_QUEUE_SECONDS = 1;
/**
 * Stage 0: the live (raw and preview) producer block and queue depth. A smaller
 * chunk and a shorter queue cut the delay between a mixer move and what is
 * audible; render playback keeps its own, larger defaults above.
 */
export const LIVE_PLAYBACK_CHUNK_FRAMES = 1024;
export const LIVE_PLAYBACK_QUEUE_SECONDS = 0.15;

/**
 * Stage 0: live playback diagnostics, exposed through the debug handle's
 * transport facade (`window.alloy.transport.playbackStats()`).
 */
export interface PlaybackStats {
  /** Chunks scheduled after their intended start time, since the attempt began. */
  readonly underruns: number;
  /** Mean milliseconds spent inside `session.next()` this attempt (0 before any). */
  readonly meanProcessMs: number;
  /** Max milliseconds spent inside one `session.next()` this attempt. */
  readonly maxProcessMs: number;
  /** The attempt's producer block, frames (render attempts use the render chunk). */
  readonly chunkFrames: number;
  /** The queue depth the attempt runs with, seconds. */
  readonly queueSeconds: number;
}

export function initialPlaybackState(sampleRate: number): PlaybackState {
  return {
    status: "stopped",
    source: "raw",
    sampleRate,
    positionFrames: 0,
    startFrame: 0,
    durationFrames: 0,
    stoppedPosition: null,
    renderProgress: null,
    mixRevision: null,
    mixedAt: null,
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
