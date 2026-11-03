// Task 6.1 — the signals and measurements the two DSP suites share. Generated, never shipped:
// tones, silence, seeded noise, an impulse, an RMS, a measured response and a chunked run.
export const RATE = 48000;

export function near(actual, expected, tolerance) {
  return Math.abs(actual - expected) <= tolerance;
}

export function tone(seconds, hz, amplitude = 0.5, phase = 0) {
  const frames = Math.round(seconds * RATE);
  const out = new Float32Array(frames);
  const w = (2 * Math.PI * hz) / RATE;
  for (let i = 0; i < frames; i++) out[i] = amplitude * Math.sin(w * i + phase);
  return out;
}

export function silence(seconds) {
  return new Float32Array(Math.round(seconds * RATE));
}

/** Deterministic white noise (a 32-bit LCG, the analysis suite's convention). */
export function noise(seconds, amplitude = 0.3, seed = 1) {
  const frames = Math.round(seconds * RATE);
  const out = new Float32Array(frames);
  let s = seed >>> 0;
  for (let i = 0; i < frames; i++) {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    out[i] = amplitude * ((s / 0x100000000) * 2 - 1);
  }
  return out;
}

export function linearToDb(value) {
  return 20 * Math.log10(value);
}

export function rms(signal, from = 0, to = signal.length) {
  let sum = 0;
  for (let i = from; i < to; i++) sum += signal[i] * signal[i];
  return Math.sqrt(sum / Math.max(1, to - from));
}

export function rmsDb(signal, from, to) {
  return linearToDb(rms(signal, from, to));
}

/**
 * The module's own impulse response — what its FILTER does, as opposed to
 * what its settings say. `key` is handed to a dynamic module so a loud
 * detector can be kept quiet while the response is measured.
 */
export function impulseResponse(module, frames = 32768, key) {
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  left[0] = 1;
  if (key) module.process([left, right], [left, right], frames, [key, key]);
  else module.process([left, right], [left, right], frames);
  return left;
}

/** The magnitude of an impulse response at one frequency, dB (input = 0 dB at every frequency). */
export function responseDbOf(impulse, freqHz) {
  const w = (2 * Math.PI * freqHz) / RATE;
  let re = 0;
  let im = 0;
  for (let n = 0; n < impulse.length; n++) {
    const c = impulse[n];
    re += c * Math.cos(w * n);
    im -= c * Math.sin(w * n);
  }
  return 20 * Math.log10(Math.hypot(re, im));
}

/** Runs `module` over `input` in blocks of the given sizes (cycled), into fresh output arrays. */
export function processInChunks(module, input, sizes, key) {
  const frames = input[0].length;
  const out = input.map((channel) => new Float32Array(channel.length));
  let start = 0;
  let index = 0;
  while (start < frames) {
    const size = Math.min(sizes[index % sizes.length], frames - start);
    const inViews = input.map((channel) => channel.subarray(start, start + size));
    const outViews = out.map((channel) => channel.subarray(start, start + size));
    if (key) {
      const keyViews = key.map((channel) => channel.subarray(start, start + size));
      module.process(inViews, outViews, size, keyViews);
    } else {
      module.process(inViews, outViews, size);
    }
    start += size;
    index += 1;
  }
  return out;
}

/** The per-sample reduction reading of a one-band dynamic module (one-sample blocks). */
export function reductionPerSample(module, input, key) {
  const frames = input[0].length;
  const reductions = new Float64Array(frames);
  const out = input.map(() => new Float32Array(1));
  for (let i = 0; i < frames; i++) {
    const inViews = input.map((channel) => channel.subarray(i, i + 1));
    if (key) {
      const keyViews = key.map((channel) => channel.subarray(i, i + 1));
      module.process(inViews, out, 1, keyViews);
    } else {
      module.process(inViews, out, 1);
    }
    reductions[i] = module.gainReductionDb[0];
  }
  return reductions;
}

/** The first sample index at which `values` reaches `target` (or -1). */
export function firstIndexAt(values, target) {
  for (let i = 0; i < values.length; i++) if (values[i] >= target) return i;
  return -1;
}
