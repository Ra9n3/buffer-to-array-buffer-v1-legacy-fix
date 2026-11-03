/**
 * ALLOY — the Custom EQ, static multiband (Task 6.1).
 *
 * The plan's processing chain, block 3 — "static multiband EQ" (§8) — as an
 * isolated DSP module: the documented four bands (D2.8.4)
 *
 *   LF  low shelf      FREQ · GAIN
 *   LMF low-mid bell   FREQ · GAIN · Q
 *   HMF high-mid bell  FREQ · GAIN · Q
 *   HF  high shelf     FREQ · GAIN
 *
 * each an RBJ prototype at the session rate (`biquad.ts`), the same maths
 * the Mixer's response graph draws from, so the curve and the filter agree.
 *
 * The module is deliberately narrow:
 *   - it processes audio and nothing else — no channel, no routing, no
 *     project state, no UI, no analysis, no masking;
 *   - a band is a plain setting; a band that carries the dynamic block (4)
 *     is the OTHER module's (`dynamic-eq.ts`), so no band is ever filtered
 *     twice;
 *   - settings are fixed when the module is built (a render snapshots the
 *     chain, plan §10), which is what makes the output deterministic;
 *   - every channel has its own filter state and the same coefficients, so
 *     stereo is processed consistently and independently — an effect on
 *     one side never leaks into the other;
 *   - 0 dB is exactly the identity and a bypassed EQ copies its input, so a
 *     neutral setting is bit-for-bit transparent;
 *   - nothing allocates in the processing path.
 *
 * Parameter rules (the project's, `params.ts`): a non-finite value throws; a
 * finite one outside the documented range is clamped, as the console's
 * controls clamp; an unknown kind, an empty or over-long band list, a bad
 * channel count or a frequency at or above Nyquist throws.
 */

import { BiquadSection, isFilterKind, requireDesignFrequency, SHELF_Q, type FilterKind } from "./biquad";
import { copyChannels, defaultCount, requireBuffers } from "./buffers";
import {
  DSP_SAMPLE_RATE,
  EQ_FREQUENCY_HZ,
  EQ_GAIN_DB,
  EQ_MAX_BANDS,
  EQ_Q,
  requireChannels,
  requireInRange,
  requireSampleRate,
  type DspOptions,
} from "./params";

/* =========================================================================
   THE DOCUMENTED BANDS
   The four the console has (D2.8.4): one low shelf, two bells, one high
   shelf. The ids and kinds are the project's — `mixer-chain.ts` uses the
   same three kind strings, so a setting read from the Mixer is structurally
   this module's setting, with no import in either direction.
   ========================================================================= */

export const EQ_BAND_IDS = ["lf", "lmf", "hmf", "hf"] as const;
export type EqBandId = (typeof EQ_BAND_IDS)[number];

/** Which kind of band each console position is. */
export const EQ_BAND_KINDS: Readonly<Record<EqBandId, FilterKind>> = {
  lf: "shelf-low",
  lmf: "bell",
  hmf: "bell",
  hf: "shelf-high",
};

/* =========================================================================
   SETTINGS
   ========================================================================= */

/** One band's controls. `q` is the bell's; a shelf ignores it (see `q` below). */
export interface EqBandSetting {
  readonly kind: FilterKind;
  readonly freq: number;
  readonly gain: number;
  readonly q?: number;
}

export interface EqSettings {
  readonly bypassed?: boolean;
  /** One to four bands, in processing order. */
  readonly bands: readonly EqBandSetting[];
}

/** A band after validation: finite, clamped, with the Q it will be built at. */
export interface NormalisedEqBand {
  readonly kind: FilterKind;
  readonly freq: number;
  readonly gain: number;
  /** The bell's Q; for a shelf, the fixed Q of its slope-1 prototype. */
  readonly q: number;
}

export interface NormalisedEqSettings {
  readonly bypassed: boolean;
  readonly bands: readonly NormalisedEqBand[];
}

function normaliseBand(band: EqBandSetting, index: number, sampleRate: number): NormalisedEqBand {
  const where = `band ${index + 1}`;
  if (!band || typeof band !== "object") throw new Error(`Alloy EQ: ${where} must be a setting object`);
  if (!isFilterKind(band.kind)) {
    throw new Error(`Alloy EQ: ${where}'s kind is bell, shelf-low or shelf-high, not ${String(band.kind)}`);
  }
  const freq = requireInRange(band.freq, EQ_FREQUENCY_HZ, `${where}'s frequency`);
  requireDesignFrequency(freq, sampleRate, `${where}'s frequency`);
  const gain = requireInRange(band.gain, EQ_GAIN_DB, `${where}'s gain`);
  const q = band.kind === "bell" ? requireInRange(band.q ?? 1, EQ_Q, `${where}'s Q`) : SHELF_Q;
  return { kind: band.kind, freq, gain, q };
}

/**
 * Validates and clamps a setting. Returns a new, plain object — the module
 * never keeps the caller's — so what a module will do can be printed before
 * it is built.
 */
export function normaliseEqSettings(settings: EqSettings, sampleRate = DSP_SAMPLE_RATE): NormalisedEqSettings {
  const rate = requireSampleRate(sampleRate);
  if (!settings || typeof settings !== "object") throw new Error("Alloy EQ: settings must be an object");
  const bands = settings.bands;
  if (!Array.isArray(bands) || bands.length < 1 || bands.length > EQ_MAX_BANDS) {
    const got = Array.isArray(bands) ? `${bands.length} bands` : String(bands);
    throw new Error(`Alloy EQ: one to ${EQ_MAX_BANDS} bands, not ${got}`);
  }
  const bypassed = settings.bypassed ?? false;
  if (typeof bypassed !== "boolean") {
    throw new Error(`Alloy EQ: bypassed is a boolean, not ${String(bypassed)}`);
  }
  return { bypassed, bands: bands.map((band, index) => normaliseBand(band, index, rate)) };
}

/**
 * The four documented bands at 0 dB — exactly flat at every frequency, so
 * it is the module's "switched in but doing nothing" state. The frequencies
 * are placeholders: a 0 dB band has no shape to place.
 */
export function neutralEqSettings(): EqSettings {
  return {
    bypassed: false,
    bands: EQ_BAND_IDS.map((id) => ({ kind: EQ_BAND_KINDS[id], freq: 1000, gain: 0, q: 1 })),
  };
}

/* =========================================================================
   THE MODULE
   ========================================================================= */

/**
 * A static multiband EQ over one to four bands, mono or stereo.
 *
 * Build it with the settings a render snapshot gave; feed it blocks of any
 * length. The filter state carries across blocks, so the whole stem and
 * bounded chunks of it produce the same samples (bit for bit).
 */
export class Eq {
  /** The setting as validated and clamped. */
  readonly settings: NormalisedEqSettings;
  readonly channels: 1 | 2;
  readonly sampleRate: number;
  /** One section per channel per band, built once — never in the loop. */
  private readonly sections: BiquadSection[][];

  constructor(settings: EqSettings, options: DspOptions = {}) {
    this.sampleRate = requireSampleRate(options.sampleRate ?? DSP_SAMPLE_RATE);
    this.channels = requireChannels(options.channels ?? 2);
    this.settings = normaliseEqSettings(settings, this.sampleRate);
    const rows: BiquadSection[][] = [];
    for (let c = 0; c < this.channels; c++) {
      const row: BiquadSection[] = [];
      for (const band of this.settings.bands) {
        const section = new BiquadSection();
        section.setBand(band.kind, band.freq, band.gain, band.q, this.sampleRate);
        row.push(section);
      }
      rows.push(row);
    }
    this.sections = rows;
  }

  /** How many bands are in circuit. */
  get bandCount(): number {
    return this.settings.bands.length;
  }

  /**
   * Processes `count` frames of every channel into `output` (the same
   * arrays are allowed). Bypassed, it copies; neutral, it copies through
   * the identity sections, which are exact.
   */
  process(input: readonly Float32Array[], output: readonly Float32Array[], count = defaultCount(input)): void {
    requireBuffers("Alloy EQ", this.channels, input, output, count);
    copyChannels(this.channels, input, output, count);
    if (this.settings.bypassed || count === 0) return;
    for (let b = 0; b < this.settings.bands.length; b++) {
      for (let c = 0; c < this.channels; c++) {
        const channel = output[c];
        this.sections[c][b].process(channel, channel, count);
      }
    }
  }

  /** Clears every filter's state — a fresh module's silence. */
  reset(): void {
    for (const row of this.sections) for (const section of row) section.reset();
  }

  /**
   * The response of the settings at a frequency, dB: the sum of the bands'
   * magnitudes, the way the Mixer's graph sums them. Settings drawn, never
   * a signal measured; 0 dB while bypassed.
   */
  responseDbAt(freqHz: number): number {
    requireDesignFrequency(freqHz, this.sampleRate);
    if (this.settings.bypassed) return 0;
    let db = 0;
    for (const section of this.sections[0]) db += section.magnitudeDbAt(freqHz, this.sampleRate);
    return db;
  }
}
