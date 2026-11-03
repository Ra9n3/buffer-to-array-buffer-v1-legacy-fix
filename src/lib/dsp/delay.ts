/**
 * ALLOY — the Delay Return's engine (Task 6.3).
 *
 * The Delay Return of plan §8a (L401–413) and the console's controls
 * (D2.4.3). The plan defers the algorithm choice (§17 L775); the owner chose it
 * on 2026-11-03 and approved the numbers in
 * `task-reports/6.3-design-proposal.md`:
 *
 *   - a **single delay line per channel** — no cross-feedback, no ping-pong, no
 *     input summing. L and R are independent, so a signal on one channel never
 *     appears on the other;
 *   - TIME is an **integer number of samples**, `round(ms · fs / 1000)`. There is
 *     no fractional-sample interpolation and no claim that integer timing is
 *     universally artefact-free: a changed time is a changed integer delay;
 *   - FEEDBACK is a **linear gain in the loop**, `g = percent / 100`, applied to
 *     the delayed sample before it is written back: `write = in + LP(g · read)`.
 *     The FIRST repeat is therefore the input itself — unfiltered and at unity —
 *     and only the repeats that pass through the loop are filtered and scaled;
 *   - TONE is the same bipolar **damping** law as the reverb's, with a 6 kHz
 *     neutral cutoff, applied **inside the loop only**. It shapes how quickly
 *     the repeats darken; it is never a filter on the wet output. FLAT at 0 is a
 *     real one-pole (DC gain 1), not "unfiltered";
 *   - the output is **wet only**: no dry-through, no normalisation, no make-up
 *     gain, no saturation, no modulation.
 *
 * `Tape`, `Analog` and `Digital` are fixture labels in
 * `channel-strip/bus-return-fixtures.ts`. This module does not read them: there
 * is no tape emulation, no wow/flutter, no saturation and no mode switching
 * (owner, 2026-11-03).
 *
 * Time changes are **not** smoothed or crossfaded: the settings are read once,
 * at construction, and a different time is a different module. The report states
 * this as the current policy rather than implying a live control.
 */

import { defaultCount, requireBuffers } from "./buffers";
import {
  DELAY_FEEDBACK_PERCENT,
  DELAY_TIME_MS,
  DSP_SAMPLE_RATE,
  RETURN_TONE,
  requireBoolean,
  requireChannels,
  requireFinite,
  requireInRange,
  requireSampleRate,
  type DspOptions,
} from "./params";

/**
 * The one fixed output constant. Not a normalisation and not signal-dependent:
 * the wet level is the Return's fader (owner, 2026-11-03).
 */
export const DELAY_WET_SCALE = 1;

/** The Tone law's neutral (FLAT) cutoff for the delay loop, Hz — proposal §2.4. */
export const DELAY_TONE_HZ = 6000;

/**
 * The pitch of the tone law, shared with the reverb: a one-pole low-pass whose
 * cutoff is geometric between f0/4 and min(0.45·fs, 4·f0), placed in the loop.
 *
 *     f_lo = f0 / 4 · f_hi = min(0.45·fs, 4·f0)
 *     fc(tone) = f_lo · (f_hi / f_lo)^((tone + 10) / 20)
 *     d = e^(−2π·fc/fs) · y[n] = (1 − d)·x[n] + d·y[n − 1]   (DC gain 1)
 */
export function delayDampingCoefficient(tone: number, sampleRate: number): number {
  const low = DELAY_TONE_HZ / 4;
  const high = Math.min(0.45 * sampleRate, 4 * DELAY_TONE_HZ);
  const cutoff = low * (high / low) ** ((tone + 10) / 20);
  return Math.exp((-2 * Math.PI * cutoff) / sampleRate);
}

/** The cutoff the current TONE setting selects, Hz — a readout, not a control. */
export function delayDampingCutoff(tone: number, sampleRate: number): number {
  const low = DELAY_TONE_HZ / 4;
  const high = Math.min(0.45 * sampleRate, 4 * DELAY_TONE_HZ);
  return low * (high / low) ** ((tone + 10) / 20);
}

/** FEEDBACK percent → the loop's linear gain, 0 … 0.9. */
export function feedbackGain(percent: number): number {
  return requireInRange(requireFinite(percent, "feedback"), DELAY_FEEDBACK_PERCENT, "feedback") / 100;
}

/**
 * How many repeats it takes a `gain` loop to fall 60 dB: `ceil(60 / (−20·log10 g))`.
 * A loop with no feedback produces exactly one repeat — the input itself.
 */
export function delayRepeats(gain: number): number {
  if (!(gain >= 0)) throw new Error(`Alloy Delay: the loop gain must be non-negative, not ${String(gain)}`);
  if (gain === 0) return 1;
  return Math.ceil(60 / (-20 * Math.log10(gain)));
}

/** The tail the delay promises for a setting, seconds — `repeats × time`. */
export function delayTailSeconds(timeMs: number, percent: number): number {
  return (delayRepeats(percent / 100) * timeMs) / 1000;
}

export interface DelaySettings {
  /** DELAY TIME, ms — integer samples after rounding. */
  readonly timeMs: number;
  /** FEEDBACK, percent, 0 … 90. */
  readonly feedbackPercent: number;
  /** TONE / damping, −10 … +10 with FLAT at 0. */
  readonly tone: number;
  readonly bypassed?: boolean;
}

export interface NormalisedDelaySettings {
  readonly timeMs: number;
  readonly feedbackPercent: number;
  readonly tone: number;
  readonly bypassed: boolean;
}

export function normaliseDelaySettings(settings: DelaySettings): NormalisedDelaySettings {
  if (!settings || typeof settings !== "object") throw new Error("Alloy Delay: settings must be an object");
  return {
    timeMs: requireInRange(requireFinite(settings.timeMs, "timeMs"), DELAY_TIME_MS, "timeMs"),
    feedbackPercent: requireInRange(
      requireFinite(settings.feedbackPercent, "feedbackPercent"),
      DELAY_FEEDBACK_PERCENT,
      "feedbackPercent",
    ),
    tone: requireInRange(requireFinite(settings.tone, "tone"), RETURN_TONE, "tone"),
    bypassed: settings.bypassed === undefined ? false : requireBoolean(settings.bypassed, "bypassed"),
  };
}

/**
 * The delay. Sized in the constructor from the actual sample rate; `process`
 * allocates nothing, keeps every line and filter state across blocks, and writes
 * **wet only**.
 *
 * Bypassed, the output is silence, the incoming samples never enter the lines
 * and the state is frozen — un-bypassing resumes the repeats exactly where they
 * stopped (the same policy as the reverb, owner 2026-11-03).
 */
export class Delay {
  readonly settings: NormalisedDelaySettings;
  readonly sampleRate: number;
  readonly channels: 1 | 2;
  /** The delay time in whole samples — the module's exact timing. */
  readonly delaySamples: number;
  /** The loop's linear gain, 0 … 0.9. */
  readonly gain: number;
  /** The damping coefficient in the loop, computed once from TONE. */
  readonly damping: number;
  /** No processing latency: the delay time is effect timing, not look-ahead. */
  readonly latencyFrames = 0;

  private readonly buffers: Float64Array[];
  private readonly indices: number[];
  private readonly damped: Float64Array;

  constructor(settings: DelaySettings, options: DspOptions = {}) {
    this.sampleRate = requireSampleRate(options.sampleRate ?? DSP_SAMPLE_RATE);
    this.channels = requireChannels(options.channels ?? 2);
    this.settings = normaliseDelaySettings(settings);
    const rate = this.sampleRate;

    // Integer timing, exact: the line is exactly as long as the delay.
    this.delaySamples = Math.max(1, Math.round((this.settings.timeMs * rate) / 1000));
    this.gain = this.settings.feedbackPercent / 100;
    this.damping = delayDampingCoefficient(this.settings.tone, rate);

    this.buffers = [];
    this.indices = [];
    for (let c = 0; c < this.channels; c++) {
      this.buffers.push(new Float64Array(this.delaySamples));
      this.indices.push(0);
    }
    this.damped = new Float64Array(this.channels);
  }

  /** The cutoff the current TONE setting selects, Hz — a readout, not a control. */
  get dampingHz(): number {
    return delayDampingCutoff(this.settings.tone, this.sampleRate);
  }

  /** The number of repeats before the loop is 60 dB down. */
  get repeats(): number {
    return delayRepeats(this.gain);
  }

  /**
   * How long the module may still produce output after the input stops, in
   * seconds: `repeats × time`. No cutoff inside the module — Task 7.4 sizes its
   * tail from this number.
   */
  get tailSeconds(): number {
    return (this.repeats * this.settings.timeMs) / 1000;
  }

  process(input: readonly Float32Array[], output: readonly Float32Array[], count?: number): void {
    const frames = count === undefined ? defaultCount(input) : count;
    requireBuffers("Alloy Delay", this.channels, input, output, frames);

    const channels = this.channels;
    if (this.settings.bypassed) {
      for (let c = 0; c < channels; c++) output[c].fill(0, 0, frames);
      return;
    }

    const buffers = this.buffers;
    const indices = this.indices;
    const damped = this.damped;
    const damp = this.damping;
    const oneMinusDamp = 1 - damp;
    const gain = this.gain;
    const length = this.delaySamples;
    const scale = DELAY_WET_SCALE;

    for (let i = 0; i < frames; i++) {
      for (let c = 0; c < channels; c++) {
        const buffer = buffers[c];
        const at = indices[c];
        // The source sample first: `output` may be `input` (buffers.ts), and writing the
        // output before reading the input would feed the delay its own output.
        const source = input[c][i];
        // Read before write: the sample written last pass is exactly `length` ago.
        const read = buffer[at];
        // The output is the line itself, so the first repeat is the input,
        // unfiltered and at unity; only the loop path is damped and scaled.
        output[c][i] = scale * read;
        const filtered = oneMinusDamp * read + damp * damped[c];
        damped[c] = filtered;
        buffer[at] = source + gain * filtered;
        indices[c] = at + 1 === length ? 0 : at + 1;
      }
    }
  }

  /** Clear every line and every filter state. */
  reset(): void {
    for (let c = 0; c < this.channels; c++) {
      this.buffers[c].fill(0);
      this.indices[c] = 0;
    }
    this.damped.fill(0);
  }
}
