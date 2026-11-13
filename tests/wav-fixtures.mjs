// Task 5.1 — the test files: real WAV bytes written by `encodeWav` from sample functions, plus a few
// deliberately wrong ones. Shared by wav / peaks / import / lifecycle tests. Nothing here is decoded by
// anything but the code under test.
import { encodeWav } from "../src/lib/audio/wav.ts";

export const RATE = 48000;

/** A 220 Hz sine at `amp`, stereo if `channels` is 2 (the right side a quarter down, so the sides differ). */
export function sine(seconds, { channels = 2, amp = 0.5, encoding = "pcm", bitDepth = 24, sampleRate = RATE, extensible = false, extraChunks } = {}) {
  const frames = Math.round(seconds * sampleRate);
  return encodeWav({
    sampleRate,
    channels,
    encoding,
    bitDepth,
    frames,
    extensible,
    extraChunks,
    sample: (channel, frame) => amp * (channel === 1 ? 0.75 : 1) * Math.sin((2 * Math.PI * 220 * frame) / sampleRate),
  });
}

/**
 * Task 11.1 — the same sine as 24 VALID bits in a 32-bit int container,
 * WAVE_FORMAT_EXTENSIBLE, either alignment. Left: value << 8, low pad zero
 * (the spec's form). Right: the value in the low 24 bits, high byte zero.
 */
export function sine24In32(seconds, { channels = 2, amp = 0.5, sampleRate = RATE, alignment = "left" } = {}) {
  const frames = Math.round(seconds * sampleRate);
  return encodeWav({
    sampleRate,
    channels,
    encoding: "pcm",
    bitDepth: 24,
    containerBits: 32,
    alignment,
    frames,
    extensible: true,
    sample: (channel, frame) => amp * (channel === 1 ? 0.75 : 1) * Math.sin((2 * Math.PI * 220 * frame) / sampleRate),
  });
}

/** Digital silence (all zeros). */
export function silence(seconds, { channels = 2, encoding = "pcm", bitDepth = 24 } = {}) {
  return encodeWav({ sampleRate: RATE, channels, encoding, bitDepth, frames: Math.round(seconds * RATE), sample: () => 0 });
}

/** A click (one full-scale frame at `at` seconds) in silence — a stem with one transient. */
export function click(seconds, at, { channels = 2, encoding = "pcm", bitDepth = 24 } = {}) {
  const hit = Math.round(at * RATE);
  return encodeWav({ sampleRate: RATE, channels, encoding, bitDepth, frames: Math.round(seconds * RATE), sample: (_c, frame) => (frame === hit ? -1 : 0) });
}

/** Float data with a NaN in it — a damaged float export. */
export function nanFloat(seconds) {
  const frames = Math.round(seconds * RATE);
  const bad = Math.floor(frames / 2);
  return encodeWav({ sampleRate: RATE, channels: 1, encoding: "float", bitDepth: 32, frames, sample: (_c, frame) => (frame === bad ? Number.NaN : 0.25 * Math.sin(frame / 20)) });
}

/** A WAV cut short: the header promises more data than the file has. */
export function truncated(bytes, keepFraction = 0.6) {
  return bytes.slice(0, Math.floor(bytes.length * keepFraction));
}

/** Bytes that are not a WAV at all. */
export const NOT_AUDIO = new TextEncoder().encode("Hello, this is a text file pretending to be a stem.\n".repeat(20));

/** An MP3-looking file (ID3 header). */
export const MP3ISH = (() => {
  const b = new Uint8Array(4096);
  b.set([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x02, 0x00], 0);
  return b;
})();

/** A FLAC-looking file. */
export const FLACISH = (() => {
  const b = new Uint8Array(1024);
  b.set([0x66, 0x4c, 0x61, 0x43, 0x00, 0x00, 0x00, 0x22], 0);
  return b;
})();

/** An AIFF-looking file (FORM....AIFF). */
export const AIFFISH = (() => {
  const b = new Uint8Array(1024);
  b.set([0x46, 0x4f, 0x52, 0x4d, 0x00, 0x00, 0x03, 0xf4, 0x41, 0x49, 0x46, 0x46], 0);
  return b;
})();

/** A RIFF/WAVE whose fmt chunk says ADPCM (tag 0x0002): a compressed WAV. */
export function adpcmWav() {
  const good = sine(0.1, { channels: 1, bitDepth: 16 });
  const out = new Uint8Array(good);
  const view = new DataView(out.buffer);
  // the fmt chunk follows "RIFF....WAVE": id at 12, size at 16, tag at 20
  view.setUint16(20, 0x0002, true);
  return out;
}

/** A RIFF/WAVE with no data chunk at all. */
export function noDataWav() {
  const good = sine(0.05, { channels: 1, bitDepth: 16 });
  const out = new Uint8Array(good);
  // rename "data" to "junk" so the walk finds no data chunk
  const text = new TextDecoder("latin1").decode(out);
  const at = text.indexOf("data");
  out.set([0x6a, 0x75, 0x6e, 0x6b], at);
  return out;
}

/** The wrapper the pipeline takes. */
export function source(name, bytes) {
  return { name, size: bytes.byteLength, bytes: async () => bytes };
}
