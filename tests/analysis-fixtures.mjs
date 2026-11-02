// Task 5.2 — signal generators for the analysis tests: real WAV bytes from `encodeWav`, every
// fixture deterministic. Nothing here is measured by anything but the engine under test.
import { encodeWav } from "../src/lib/audio/wav.ts";

export const RATE = 48000;

/** A stereo WAV from a per-channel sample function `(channel, frame) => value`. */
export function stereo(seconds, sample, { encoding = "pcm", bitDepth = 24 } = {}) {
  return encodeWav({ sampleRate: RATE, channels: 2, encoding, bitDepth, frames: Math.round(seconds * RATE), sample });
}

export function mono(seconds, sample, { encoding = "pcm", bitDepth = 24 } = {}) {
  return encodeWav({ sampleRate: RATE, channels: 1, encoding, bitDepth, frames: Math.round(seconds * RATE), sample: (_c, n) => sample(n) });
}

/** A tone at `hz` with the channel amplitudes `ampL` / `ampR` and a phase. */
export function tone(seconds, hz, ampL, ampR = ampL, phase = 0) {
  return stereo(seconds, (c, n) => (c === 0 ? ampL : ampR) * Math.sin((2 * Math.PI * hz * n) / RATE + phase));
}

/** Deterministic uniform noise in [−amp, amp]; independent per channel unless `shared`. */
export function noiseSampler(amp, { seed = 12345, shared = false } = {}) {
  const cache = new Map();
  let s = seed >>> 0;
  const next = () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return (s / 0x100000000) * 2 - 1;
  };
  return (c, n) => {
    const key = shared ? n : n * 2 + c;
    let v = cache.get(key);
    if (v === undefined) {
      v = amp * next();
      cache.set(key, v);
    }
    return v;
  };
}

/** Clicks (one-sample impulses of `amp`) every `every` seconds, otherwise silence. */
export function clicks(seconds, every, amp = 0.9) {
  const period = Math.round(every * RATE);
  return stereo(seconds, (_c, n) => (n % period === 0 ? amp : 0));
}

export const dbToLinear = (db) => Math.pow(10, db / 20);
export const near = (a, b, tol) => Math.abs(a - b) <= tol;
