// Task 6.3 — the delay line, tested in isolation: integer timing at three rates, the first repeat
// at unity and unfiltered, feedback as the loop gain, TONE inside the loop only (never on the wet
// output), no dry path, stereo independence without cross-feedback, DC stability, the tail contract,
// bypass freeze, reset, state across blocks, determinism and validation.
import test from "node:test";
import assert from "node:assert/strict";
import {
  Delay,
  DELAY_TONE_HZ,
  DELAY_WET_SCALE,
  delayDampingCoefficient,
  delayDampingCutoff,
  delayRepeats,
  delayTailSeconds,
  feedbackGain,
  normaliseDelaySettings,
} from "../src/lib/dsp/delay.ts";
import { RATE, near, noise, processInChunks } from "./dsp-fixtures.mjs";

function render(settings, frames, sampleRate = RATE, fill) {
  const input = [new Float32Array(frames), new Float32Array(frames)];
  if (fill) fill(input);
  const out = [new Float32Array(frames), new Float32Array(frames)];
  const module = new Delay(settings, { channels: 2, sampleRate });
  module.process(input, out, frames);
  return out;
}

function peakAt(signal, at, halfWidth = 8) {
  let peak = 0;
  for (let i = Math.max(0, at - halfWidth); i <= Math.min(signal.length - 1, at + halfWidth); i++) {
    const value = signal[i] < 0 ? -signal[i] : signal[i];
    if (value > peak) peak = value;
  }
  return peak;
}

function peakOf(signal, from = 0, to = signal.length) {
  let peak = 0;
  for (let i = from; i < to; i++) {
    const value = signal[i] < 0 ? -signal[i] : signal[i];
    if (value > peak) peak = value;
  }
  return peak;
}

function energyOf(signal, from = 0, to = signal.length) {
  let sum = 0;
  for (let i = from; i < to; i++) sum += signal[i] * signal[i];
  return sum;
}

/** Energy above `hz`, by a one-pole high-pass difference — enough to compare brightness. */
function highEnergy(signal, from, to) {
  let sum = 0;
  let previous = 0;
  for (let i = from; i < to; i++) {
    const high = signal[i] - previous;
    previous = signal[i];
    sum += high * high;
  }
  return sum;
}

function assertSameSamples(actual, expected, label) {
  assert.equal(actual.length, expected.length, `${label}: frame counts differ`);
  for (let i = 0; i < expected.length; i++) {
    if (actual[i] !== expected[i]) assert.fail(`${label}: frame ${i} is ${actual[i]}, expected ${expected[i]}`);
  }
}

test("TIME is integer samples: round(ms·fs/1000), exact at 44.1, 48 and 96 kHz", () => {
  for (const sampleRate of [44100, 48000, 96000]) {
    for (const timeMs of [20, 137, 500, 2000]) {
      const module = new Delay({ timeMs, feedbackPercent: 0, tone: 0 }, { channels: 2, sampleRate });
      const expected = Math.round((timeMs * sampleRate) / 1000);
      assert.equal(module.delaySamples, expected, `${timeMs} ms at ${sampleRate} Hz`);
      // A single impulse comes back once, exactly `delaySamples` later, at unity.
      const frames = expected + 32;
      const out = render({ timeMs, feedbackPercent: 0, tone: 0 }, frames, sampleRate, (input) => {
        input[0][0] = 1;
        input[1][0] = 1;
      });
      assert.equal(peakAt(out[0], expected, 0), 1, `${timeMs} ms at ${sampleRate} Hz: first repeat is not at unity`);
      assert.equal(peakOf(out[0], 0, expected), 0, `${timeMs} ms at ${sampleRate} Hz: audio before the delay time`);
      assert.equal(peakOf(out[0], expected + 1), 0, `${timeMs} ms at ${sampleRate} Hz: a second repeat with no feedback`);
    }
  }
});

test("FEEDBACK is the loop gain: repeats at the same spacing, each no louder than g × the last", () => {
  for (const feedbackPercent of [20, 50, 90]) {
    const module = new Delay({ timeMs: 100, feedbackPercent, tone: 0 }, { channels: 2, sampleRate: RATE });
    const spacing = module.delaySamples;
    const repeats = 6;
    const out = render({ timeMs: 100, feedbackPercent, tone: 0 }, spacing * (repeats + 2), RATE, (input) => {
      input[0][0] = 1;
      input[1][0] = 1;
    });
    const amplitudes = [];
    for (let k = 1; k <= repeats; k++) amplitudes.push(peakAt(out[0], spacing * k));
    assert.ok(amplitudes[0] === 1, `feedback ${feedbackPercent} %: the first repeat is not the input`);
    const g = feedbackPercent / 100;
    for (let k = 1; k < amplitudes.length; k++) {
      assert.ok(amplitudes[k] > 0, `feedback ${feedbackPercent} %: repeat ${k + 1} vanished`);
      assert.ok(
        amplitudes[k] <= amplitudes[k - 1] * g + 1e-6,
        `feedback ${feedbackPercent} %: repeat ${k + 1} is ${amplitudes[k]}, louder than g × ${amplitudes[k - 1]}`,
      );
    }
    // One delay line, no extra taps: each repeat's peak sits exactly at its multiple of the
    // spacing. The in-loop one-pole smears each repeat, so the samples between peaks are not
    // silent — they are the smoothed skirt of the repeat before, and stay well below it.
    for (let k = 1; k <= repeats; k++) {
      const at = spacing * k;
      let windowPeak = 0;
      let windowPeakAt = -1;
      for (let n = at; n < spacing * (k + 1); n++) {
        const value = Math.abs(out[0][n]);
        if (value > windowPeak) {
          windowPeak = value;
          windowPeakAt = n;
        }
      }
      // The repeat begins at its multiple of the spacing; the in-loop one-pole only
      // shifts the peak a few samples into the window, never into the next one.
      assert.ok(windowPeakAt - at >= 0 && windowPeakAt - at < 16, `feedback ${feedbackPercent} %: repeat ${k} starts at ${windowPeakAt}, not ${at}`);
      assert.equal(windowPeak, amplitudes[k - 1], `feedback ${feedbackPercent} %: repeat ${k} peak changed`);
      // The samples between peaks are the smoothed skirt of the repeat before: lower than it.
      let skirt = 0;
      for (let n = at + 32; n < spacing * (k + 1) - 9; n++) skirt = Math.max(skirt, Math.abs(out[0][n]));
      assert.ok(skirt < windowPeak, `feedback ${feedbackPercent} %: the skirt after repeat ${k} is louder than the repeat`);
    }
  }
});

test("there is no dry path: the output is the line only, with one fixed scale", () => {
  const out = render({ timeMs: 250, feedbackPercent: 0, tone: 0 }, RATE, RATE, (input) => {
    input[0][0] = 0.7;
    input[1][0] = -0.7;
  });
  const at = Math.round((250 * RATE) / 1000);
  assert.equal(peakOf(out[0], 0, at), 0, "the input leaked through before the delay time");
  assert.ok(near(peakAt(out[0], at, 0), 0.7, 1e-6), "the repeat is not the input at unity");
  assert.ok(near(out[1][at], -0.7, 1e-6), `the right repeat is ${out[1][at]}, not the input at unity`);
  assert.equal(DELAY_WET_SCALE, 1);
});

test("stereo: the two channels are independent — no cross-feedback, no input summing", () => {
  const frames = RATE;
  const out = render({ timeMs: 100, feedbackPercent: 60, tone: 0 }, frames, RATE, (input) => {
    input[0][0] = 1; // left only
  });
  assert.equal(peakOf(out[1]), 0, "an impulse on the left appeared on the right");
  assert.ok(peakOf(out[0]) > 0, "the left channel produced nothing");

  // Different content per channel stays different, repeat by repeat.
  const both = render({ timeMs: 100, feedbackPercent: 50, tone: 0 }, frames, RATE, (input) => {
    input[0][0] = 1;
    input[1][0] = 0.25;
  });
  const spacing = Math.round((100 * RATE) / 1000);
  assert.ok(near(peakAt(both[0], spacing), 1, 1e-6));
  assert.ok(near(peakAt(both[1], spacing), 0.25, 1e-6), "the channels were summed");
  // Mono builds its own line.
  const monoIn = [new Float32Array(frames)];
  monoIn[0][0] = 1;
  const monoOut = [new Float32Array(frames)];
  new Delay({ timeMs: 100, feedbackPercent: 50, tone: 0 }, { channels: 1, sampleRate: RATE }).process(monoIn, monoOut, frames);
  assert.ok(near(peakAt(monoOut[0], spacing), 1, 1e-6));
});

test("TONE is inside the loop: it never touches the wet output, it darkens the repeats", () => {
  const spacing = Math.round((100 * RATE) / 1000);
  const frames = spacing * 7;
  const settings = (tone) => ({ timeMs: 100, feedbackPercent: 80, tone });
  const impulse = (input) => {
    input[0][0] = 1;
    input[1][0] = 1;
  };
  const dark = render(settings(-10), frames, RATE, impulse);
  const flat = render(settings(0), frames, RATE, impulse);
  const bright = render(settings(10), frames, RATE, impulse);
  // The first repeat is the input itself, bit-identical at every TONE setting: the
  // filter is in the return path, not on the output.
  assert.equal(peakAt(dark[0], spacing, 0), 1);
  assert.equal(peakAt(flat[0], spacing, 0), 1);
  assert.equal(peakAt(bright[0], spacing, 0), 1);
  // Later repeats are darker at −10 than at +10.
  assert.ok(highEnergy(bright[0], spacing * 4, spacing * 6) > highEnergy(dark[0], spacing * 4, spacing * 6), "TONE does not change how the repeats darken");
  // The law itself: geometric range, neutral at FLAT, monotone in TONE, DC gain 1.
  for (const sampleRate of [44100, 48000, 96000]) {
    const low = DELAY_TONE_HZ / 4;
    const high = Math.min(0.45 * sampleRate, 4 * DELAY_TONE_HZ);
    assert.ok(near(delayDampingCutoff(-10, sampleRate), low, 1e-9), `${sampleRate} Hz: TONE −10 is not ${low} Hz`);
    assert.ok(near(delayDampingCutoff(10, sampleRate), high, 1e-9), `${sampleRate} Hz: TONE +10 is not ${high} Hz`);
    assert.ok(near(delayDampingCutoff(0, sampleRate), Math.sqrt(low * high), 1e-9), `${sampleRate} Hz: FLAT is not the geometric centre`);
  }
  const coefficient = delayDampingCoefficient(0, RATE);
  assert.ok(coefficient > 0 && coefficient < 1, `the FLAT coefficient is ${coefficient}`);
  assert.ok(delayDampingCoefficient(10, RATE) < coefficient, "TONE +10 is not brighter than FLAT");
  assert.ok(delayDampingCoefficient(-10, RATE) > coefficient, "TONE −10 is not darker than FLAT");
});

test("the loop is stable: DC gain 1 with feedback under unity, bounded at 90 % over ten seconds", () => {
  const d = delayDampingCoefficient(0, RATE);
  assert.ok(d > 0 && d < 1, `the neutral damping coefficient is ${d}`);
  // A constant input accumulates as 1 / (1 − g); it must not run away.
  const steady = render({ timeMs: 20, feedbackPercent: 50, tone: 0 }, RATE, RATE, (input) => {
    input[0].fill(1);
    input[1].fill(1);
  });
  assert.ok(peakOf(steady[0]) <= 2.001, `a DC input reached ${peakOf(steady[0])}, above 1 / (1 − 0.5)`);
  const hot = render({ timeMs: 20, feedbackPercent: 90, tone: 10 }, RATE * 10, RATE, (input) => {
    input[0].set(noise(1, 0.9));
    input[1].set(noise(1, 0.9, 9));
  });
  const peak = peakOf(hot[0]);
  assert.ok(Number.isFinite(peak), "the loop produced a non-finite sample");
  assert.ok(peak <= 10.001, `90 % feedback reached ${peak}, above the 1 / (1 − 0.9) bound`);
  assert.ok(energyOf(hot[0], RATE * 8) < energyOf(hot[0], RATE), "the loop is not decaying after the input stops");
});

test("the tail contract: repeats × time, one repeat without feedback", () => {
  assert.equal(delayRepeats(0), 1);
  assert.equal(delayRepeats(0.5), 10);
  assert.equal(delayRepeats(0.9), 66);
  assert.throws(() => delayRepeats(-0.1), /non-negative/);
  assert.equal(feedbackGain(40), 0.4);
  assert.equal(delayTailSeconds(500, 40), (8 * 500) / 1000);
  for (const feedbackPercent of [0, 10, 40, 70, 90]) {
    const module = new Delay({ timeMs: 250, feedbackPercent, tone: 0 }, { channels: 2, sampleRate: RATE });
    assert.equal(module.repeats, delayRepeats(feedbackPercent / 100));
    assert.ok(near(module.tailSeconds, (module.repeats * 250) / 1000, 1e-12));
    assert.equal(module.latencyFrames, 0, "the delay reported a processing latency");
  }
  const shortTail = delayTailSeconds(250, 0);
  const longTail = delayTailSeconds(250, 90);
  assert.ok(shortTail < longTail, "the tail does not grow with feedback");
  // The contract counts the loop gain alone, so it is an UPPER BOUND: the in-loop one-pole
  // takes a further slice of every pass, and the measured −60 dB point arrives earlier.
  // 90 % at 250 ms promises 66 repeats; the tail really reaches −60 dB at about 38.
  const spacing = Math.round((250 * RATE) / 1000);
  const out = render({ timeMs: 250, feedbackPercent: 90, tone: 0 }, spacing * 72, RATE, (input) => {
    input[0][0] = 1;
    input[1][0] = 1;
  });
  let lastAudible = 0;
  for (let k = 1; k <= 72; k++) {
    if (peakAt(out[0], spacing * k, 32) > 1e-3) lastAudible = k;
    else if (k > 1) break;
  }
  assert.ok(lastAudible > 0, "the repeats stopped before −60 dB");
  assert.ok(
    lastAudible <= delayRepeats(0.9),
    `the measured tail (${lastAudible} repeats) is longer than the ${delayRepeats(0.9)}-repeat contract — the contract is not an upper bound`,
  );
  // Still audio at the last repeat the promise allows, small as it is.
  assert.ok(peakAt(out[0], spacing * delayRepeats(0.9), 32) > 0, "the module went silent before the end of its promised tail");
});

test("state survives blocks: chunked processing is sample-identical to one pass", () => {
  const input = [noise(1, 0.3), noise(1, 0.3, 13)];
  const settings = { timeMs: 37, feedbackPercent: 65, tone: -3 };
  const oneShot = [new Float32Array(RATE), new Float32Array(RATE)];
  new Delay(settings, { channels: 2, sampleRate: RATE }).process(input, oneShot, RATE);
  const chunked = processInChunks(new Delay(settings, { channels: 2, sampleRate: RATE }), input, [1, 5, 128, 1023]);
  assertSameSamples(chunked[0], oneShot[0], "left channel");
  assertSameSamples(chunked[1], oneShot[1], "right channel");
});

test("bypass writes silence, freezes the repeats and resumes the tail intact", () => {
  const settings = { timeMs: 100, feedbackPercent: 70, tone: 0 };
  const frames = Math.round((100 * RATE) / 1000) * 2;
  const excitation = [new Float32Array(frames), new Float32Array(frames)];
  excitation[0][0] = 1;
  excitation[1][0] = 1;
  const reference = new Delay(settings, { channels: 2, sampleRate: RATE });
  const bypassed = new Delay(settings, { channels: 2, sampleRate: RATE });
  const referenceFirst = [new Float32Array(frames), new Float32Array(frames)];
  const bypassedFirst = [new Float32Array(frames), new Float32Array(frames)];
  reference.process(excitation, referenceFirst, frames);
  bypassed.process(excitation, bypassedFirst, frames);
  assertSameSamples(bypassedFirst[0], referenceFirst[0], "first block, left");

  const silent = new Delay({ ...settings, bypassed: true }, { channels: 2, sampleRate: RATE });
  const silentFirst = [new Float32Array(frames), new Float32Array(frames)];
  silent.process(excitation, silentFirst, frames);
  assert.equal(peakOf(silentFirst[0]), 0, "a bypassed delay wrote audio");
  const zero = [new Float32Array(frames), new Float32Array(frames)];
  const silentSecond = [new Float32Array(frames), new Float32Array(frames)];
  silent.process(zero, silentSecond, frames);
  assert.equal(peakOf(silentSecond[1]), 0, "a bypassed delay wrote audio on a silent block");

  // Resume: the frozen instance continues exactly like the never-bypassed one.
  const resumed = [new Float32Array(frames), new Float32Array(frames)];
  reference.process(zero, resumed, frames);
  const frozen = [new Float32Array(frames), new Float32Array(frames)];
  bypassed.process(zero, frozen, frames);
  assertSameSamples(frozen[0], resumed[0], "the frozen repeats are not the reference repeats");
});

test("reset clears the lines and the filter state", () => {
  const settings = { timeMs: 60, feedbackPercent: 80, tone: -5 };
  const start = new Delay(settings, { channels: 2, sampleRate: RATE });
  const frames = 24000; // noise(0.5 s) at 48 kHz
  const excitation = [noise(0.5, 0.5), noise(0.5, 0.5, 17)];
  const scratch = [new Float32Array(frames), new Float32Array(frames)];
  start.process(excitation, scratch, frames);
  start.reset();
  const afterReset = [new Float32Array(frames), new Float32Array(frames)];
  start.process(excitation, afterReset, frames);
  const fresh = [new Float32Array(frames), new Float32Array(frames)];
  new Delay(settings, { channels: 2, sampleRate: RATE }).process(excitation, fresh, frames);
  assertSameSamples(afterReset[0], fresh[0], "left after reset");
  assertSameSamples(afterReset[1], fresh[1], "right after reset");
});

test("deterministic, and a new time is a new module with no inherited state", () => {
  const settings = { timeMs: 120, feedbackPercent: 45, tone: 4 };
  const input = [noise(0.5, 0.4), noise(0.5, 0.4, 23)];
  const a = [new Float32Array(input[0].length), new Float32Array(input[0].length)];
  const b = [new Float32Array(input[0].length), new Float32Array(input[0].length)];
  new Delay(settings, { channels: 2, sampleRate: RATE }).process(input, a, input[0].length);
  new Delay(settings, { channels: 2, sampleRate: RATE }).process(input, b, input[0].length);
  assertSameSamples(b[0], a[0], "left channel");
  assertSameSamples(b[1], a[1], "right channel");
  // There is no live Time control and no smoothing: a different time is a different module,
  // built empty, with its own exact integer delay.
  const longer = new Delay({ ...settings, timeMs: 300 }, { channels: 2, sampleRate: RATE });
  assert.equal(longer.delaySamples, Math.round((300 * RATE) / 1000));
  const quiet = [new Float32Array(64), new Float32Array(64)];
  const out = [new Float32Array(64), new Float32Array(64)];
  longer.process(quiet, out, 64);
  assert.equal(peakOf(out[0]), 0, "a freshly built module started with state");
});

test("validation: ranges clamp, non-numbers and buffer shapes are rejected", () => {
  assert.deepEqual(normaliseDelaySettings({ timeMs: 100, feedbackPercent: 0, tone: 0 }), {
    timeMs: 100,
    feedbackPercent: 0,
    tone: 0,
    bypassed: false,
  });
  assert.equal(normaliseDelaySettings({ timeMs: 10, feedbackPercent: 0, tone: 0 }).timeMs, 20);
  assert.equal(normaliseDelaySettings({ timeMs: 3000, feedbackPercent: 0, tone: 0 }).timeMs, 2000);
  assert.equal(normaliseDelaySettings({ timeMs: 100, feedbackPercent: -5, tone: 0 }).feedbackPercent, 0);
  assert.equal(normaliseDelaySettings({ timeMs: 100, feedbackPercent: 95, tone: 0 }).feedbackPercent, 90);
  assert.equal(normaliseDelaySettings({ timeMs: 100, feedbackPercent: 0, tone: 42 }).tone, 10);
  assert.throws(() => normaliseDelaySettings({ timeMs: "100", feedbackPercent: 0, tone: 0 }), /timeMs/);
  assert.throws(() => normaliseDelaySettings({ timeMs: 100, feedbackPercent: Number.NaN, tone: 0 }), /feedback/);
  assert.throws(() => normaliseDelaySettings({ timeMs: 100, feedbackPercent: 0, tone: Number.POSITIVE_INFINITY }), /tone/);
  assert.throws(() => normaliseDelaySettings({ timeMs: 100, feedbackPercent: 0, tone: 0, bypassed: 1 }), /bypassed/);
  assert.throws(() => new Delay({ timeMs: 100, feedbackPercent: 0, tone: 0 }, { channels: 4 }), /channel count/);
  assert.throws(() => new Delay({ timeMs: 100, feedbackPercent: 0, tone: 0 }, { sampleRate: -1 }), /sample rate/);
  const module = new Delay({ timeMs: 100, feedbackPercent: 0, tone: 0 }, { channels: 2, sampleRate: RATE });
  const input = [new Float32Array(64), new Float32Array(64)];
  const output = [new Float32Array(64), new Float32Array(64)];
  assert.throws(() => module.process(input, [new Float32Array(64)], 64), /channel/);
  assert.throws(() => module.process(input, output, 128), /frames/);
  assert.throws(() => module.process([new Float32Array(8), new Float32Array(64)], output, 64), /frames/);
  assert.ok(delayDampingCutoff(0, RATE) > 0 && delayDampingCutoff(0, RATE) < RATE / 2);
});
