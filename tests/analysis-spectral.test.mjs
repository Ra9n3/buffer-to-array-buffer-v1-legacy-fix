// Task 5.2 — the spectral measurements: the FFT against a naive DFT, band energy calibrated to the
// RMS of what falls in a band, the centroid, the three-way balance, the per-cell series over a
// signal that changes, and the mid-signal rule (anti-phase content has no spectrum).
import test from "node:test";
import assert from "node:assert/strict";
import { analyseBytes } from "../src/lib/analysis/analyse.ts";
import { Fft, naiveDft, powerSpectraOfPair } from "../src/lib/analysis/fft.ts";
import { BALANCE_GROUPS, BANDS, FFT_SIZE, FRAME_HOP, SpectralAnalyser } from "../src/lib/analysis/spectral.ts";
import { RATE, near, noiseSampler, stereo, tone } from "./analysis-fixtures.mjs";

const bandIndex = (id) => BANDS.findIndex((b) => b.id === id);

test("the FFT matches a naive DFT on random data; two real frames come back out of one complex transform", () => {
  const n = 64;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  let s = 7;
  const rnd = () => ((s = (Math.imul(1103515245, s) + 12345) >>> 0) / 0x100000000) * 2 - 1;
  for (let i = 0; i < n; i++) {
    re[i] = rnd();
    im[i] = rnd();
  }
  const expected = naiveDft(re, im);
  const fft = new Fft(n);
  const r2 = re.slice();
  const i2 = im.slice();
  fft.transform(r2, i2);
  for (let k = 0; k < n; k++) {
    assert.ok(near(r2[k], expected.re[k], 1e-9) && near(i2[k], expected.im[k], 1e-9), `bin ${k}`);
  }
  // the pair trick: |A|² and |B|² of two real frames
  const a = Float64Array.from({ length: n }, () => rnd());
  const b = Float64Array.from({ length: n }, () => rnd());
  const pa = new Float64Array(n / 2 + 1);
  const pb = new Float64Array(n / 2 + 1);
  powerSpectraOfPair(fft, a.slice(), b.slice(), pa, pb);
  const da = naiveDft(a, new Float64Array(n));
  const db = naiveDft(b, new Float64Array(n));
  for (let k = 0; k <= n / 2; k++) {
    assert.ok(near(pa[k], da.re[k] ** 2 + da.im[k] ** 2, 1e-8), `A ${k}`);
    assert.ok(near(pb[k], db.re[k] ** 2 + db.im[k] ** 2, 1e-8), `B ${k}`);
  }
  assert.throws(() => new Fft(100), /power of two/);
});

test("band energy is calibrated: a −20 dBFS tone reads its RMS (−23 dB) in its band and ≥ 30 dB less elsewhere (the Hann main lobe spans ±23 Hz, so a 40 Hz tone leaks a little into Low); the centroid sits on the tone; the balance follows", async () => {
  const cases = [
    [40, "sub"],
    [100, "low"],
    [350, "low-mid"],
    [1000, "mid"],
    [4000, "high-mid"],
    [10000, "high"],
  ];
  for (const [hz, band] of cases) {
    const r = await analyseBytes(tone(3, hz, 0.1, 0.1));
    const b = bandIndex(band);
    assert.ok(near(r.spectral.bandMeanDb[b], -23.01, 0.3), `${hz} Hz in ${band}: ${r.spectral.bandMeanDb[b]}`);
    r.spectral.bandMeanDb.forEach((v, i) => {
      if (i !== b) assert.ok(v === null || v < -53, `${hz} Hz leaks ${v} dB into ${BANDS[i].id}`);
    });
    assert.ok(near(r.spectral.centroidHzOverall, hz, Math.max(5, hz * 0.03)), `centroid ${r.spectral.centroidHzOverall} for ${hz}`);
    const group = Object.entries(BALANCE_GROUPS).find(([, ids]) => ids.includes(band))[0];
    assert.ok(r.spectral.balance[group] > 0.999, `${hz} Hz balance ${JSON.stringify(r.spectral.balance)}`);
    assert.ok(near(r.spectral.balance.low + r.spectral.balance.mid + r.spectral.balance.high, 1, 1e-9));
  }
});

test("the series: a tone that moves from 100 Hz to 4 kHz at 1.5 s moves band energy and centroid cell by cell; broadband noise fills every band by bandwidth", async () => {
  const r = await analyseBytes(stereo(3, (_c, n) => 0.1 * Math.sin((2 * Math.PI * (n < 1.5 * RATE ? 100 : 4000) * n) / RATE)));
  assert.equal(r.cellCount, 30);
  assert.equal(r.spectral.bandDb.length, BANDS.length);
  assert.equal(r.spectral.bandDb[0].length, 30);
  const low = bandIndex("low");
  const highMid = bandIndex("high-mid");
  assert.ok(near(r.spectral.bandDb[low][5], -23.01, 0.5), `low band early ${r.spectral.bandDb[low][5]}`);
  assert.ok(r.spectral.bandDb[highMid][5] < -60);
  assert.ok(near(r.spectral.bandDb[highMid][25], -23.01, 0.5), `high-mid band late ${r.spectral.bandDb[highMid][25]}`);
  assert.ok(r.spectral.bandDb[low][25] < -60);
  assert.ok(near(r.spectral.centroidHz[5], 100, 5) && near(r.spectral.centroidHz[25], 4000, 100));
  assert.ok(r.spectral.balance.low > 0.3 && r.spectral.balance.high > 0.3);

  const noise = await analyseBytes(stereo(4, noiseSampler(0.5, { shared: true })));
  const db = noise.spectral.bandMeanDb;
  // white noise: band power ∝ bandwidth → 10·log10 of the width ratio between bands
  const widthDb = (i, j) => 10 * Math.log10((BANDS[i].highHz - BANDS[i].lowHz) / (BANDS[j].highHz - BANDS[j].lowHz));
  assert.ok(near(db[bandIndex("high")] - db[bandIndex("mid")], widthDb(bandIndex("high"), bandIndex("mid")), 0.5), `high−mid ${db[bandIndex("high")] - db[bandIndex("mid")]}`);
  assert.ok(near(db[bandIndex("mid")] - db[bandIndex("low")], widthDb(bandIndex("mid"), bandIndex("low")), 0.5));
  // uniform noise at ±0.5 has RMS 0.5/√3 → −10.8 dBFS; the bands cover 20 Hz–20 kHz of the 24 kHz,
  // so their powers sum (Parseval) to 0.8 dB less: −11.6
  const total = 10 * Math.log10(db.reduce((s, v) => s + Math.pow(10, v / 10), 0));
  assert.ok(near(total, -11.6, 0.3), `sum of bands ${total}`);
  assert.ok(noise.spectral.centroidHzOverall > 10000 && noise.spectral.centroidHzOverall < 13000, `noise centroid ${noise.spectral.centroidHzOverall}`);
});

test("the spectrum is the mid signal's: anti-phase channels have none; a silent stem has null figures and −∞ / NaN cells; streaming equals one pass", async () => {
  const anti = await analyseBytes(tone(2, 997, 0.3, -0.3));
  assert.ok(anti.spectral.bandMeanDb.every((v) => v === null));
  assert.equal(anti.spectral.balance, null);
  assert.equal(anti.spectral.centroidHzOverall, null);
  const silent = await analyseBytes(stereo(1, () => 0));
  assert.ok(silent.spectral.bandMeanDb.every((v) => v === null));

  // a lone impulse at 0.1 s (the Task 5.1 click): its frame is attributed to the cell before the
  // sample's own, which is silent by level — the mean band levels still count that frame
  const click = await analyseBytes(stereo(0.3, (_c, i) => (i === 4800 ? 1 : 0)));
  assert.ok(click.spectral.bandMeanDb.every((v) => v !== null && v < 0), `an impulse is flat across the bands: ${click.spectral.bandMeanDb}`);
  assert.ok(click.spectral.balance !== null && click.spectral.balance.high > click.spectral.balance.low, "a flat spectrum has most of its energy in the widest group");
  assert.ok(near(click.spectral.centroidHzOverall, 12000, 400), `centroid ${click.spectral.centroidHzOverall}`);
  assert.ok(silent.spectral.bandDb[0].every((v) => v === Number.NEGATIVE_INFINITY));
  assert.ok(silent.spectral.centroidHz.every((v) => Number.isNaN(v)));

  // the analyser alone: 7-sample pushes against one push, and the frame geometry
  const frames = 2.3 * RATE;
  const x = new Float32Array(frames);
  for (let i = 0; i < frames; i++) x[i] = 0.3 * Math.sin(i * 0.05) + 0.1 * Math.sin(i * 0.9);
  const cells = Math.ceil(frames / 4800);
  const one = new SpectralAnalyser(RATE, 4800, cells);
  one.push(x);
  one.finish();
  const many = new SpectralAnalyser(RATE, 4800, cells);
  for (let at = 0; at < frames; at += 1234) many.push(x.subarray(at, Math.min(frames, at + 1234)));
  many.finish();
  for (let b = 0; b < BANDS.length; b++) {
    for (let c = 0; c < cells; c++) assert.ok(near(one.bandPower[b][c], many.bandPower[b][c], 1e-12 + 1e-9 * one.bandPower[b][c]), `band ${b} cell ${c}`);
  }
  assert.ok(one.framesInCell.every((f) => f === 2), "two frames per cell");
  assert.equal(FFT_SIZE, 4096);
  assert.equal(FRAME_HOP, 2400);
  assert.throws(() => one.push(x), /after finish/);
});
