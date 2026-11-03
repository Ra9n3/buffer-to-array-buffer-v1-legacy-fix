/**
 * ALLOY — the Dynamic EQ (Task 6.1).
 *
 * The plan's processing chain, block 4 — "Dynamic EQ for time-varying
 * conflicts or tonal control" (§8) — and the rule the masking chapter gives
 * it: "if the conflict is intermittent, prefer a sidechain-triggered dynamic
 * EQ dip so the lower-priority track is only reduced when needed" (§8). One
 * module covers both of the intended uses:
 *
 *   SELF-DETECTION     no key is supplied: the band watches the signal
 *                      entering the module and dips itself when its own
 *                      band is loud enough;
 *   SIDECHAIN-TRIGGERED  a key is supplied: the band watches the KEY and
 *                      dips the channel being processed — the lower-priority
 *                      track yielding to the protected one. Which channel is
 *                      the key is Task 7.2 / 7.3's routing question, not this
 *                      module's.
 *
 * A band is an EQ band (the same three kinds, the same RBJ prototypes, the
 * same FREQ / GAIN / Q) that can travel DOWNWARD from its static GAIN by up
 * to `depthDb` — `dynamicDepthDb` is "how far (dB) the band's gain may be
 * pulled down" (mixer-chain.ts, D2.8.4). Nothing here boosts: the documents'
 * dynamic band only yields space.
 *
 * Detection and timing — the chain's documented dynamics specs (D2.8.3),
 * because no document fixes separate ones for this block (see params.ts):
 *
 *   THRESH   −40 … 0 dBFS   the band-limited key's level
 *   ATTACK   0.1 … 100 ms   how fast the detector follows a rise
 *   RELEASE  10 … 1000 ms   how fast it lets go
 *   DEPTH    0 … 15 dB      how far the band may be pulled, downward only
 *
 * The law is the owner's (2026-11-03): once the detector is at or above the
 * threshold the band takes its FULL depth, and returns to its static gain
 * when the detector falls below — attack and release shape the move, the
 * amount does not depend on how far over the threshold the signal is.
 *
 * Signal path, per band:
 *
 *   key (or input)
 *      → band-limited detector (bell: band-pass at FREQ/Q;
 *        shelves: low-/high-pass at the corner)
 *      → stereo-linked peak power = the loudest channel's squared sample
 *      → one-pole envelope in the power domain (attack / release)
 *      → the binary threshold test → a 0/1 target
 *      → a 2 ms slew on that indicator, so the gain never steps
 *      → gain = static GAIN − blend × depth, redesigned into the band's
 *        section whenever it has moved by 0.01 dB
 *      → the section filters the channel
 *
 * Consequences, all deliberate:
 *   - the detector reads the module's INPUT (or the key), never its own
 *     output, so a band cannot chase itself;
 *   - the detector is linked across channels — one transient on one side
 *     dips both, and the stereo image does not shift;
 *   - every channel keeps its own filter and detector state; the two
 *     channels see the same gain;
 *   - the detector, the envelope, the indicator and the loudest channel's
 *     peak all carry across `process` calls, so blocks of any length give
 *     the same samples as one pass — bit for bit;
 *   - nothing allocates in the processing path: the coefficients are
 *     written into the sections' own arrays, and the redesign only runs
 *     while the gain is actually moving.
 */

import { BiquadSection, isFilterKind, requireDesignFrequency, SHELF_Q, type FilterKind } from "./biquad";
import { copyChannels, defaultCount, requireBuffers, requireKeyBuffers } from "./buffers";
import {
  DSP_SAMPLE_RATE,
  DYNAMIC_ATTACK_MS,
  DYNAMIC_DEPTH_DB,
  DYNAMIC_RELEASE_MS,
  DYNAMIC_THRESHOLD_DB,
  EQ_FREQUENCY_HZ,
  EQ_GAIN_DB,
  EQ_MAX_BANDS,
  EQ_Q,
  requireChannels,
  requireInRange,
  requireSampleRate,
  type DspOptions,
} from "./params";

/**
 * The indicator's own slew, ms (provisional). The envelope has already
 * smoothed the LEVEL, but the threshold test is binary: without this the
 * gain would step by up to 15 dB at the crossing. 2 ms is short enough to
 * keep the documented attack meaningful and long enough that the step is a
 * ramp. A later listening task may move it.
 */
export const DETECTOR_SWITCH_SLEW_MS = 2;

/**
 * How far the gain may drift before the band is redesigned, dB
 * (provisional). 0.01 dB is far below audibility and keeps a steady band
 * from paying for trigonometry it does not need.
 */
export const GAIN_REDESIGN_STEP_DB = 0.01;

/* =========================================================================
   SETTINGS
   ========================================================================= */

/** One dynamic band: an EQ band plus its detector and its depth. */
export interface DynamicEqBandSetting {
  readonly kind: FilterKind;
  readonly freq: number;
  readonly gain: number;
  readonly q?: number;
  /** How far the band may be pulled below `gain`, dB — downward only. */
  readonly depthDb: number;
  /** The detector's threshold, dBFS of the band-limited key. */
  readonly thresholdDb: number;
  /** How fast the detector follows a rise, ms. */
  readonly attackMs: number;
  /** How fast the detector lets go, ms. */
  readonly releaseMs: number;
}

export interface DynamicEqSettings {
  readonly bypassed?: boolean;
  /** One to four bands, in processing order. */
  readonly bands: readonly DynamicEqBandSetting[];
}

/** A band after validation: finite, clamped, with the Q it will be built at. */
export interface NormalisedDynamicEqBand {
  readonly kind: FilterKind;
  readonly freq: number;
  readonly gain: number;
  readonly q: number;
  readonly depthDb: number;
  readonly thresholdDb: number;
  readonly attackMs: number;
  readonly releaseMs: number;
}

export interface NormalisedDynamicEqSettings {
  readonly bypassed: boolean;
  readonly bands: readonly NormalisedDynamicEqBand[];
}

function normaliseBand(
  band: DynamicEqBandSetting,
  index: number,
  sampleRate: number,
): NormalisedDynamicEqBand {
  const where = `band ${index + 1}`;
  if (!band || typeof band !== "object") throw new Error(`Alloy Dynamic EQ: ${where} must be a setting object`);
  if (!isFilterKind(band.kind)) {
    throw new Error(
      `Alloy Dynamic EQ: ${where}'s kind is bell, shelf-low or shelf-high, not ${String(band.kind)}`,
    );
  }
  const freq = requireInRange(band.freq, EQ_FREQUENCY_HZ, `${where}'s frequency`);
  requireDesignFrequency(freq, sampleRate, `${where}'s frequency`);
  const gain = requireInRange(band.gain, EQ_GAIN_DB, `${where}'s gain`);
  const q = band.kind === "bell" ? requireInRange(band.q ?? 1, EQ_Q, `${where}'s Q`) : SHELF_Q;
  return {
    kind: band.kind,
    freq,
    gain,
    q,
    depthDb: requireInRange(band.depthDb, DYNAMIC_DEPTH_DB, `${where}'s depth`),
    thresholdDb: requireInRange(band.thresholdDb, DYNAMIC_THRESHOLD_DB, `${where}'s threshold`),
    attackMs: requireInRange(band.attackMs, DYNAMIC_ATTACK_MS, `${where}'s attack`),
    releaseMs: requireInRange(band.releaseMs, DYNAMIC_RELEASE_MS, `${where}'s release`),
  };
}

/** Validates and clamps a dynamic setting; returns a new plain object. */
export function normaliseDynamicEqSettings(
  settings: DynamicEqSettings,
  sampleRate = DSP_SAMPLE_RATE,
): NormalisedDynamicEqSettings {
  const rate = requireSampleRate(sampleRate);
  if (!settings || typeof settings !== "object") throw new Error("Alloy Dynamic EQ: settings must be an object");
  const bands = settings.bands;
  if (!Array.isArray(bands) || bands.length < 1 || bands.length > EQ_MAX_BANDS) {
    const got = Array.isArray(bands) ? `${bands.length} bands` : String(bands);
    throw new Error(`Alloy Dynamic EQ: one to ${EQ_MAX_BANDS} bands, not ${got}`);
  }
  const bypassed = settings.bypassed ?? false;
  if (typeof bypassed !== "boolean") {
    throw new Error(`Alloy Dynamic EQ: bypassed is a boolean, not ${String(bypassed)}`);
  }
  return { bypassed, bands: bands.map((band, index) => normaliseBand(band, index, rate)) };
}

/* =========================================================================
   THE MODULE
   ========================================================================= */

/**
 * A frequency-selective, level-dependent EQ over one to four bands, mono or
 * stereo, with an optional key (sidechain) input.
 */
export class DynamicEq {
  /** The setting as validated and clamped. */
  readonly settings: NormalisedDynamicEqSettings;
  readonly channels: 1 | 2;
  readonly sampleRate: number;

  /** One filter per channel per band — the band at its current gain. */
  private readonly sections: BiquadSection[][];
  /** One band-limiting detector filter per channel per band. */
  private readonly detectors: BiquadSection[][];
  /** One-pole coefficients of the detector envelope, per band. */
  private readonly attack: Float64Array;
  private readonly release: Float64Array;
  /** The threshold as a power ratio, per band. */
  private readonly thresholds: Float64Array;
  /** The one slew the indicator moves at. */
  private readonly slew: number;

  /** Carried state, per band: the envelope, the indicator, the designed gain. */
  private readonly envelopes: Float64Array;
  private readonly blends: Float64Array;
  private readonly designed: Float64Array;
  private readonly reduction: Float64Array;

  constructor(settings: DynamicEqSettings, options: DspOptions = {}) {
    this.sampleRate = requireSampleRate(options.sampleRate ?? DSP_SAMPLE_RATE);
    this.channels = requireChannels(options.channels ?? 2);
    this.settings = normaliseDynamicEqSettings(settings, this.sampleRate);
    const count = this.settings.bands.length;
    const rate = this.sampleRate;

    this.sections = [];
    this.detectors = [];
    for (let c = 0; c < this.channels; c++) {
      const filters: BiquadSection[] = [];
      const bandLimits: BiquadSection[] = [];
      for (const band of this.settings.bands) {
        const section = new BiquadSection();
        section.setBand(band.kind, band.freq, band.gain, band.q, rate);
        filters.push(section);
        const detector = new BiquadSection();
        this.setDetector(detector, band);
        bandLimits.push(detector);
      }
      this.sections.push(filters);
      this.detectors.push(bandLimits);
    }

    this.attack = new Float64Array(count);
    this.release = new Float64Array(count);
    this.thresholds = new Float64Array(count);
    this.envelopes = new Float64Array(count);
    this.blends = new Float64Array(count);
    this.designed = new Float64Array(count);
    this.reduction = new Float64Array(count);
    for (let b = 0; b < count; b++) {
      const band = this.settings.bands[b];
      this.attack[b] = onePole(band.attackMs, rate);
      this.release[b] = onePole(band.releaseMs, rate);
      this.thresholds[b] = 10 ** (band.thresholdDb / 10);
      this.designed[b] = band.gain;
    }
    this.slew = onePole(DETECTOR_SWITCH_SLEW_MS, rate);
  }

  /** How many bands are in circuit. */
  get bandCount(): number {
    return this.settings.bands.length;
  }

  /**
   * The reduction each band is applying right now, dB (0 … depth). A live
   * reading, updated by `process`; the band's gain is `gain − this`.
   */
  get gainReductionDb(): Float64Array {
    return this.reduction;
  }

  /**
   * Processes `count` frames of every channel into `output` (the same
   * arrays are allowed). `key` is the optional sidechain: when present the
   * detector reads it, when absent the detector reads the module's input.
   */
  process(
    input: readonly Float32Array[],
    output: readonly Float32Array[],
    count = defaultCount(input),
    key?: readonly Float32Array[],
  ): void {
    requireBuffers("Alloy Dynamic EQ", this.channels, input, output, count);
    if (key !== undefined) requireKeyBuffers("Alloy Dynamic EQ", this.channels, key, count);
    copyChannels(this.channels, input, output, count);
    if (this.settings.bypassed || count === 0) return;

    const channels = this.channels;
    const detectorInput = key ?? input;
    const bands = this.settings.bands;
    for (let b = 0; b < bands.length; b++) {
      const band = bands[b];
      if (band.depthDb === 0) {
        // A band with no depth is a static band: no detector, no envelope.
        for (let c = 0; c < channels; c++) {
          const channel = output[c];
          this.sections[c][b].process(channel, channel, count);
        }
        this.reduction[b] = 0;
        continue;
      }

      const depth = band.depthDb;
      const staticGain = band.gain;
      const attack = this.attack[b];
      const release = this.release[b];
      const threshold = this.thresholds[b];
      let envelope = this.envelopes[b];
      let blend = this.blends[b];
      let designed = this.designed[b];

      for (let i = 0; i < count; i++) {
        // The loudest channel's squared band-limited sample: peak detection,
        // linked across the channels so the image cannot shift.
        let power = 0;
        for (let c = 0; c < channels; c++) {
          const filtered = this.detectors[c][b].step(detectorInput[c][i]);
          const squared = filtered * filtered;
          if (squared > power) power = squared;
        }
        envelope += (power - envelope) * (power > envelope ? attack : release);
        const target = envelope >= threshold ? 1 : 0;
        blend += (target - blend) * this.slew;
        const gain = staticGain - blend * depth;
        if (Math.abs(gain - designed) >= GAIN_REDESIGN_STEP_DB) {
          for (let c = 0; c < channels; c++) {
            this.sections[c][b].setBand(band.kind, band.freq, gain, band.q, this.sampleRate);
          }
          designed = gain;
        }
        for (let c = 0; c < channels; c++) {
          const channel = output[c];
          channel[i] = this.sections[c][b].step(channel[i]);
        }
      }

      this.envelopes[b] = envelope;
      this.blends[b] = blend;
      this.designed[b] = designed;
      this.reduction[b] = blend * depth;
    }
  }

  /** Clears every filter, envelope and indicator — a fresh module's silence. */
  reset(): void {
    for (const row of this.sections) for (const section of row) section.reset();
    for (const row of this.detectors) for (const section of row) section.reset();
    this.envelopes.fill(0);
    this.blends.fill(0);
    this.reduction.fill(0);
    for (let b = 0; b < this.settings.bands.length; b++) {
      const band = this.settings.bands[b];
      this.designed[b] = band.gain;
      for (let c = 0; c < this.channels; c++) {
        this.sections[c][b].setBand(band.kind, band.freq, band.gain, band.q, this.sampleRate);
      }
    }
  }

  /**
   * The response of the bands at this instant, dB — the gains the last
   * processed sample left behind, not a promise about the next one. 0 dB
   * while bypassed.
   */
  responseDbAt(freqHz: number): number {
    requireDesignFrequency(freqHz, this.sampleRate);
    if (this.settings.bypassed) return 0;
    let db = 0;
    for (const section of this.sections[0]) db += section.magnitudeDbAt(freqHz, this.sampleRate);
    return db;
  }

  /** The band-limiting filter of one band: a bell's band, a shelf's side. */
  private setDetector(detector: BiquadSection, band: NormalisedDynamicEqBand): void {
    switch (band.kind) {
      case "bell":
        detector.setBandPass(band.freq, band.q, this.sampleRate);
        return;
      case "shelf-low":
        detector.setLowPass(band.freq, SHELF_Q, this.sampleRate);
        return;
      case "shelf-high":
        detector.setHighPass(band.freq, SHELF_Q, this.sampleRate);
        return;
    }
  }
}

/** The one-pole coefficient for a time in ms: `1 − e^(−1/(τ·fs))`. */
function onePole(milliseconds: number, sampleRate: number): number {
  return 1 - Math.exp(-1 / (milliseconds * 0.001 * sampleRate));
}
