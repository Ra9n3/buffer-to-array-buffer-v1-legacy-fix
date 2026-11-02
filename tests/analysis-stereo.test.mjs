// Task 5.2 — the stereo image: correlation, balance, width and mono loss on signals whose answers are
// exact (dual mono, anti-phase, one-sided, independent noise), the per-cell series over a signal that
// changes, and the mono-file rule.
import test from "node:test";
import assert from "node:assert/strict";
import { analyseBytes } from "../src/lib/analysis/analyse.ts";
import { balanceDbOf, correlationOf, monoLossDbOf, widthDbOf } from "../src/lib/analysis/stereo.ts";
import { RATE, mono, near, noiseSampler, stereo, tone } from "./analysis-fixtures.mjs";

test("dual mono: correlation 1, balance 0 dB, no side energy (width null), no mono loss; anti-phase: −1, total cancellation", async () => {
  const dual = await analyseBytes(tone(2, 440, 0.3, 0.3));
  assert.equal(dual.stereo.applicable, true);
  assert.ok(near(dual.stereo.correlation, 1, 1e-6));
  assert.ok(near(dual.stereo.balanceDb, 0, 1e-6));
  assert.equal(dual.stereo.widthDb, null, "−∞ dB of side energy is reported as null");
  assert.ok(near(dual.stereo.monoLossDb, 0, 1e-6));
  assert.ok(near(dual.stereo.minCorrelation, 1, 1e-6));
  assert.equal(dual.stereo.fractionNegative, 0);
  assert.equal(dual.stereo.correlationCells.length, 20);
  assert.ok(dual.stereo.correlationCells.every((v) => near(v, 1, 1e-6)));

  const anti = await analyseBytes(tone(2, 440, 0.3, -0.3));
  assert.ok(near(anti.stereo.correlation, -1, 1e-6));
  assert.equal(anti.stereo.monoLossDb, null, "the mono sum is nothing: −∞, reported as null");
  assert.equal(anti.stereo.widthDb, null, "no mid energy: width is undefined");
  assert.ok(near(anti.stereo.minCorrelation, -1, 1e-6));
  assert.equal(anti.stereo.fractionNegative, 1);

  // right 6 dB down, same phase: balance +6 dB, still fully correlated, a little side energy
  const lean = await analyseBytes(tone(2, 440, 0.4, 0.2));
  assert.ok(near(lean.stereo.balanceDb, 6.02, 0.01));
  assert.ok(near(lean.stereo.correlation, 1, 1e-6));
  assert.ok(near(lean.stereo.widthDb, 20 * Math.log10(0.1 / 0.3), 0.01), `width ${lean.stereo.widthDb}`);
  assert.ok(near(lean.stereo.monoLossDb, 10 * Math.log10(0.09 / 0.1), 0.01), `mono loss ${lean.stereo.monoLossDb}`);
});

test("one-sided and independent signals: a left-only stem has no correlation or balance figure (nothing on the right) but channel levels say so; independent noise is ≈ 0 correlated, ≈ 0 dB wide, loses ≈ 3 dB in mono", async () => {
  const left = await analyseBytes(tone(2, 440, 0.3, 0));
  assert.equal(left.stereo.correlation, null);
  assert.equal(left.stereo.balanceDb, null);
  assert.ok(near(left.stereo.widthDb, 0, 1e-6), "all the energy is in L: side equals mid");
  assert.ok(near(left.stereo.monoLossDb, -3.01, 0.01));
  assert.ok(near(left.level.channelRmsDbfs[0], -13.47, 0.02));
  assert.equal(left.level.channelRmsDbfs[1], null);
  assert.equal(left.level.channelPeakDbfs[1], null);

  const noise = await analyseBytes(stereo(4, noiseSampler(0.5)));
  assert.ok(Math.abs(noise.stereo.correlation) < 0.02, `corr ${noise.stereo.correlation}`);
  assert.ok(Math.abs(noise.stereo.widthDb) < 0.2, `width ${noise.stereo.widthDb}`);
  assert.ok(near(noise.stereo.monoLossDb, -3.01, 0.15), `mono loss ${noise.stereo.monoLossDb}`);
  assert.ok(Math.abs(noise.stereo.balanceDb) < 0.1);
  assert.ok(noise.stereo.fractionNegative > 0.2 && noise.stereo.fractionNegative < 0.8, "cells scatter around zero");
});

test("the series follow a signal that flips phase at 1 s: cells before correlate +1, after −1; silent cells are NaN and left out of the summary", async () => {
  const flip = await analyseBytes(stereo(3, (c, n) => (n < 2 * RATE ? (c === 1 && n >= RATE ? -1 : 1) * 0.3 * Math.sin((2 * Math.PI * 440 * n) / RATE) : 0)));
  assert.ok(near(flip.stereo.correlationCells[5], 1, 1e-6));
  assert.ok(near(flip.stereo.correlationCells[15], -1, 1e-6));
  assert.ok(Number.isNaN(flip.stereo.correlationCells[25]), "a silent cell has no correlation");
  assert.ok(Number.isNaN(flip.stereo.balanceDbCells[25]));
  assert.ok(near(flip.stereo.correlation, 0, 1e-6), "the whole averages out");
  assert.equal(flip.stereo.fractionNegative, 0.5, "of the 20 active cells, 10 are negative");
  assert.ok(near(flip.stereo.minCorrelation, -1, 1e-6));
  assert.equal(flip.stereo.widthDbCells[5], Number.NEGATIVE_INFINITY, "dual mono cells: no side");
  assert.equal(flip.stereo.widthDbCells[15], Number.POSITIVE_INFINITY, "anti-phase cells: no mid");
});

test("a mono stem has no stereo image: applicable false, every figure null, empty series; the pure helpers handle zero energy", async () => {
  const m = await analyseBytes(mono(2, (n) => 0.3 * Math.sin(n * 0.1)));
  assert.equal(m.stereo.applicable, false);
  assert.equal(m.stereo.correlation, null);
  assert.equal(m.stereo.widthDb, null);
  assert.equal(m.stereo.monoLossDb, null);
  assert.equal(m.stereo.minCorrelation, null);
  assert.equal(m.stereo.correlationCells.length, 0);
  assert.equal(m.level.channelRmsDbfs.length, 1);
  assert.ok(Number.isNaN(correlationOf(0, 0, 0)));
  assert.ok(Number.isNaN(balanceDbOf(1, 0)));
  assert.ok(Number.isNaN(widthDbOf(0, 0, 0)));
  assert.ok(Number.isNaN(monoLossDbOf(0, 0, 0)));
  assert.equal(correlationOf(2, 1, 1), 1, "clamped to [−1, 1] against rounding");
});
