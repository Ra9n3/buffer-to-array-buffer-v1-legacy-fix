/**
 * ALLOY analysis — running the engine over a stored copy (Task 5.2).
 *
 * Reads the header from the file's head, then decodes and pushes the stem
 * slice by slice — the slice length comes from the hardware profile (plan
 * §11: chunked processing, bounded RAM) and is rounded to whole 100 ms cells
 * — yielding between slices so the page stays responsive, reporting
 * progress and stopping when asked. The figures do not depend on the slice
 * length (the engine carries its state); the tests hold the engine to that.
 */
import { Analyser, cellFramesFor, type AnalysisResult } from "./analyser";
import { byteSourceOf, readStoredFormat, SliceDecoder, type ByteSource } from "./decode";

export interface AnalyseOptions {
  /** Frames per slice; rounded down to whole cells, at least one cell. */
  readonly sliceFrames?: number;
  /** Awaited between slices (the browser yields to the page). */
  readonly yieldBetween?: () => Promise<void>;
  /** Progress as a fraction of frames read, after each slice. */
  readonly onProgress?: (fraction: number) => void;
  /** Checked between slices: when `aborted` turns true the run stops with `AnalysisAborted`. */
  readonly signal?: { readonly aborted: boolean };
}

export class AnalysisAborted extends Error {
  constructor() {
    super("Analysis stopped");
    this.name = "AnalysisAborted";
  }
}

export const DEFAULT_SLICE_SECONDS = 5;

export async function analyseSource(source: ByteSource, options: AnalyseOptions = {}): Promise<AnalysisResult> {
  const format = await readStoredFormat(source);
  const cellFrames = cellFramesFor(format.sampleRate);
  const requested = options.sliceFrames ?? Math.round(DEFAULT_SLICE_SECONDS * format.sampleRate);
  const sliceFrames = Math.max(cellFrames, Math.floor(requested / cellFrames) * cellFrames);
  const decoder = new SliceDecoder(source, format);
  const analyser = new Analyser(format);
  let at = 0;
  while (at < format.frames) {
    if (options.signal?.aborted) throw new AnalysisAborted();
    const slice = await decoder.read(at, Math.min(sliceFrames, format.frames - at));
    analyser.push(slice.channels, slice.count, slice.nonFinite);
    at += slice.count;
    options.onProgress?.(at / format.frames);
    if (at < format.frames && options.yieldBetween) await options.yieldBetween();
  }
  if (options.signal?.aborted) throw new AnalysisAborted();
  return analyser.finish();
}

/** Convenience over bytes already in hand (tests, the benchmark). */
export function analyseBytes(bytes: Blob | Uint8Array, options: AnalyseOptions = {}): Promise<AnalysisResult> {
  return analyseSource(byteSourceOf(bytes), options);
}
