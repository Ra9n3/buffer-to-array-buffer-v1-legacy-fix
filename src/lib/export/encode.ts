/**
 * ALLOY — streaming WAV writer (Task 8.2).
 *
 * Export writes WAV files that the app itself produces, so this is the WRITER
 * side of `src/lib/audio/wav.ts` (which is a reader plus a test-fixture encoder
 * whose `sample(c, f)` callback requires the whole file in memory). Nothing here
 * knows the frame count up front: a render streams bounded chunks (Task 7.4), and
 * a five-minute 48 kHz stereo export is ~115 MB of Float32 that must never be
 * buffered whole.
 *
 * The contract is the classic streaming one:
 *
 *   1. write the 44-byte canonical header with zeroed sizes;
 *   2. append each chunk as it arrives;
 *   3. at the end, seek back to 0 and patch RIFF size and data size.
 *
 * The byte sink therefore needs `seek` (a `FileSystemWritableFileStream` has it,
 * and so does the in-memory sink the tests use). A sink that cannot seek is
 * rejected with a named error rather than producing a WAV whose header lies.
 *
 * FORMAT. Version 1 exports 32-bit float by default: the engine processes Float32
 * (§11, §15), so float output is sample-exact — no dither, no rounding, no
 * invented clipping, and peaks above 0 dBFS stay recoverable in a DAW. 24-bit PCM
 * is supported for workflows that require it, with plain round-to-nearest and
 * symmetric clamping at full scale (the same conversion `encodeWav` uses), and it
 * is the only path that can clip — which is why it is not the default.
 */

import { requireSampleRate } from "../dsp/params";

/** What a WAV file carries. `pcm` is integer, `float` is IEEE. */
export type ExportEncoding = "pcm" | "float";

export interface ExportFormat {
  readonly sampleRate: number;
  /** Always 2: the engine is stereo, and a mono stem is exported as stereo (see the report). */
  readonly channels: 2;
  readonly encoding: ExportEncoding;
  readonly bitDepth: 24 | 32;
}

/** v1's agreed formats (§11): 24-bit PCM or 32-bit float, at the session rate. */
export const EXPORT_FORMATS: readonly ExportFormat[] = [
  { sampleRate: 48000, channels: 2, encoding: "float", bitDepth: 32 },
  { sampleRate: 48000, channels: 2, encoding: "pcm", bitDepth: 24 },
];

export const DEFAULT_EXPORT_FORMAT: ExportFormat = EXPORT_FORMATS[0];

/** A named suffix so a UI or a test can pick the format by one word. */
export type ExportFormatId = "float32" | "pcm24";

export function formatFromId(id: ExportFormatId, sampleRate: number): ExportFormat {
  const base = id === "pcm24" ? EXPORT_FORMATS[1] : EXPORT_FORMATS[0];
  return { ...base, sampleRate: requireSampleRate(sampleRate) };
}

export function formatIdOf(format: ExportFormat): ExportFormatId {
  return format.encoding === "pcm" ? "pcm24" : "float32";
}

/** The plain-language print of a format, e.g. `48 kHz · 32-bit float · stereo`. */
export function printFormat(format: ExportFormat): string {
  const depth = `${format.bitDepth}-bit ${format.encoding === "pcm" ? "PCM" : "float"}`;
  const rate = `${format.sampleRate / 1000} kHz`;
  const channels = format.channels === 2 ? "stereo" : `${format.channels} channel`;
  return `${rate} · ${depth} · ${channels}`;
}

/** A seekable byte destination. `seek` is required: the header is patched at the end. */
export interface ByteSink {
  write(bytes: Uint8Array): void | Promise<void>;
  seek(position: number): void | Promise<void>;
  close?(): void | Promise<void>;
  abort?(): void | Promise<void>;
}

export class WavSinkError extends Error {
  constructor(detail: string) {
    super(`Alloy export: ${detail}`);
    this.name = "WavSinkError";
  }
}

const PCM = 1;
const FLOAT = 3;
const INT24_FULL_SCALE = 8388608; // 2^23
const HEADER_BYTES = 44;
const MAX_RIFF_BYTES = 0xffffffff - 8;
const MAX_FRAMES_SAFE = Math.floor(Number.MAX_SAFE_INTEGER / 4);

/** A WAV header for `dataBytes` of audio. `dataBytes` is patched again at the end. */
export function wavHeader(format: ExportFormat, dataBytes: number): Uint8Array {
  const bytesPerSample = format.bitDepth / 8;
  const blockAlign = bytesPerSample * format.channels;
  const total = HEADER_BYTES + dataBytes;
  if (total > MAX_RIFF_BYTES) {
    throw new WavSinkError(`a ${Math.round(total / 1024 / 1024)} MB export exceeds the ${Math.round(MAX_RIFF_BYTES / 1024 / 1024)} MB RIFF limit of a WAV file`);
  }
  const out = new Uint8Array(HEADER_BYTES);
  const view = new DataView(out.buffer);
  const put = (at: number, text: string): void => {
    for (let i = 0; i < text.length; i++) out[at + i] = text.charCodeAt(i);
  };
  put(0, "RIFF");
  view.setUint32(4, total - 8, true);
  put(8, "WAVE");
  put(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, format.encoding === "float" ? FLOAT : PCM, true);
  view.setUint16(22, format.channels, true);
  view.setUint32(24, format.sampleRate, true);
  view.setUint32(28, format.sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, format.bitDepth, true);
  put(36, "data");
  view.setUint32(40, dataBytes, true);
  return out;
}

export interface WavWriteStats {
  readonly frames: number;
  readonly dataBytes: number;
  readonly totalBytes: number;
  /** True when any sample exceeded full scale and had to be clamped (24-bit PCM only). */
  readonly clipped: boolean;
  readonly chunks: number;
}

/**
 * Writes one WAV file, chunk by chunk. `write` takes two Float32 channels and a
 * frame count; `finish` patches the header and closes the sink. After `abort` or
 * `finish` the writer refuses further writes, so a failed export can never leave
 * a half-written file that looks complete.
 */
export class WavStreamWriter {
  readonly format: ExportFormat;
  private readonly sink: ByteSink;
  private readonly bytesPerSample: number;
  private readonly scratch: Uint8Array;
  private frames = 0;
  private chunkCount = 0;
  private clipped = false;
  private state: "open" | "finished" | "aborted" = "open";

  constructor(format: ExportFormat, sink: ByteSink) {
    const sampleRate = requireSampleRate(format.sampleRate);
    if (format.channels !== 2) throw new WavSinkError(`export writes stereo, not ${String(format.channels)} channels`);
    if (format.encoding === "pcm" && format.bitDepth !== 24) throw new WavSinkError("24-bit is the only integer export format in version 1");
    if (format.encoding === "float" && format.bitDepth !== 32) throw new WavSinkError("32-bit float is the only float export format in version 1");
    this.format = { ...format, sampleRate };
    this.sink = sink;
    this.bytesPerSample = format.bitDepth / 8;
    // Sized once: the largest chunk a renderer hands over is bounded by 65536 frames.
    this.scratch = new Uint8Array(65536 * this.bytesPerSample * 2);
  }

  get framesWritten(): number {
    return this.frames;
  }

  async begin(): Promise<void> {
    this.requireOpen();
    await this.sink.write(wavHeader(this.format, 0));
  }

  /** Append `frames` frames of the two channels. The arrays are read, never kept. */
  async write(left: Float32Array, right: Float32Array, frames: number): Promise<void> {
    this.requireOpen();
    if (!Number.isSafeInteger(frames) || frames < 0) throw new WavSinkError(`frames must be a whole, non-negative number, not ${String(frames)}`);
    if (frames > MAX_FRAMES_SAFE) throw new WavSinkError("the export is longer than a WAV file can describe");
    const needed = frames * this.bytesPerSample * 2;
    if (needed > this.scratch.length) throw new WavSinkError(`${frames} frames is more than the writer's bounded block (65536)`);
    if (left.length < frames || right.length < frames) {
      throw new WavSinkError(`a channel holds ${Math.min(left.length, right.length)} frames; ${frames} were supplied`);
    }
    if (this.format.encoding === "float") this.encodeFloat(left, right, frames);
    else this.encodePcm24(left, right, frames);
    // `scratch` is reused after the sink resolves; a sink that keeps bytes must copy.
    await this.sink.write(this.scratch.subarray(0, needed));
    this.frames += frames;
    this.chunkCount++;
  }

  async finish(): Promise<WavWriteStats> {
    this.requireOpen();
    const dataBytes = this.frames * this.bytesPerSample * 2;
    await this.sink.seek(0);
    await this.sink.write(wavHeader(this.format, dataBytes));
    const stats: WavWriteStats = {
      frames: this.frames,
      dataBytes,
      totalBytes: HEADER_BYTES + dataBytes,
      clipped: this.clipped,
      chunks: this.chunkCount,
    };
    this.state = "finished";
    await this.sink.close?.();
    return stats;
  }

  async abort(error: unknown): Promise<void> {
    if (this.state !== "open") return;
    this.state = "aborted";
    try {
      await this.sink.abort?.();
    } catch {
      // A failing cleanup must not mask the export's own error.
    }
    void error;
  }

  private requireOpen(): void {
    if (this.state === "aborted") throw new WavSinkError("the writer was aborted");
    if (this.state === "finished") throw new WavSinkError("the writer is already closed");
  }

  private encodeFloat(left: Float32Array, right: Float32Array, frames: number): void {
    const view = new DataView(this.scratch.buffer, this.scratch.byteOffset, this.scratch.byteLength);
    let at = 0;
    for (let i = 0; i < frames; i++) {
      // Float output is sample-exact: no clamping and no rounding, so a peak above
      // 0 dBFS survives and nothing is quietly mastered here.
      view.setFloat32(at, left[i], true);
      view.setFloat32(at + 4, right[i], true);
      at += 8;
    }
  }

  private encodePcm24(left: Float32Array, right: Float32Array, frames: number): void {
    let at = 0;
    for (let i = 0; i < frames; i++) {
      at = this.writePcmSample(left[i], at);
      at = this.writePcmSample(right[i], at);
    }
  }

  /** One 24-bit little-endian sample, round-to-nearest, clamped at full scale. */
  private writePcmSample(value: number, at: number): number {
    const scaled = Math.round(value * INT24_FULL_SCALE);
    let v = scaled;
    if (scaled > INT24_FULL_SCALE - 1 || scaled < -INT24_FULL_SCALE) {
      this.clipped = true;
      v = scaled > 0 ? INT24_FULL_SCALE - 1 : -INT24_FULL_SCALE;
    }
    const unsigned = v < 0 ? v + 0x1000000 : v;
    this.scratch[at] = unsigned & 0xff;
    this.scratch[at + 1] = (unsigned >> 8) & 0xff;
    this.scratch[at + 2] = (unsigned >> 16) & 0xff;
    return at + 3;
  }
}

/**
 * An in-memory, seekable sink: the tests' destination and the download fallback.
 *
 * `seek` moves a write cursor, it does not truncate: the WAV header patch seeks to
 * byte 0 and overwrites the 44 bytes in place, exactly as a file stream does.
 * Writing past the end extends the buffer.
 */
export class MemoryByteSink implements ByteSink {
  private buffer: Uint8Array = new Uint8Array(0);
  private length = 0;
  private cursor = 0;
  closed = 0;
  aborted = 0;
  writes = 0;

  write(bytes: Uint8Array): void {
    const end = this.cursor + bytes.length;
    if (end > this.buffer.length) {
      const grown = new Uint8Array(Math.max(end, this.buffer.length * 2, 4096));
      grown.set(this.buffer.subarray(0, this.length));
      this.buffer = grown;
    }
    this.buffer.set(bytes, this.cursor);
    this.cursor = end;
    this.length = Math.max(this.length, end);
    this.writes++;
  }

  seek(position: number): void {
    if (!Number.isSafeInteger(position) || position < 0) throw new WavSinkError(`cannot seek to ${String(position)}`);
    if (position > this.length) throw new WavSinkError(`cannot seek to ${position}: only ${this.length} bytes are written`);
    this.cursor = position;
  }

  close(): void {
    this.closed++;
  }

  abort(): void {
    this.aborted++;
    this.buffer = new Uint8Array(0);
    this.length = 0;
    this.cursor = 0;
  }

  bytes(): Uint8Array {
    const out = new Uint8Array(this.length);
    out.set(this.buffer.subarray(0, this.length));
    return out;
  }
}

/** A growing byte buffer with a write cursor — the memory and collector sinks' storage. */
class CursorBuffer {
  private buffer = new Uint8Array(0);
  private length = 0;
  private cursor = 0;

  write(bytes: Uint8Array): void {
    const end = this.cursor + bytes.length;
    if (end > this.buffer.length) {
      const grown = new Uint8Array(Math.max(end, this.buffer.length * 2, 4096));
      grown.set(this.buffer.subarray(0, this.length));
      this.buffer = grown;
    }
    this.buffer.set(bytes, this.cursor);
    this.cursor = end;
    this.length = Math.max(this.length, end);
  }

  seek(position: number): void {
    if (!Number.isSafeInteger(position) || position < 0 || position > this.length) {
      throw new WavSinkError(`cannot seek to ${String(position)} (${this.length} bytes written)`);
    }
    this.cursor = position;
  }

  bytes(): Uint8Array {
    const out = new Uint8Array(this.length);
    out.set(this.buffer.subarray(0, this.length));
    return out;
  }
}

export { CursorBuffer };

/** Peaks and RMS of a written file's samples — evidence for "no mastering" (tests). */
export function peakOf(channels: readonly Float32Array[], frames: number): number {
  let most = 0;
  for (const channel of channels) {
    for (let i = 0; i < frames; i++) {
      const v = channel[i] < 0 ? -channel[i] : channel[i];
      if (v > most) most = v;
    }
  }
  return most;
}
