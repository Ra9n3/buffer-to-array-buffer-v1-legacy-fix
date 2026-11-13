/**
 * ALLOY — THE CONVERSION STAGE — Task 11.1.
 *
 * The one operation every imported stem goes through, in the task's order:
 *
 *   parse      wav.ts inspects the original bytes (container, depth,
 *              alignment, channels, rate) — the same reader as everywhere;
 *   resample   decode → (rate ≠ project rate) resample to the project rate;
 *   peaks      computePeaks over the CONVERTED bytes — the waveform cache is
 *              keyed to the converted copy, never to the original;
 *   hand back  the internal-format copy (32-bit float WAV at the project
 *              rate) as bytes plus its peaks, alongside the original's facts.
 *
 * The original is never touched: the caller stores original AND converted
 * (non-destructive), the UI says what the source was and that it was
 * converted — high quality, never claimed lossless.
 *
 * Deterministic, pure of the browser (the Worker runs this verbatim; Node
 * tests run it inline). Progress is reported through the decode, the
 * resample and the peaks walk.
 */

import { computePeaks, type PeakData } from "./peaks";
import { resampleChannels, type ResampleOptions } from "./resample";
import { encodeWav, inspectWav, sampleReaderFor, type WavFormat } from "./wav";

export class ConversionError extends Error {
  constructor(
    readonly reason: "unreadable" | "undecodable" | "damaged-float-data",
    message: string,
  ) {
    super(`Alloy conversion: ${message}`);
    this.name = "ConversionError";
  }
}

export interface ConversionProgress {
  /** 0..1 over the whole stage. */
  readonly fraction: number;
}

export interface ConvertOptions extends ResampleOptions {
  /** Whole-stage progress (decode, resample, peaks). */
  readonly onStageProgress?: (fraction: number) => void;
  /** Awaited between the peaks walk's slices so a main-thread caller can paint. */
  readonly yieldBetween?: () => Promise<void>;
}

/** What one imported file becomes: its original facts, its project-rate copy, and the copy's peaks. */
export interface ConversionResult {
  /** The original file's facts as the reader resolved them (rate, depth, container, alignment, channels). */
  readonly source: WavFormat;
  /** True when the rate stage ran (the source's rate differed from the project's). */
  readonly resampled: boolean;
  /** The internal-format copy: 32-bit float WAV bytes at the project rate. */
  readonly bytes: Uint8Array;
  /** The copy's facts (float, 32, the project rate, the converted frame count). */
  readonly format: WavFormat;
  /** The peaks OF THE CONVERTED COPY — what every lane draws. */
  readonly peaks: PeakData;
  /** Non-finite samples found in the original's float data (zeroed in the copy); > 0 is a corrupt file. */
  readonly nonFinite: number;
}

/** Decodes the original whole (the import already holds the whole file in memory). */
function decodeSource(
  bytes: Uint8Array,
  format: WavFormat,
): { channels: Float32Array[]; nonFinite: number } {
  const reader = sampleReaderFor(format);
  if (!reader)
    throw new ConversionError(
      "undecodable",
      `${format.bitDepth}-bit ${format.encodingName} in a ${format.containerBits}-bit container has no decoder`,
    );
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const { dataOffset, blockAlign, containerBits, frames, channels } = format;
  const bytesPerSample = containerBits / 8;
  const out: Float32Array[] = Array.from(
    { length: channels },
    () => new Float32Array(frames),
  );
  let nonFinite = 0;
  for (let ch = 0; ch < channels; ch++) {
    const target = out[ch];
    let offset = dataOffset + ch * bytesPerSample;
    for (let i = 0; i < frames; i++, offset += blockAlign) {
      const v = reader(view, offset);
      if (Number.isFinite(v)) target[i] = v;
      else {
        target[i] = 0;
        nonFinite++;
      }
    }
  }
  return { channels: out, nonFinite };
}

/**
 * Converts one imported file to the project rate in the internal format.
 * `bytes` are the ORIGINAL file's whole bytes; the result's `bytes` are the
 * converted copy's. Nothing here resamples twice or dithers — the depth
 * stage exists only at export. The peaks walk yields to the caller's yield
 * (`yieldBetween`) so a main-thread caller stays responsive; a Worker omits it.
 */
export async function convertToProjectRate(
  bytes: Uint8Array,
  projectRate: number,
  options: ConvertOptions = {},
): Promise<ConversionResult> {
  const inspection = inspectWav(bytes);
  if (!inspection.ok) {
    throw new ConversionError("unreadable", inspection.problem.detail);
  }
  const source = inspection.format;
  if (source.encoding === "other")
    throw new ConversionError(
      "undecodable",
      `the file is ${source.encodingName}, which the conversion stage does not decode`,
    );
  const report = (fraction: number): void =>
    options.onStageProgress?.(fraction);
  report(0.02);

  // decode
  const { channels: decoded, nonFinite } = decodeSource(bytes, source);
  report(0.2);

  // resample (or pass through) — one stage, before the peaks, per the task's order
  const resampled = source.sampleRate !== projectRate;
  const channelsAtProjectRate = resampled
    ? resampleChannels(decoded, source.sampleRate, projectRate, {
        onProgress: (f) => report(0.2 + f * 0.55),
        sliceFrames: options.sliceFrames,
      })
    : decoded;
  report(0.75);

  // encode the internal-format copy: 32-bit float at the project rate,
  // written by the one WAV writer (wav.ts encodeWav, `decoded` mode)
  const frames =
    channelsAtProjectRate.length === 0 ? 0 : channelsAtProjectRate[0].length;
  const convertedBytes = encodeWav({
    sampleRate: projectRate,
    channels: source.channels,
    encoding: "float",
    bitDepth: 32,
    frames,
    decoded: channelsAtProjectRate,
    sample: () => 0, // never called with `decoded` present; the field keeps the writer's entry honest
  });

  // the copy's facts, as the reader would report them — one truth, no re-guessing
  const convertedFormat: WavFormat = {
    encoding: "float",
    encodingName: "IEEE float",
    channels: source.channels,
    sampleRate: projectRate,
    containerBits: 32,
    bitDepth: 32,
    alignment: null,
    alignmentBasis: null,
    channelMask: 0,
    blockAlign: 4 * source.channels,
    frames,
    seconds: frames / projectRate,
    dataOffset: 44,
    dataBytes: 4 * source.channels * frames,
  };

  // peaks from the CONVERTED copy — the cache is keyed to what playback draws
  const peaks = await computePeaks(convertedBytes, convertedFormat, {
    onProgress: (f) => report(0.75 + f * 0.25),
    yieldBetween: options.yieldBetween,
    sliceFrames: options.sliceFrames,
  });

  return {
    source,
    resampled,
    bytes: convertedBytes,
    format: convertedFormat,
    peaks,
    nonFinite,
  };
}
