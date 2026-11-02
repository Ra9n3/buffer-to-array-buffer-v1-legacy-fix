// Task 5.2 — transient activity: onsets from the 10 ms log-energy flux, the per-cell flux and crest
// series, the rate per active second, and the streaming guarantee.
import test from "node:test";
import assert from "node:assert/strict";
import { analyseBytes } from "../src/lib/analysis/analyse.ts";
import { BLOCK_SECONDS, ONSET_FLUX_DB, ONSET_SPACING_BLOCKS, TransientAnalyser } from "../src/lib/analysis/transient.ts";
import { RATE, clicks, near, noiseSampler, stereo, tone } from "./analysis-fixtures.mjs";

test("clicks every 0.5 s are counted as onsets at their times; a steady tone has one onset (its start) and a flat flux; a fade-in has none", async () => {
  const r = await analyseBytes(clicks(4, 0.5));
  assert.equal(r.transient.onsetCount, 8);
  assert.deepEqual(Array.from(r.transient.onsetSeconds, (t) => Math.round(t * 100) / 100), [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]);
  assert.equal(r.transient.fluxDb.length, 40);
  assert.ok(r.transient.fluxDb[0] >= ONSET_FLUX_DB && r.transient.fluxDb[5] >= ONSET_FLUX_DB, "cells with a click carry the jump");
  assert.equal(r.transient.fluxDb[2], 0, "a cell of silence after silence has no positive flux");
  // the clicks are single samples in otherwise silent cells: those cells count as active (peak −0.9 dBFS) — 8 of 40
  assert.ok(near(r.integrity.activeSeconds, 0.8, 1e-6));
  assert.ok(near(r.transient.onsetsPerSecond, 10, 1e-6), "per active second");
  assert.ok(r.transient.crestDb[0] > 30, "a click in a cell is a huge crest");

  const steady = await analyseBytes(tone(3, 997, 0.3, 0.3));
  assert.equal(steady.transient.onsetCount, 1, "the sound starting is the one onset");
  assert.equal(steady.transient.onsetSeconds[0], 0);
  assert.ok(steady.transient.fluxDb.subarray(1).every((v) => v < 0.5), "no jumps afterwards");
  assert.ok(near(steady.transient.crestDb[10], 3.01, 0.05), "a sine's crest per cell");
  assert.ok(near(steady.transient.onsetsPerSecond, 1 / 3, 1e-6));

  // a fade from −70 dBFS to −10 dBFS over 3 s: 0.2 dB per 10 ms block, starting under the −60 dBFS floor
  const fade = await analyseBytes(stereo(3, (_c, n) => Math.pow(10, (-70 + (60 * n) / (3 * RATE)) / 20) * Math.sin((2 * Math.PI * 997 * n) / RATE)));
  assert.equal(fade.transient.onsetCount, 0, "a slow rise never jumps 6 dB in 10 ms");
  assert.ok(fade.transient.meanFluxDb < 1);
});

test("onsets closer than 50 ms merge; a jump below −60 dBFS is not an onset; drum-like bursts in noise are found", async () => {
  // bursts every 30 ms: each is a 6 dB+ jump but only every second one is 50 ms from the last counted
  const burst = await analyseBytes(stereo(1, (_c, n) => (n % Math.round(0.03 * RATE) < 48 ? 0.8 : 0)));
  const expectedSpacing = ONSET_SPACING_BLOCKS * BLOCK_SECONDS;
  const times = Array.from(burst.transient.onsetSeconds);
  for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] >= expectedSpacing - 1e-9, `onsets ${times[i - 1]} → ${times[i]}`);
  assert.ok(burst.transient.onsetCount >= 15 && burst.transient.onsetCount <= 17, `count ${burst.transient.onsetCount}`);

  const faint = await analyseBytes(clicks(2, 0.5, 0.0005)); // −66 dBFS clicks
  assert.equal(faint.transient.onsetCount, 0);

  // a hit (20 ms burst of 0.6) every 0.4 s over noise at −40 dBFS
  const noise = noiseSampler(0.01, { shared: true });
  const drums = await analyseBytes(stereo(4, (c, n) => noise(c, n) + (n % Math.round(0.4 * RATE) < 960 ? 0.6 * Math.sin(n * 0.3) : 0)));
  assert.equal(drums.transient.onsetCount, 10);
  assert.ok(near(drums.transient.onsetsPerSecond, 2.5, 1e-6));
  assert.ok(drums.transient.meanFluxDb > 0.3);
});

test("the transient analyser streams: pushes of any length give the same blocks, flux and onsets as one push; the last partial block is closed at finish", () => {
  const frames = 1.237 * RATE;
  const x = new Float32Array(frames);
  for (let i = 0; i < frames; i++) x[i] = i % 9600 < 200 ? 0.7 : 0.001 * Math.sin(i);
  const cells = Math.ceil(frames / 4800);
  const one = new TransientAnalyser(RATE, 4800, cells);
  one.push(x);
  one.finish();
  const many = new TransientAnalyser(RATE, 4800, cells);
  for (let at = 0; at < frames; at += 317) many.push(x.subarray(at, Math.min(frames, at + 317)));
  many.finish();
  assert.deepEqual(Array.from(many.fluxDb), Array.from(one.fluxDb));
  assert.deepEqual(many.onsets, one.onsets);
  assert.equal(one.onsets.length, Math.ceil(frames / 9600));
  assert.ok(near(one.meanFluxDb, many.meanFluxDb, 1e-12));
  const empty = new TransientAnalyser(RATE, 4800, 0);
  empty.finish();
  assert.equal(empty.meanFluxDb, null);
});
