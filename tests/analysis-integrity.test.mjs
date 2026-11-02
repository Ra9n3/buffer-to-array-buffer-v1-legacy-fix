// Task 5.2 — integrity: DC offset per channel, clipping runs against hot-but-clean peaks, non-finite
// float samples, silence / near-silence / leading and trailing silence, and the format echo.
import test from "node:test";
import assert from "node:assert/strict";
import { analyseBytes } from "../src/lib/analysis/analyse.ts";
import { CLIP_LEVEL, CLIP_RUN_SAMPLES, IntegrityAnalyser } from "../src/lib/analysis/integrity.ts";
import { NEAR_SILENT_PEAK_DBFS } from "../src/lib/analysis/analyser.ts";
import { RATE, dbToLinear, mono, near, stereo, tone } from "./analysis-fixtures.mjs";

test("DC offset: a tone riding on +0.1 reads 0.1 / −20 dBFS on that channel and none on the other; a clean tone reads none", async () => {
  const r = await analyseBytes(stereo(2, (c, n) => (c === 0 ? 0.1 : 0) + 0.2 * Math.sin((2 * Math.PI * 440 * n) / RATE)));
  assert.ok(near(r.integrity.channels[0].dcOffset, 0.1, 1e-4));
  assert.ok(near(r.integrity.channels[0].dcOffsetDbfs, -20, 0.01));
  assert.ok(Math.abs(r.integrity.channels[1].dcOffset) < 1e-6);
  assert.equal(r.integrity.channels[1].dcOffsetDbfs, null, "below the 24-bit floor is none");
  const negative = await analyseBytes(mono(1, () => -0.5));
  assert.ok(near(negative.integrity.channels[0].dcOffset, -0.5, 1e-6));
  assert.ok(near(negative.integrity.channels[0].dcOffsetDbfs, -6.02, 0.01));
});

test("clipping: a square wave at full scale is runs of clipped samples; a sine that touches 0 dBFS is not clipped; a float stem over 1.0 is", async () => {
  const square = await analyseBytes(stereo(1, (_c, n) => (Math.floor(n / 240) % 2 === 0 ? 1 : -1)));
  assert.equal(square.integrity.clipped, true);
  assert.equal(square.integrity.channels[0].fullScaleSamples, RATE);
  assert.equal(square.integrity.channels[0].clippingRuns, 200, "every half cycle is a run");
  assert.equal(square.integrity.channels[0].longestClippingRun, 240);
  assert.equal(square.level.samplePeakDbfs, 0);
  assert.ok(near(square.level.crestFactorDb, 0, 1e-6));

  const hot = await analyseBytes(tone(1, 440, 1, 1));
  assert.equal(hot.integrity.clipped, false, "a full-scale sine has no three consecutive full-scale samples");
  assert.ok(hot.integrity.channels[0].fullScaleSamples > 0);
  assert.ok(hot.integrity.channels[0].longestClippingRun < CLIP_RUN_SAMPLES);

  const over = await analyseBytes(stereo(1, (_c, n) => Math.max(-1.5, Math.min(1.5, 3 * Math.sin((2 * Math.PI * 100 * n) / RATE))), { encoding: "float", bitDepth: 32 }));
  assert.equal(over.integrity.clipped, true);
  assert.ok(over.level.samplePeakDbfs > 3.5, "floats beyond full scale are measured as they are");
  assert.ok(over.integrity.channels[1].longestClippingRun > 50);

  const ia = new IntegrityAnalyser(1);
  ia.push(0, Float32Array.from([0.5, CLIP_LEVEL + 0.00005, 1, 1, 0.2, -1, -1, -1, -1, 0]), 10, 0);
  const [one] = ia.result();
  assert.equal(one.fullScaleSamples, 7);
  assert.equal(one.clippingRuns, 2);
  assert.equal(one.longestClippingRun, 4);
  // a run split across two pushes is one run
  const ib = new IntegrityAnalyser(1);
  ib.push(0, Float32Array.from([0, 1, 1]), 3, 0);
  ib.push(0, Float32Array.from([1, 1, 0]), 3, 0);
  assert.equal(ib.result()[0].clippingRuns, 1);
  assert.equal(ib.result()[0].longestClippingRun, 4);
});

test("non-finite float samples are counted and treated as zero (Task 5.1 refuses such files; a stored copy that changed is still measured, not crashed on)", async () => {
  const frames = RATE;
  const bad = new Set([100, 2000, 30000]);
  const r = await analyseBytes(mono(1, (n) => (bad.has(n) ? Number.NaN : 0.25 * Math.sin(n / 20)), { encoding: "float", bitDepth: 32 }));
  assert.equal(r.integrity.nonFinite, 3);
  assert.equal(r.integrity.channels[0].nonFinite, 3);
  assert.ok(near(r.level.samplePeakDbfs, -12.04, 0.05), "the rest is measured normally");
  assert.equal(r.format.frames, frames);
  const inf = await analyseBytes(mono(0.5, (n) => (n === 10 ? Number.POSITIVE_INFINITY : 0), { encoding: "float", bitDepth: 32 }));
  assert.equal(inf.integrity.nonFinite, 1);
  assert.equal(inf.integrity.silent, true, "with the infinity zeroed there is nothing left");
});

test("silence: digital silence is silent and not a target; −70 dBFS content is near-silent but a target; leading and trailing silence are measured by cells; the format is echoed", async () => {
  const silent = await analyseBytes(stereo(1.5, () => 0));
  assert.equal(silent.integrity.silent, true);
  assert.equal(silent.integrity.nearSilent, true);
  assert.equal(silent.integrity.analysisTarget, false);
  assert.equal(silent.integrity.silentCells, 15);
  assert.equal(silent.integrity.silentFraction, 1);
  assert.equal(silent.integrity.leadingSilenceSeconds, 1.5);
  assert.equal(silent.integrity.trailingSilenceSeconds, 0, "all of it is leading");
  assert.equal(silent.integrity.activeSeconds, 0);
  assert.equal(silent.transient.onsetsPerSecond, null);

  // dithered-quiet: −90 dBFS noise is still silent under the Task 5.1 rule (−80 dBFS peak)
  const dither = await analyseBytes(stereo(1, (_c, n) => dbToLinear(-90) * Math.sin(n)));
  assert.equal(dither.integrity.silent, true);
  const quiet = await analyseBytes(tone(1, 440, dbToLinear(-70), dbToLinear(-70)));
  assert.equal(quiet.integrity.silent, false);
  assert.equal(quiet.integrity.nearSilent, true);
  assert.equal(quiet.integrity.analysisTarget, true);
  assert.ok(quiet.level.samplePeakDbfs <= NEAR_SILENT_PEAK_DBFS);
  const normal = await analyseBytes(tone(1, 440, 0.1, 0.1));
  assert.equal(normal.integrity.nearSilent, false);

  // 0.5 s silence, 1 s tone, 0.7 s silence
  const padded = await analyseBytes(stereo(2.2, (_c, n) => (n >= 0.5 * RATE && n < 1.5 * RATE ? 0.3 * Math.sin(n * 0.1) : 0)));
  assert.ok(near(padded.integrity.leadingSilenceSeconds, 0.5, 1e-9));
  assert.ok(near(padded.integrity.trailingSilenceSeconds, 0.7, 1e-6));
  assert.ok(near(padded.integrity.activeSeconds, 1, 1e-6));
  assert.equal(padded.integrity.silentCells, 12);
  assert.ok(near(padded.integrity.silentFraction, 12 / 22, 1e-9));
  assert.ok(padded.integrity.analysisTarget);

  const fmt = await analyseBytes(mono(0.75, (n) => 0.1 * Math.sin(n * 0.1), { encoding: "float", bitDepth: 32 }));
  assert.deepEqual(fmt.format, { encoding: "float", bitDepth: 32, sampleRate: 48000, channels: 1, frames: 36000, seconds: 0.75 });
  assert.equal(fmt.schema, "alloy.analysis/1");
  assert.equal(fmt.cellSeconds, 0.1);
  assert.equal(fmt.cellCount, 8);
});
