/**
 * ALLOY — the expander (Task 6.2).
 *
 * A smooth DOWNWARD expander for the chain's block 2 ("Cleanup / expander
 * where justified by the track and rules", plan §8). It is not a gate and
 * has no gate mode: quiet material is turned down by at most RANGE dB, as
 * smoothly as the curve says, and nothing is ever muted.
 *
 * Five controls, as the owner specified (2026-11-03):
 *   THRESHOLD  −60 … 0 dBFS, where the knee is centred;
 *   RATIO      1:1, 1.5:1, 2:1, 3:1, 4:1 (D2.8.3's printed list, cut at 4:1);
 *   ATTACK     ms — the OPENING time: how fast attenuation is removed when
 *              the level rises above the threshold (a one-pole, 63.2 %);
 *   RELEASE    ms — the CLOSING time: how fast attenuation is added when the
 *              level falls below the threshold (a one-pole, 63.2 %);
 *   RANGE      0 … 40 dB — the most it may pull a signal down.
 *
 * The ratio law, exactly (all in dB, all levels dBFS):
 *   below = threshold − env, clamped at 0 or above (above the threshold no
 *           attenuation is asked for and none is applied);
 *   reduction = min(RANGE, knee(below)) with
 *
 *     knee(below) = 0                                      below ≤ −3 dB
 *                 = (1 − 1/ratio) · (below + 3)² / 12      |below| < 3 dB  (6 dB knee)
 *                 = (1 − 1/ratio) · below                  below ≥ +3 dB
 *
 *   so the curve is continuous in value at both knee edges, neutral (exactly
 *   0 dB) at and above the threshold, and clamped at RANGE. Ratio 1:1 gives
 *   1 − 1/1 = 0 and so exactly 0 dB everywhere; RANGE 0 gives exactly 0 dB
 *   everywhere. Both are the module's neutral states — no hidden floor, no
 *   hidden hold.
 *
 * The knee is fixed at 6 dB and is PROVISIONAL (see report §3): no document
 * fixes an expander knee, and a fixed one keeps the five controls the owner
 * listed.
 *
 * Detection: the greater of |L| and |R| (peak, maximum-channel linking), one
 * shared gain applied equally to both channels. L and R are never summed and
 * the gain is never per-channel — with a correlated centre signal a summed
 * detector would under-read and a per-channel one would break the image.
 */

import { copyChannels, defaultCount, requireBuffers } from "./buffers";
import { dbToGain, EnvelopeFollower, expansionReduction, LevelDetector, magnitudeToDb, timeConstant } from "./dynamics";
import {
  DSP_SAMPLE_RATE,
  DYNAMICS_ATTACK_MS,
  DYNAMICS_RELEASE_MS,
  EXPANDER_RANGE_DB,
  EXPANDER_RATIO,
  EXPANDER_THRESHOLD_DB,
  requireBoolean,
  requireChannels,
  requireFinite,
  requireInRange,
  requireSampleRate,
  type DspOptions,
} from "./params";

/** The soft knee's full width, dB (PROVISIONAL; 6 dB, fixed). */
export const EXPANDER_KNEE_DB = 6;

export interface ExpanderSettings {
  readonly thresholdDb: number;
  readonly ratio: number;
  /** The opening time, ms. */
  readonly attackMs: number;
  /** The closing time, ms. */
  readonly releaseMs: number;
  /** How far a signal may be pulled down, dB. */
  readonly rangeDb: number;
  readonly bypassed?: boolean;
}

export interface NormalisedExpanderSettings {
  readonly thresholdDb: number;
  readonly ratio: number;
  readonly attackMs: number;
  readonly releaseMs: number;
  readonly rangeDb: number;
  readonly bypassed: boolean;
}

export function normaliseExpanderSettings(settings: ExpanderSettings): NormalisedExpanderSettings {
  if (!settings || typeof settings !== "object") throw new Error("Alloy Expander: settings must be an object");
  return {
    thresholdDb: requireInRange(requireFinite(settings.thresholdDb, "thresholdDb"), EXPANDER_THRESHOLD_DB, "thresholdDb"),
    ratio: requireInRange(requireFinite(settings.ratio, "ratio"), EXPANDER_RATIO, "ratio"),
    attackMs: requireInRange(requireFinite(settings.attackMs, "attackMs"), DYNAMICS_ATTACK_MS, "attackMs"),
    releaseMs: requireInRange(requireFinite(settings.releaseMs, "releaseMs"), DYNAMICS_RELEASE_MS, "releaseMs"),
    rangeDb: requireInRange(requireFinite(settings.rangeDb, "rangeDb"), EXPANDER_RANGE_DB, "rangeDb"),
    bypassed: settings.bypassed === undefined ? false : requireBoolean(settings.bypassed, "bypassed"),
  };
}

/**
 * The expander. Same contract as the other Task 6.2 modules: one block at a
 * time, state carried between them, nothing allocated per sample, and
 * `bypassed` copies instead of processing (state frozen, not reset).
 */
export class Expander {
  readonly settings: NormalisedExpanderSettings;
  readonly sampleRate: number;
  readonly channels: 1 | 2;

  private readonly detector: LevelDetector;
  private readonly envelope = new EnvelopeFollower();
  private readonly attack: number;
  private readonly release: number;
  private readonly amount: number;
  private reductionDb = 0;

  constructor(settings: ExpanderSettings, options: DspOptions = {}) {
    this.sampleRate = requireSampleRate(options.sampleRate ?? DSP_SAMPLE_RATE);
    this.channels = requireChannels(options.channels ?? 2);
    this.settings = normaliseExpanderSettings(settings);
    this.detector = new LevelDetector("peak", this.channels, this.sampleRate);
    this.attack = timeConstant(this.settings.attackMs, this.sampleRate);
    this.release = timeConstant(this.settings.releaseMs, this.sampleRate);
    this.amount = 1 - 1 / this.settings.ratio;
  }

  /** The attenuation applied at the last frame, dB ≥ 0 — the readout. */
  get gainReductionDb(): number {
    return this.reductionDb;
  }

  process(input: readonly Float32Array[], output: readonly Float32Array[], count?: number): void {
    const frames = count === undefined ? defaultCount(input) : count;
    requireBuffers("Alloy Expander", this.channels, input, output, frames);
    if (this.settings.bypassed) {
      copyChannels(this.channels, input, output, frames);
      return;
    }

    const detector = this.detector;
    const envelope = this.envelope;
    const attack = this.attack;
    const release = this.release;
    const threshold = this.settings.thresholdDb;
    const amount = this.amount;
    const range = this.settings.rangeDb;
    const channels = this.channels;

    let reduction = this.reductionDb;

    for (let i = 0; i < frames; i++) {
      const target = magnitudeToDb(detector.level(input, i));
      // Attack opens (level rising), release closes (level falling).
      const env = envelope.step(target, attack, release);
      reduction = expansionReduction(threshold - env, EXPANDER_KNEE_DB, amount, range);
      const gain = reduction === 0 ? 1 : dbToGain(-reduction);
      for (let c = 0; c < channels; c++) output[c][i] = input[c][i] * gain;
    }

    this.reductionDb = reduction;
  }

  reset(): void {
    this.detector.reset();
    this.envelope.reset();
    this.reductionDb = 0;
  }
}
