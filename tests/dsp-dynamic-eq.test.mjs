// Task 6.1 — the Dynamic EQ, tested in isolation: below and above its threshold, full depth, attack and
// release, frequency selectivity, self-detection versus a key, the stereo link, state continuity,
// determinism, bypass, depth 0 as the static EQ, validation and stability.
import test from "node:test";
import assert from "node:assert/strict";
import { DynamicEq, normaliseDynamicEqSettings } from "../src/lib/dsp/dynamic-eq.ts";
import { Eq } from "../src/lib/dsp/eq.ts";
import {
  firstIndexAt,
  near,
  noise,
  processInChunks,
  reductionPerSample,
  rms,
  silence,
  tone,
  RATE,
} from "./dsp-fixtures.mjs";

const dynamicBand = (overrides = {}) => ({
  kind: "bell",
  freq: 1000,
  gain: 0,
  q: 1,
  depthDb: 6,
  thresholdDb: -30,
  attackMs: 1,
  releaseMs: 50,
  ...overrides,
});
const staticOf = (band) => ({ kind: band.kind, freq: band.freq, gain: band.gain, q: band.q });
const settled = (module, seconds = 0.4) => {
  // Run a module to rest, then read where it came to.
  const program = [tone(seconds, 1000, 0.01)];
  const key = [tone(seconds, 1000, 0.9)];
  module.process(program, program, program[0].length, key);
  return module.gainReductionDb[0];
};

test("below its threshold the band is exactly the static EQ — same samples, no reduction", () => {
  const band = dynamicBand({ gain: -6, q: 2, depthDb: 12, thresholdDb: -20 });
  const dynamic = new DynamicEq({ bands: [band] }, { channels: 1 });
  const staticEq = new Eq({ bands: [staticOf(band)] }, { channels: 1 });
  const input = tone(0.5, 1000, 0.02); // −34 dBFS: far below the −20 dB threshold
  const dynamicOut = [new Float32Array(input.length)];
  const staticOut = [new Float32Array(input.length)];
  dynamic.process([input], dynamicOut);
  staticEq.process([input], staticOut);
  assert.deepStrictEqual(dynamicOut[0], staticOut[0], "not a sample of difference");
  assert.equal(dynamic.gainReductionDb[0], 0);
});

test("above its threshold the band reaches its full depth, and the audio is that much quieter at the band", () => {
  const band = dynamicBand({ gain: 0, depthDb: 8, thresholdDb: -20, attackMs: 1, releaseMs: 50 });
  const dynamic = new DynamicEq({ bands: [band] }, { channels: 1 });
  const program = tone(0.5, 1000, 0.01);
  const key = tone(0.5, 1000, 1);
  const out = [new Float32Array(program.length)];
  dynamic.process([program], out, program.length, [key]);
  const tailFrom = Math.round(0.3 * RATE);
  const ratio = 20 * Math.log10(rms(out[0], tailFrom) / rms(program, tailFrom));
  assert.ok(near(ratio, -8, 0.02), `the band's gain is ${ratio.toFixed(3)} dB, expected −8`);
  assert.ok(near(dynamic.gainReductionDb[0], 8, 1e-9), `the full depth, not a fraction of it (${dynamic.gainReductionDb[0]})`);
  assert.ok(near(dynamic.responseDbAt(1000), -8, 0.02), "the current response is the band at its floor");
});

test("the law is full depth: a key 3 dB over the threshold and one 30 dB over it settle to the same reduction", () => {
  const just = new DynamicEq({ bands: [dynamicBand()] }, { channels: 1 });
  const loud = new DynamicEq({ bands: [dynamicBand()] }, { channels: 1 });
  const near3 = new DynamicEq({ bands: [dynamicBand()] }, { channels: 1 });
  assert.ok(near(settled(just), 6, 1e-9), `3 dB over: ${settled(just)}`);
  assert.ok(near(settled(loud), 6, 1e-9), `30 dB over: ${settled(loud)}`);
  // threshold −30 dBFS, a key at −27 dBFS
  const quietProgram = [silence(0.4)];
  const key = [tone(0.4, 1000, 10 ** (-27 / 20))];
  near3.process(quietProgram, quietProgram, quietProgram[0].length, key);
  assert.ok(near(near3.gainReductionDb[0], 6, 1e-6), `3 dB over the threshold gives ${near3.gainReductionDb[0]}`);
});

test("attack: the dip arrives over the documented attack, not as a step", () => {
  const slow = new DynamicEq(
    { bands: [dynamicBand({ thresholdDb: -6, attackMs: 50, releaseMs: 200 })] },
    { channels: 1 },
  );
  const program = [silence(0.4)];
  const key = [tone(0.4, 1000, 1)];
  const reductions = reductionPerSample(slow, program, key);
  const at = (ms) => reductions[Math.round((ms / 1000) * RATE)];
  assert.ok(at(20) === 0, `nothing by 20 ms (got ${at(20)})`);
  assert.ok(at(40) > 5.5, `well under way by 40 ms (got ${at(40).toFixed(3)})`);
  assert.ok(near(at(200), 6, 1e-6), `settled by 200 ms (got ${at(200)})`);
  assert.ok(reductions.every((value) => value >= 0 && value <= 6), "never negative, never past the depth");

  const fast = new DynamicEq(
    { bands: [dynamicBand({ thresholdDb: -6, attackMs: 5, releaseMs: 200 })] },
    { channels: 1 },
  );
  const fastReductions = reductionPerSample(fast, program, key);
  const slowHalf = firstIndexAt(reductions, 3);
  const fastHalf = firstIndexAt(fastReductions, 3);
  assert.ok(fastHalf > 0 && slowHalf > fastHalf, `5 ms attack reaches half depth at ${fastHalf} samples, 50 ms at ${slowHalf}`);
});

test("release: the band holds while the key is up and returns over the release when it stops", () => {
  const keyOn = tone(0.15, 1000, 1);
  const key = [new Float32Array(RATE)];
  key[0].set(keyOn, 0);
  const program = [silence(1)];
  const quick = new DynamicEq(
    { bands: [dynamicBand({ thresholdDb: -6, attackMs: 5, releaseMs: 200 })] },
    { channels: 1 },
  );
  const quickReductions = reductionPerSample(quick, program, key);
  const at = (ms) => quickReductions[Math.round((ms / 1000) * RATE)];
  assert.ok(near(at(150), 6, 1e-6), "full while the key is up");
  assert.ok(near(at(350), 6, 1e-6), "still full 200 ms after the key stops");
  assert.ok(at(600) < 1e-9, `released 450 ms after the key stops (${at(600)} dB left)`);

  const slow = new DynamicEq(
    { bands: [dynamicBand({ thresholdDb: -6, attackMs: 5, releaseMs: 1000 })] },
    { channels: 1 },
  );
  const slowReductions = reductionPerSample(slow, program, key);
  assert.ok(slowReductions[Math.round(0.75 * RATE)] > 5.9, "a 1 s release still holds at +600 ms");
});

test("frequency-selective: a key outside the band does not move it, a key inside does", () => {
  const inside = new DynamicEq({ bands: [dynamicBand({ freq: 4000, q: 2, depthDb: 9 })] }, { channels: 1 });
  const outside = new DynamicEq({ bands: [dynamicBand({ freq: 4000, q: 2, depthDb: 9 })] }, { channels: 1 });
  const program = [silence(0.4)];
  inside.process(program, program, program[0].length, [tone(0.4, 4000, 0.1)]);
  outside.process(program, program, program[0].length, [tone(0.4, 100, 0.9)]);
  assert.ok(near(inside.gainReductionDb[0], 9, 1e-6), "a −20 dBFS tone in the band triggers it");
  assert.equal(outside.gainReductionDb[0], 0, "a 100 Hz tone an octave and more below does not");
});

test("the shelves' detectors listen on their own side: a low shelf below its corner, a high shelf above it", () => {
  const low = new DynamicEq({ bands: [dynamicBand({ kind: "shelf-low", freq: 800, q: undefined })] }, { channels: 1 });
  const lowHigh = new DynamicEq({ bands: [dynamicBand({ kind: "shelf-low", freq: 800, q: undefined })] }, { channels: 1 });
  const program = [silence(0.4)];
  low.process(program, program, program[0].length, [tone(0.4, 200, 0.9)]);
  lowHigh.process(program, program, program[0].length, [tone(0.4, 8000, 0.9)]);
  assert.ok(low.gainReductionDb[0] > 0, "a low shelf hears 200 Hz");
  assert.equal(lowHigh.gainReductionDb[0], 0, "and not 8 kHz");

  const high = new DynamicEq({ bands: [dynamicBand({ kind: "shelf-high", freq: 800, q: undefined })] }, { channels: 1 });
  const highLow = new DynamicEq({ bands: [dynamicBand({ kind: "shelf-high", freq: 800, q: undefined })] }, { channels: 1 });
  high.process(program, program, program[0].length, [tone(0.4, 8000, 0.9)]);
  highLow.process(program, program, program[0].length, [tone(0.4, 50, 0.9)]);
  assert.ok(high.gainReductionDb[0] > 0, "a high shelf hears 8 kHz");
  assert.equal(highLow.gainReductionDb[0], 0, "and not 50 Hz, four octaves below its corner");
});

test("self-detection listens to its own signal; a key replaces it — the program's own level is then irrelevant", () => {
  const self = new DynamicEq({ bands: [dynamicBand()] }, { channels: 1 });
  const ownProgram = [tone(0.4, 1000, 0.9)];
  self.process(ownProgram, ownProgram);
  assert.ok(near(self.gainReductionDb[0], 6, 1e-6), "its own loud band triggers the dip");

  const keyed = new DynamicEq({ bands: [dynamicBand()] }, { channels: 1 });
  const quietProgram = [silence(0.4)];
  keyed.process(quietProgram, quietProgram, quietProgram[0].length, [tone(0.4, 1000, 0.9)]);
  assert.ok(Math.abs(keyed.gainReductionDb[0] - 6) < 1e-6, "the key triggers it though the program is silent");

  const ignored = new DynamicEq({ bands: [dynamicBand()] }, { channels: 1 });
  const loudProgram = [tone(0.4, 1000, 0.9)];
  ignored.process(loudProgram, loudProgram, loudProgram[0].length, [silence(0.4)]);
  assert.equal(ignored.gainReductionDb[0], 0, "with a silent key the program's own level is ignored");
});

test("stereo: one linked gain for both channels — a transient on one side dips both and the image does not move", () => {
  const dynamic = new DynamicEq({ bands: [dynamicBand({ depthDb: 6, thresholdDb: -30, attackMs: 1, releaseMs: 100 })] }, { channels: 2 });
  const programLeft = tone(0.4, 1000, 0.02);
  const programRight = tone(0.4, 1000, 0.02);
  const key = [tone(0.4, 1000, 0.9), silence(0.4)];
  const out = [new Float32Array(programLeft.length), new Float32Array(programRight.length)];
  dynamic.process([programLeft, programRight], out, programLeft.length, key);
  const tailFrom = Math.round(0.3 * RATE);
  const left = rms(out[0], tailFrom);
  const right = rms(out[1], tailFrom);
  assert.ok(near(left, right, 1e-9), `both channels got the same gain (${left} vs ${right})`);
  const ratio = 20 * Math.log10(left / rms(programLeft, tailFrom));
  assert.ok(near(ratio, -6, 0.02), `the dip is ${ratio.toFixed(3)} dB on both sides`);
  assert.ok(near(dynamic.gainReductionDb[0], 6, 1e-6));
});

test("state carries: one pass and 1 / 7 / mixed / 1 000-frame blocks are bit-identical, key included", () => {
  const band = dynamicBand({ freq: 1500, q: 2, depthDb: 10, thresholdDb: -24, attackMs: 15, releaseMs: 120 });
  const program = [noise(0.6, 0.3, 4)];
  const key = [tone(0.6, 1500, 0.5)];
  for (let i = Math.round(0.2 * RATE); i < Math.round(0.4 * RATE); i++) key[0][i] = 0; // on, off, on
  const reference = processInChunks(new DynamicEq({ bands: [band] }, { channels: 1 }), program, [program[0].length], key);
  for (const sizes of [[1], [7], [1, 3, 64], [1000], [4096, 1]]) {
    const chunked = processInChunks(new DynamicEq({ bands: [band] }, { channels: 1 }), program, sizes, key);
    assert.deepStrictEqual(chunked[0], reference[0], `blocks of ${sizes.join("/")}`);
  }
});

test("deterministic: two instances agree, and a reset module starts over", () => {
  const band = dynamicBand({ freq: 700, q: 3, depthDb: 7, thresholdDb: -28, attackMs: 8, releaseMs: 90 });
  const program = [noise(0.3, 0.4, 6)];
  const key = [tone(0.3, 700, 0.8)];
  const first = processInChunks(new DynamicEq({ bands: [band] }, { channels: 1 }), program, [64], key);
  const second = processInChunks(new DynamicEq({ bands: [band] }, { channels: 1 }), program, [64], key);
  assert.deepStrictEqual(second[0], first[0]);

  const repeating = new DynamicEq({ bands: [band] }, { channels: 1 });
  const once = [new Float32Array(program[0].length)];
  repeating.process(program, once, program[0].length, key);
  repeating.reset();
  assert.equal(repeating.gainReductionDb[0], 0, "reset clears the reading");
  const twice = [new Float32Array(program[0].length)];
  repeating.process(program, twice, program[0].length, key);
  assert.deepStrictEqual(twice[0], once[0], "and the state");
});

test("bypass is transparent and the detector does nothing", () => {
  const band = dynamicBand({ depthDb: 12 });
  const bypassed = new DynamicEq({ bypassed: true, bands: [band] }, { channels: 1 });
  const input = tone(0.3, 1000, 0.9);
  const out = [new Float32Array(input.length)];
  bypassed.process([input], out);
  assert.deepStrictEqual(out[0], input, "bypass copies, bit for bit");
  assert.equal(bypassed.gainReductionDb[0], 0);
  assert.equal(bypassed.responseDbAt(1000), 0);
});

test("depth 0 is the static EQ", () => {
  const band = dynamicBand({ gain: -9, q: 4, depthDb: 0 });
  const dynamic = new DynamicEq({ bands: [band] }, { channels: 1 });
  const staticEq = new Eq({ bands: [staticOf(band)] }, { channels: 1 });
  const input = noise(0.4, 0.5, 13);
  const dynamicOut = [new Float32Array(input.length)];
  const staticOut = [new Float32Array(input.length)];
  dynamic.process([input], dynamicOut, input.length, [tone(0.4, 1000, 1)]);
  staticEq.process([input], staticOut);
  assert.deepStrictEqual(dynamicOut[0], staticOut[0]);
  assert.equal(dynamic.gainReductionDb[0], 0);
});

test("validation: finite out-of-range values clamp to the documented ranges", () => {
  const normalised = normaliseDynamicEqSettings({
    bands: [
      {
        kind: "bell",
        freq: 10,
        gain: 99,
        q: 0,
        depthDb: 99,
        thresholdDb: 9,
        attackMs: 0,
        releaseMs: 99999,
      },
    ],
  });
  const band = normalised.bands[0];
  assert.equal(band.freq, 20);
  assert.equal(band.gain, 15);
  assert.equal(band.q, 0.3);
  assert.equal(band.depthDb, 15, "the depth clamps to the EQ's 15 dB");
  assert.equal(band.thresholdDb, 0, "the threshold clamps to 0 dBFS");
  assert.equal(band.attackMs, 0.1, "the attack clamps to 0.1 ms");
  assert.equal(band.releaseMs, 1000, "the release clamps to 1 s");
  assert.equal(normaliseDynamicEqSettings({ bands: [{ ...dynamicBand({ depthDb: -5 }) }] }).bands[0].depthDb, 0);
});

test("validation: impossible settings, buffers and keys throw a named error", () => {
  const throws = (fn, pattern) => assert.throws(fn, pattern);
  throws(() => new DynamicEq({ bands: [] }), /one to 4 bands/);
  throws(() => new DynamicEq({ bands: new Array(5).fill(dynamicBand()) }), /one to 4 bands/);
  throws(() => new DynamicEq({ bands: [{ ...dynamicBand(), kind: "notch" }] }), /kind is bell, shelf-low or shelf-high/);
  throws(() => new DynamicEq({ bands: [{ ...dynamicBand(), depthDb: Number.NaN }] }), /finite number/);
  throws(() => new DynamicEq({ bands: [{ ...dynamicBand(), thresholdDb: Number.POSITIVE_INFINITY }] }), /finite number/);
  throws(() => new DynamicEq({ bands: [{ ...dynamicBand(), attackMs: Number.NaN }] }), /finite number/);
  throws(() => new DynamicEq({ bands: [dynamicBand()], bypassed: "no" }), /bypassed is a boolean/);
  throws(() => new DynamicEq({ bands: [dynamicBand()] }, { channels: 3 }), /1 or 2/);
  throws(() => new DynamicEq({ bands: [dynamicBand({ freq: 20000 })] }, { sampleRate: 40000 }), /below Nyquist/);

  const dynamic = new DynamicEq({ bands: [dynamicBand()] }, { channels: 2 });
  const stereo = [new Float32Array(256), new Float32Array(256)];
  throws(() => dynamic.process([new Float32Array(256)], stereo), /expected 2 input channel/);
  throws(() => dynamic.process(stereo, stereo, 257), /holds 256 frames/);
  throws(() => dynamic.process(stereo, stereo, 256, [new Float32Array(256)]), /expected 2 key channel/);
  throws(() => dynamic.process(stereo, stereo, 256, [new Float32Array(256), new Float32Array(8)]), /holds 8 frames/);
  throws(() => dynamic.process(stereo, stereo, 256, [[0], [0]]), /not a Float32Array/);
  assert.doesNotThrow(() => dynamic.process(stereo, stereo, 0, [new Float32Array(0), new Float32Array(0)]));
});

test("stability: a boosted, deep, high-Q band over noise with a slam of a key stays finite and bounded", () => {
  const band = dynamicBand({ kind: "bell", freq: 900, gain: 15, q: 10, depthDb: 15, thresholdDb: -40, attackMs: 0.1, releaseMs: 10 });
  const dynamic = new DynamicEq({ bands: [band] }, { channels: 2 });
  const input = noise(3, 0.8, 31);
  const out = [new Float32Array(input.length), new Float32Array(input.length)];
  dynamic.process([input, input.slice()], out, input.length, [tone(3, 900, 1), tone(3, 900, 1)]);
  for (const channel of out) {
    assert.ok(channel.every((sample) => Number.isFinite(sample)), "no NaN, no infinity");
    assert.ok(channel.every((sample) => Math.abs(sample) < 1000), "the filter did not run away");
  }
  assert.ok(dynamic.gainReductionDb[0] >= 0 && dynamic.gainReductionDb[0] <= 15);
});

test("the module's shape: bands, channels, rate, and a response that is the static band at rest", () => {
  const dynamic = new DynamicEq({ bands: [dynamicBand({ gain: -6, depthDb: 8 })] }, { channels: 1 });
  assert.equal(dynamic.bandCount, 1);
  assert.equal(dynamic.channels, 1);
  assert.equal(dynamic.sampleRate, 48000);
  assert.ok(near(dynamic.responseDbAt(1000), -6, 1e-9), "at rest the band is its static gain");
  assert.equal(dynamic.gainReductionDb[0], 0, "and nothing is being reduced");
});
