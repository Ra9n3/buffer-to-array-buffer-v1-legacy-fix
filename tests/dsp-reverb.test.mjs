// Task 6.3 — the FDN reverb, tested in isolation: the RT60 contract against DECAY, structure that
// differs by configuration, wet-only output, pre-delay, damping in the loop (not on the output),
// stereo coupling without a pre-summed pair, state across blocks, tail on silence, bypass freeze,
// reset, determinism, stability and validation.
import test from "node:test";
import assert from "node:assert/strict";
import {
  Reverb,
  REVERB_CHARACTERS,
  REVERB_CHARACTER_ORDER,
  REVERB_ORDER,
  REVERB_WET_SCALE,
  REVERB_DECAY_MINIMUM_S,
  REVERB_FLOOR_RATE_HZ,
  reverbDecayMinimum,
  dampingCoefficient,
  dampingCutoff,
  normaliseReverbSettings,
} from "../src/lib/dsp/reverb.ts";
import { RATE, near, noise, processInChunks } from "./dsp-fixtures.mjs";

const TOLERANCE = 0.15;

function impulseReverb(settings, seconds, sampleRate = RATE, frames) {
  const length = frames ?? Math.round(seconds * sampleRate);
  const input = [new Float32Array(length), new Float32Array(length)];
  input[0][0] = 1;
  const out = [new Float32Array(length), new Float32Array(length)];
  new Reverb(settings, { channels: 2, sampleRate }).process(input, out, length);
  return out;
}

/** Broadband T30 by Schroeder backward integration over L²+R² (−5 … −35 dB). */
function t30(out, sampleRate = RATE) {
  const frames = out[0].length;
  const energy = new Float64Array(frames);
  let total = 0;
  for (let i = 0; i < frames; i++) {
    energy[i] = out[0][i] ** 2 + out[1][i] ** 2;
    total += energy[i];
  }
  assert.ok(total > 0, "the reverb produced no energy at all");
  const curve = new Float64Array(frames);
  let running = 0;
  for (let i = frames - 1; i >= 0; i--) {
    running += energy[i];
    curve[i] = 10 * Math.log10(Math.max(running / total, 1e-30));
  }
  let from = -1;
  let to = -1;
  for (let i = 0; i < frames; i++) {
    if (from < 0 && curve[i] <= -5) from = i;
    if (curve[i] <= -35) {
      to = i;
      break;
    }
  }
  assert.ok(from >= 0 && to > from, "the decay never crossed −5 … −35 dB in this render");
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  let count = 0;
  for (let i = from; i <= to; i++) {
    const x = i / sampleRate;
    sx += x;
    sy += curve[i];
    sxx += x * x;
    sxy += x * curve[i];
    count += 1;
  }
  const slope = (count * sxy - sx * sy) / (count * sxx - sx * sx);
  return -60 / slope;
}

function assertWithin(measured, target, label) {
  const error = measured / target - 1;
  assert.ok(
    Math.abs(error) <= TOLERANCE,
    `${label}: measured RT60 ${measured.toFixed(3)} s against a ${target} s target (${(error * 100).toFixed(1)} %), outside ±${TOLERANCE * 100} %`,
  );
}

function peakOf(signal) {
  let peak = 0;
  for (let i = 0; i < signal.length; i++) {
    const value = signal[i] < 0 ? -signal[i] : signal[i];
    if (value > peak) peak = value;
  }
  return peak;
}

function energyOf(signal) {
  let sum = 0;
  for (let i = 0; i < signal.length; i++) sum += signal[i] * signal[i];
  return sum;
}

function firstNonZero(signal) {
  for (let i = 0; i < signal.length; i++) if (signal[i] !== 0) return i;
  return -1;
}

function assertSameSamples(actual, expected, label) {
  assert.equal(actual.length, expected.length, `${label}: frame counts differ`);
  for (let i = 0; i < expected.length; i++) {
    if (actual[i] !== expected[i]) assert.fail(`${label}: frame ${i} is ${actual[i]}, expected ${expected[i]}`);
  }
}

test("DECAY is a broadband RT60 target at TONE FLAT, within ±15 % across the characters at 48 kHz", () => {
  for (const character of REVERB_CHARACTER_ORDER) {
    for (const decaySeconds of [0.5, 1.5, 4]) {
      const out = impulseReverb({ character, decaySeconds, preDelayMs: 0, tone: 0 }, decaySeconds * 2.5 + 1);
      assertWithin(t30(out), decaySeconds, `${character} @ 48 kHz, DECAY ${decaySeconds} s`);
    }
  }
  const long = impulseReverb({ character: "hall", decaySeconds: 10, preDelayMs: 0, tone: 0 }, 26);
  assertWithin(t30(long), 10, "hall @ 48 kHz, DECAY 10 s");
});

test("DECAY tracks the same way at 44.1 and 96 kHz", () => {
  for (const sampleRate of [44100, 96000]) {
    for (const [character, decaySeconds] of [
      ["hall", 0.5],
      ["plate", 4],
    ]) {
      const out = impulseReverb({ character, decaySeconds, preDelayMs: 0, tone: 0 }, decaySeconds * 2.5 + 1, sampleRate);
      assertWithin(t30(out, sampleRate), decaySeconds, `${character} @ ${sampleRate} Hz, DECAY ${decaySeconds} s`);
    }
  }
});

test("DECAY has a measured minimum per configuration and rate, not an invented one", () => {
  // The floor is the smallest value on the console's 0.1 s grid whose measured T30 stays
  // within ±15 % at that rate (report §5.2). Hall cannot make a short tail at all; Room's
  // fixed 5 kHz damping cutoff costs it 0.2 s at 96 kHz; Plate tracks 0.2 s everywhere.
  assert.deepEqual(REVERB_DECAY_MINIMUM_S.room, { at48k: 0.2, above48k: 0.3 });
  assert.deepEqual(REVERB_DECAY_MINIMUM_S.hall, { at48k: 0.4, above48k: 0.4 });
  assert.deepEqual(REVERB_DECAY_MINIMUM_S.plate, { at48k: 0.2, above48k: 0.2 });
  assert.equal(REVERB_FLOOR_RATE_HZ, 48000);
  for (const character of REVERB_CHARACTER_ORDER) {
    const low = reverbDecayMinimum(character, 44100);
    assert.equal(reverbDecayMinimum(character, 48000), low, `${character}: 44.1 and 48 kHz must share a floor`);
    assert.equal(reverbDecayMinimum(character, 96000), REVERB_DECAY_MINIMUM_S[character].above48k);
    // Never below the console's own minimum, never above its maximum.
    assert.ok(low >= 0.2 && low <= 10, `${character}: the floor ${low} s is outside DECAY's range`);
    // Above 48 kHz the floor is at least the measured 48 kHz one, never optimistic.
    assert.ok(reverbDecayMinimum(character, 96000) >= low, `${character}: the high-rate floor is more optimistic than the measured one`);
  }
  // The documented examples, exactly.
  assert.equal(reverbDecayMinimum("hall", 44100), 0.4);
  assert.equal(reverbDecayMinimum("room", 48000), 0.2);
  assert.equal(reverbDecayMinimum("room", 96000), 0.3);
  assert.equal(reverbDecayMinimum("plate", 96000), 0.2);
});

test("a request below the floor is raised to it, and the request stays visible", () => {
  const hall = new Reverb({ character: "hall", decaySeconds: 0.2, preDelayMs: 10, tone: 0 }, { channels: 2, sampleRate: 48000 });
  assert.equal(hall.requestedDecaySeconds, 0.2);
  assert.equal(hall.minimumDecaySeconds, 0.4);
  assert.equal(hall.settings.decaySeconds, 0.4, "Hall still promised a 0.2 s tail");
  // The tail follows the effective decay, not the request.
  assert.ok(near(hall.tailSeconds, 0.01 + 1.5 * 0.4, 1e-12), `Hall's tail is ${hall.tailSeconds} s`);

  const roomHigh = new Reverb({ character: "room", decaySeconds: 0.2, preDelayMs: 0, tone: 0 }, { channels: 2, sampleRate: 96000 });
  assert.equal(roomHigh.settings.decaySeconds, 0.3, "Room at 96 kHz still promised 0.2 s");
  assert.equal(roomHigh.requestedDecaySeconds, 0.2);

  // At the rates where the measurement holds, the request is untouched.
  for (const [character, sampleRate] of [
    ["room", 48000],
    ["room", 44100],
    ["plate", 96000],
    ["plate", 48000],
  ]) {
    const module = new Reverb({ character, decaySeconds: 0.2, preDelayMs: 0, tone: 0 }, { channels: 2, sampleRate });
    assert.equal(module.settings.decaySeconds, 0.2, `${character} at ${sampleRate} Hz was raised unnecessarily`);
    assert.equal(module.minimumDecaySeconds, 0.2);
  }
  // A request inside the range is never touched, and the floor does not creep with decay.
  const long = new Reverb({ character: "hall", decaySeconds: 10, preDelayMs: 0, tone: 0 }, { channels: 2, sampleRate: 96000 });
  assert.equal(long.settings.decaySeconds, 10);
  assert.equal(long.minimumDecaySeconds, 0.4);
});

test("the exposed minimum is attainable: the measured T30 sits inside ±15 % at every floor", () => {
  for (const sampleRate of [44100, 48000, 96000]) {
    for (const character of REVERB_CHARACTER_ORDER) {
      const floor = reverbDecayMinimum(character, sampleRate);
      const out = impulseReverb({ character, decaySeconds: floor, preDelayMs: 0, tone: 0 }, Math.max(4, floor * 3 + 1), sampleRate);
      assertWithin(t30(out, sampleRate), floor, `${character} at its ${floor} s floor, ${sampleRate} Hz`);
    }
  }
});

test("the effective TONE cutoff is exposed, including the sample-rate clamps", () => {
  const plate48 = new Reverb({ character: "plate", decaySeconds: 2, preDelayMs: 0, tone: 0 }, { channels: 2, sampleRate: 48000 });
  const plate96 = new Reverb({ character: "plate", decaySeconds: 2, preDelayMs: 0, tone: 0 }, { channels: 2, sampleRate: 96000 });
  const room48 = new Reverb({ character: "room", decaySeconds: 2, preDelayMs: 0, tone: 0 }, { channels: 2, sampleRate: 48000 });
  // FLAT is f0 where 4·f0 fits under 0.45·fs, and the clamped f_hi where it does not.
  assert.ok(near(room48.dampingHz, 5000, 1), `Room FLAT is ${room48.dampingHz} Hz`);
  assert.ok(near(plate48.dampingHz, Math.sqrt(1500 * 0.45 * 48000), 1), `Plate FLAT at 48 kHz is ${plate48.dampingHz} Hz, not the clamped value`);
  assert.ok(near(plate96.dampingHz, 6000, 1), `Plate FLAT at 96 kHz is ${plate96.dampingHz} Hz`);
  // The readout is the module's, so a UI can show the limit it actually applies.
  assert.equal(plate48.dampingHz, dampingCutoff(6000, 0, 48000));
  assert.ok(plate48.dampingHz < 6000, "the 48 kHz clamp was not exposed");
});

test("the characters differ structurally — spacing, diffusion and early reflections", () => {
  const room = REVERB_CHARACTERS.room;
  const hall = REVERB_CHARACTERS.hall;
  const plate = REVERB_CHARACTERS.plate;
  // Spacing: Hall is the largest space, Room the smallest, line by line.
  for (let k = 0; k < REVERB_ORDER; k++) {
    assert.ok(room.linesMs[k] < plate.linesMs[k], `line ${k}: Room is not tighter than Plate`);
    assert.ok(plate.linesMs[k] < hall.linesMs[k], `line ${k}: Plate is not tighter than Hall`);
  }
  // Buildup: a different number of diffusers and a different coefficient.
  assert.notEqual(room.diffusers.length, hall.diffusers.length);
  assert.notEqual(hall.diffusers.length, plate.diffusers.length);
  assert.notEqual(room.diffusers[0].gain, hall.diffusers[0].gain);
  // Early reflections: Room and Hall have them, Plate has none by design.
  assert.ok(room.early.length > 0);
  assert.ok(hall.early.length > 0);
  assert.equal(plate.early.length, 0);
  assert.notEqual(room.early.length, hall.early.length);
  // And the engine really follows the configuration: identical settings, different tails.
  const settings = { decaySeconds: 2, preDelayMs: 0, tone: 0 };
  const a = impulseReverb({ character: "room", ...settings }, 4);
  const b = impulseReverb({ character: "hall", ...settings }, 4);
  assert.ok(!near(a[0][2400], b[0][2400], 1e-6), "Room and Hall produce the same tail for the same settings");
});

test("the output is wet only: no dry path, no make-up gain, one fixed scale", () => {
  const out = impulseReverb({ character: "room", decaySeconds: 2, preDelayMs: 0, tone: 0 }, 1);
  // An impulse never reaches the output at unity: it enters the diffusers.
  assert.ok(Math.abs(out[0][0]) < 0.5, `the impulse passed through at ${out[0][0]}`);
  assert.equal(REVERB_WET_SCALE, 1);
  // Halving the input halves the output, sample for sample: nothing signal-dependent.
  const input = [noise(0.5, 0.3), noise(0.5, 0.3, 7)];
  const half = input.map((channel) => channel.map((value) => value * 0.5));
  const fullOut = [new Float32Array(input[0].length), new Float32Array(input[0].length)];
  const halfOut = [new Float32Array(input[0].length), new Float32Array(input[0].length)];
  const first = new Reverb({ character: "plate", decaySeconds: 1.5, preDelayMs: 0, tone: 3 }, { channels: 2, sampleRate: RATE });
  const second = new Reverb({ character: "plate", decaySeconds: 1.5, preDelayMs: 0, tone: 3 }, { channels: 2, sampleRate: RATE });
  first.process(input, fullOut, input[0].length);
  second.process(half, halfOut, input[0].length);
  for (let c = 0; c < 2; c++) {
    for (let i = 0; i < input[0].length; i += 97) {
      assert.ok(near(halfOut[c][i], fullOut[c][i] * 0.5, 1e-6), `channel ${c} frame ${i} is not linear in the input`);
    }
  }
});

test("PRE-DELAY shifts the whole wet signal by exactly round(ms·fs/1000), before the diffusers", () => {
  for (const [sampleRate, preDelayMs] of [
    [48000, 20],
    [44100, 20],
    [96000, 60],
  ]) {
    const shift = Math.round((preDelayMs * sampleRate) / 1000);
    const base = impulseReverb({ character: "hall", decaySeconds: 2, preDelayMs: 0, tone: 0 }, 0.5, sampleRate);
    const shifted = impulseReverb({ character: "hall", decaySeconds: 2, preDelayMs, tone: 0 }, 0.5, sampleRate);
    // Same network, same gain: the pre-delayed render IS the base render moved by `shift`.
    for (let n = shift; n < base[0].length; n++) {
      if (shifted[0][n] !== base[0][n - shift]) {
        assert.fail(`${sampleRate} Hz / ${preDelayMs} ms: frame ${n} is ${shifted[0][n]}, the base frame ${n - shift} is ${base[0][n - shift]}`);
      }
    }
    assert.equal(firstNonZero(shifted[0]), firstNonZero(base[0]) + shift, `${sampleRate} Hz / ${preDelayMs} ms: the onset did not move by the pre-delay`);
    // Nothing leaks through before the pre-delay has elapsed.
    for (let n = 0; n < shift; n++) {
      if (shifted[0][n] !== 0 || shifted[1][n] !== 0) assert.fail(`${sampleRate} Hz / ${preDelayMs} ms: audio at frame ${n}, before the pre-delay`);
    }
  }
  const none = impulseReverb({ character: "hall", decaySeconds: 2, preDelayMs: 0, tone: 0 }, 0.5);
  assert.ok(firstNonZero(none[0]) > 0, "with no pre-delay the diffusers and network still answer after their own delays");
});

test("TONE is damping inside the feedback paths: FLAT is a real filter, darker settings decay faster up high", () => {
  // The law: DC gain 1, cutoff geometric between f0/4 and min(0.45·fs, 4·f0).
  for (const sampleRate of [44100, 48000, 96000]) {
    for (const f0 of [4000, 5000, 6000]) {
      const low = f0 / 4;
      const high = Math.min(0.45 * sampleRate, 4 * f0);
      assert.ok(near(dampingCutoff(f0, -10, sampleRate), low, 1e-9));
      assert.ok(near(dampingCutoff(f0, 10, sampleRate), high, 1e-9));
      // FLAT is the geometric centre of the range, and a coefficient strictly below 1.
      assert.ok(near(dampingCutoff(f0, 0, sampleRate), Math.sqrt(low * high), 1e-9));
      assert.ok(dampingCoefficient(f0, 0, sampleRate) < 1 && dampingCoefficient(f0, 0, sampleRate) > 0);
      // Monotone in TONE: +10 is brighter (smaller coefficient ⇒ higher cutoff).
      assert.ok(dampingCoefficient(f0, 10, sampleRate) < dampingCoefficient(f0, 0, sampleRate));
      assert.ok(dampingCoefficient(f0, 0, sampleRate) < dampingCoefficient(f0, -10, sampleRate));
    }
  }
  // FLAT is not "unfiltered": the neutral cutoff is finite and inside the band.
  const flatHz = dampingCutoff(REVERB_CHARACTERS.room.toneHz, 0, RATE);
  assert.ok(flatHz > 0 && flatHz < RATE / 2, `FLAT selected ${flatHz} Hz`);
  // In the engine, −10 shortens the high-frequency tail and +10 lengthens it.
  const bright = impulseReverb({ character: "hall", decaySeconds: 3, preDelayMs: 0, tone: 10 }, 4);
  const dark = impulseReverb({ character: "hall", decaySeconds: 3, preDelayMs: 0, tone: -10 }, 4);
  const late = (out) => energyOf(out[0].subarray(48000, 96000)) + energyOf(out[1].subarray(48000, 96000));
  assert.ok(late(bright) > late(dark), "TONE +10 does not keep more late energy than −10");
  // And the damping is not on the output: the wet level at the onset is unaffected by TONE.
  assert.ok(near(peakOf(bright[0].subarray(0, 4800)), peakOf(dark[0].subarray(0, 4800)), 0.3 * peakOf(bright[0].subarray(0, 4800))));
});

test("stereo: both channels excite one coupled network, but never through a pre-summed pair", () => {
  const settings = { character: "plate", decaySeconds: 2, preDelayMs: 0, tone: 0 };
  const frames = 24000;
  const leftOnly = [new Float32Array(frames), new Float32Array(frames)];
  leftOnly[0][0] = 1;
  const rightOnly = [new Float32Array(frames), new Float32Array(frames)];
  rightOnly[1][0] = 1;
  const render = (input) => {
    const out = [new Float32Array(frames), new Float32Array(frames)];
    new Reverb(settings, { channels: 2, sampleRate: RATE }).process(input, out, frames);
    return out;
  };
  const fromLeft = render(leftOnly);
  const fromRight = render(rightOnly);
  // Coupled: an impulse on one side produces output on both sides (not a mono-compatibility claim).
  assert.ok(energyOf(fromLeft[1]) > 0, "the right channel stayed silent for a left-only impulse");
  assert.ok(energyOf(fromRight[0]) > 0, "the left channel stayed silent for a right-only impulse");
  // Distinct weightings: the two excitations are not the same response, and neither is
  // the mono-sum of the other.
  let difference = 0;
  for (let i = 0; i < frames; i++) difference += Math.abs(fromLeft[0][i] - fromRight[1][i]);
  assert.ok(difference > 1e-6, "left excitation through the left weighting matches right through the right — the pair was pre-summed");
  // Mono builds a working network of its own.
  const monoIn = [new Float32Array(frames)];
  monoIn[0][0] = 1;
  const monoOut = [new Float32Array(frames)];
  new Reverb(settings, { channels: 1, sampleRate: RATE }).process(monoIn, monoOut, frames);
  assert.ok(energyOf(monoOut[0]) > 0, "the mono build produced silence");
});

test("state survives blocks: chunked processing is sample-identical to one pass", () => {
  const frames = RATE;
  const input = [noise(1, 0.3), noise(1, 0.3, 11)];
  const settings = { character: "room", decaySeconds: 1.5, preDelayMs: 12, tone: -4 };
  const oneShot = [new Float32Array(frames), new Float32Array(frames)];
  new Reverb(settings, { channels: 2, sampleRate: RATE }).process(input, oneShot, frames);
  const chunked = processInChunks(new Reverb(settings, { channels: 2, sampleRate: RATE }), input, [1, 7, 64, 511]);
  assertSameSamples(chunked[0], oneShot[0], "left channel");
  assertSameSamples(chunked[1], oneShot[1], "right channel");
});

test("the tail continues on silence and decays, and tailSeconds covers it", () => {
  const module = new Reverb({ character: "hall", decaySeconds: 1, preDelayMs: 10, tone: 0 }, { channels: 2, sampleRate: RATE });
  const excitation = [new Float32Array(RATE / 2), new Float32Array(RATE / 2)];
  excitation[0][0] = 1;
  const first = [new Float32Array(RATE / 2), new Float32Array(RATE / 2)];
  module.process(excitation, first, RATE / 2);
  const quiet = [new Float32Array(RATE / 2), new Float32Array(RATE / 2)];
  const late = [new Float32Array(RATE / 2), new Float32Array(RATE / 2)];
  module.process(quiet, late, RATE / 2); // input silent from here on
  assert.ok(energyOf(late[0]) > 0, "the tail stopped dead when the input did");
  assert.ok(energyOf(late[0]) < energyOf(first[0]), "the tail did not decay");
  // The contract: pre-delay + 1.5 × DECAY, and no cutoff inside the module.
  assert.ok(near(module.tailSeconds, 0.01 + 1.5, 1e-12), `tailSeconds is ${module.tailSeconds}`);
  assert.equal(module.latencyFrames, 0);
  const dry = new Reverb({ character: "hall", decaySeconds: 1, preDelayMs: 10, tone: 0, bypassed: true }, { channels: 2, sampleRate: RATE });
  assert.equal(dry.tailSeconds, module.tailSeconds);
});

test("bypass writes silence, freezes the state and resumes the tail intact", () => {
  const settings = { character: "hall", decaySeconds: 2, preDelayMs: 0, tone: 0 };
  const frames = 4096;
  const reference = new Reverb(settings, { channels: 2, sampleRate: RATE });
  const bypassed = new Reverb(settings, { channels: 2, sampleRate: RATE });
  const excitation = [new Float32Array(frames), new Float32Array(frames)];
  excitation[0][0] = 1;
  const referenceFirst = [new Float32Array(frames), new Float32Array(frames)];
  const bypassedFirst = [new Float32Array(frames), new Float32Array(frames)];
  reference.process(excitation, referenceFirst, frames);
  bypassed.process(excitation, bypassedFirst, frames);
  assertSameSamples(bypassedFirst[0], referenceFirst[0], "first block, left");

  // The bypassed render: output silence, state untouched.
  const silent = new Reverb({ ...settings, bypassed: true }, { channels: 2, sampleRate: RATE });
  const silentFirst = [new Float32Array(frames), new Float32Array(frames)];
  silent.process(excitation, silentFirst, frames);
  assert.equal(peakOf(silentFirst[0]), 0, "a bypassed reverb wrote audio");
  const zero = [new Float32Array(frames), new Float32Array(frames)];
  const stillSilent = [new Float32Array(frames), new Float32Array(frames)];
  silent.process(zero, stillSilent, frames);
  assert.equal(peakOf(stillSilent[1]), 0, "a bypassed reverb wrote audio on a silent block");

  // Resume: same samples as the never-bypassed reference, then a frozen instance is identical.
  const resumed = [new Float32Array(frames), new Float32Array(frames)];
  reference.process(zero, resumed, frames);
  const frozenTail = [new Float32Array(frames), new Float32Array(frames)];
  bypassed.process(zero, frozenTail, frames);
  assertSameSamples(frozenTail[0], resumed[0], "the frozen tail is not the reference tail");
});

test("reset clears every line, diffuser, damping state, pre-delay and early history", () => {
  const settings = { character: "plate", decaySeconds: 2, preDelayMs: 5, tone: 2 };
  const module = new Reverb(settings, { channels: 2, sampleRate: RATE });
  const frames = 8160; // 0.17 s at 48 kHz, exactly the excitation length
  const excitation = [noise(0.17, 0.5), noise(0.17, 0.5, 3)];
  const scratch = [new Float32Array(frames), new Float32Array(frames)];
  module.process(excitation, scratch, frames);
  module.reset();
  const afterReset = [new Float32Array(frames), new Float32Array(frames)];
  module.process(excitation, afterReset, frames);
  const fresh = [new Float32Array(frames), new Float32Array(frames)];
  new Reverb(settings, { channels: 2, sampleRate: RATE }).process(excitation, fresh, frames);
  assertSameSamples(afterReset[0], fresh[0], "left after reset");
  assertSameSamples(afterReset[1], fresh[1], "right after reset");
});

test("deterministic: two identical instances produce identical samples", () => {
  const settings = { character: "room", decaySeconds: 2, preDelayMs: 30, tone: -6 };
  const input = [noise(0.5, 0.4), noise(0.5, 0.4, 29)];
  const a = [new Float32Array(input[0].length), new Float32Array(input[0].length)];
  const b = [new Float32Array(input[0].length), new Float32Array(input[0].length)];
  new Reverb(settings, { channels: 2, sampleRate: RATE }).process(input, a, input[0].length);
  new Reverb(settings, { channels: 2, sampleRate: RATE }).process(input, b, input[0].length);
  assertSameSamples(b[0], a[0], "left channel");
  assertSameSamples(b[1], a[1], "right channel");
});

test("stable at the extremes: the longest decay never grows, everything stays finite", () => {
  for (const character of REVERB_CHARACTER_ORDER) {
    const module = new Reverb({ character, decaySeconds: 10, preDelayMs: 200, tone: 10 }, { channels: 2, sampleRate: RATE });
    const burst = [noise(0.25, 0.9), noise(0.25, 0.9, 5)];
    const burstOut = [new Float32Array(burst[0].length), new Float32Array(burst[0].length)];
    module.process(burst, burstOut, burst[0].length);
    const quiet = [new Float32Array(RATE * 2), new Float32Array(RATE * 2)];
    const quietOut = [new Float32Array(RATE * 2), new Float32Array(RATE * 2)];
    module.process(quiet, quietOut, RATE * 2);
    const early = energyOf(quietOut[0].subarray(0, 24000));
    const late = energyOf(quietOut[0].subarray(RATE * 2 - 24000));
    assert.ok(Number.isFinite(peakOf(quietOut[0])), `${character}: output is not finite`);
    assert.ok(peakOf(quietOut[0]) < 1e3, `${character}: the tail grew instead of decaying`);
    assert.ok(late < early, `${character}: the tail is not shrinking`);
  }
});

test("validation: ranges, character, channels, bypass flag and buffer shapes are enforced", () => {
  const ok = { character: "room", decaySeconds: 1, preDelayMs: 0, tone: 0 };
  assert.deepEqual(normaliseReverbSettings(ok), { character: "room", decaySeconds: 1, preDelayMs: 0, tone: 0, bypassed: false });
  assert.equal(normaliseReverbSettings({ decaySeconds: 1, preDelayMs: 0, tone: 0 }).character, "room");
  assert.throws(() => normaliseReverbSettings({ ...ok, character: "cathedral" }), /character/);
  // Out-of-range values are CLAMPED to the documented range, as in Tasks 6.1 and 6.2;
  // only non-numbers are rejected.
  assert.equal(normaliseReverbSettings({ ...ok, decaySeconds: 0.1 }).decaySeconds, 0.2);
  assert.equal(normaliseReverbSettings({ ...ok, decaySeconds: 11 }).decaySeconds, 10);
  assert.equal(normaliseReverbSettings({ ...ok, preDelayMs: -1 }).preDelayMs, 0);
  assert.equal(normaliseReverbSettings({ ...ok, preDelayMs: 201 }).preDelayMs, 200);
  assert.equal(normaliseReverbSettings({ ...ok, tone: 11 }).tone, 10);
  assert.equal(normaliseReverbSettings({ ...ok, tone: -11 }).tone, -10);
  assert.throws(() => normaliseReverbSettings({ ...ok, tone: Number.NaN }), /tone/);
  assert.throws(() => normaliseReverbSettings({ ...ok, decaySeconds: "1" }), /decaySeconds/);
  assert.throws(() => normaliseReverbSettings({ ...ok, bypassed: "yes" }), /bypassed/);
  assert.throws(() => new Reverb(ok, { channels: 3 }), /channel count/);
  assert.throws(() => new Reverb(ok, { sampleRate: 0 }), /sample rate/);
  const module = new Reverb(ok, { channels: 2, sampleRate: RATE });
  const input = [new Float32Array(64), new Float32Array(64)];
  const output = [new Float32Array(64), new Float32Array(64)];
  assert.throws(() => module.process(input, [new Float32Array(64)], 64), /channel/i);
  assert.throws(() => module.process(input, output, 128), /frames|length/i);
  assert.throws(() => module.process([new Float32Array(8), new Float32Array(64)], output, 64), /length|frames/i);
});
