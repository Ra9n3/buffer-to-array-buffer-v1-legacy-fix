// Task 6.1 — the Custom EQ (static multiband), tested in isolation: the audible filter against the
// curve the Mixer draws, gain / frequency / Q / shelf behaviour, neutral and bypassed settings, stereo
// independence, state continuity across blocks, determinism, in-place processing, validation, stability.
import test from "node:test";
import assert from "node:assert/strict";
import { Eq, EQ_BAND_KINDS, EQ_BAND_IDS, neutralEqSettings, normaliseEqSettings } from "../src/lib/dsp/eq.ts";
import { eqResponseDb } from "../src/lib/mixer-chain.ts";
import {
  impulseResponse,
  near,
  noise,
  processInChunks,
  responseDbOf,
  silence,
  tone,
} from "./dsp-fixtures.mjs";

const band = (kind, freq, gain, q) => ({ kind, freq, gain, q });

test("the audible filter is the drawn curve: an impulse through the module matches `eqResponseDb` (the Mixer's own maths) at every frequency", () => {
  const bands = [
    band("shelf-low", 120, 4, Math.SQRT1_2),
    band("bell", 480, -5, 1.4),
    band("bell", 3200, 6.5, 2.2),
    band("shelf-high", 9000, -3, Math.SQRT1_2),
  ];
  const eq = new Eq({ bands }, { channels: 2 });
  const impulse = impulseResponse(eq);
  for (const freq of [50, 120, 480, 1000, 3200, 6000, 9000, 14000]) {
    const measured = responseDbOf(impulse, freq);
    const drawn = eqResponseDb(bands, freq);
    assert.ok(near(measured, drawn, 0.05), `${freq} Hz: filter ${measured.toFixed(3)} dB vs drawn ${drawn.toFixed(3)} dB`);
  }
});

test("a bell's gain is its gain at its centre and nothing away from it", () => {
  const plus = new Eq({ bands: [band("bell", 1000, 6, 1)] }, { channels: 2 });
  const plusImpulse = impulseResponse(plus);
  assert.ok(near(responseDbOf(plusImpulse, 1000), 6, 0.02), `+6 dB bell reads ${responseDbOf(plusImpulse, 1000)}`);
  assert.ok(Math.abs(responseDbOf(plusImpulse, 100)) < 0.1, "a decade below only the bell's skirt (0.07 dB)");
  assert.ok(Math.abs(responseDbOf(plusImpulse, 10000)) < 0.1, "a decade above only the bell's skirt (0.05 dB)");

  const minus = new Eq({ bands: [band("bell", 1000, -12, 1)] }, { channels: 2 });
  assert.ok(near(responseDbOf(impulseResponse(minus), 1000), -12, 0.02), "a cut reads its cut");
});

test("frequency moves the peak: the same gain at 250 Hz and at 4 kHz land where they are set", () => {
  const low = new Eq({ bands: [band("bell", 250, 10, 2)] }, { channels: 2 });
  const high = new Eq({ bands: [band("bell", 4000, 10, 2)] }, { channels: 2 });
  const lowImpulse = impulseResponse(low);
  const highImpulse = impulseResponse(high);
  assert.ok(near(responseDbOf(lowImpulse, 250), 10, 0.02));
  assert.ok(near(responseDbOf(lowImpulse, 4000), 0, 0.05));
  assert.ok(near(responseDbOf(highImpulse, 4000), 10, 0.02));
  assert.ok(near(responseDbOf(highImpulse, 250), 0, 0.05));
});

test("Q sets the width: a high-Q bell is narrower than a broad one, and the half-gain width follows 1/Q", () => {
  const gain = 12;
  const f0 = 1000;
  const width = (q) => {
    const eq = new Eq({ bands: [band("bell", f0, gain, q)] }, { channels: 2 });
    const half = gain / 2;
    let low = f0;
    while (low > 20 && eq.responseDbAt(low) > half) low *= 0.9995;
    let high = f0;
    while (high < 20000 && eq.responseDbAt(high) > half) high *= 1.0005;
    return high - low;
  };
  const broad = width(0.7);
  const narrow = width(6);
  assert.ok(narrow > 0 && broad > narrow * 4, `half-gain widths ${broad.toFixed(1)} Hz (Q 0.7) vs ${narrow.toFixed(1)} Hz (Q 6)`);
  assert.ok(near(broad / narrow, 6 / 0.7, 0.5), `the widths scale as 1/Q (ratio ${(broad / narrow).toFixed(2)})`);
  // the same measurement through the real filter, at one off-centre frequency
  const broadAt = responseDbOf(impulseResponse(new Eq({ bands: [band("bell", f0, gain, 0.7)] })), 1350);
  const narrowAt = responseDbOf(impulseResponse(new Eq({ bands: [band("bell", f0, gain, 6)] })), 1350);
  assert.ok(broadAt > narrowAt + 3, `at 1350 Hz: broad ${broadAt.toFixed(2)} dB vs narrow ${narrowAt.toFixed(2)} dB`);
});

test("the shelves tilt one side: a low shelf reaches full gain at the bottom and half at its corner; a high shelf the other way", () => {
  const lowImpulse = impulseResponse(new Eq({ bands: [band("shelf-low", 200, 6, Math.SQRT1_2)] }));
  assert.ok(near(responseDbOf(lowImpulse, 50), 6, 0.2), `low shelf at 50 Hz: ${responseDbOf(lowImpulse, 50)}`);
  assert.ok(near(responseDbOf(lowImpulse, 200), 3, 0.2), `low shelf at its corner: ${responseDbOf(lowImpulse, 200)}`);
  assert.ok(near(responseDbOf(lowImpulse, 5000), 0, 0.05), "the top is untouched");

  const highImpulse = impulseResponse(new Eq({ bands: [band("shelf-high", 4000, -6, Math.SQRT1_2)] }));
  assert.ok(near(responseDbOf(highImpulse, 12000), -6, 0.2), `high shelf at 12 kHz: ${responseDbOf(highImpulse, 12000)}`);
  assert.ok(near(responseDbOf(highImpulse, 4000), -3, 0.2), `high shelf at its corner: ${responseDbOf(highImpulse, 4000)}`);
  assert.ok(near(responseDbOf(highImpulse, 500), 0, 0.05), "the bottom is untouched");
});

test("neutral and bypassed settings are transparent, bit for bit", () => {
  const input = noise(0.5, 0.5, 7);
  const neutralOut = new Float32Array(input.length);
  const neutral = new Eq(neutralEqSettings(), { channels: 1 });
  neutral.process([input], [neutralOut]);
  assert.deepStrictEqual(neutralOut, input, "four 0 dB bands pass the signal through exactly");
  assert.equal(neutral.responseDbAt(1000), 0);
  assert.equal(neutral.responseDbAt(20), 0);

  const bypassedOut = new Float32Array(input.length);
  const bypassed = new Eq({ bypassed: true, bands: [band("bell", 1000, 15, 1)] }, { channels: 1 });
  bypassed.process([input], [bypassedOut]);
  assert.deepStrictEqual(bypassedOut, input, "bypass copies");
  assert.equal(bypassed.responseDbAt(1000), 0, "a bypassed EQ has no response to draw");
});

test("stereo is processed consistently and independently: the same input gives the same output, one side's signal never reaches the other", () => {
  const bands = [band("bell", 700, 8, 2), band("shelf-high", 6000, -4, Math.SQRT1_2)];
  const left = noise(0.25, 0.4, 3);
  const right = noise(0.25, 0.4, 99);

  const dualMono = new Eq({ bands }, { channels: 2 });
  const monoOut = [new Float32Array(left.length), new Float32Array(left.length)];
  dualMono.process([left, left.slice()], monoOut);
  assert.deepStrictEqual(monoOut[0], monoOut[1], "identical channels stay identical");

  const independent = new Eq({ bands }, { channels: 2 });
  const out = [new Float32Array(left.length), new Float32Array(left.length)];
  independent.process([left, right], out);
  const leftOnly = new Eq({ bands }, { channels: 2 });
  const outLeft = [new Float32Array(left.length), new Float32Array(left.length)];
  leftOnly.process([left, silence(0.25)], outLeft);
  assert.deepStrictEqual(out[0], outLeft[0], "the left channel does not know the right one exists");

  const impulse = new Float32Array(4096);
  const rightSilent = new Float32Array(4096);
  impulse[0] = 1;
  const crosstalk = new Eq({ bands }, { channels: 2 });
  crosstalk.process([impulse, rightSilent], [impulse, rightSilent]);
  assert.ok(rightSilent.every((sample) => sample === 0), "an impulse on the left is silence on the right");
});

test("state carries: one pass, 1-frame blocks, 7-frame blocks and 1 000-frame blocks give the same samples", () => {
  const bands = [band("shelf-low", 100, 5, Math.SQRT1_2), band("bell", 2500, -7, 3)];
  const input = [noise(0.4, 0.4, 11)];
  const reference = processInChunks(new Eq({ bands }, { channels: 1 }), input, [input[0].length]);
  for (const sizes of [[1], [7], [1, 3, 64], [1000], [4096, 1]]) {
    const chunked = processInChunks(new Eq({ bands }, { channels: 1 }), input, sizes);
    assert.deepStrictEqual(chunked[0], reference[0], `blocks of ${sizes.join("/")}`);
  }
});

test("deterministic: two builds of the same setting, and a reset module, produce identical samples", () => {
  const settings = { bands: [band("shelf-low", 150, -4, Math.SQRT1_2), band("bell", 1500, 9, 1.2)] };
  const input = [noise(0.3, 0.5, 5)];
  const first = processInChunks(new Eq(settings, { channels: 1 }), input, [64]);
  const second = processInChunks(new Eq(settings, { channels: 1 }), input, [64]);
  assert.deepStrictEqual(second[0], first[0]);

  const repeating = new Eq(settings, { channels: 1 });
  const once = [new Float32Array(input[0].length)];
  repeating.process(input, once);
  repeating.reset();
  const twice = [new Float32Array(input[0].length)];
  repeating.process(input, twice);
  assert.deepStrictEqual(twice[0], once[0], "reset returns the module to its starting state");
});

test("in place (output === input) is the same as out of place", () => {
  const settings = { bands: [band("bell", 900, -9, 4)] };
  const input = [noise(0.2, 0.4, 8)];
  const copy = [input[0].slice()];
  const outOfPlace = [new Float32Array(input[0].length)];
  new Eq(settings, { channels: 1 }).process(copy, outOfPlace);
  const inPlace = [input[0].slice()];
  new Eq(settings, { channels: 1 }).process(inPlace, inPlace);
  assert.deepStrictEqual(inPlace[0], outOfPlace[0]);
});

test("validation: finite out-of-range values clamp to the documented ranges, and the setting comes back normalised", () => {
  const normalised = normaliseEqSettings({
    bands: [
      { kind: "shelf-low", freq: 10, gain: -99 },
      { kind: "bell", freq: 30000, gain: 99, q: 0 },
      { kind: "bell", freq: 700, gain: 0.5, q: 500 },
      { kind: "shelf-high", freq: 20000, gain: 0, q: 3 },
    ],
  });
  assert.equal(normalised.bypassed, false);
  assert.equal(normalised.bands[0].freq, 20, "freq clamps up to 20 Hz");
  assert.equal(normalised.bands[0].gain, -15, "gain clamps to −15 dB");
  assert.equal(normalised.bands[0].q, Math.SQRT1_2, "a shelf's Q is its slope's, not the caller's");
  assert.equal(normalised.bands[1].freq, 20000, "freq clamps down to 20 kHz");
  assert.equal(normalised.bands[1].gain, 15, "gain clamps to +15 dB");
  assert.equal(normalised.bands[1].q, 0.3, "Q clamps up to 0.3");
  assert.equal(normalised.bands[2].q, 10, "Q clamps down to 10");
  assert.equal(normalised.bands[3].freq, 20000);
  assert.equal(normaliseEqSettings({ bands: [band("bell", 1000, 0)] }).bands[0].q, 1, "a bell's Q defaults to 1");
});

test("validation: impossible settings throw a named error instead of building a filter", () => {
  const throws = (fn, pattern) => assert.throws(fn, pattern);
  throws(() => new Eq({ bands: [] }), /one to 4 bands/);
  throws(() => new Eq({ bands: new Array(5).fill(band("bell", 1000, 1, 1)) }), /one to 4 bands/);
  throws(() => new Eq({ bands: [{ kind: "peak", freq: 1000, gain: 1 }] }), /kind is bell, shelf-low or shelf-high/);
  throws(() => new Eq({ bands: [{ kind: "bell", freq: Number.NaN, gain: 1 }] }), /finite number/);
  throws(() => new Eq({ bands: [{ kind: "bell", freq: 1000, gain: Number.POSITIVE_INFINITY }] }), /finite number/);
  throws(() => new Eq({ bands: [{ kind: "bell", freq: 1000, gain: 1, q: Number.NaN }] }), /finite number/);
  throws(() => new Eq({ bands: [band("bell", 1000, 1, 1)], bypassed: "yes" }), /bypassed is a boolean/);
  throws(() => new Eq(neutralEqSettings(), { channels: 3 }), /1 or 2/);
  throws(() => new Eq(neutralEqSettings(), { sampleRate: 0 }), /sample rate must be positive/);
  throws(() => new Eq({ bands: [band("bell", 20000, 1, 1)] }, { sampleRate: 40000 }), /below Nyquist/);
  throws(() => new Eq(neutralEqSettings(), { sampleRate: Number.NaN }), /finite number/);

  const eq = new Eq({ bands: [band("bell", 1000, 6, 1)] }, { channels: 2 });
  const stereo = [new Float32Array(128), new Float32Array(128)];
  throws(() => eq.process([new Float32Array(128)], stereo), /expected 2 input channel/);
  throws(() => eq.process(stereo, [new Float32Array(128)]), /expected 2 output channel/);
  throws(() => eq.process(stereo, stereo, 129), /holds 128 frames/);
  throws(() => eq.process(stereo, stereo, -1), /whole number/);
  throws(() => eq.process([[0, 0], [0, 0]], stereo, 2), /not a Float32Array/);
  assert.doesNotThrow(() => eq.process(stereo, stereo, 0), "nothing to do is not an error");
  assert.throws(() => eq.responseDbAt(0), /above 0 Hz/);
});

test("stability: a maximum boost at a high Q over noise stays finite and bounded", () => {
  const eq = new Eq({ bands: [band("bell", 1000, 15, 10), band("shelf-low", 30, 15, Math.SQRT1_2)] }, { channels: 2 });
  const input = noise(3, 0.8, 21);
  const out = [new Float32Array(input.length), new Float32Array(input.length)];
  eq.process([input, input.slice()], out);
  for (const channel of out) {
    assert.ok(channel.every((sample) => Number.isFinite(sample)), "no NaN, no infinity");
    assert.ok(channel.every((sample) => Math.abs(sample) < 1000), "the filter did not run away");
  }
  assert.ok(out[0].every((sample, i) => sample === out[1][i]), "the channels stay identical");
});

test("the documented band map: LF low shelf, LMF / HMF bells, HF high shelf", () => {
  assert.deepStrictEqual([...EQ_BAND_IDS], ["lf", "lmf", "hmf", "hf"]);
  assert.deepStrictEqual(
    EQ_BAND_IDS.map((id) => EQ_BAND_KINDS[id]),
    ["shelf-low", "bell", "bell", "shelf-high"],
  );
  const eq = new Eq(neutralEqSettings(), { channels: 1 });
  assert.equal(eq.bandCount, 4);
  assert.equal(eq.channels, 1);
  assert.equal(eq.sampleRate, 48000);
  assert.equal(tone(0.01, 1000).length, 480);
});
