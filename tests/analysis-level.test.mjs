// Task 5.2 — level and loudness: sample peak, true peak, RMS, crest, BS.1770-4 loudness
// (momentary / short-term / integrated), EBU Tech 3342 loudness range, all against signals whose
// figures are known analytically or from the standard's own calibration sentence.
import test from "node:test";
import assert from "node:assert/strict";
import { analyseBytes } from "../src/lib/analysis/analyse.ts";
import { integratedLoudness, loudnessRange, percentile, windowedPower } from "../src/lib/analysis/loudness.ts";
import { Biquad, K_PRE_48K, K_RLB_48K, TruePeakDetector } from "../src/lib/analysis/filters.ts";
import { RATE, dbToLinear, mono, near, stereo, tone } from "./analysis-fixtures.mjs";

test("BS.1770-4 calibration: a 0 dBFS 997 Hz sine in one channel reads −3.01 LUFS; in both channels at −20 dBFS, −20.0 LUFS; the series agree", async () => {
  const left = await analyseBytes(tone(5, 997, 1, 0));
  assert.ok(near(left.level.integratedLufs, -3.01, 0.05), `integrated ${left.level.integratedLufs}`);
  assert.ok(near(left.level.momentaryMaxLufs, -3.01, 0.1));
  assert.ok(near(left.level.shortTermMaxLufs, -3.01, 0.05));
  assert.equal(left.level.momentaryLufs.length, 50, "one value per 100 ms cell");
  assert.ok(Number.isNaN(left.level.momentaryLufs[2]) && Number.isFinite(left.level.momentaryLufs[3]), "momentary needs 400 ms");
  assert.ok(Number.isNaN(left.level.shortTermLufs[28]) && Number.isFinite(left.level.shortTermLufs[29]), "short-term needs 3 s");
  assert.ok(near(left.level.loudnessRangeLu, 0, 0.1), "a steady tone has no range");

  const both = await analyseBytes(tone(5, 997, 0.1, 0.1));
  assert.ok(near(both.level.integratedLufs, -20, 0.05), `integrated ${both.level.integratedLufs}`);
  assert.ok(near(both.level.samplePeakDbfs, -20, 0.01));
  assert.ok(near(both.level.rmsDbfs, -23.01, 0.02));
  assert.ok(near(both.level.crestFactorDb, 3.01, 0.02));
  assert.deepEqual(both.level.channelPeakDbfs.map((v) => Math.round(v * 100) / 100), [-20, -20]);
  assert.ok(near(both.level.channelRmsDbfs[0], -23.01, 0.02));
  assert.ok(near(both.level.rmsDbfsCells[10], -23.01, 0.05), "per-cell RMS is the same figure");
  assert.ok(near(both.level.peakDbfsCells[10], -20, 0.05));
});

test("the K-weighting is the published filter: +0.69 dB at 1 kHz (the −0.691 offset's reason), ≈ +4 dB at 10 kHz, the RLB high-pass cuts 30 Hz; a mono stem reads +3 dB over the same signal on one side", async () => {
  const gainAt = (hz) => {
    const pre = new Biquad(K_PRE_48K.b0, K_PRE_48K.b1, K_PRE_48K.b2, K_PRE_48K.a1, K_PRE_48K.a2);
    const rlb = new Biquad(K_RLB_48K.b0, K_RLB_48K.b1, K_RLB_48K.b2, K_RLB_48K.a1, K_RLB_48K.a2);
    const n = RATE;
    const x = new Float32Array(n);
    for (let i = 0; i < n; i++) x[i] = Math.sin((2 * Math.PI * hz * i) / RATE);
    const y = new Float32Array(n);
    pre.process(x, y);
    rlb.process(y, y);
    let sum = 0;
    for (let i = n / 2; i < n; i++) sum += y[i] * y[i];
    return 10 * Math.log10(sum / (n / 2) / 0.5);
  };
  assert.ok(near(gainAt(10000), 4.0, 0.3), `10 kHz ${gainAt(10000)}`);
  assert.ok(near(gainAt(1000), 0.691, 0.05), `1 kHz ${gainAt(1000)}`);
  assert.ok(gainAt(30) < -4, `30 Hz ${gainAt(30)}`);
  assert.ok(gainAt(100) < 0 && gainAt(100) > -2, `100 Hz ${gainAt(100)}`);

  const monoStem = await analyseBytes(mono(3, (n) => 0.1 * Math.sin((2 * Math.PI * 997 * n) / RATE)));
  const oneSide = await analyseBytes(tone(3, 997, 0.1, 0));
  assert.ok(near(monoStem.level.integratedLufs - oneSide.level.integratedLufs, 3.01, 0.05), "duplicated on both sides (D5.1.3)");
  assert.equal(monoStem.stereo.applicable, false);
});

test("true peak: the inter-sample peak of a 12 kHz tone sampled at 45° is ≈ 3 dB over its sample peak; a plain tone's true peak equals its sample peak; the detector streams", async () => {
  const r = await analyseBytes(tone(2, 12000, 0.5, 0.5, Math.PI / 4));
  assert.ok(near(r.level.samplePeakDbfs, -9.03, 0.02), `sample peak ${r.level.samplePeakDbfs}`);
  assert.ok(near(r.level.truePeakDbtp, -6.02, 0.25), `true peak ${r.level.truePeakDbtp}`);
  const plain = await analyseBytes(tone(2, 997, 0.5, 0.5));
  assert.ok(near(plain.level.truePeakDbtp, plain.level.samplePeakDbfs, 0.05));
  assert.equal(plain.integrity.truePeakOverCells, 0);

  const x = new Float32Array(4800);
  for (let i = 0; i < x.length; i++) x[i] = 0.5 * Math.sin((2 * Math.PI * 12000 * i) / RATE + Math.PI / 4);
  const whole = new TruePeakDetector();
  whole.push(x);
  const parts = new TruePeakDetector();
  for (let at = 0; at < x.length; at += 7) parts.push(x.subarray(at, Math.min(x.length, at + 7)));
  assert.ok(near(whole.peak, parts.peak, 1e-9), "state carried across pushes");
  assert.ok(near(20 * Math.log10(whole.peak), -6.02, 0.25));

  // a float stem whose inter-sample peaks pass full scale while every sample stays under it
  const hot = await analyseBytes(stereo(1, (_c, n) => 1.1 * Math.sin((2 * Math.PI * 12000 * n) / RATE + Math.PI / 4), { encoding: "float", bitDepth: 32 }));
  assert.ok(near(hot.level.samplePeakDbfs, -2.18, 0.02), `sample peak ${hot.level.samplePeakDbfs}`);
  assert.ok(hot.level.truePeakDbtp > 0.5, `over 0 dBTP between samples: ${hot.level.truePeakDbtp}`);
  assert.equal(hot.integrity.truePeakOverCells, 10, "every cell");
  assert.equal(hot.integrity.clipped, false, "no sample at full scale");

  // a lone full-scale sample (the Task 5.1 click): the true peak can never read below the sample peak
  const impulse = await analyseBytes(stereo(0.3, (_c, n) => (n === 4800 ? 1 : 0)));
  assert.ok(near(impulse.level.samplePeakDbfs, 0, 0.001), `sample peak ${impulse.level.samplePeakDbfs}`);
  assert.ok(impulse.level.truePeakDbtp >= impulse.level.samplePeakDbfs - 1e-9, `true peak ${impulse.level.truePeakDbtp} under the sample peak`);
  assert.ok(impulse.level.truePeakDbtp < 0.3, `an impulse interpolates to ≈ its sample: ${impulse.level.truePeakDbtp}`);
  const lone = new TruePeakDetector();
  const one = new Float32Array(64);
  one[20] = -0.75;
  lone.push(one);
  assert.ok(lone.peak >= 0.75 - 1e-12 && lone.peak < 0.78, `detector peak ${lone.peak}`);
});

test("gating: the integrated loudness ignores silence and quiet passages (−70 absolute, −10 LU relative); the loudness range spans a two-level signal", async () => {
  // 4 s at −20 dBFS, then 4 s of silence: integrated stays at the loud part
  const gated = await analyseBytes(stereo(8, (_c, n) => (n < 4 * RATE ? 0.1 * Math.sin((2 * Math.PI * 997 * n) / RATE) : 0)));
  // (the three 400 ms blocks straddling the edge are partly tone, so −20.15 rather than −20.00; an ungated mean would be −23)
  assert.ok(near(gated.level.integratedLufs, -20.15, 0.1), `integrated ${gated.level.integratedLufs}`);
  assert.ok(near(gated.level.rmsDbfs, -26.02, 0.05), "the plain RMS does average the silence in");
  // quiet tail 30 LU down: under the relative gate, so the same figure as with silence
  const relative = await analyseBytes(stereo(8, (_c, n) => (n < 4 * RATE ? 0.1 : 0.1 * dbToLinear(-30)) * Math.sin((2 * Math.PI * 997 * n) / RATE)));
  assert.ok(near(relative.level.integratedLufs, gated.level.integratedLufs, 0.01), `relative gate ${relative.level.integratedLufs}`);
  // two levels 10 LU apart, 6 s each: both above the −20 LU LRA gate → LRA ≈ 10 LU, integrated the power mean (−22.6)
  const two = await analyseBytes(stereo(12, (_c, n) => (n < 6 * RATE ? 0.1 : 0.1 * dbToLinear(-10)) * Math.sin((2 * Math.PI * 997 * n) / RATE)));
  assert.ok(near(two.level.loudnessRangeLu, 10, 0.5), `LRA ${two.level.loudnessRangeLu}`);
  assert.ok(near(two.level.integratedLufs, -22.6, 0.1), `integrated ${two.level.integratedLufs}`);

  // the pure functions on synthetic block powers
  const blocks = new Float64Array([0.01, 0.01, 0.01, 1e-9, Number.NaN]);
  assert.ok(near(integratedLoudness(blocks), -0.691 + 10 * Math.log10(0.01), 1e-9), "the −70 LUFS block is gated out");
  assert.equal(integratedLoudness(new Float64Array([1e-9, 0])), null, "nothing above the absolute gate");
  assert.equal(loudnessRange(new Float64Array([0.01])), 0);
  assert.equal(loudnessRange(new Float64Array([])), null);
  assert.equal(percentile([1, 2, 3, 4, 5], 0.5), 3);
  assert.equal(percentile([1, 2, 3, 4, 5], 0.95), 4.8);
  const energy = new Float64Array([1, 1, 1, 1, 1]);
  const fill = new Uint32Array([10, 10, 10, 10, 10]);
  const w = windowedPower(energy, fill, 4);
  assert.ok(Number.isNaN(w[2]) && near(w[3], 0.1, 1e-12) && near(w[4], 0.1, 1e-12));
});

test("silence and short stems: a silent stem has no peak, no loudness and is not an analysis target; a 0.3 s click has a peak and RMS but no complete loudness window", async () => {
  const silent = await analyseBytes(stereo(2, () => 0));
  assert.equal(silent.level.samplePeakDbfs, null);
  assert.equal(silent.level.truePeakDbtp, null);
  assert.equal(silent.level.rmsDbfs, null);
  assert.equal(silent.level.crestFactorDb, null);
  assert.equal(silent.level.integratedLufs, null);
  assert.equal(silent.level.momentaryMaxLufs, null);
  assert.equal(silent.level.loudnessRangeLu, null);
  assert.equal(silent.integrity.silent, true);
  assert.equal(silent.integrity.analysisTarget, false);
  assert.ok(silent.level.rmsDbfsCells.every((v) => v === Number.NEGATIVE_INFINITY));

  const click = await analyseBytes(stereo(0.3, (_c, n) => (n === 4800 ? -1 : 0)));
  assert.equal(click.cellCount, 3);
  assert.equal(click.level.samplePeakDbfs, 0);
  assert.ok(click.level.rmsDbfs < -40);
  assert.ok(click.level.crestFactorDb > 40);
  assert.equal(click.level.integratedLufs, null, "no complete 400 ms window");
  assert.equal(click.level.momentaryMaxLufs, null);
  assert.equal(click.level.shortTermMaxLufs, null);
  assert.equal(click.integrity.silent, false);
  assert.equal(click.integrity.analysisTarget, true);
  assert.equal(click.format.seconds, 0.3);

  const odd = await analyseBytes(stereo(0.25, (_c, n) => (n === 100 ? 0.5 : 0)));
  assert.equal(odd.cellCount, 3, "a partial last cell is still a cell");
  assert.ok(near(odd.integrity.trailingSilenceSeconds, 0.15, 1e-6), "the partial cell counts its own frames");
});
