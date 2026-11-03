// Task 6.2 — the expander, tested in isolation: the ratio law and its 6 dB knee, the RANGE clamp,
// the two directions of its timing (ATTACK opens, RELEASE closes), maximum-channel linking, the
// absence of a hold or a gate, state continuity across blocks, determinism, neutral and bypassed
// settings, validation.
import test from "node:test";
import assert from "node:assert/strict";
import { Expander, EXPANDER_KNEE_DB, normaliseExpanderSettings } from "../src/lib/dsp/expander.ts";
import { expansionReduction } from "../src/lib/dsp/dynamics.ts";
import { RATE, near } from "./dsp-fixtures.mjs";

function steady(seconds, value) {
  return new Float32Array(Math.round(seconds * RATE)).fill(value);
}

function joined(...parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Float32Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

const dbOf = (value) => 20 * Math.log10(value);
const amplitudeOf = (db) => 10 ** (db / 20);
const milliseconds = (frames) => (frames * 1000) / RATE;

function assertSameSamples(actual, expected, label) {
  assert.equal(actual.length, expected.length, `${label}: frame counts differ`);
  for (let i = 0; i < expected.length; i++) {
    if (actual[i] !== expected[i]) assert.fail(`${label}: frame ${i} is ${actual[i]}, expected ${expected[i]}`);
  }
}

function run(module, signal, channels = 2) {
  const input = channels === 2 ? [signal, signal.slice()] : [signal];
  const out = input.map((channel) => new Float32Array(channel.length));
  module.process(input, out, signal.length);
  return { module, out, input };
}

/** The attenuation the module actually applied, sample by sample, dB — read off the signal. */
function attenuationsOf(module, first, second) {
  const signal = joined(first, second);
  const start = first.length;
  const out = [new Float32Array(signal.length), new Float32Array(signal.length)];
  const size = 512;
  for (let at = 0; at < signal.length; at += size) {
    const frames = Math.min(size, signal.length - at);
    const view = [signal.subarray(at, at + frames), signal.subarray(at, at + frames)];
    module.process(view, [out[0].subarray(at, at + frames), out[1].subarray(at, at + frames)], frames);
  }
  const attenuation = new Float64Array(signal.length);
  for (let i = 0; i < signal.length; i++) {
    const input = Math.abs(signal[i]);
    attenuation[i] = input > 0 ? Math.max(0, -dbOf(Math.abs(out[0][i]) / input)) : 0;
  }
  return { attenuation, start };
}

function crossingIndex(values, from, limit, rising) {
  for (let i = from; i < values.length; i++) if (rising ? values[i] >= limit : values[i] <= limit) return i;
  return -1;
}

const base = { thresholdDb: -30, ratio: 4, attackMs: 20, releaseMs: 100, rangeDb: 40 };

/** The settled attenuation for a level, dB. */
function settledAttenuation(level, settings = {}) {
  const module = new Expander({ ...base, ...settings }, { channels: 2 });
  const signal = steady(2, amplitudeOf(level));
  const out = [new Float32Array(signal.length), new Float32Array(signal.length)];
  module.process([signal, signal.slice()], out, signal.length);
  const last = signal.length - 1;
  return -dbOf(Math.abs(out[0][last]) / Math.abs(signal[last]));
}

/* -------------------------------------------------------------- the law */

test("above the knee nothing is attenuated, for every ratio — bit-exact once the envelope has found the level", () => {
  // The envelope starts at silence (as every module here does), so a cold start ducks until it
  // rises to the program level; from 0.25 s on, above the knee, the samples are untouched.
  const settledFrom = Math.round(0.25 * RATE);
  for (const ratio of [1, 1.5, 2, 3, 4]) {
    const signal = steady(1, amplitudeOf(base.thresholdDb + EXPANDER_KNEE_DB / 2 + 2));
    const { out } = run(new Expander({ ...base, ratio }, { channels: 2 }), signal);
    assertSameSamples(out[0].subarray(settledFrom), signal.subarray(settledFrom), `${ratio}:1 above the knee`);
  }
});

test("below the knee the ratio law is exact: 10 dB under the threshold reads 10 · (1 − 1/ratio)", () => {
  for (const ratio of [1.5, 2, 3, 4]) {
    const measured = settledAttenuation(base.thresholdDb - 10, { ratio });
    const expected = 10 * (1 - 1 / ratio);
    assert.ok(near(measured, expected, 0.02), `${ratio}:1 reads ${measured.toFixed(3)} dB, expected ${expected.toFixed(3)}`);
  }
});

test("the 6 dB knee is the documented quadratic, and the straight line takes over at its bottom edge", () => {
  const amount = 1 - 1 / base.ratio;
  // At the threshold, and at the knee's own edges: the same curve the compressor's knee uses.
  assert.ok(near(settledAttenuation(base.thresholdDb), (amount * EXPANDER_KNEE_DB) / 8, 0.02), "at the threshold: width/8");
  assert.ok(near(settledAttenuation(base.thresholdDb - EXPANDER_KNEE_DB / 2), (amount * EXPANDER_KNEE_DB) / 2, 0.02), "at the knee's edge: the line's value");
  assert.ok(near(settledAttenuation(base.thresholdDb + EXPANDER_KNEE_DB / 2), 0, 1e-9), "at the knee's top edge: nothing");
  assert.ok(near(settledAttenuation(base.thresholdDb + EXPANDER_KNEE_DB), 0, 1e-9), "and above it, still nothing");
  // Below the knee it is the straight line: 20 dB under reads 20 · (1 − 1/ratio).
  assert.ok(near(settledAttenuation(base.thresholdDb - 20), amount * 20, 0.02), "20 dB under the threshold");
});

test("RANGE is a clamp on the law, and the maximum range is a capability, not a default", () => {
  const amount = 1 - 1 / base.ratio;
  assert.ok(near(settledAttenuation(base.thresholdDb - 20, { rangeDb: 8 }), 8, 0.02), "8 dB of range stops a 15 dB law at 8 dB");
  assert.ok(near(settledAttenuation(base.thresholdDb - 4, { rangeDb: 8 }), 3, 0.02), "under the clamp the law is untouched");
  assert.ok(near(settledAttenuation(base.thresholdDb - 40, { rangeDb: 40 }), amount * 40, 0.05), "40 dB of range is available");
  assert.ok(near(settledAttenuation(base.thresholdDb - 40), amount * 40, 0.05), "and is what the module offers when asked");
});

test("1:1 and RANGE 0 are exactly neutral — the module has two ways to do nothing", () => {
  const signal = joined(steady(0.3, amplitudeOf(-60)), steady(0.3, amplitudeOf(-6)), steady(0.3, 0));
  for (const settings of [{ ratio: 1 }, { rangeDb: 0 }, { ratio: 1, rangeDb: 0 }]) {
    const { module, out } = run(new Expander({ ...base, ...settings }, { channels: 2 }), signal);
    assertSameSamples(out[0], signal, JSON.stringify(settings));
    assert.equal(module.gainReductionDb, 0, "and the readout stays zero");
  }
});

test("it is an expander, not a gate: 60 dB under with the largest range still leaves the signal audible", () => {
  const level = base.thresholdDb - 60;
  const signal = steady(1, amplitudeOf(level));
  const { out } = run(new Expander({ ...base, rangeDb: 40 }, { channels: 2 }), signal);
  const last = signal.length - 1;
  assert.ok(Math.abs(out[0][last]) > 0, "the output is not zero — nothing is muted");
  const attenuation = -dbOf(Math.abs(out[0][last]) / Math.abs(signal[last]));
  assert.ok(near(attenuation, 40, 0.05), `and it is pulled down by exactly the range (${attenuation.toFixed(3)} dB)`);
});

/* ----------------------------------------------------------- the timing */

test("ATTACK is the opening time: attenuation is removed with that constant when the level rises", () => {
  for (const attackMs of [5, 20, 80]) {
    const module = new Expander({ ...base, thresholdDb: -40, ratio: 4, attackMs, releaseMs: 50, rangeDb: 40 }, { channels: 2 });
    const { attenuation, start } = attenuationsOf(module, steady(0.5, amplitudeOf(-90)), steady(0.5, amplitudeOf(-37)));
    const initial = attenuation[start - 1];
    const index = crossingIndex(attenuation, start, 0.368 * initial, false);
    const measured = milliseconds(index - start);
    assert.ok(initial > 30, `${attackMs} ms: from ${initial.toFixed(2)} dB of attenuation`);
    assert.ok(measured > attackMs * 0.85 && measured < attackMs * 1.2, `${attackMs} ms attack (opening) measured ${measured.toFixed(2)} ms`);
  }
});

test("RELEASE is the closing time: attenuation is added with that constant when the level falls", () => {
  for (const releaseMs of [20, 100, 400]) {
    const module = new Expander({ ...base, thresholdDb: -40, ratio: 4, attackMs: 2, releaseMs, rangeDb: 40 }, { channels: 2 });
    const { attenuation, start } = attenuationsOf(module, steady(0.5, amplitudeOf(-37)), steady(1, amplitudeOf(-90)));
    const settled = attenuation[attenuation.length - 1];
    const crossing = crossingIndex(attenuation, start, 0.632 * settled, true);
    const measured = milliseconds(crossing - start);
    assert.ok(settled > 30, `${releaseMs} ms: to ${settled.toFixed(2)} dB of attenuation`);
    assert.ok(measured > releaseMs * 0.85 && measured < releaseMs * 1.2, `${releaseMs} ms release (closing) measured ${measured.toFixed(2)} ms`);
  }
});

test("the two directions are different controls: a fast attack does not make the release fast", () => {
  const make = (attackMs, releaseMs) => new Expander({ ...base, thresholdDb: -40, attackMs, releaseMs }, { channels: 2 });
  const closed = (module) => {
    const { attenuation, start } = attenuationsOf(module, steady(0.5, amplitudeOf(-37)), steady(0.5, amplitudeOf(-80)));
    return milliseconds(crossingIndex(attenuation, start, 0.632 * attenuation[attenuation.length - 1], true) - start);
  };
  const fastRelease = closed(make(1, 20));
  const slowRelease = closed(make(1, 400));
  assert.ok(slowRelease > fastRelease * 8, `release follows its own knob (${fastRelease.toFixed(1)} ms vs ${slowRelease.toFixed(1)} ms)`);
});

/* ---------------------------------------------------------- the linkage */

test("stereo: one gain from max(|L|,|R|), applied equally — never a sum, never per channel", () => {
  const loudLeft = steady(2, amplitudeOf(base.thresholdDb - 10));
  const quietRight = steady(2, amplitudeOf(base.thresholdDb - 30));
  const module = new Expander(base, { channels: 2 });
  const out = [new Float32Array(loudLeft.length), new Float32Array(quietRight.length)];
  module.process([loudLeft, quietRight], out, loudLeft.length);
  const leftGain = -dbOf(Math.abs(out[0][out[0].length - 1]) / Math.abs(loudLeft[0]));
  const rightGain = -dbOf(Math.abs(out[1][out[1].length - 1]) / Math.abs(quietRight[0]));
  assert.ok(near(leftGain, rightGain, 1e-4), `both channels take the loud one's gain (${leftGain.toFixed(4)} vs ${rightGain.toFixed(4)} dB)`);
  assert.ok(near(leftGain, 10 * (1 - 1 / base.ratio), 0.03), "and that gain is the law at the loud channel's level, not a sum");

  // Correlated in both: a summing detector would read +6 dB and pull 6 dB more.
  const both = steady(2, amplitudeOf(base.thresholdDb - 10));
  const correlated = new Expander(base, { channels: 2 });
  const correlatedOut = [new Float32Array(both.length), new Float32Array(both.length)];
  correlated.process([both, both.slice()], correlatedOut, both.length);
  assert.ok(near(correlated.gainReductionDb, 10 * (1 - 1 / base.ratio), 0.03), `max(|L|,|R|), not |L+R| (${correlated.gainReductionDb.toFixed(2)} dB)`);

  // Mono is the same law.
  const mono = new Expander(base, { channels: 1 });
  const monoOut = [new Float32Array(both.length)];
  mono.process([both], monoOut, both.length);
  assert.ok(near(mono.gainReductionDb, correlated.gainReductionDb, 1e-6), "mono and a correlated stereo pair agree");
});

/* -------------------------------------------------- no hold, no hysteresis */

test("there is no hold and no hysteresis: the gain follows the level smoothly through the threshold", () => {
  const seconds = 1;
  const frames = Math.round(seconds * RATE);
  const fluttered = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    // ±0.5 dB around the threshold, four times a second: the worst case for a stuck gain.
    fluttered[i] = amplitudeOf(base.thresholdDb + 0.5 * Math.sin((2 * Math.PI * 4 * i) / RATE));
  }
  const out = [new Float32Array(frames), new Float32Array(frames)];
  const module = new Expander({ ...base, attackMs: 1, releaseMs: 5 }, { channels: 2 });
  module.process([fluttered, fluttered.slice()], out, frames);
  let previous = 0;
  let largestStep = 0;
  const settledFrom = Math.round(0.05 * RATE);
  for (let i = settledFrom; i < frames; i++) {
    const attenuation = -dbOf(Math.abs(out[0][i]) / Math.abs(fluttered[i]));
    if (i > settledFrom) largestStep = Math.max(largestStep, Math.abs(attenuation - previous));
    assert.ok(attenuation >= -1e-6 && attenuation <= base.rangeDb + 1e-6, `frame ${i}: ${attenuation} dB is outside 0 … RANGE`);
    previous = attenuation;
  }
  // A one-pole of 5 ms cannot move more than a few hundredths of a dB in a frame at these levels.
  assert.ok(largestStep < 0.05, `the gain never jumps (largest change ${largestStep.toFixed(4)} dB in a frame)`);
  assert.ok(largestStep > 0, "and it does move — the module is not stuck");
});

/* --------------------------------------------------- state, neutral, errors */

test("state is carried across blocks: any split gives the same samples", () => {
  const signal = joined(steady(0.3, amplitudeOf(-20)), steady(0.3, amplitudeOf(-50)), steady(0.3, amplitudeOf(-35)));
  const settings = { ...base, attackMs: 5, releaseMs: 60 };
  const oneShot = run(new Expander(settings, { channels: 2 }), signal);

  const chunked = new Expander(settings, { channels: 2 });
  const out = [new Float32Array(signal.length), new Float32Array(signal.length)];
  const sizes = [1, 3, 64, 511, 7, 2000];
  let at = 0;
  let index = 0;
  while (at < signal.length) {
    const size = Math.min(sizes[index % sizes.length], signal.length - at);
    chunked.process([signal.subarray(at, at + size), signal.subarray(at, at + size)], [out[0].subarray(at, at + size), out[1].subarray(at, at + size)], size);
    at += size;
    index += 1;
  }
  assertSameSamples(out[0], oneShot.out[0], "block boundaries");
});

test("determinism, reset and in-place processing", () => {
  const signal = joined(steady(0.2, amplitudeOf(-25)), steady(0.2, amplitudeOf(-55)));
  const first = run(new Expander(base, { channels: 2 }), signal);
  const second = run(new Expander(base, { channels: 2 }), signal);
  assertSameSamples(first.out[0], second.out[0], "determinism");

  first.module.reset();
  assert.equal(first.module.gainReductionDb, 0, "reset clears the readout");
  const again = [new Float32Array(signal.length), new Float32Array(signal.length)];
  first.module.process([signal, signal.slice()], again, signal.length);
  assertSameSamples(again[0], first.out[0], "reset returns the module to its first run");

  const inPlace = steady(0.5, amplitudeOf(-60));
  const module = new Expander(base, { channels: 2 });
  module.process([inPlace, inPlace], [inPlace, inPlace], inPlace.length);
  assert.ok(inPlace.every((sample) => Number.isFinite(sample)), "in place, and finite");
});

test("bypassed copies the input and freezes the state", () => {
  const signal = joined(steady(0.2, amplitudeOf(-60)), steady(0.2, amplitudeOf(-6)));
  const { module, out } = run(new Expander({ ...base, bypassed: true }, { channels: 2 }), signal);
  assertSameSamples(out[0], signal, "bypassed");
  assert.equal(module.gainReductionDb, 0);
});

test("validation: non-finite throws, out-of-range clamps, buffers and counts are checked", () => {
  assert.throws(() => new Expander({ ...base, thresholdDb: NaN }, { channels: 2 }), /thresholdDb/);
  assert.throws(() => new Expander({ ...base, ratio: Infinity }, { channels: 2 }), /ratio/);
  assert.throws(() => new Expander({ ...base, bypassed: "no" }, { channels: 2 }), /bypassed/);
  assert.throws(() => new Expander(null, { channels: 2 }), /settings must be an object/);

  const clamped = normaliseExpanderSettings({ thresholdDb: 10, ratio: 9, attackMs: 0, releaseMs: 1e7, rangeDb: 60 });
  assert.equal(clamped.thresholdDb, 0);
  assert.equal(clamped.ratio, 4);
  assert.equal(clamped.attackMs, 0.1);
  assert.equal(clamped.releaseMs, 1000);
  assert.equal(clamped.rangeDb, 40);
  assert.equal(clamped.bypassed, false);

  const module = new Expander(base, { channels: 2 });
  const stereo = [new Float32Array(32), new Float32Array(32)];
  assert.throws(() => module.process(stereo, [new Float32Array(32)], 32), /expected 2 output channel/);
  assert.throws(() => module.process(stereo, stereo, 33), /33 asked for/);
  assert.throws(() => module.process(stereo, stereo, 1.5), /whole number/);
  assert.doesNotThrow(() => module.process(stereo, stereo, 0));
  assert.equal(expansionReduction(20, EXPANDER_KNEE_DB, 0, 40), 0, "the curve itself is neutral at ratio 1");
});
