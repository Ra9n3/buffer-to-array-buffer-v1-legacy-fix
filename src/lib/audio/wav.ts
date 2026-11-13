/**
 * ALLOY — WAV READER — Task 5.1 (real audio import and validation).
 *
 * Reads the header of a RIFF/WAVE file and describes what it holds, or says
 * why it cannot: the import rules (plan §11, locked; owner D5.1.3) need the
 * container, the encoding, the bit depth, the sample rate, the channel count
 * and the length BEFORE anything is decoded, and the Web Audio decoder does
 * not expose those (it resamples and never reports a bit depth). So the file
 * is read by hand — a few hundred bytes of header, nothing else — and the
 * same reader feeds the peak calculation (peaks.ts), which walks the data
 * chunk sample by sample without ever holding decoded PCM.
 *
 * What is read: 'RIFF' … 'WAVE', then the chunk list (word-aligned);
 * `fmt ` (PCM, IEEE float, or WAVE_FORMAT_EXTENSIBLE with either sub-format)
 * and `data`. Anything else (LIST, bext, cue, iXML …) is skipped untouched.
 *
 * What is NOT done here: no judgement. `inspectWav` reports a readable file
 * as it is; the plan's rules (44.1 or 48 kHz, 24-bit PCM — packed or
 * 24-in-32, either alignment — or 32-bit, int or float; mono or stereo) are
 * applied by `judgeFormat` in import-rules.ts, so that a file refused for
 * its format is described exactly, and a file that is not whole is called
 * corrupt, not unsupported. The header's alignment for 24-in-32 is resolved
 * here (declared rule + the one deterministic override) and carried in the
 * format facts — never re-guessed downstream.
 *
 * Pure: no DOM, no Web Audio, no storage. Node-testable byte for byte.
 */

/* =========================================================================
   WHAT A FILE HOLDS
   ========================================================================= */

export type WavEncoding = "pcm" | "float";

export interface WavFormat {
  /** `other`: a readable header whose samples are compressed or companded (ADPCM, µ-law, MP3-in-WAV …) — described, never decoded. */
  readonly encoding: WavEncoding | "other";
  /** The encoding's name for a message: "PCM", "IEEE float", "ADPCM", "µ-law" … */
  readonly encodingName: string;
  /** Channels in the file (the rules accept 1 or 2). */
  readonly channels: number;
  readonly sampleRate: number;
  /** The container size of one sample in bits (24 or 32 for the accepted files; 32 for a 24-in-32 file). */
  readonly containerBits: number;
  /** The meaningful bits (WAVE_FORMAT_EXTENSIBLE `wValidBitsPerSample`; equals `containerBits` otherwise). */
  readonly bitDepth: number;
  /**
   * 24 valid bits in a 32-bit int container (Task 11.1): which end of the
   * word the valid bits sit at. `null` for every other layout. Resolved by
   * the declared rule (the WAVE_FORMAT_EXTENSIBLE convention: LEFT-aligned,
   * low padding zero) with one deterministic, whole-file override — see
   * `resolve24In32Alignment`. Recorded in the import metadata as it stands.
   */
  readonly alignment: "left" | "right" | null;
  /** How the alignment was resolved: the declared rule, or the zero-high-bytes detection; null when the file is not 24-in-32. */
  readonly alignmentBasis: "declared" | "detected" | null;
  /** WAVE_FORMAT_EXTENSIBLE `dwChannelMask` (0: not declared / plain fmt). Read, never interpreted. */
  readonly channelMask: number;
  readonly blockAlign: number;
  /** Whole frames in the data chunk. */
  readonly frames: number;
  /** Seconds — `frames / sampleRate`. */
  readonly seconds: number;
  /** Byte offset of the first sample inside the file and the byte length of the whole frames. */
  readonly dataOffset: number;
  readonly dataBytes: number;
}

export type WavProblem =
  /** Not a RIFF/WAVE file at all (another format, or no audio file). `format` names what it looks like when the magic is known. */
  | { readonly kind: "not-wav"; readonly looksLike: string | null; readonly detail: string }
  /** A WAVE file whose structure is not whole or not consistent. */
  | { readonly kind: "corrupt"; readonly detail: string };

export type WavInspection = { readonly ok: true; readonly format: WavFormat } | { readonly ok: false; readonly problem: WavProblem };

/* =========================================================================
   MAGIC NUMBERS — to name what a non-WAV file is
   ========================================================================= */

const ASCII = (bytes: Uint8Array, at: number, n: number): string => {
  let s = "";
  for (let i = 0; i < n && at + i < bytes.length; i++) s += String.fromCharCode(bytes[at + i]);
  return s;
};

/** The formats a user is likely to drop on a stem importer, named so the message can say "this is an MP3". */
export function looksLike(bytes: Uint8Array): string | null {
  if (bytes.length < 4) return null;
  const head4 = ASCII(bytes, 0, 4);
  if (head4 === "RF64") return "RF64 (64-bit WAV)";
  if (head4 === "FORM") {
    const type = ASCII(bytes, 8, 4);
    return type === "AIFF" || type === "AIFC" ? "AIFF" : "IFF";
  }
  if (head4 === "fLaC") return "FLAC";
  if (head4 === "OggS") return "Ogg (Vorbis / Opus)";
  if (head4 === "caff") return "CAF";
  if (ASCII(bytes, 0, 3) === "ID3") return "MP3";
  if (bytes[0] === 0xff && (bytes[1] & 0xe6) === 0xe2) return "MP3";
  if (ASCII(bytes, 4, 4) === "ftyp") return "MP4 / M4A (AAC)";
  if (head4 === "\u001aE\u00df\u00a3") return "Matroska / WebM";
  return null;
}

/* =========================================================================
   THE READER
   ========================================================================= */

const FORMAT_PCM = 1;
const FORMAT_FLOAT = 3;
const FORMAT_EXTENSIBLE = 0xfffe;

/** Names for the common non-accepted `wFormatTag` values, for the message. */
const FORMAT_NAMES: Readonly<Record<number, string>> = {
  2: "ADPCM",
  6: "A-law",
  7: "µ-law",
  0x11: "IMA ADPCM",
  0x50: "MPEG",
  0x55: "MP3-in-WAV",
  0xa106: "AAC-in-WAV",
};

export interface WavRawFormat {
  /** `wFormatTag`, or the sub-format tag of an extensible header. */
  readonly tag: number;
  readonly tagName: string;
  readonly channels: number;
  readonly sampleRate: number;
  readonly containerBits: number;
  readonly bitDepth: number;
  /** WAVE_FORMAT_EXTENSIBLE `dwChannelMask`, 0 when not declared. */
  readonly channelMask: number;
  readonly blockAlign: number;
}

function formatName(tag: number): string {
  if (tag === FORMAT_PCM) return "PCM";
  if (tag === FORMAT_FLOAT) return "IEEE float";
  return FORMAT_NAMES[tag] ?? `format tag 0x${tag.toString(16)}`;
}

/**
 * Walks the file. Returns the header facts and the data chunk's place, or the
 * problem that stops it. The encoding is left as the raw tag here so that an
 * ADPCM or µ-law file is reported as "unsupported encoding" by the rules
 * rather than as corrupt: the reader's job is description.
 */
export function readWavHeader(input: ArrayBuffer | Uint8Array, totalBytes?: number): { readonly ok: true; readonly raw: WavRawFormat; readonly dataOffset: number; readonly dataBytes: number } | { readonly ok: false; readonly problem: WavProblem } {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Task 5.2: `input` may be the head of a larger file whose real length is `totalBytes` (the analysis
  // engine reads a stored copy in slices); chunk sizes are then judged against the file, not the head
  const fileBytes = totalBytes ?? bytes.length;
  if (bytes.length < 12 || ASCII(bytes, 0, 4) !== "RIFF" || ASCII(bytes, 8, 4) !== "WAVE") {
    const like = looksLike(bytes);
    return {
      ok: false,
      problem: {
        kind: "not-wav",
        looksLike: like,
        detail: like ? `This is ${/^(?:[AEIOU]|M[P4]|RF)/.test(like) ? "an" : "a"} ${like} file, not a WAV file` : bytes.length === 0 ? "The file is empty" : "Not a WAV file (no RIFF/WAVE header)",
      },
    };
  }

  let raw: WavRawFormat | null = null;
  let data: { offset: number; bytes: number } | null = null;
  let at = 12;
  while (at + 8 <= bytes.length) {
    const id = ASCII(bytes, at, 4);
    let size = view.getUint32(at + 4, true);
    const payload = at + 8;
    const remaining = fileBytes - payload;
    if (id === "data") {
      // 0xFFFFFFFF: a streaming writer that never patched the size — the data runs to the end of the file
      if (size === 0xffffffff) size = remaining;
      if (size > remaining) {
        return { ok: false, problem: { kind: "corrupt", detail: `The file ends before its audio data does (${size.toLocaleString("en-US")} bytes announced, ${remaining.toLocaleString("en-US")} present) — the file is truncated` } };
      }
      if (!data) data = { offset: payload, bytes: size };
    } else if (id === "fmt ") {
      if (size < 16 || size > remaining) return { ok: false, problem: { kind: "corrupt", detail: "The format chunk is incomplete" } };
      let tag = view.getUint16(payload, true);
      const channels = view.getUint16(payload + 2, true);
      const sampleRate = view.getUint32(payload + 4, true);
      const blockAlign = view.getUint16(payload + 12, true);
      const containerBits = view.getUint16(payload + 14, true);
      let bitDepth = containerBits;
      let channelMask = 0;
      if (tag === FORMAT_EXTENSIBLE) {
        if (size < 40) return { ok: false, problem: { kind: "corrupt", detail: "The extensible format chunk is incomplete" } };
        // cbSize (2 bytes at +16), then wValidBitsPerSample (+18), dwChannelMask
        // (+20) and the SubFormat GUID (+24), of which the first two bytes carry
        // the real tag. All four are read explicitly — the depth is decided by
        // container + valid bits together, never by wValidBitsPerSample alone.
        const cbSize = view.getUint16(payload + 16, true);
        if (cbSize < 22) return { ok: false, problem: { kind: "corrupt", detail: `The extensible format chunk declares cbSize ${cbSize}; the SubFormat and channel mask need at least 22` } };
        const validBits = view.getUint16(payload + 18, true);
        channelMask = view.getUint32(payload + 20, true);
        if (validBits > 0 && validBits <= containerBits) bitDepth = validBits;
        tag = view.getUint16(payload + 24, true); // the first two bytes of the SubFormat GUID carry the real tag
      }
      if (!raw) raw = { tag, tagName: formatName(tag), channels, sampleRate, containerBits, bitDepth, channelMask, blockAlign };
    } else if (size > remaining) {
      // after a complete data chunk, trailing bytes that do not parse are junk some writers leave; before it, a broken file
      if (data) break;
      return { ok: false, problem: { kind: "corrupt", detail: `The ${id.trim() || "unnamed"} chunk runs past the end of the file` } };
    }
    at = payload + size + (size & 1);
  }

  if (!raw) return { ok: false, problem: { kind: "corrupt", detail: "No format chunk — the file does not say what its samples are" } };
  if (!data) return { ok: false, problem: { kind: "corrupt", detail: "No data chunk — the file holds no audio" } };
  if (raw.channels === 0 || raw.sampleRate === 0) return { ok: false, problem: { kind: "corrupt", detail: "The format chunk declares zero channels or a zero sample rate" } };
  return { ok: true, raw, dataOffset: data.offset, dataBytes: data.bytes };
}

/* =========================================================================
   24 VALID BITS IN A 32-BIT INT CONTAINER — the alignment, resolved
   ========================================================================= */

/**
 * The declared rule (Microsoft, WAVEFORMATEXTENSIBLE / mmreg): “If
 * wValidBitsPerSample is less than Format.wBitsPerSample, the valid bits
 * (the actual PCM data) are left-aligned within the container. The unused
 * bits in the least-significant portion of the container should be set to
 * zero.” A 24-in-32 file is therefore read LEFT-aligned: the word is
 * arithmetic-shifted right by 8 and scaled by 2^23 — the low byte is never
 * trusted, so the container is never read as a plain int32.
 *
 * The override: a minority of writers zero the HIGH byte instead and park
 * the 24 valid bits in the least significant 24 — right-aligned. No header
 * bit distinguishes the two, so one deterministic, whole-file test does:
 * if every word in the file has a zero high byte while some word has a
 * non-zero low byte, the bytes can only be right-aligned (a left-aligned
 * file would have to stay below −18 dBFS everywhere AND carry a noisy pad
 * byte — an edge this rule documents rather than solves). Both readings
 * are recorded so the import metadata can say which end the file sits at.
 */
export function resolve24In32Alignment(
  view: DataView,
  dataOffset: number,
  blockAlign: number,
  channels: number,
  frames: number,
): { readonly alignment: "left" | "right"; readonly basis: "declared" | "detected" } {
  if (frames <= 0 || channels <= 0) return { alignment: "left", basis: "declared" };
  let hiZero = true;
  let loNonZero = false;
  outer: for (let f = 0; f < frames; f++) {
    const base = dataOffset + f * blockAlign;
    for (let c = 0; c < channels; c++) {
      const w = view.getInt32(base + c * 4, true);
      if (w >>> 24 !== 0) {
        hiZero = false;
        break outer;
      }
      if ((w & 0xff) !== 0) loNonZero = true;
    }
  }
  if (hiZero && loNonZero) return { alignment: "right", basis: "detected" };
  return { alignment: "left", basis: "declared" };
}

/** Whether a format is the 24-valid-bits-in-32-int-container layout. */
export function is24In32(format: Pick<WavFormat, "encoding" | "containerBits" | "bitDepth">): boolean {
  return format.encoding === "pcm" && format.containerBits === 32 && format.bitDepth === 24;
}

/** The alignment facts of a format: null for everything that is not 24-in-32. */
function alignmentOf(view: DataView, format: WavFormat): { readonly alignment: "left" | "right" | null; readonly alignmentBasis: "declared" | "detected" | null } {
  if (is24In32(format)) {
    const resolved = resolve24In32Alignment(view, format.dataOffset, format.blockAlign, format.channels, format.frames);
    return { alignment: resolved.alignment, alignmentBasis: resolved.basis };
  }
  return { alignment: null, alignmentBasis: null };
}

/**
 * The full inspection: header + consistency of the data chunk with it. A
 * file whose block alignment contradicts its sample size, or whose data is
 * not whole frames, is corrupt — not something the rules should judge.
 */
export function inspectWav(input: ArrayBuffer | Uint8Array, totalBytes?: number): WavInspection {
  const head = readWavHeader(input, totalBytes);
  if (!head.ok) return head;
  const { raw } = head;
  if (raw.tag !== FORMAT_PCM && raw.tag !== FORMAT_FLOAT) {
    // a compressed or companded WAV: readable header, an encoding the rules refuse — described as it is, nothing decoded
    return {
      ok: true,
      format: {
        encoding: "other",
        encodingName: raw.tagName,
        channels: raw.channels,
        sampleRate: raw.sampleRate,
        containerBits: raw.containerBits,
        bitDepth: raw.bitDepth,
        alignment: null,
        alignmentBasis: null,
        channelMask: raw.channelMask,
        blockAlign: raw.blockAlign,
        frames: 0,
        seconds: 0,
        dataOffset: head.dataOffset,
        dataBytes: head.dataBytes,
      },
    };
  }
  const bytesPerSample = raw.containerBits / 8;
  if (!Number.isInteger(bytesPerSample) || bytesPerSample < 1) return { ok: false, problem: { kind: "corrupt", detail: `A sample size of ${raw.containerBits} bits is not whole bytes` } };
  const expectedAlign = bytesPerSample * raw.channels;
  if (raw.blockAlign !== expectedAlign) return { ok: false, problem: { kind: "corrupt", detail: `The block alignment (${raw.blockAlign}) contradicts ${raw.channels} × ${raw.containerBits}-bit samples (${expectedAlign})` } };
  if (head.dataBytes % expectedAlign !== 0) return { ok: false, problem: { kind: "corrupt", detail: "The audio data is not whole frames — the file was cut mid-sample" } };
  const frames = head.dataBytes / expectedAlign;
  const view = input instanceof Uint8Array ? new DataView(input.buffer, input.byteOffset, input.byteLength) : new DataView(input);
  const format: WavFormat = {
    encoding: raw.tag === FORMAT_FLOAT ? "float" : "pcm",
    encodingName: raw.tagName,
    channels: raw.channels,
    sampleRate: raw.sampleRate,
    containerBits: raw.containerBits,
    bitDepth: raw.bitDepth,
    alignment: null,
    alignmentBasis: null,
    channelMask: raw.channelMask,
    blockAlign: raw.blockAlign,
    frames,
    seconds: frames / raw.sampleRate,
    dataOffset: head.dataOffset,
    dataBytes: head.dataBytes,
  };
  return { ok: true, format: { ...format, ...alignmentOf(view, format) } };
}

/* =========================================================================
   SAMPLE READERS — for peaks.ts; one per accepted layout
   ========================================================================= */

/** A reader of one sample as a float in [−1, 1) (floats as stored, possibly beyond ±1) at a byte offset. */
export type SampleReader = (view: DataView, byteOffset: number) => number;

const INT24_FULL_SCALE = 8388608; // 2^23
const INT32_FULL_SCALE = 2147483648; // 2^31
const INT16_FULL_SCALE = 32768;

/** What a reader needs to know about the layout: the container, the valid bits, and (24-in-32) the alignment. */
export type ReaderFormat = Pick<WavFormat, "encoding" | "containerBits" | "bitDepth" | "alignment">;

export function sampleReaderFor(format: ReaderFormat): SampleReader | null {
  if (format.encoding === "other") return null;
  if (format.encoding === "float") {
    if (format.containerBits === 32) return (v, o) => v.getFloat32(o, true);
    if (format.containerBits === 64) return (v, o) => v.getFloat64(o, true);
    return null;
  }
  switch (format.containerBits) {
    case 24:
      return (v, o) => {
        const u = v.getUint8(o) | (v.getUint8(o + 1) << 8) | (v.getUint8(o + 2) << 16);
        return (u & 0x800000 ? u - 0x1000000 : u) / INT24_FULL_SCALE;
      };
    case 32:
      // 24 valid bits in the 32-bit int container: shifted or masked, never
      // read as a plain int32 — the padding byte (low for left, high for right)
      // is dropped by the shift or proven zero by the detection.
      if (format.bitDepth === 24) {
        if (format.alignment === "right")
          return (v, o) => {
            // the valid bits are the low 24; sign-extend from bit 23 (<< 8, >> 8)
            return ((v.getInt32(o, true) << 8) >> 8) / INT24_FULL_SCALE;
          };
        return (v, o) => (v.getInt32(o, true) >> 8) / INT24_FULL_SCALE;
      }
      return (v, o) => v.getInt32(o, true) / INT32_FULL_SCALE;
    case 16:
      return (v, o) => v.getInt16(o, true) / INT16_FULL_SCALE;
    case 8:
      return (v, o) => (v.getUint8(o) - 128) / 128;
    default:
      return null;
  }
}

/* =========================================================================
   A WRITER — the test fixtures, and the conversion stage's internal-format
  writer (Task 11.1: the project-rate copy a stem is stored with is a 32-bit
  float WAV written here; everything else about it is the reader's business)
   ========================================================================= */

export interface WavSpec {
  readonly sampleRate: number;
  readonly channels: number;
  readonly encoding: WavEncoding;
  readonly bitDepth: 8 | 16 | 24 | 32 | 64;
  /**
   * The container size in bits, when it differs from the depth: a 24-in-32
   * file sets `bitDepth: 24, containerBits: 32` (Task 11.1). Defaults to
   * `bitDepth`. The header's `wBitsPerSample` carries THIS, per the spec.
   */
  readonly containerBits?: number;
  /** 24-in-32 only: which end of the word the valid bits sit at. Default "left" (the WAVE_FORMAT_EXTENSIBLE convention). */
  readonly alignment?: "left" | "right";
  /** Sample at (channel, frame) in [-1, 1] — or pass `decoded` arrays directly (the conversion stage does). */
  readonly sample: (channel: number, frame: number) => number;
  /** Direct per-channel samples, when the whole file is already decoded. With this present, `sample` is never called. */
  readonly decoded?: readonly Float32Array[];
  readonly frames: number;
  /** Write a WAVE_FORMAT_EXTENSIBLE header (as 24-bit exporters commonly do). */
  readonly extensible?: boolean;
  /** Extra chunks placed before `data` (e.g. LIST / bext), raw. */
  readonly extraChunks?: readonly { readonly id: string; readonly bytes: Uint8Array }[];
}

/** Encodes a WAV byte for byte — the test fixtures, and the conversion stage's internal-format writer. */
export function encodeWav(spec: WavSpec): Uint8Array {
  if (spec.decoded) {
    if (spec.decoded.length !== spec.channels) throw new Error(`encodeWav: ${spec.decoded.length} decoded channels for a ${spec.channels}-channel file`);
    for (const c of spec.decoded) if (c.length < spec.frames) throw new Error("encodeWav: a decoded channel is shorter than the file");
  }
  const sampleOf: (channel: number, frame: number) => number = spec.decoded ? (c, f) => (spec.decoded as Float32Array[])[c][f] : spec.sample;
  const containerBits = spec.containerBits ?? spec.bitDepth;
  const is24In32File = spec.encoding === "pcm" && spec.bitDepth === 24 && containerBits === 32;
  if (containerBits % 8 !== 0) throw new Error(`encodeWav: a ${containerBits}-bit container is not whole bytes`);
  if (spec.bitDepth > containerBits) throw new Error(`encodeWav: ${spec.bitDepth} valid bits do not fit a ${containerBits}-bit container`);
  if (spec.alignment && !is24In32File) throw new Error("encodeWav: alignment is a 24-in-32 property");
  const alignment = is24In32File ? (spec.alignment ?? "left") : null;
  const bytesPerSample = containerBits / 8;
  const blockAlign = bytesPerSample * spec.channels;
  const dataBytes = blockAlign * spec.frames;
  const fmtSize = spec.extensible ? 40 : 16;
  const extras = spec.extraChunks ?? [];
  const extrasBytes = extras.reduce((n, c) => n + 8 + c.bytes.length + (c.bytes.length & 1), 0);
  const total = 12 + 8 + fmtSize + extrasBytes + 8 + dataBytes;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  const put = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) out[at + i] = s.charCodeAt(i);
  };
  put(0, "RIFF");
  view.setUint32(4, total - 8, true);
  put(8, "WAVE");
  put(12, "fmt ");
  view.setUint32(16, fmtSize, true);
  const tag = spec.encoding === "float" ? FORMAT_FLOAT : FORMAT_PCM;
  view.setUint16(20, spec.extensible ? FORMAT_EXTENSIBLE : tag, true);
  view.setUint16(22, spec.channels, true);
  view.setUint32(24, spec.sampleRate, true);
  view.setUint32(28, spec.sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, containerBits, true); // wBitsPerSample is the container size, per the spec
  let at = 36;
  if (spec.extensible) {
    view.setUint16(36, 22, true); // cbSize
    view.setUint16(38, spec.bitDepth, true); // wValidBitsPerSample - the depth, not the container
    view.setUint32(40, spec.channels === 2 ? 3 : spec.channels === 1 ? 4 : 0, true); // channel mask
    view.setUint16(44, tag, true); // sub-format tag, then the KSDATAFORMAT_SUBTYPE suffix
    const suffix = [0x00, 0x00, 0x00, 0x00, 0x10, 0x00, 0x80, 0x00, 0x00, 0xaa, 0x00, 0x38, 0x9b, 0x71];
    suffix.forEach((b, i) => (out[46 + i] = b));
    at = 60;
  }
  for (const c of extras) {
    put(at, c.id.padEnd(4).slice(0, 4));
    view.setUint32(at + 4, c.bytes.length, true);
    out.set(c.bytes, at + 8);
    at += 8 + c.bytes.length + (c.bytes.length & 1);
  }
  put(at, "data");
  view.setUint32(at + 4, dataBytes, true);
  at += 8;
  for (let f = 0; f < spec.frames; f++) {
    for (let c = 0; c < spec.channels; c++) {
      const x = sampleOf(c, f);
      if (is24In32File) {
        // 24 valid bits, quantised, then placed at the declared end of the word.
        // Left: value << 8, low pad byte zero. Right: the value's 24-bit
        // two's complement in the low bits, high byte zero.
        const v = Math.max(-INT24_FULL_SCALE, Math.min(INT24_FULL_SCALE - 1, Math.round(x * INT24_FULL_SCALE)));
        const word = alignment === "right" ? v & 0xffffff : (v << 8) | 0;
        view.setInt32(at, word, true);
      } else {
        switch (spec.bitDepth) {
          case 8:
            view.setUint8(at, Math.max(0, Math.min(255, Math.round(x * 128 + 128))));
            break;
          case 16:
            view.setInt16(at, Math.max(-32768, Math.min(32767, Math.round(x * INT16_FULL_SCALE))), true);
            break;
          case 24: {
            const v = Math.max(-INT24_FULL_SCALE, Math.min(INT24_FULL_SCALE - 1, Math.round(x * INT24_FULL_SCALE)));
            const u = v < 0 ? v + 0x1000000 : v;
            out[at] = u & 0xff;
            out[at + 1] = (u >> 8) & 0xff;
            out[at + 2] = (u >> 16) & 0xff;
            break;
          }
          case 32:
            if (spec.encoding === "float") view.setFloat32(at, x, true);
            else view.setInt32(at, Math.max(-INT32_FULL_SCALE, Math.min(INT32_FULL_SCALE - 1, Math.round(x * INT32_FULL_SCALE))), true);
            break;
          case 64:
            view.setFloat64(at, x, true);
            break;
        }
      }
      at += bytesPerSample;
    }
  }
  return out;
}
