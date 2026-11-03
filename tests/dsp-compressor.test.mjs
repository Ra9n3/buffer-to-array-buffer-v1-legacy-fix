// Task 6.2 — the compressor and its four characters, tested in isolation: the static curve and its
// knee, ratio / threshold / make-up, attack and release against the one-pole convention, the
// character differences (detector, knee, progressive ratio), the Auto Release laws, stereo linking,
// state continuity across blocks, determinism, neutral and bypassed settings, validation.
import test from "node:test";
import assert from "node:assert/strict";
import {
  COMPRESSOR_CHARACTER_ORDER,
  COMPRESSOR_CHARACTERS,
  Compressor,
  FetCompressor,
  OptoCompressor,
  VariMuCompressor,
  VcaCompressor,
  normaliseCompressorSettings,
} from "../src/lib/dsp/compressor.ts";
import { dbToGain, effectiveRatio, RATIO_REFERENCE_DB, SILENCE_DB } from "../src/lib/dsp/dynamics.ts";
import { RATE, near } from "./dsp-fixtures.mjs";

/* ---------------------------------------------------------------- signals */

/** A constant signal — a level with no peak luck, so every detector reads exactly |value|. */
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

/** Every sample identical — reported as the first mismatch, never as a 20 000-element diff. */
function assertSameSamples(actual, expected, label) {
  assert.equal(actual.length, expected.length, `${label}: frame counts differ`);
  for (let i = 0; i < expected.length; i++) {
    if (actual[i] !== expected[i]) {
      assert.fail(`${label}: frame ${i} is ${actual[i]}, expected ${expected[i]}`);
    }
  }
}

/** The settled gain the signal actually received, dB (negative is a reduction). */
function measuredGainDb(input, output, from = 0.25) {
  const start = Math.round(from * RATE);
  let inPower = 0;
  let outPower = 0;
  for (let i = start; i < input.length; i++) {
    inPower += input[i] * input[i];
    outPower += output[i] * output[i];
  }
  return 10 * Math.log10(outPower / inPower);
}

/** Process a signal in one block, return the module and its stereo output. */
function run(module, signal) {
  const out = [new Float32Array(signal.length), new Float32Array(signal.length)];
  const input = [signal, signal.slice()];
  module.process(input, out, signal.length);
  return { module, out, input };
}

/**
 * The gain the module actually applied, sample by sample, in dB, read off the
 * signal: a constant input times a gain is a constant output, so the ratio is
 * the gain exactly. (No make-up gain in these runs, so the ratio is the
 * reduction.) Blocks of 512 keep the per-call overhead out of the measurement;
 * the module's own state carries across them, which is the point.
 */
function reductionsOf(module, first, second) {
  const signal = joined(first, second);
  const start = first.length;
  const out = [new Float32Array(signal.length), new Float32Array(signal.length)];
  const size = 512;
  for (let at = 0; at < signal.length; at += size) {
    const frames = Math.min(size, signal.length - at);
    const view = [signal.subarray(at, at + frames), signal.subarray(at, at + frames)];
    module.process(view, [out[0].subarray(at, at + frames), out[1].subarray(at, at + frames)], frames);
  }
  const reductions = new Float64Array(signal.length);
  for (let i = 0; i < signal.length; i++) {
    const input = Math.abs(signal[i]);
    reductions[i] = input > 0 ? Math.max(0, -dbOf(Math.abs(out[0][i]) / input)) : 0;
  }
  return { reductions, start };
}

/** The first index at or after `from` whose value crosses `limit` in the given direction. */
function crossingIndex(values, from, limit, rising) {
  for (let i = from; i < values.length; i++) {
    if (rising ? values[i] >= limit : values[i] <= limit) return i;
  }
  return -1;
}

const milliseconds = (frames) => (frames * 1000) / RATE;

const base = { thresholdDb: -40, ratio: 4, attackMs: 5, releaseMs: 100, makeupDb: 0 };

/* ------------------------------------------------------- the static curve */

test("at and below the knee's bottom edge nothing is touched, for all four characters (bit-exact)", () => {
  for (const id of COMPRESSOR_CHARACTER_ORDER) {
    const character = COMPRESSOR_CHARACTERS[id];
    const level = base.thresholdDb - character.kneeDb / 2 - 1;
    const signal = steady(1, amplitudeOf(level));
    const { module, out } = run(new Compressor({ ...base, character: id }, { channels: 2 }), signal);
    assertSameSamples(out[0], signal, `${id}: below the knee`);
    assert.equal(module.gainReductionDb, 0, `${id}: and the readout must be zero`);
  }
});

test("above the knee the curve is the ratio's own line: 10 dB over threshold reads 1 − 1/ratio", () => {
  for (const id of COMPRESSOR_CHARACTER_ORDER) {
    for (const ratio of [2, 4, 20]) {
      const over = RATIO_REFERENCE_DB;
      const signal = steady(2, amplitudeOf(base.thresholdDb + over));
      const { module, out } = run(new Compressor({ ...base, ratio, character: id }, { channels: 2 }), signal);
      const expected = over * (1 - 1 / ratio);
      assert.ok(near(module.gainReductionDb, expected, 0.02), `${id} @${ratio}:1 reads ${module.gainReductionDb.toFixed(3)}, expected ${expected.toFixed(3)}`);
      assert.ok(near(measuredGainDb(signal, out[0]), -expected, 0.02), `${id} @${ratio}:1: the signal lost ${measuredGainDb(signal, out[0]).toFixed(3)} dB`);
      assert.ok(near(out[0][out[0].length - 1], signal[0] * dbToGain(-expected), 1e-7), `${id}: the applied gain is the readout`);
    }
  }
});

test("the ratio doubles the reduction when the over-threshold level doubles (Opto, the static character)", () => {
  const measure = (over) => run(new OptoCompressor(base, { channels: 2 }), steady(2, amplitudeOf(-40 + over))).module.gainReductionDb;
  const once = measure(10);
  const twice = measure(20);
  assert.ok(near(once, 10 * (1 - 1 / 4), 0.02), `${once.toFixed(3)} dB at 10 dB over`);
  assert.ok(near(twice, 2 * once, 0.02), `${twice.toFixed(3)} dB at 20 dB over vs ${once.toFixed(3)}`);
});

test("the knee is the difference between the characters near the threshold, and they converge at the knee's top", () => {
  const reductionAt = (id, over) => {
    const character = COMPRESSOR_CHARACTERS[id];
    const signal = steady(2, amplitudeOf(base.thresholdDb + over));
    const { module } = run(new Compressor({ ...base, character: id }, { channels: 2 }), signal);
    return module.gainReductionDb;
  };
  const amount = 1 - 1 / base.ratio;
  // At the threshold itself: the width/8 of the quadratic knee, and exactly nothing for the hard knee.
  assert.ok(near(reductionAt("vca", 0), 0, 1e-9), "a hard knee does nothing at the threshold");
  assert.ok(near(reductionAt("fet", 0), (amount * 3) / 8, 0.02), "FET's 3 dB knee reads width/8 inside the knee");
  assert.ok(near(reductionAt("opto", 0), (amount * 9) / 8, 0.02), "Opto's 9 dB knee");
  assert.ok(near(reductionAt("vari-mu", 0), (amount * 12) / 8, 0.02), "Vari-Mu's 12 dB knee");
  assert.ok(reductionAt("vari-mu", 0) > reductionAt("opto", 0) && reductionAt("opto", 0) > reductionAt("fet", 0) && reductionAt("fet", 0) > reductionAt("vca", 0), "the wider the knee, the earlier it pulls down");
  // At each character's knee top the curve is the straight line, so a wide knee and a hard one agree.
  for (const id of ["fet", "opto", "vari-mu"]) {
    const half = COMPRESSOR_CHARACTERS[id].kneeDb / 2;
    assert.ok(near(reductionAt(id, half), amount * half, 0.02), `${id} meets the line at its knee's top edge`);
  }
  // And 10 dB over is the line for everyone.
  for (const id of COMPRESSOR_CHARACTER_ORDER) assert.ok(near(reductionAt(id, 10), amount * 10, 0.02), `${id} on the line at 10 dB over`);
});

test("make-up gain is applied exactly, and it cannot mask a reduction", () => {
  const signal = steady(1.5, amplitudeOf(-50));
  const without = run(new OptoCompressor(base, { channels: 2 }), signal);
  const withMakeup = run(new OptoCompressor({ ...base, makeupDb: 6 }, { channels: 2 }), signal);
  assert.ok(near(measuredGainDb(without.out[0], withMakeup.out[0]), 6, 1e-4), "six dB of make-up, exactly six dB");

  const loud = steady(1.5, amplitudeOf(-20));
  const boosted = run(new OptoCompressor({ ...base, makeupDb: 6 }, { channels: 2 }), loud);
  assert.ok(near(boosted.module.gainReductionDb, 20 * (1 - 1 / 4), 0.02), "make-up does not change the reduction the detector asks for");
  assert.ok(near(measuredGainDb(loud, boosted.out[0]), 6 - boosted.module.gainReductionDb, 0.03), "the applied gain is make-up minus reduction");
});

/* ------------------------------------------------------------ the timing */

test("attack is the one-pole convention: the reduction reaches 63.2 % of its step after ATTACK", () => {
  for (const attackMs of [1, 10, 40]) {
    const module = new VcaCompressor({ ...base, thresholdDb: -40, ratio: 4, attackMs, releaseMs: 200 }, { channels: 2 });
    // From the threshold to 6 dB over it: the envelope's travel IS the reduction's (6 dB), so
    // 63.2 % of one is 63.2 % of the other — which is what makes the reading a time constant.
    const { reductions, start } = reductionsOf(module, steady(0.5, amplitudeOf(-40)), steady(0.5, amplitudeOf(-34)));
    const settled = reductions[reductions.length - 1];
    const index = crossingIndex(reductions, start, 0.632 * settled, true);
    const measured = milliseconds(index - start);
    assert.ok(near(settled, 6 * (1 - 1 / 4), 0.05), `${attackMs} ms: the step settles at ${settled.toFixed(3)} dB`);
    assert.ok(near(measured, attackMs, attackMs * 0.12), `${attackMs} ms attack measured ${measured.toFixed(2)} ms`);
  }
});

test("release is the same convention going the other way: 36.8 % left after RELEASE", () => {
  for (const releaseMs of [30, 200, 600]) {
    const module = new VcaCompressor({ ...base, thresholdDb: -40, ratio: 4, attackMs: 1, releaseMs }, { channels: 2 });
    // 6 dB over the threshold, then back down to it: the same 6 dB of travel, in reverse.
    const { reductions, start } = reductionsOf(module, steady(0.5, amplitudeOf(-34)), steady(2, amplitudeOf(-40)));
    const initial = reductions[start - 1];
    const index = crossingIndex(reductions, start, 0.368 * initial, false);
    const measured = milliseconds(index - start);
    assert.ok(near(initial, 4.5, 0.05), `release ${releaseMs} ms: from ${initial.toFixed(3)} dB`);
    assert.ok(near(measured, releaseMs, releaseMs * 0.15), `${releaseMs} ms release measured ${measured.toFixed(2)} ms`);
  }
});

test("the detector is the transient difference: a peak character reads a 2 ms burst whole, an RMS one reads less of it", () => {
  const floor = amplitudeOf(-70);
  const burst = new Float32Array(96).fill(0.9);
  const signal = joined(steady(0.1, floor), burst, steady(0.2, floor));

  const peakReduction = (Ctor) => {
    const module = new Ctor({ ...base, thresholdDb: -40, attackMs: 0.1, releaseMs: 300 }, { channels: 2 });
    const out = [new Float32Array(signal.length), new Float32Array(signal.length)];
    module.process([signal, signal.slice()], out, signal.length);
    let peak = 0;
    for (let i = 0; i < signal.length; i++) {
      const reduction = -dbOf(Math.abs(out[0][i]) / Math.abs(signal[i]));
      if (reduction > peak) peak = reduction;
    }
    return peak;
  };
  const vca = peakReduction(VcaCompressor);
  const fet = peakReduction(FetCompressor);
  const opto = peakReduction(OptoCompressor);
  const variMu = peakReduction(VariMuCompressor);
  assert.ok(vca > 20 && fet > 20, `peak detectors catch the burst whole (VCA ${vca.toFixed(2)} dB, FET ${fet.toFixed(2)} dB)`);
  assert.ok(opto > 10 && variMu > 10, `the RMS detectors still act on it (Opto ${opto.toFixed(2)} dB, Vari-Mu ${variMu.toFixed(2)} dB)`);
  assert.ok(vca > opto + 3 && fet > variMu + 3, `peak reads more of a short burst than RMS does (${vca.toFixed(2)} vs ${opto.toFixed(2)}, ${fet.toFixed(2)} vs ${variMu.toFixed(2)})`);
});

/* -------------------------------------------------- the progressive ratio */

test("FET and Vari-Mu advance their ratio with drive; VCA does mildly; Opto not at all", () => {
  const heavy = (id) => {
    const signal = steady(2, amplitudeOf(base.thresholdDb + 30));
    const { module } = run(new Compressor({ ...base, character: id }, { channels: 2 }), signal);
    return module.gainReductionDb;
  };
  const opto = heavy("opto");
  const vca = heavy("vca");
  const fet = heavy("fet");
  const variMu = heavy("vari-mu");
  assert.ok(near(opto, 30 * (1 - 1 / 4), 0.02), `Opto is the knob's static ratio (${opto.toFixed(2)} dB)`);
  assert.ok(vca > opto + 0.5, `VCA advances mildly (${vca.toFixed(2)} dB)`);
  assert.ok(fet > vca + 0.5, `FET advances more (${fet.toFixed(2)} dB)`);
  assert.ok(variMu > vca + 0.5, `Vari-Mu advances more (${variMu.toFixed(2)} dB)`);
  assert.ok(near(effectiveRatio(4, 10, 2.5, 40), 4, 1e-12), "at the reference the effective ratio is the knob's");
  assert.ok(effectiveRatio(4, 30, 2.5, 40) > 4 && effectiveRatio(4, 30, 2.5, 40) < 20, "and above it walks toward 20:1");
  assert.equal(effectiveRatio(20, 60, 2.5, 40), 20, "a 20:1 knob cannot advance any further");
  assert.equal(effectiveRatio(1, 60, 2.5, 40), 1, "and a 1:1 knob cannot start compressing on its own");
});

test("the curve never turns back: output rises monotonically with input for every character and ratio", () => {
  for (const id of COMPRESSOR_CHARACTER_ORDER) {
    for (const ratio of [2, 4, 20]) {
      let previous = -Infinity;
      for (let level = -60; level <= 0; level += 4) {
        const signal = steady(0.25, amplitudeOf(level));
        const { out } = run(new Compressor({ ...base, character: id, ratio, attackMs: 0.1, releaseMs: 10 }, { channels: 2 }), signal);
        const outputLevel = dbOf(Math.abs(out[0][out[0].length - 1]));
        assert.ok(outputLevel > previous - 1e-6, `${id} @${ratio}:1: output fell from ${previous.toFixed(3)} to ${outputLevel.toFixed(3)} dB at ${level} dBFS`);
        previous = outputLevel;
      }
    }
  }
});

/* ------------------------------------------------------- the Auto Release */

test("Auto Release OFF is the knob's fixed release, not an adaptive one, for every character", () => {
  const recovery = (id) => {
    const module = new Compressor({ ...base, character: id, thresholdDb: -40, attackMs: 1, releaseMs: 200, autoRelease: false }, { channels: 2 });
    const { reductions, start } = reductionsOf(module, steady(0.5, amplitudeOf(-34)), steady(2, amplitudeOf(-40)));
    const initial = reductions[start - 1];
    return { initial, ms: milliseconds(crossingIndex(reductions, start, 0.368 * initial, false) - start) };
  };
  // The hard-kneed VCA measures the knob exactly. The other three carry a knee and, for Opto and
  // Vari-Mu, a 10 ms RMS detector and a quadratic knee near the crossing, which lengthen the
  // observed recovery without making it adaptive — the ON tests below are what show adaptation.
  const vca = recovery("vca");
  assert.ok(near(vca.ms, 200, 24), `VCA with Auto Release off: ${vca.ms.toFixed(1)} ms for a 200 ms release`);
  for (const id of ["fet", "opto", "vari-mu"]) {
    const measured = recovery(id);
    assert.ok(measured.ms > 140 && measured.ms < 420, `${id} with Auto Release off: ${measured.ms.toFixed(1)} ms, the knob's order of magnitude, not a law`);
  }
});

test("Auto Release ON is character-specific: deep VCA and Vari-Mu recover more slowly, FET more quickly", () => {
  const recovery = (id, autoRelease) => {
    const module = new Compressor({ ...base, character: id, thresholdDb: -40, attackMs: 1, releaseMs: 200, autoRelease }, { channels: 2 });
    // From 24 dB over the threshold back to it: 24 dB of travel for the envelope and the reduction alike.
    const { reductions, start } = reductionsOf(module, steady(0.5, amplitudeOf(-16)), steady(2, amplitudeOf(-40)));
    const initial = reductions[start - 1];
    const index = crossingIndex(reductions, start, 0.368 * initial, false);
    return { initial, ms: milliseconds(index - start) };
  };
  for (const id of ["vca", "vari-mu"]) {
    const off = recovery(id, false);
    const on = recovery(id, true);
    assert.ok(on.ms > off.ms * 1.2, `${id}: adaptive recovery is slower (${on.ms.toFixed(1)} ms vs ${off.ms.toFixed(1)} ms)`);
  }
  const fetOff = recovery("fet", false);
  const fetOn = recovery("fet", true);
  assert.ok(fetOn.ms < fetOff.ms, `FET's adaptive law is faster (${fetOn.ms.toFixed(1)} ms vs ${fetOff.ms.toFixed(1)} ms)`);

  const optoOff = recovery("opto", false);
  const optoOn = recovery("opto", true);
  assert.ok(optoOn.ms < optoOff.ms, `Opto's two-stage law starts fast (${optoOn.ms.toFixed(1)} ms vs ${optoOff.ms.toFixed(1)} ms)`);
});

test("a character change keeps every displayed value: the settings are the caller's, never rewritten", () => {
  const settings = { thresholdDb: -22, ratio: 6, attackMs: 30, releaseMs: 400, makeupDb: 3.5, autoRelease: true };
  for (const id of COMPRESSOR_CHARACTER_ORDER) {
    const normalised = normaliseCompressorSettings({ ...settings, character: id });
    assert.deepEqual(
      { ...normalised, character: undefined },
      { ...settings, character: undefined, bypassed: false },
      `${id} must not change a value`,
    );
  }
  const opto = new OptoCompressor(settings, { channels: 2 });
  assert.equal(opto.character.id, "opto");
  assert.equal(opto.settings.ratio, 6, "the knob is still 6:1");
  assert.equal(opto.settings.autoRelease, true, "and the switch is still where the user left it");
});

/* ----------------------------------------------------------- stereo, state */

test("stereo linking: one shared gain, the maximum channel's — L and R are never summed and never separate", () => {
  const loud = steady(2, amplitudeOf(-20));
  const quiet = steady(2, amplitudeOf(-40));
  const module = new VcaCompressor(base, { channels: 2 });
  const out = [new Float32Array(loud.length), new Float32Array(quiet.length)];
  module.process([loud, quiet], out, loud.length);
  const leftGain = measuredGainDb(loud, out[0]);
  const rightGain = measuredGainDb(quiet, out[1]);
  assert.ok(near(leftGain, rightGain, 1e-4), `the quiet channel took the loud one's gain (${leftGain.toFixed(4)} vs ${rightGain.toFixed(4)} dB)`);

  // A correlated signal in both channels: a summing detector would read +6 dB and pull 6 dB more.
  const both = steady(2, amplitudeOf(-20));
  const correlated = new VcaCompressor(base, { channels: 2 });
  const correlatedOut = [new Float32Array(both.length), new Float32Array(both.length)];
  correlated.process([both, both.slice()], correlatedOut, both.length);
  const expected = 20 * (1 - 1 / effectiveRatio(4, 20, COMPRESSOR_CHARACTERS.vca.progressiveFactor, COMPRESSOR_CHARACTERS.vca.progressiveSpanDb));
  assert.ok(near(correlated.gainReductionDb, expected, 0.05), `max(|L|,|R|), not |L+R|: ${correlated.gainReductionDb.toFixed(2)} dB, expected ${expected.toFixed(2)}`);
});

test("an RMS character links RMS, not peaks: the same click ducks the other channel far less through Opto than through VCA", () => {
  const quiet = amplitudeOf(-50);
  const left = new Float32Array(24000).fill(0);
  // A 2 ms burst: long enough for both envelopes to reach their detector's reading, short
  // enough that the 10 ms RMS window reads a tenth of its energy.
  left.fill(1, 12000, 12096);
  const right = new Float32Array(left.length).fill(quiet);
  const duck = (Ctor) => {
    const module = new Ctor({ ...base, thresholdDb: -40, attackMs: 0.1, releaseMs: 100 }, { channels: 2 });
    const out = [new Float32Array(left.length), new Float32Array(left.length)];
    module.process([left, right], out, left.length);
    let worst = 0;
    for (let i = 12000; i < 12000 + 2400; i++) {
      const reduction = -dbOf(Math.abs(out[1][i]) / quiet);
      if (reduction > worst) worst = reduction;
    }
    return worst;
  };
  const vca = duck(VcaCompressor);
  const opto = duck(OptoCompressor);
  assert.ok(vca > 25, `the peak character ducks the quiet channel hard (${vca.toFixed(2)} dB)`);
  assert.ok(opto < vca - 4, `the RMS character less, because it reads the burst's body (${opto.toFixed(2)} dB vs ${vca.toFixed(2)} dB)`);
});

test("state is carried, not restarted: any block split gives the same samples", () => {
  const signal = joined(steady(0.3, amplitudeOf(-20)), steady(0.3, 0), steady(0.3, amplitudeOf(-30)));
  const oneShot = run(new Compressor({ ...base, character: "opto" }, { channels: 2 }), signal);

  const chunked = new Compressor({ ...base, character: "opto" }, { channels: 2 });
  const out = [new Float32Array(signal.length), new Float32Array(signal.length)];
  const sizes = [1, 7, 64, 512, 3, 1000];
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

test("determinism: two identical runs are bit-identical, and reset returns the module to its first run", () => {
  const signal = joined(steady(0.2, amplitudeOf(-25)), steady(0.2, amplitudeOf(-45)));
  const settings = { ...base, character: "vari-mu", autoRelease: true };
  const first = run(new Compressor(settings, { channels: 2 }), signal);
  const second = run(new Compressor(settings, { channels: 2 }), signal);
  assertSameSamples(first.out[0], second.out[0], "determinism");

  first.module.reset();
  const again = [new Float32Array(signal.length), new Float32Array(signal.length)];
  first.module.process([signal, signal.slice()], again, signal.length);
  assertSameSamples(again[0], first.out[0], "reset");
});

/* --------------------------------------------------------- neutral, errors */

test("neutral and bypassed settings pass the signal through untouched", () => {
  const signal = joined(steady(0.2, amplitudeOf(-6)), steady(0.2, 0));

  const ratioOne = run(new Compressor({ ...base, ratio: 1 }, { channels: 2 }), signal);
  assertSameSamples(ratioOne.out[0], signal, "1:1");

  const bypassed = run(new Compressor({ ...base, bypassed: true }, { channels: 2 }), signal);
  assertSameSamples(bypassed.out[0], signal, "bypassed");
  assert.equal(bypassed.module.gainReductionDb, 0);

  const inPlace = steady(0.5, amplitudeOf(-10));
  const module = new VcaCompressor(base, { channels: 2 });
  module.process([inPlace, inPlace], [inPlace, inPlace], inPlace.length);
  assert.ok(inPlace.every((sample) => Number.isFinite(sample)), "in-place processing is finite");
});

test("validation: non-finite throws, out-of-range clamps, unknown character and bad buffers throw", () => {
  assert.throws(() => new Compressor({ ...base, thresholdDb: NaN }, { channels: 2 }), /thresholdDb/);
  assert.throws(() => new Compressor({ ...base, attackMs: Infinity }, { channels: 2 }), /attackMs/);
  assert.throws(() => new Compressor({ ...base, character: "tube" }, { channels: 2 }), /vca, opto, fet, vari-mu/);
  assert.throws(() => new Compressor({ ...base, autoRelease: "yes" }, { channels: 2 }), /autoRelease/);
  assert.throws(() => new Compressor({ ...base, bypassed: 1 }, { channels: 2 }), /bypassed/);
  assert.throws(() => new Compressor(null, { channels: 2 }), /settings must be an object/);

  const clamped = normaliseCompressorSettings({ thresholdDb: 20, ratio: 100, attackMs: 0.001, releaseMs: 1e6, makeupDb: 50 });
  assert.equal(clamped.thresholdDb, 0);
  assert.equal(clamped.ratio, 20);
  assert.equal(clamped.attackMs, 0.1);
  assert.equal(clamped.releaseMs, 1000);
  assert.equal(clamped.makeupDb, 20);
  assert.equal(clamped.character, "vca", "the default character is the console's first");
  assert.equal(clamped.autoRelease, false, "and Auto Release defaults off");

  const module = new VcaCompressor(base, { channels: 2 });
  const stereo = [new Float32Array(16), new Float32Array(16)];
  assert.throws(() => module.process(stereo, [new Float32Array(16)], 16), /expected 2 output channel/);
  assert.throws(() => module.process(stereo, stereo, 17), /17 asked for/);
  assert.throws(() => module.process(stereo, stereo, -1), /whole number/);
  assert.throws(() => module.process([[new Float32Array(16)], new Float32Array(16)], stereo, 16), /not a Float32Array/);
  assert.doesNotThrow(() => module.process(stereo, stereo, 0));
});

test("extreme but legal settings stay finite and bounded", () => {
  const module = new Compressor({ character: "fet", thresholdDb: -40, ratio: 20, attackMs: 0.1, releaseMs: 10, makeupDb: 20, autoRelease: true }, { channels: 2 });
  const signal = joined(steady(0.5, 0.95), steady(0.5, 0), steady(0.5, 1));
  const out = [new Float32Array(signal.length), new Float32Array(signal.length)];
  module.process([signal, signal.slice()], out, signal.length);
  for (const channel of out) {
    assert.ok(channel.every((sample) => Number.isFinite(sample)), "no NaN, no infinity");
    assert.ok(channel.every((sample) => Math.abs(sample) < 100), "and no runaway");
  }
  assert.ok(module.gainReductionDb >= 0 && module.gainReductionDb <= 1000);
  assert.equal(SILENCE_DB, -120);
});
