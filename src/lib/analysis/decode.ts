/**
 * ALLOY analysis — reading a stored copy in slices (Task 5.2).
 *
 * The engine never holds a whole stem in memory (plan §11: chunked
 * processing, bounded RAM). A `ByteSource` reads a byte range of the stored
 * copy — `Blob.slice()` in the browser, a subarray over the memory store's
 * `Uint8Array` in tests — the header is read from the file's head with
 * `inspectWav(head, fileBytes)`, and `SliceDecoder` turns a frame range
 * into per-channel Float32Arrays with the Task 5.1 sample readers: the same
 * 24-bit PCM and 32-bit float layouts, no conversion, no resampling.
 */
import { inspectWav, sampleReaderFor, type SampleReader, type WavFormat } from "../audio/wav";

export interface ByteSource {
  readonly size: number;
  read(offset: number, length: number): Promise<Uint8Array>;
}

export function byteSourceOf(bytes: Blob | Uint8Array): ByteSource {
  if (bytes instanceof Uint8Array) {
    return {
      size: bytes.byteLength,
      read: async (offset, length) => bytes.subarray(offset, Math.min(bytes.byteLength, offset + length)),
    };
  }
  return {
    size: bytes.size,
    read: async (offset, length) => new Uint8Array(await bytes.slice(offset, Math.min(bytes.size, offset + length)).arrayBuffer()),
  };
}

export class AnalysisError extends Error {
  constructor(
    readonly reason: "unreadable" | "unsupported",
    message: string,
  ) {
    super(message);
    this.name = "AnalysisError";
  }
}

const HEAD_STEPS = [64 * 1024, 1024 * 1024];

/** The header of a stored copy, read from its head (whole file only if the chunks before `data` are unusually long). */
export async function readStoredFormat(source: ByteSource): Promise<WavFormat> {
  const steps = [...HEAD_STEPS.filter((n) => n < source.size), source.size];
  let last: string = "The stored copy could not be read";
  for (const length of steps) {
    const head = await source.read(0, length);
    let inspection: ReturnType<typeof inspectWav>;
    try {
      inspection = inspectWav(head, source.size);
    } catch {
      continue; // a chunk header cut by the head: read more
    }
    if (inspection.ok) {
      if (inspection.format.encoding === "other") throw new AnalysisError("unsupported", `The stored copy is ${inspection.format.encodingName}, which the engine does not decode`);
      return inspection.format;
    }
    last = inspection.problem.detail;
    if (!/No data chunk/.test(last)) break; // a real problem, not a short head
  }
  throw new AnalysisError("unreadable", last);
}

export interface DecodedSlice {
  /** One Float32Array per channel, valid for `count` frames (the arrays are reused between reads). */
  readonly channels: Float32Array[];
  readonly count: number;
  /** Per channel: NaN / infinite samples found in this slice (zeroed in `channels`). */
  readonly nonFinite: number[];
}

export class SliceDecoder {
  private readonly reader: SampleReader;
  private readonly buffers: Float32Array[] = [];

  constructor(
    private readonly source: ByteSource,
    readonly format: WavFormat,
  ) {
    const reader = sampleReaderFor(format);
    if (!reader) throw new AnalysisError("unsupported", `${format.containerBits}-bit ${format.encodingName} samples are not decodable here`);
    this.reader = reader;
  }

  async read(frameStart: number, frameCount: number): Promise<DecodedSlice> {
    const { format } = this;
    const count = Math.max(0, Math.min(frameCount, format.frames - frameStart));
    const bytes = await this.source.read(format.dataOffset + frameStart * format.blockAlign, count * format.blockAlign);
    if (bytes.byteLength < count * format.blockAlign) throw new AnalysisError("unreadable", "The stored copy is shorter than its header says");
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const bytesPerSample = format.containerBits / 8;
    const nonFinite: number[] = [];
    for (let ch = 0; ch < format.channels; ch++) {
      if (!this.buffers[ch] || this.buffers[ch].length < frameCount) this.buffers[ch] = new Float32Array(frameCount);
      const out = this.buffers[ch];
      let bad = 0;
      let offset = ch * bytesPerSample;
      for (let i = 0; i < count; i++, offset += format.blockAlign) {
        const v = this.reader(view, offset);
        if (Number.isFinite(v)) out[i] = v;
        else {
          out[i] = 0;
          bad++;
        }
      }
      nonFinite.push(bad);
    }
    return { channels: this.buffers.slice(0, format.channels), count, nonFinite };
  }
}
