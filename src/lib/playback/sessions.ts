/**
 * ALLOY — bounded live playback producers (Task 8.1).
 *
 * RAW: synchronized imported stems, unity-summed, no mix processing. Mute/solo is
 * the shared Task 7.1 audibility rule, re-read every block so a strip switch is
 * heard without restarting. Mono sources arrive stereo from the 7.4 adapter.
 *
 * PREVIEW: the existing MixEngine, one instance for the continuous attempt, fed
 * bounded blocks. DSP state carries across blocks; the controller resets/rebuilds
 * on pause/seek/stop/restart. The master limiter's lookahead is compensated the
 * same way Task 7.4 documents: drop the leading latency, flush it at the end.
 *
 * Neither producer accumulates the project. Buffers are sized from `chunkFrames`
 * and the track count, never from duration.
 */

import { computeAudibility } from "../engine/audibility";
import { MixEngine, type StereoBlock, type TrackInputs } from "../engine/mix-engine";
import type { RenderSource } from "../engine/render";
import type { Project, TrackId } from "../project/model";
import type { PcmChunk } from "./types";

export interface PlaybackSession {
  readonly durationFrames: number;
  next(signal?: AbortSignal): Promise<PcmChunk | null>;
  close(): Promise<void>;
}

function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error("Alloy playback cancelled");
}

function zeroPair(frames: number): [Float32Array, Float32Array] {
  return [new Float32Array(frames), new Float32Array(frames)];
}

function inputFramesOf(sources: ReadonlyMap<TrackId, RenderSource>): number {
  let frames = 0;
  for (const source of sources.values()) frames = Math.max(frames, source.frames);
  return frames;
}

export function createRawSession(
  project: Project,
  sources: ReadonlyMap<TrackId, RenderSource>,
  startFrame: number,
  chunkFrames: number,
): PlaybackSession {
  const inputFrames = inputFramesOf(sources);
  const start = Math.max(0, Math.min(Math.floor(startFrame), inputFrames));
  const buffers = new Map<TrackId, StereoBlock>();
  for (const id of sources.keys()) buffers.set(id, zeroPair(chunkFrames));
  const output = zeroPair(chunkFrames);
  let at = start;
  return {
    durationFrames: inputFrames,
    async next(signal) {
      checkAbort(signal);
      if (at >= inputFrames) return null;
      const count = Math.min(chunkFrames, inputFrames - at);
      for (let c = 0; c < 2; c++) output[c].fill(0, 0, count);
      const audibility = computeAudibility(project);
      for (const [id, source] of sources) {
        checkAbort(signal);
        if (at >= source.frames || !audibility.outputPasses(id)) continue;
        const take = Math.min(count, source.frames - at);
        const target = buffers.get(id) as StereoBlock;
        const written = await source.read(at, target, take);
        checkAbort(signal);
        if (written !== take) throw new Error(`Alloy playback: source ${id} returned ${written} frames at ${at}; ${take} were required`);
        for (let c = 0; c < 2; c++) {
          const from = target[c];
          const to = output[c];
          for (let i = 0; i < take; i++) to[i] += from[i];
        }
      }
      const chunk: PcmChunk = { startFrame: at, frames: count, channels: output };
      at += count;
      return chunk;
    },
    async close() {
      for (const buffer of buffers.values()) for (let c = 0; c < 2; c++) buffer[c].fill(0);
      for (let c = 0; c < 2; c++) output[c].fill(0);
    },
  };
}

export function createPreviewSession(
  project: Project,
  sources: ReadonlyMap<TrackId, RenderSource>,
  startFrame: number,
  chunkFrames: number,
  tailSeconds?: number,
): PlaybackSession {
  const sampleRate = 48000;
  const engine = new MixEngine(project, { sampleRate, maxFramesPerBlock: chunkFrames });
  const inputFrames = inputFramesOf(sources);
  const start = Math.max(0, Math.min(Math.floor(startFrame), inputFrames));
  const tailFrames = Math.ceil(Math.max(0, tailSeconds ?? engine.tailSeconds) * sampleRate);
  const engineFrames = inputFrames - start + tailFrames;
  const inputBuffers = new Map<TrackId, StereoBlock>();
  for (const track of project.tracks) inputBuffers.set(track.id, zeroPair(chunkFrames));
  const raw = zeroPair(chunkFrames);
  const staging = zeroPair(chunkFrames);
  let processed = 0;
  let rawFrames = 0;
  let rawAt = 0;
  let latencyToDrop = engine.latencyFrames;
  let flushRemaining = 0;
  let stagingFill = 0;
  let stagingReturned = false;
  let outputFrame = start;
  let done = false;

  const fillInputs = async (absolute: number, frames: number, signal?: AbortSignal): Promise<void> => {
    for (const buffer of inputBuffers.values()) for (let c = 0; c < 2; c++) buffer[c].fill(0, 0, frames);
    for (const [id, source] of sources) {
      checkAbort(signal);
      if (absolute >= source.frames) continue;
      const take = Math.min(frames, source.frames - absolute);
      const target = inputBuffers.get(id);
      if (!target) continue;
      const written = await source.read(absolute, target, take);
      checkAbort(signal);
      if (written !== take) throw new Error(`Alloy playback: source ${id} returned ${written} frames at ${absolute}; ${take} were required`);
    }
  };

  const emit = (): PcmChunk => {
    const chunk: PcmChunk = { startFrame: outputFrame, frames: stagingFill, channels: staging };
    outputFrame += stagingFill;
    stagingReturned = true;
    return chunk;
  };

  return {
    durationFrames: inputFrames + tailFrames,
    async next(signal) {
      checkAbort(signal);
      if (done) return null;
      if (stagingReturned) {
        for (let c = 0; c < 2; c++) staging[c].fill(0);
        stagingFill = 0;
        stagingReturned = false;
      }
      for (;;) {
        checkAbort(signal);
        if (rawAt < rawFrames) {
          let from = rawAt;
          if (latencyToDrop > 0) {
            const skip = Math.min(latencyToDrop, rawFrames - from);
            latencyToDrop -= skip;
            from += skip;
          }
          const take = Math.min(chunkFrames - stagingFill, rawFrames - from);
          if (take > 0) {
            for (let c = 0; c < 2; c++) {
              const to = staging[c];
              const src = raw[c];
              for (let i = 0; i < take; i++) to[stagingFill + i] = src[from + i];
            }
            stagingFill += take;
            from += take;
          }
          rawAt = from;
          if (stagingFill === chunkFrames) return emit();
          continue;
        }
        if (processed < engineFrames) {
          const count = Math.min(chunkFrames, engineFrames - processed);
          await fillInputs(start + processed, count, signal);
          checkAbort(signal);
          engine.refreshAudibility();
          engine.process(inputBuffers as TrackInputs, raw, count);
          processed += count;
          rawFrames = count;
          rawAt = 0;
          if (processed >= engineFrames) flushRemaining = engine.latencyFrames;
          continue;
        }
        if (flushRemaining > 0) {
          const count = Math.min(chunkFrames, flushRemaining);
          engine.flush(raw, count);
          flushRemaining -= count;
          rawFrames = count;
          rawAt = 0;
          continue;
        }
        if (stagingFill > 0) return emit();
        done = true;
        return null;
      }
    },
    async close() {
      engine.reset();
      for (const buffer of inputBuffers.values()) for (let c = 0; c < 2; c++) buffer[c].fill(0);
      for (let c = 0; c < 2; c++) {
        raw[c].fill(0);
        staging[c].fill(0);
      }
    },
  };
}
