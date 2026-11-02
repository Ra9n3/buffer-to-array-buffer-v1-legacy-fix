/**
 * ALLOY — WAVEFORM PEAKS — Task 5.1.
 *
 * The overview of a stem for the Arrange lanes (plan §3: "waveforms derived
 * from the source audio"), calculated from the file's samples and kept
 * BOUNDED: per channel, the minimum and the maximum sample of every bucket
 * of `framesPerBucket` frames (50 buckets a second at 48 kHz, i.e. 960
 * frames each), each quantised to a signed byte. A five-minute stereo stem
 * is 15 000 buckets × 2 channels × 2 bytes = 60 kB; the decoded PCM it
 * stands for would be 115 MB. The lane draws from these (lib/arrange-audio.ts
 * downsamples them to its own point grid); nothing else is kept.
 *
 * The calculation walks the data chunk through a DataView with the reader
 * wav.ts gives for the file's layout — no decoded copy is ever allocated.
 * Long files are processed in slices with a yield between them so the page
 * stays responsive on the main thread; a caller without a yield (tests)
 * gets the whole file in one pass. Along the way the file's sample peak per
 * channel is found (for the silence rule and the metadata) and non-finite
 * float samples are counted (a float file with NaN or ±Infinity in it is
 * corrupt, not quiet).
 *
 * Pure: no DOM, no Web Audio, no storage.
 */

import { sampleReaderFor, type WavFormat } from "./wav";

export const PEAKS_SCHEMA = "alloy.peaks/1";
/** Buckets per second of audio (at 48 kHz: 960 frames a bucket). */
export const PEAKS_PER_SECOND = 50;
/** The quantisation: a sample of ±1 is ±127. */
export const PEAK_SCALE = 127;

export interface PeakData {
  readonly schema: typeof PEAKS_SCHEMA;
  readonly sampleRate: number;
  readonly frames: number;
  readonly channels: number;
  readonly perSecond: number;
  readonly framesPerBucket: number;
  readonly bucketCount: number;
  /** One Int8Array per channel, `2 × bucketCount` long: [min₀, max₀, min₁, max₁, …] in units of 1/127. */
  readonly data: readonly Int8Array[];
  /** The linear sample peak per channel (floats as stored — may exceed 1), and over all channels. */
  readonly channelPeak: readonly number[];
  readonly peak: number;
  /** Float files only: samples that were NaN or ±Infinity (0 for a sound file). */
  readonly nonFinite: number;
}

export interface PeakOptions {
  readonly perSecond?: number;
  /** Frames per slice before `yieldBetween` is awaited (default 480 000 = 10 s at 48 kHz). */
  readonly sliceFrames?: number;
  /** Awaited between slices (the browser: a macrotask); omit to run straight through. */
  readonly yieldBetween?: () => Promise<void>;
  /** Progress, 0..1, after every slice. */
  readonly onProgress?: (fraction: number) => void;
}

function quantise(x: number): number {
  const c = x > 1 ? 1 : x < -1 ? -1 : x;
  return Math.round(c * PEAK_SCALE);
}

/**
 * The peaks of a whole file whose header `inspectWav` accepted. Throws for a
 * layout without a reader (the rules refuse those before this is called).
 */
export async function computePeaks(input: ArrayBuffer | Uint8Array, format: WavFormat, options: PeakOptions = {}): Promise<PeakData> {
  const read = sampleReaderFor(format);
  if (!read) throw new Error(`no sample reader for ${format.encoding} ${format.containerBits}-bit`);
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const perSecond = options.perSecond ?? PEAKS_PER_SECOND;
  const framesPerBucket = Math.max(1, Math.round(format.sampleRate / perSecond));
  const bucketCount = Math.ceil(format.frames / framesPerBucket);
  const channels = format.channels;
  const bytesPerSample = format.containerBits / 8;
  const data = Array.from({ length: channels }, () => new Int8Array(bucketCount * 2));
  const channelPeak = new Array<number>(channels).fill(0);
  let nonFinite = 0;

  // slices are whole buckets, so a bucket is never split across a yield
  const sliceFrames = Math.max(1, Math.ceil((options.sliceFrames ?? 480_000) / framesPerBucket)) * framesPerBucket;
  let frame = 0;
  while (frame < format.frames) {
    const end = Math.min(format.frames, frame + sliceFrames);
    for (let c = 0; c < channels; c++) {
      const out = data[c];
      let peakC = channelPeak[c];
      let f = frame;
      while (f < end) {
        const bucket = Math.floor(f / framesPerBucket);
        const bucketEnd = Math.min(end, (bucket + 1) * framesPerBucket);
        let min = f === bucket * framesPerBucket ? Infinity : out[bucket * 2] / PEAK_SCALE;
        let max = f === bucket * framesPerBucket ? -Infinity : out[bucket * 2 + 1] / PEAK_SCALE;
        let offset = format.dataOffset + f * format.blockAlign + c * bytesPerSample;
        for (; f < bucketEnd; f++, offset += format.blockAlign) {
          const x = read(view, offset);
          if (x !== x || x === Infinity || x === -Infinity) {
            nonFinite++;
            continue;
          }
          if (x < min) min = x;
          if (x > max) max = x;
          const a = x < 0 ? -x : x;
          if (a > peakC) peakC = a;
        }
        out[bucket * 2] = min === Infinity ? 0 : quantise(min);
        out[bucket * 2 + 1] = max === -Infinity ? 0 : quantise(max);
      }
      channelPeak[c] = peakC;
    }
    frame = end;
    options.onProgress?.(format.frames === 0 ? 1 : frame / format.frames);
    if (frame < format.frames && options.yieldBetween) await options.yieldBetween();
  }

  return {
    schema: PEAKS_SCHEMA,
    sampleRate: format.sampleRate,
    frames: format.frames,
    channels,
    perSecond,
    framesPerBucket,
    bucketCount,
    data,
    channelPeak,
    peak: channelPeak.reduce((m, p) => (p > m ? p : m), 0),
    nonFinite,
  };
}

/**
 * The envelope of one channel over `pointCount` points as a closed SVG path
 * in a `0 0 pointCount 100` view box: the upper edge from the buckets' maxima
 * left to right at `centre − max·half`, the lower edge back along the minima
 * — a real, asymmetric overview (the fixture's `wavePath` was symmetric by
 * construction). Each point covers `bucketCount / pointCount` buckets and
 * takes their extremes, so nothing is lost when the lane is coarser than the
 * stored peaks; when it is finer, buckets repeat.
 */
export function peaksPath(channel: Int8Array, bucketCount: number, pointCount: number, centre: number, half: number): string {
  if (bucketCount === 0 || pointCount < 2) return "";
  const upper: string[] = [];
  const lower: string[] = [];
  for (let i = 0; i < pointCount; i++) {
    const from = Math.floor((i * bucketCount) / pointCount);
    const to = Math.max(from + 1, Math.floor(((i + 1) * bucketCount) / pointCount));
    let min = 127;
    let max = -127;
    for (let b = from; b < to && b < bucketCount; b++) {
      const lo = channel[b * 2];
      const hi = channel[b * 2 + 1];
      if (lo < min) min = lo;
      if (hi > max) max = hi;
    }
    if (max < min) {
      min = 0;
      max = 0;
    }
    upper.push(`L${i} ${(centre - (max / PEAK_SCALE) * half).toFixed(1)}`);
    lower.push(`L${i} ${(centre - (min / PEAK_SCALE) * half).toFixed(1)}`);
  }
  lower.reverse();
  return `M0 ${centre} ${upper.join(" ")} L${pointCount - 1} ${centre} ${lower.join(" ")} Z`;
}

/** Validates a stored peak record's shape (what comes back out of storage, before it is drawn). */
export function isPeakData(value: unknown): value is PeakData {
  if (!value || typeof value !== "object") return false;
  const p = value as Partial<PeakData>;
  return (
    p.schema === PEAKS_SCHEMA &&
    typeof p.sampleRate === "number" &&
    typeof p.frames === "number" &&
    typeof p.channels === "number" &&
    typeof p.bucketCount === "number" &&
    typeof p.framesPerBucket === "number" &&
    Array.isArray(p.data) &&
    p.data.length === p.channels &&
    p.data.every((d) => d instanceof Int8Array && d.length === (p.bucketCount as number) * 2) &&
    Array.isArray(p.channelPeak) &&
    typeof p.peak === "number"
  );
}
