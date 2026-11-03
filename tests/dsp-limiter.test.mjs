// Task 6.2 — the safety limiter, tested in isolation: the sample-peak ceiling and the lookahead
// that keeps it, transients, the release that can never break the ceiling, no boost, the reported
// latency and its compensation (drop the delay, flush the tail), stereo linking, state continuity,
// determinism, bypass, validation.
import test from "node:test";
import assert from "node:assert/strict";
import { SafetyLimiter, LIMITER_LOOKAHEAD_MS, normaliseLimiterSettings } from "../src/lib/dsp/limiter.ts";
import { RATE, near, noise, tone } from "./dsp-fixtures.mjs";

const dbOf = (value) => 20 * Math.log10(value);
const amplitudeOf = (db) => 10 ** (db / 20);

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

function assertSameSamples(actual, expected, label) {
  assert.equal(actual.length, expected.length, `${label}: frame counts differ`);
  for (let i = 0; i < expected.length; i++) {
    if (actual[i] !== expected[i]) assert.fail(`${label}: frame ${i} is ${actual[i]}, expected ${expected[i]}`);
  }
}

function peakOf(signal) {
  let peak = 0;
  for (let i = 0; i < signal.length; i++) {
    const value = signal[i] < 0 ? -signal[i] : signal[i];
    if (value > peak) peak = value;
  }
  return peak;
}

/** Process, then drain the tail — the whole take, still delayed by the limiter's latency. */
function render(limiter, signal, channels = 2, sizes = [512]) {
  const input = channels === 2 ? [signal, signal.slice()] : [signal];
  const out = input.map((channel) => new Float32Array(channel.length + limiter.latencyFrames));
  let at = 0;
  let index = 0;
  while (at < signal.length) {
    const frames = Math.min(sizes[index % sizes.length], signal.length - at);
    const views = input.map((channel) => channel.subarray(at, at + frames));
    limiter.process(views, out.map((channel) => channel.subarray(at, at + frames)), frames);
    at += frames;
    index += 1;
  }
  limiter.flush(out.map((channel) => channel.subarray(signal.length)), limiter.latencyFrames);
  return out;
}

/* ------------------------------------------------------------- the shape */

test("the lookahead is 5 ms of the actual rate, rounded and reported", () => {
  assert.equal(LIMITER_LOOKAHEAD_MS, 5);
  assert.equal(new SafetyLimiter({}, { channels: 2 }).latencyFrames, 240, "48 kHz: 240 frames");
  assert.equal(new SafetyLimiter({}, { channels: 2, sampleRate: 44100 }).latencyFrames, 221, "44.1 kHz: 220.5 rounds to 221");
  assert.equal(new SafetyLimiter({}, { channels: 2, sampleRate: 96000 }).latencyFrames, 480);
  const defaults = new SafetyLimiter({}, { channels: 2 });
  assert.equal(defaults.settings.ceilingDb, -1, "the default ceiling is −1 dBFS");
  assert.equal(defaults.settings.releaseMs, 50, "the default release is 50 ms");
  assert.ok(near(defaults.ceilingAmplitude, amplitudeOf(-1), 1e-12), "and it is a sample amplitude");
  assert.equal(defaults.gainReductionDb, 0);
});

/* ------------------------------------------------------- the sample ceiling */

test("nothing crosses the ceiling: a full-scale signal is held at −1 dBFS, sample after sample", () => {
  const limiter = new SafetyLimiter({}, { channels: 2 });
  const signal = steady(1, 1);
  const out = render(limiter, signal);
  const peak = peakOf(out[0]);
  assert.ok(peak <= amplitudeOf(-1) + 1e-6, `peak ${dbOf(peak).toFixed(4)} dBFS must not exceed −1`);
  assert.ok(near(peak, amplitudeOf(-1), 1e-6), "and it does reach the ceiling — the limiter is doing the work");
  assert.ok(limiter.gainReductionDb > 0);
});

test("the ceiling is the knob's: −12 dBFS holds a full-scale signal 12 dB down", () => {
  const limiter = new SafetyLimiter({ ceilingDb: -12 }, { channels: 2 });
  const out = render(limiter, steady(1, 1));
  assert.ok(peakOf(out[0]) <= amplitudeOf(-12) + 1e-6, `peak ${dbOf(peakOf(out[0])).toFixed(4)} dBFS`);
  assert.ok(near(limiter.gainReductionDb, 12, 0.05), `and the readout says ${limiter.gainReductionDb.toFixed(2)} dB`);
});

test("the lookahead catches the transient: the first loud sample is already limited", () => {
  const limiter = new SafetyLimiter({}, { channels: 2 });
  const signal = joined(steady(0.5, 0.05), steady(0.5, 1));
  const out = render(limiter, signal);
  assert.ok(peakOf(out[0]) <= amplitudeOf(-1) + 1e-6, `peak ${dbOf(peakOf(out[0])).toFixed(4)} dBFS`);
  // The sample that would have overshot is the one 240 frames after the step, once aligned.
  const aligned = out[0].subarray(limiter.latencyFrames);
  const stepAt = Math.round(0.5 * RATE);
  assert.ok(Math.abs(aligned[stepAt]) <= amplitudeOf(-1) + 1e-6, "the step's own sample is limited, not the one after it");
});

test("release never compromises the ceiling: a noise floor at the ceiling holds for every release setting", () => {
  for (const releaseMs of [10, 50, 1000]) {
    const limiter = new SafetyLimiter({ ceilingDb: -6, releaseMs }, { channels: 2 });
    const signal = noise(1, 0.95, 7);
    const out = render(limiter, signal);
    assert.ok(peakOf(out[0]) <= amplitudeOf(-6) + 1e-6, `release ${releaseMs} ms: peak ${dbOf(peakOf(out[0])).toFixed(4)} dBFS`);
    assert.ok(limiter.gainReductionDb > 0);
  }
});

test("a square wave's edges — the hardest case for a sample-peak limiter with lookahead — stay inside", () => {
  const limiter = new SafetyLimiter({}, { channels: 2 });
  const frames = 24000;
  const square = new Float32Array(frames);
  for (let i = 0; i < frames; i++) square[i] = (i % 100 < 50 ? 1 : -1) * 0.98;
  const out = render(limiter, square, 2, [37]);
  assert.ok(peakOf(out[0]) <= amplitudeOf(-1) + 1e-6, `peak ${dbOf(peakOf(out[0])).toFixed(4)} dBFS`);
});

/* -------------------------------------------------- no boost, no loudness */

test("it never boosts and never normalises: below the ceiling the output is the input, delayed", () => {
  const limiter = new SafetyLimiter({}, { channels: 2 });
  const signal = tone(1, 220, 0.5);
  const out = render(limiter, signal);
  assertSameSamples(out[0].subarray(limiter.latencyFrames), signal, "below the ceiling");
  assert.equal(limiter.gainReductionDb, 0, "and it reports no reduction");

  // A very quiet signal is still not lifted.
  const quiet = new SafetyLimiter({}, { channels: 2 });
  const quietOut = render(quiet, steady(0.3, 0.001));
  assert.ok(peakOf(quietOut[0]) <= 0.001 + 1e-9, "no gain boost on a quiet take");
});

/* ---------------------------------------------------- latency compensation */

test("compensation by construction: drop the reported latency, flush the tail, get the take back", () => {
  const limiter = new SafetyLimiter({}, { channels: 2 });
  const signal = tone(1, 330, 0.5);
  const out = render(limiter, signal);
  assert.equal(out[0].length, signal.length + limiter.latencyFrames, "process plus flush is latency frames longer than the input");
  assertSameSamples(out[0].subarray(limiter.latencyFrames), signal, "and equal to the input once the delay is dropped");

  // The first `latencyFrames` frames are the line filling, not trimmed audio: they are the only
  // thing dropped, and they are zeros on a fresh module.
  assert.ok(out[0].subarray(0, limiter.latencyFrames).every((sample) => sample === 0));
});

test("flush writes the real tail, limited by the same rules — never a blind trim and never silence", () => {
  const limiter = new SafetyLimiter({}, { channels: 2 });
  const signal = joined(steady(0.2, 0.05), steady(0.2, 1));
  const out = render(limiter, signal);
  const tail = out[0].subarray(signal.length);
  assert.equal(tail.length, limiter.latencyFrames);
  assert.ok(tail.every((sample) => Number.isFinite(sample)), "the tail is audio, not a hole");
  assert.ok(peakOf(tail) <= amplitudeOf(-1) + 1e-6, "and it respects the ceiling like everything else");
  assert.ok(peakOf(tail) > 0, "with signal in the line, the tail carries it");
});

/* -------------------------------------------------------- stereo linkage */

test("stereo: one gain from max(|L|,|R|) — the quiet channel takes the loud one's gain, and never a sum", () => {
  const limiter = new SafetyLimiter({}, { channels: 2 });
  const loud = steady(0.5, 1);
  const quiet = steady(0.5, 0.1);
  const out = [new Float32Array(loud.length + limiter.latencyFrames), new Float32Array(loud.length + limiter.latencyFrames)];
  limiter.process([loud, quiet], [out[0].subarray(0, loud.length), out[1].subarray(0, loud.length)], loud.length);
  limiter.flush([out[0].subarray(loud.length), out[1].subarray(loud.length)], limiter.latencyFrames);
  const at = 20000;
  const leftGain = out[0][at] / loud[at - limiter.latencyFrames];
  const rightGain = out[1][at] / quiet[at - limiter.latencyFrames];
  assert.ok(near(leftGain, rightGain, 1e-6), `both channels share one gain (${leftGain.toFixed(6)} vs ${rightGain.toFixed(6)})`);
  assert.ok(leftGain < 1, "and it is a reduction");

  // Correlated in both channels: max(|L|,|R|) is 1, not 2, so the gain is ceiling/1.
  const both = new SafetyLimiter({}, { channels: 2 });
  const correlated = steady(0.3, 1);
  const correlatedOut = [new Float32Array(correlated.length), new Float32Array(correlated.length)];
  both.process([correlated, correlated.slice()], correlatedOut, correlated.length);
  assert.ok(near(both.gainReductionDb, 1, 0.05), `max(|L|,|R|): ${both.gainReductionDb.toFixed(3)} dB of reduction for a 0 dBFS pair`);
});

/* --------------------------------------------- state, determinism, bypass */

test("state is carried across blocks: any split gives the same samples", () => {
  const signal = joined(steady(0.2, 0.5), noise(0.4, 0.95, 3), steady(0.2, 0.2));
  const oneShot = render(new SafetyLimiter({}, { channels: 2 }), signal, 2, [signal.length]);
  const chunked = render(new SafetyLimiter({}, { channels: 2 }), signal, 2, [1, 7, 128, 1024, 3]);
  assertSameSamples(chunked[0], oneShot[0], "block boundaries");
});

test("determinism and reset", () => {
  const signal = noise(0.5, 0.95, 11);
  const first = render(new SafetyLimiter({}, { channels: 2 }), signal);
  const second = render(new SafetyLimiter({}, { channels: 2 }), signal);
  assertSameSamples(first[0], second[0], "determinism");

  const limiter = new SafetyLimiter({}, { channels: 2 });
  render(limiter, signal);
  limiter.reset();
  assert.equal(limiter.gainReductionDb, 0, "reset clears the readout");
  const again = render(limiter, signal);
  assertSameSamples(again[0], first[0], "reset returns the module to its first run");
});

test("bypassed: unity gain, same latency — toggling it never moves the render", () => {
  const limiter = new SafetyLimiter({ bypassed: true }, { channels: 2 });
  const signal = joined(steady(0.2, 1), tone(0.3, 400, 0.8));
  const out = render(limiter, signal);
  assertSameSamples(out[0].subarray(limiter.latencyFrames), signal, "bypassed audio is the input, delayed by the same latency");
  assert.equal(limiter.gainReductionDb, 0);
  assert.equal(peakOf(out[0]), peakOf(signal), "and nothing is limited");
});

/* -------------------------------------------------------------- validation */

test("validation: non-finite throws, out-of-range clamps, buffers and counts are checked", () => {
  assert.throws(() => new SafetyLimiter({ ceilingDb: NaN }, { channels: 2 }), /ceilingDb/);
  assert.throws(() => new SafetyLimiter({ releaseMs: Infinity }, { channels: 2 }), /releaseMs/);
  assert.throws(() => new SafetyLimiter({ bypassed: "no" }, { channels: 2 }), /bypassed/);
  assert.throws(() => new SafetyLimiter(null, { channels: 2 }), /settings must be an object/);

  const clamped = normaliseLimiterSettings({ ceilingDb: 6, releaseMs: 1 });
  assert.equal(clamped.ceilingDb, 0);
  assert.equal(clamped.releaseMs, 10);
  assert.equal(clamped.bypassed, false);

  const limiter = new SafetyLimiter({}, { channels: 2 });
  const stereo = [new Float32Array(512), new Float32Array(512)];
  assert.throws(() => limiter.process(stereo, [new Float32Array(512)], 512), /expected 2 output channel/);
  assert.throws(() => limiter.process(stereo, stereo, 513), /513 asked for/);
  assert.throws(() => limiter.process(stereo, stereo, 2.5), /whole number/);
  assert.throws(() => limiter.flush([new Float32Array(limiter.latencyFrames - 1), new Float32Array(limiter.latencyFrames - 1)]), /asked for/);
  assert.doesNotThrow(() => limiter.process(stereo, stereo, 0));
  assert.doesNotThrow(() => limiter.flush([new Float32Array(0), new Float32Array(0)], 0));
});
