/**
 * ALLOY — the shared dynamics engine (Task 6.2).
 *
 * The compressor characters, the expander and the safety limiter are built
 * from these four pieces, so the three modules cannot drift apart in their
 * arithmetic, their conventions or their idea of a decibel:
 *
 *   LevelDetector      one level per frame from the channel set, linked by
 *                      the MAXIMUM channel (never a sum): each channel is
 *                      measured on its own — `peak` takes |x|, `rms` takes a
 *                      10 ms one-pole mean square — and the greater of the
 *                      two wins. That is the app's maximum-channel linking
 *                      convention (owner, 2026-11-03), separate from the
 *                      detector type: peak detection links peaks, RMS
 *                      detection links RMS, and an RMS character keeps its
 *                      RMS detector.
 *   EnvelopeFollower   a one-pole in the dB domain, attack when the level
 *                      rises and release when it falls. THE timing
 *                      convention of this task: the coefficient is
 *                      `1 − e^(−1/(τ·fs))`, so a step of level reaches
 *                      63.2 % (1 − 1/e) of its change after exactly τ —
 *                      which is what an ATTACK or RELEASE readout means,
 *                      in every module here, for every character.
 *   kneeReduction      the static transfer curve: a quadratic soft knee of a
 *                      given width, then a straight line whose slope is
 *                      `1 − 1/ratio`. Continuous in value at both knee
 *                      edges, and exactly zero at and above the knee's
 *                      upper edge — which is why a module at or below its
 *                      threshold passes its input through untouched.
 *   compressionReduction / expansionReduction
 *                      the two directions of that curve, with the
 *                      progressive ratio the FET and Vari-Mu characters add
 *                      and the RANGE clamp the expander needs.
 *
 * Domain notes, because "linear" alone means nothing:
 *   - levels are dBFS (20 log₁₀ of the magnitude); silence reads
 *     SILENCE_DB (−120 dBFS), never −∞, so an envelope can carry it;
 *   - envelopes are smoothed in dB, not in linear amplitude;
 *   - gains are applied in linear amplitude, `10^(dB/20)`.
 */

import { MAX_COMPRESSION_RATIO } from "./params";

/** The level a log of zero lands on: −120 dBFS. */
export const SILENCE_DB = -120;

/** The RMS characters' mean-square averaging, ms — PROVISIONAL (report 6.2). */
export const RMS_WINDOW_MS = 10;

/**
 * The over-threshold level at which a progressive character's RATIO readout
 * is exact, dB. Above it the ratio rises; at and below it the knob is the
 * ratio (see `compressionReduction`).
 */
export const RATIO_REFERENCE_DB = 10;

export type DetectorKind = "peak" | "rms";

/** The one-pole coefficient for a time constant in ms — the timing convention. */
export function timeConstant(milliseconds: number, sampleRate: number): number {
  return 1 - Math.exp(-1 / (milliseconds * 0.001 * sampleRate));
}

/** A magnitude as dBFS, floored at SILENCE_DB. */
export function magnitudeToDb(magnitude: number): number {
  if (!(magnitude > 0)) return SILENCE_DB;
  const db = 20 * Math.log10(magnitude);
  return db < SILENCE_DB ? SILENCE_DB : db;
}

/** dB to linear amplitude. `dbToGain(0)` is exactly 1, so unity is exact. */
export function dbToGain(db: number): number {
  return 10 ** (db / 20);
}

/**
 * The linked level detector. One level per frame, the greater channel's:
 * peak magnitude for `peak`, the greater channel's RMS for `rms`.
 */
export class LevelDetector {
  private readonly kind: DetectorKind;
  private readonly channels: number;
  private readonly meanSquares: Float64Array;
  private readonly coefficient: number;

  constructor(kind: DetectorKind, channels: number, sampleRate: number, rmsWindowMs = RMS_WINDOW_MS) {
    this.kind = kind;
    this.channels = channels;
    this.meanSquares = new Float64Array(channels);
    this.coefficient = timeConstant(rmsWindowMs, sampleRate);
  }

  /** The linked level of frame `index` — a magnitude, not a dB. */
  level(input: readonly Float32Array[], index: number): number {
    if (this.kind === "peak") {
      let magnitude = 0;
      for (let c = 0; c < this.channels; c++) {
        const sample = input[c][index];
        const value = sample < 0 ? -sample : sample;
        if (value > magnitude) magnitude = value;
      }
      return magnitude;
    }
    let power = 0;
    for (let c = 0; c < this.channels; c++) {
      const sample = input[c][index];
      const square = sample * sample;
      const mean = this.meanSquares[c] + (square - this.meanSquares[c]) * this.coefficient;
      this.meanSquares[c] = mean;
      if (mean > power) power = mean;
    }
    return Math.sqrt(power);
  }

  reset(): void {
    this.meanSquares.fill(0);
  }
}

/** The dB-domain envelope: attack on a rise, release on a fall. */
export class EnvelopeFollower {
  private envDb = SILENCE_DB;

  get value(): number {
    return this.envDb;
  }

  step(targetDb: number, attack: number, release: number): number {
    const coefficient = targetDb > this.envDb ? attack : release;
    this.envDb += (targetDb - this.envDb) * coefficient;
    return this.envDb;
  }

  reset(): void {
    this.envDb = SILENCE_DB;
  }
}

/**
 * The static curve shared by both directions: the reduction (dB, ≥ 0) for a
 * level `overDb` past the knee's centre, with a knee `kneeDb` wide and a
 * straight-line slope `amount` = 1 − 1/ratio.
 *
 *   overDb ≤ −knee/2         0 (the signal is below the knee: untouched)
 *   |overDb| < knee/2        amount · (overDb + knee/2)² / (2·knee)  — the knee
 *   overDb ≥ knee/2          amount · overDb                          — the line
 *
 * `kneeDb = 0` is a hard knee: zero below the threshold, the line above it.
 */
export function kneeReduction(overDb: number, kneeDb: number, amount: number): number {
  if (amount <= 0) return 0;
  if (kneeDb <= 0) return overDb > 0 ? amount * overDb : 0;
  const half = kneeDb / 2;
  if (overDb <= -half) return 0;
  if (overDb < half) {
    const x = overDb + half;
    return (amount * x * x) / (2 * kneeDb);
  }
  return amount * overDb;
}

/**
 * Compression: the knee curve plus, for the progressive characters, a ratio
 * that rises with drive.
 *
 * The law, in dB and in full: at and below RATIO_REFERENCE_DB (10 dB) over
 * the threshold the effective ratio IS the knob's, so the RATIO readout is
 * exact there and the knee is untouched. Above it, the effective ratio walks
 * from the knob toward `target` — the knob's distance above unity times the
 * character's factor, never past MAX_COMPRESSION_RATIO — covering half the
 * remaining distance after `spanDb` dB more drive:
 *
 *     r(over) = ratio + (target − ratio) · (over − 10) / ((over − 10) + span)
 *
 * The factor and the span are what keep the curve honest: they are chosen so
 * the reduction rises more slowly than the input (slope < 1) at every level,
 * which the monotonicity test checks — a curve that turned back would make a
 * louder input quieter, and no compressor may do that.
 *
 * Scaling the distance above unity, not the ratio itself, is what keeps 1:1
 * neutral for every character: a compressor told 1:1 compresses nothing, no
 * matter how hard it is driven. `target = ratio` (factor 1) is a pure static
 * ratio — that is the Opto character.
 */
export function effectiveRatio(ratio: number, overDb: number, factor: number, spanDb: number): number {
  const target = Math.min(MAX_COMPRESSION_RATIO, 1 + (ratio - 1) * factor);
  if (target <= ratio || spanDb <= 0) return ratio;
  const excess = overDb - RATIO_REFERENCE_DB;
  if (excess <= 0) return ratio;
  return ratio + (target - ratio) * (excess / (excess + spanDb));
}

/**
 * The reduction (dB, ≥ 0) for a level `overDb` past the threshold: the knee
 * curve with the knob's own ratio, plus — for the progressive characters,
 * above the reference — what the advancing ratio adds.
 *
 * The 20:1 bound applies to that addition, not to the knee: a soft knee
 * legitimately pulls down a little more than the straight line around the
 * threshold (it starts earlier), so clamping the total would flatten the very
 * shape the characters differ by. Above the reference the addition is
 * clamped so the total can never exceed 20:1, which caps how hard any band
 * can be squeezed.
 */
export function compressionReduction(overDb: number, kneeDb: number, ratio: number, factor: number, spanDb: number): number {
  if (ratio <= 1) return 0;
  const amount = 1 - 1 / ratio;
  const reduction = kneeReduction(overDb, kneeDb, amount);
  if (spanDb <= 0 || factor <= 1 || overDb <= RATIO_REFERENCE_DB) return reduction;
  const effective = effectiveRatio(ratio, overDb, factor, spanDb);
  const advanced = reduction + overDb * (1 - 1 / effective) - overDb * amount;
  const limit = overDb * (1 - 1 / MAX_COMPRESSION_RATIO);
  return advanced > limit ? limit : advanced;
}

/**
 * Downward expansion: the same knee curve measured *below* the threshold
 * (`belowDb` ≥ 0 when the signal is under it), clamped to `rangeDb` — how
 * far the module may pull a signal down. Ratio 1 or range 0 gives exactly 0,
 * which is the neutral state.
 */
export function expansionReduction(belowDb: number, kneeDb: number, amount: number, rangeDb: number): number {
  const reduction = kneeReduction(belowDb, kneeDb, amount);
  return reduction > rangeDb ? rangeDb : reduction;
}
