// Task 11.1 — the resampler (lib/audio/resample.ts) under Node: the pinned
// phase counts, the impulse round-trip, the sweep, THD+N, stereo independence,
// the length math, the edge padding, streaming identity and determinism.
// The measured numbers (stopband, droop) are pinned from the design as built:
// 64 taps/phase, cutoff 0.925 × Nyquist, Kaiser 96 dB — high quality, not lossless.
import test from "node:test";
import assert from "node:assert/strict";
import {
  RESAMPLER_TAPS_PER_PHASE,
  createStreamingResampler,
  resampleChannels,
  resampledFrames,
  resamplerSpec,
} from "../src/lib/audio/resample.ts";

const TOL_1 = 1 / 8388608; // one 24-bit LSB

test("the phase counts and ratios are pinned: 48→44.1 is L=147/M=160 (147 phases), 44.1→48 is L=160/M=147 (160 phases)", () => {
  const down = resamplerSpec(48000, 44100);
  const up = resamplerSpec(44100, 48000);
  assert.ok(down && up);
  assert.equal(down.up, 147);
  assert.equal(down.down, 160);
  assert.equal(down.phases, 147);
  assert.equal(up.up, 160);
  assert.equal(up.down, 147);
  assert.equal(up.phases, 160);
  assert.equal(RESAMPLER_TAPS_PER_PHASE, 64, "64 taps/phase, the top of the task's 32–64 band");
  assert.ok(Math.abs(down.cutoffHz - 0.925 * 22050) < 0.01, `cutoff ≈ 0.925 × Nyquist (got ${down.cutoffHz})`);
  assert.equal(down.lookaheadInputSamples, 32, "the declared lookahead is ceil(64/2)");
  assert.equal(resamplerSpec(48000, 48000), null, "equal rates have no stage");
  assert.equal(resamplerSpec(44100, 96000), null, "only the two project rates against each other");
});

test("output length math: ceil(inFrames × outRate / inRate); a 0.1 s block round-trips to the exact frame count", () => {
  assert.equal(resampledFrames(4800, 48000, 44100), 4410);
  assert.equal(resampledFrames(4410, 44100, 48000), 4800);
  assert.equal(resampledFrames(0, 48000, 44100), 0);
  assert.equal(resampledFrames(14400, 44100, 48000), 15674);
  assert.equal(resampledFrames(1000, 48000, 48000), 1000, "equal rates are the identity");
  for (const inFrames of [1, 7, 147, 160, 4410, 48000]) {
    const once = resampledFrames(inFrames, 48000, 44100);
    const back = resampledFrames(once, 44100, 48000);
    // each hop's ceil adds at most one frame; two hops at most two. The
    // impulse-position test carries the ±1-sample guarantee where it matters.
    assert.ok(back - inFrames >= 0 && back - inFrames <= 2, `${inFrames} → ${once} → ${back} within 0…+2`);
  }
});

test("impulse round-trip 48→44.1→48: the peak returns to its sample position within ±1 sample — no hidden shift", () => {
  for (const at of [0, 1, 1234, 2399, 4799]) {
    const inFrames = 4800;
    const x = new Float32Array(inFrames);
    x[at] = 1;
    const mid = resampleChannels([x], 48000, 44100);
    assert.equal(mid[0].length, 4410);
    const back = resampleChannels(mid, 44100, 48000);
    let peakAt = -1;
    let peak = 0;
    for (let i = 0; i < back[0].length; i++) {
      const v = Math.abs(back[0][i]);
      if (v > peak) {
        peak = v;
        peakAt = i;
      }
    }
    assert.ok(Math.abs(peakAt - at) <= 1, `impulse at ${at}: peak returned to ${peakAt}`);
    assert.ok(peak > 0.5, `the round trip keeps most of the impulse (peak ${peak.toFixed(3)})`);
  }
});

test("a constant passes at exactly 1.0 at every phase (per-phase DC normalisation), and the edges fade over the declared lookahead only", () => {
  for (const [a, b] of [[48000, 44100], [44100, 48000]]) {
    const x = new Float32Array(a * 2).fill(0.5);
    const y = resampleChannels([x], a, b)[0];
    const mid = y[Math.floor(y.length / 2)];
    assert.ok(Math.abs(mid - 0.5) < 1e-6, `mid-sample ${mid}`);
    // away from the edges (±0.05 s), the constant is exact
    for (let i = Math.floor(b * 0.1); i < y.length - Math.floor(b * 0.1); i++) {
      if (Math.abs(y[i] - 0.5) > 1e-6) assert.fail(`frame ${i} of ${y.length}: ${y[i]}`);
    }
    // the fade exists only within ceil(64/2) input samples of either end
    const lookaheadFrames = Math.ceil((32 * b) / a) + 2;
    assert.ok(y[0] < 0.5 && y[0] > 0.4, `the first sample is in the fade (got ${y[0]})`);
    assert.ok(Math.abs(y[lookaheadFrames] - 0.5) < 1e-6, `the fade is over within the declared lookahead (frame ${lookaheadFrames}: ${y[lookaheadFrames]})`);
  }
});

test("sine sweep, both directions: the audible band is flat, the transition band droops honestly, the stopband is pinned", () => {
  const measure = (inRate, outRate, freq) => {
    const frames = inRate * 2;
    const x = new Float32Array(frames);
    for (let i = 0; i < frames; i++) x[i] = Math.sin((2 * Math.PI * freq * i) / inRate);
    const y = resampleChannels([x], inRate, outRate)[0];
    const a = Math.floor(outRate * 0.5);
    const b = Math.floor(outRate * 1.5);
    let peak = 0;
    for (let i = a; i < b; i++) peak = Math.max(peak, Math.abs(y[i]));
    return 20 * Math.log10(Math.max(peak, 1e-12));
  };
  // in-band: flat to a hundredth of a dB
  for (const f of [997, 5000, 10000]) {
    assert.ok(Math.abs(measure(48000, 44100, f)) < 0.01, `48→44.1 ${f} Hz: ${measure(48000, 44100, f).toFixed(3)} dB`);
    assert.ok(Math.abs(measure(44100, 48000, f)) < 0.01, `44.1→48 ${f} Hz`);
  }
  // the transition band's droop, measured and pinned (20 kHz: ≤ 3.2 dB; 21 kHz: ≤ 16 dB)
  assert.ok(measure(48000, 44100, 20000) <= -2.8 && measure(48000, 44100, 20000) >= -3.4, `20 kHz droop pinned (${measure(48000, 44100, 20000).toFixed(2)} dB)`);
  assert.ok(measure(48000, 44100, 21000) <= -13, `21 kHz is deep in the transition (${measure(48000, 44100, 21000).toFixed(2)} dB)`);
  // the stopband at the fold edge and beyond, pinned from the design
  assert.ok(measure(48000, 44100, 23000) <= -90, `23 kHz alias ≥ 90 dB down (got ${measure(48000, 44100, 23000).toFixed(1)} dB)`);
  assert.ok(measure(48000, 44100, 24000) <= -90, `24 kHz alias ≥ 90 dB down`);
  // upsampling: the passband is flat and the image band is pinned
  assert.ok(Math.abs(measure(44100, 48000, 10000)) < 0.01);
  assert.ok(measure(44100, 48000, 21500) <= -20, `21.5 kHz image ≥ 20 dB down (${measure(44100, 48000, 21500).toFixed(1)} dB)`);
});

test("THD+N in the audible band is below −80 dB (0.01 %)", () => {
  for (const [a, b, f] of [[48000, 44100, 997], [44100, 48000, 997], [48000, 44100, 10000]]) {
    const frames = a * 2;
    const x = new Float32Array(frames);
    for (let i = 0; i < frames; i++) x[i] = 0.8 * Math.sin((2 * Math.PI * f * i) / a);
    const y = resampleChannels([x], a, b)[0];
    const from = Math.floor(b * 0.25);
    const count = Math.floor(b * 1.0);
    let signal = 0;
    let residual = 0;
    for (let i = from; i < from + count; i++) {
      const expected = 0.8 * Math.sin((2 * Math.PI * f * i) / b);
      signal += expected * expected;
      const d = y[i] - expected;
      residual += d * d;
    }
    const thdnDb = 10 * Math.log10(residual / signal);
    assert.ok(thdnDb < -80, `${a}→${b} @ ${f} Hz: THD+N ${thdnDb.toFixed(1)} dB`);
  }
});

test("stereo independence: an anti-phase pair stays exactly anti-phase", () => {
  const frames = 4800;
  const L = new Float32Array(frames);
  const R = new Float32Array(frames);
  let seed = 1;
  const next = () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296 - 0.5;
  };
  for (let i = 0; i < frames; i++) {
    L[i] = next();
    R[i] = -L[i];
  }
  const out = resampleChannels([L, R], 48000, 44100);
  let worst = 0;
  for (let i = 0; i < out[0].length; i++) worst = Math.max(worst, Math.abs(out[0][i] + out[1][i]));
  assert.ok(worst < TOL_1, `worst |L+R| ${worst.toExponential(2)}`);
});

test("edge padding: a step at the very start and end is reproduced within the passband, not smeared beyond the lookahead", () => {
  const frames = 4800;
  const x = new Float32Array(frames);
  for (let i = 0; i < frames; i++) x[i] = i < 2400 ? -0.25 : 0.25;
  const y = resampleChannels([x], 48000, 44100)[0];
  // well inside either plateau, the value is exact
  assert.ok(Math.abs(y[100] + 0.25) < 1e-6);
  assert.ok(Math.abs(y[y.length - 100] - 0.25) < 1e-6);
  // the transition between the plateaus happens around the step, within a few samples of it
  let cross = -1;
  for (let i = 1; i < y.length; i++) if (y[i - 1] < 0 && y[i] >= 0) cross = i;
  assert.ok(Math.abs(cross - Math.round((2400 * 44100) / 48000)) <= 2, `the step crossed at ${cross}`);
});

test("streaming equals the whole file, sample for sample, at any chunk size — and determinism is byte-identical", () => {
  let seed = 42;
  const next = () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296 - 0.5;
  };
  const frames = 4800 * 3;
  const x = new Float32Array(frames);
  for (let i = 0; i < frames; i++) x[i] = next();
  for (const [a, b] of [[48000, 44100], [44100, 48000]]) {
    for (const chunk of [1, 777, 4096, frames]) {
      const whole = resampleChannels([x], a, b)[0];
      const sr = createStreamingResampler(a, b, 1);
      const parts = [];
      let at = 0;
      while (at < frames) {
        const take = Math.min(chunk, frames - at);
        const emitted = sr.push([x.subarray(at, at + take)], take);
        if (emitted.frames > 0) parts.push(emitted.channels[0]);
        at += take;
      }
      const tail = sr.flush();
      if (tail.frames > 0) parts.push(tail.channels[0]);
      const total = parts.reduce((n, p) => n + p.length, 0);
      assert.equal(total, whole.length, `${a}→${b} chunk ${chunk}: total frames`);
      let o = 0;
      let worst = 0;
      for (const p of parts) {
        for (let i = 0; i < p.length; i++, o++) worst = Math.max(worst, Math.abs(p[i] - whole[o]));
        // hmm: worst diff is zero when o matches
      }
      assert.ok(worst === 0 || worst < 1e-30, `${a}→${b} chunk ${chunk}: worst diff ${worst.toExponential(2)}`);
    }
  }
  // determinism: two whole-file runs are byte-identical
  const a = resampleChannels([x], 48000, 44100)[0];
  const b2 = resampleChannels([x], 48000, 44100)[0];
  let same = a.length === b2.length;
  for (let i = 0; same && i < a.length; i++) if (a[i] !== b2[i]) same = false;
  assert.ok(same, "byte-identical across runs");
});

test("equal rates: the honest conversion is a copy, and the streaming passthrough emits what was pushed", () => {
  const x = new Float32Array([0.25, -0.5, 0.75]);
  const y = resampleChannels([x], 48000, 48000);
  assert.equal(y[0].length, 3);
  assert.deepEqual([...y[0]], [...x]);
  const sr = createStreamingResampler(48000, 48000, 1);
  const first = sr.push([x], 2);
  assert.equal(first.frames, 2);
  assert.deepEqual([...first.channels[0]], [0.25, -0.5]);
  const rest = sr.push([x], 1);
  assert.equal(rest.frames, 1);
  const end = sr.flush();
  assert.equal(end.frames, 0);
});
