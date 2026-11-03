/**
 * ALLOY — the safety limiter (Task 6.2).
 *
 * The chain's output stage (plan §8, L371) is "safety checks and transparent
 * peak protection only", and §8 L397 says the limiter exists for the
 * accidental overs, not for loudness. This module is exactly that: a
 * sample-peak brickwall with lookahead that never lets a sample past
 * CEILING, never boosts, and does nothing at all when the signal is
 * already below the ceiling.
 *
 * Contract:
 *   - CEILING −12 … 0 dBFS, default −1 dBFS, a SAMPLE-PEAK ceiling. It is
 *     not a true-peak (dBTP) guarantee: between-sample peaks can exceed it
 *     and true-peak limiting is deferred (D5.2.6's 4× analyser is a
 *     measurement, not a limiter). The default is a safety margin for the
 *     accidental over — not a mastering-headroom policy, not a loudness
 *     target.
 *   - 5 ms LOOKAHEAD, converted from the actual sample rate and rounded to
 *     whole frames (`latencyFrames`), so the gain is already down when the
 *     loud sample arrives. That delay is the module's latency and it is
 *     reported, never hidden.
 *   - One stereo-linked gain envelope, driven by max(|L|, |R|) — the app's
 *     maximum-channel convention. Never the sum, never per-channel: a
 *     per-channel limiter would move the stereo image and a summed detector
 *     would over-limit a correlated centre.
 *   - RELEASE 10 … 1000 ms (default 50 ms), a one-pole in the linear-gain
 *     domain, measured to 63.2 % of the way back to unity. Release only ever
 *     moves the gain UP, and only where the lookahead has not scheduled a
 *     lower gain, so the release can never compromise the ceiling.
 *   - No make-up gain, no normalisation, no LUFS, no gain boost: `gain ≤ 1`
 *     at every frame.
 *
 * How the ceiling is kept exactly, in the linear domain: the peak is
 * measured on the sample as it arrives; if it exceeds the ceiling the module
 * needs `target = ceiling / peak` at the moment that sample is due out, i.e.
 * `latencyFrames` frames later, and it ramps the scheduled gain from the gain
 * it is applying now down to `target` across the lookahead. Every sample that
 * is still in flight therefore has a gain that already accounts for it. The
 * applied gain for a frame is `min(scheduled, release-recovered)`, so a
 * scheduled reduction always wins over a recovery.
 *
 * Latency compensation: the module cannot trim its own delay without
 * breaking the alignment it exists to provide (the first `latencyFrames`
 * frames of input are inside the delay line when the first block ends).
 * A renderer therefore (a) reads `latencyFrames` and drops that many leading
 * frames from the module's output, and (b) calls `flush` after the last block
 * to emit the tail that is still in the line, keeping the take's length
 * exactly equal to the source's. That is compensation by construction, not
 * the blind trimming of an arbitrary amount: both numbers come from the
 * module, and `flush` writes the real residual audio rather than zeros it.
 */

import { defaultCount, requireBuffers } from "./buffers";
import { dbToGain, magnitudeToDb } from "./dynamics";
import {
  DSP_SAMPLE_RATE,
  DYNAMICS_RELEASE_MS,
  LIMITER_CEILING_DB,
  requireBoolean,
  requireChannels,
  requireFinite,
  requireInRange,
  requireSampleRate,
  type DspOptions,
} from "./params";

/** The lookahead, ms — PROVISIONAL (the plan defers the peak-safety defaults, §17). */
export const LIMITER_LOOKAHEAD_MS = 5;
/** The default ceiling, dBFS. */
export const DEFAULT_LIMITER_CEILING_DB = -1;
/** The default release, ms. */
export const DEFAULT_LIMITER_RELEASE_MS = 50;

export interface LimiterSettings {
  /** Defaults to −1 dBFS. */
  readonly ceilingDb?: number;
  /** Defaults to 50 ms. */
  readonly releaseMs?: number;
  readonly bypassed?: boolean;
}

export interface NormalisedLimiterSettings {
  readonly ceilingDb: number;
  readonly releaseMs: number;
  readonly bypassed: boolean;
}

export function normaliseLimiterSettings(settings: LimiterSettings = {}): NormalisedLimiterSettings {
  if (!settings || typeof settings !== "object") throw new Error("Alloy Limiter: settings must be an object");
  const ceilingDb = settings.ceilingDb === undefined ? DEFAULT_LIMITER_CEILING_DB : settings.ceilingDb;
  const releaseMs = settings.releaseMs === undefined ? DEFAULT_LIMITER_RELEASE_MS : settings.releaseMs;
  return {
    ceilingDb: requireInRange(requireFinite(ceilingDb, "ceilingDb"), LIMITER_CEILING_DB, "ceilingDb"),
    releaseMs: requireInRange(requireFinite(releaseMs, "releaseMs"), DYNAMICS_RELEASE_MS, "releaseMs"),
    bypassed: settings.bypassed === undefined ? false : requireBoolean(settings.bypassed, "bypassed"),
  };
}

/**
 * The safety limiter.
 *
 * `process` is one block in, one block out, delayed by `latencyFrames`;
 * `flush` drains the tail after the last block. Bypassed, the module still
 * delays by `latencyFrames` and applies unity gain, so toggling bypass never
 * changes a render's alignment.
 */
export class SafetyLimiter {
  readonly settings: NormalisedLimiterSettings;
  readonly sampleRate: number;
  readonly channels: 1 | 2;
  /** The delay the module imposes, whole frames, from the actual sample rate. */
  readonly latencyFrames: number;

  private readonly ceiling: number;
  private readonly release: number;
  private readonly schedule: Float64Array;
  private readonly delay: Float64Array[];
  private index = 0;
  private gain = 1;
  private reductionDb = 0;

  constructor(settings: LimiterSettings = {}, options: DspOptions = {}) {
    this.sampleRate = requireSampleRate(options.sampleRate ?? DSP_SAMPLE_RATE);
    this.channels = requireChannels(options.channels ?? 2);
    this.settings = normaliseLimiterSettings(settings);
    this.latencyFrames = Math.max(1, Math.round(LIMITER_LOOKAHEAD_MS * 0.001 * this.sampleRate));
    this.ceiling = dbToGain(this.settings.ceilingDb);
    this.release = 1 - Math.exp(-1 / (this.settings.releaseMs * 0.001 * this.sampleRate));
    // The line is exactly `latencyFrames` long: a sample written now is read again after that
    // many frames, which is what `latencyFrames` promises the renderer.
    const ring = this.latencyFrames;
    this.schedule = new Float64Array(ring).fill(1);
    this.delay = [];
    for (let c = 0; c < this.channels; c++) this.delay.push(new Float64Array(ring));
  }

  /** The gain reduction applied at the last frame, dB ≥ 0 — the readout. */
  get gainReductionDb(): number {
    return this.reductionDb;
  }

  /** The ceiling as a linear amplitude, for callers that want to draw it. */
  get ceilingAmplitude(): number {
    return this.ceiling;
  }

  process(input: readonly Float32Array[], output: readonly Float32Array[], count?: number): void {
    const frames = count === undefined ? defaultCount(input) : count;
    requireBuffers("Alloy Safety Limiter", this.channels, input, output, frames);
    const channels = this.channels;
    const latency = this.latencyFrames;
    const ring = latency;
    const schedule = this.schedule;
    const delay = this.delay;

    if (this.settings.bypassed) {
      for (let i = 0; i < frames; i++) {
        const p = this.index;
        for (let c = 0; c < channels; c++) {
          const line = delay[c];
          output[c][i] = line[p];
          line[p] = input[c][i];
        }
        schedule[p] = 1;
        this.index = p + 1 === ring ? 0 : p + 1;
      }
      this.gain = 1;
      this.reductionDb = 0;
      return;
    }

    const ceiling = this.ceiling;
    const release = this.release;
    let gain = this.gain;

    for (let i = 0; i < frames; i++) {
      const p = this.index;

      // Detection: the greater channel's magnitude, never the sum.
      let peak = 0;
      for (let c = 0; c < channels; c++) {
        const sample = input[c][i];
        const value = sample < 0 ? -sample : sample;
        if (value > peak) peak = value;
      }

      // Apply: a scheduled reduction wins over a release recovery.
      const recovered = gain + (1 - gain) * release;
      const scheduled = schedule[p];
      const applied = scheduled < recovered ? scheduled : recovered;

      for (let c = 0; c < channels; c++) {
        const line = delay[c];
        output[c][i] = line[p] * applied;
        line[p] = input[c][i];
      }

      // This frame's plan is spent; the sample that just arrived takes its place and is due
      // out `latency` frames from now — the same slot, so it must be re-planned immediately.
      schedule[p] = 1;
      const target = peak > ceiling ? ceiling / peak : 1;
      if (target < 1) {
        // Ramp the plan from the gain being applied now down to the target across the
        // lookahead: every sample still in the line then has a gain that already accounts for
        // this one. Only ever lowers an entry, so an earlier, tighter plan always wins.
        for (let k = 1; k <= latency; k++) {
          const at = p + k >= ring ? p + k - ring : p + k;
          const value = applied + (target - applied) * (k / latency);
          if (value < schedule[at]) schedule[at] = value;
        }
      }

      gain = applied;
      this.index = p + 1 === ring ? 0 : p + 1;
    }

    this.gain = gain;
    this.reductionDb = gain >= 1 ? 0 : -magnitudeToDb(gain);
  }

  /**
   * Drain the tail: the `count` frames still inside the delay line, limited
   * by the same schedule and release. Call once, after the last block, into a
   * `count`-frame buffer; `count` defaults to `latencyFrames`, which is what
   * keeps a take's length equal to its source's.
   */
  flush(output: readonly Float32Array[], count = this.latencyFrames): void {
    // The same boundary check `process` uses; `flush` has no separate input.
    requireBuffers("Alloy Safety Limiter", this.channels, output, output, count);
    const channels = this.channels;
    const ring = this.latencyFrames;
    const schedule = this.schedule;
    const delay = this.delay;
    const bypassed = this.settings.bypassed;
    let gain = this.gain;

    for (let i = 0; i < count; i++) {
      const p = this.index;
      const recovered = gain + (1 - gain) * this.release;
      const scheduled = schedule[p];
      const applied = bypassed ? 1 : scheduled < recovered ? scheduled : recovered;
      for (let c = 0; c < channels; c++) {
        const line = delay[c];
        output[c][i] = line[p] * applied;
        line[p] = 0;
      }
      schedule[p] = 1;
      gain = applied;
      this.index = p + 1 === ring ? 0 : p + 1;
    }

    this.gain = gain;
    this.reductionDb = gain >= 1 ? 0 : -magnitudeToDb(gain);
  }

  /** Clear the delay line, the schedule and the gain. */
  reset(): void {
    this.schedule.fill(1);
    for (let c = 0; c < this.channels; c++) this.delay[c].fill(0);
    this.index = 0;
    this.gain = 1;
    this.reductionDb = 0;
  }
}
