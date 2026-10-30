/**
 * ALLOY Console meter bridge — SIMULATED fixture data (Task 2.1).
 *
 * Everything in this file is a typed-in number. Nothing here is measured:
 * there is no audio, no analysis, no FFT, no correlation algorithm and no
 * shared project state behind any of it. The values exist so the skinned
 * bridge can be reviewed with varied readings instead of a row of needles
 * resting on their left stops. Plan §14 schedules the real wiring: the
 * project model in Phase 3, analysis in 5.2, playback metering in 8.1 —
 * when those tasks arrive this file is deleted, not extended.
 */

import { LED_LADDER_SCALE, type LedSegment } from "../hardware/LedLadder.svelte";

/** Marks this and every derived DOM hook so a reviewer can tell at a glance. */
export const SIMULATED = "simulated" as const;

/* --- master stereo meters ----------------------------------------------- */

/** Master left / right readings, in dB VU (the VU face runs −20 … +3). Independent on purpose. */
export const MASTER_FIXTURE = {
  left: -3.2,
  right: -1.4,
} as const;

/* --- channel meters for the current bank --------------------------------- */

export interface ChannelMeterFixture {
  /** The compact engraved identifier, matching the bank's two-digit track codes. */
  readonly id: string;
  /** dB VU. */
  readonly level: number;
}

/**
 * Eight channels (owner's choice for the fixture bank; the real bank size is
 * a deferred plan decision). Varied on purpose: one in the red, one near
 * silence, the rest spread across the face.
 */
export const BANK_FIXTURE: readonly ChannelMeterFixture[] = [
  { id: "01", level: -7.5 },
  { id: "02", level: -2 },
  { id: "03", level: 1 },
  { id: "04", level: -12 },
  { id: "05", level: -4.5 },
  { id: "06", level: -18 },
  { id: "07", level: -0.5 },
  { id: "08", level: -9 },
];

/* --- spectrum ladder ----------------------------------------------------- */

export interface SpectrumBandFixture {
  /** Band centre, Hz. */
  readonly hz: number;
  /** The concise engraved print under the column. */
  readonly label: string;
  /** dB on the ladder's scale. */
  readonly level: number;
}

/**
 * Fifteen representative bands: every other ISO 1/3-octave centre from 25 Hz
 * to 16 kHz (the R10 preferred numbers), printed the way hardware analysers
 * print them ("1k6", "2k5", "6k3" — three characters, no decimal point). The
 * levels sketch a typical full-mix shape — strongest in the low end, falling
 * toward the top — with the 63/100/160 Hz columns reaching amber and 100 Hz
 * touching red, so the green → amber → red progression is visible on the
 * fixture.
 */
export const SPECTRUM_FIXTURE: readonly SpectrumBandFixture[] = [
  { hz: 25, label: "25", level: -13 },
  { hz: 40, label: "40", level: -7 },
  { hz: 63, label: "63", level: -2 },
  { hz: 100, label: "100", level: 0 },
  { hz: 160, label: "160", level: -3 },
  { hz: 250, label: "250", level: -7 },
  { hz: 400, label: "400", level: -6 },
  { hz: 630, label: "630", level: -9 },
  { hz: 1000, label: "1k", level: -8 },
  { hz: 1600, label: "1k6", level: -11 },
  { hz: 2500, label: "2k5", level: -10 },
  { hz: 4000, label: "4k", level: -14 },
  { hz: 6300, label: "6k3", level: -17 },
  { hz: 10000, label: "10k", level: -22 },
  { hz: 16000, label: "16k", level: -29 },
];

/**
 * The spectrum columns use the approved ladder's own sixteen-segment scale
 * unchanged — the same thresholds and the same green / amber / red bands —
 * with the numeral flags stripped, so no column prints its own dB numerals
 * (fifteen printed scales would be noise; the ladder's 6.4-unit numerals
 * would also be under 5 px at the column size). No new scale is invented.
 */
export const SPECTRUM_SEGMENTS: readonly LedSegment[] = LED_LADDER_SCALE.map(({ db, band }) => ({
  db,
  band,
}));

/* --- stereo correlation / goniometer ------------------------------------- */

/**
 * The illustrative correlation reading on the −1 … +1 strip (provisional
 * treatment, D2.1.4). +0.62: a healthy, mostly mono-compatible stereo mix.
 */
export const CORRELATION_FIXTURE = 0.62;

/** One point of the trace in goniometer space: x = side, y = mid, both −1 … +1. */
export type GoniometerPoint = readonly [x: number, y: number];

/**
 * A representative Lissajous-style trace: a few hundred points sampled from
 * two fixed sums of sines standing in for a left and a right channel — the
 * partials deliberately not in simple ratios, so the loops do not close on
 * each other and the figure fills in the way a goniometer's persistence
 * does — then mapped the way a goniometer maps them: mid (L + R) up the
 * vertical axis, side (R − L) across, so the figure leans upright like a
 * normal stereo mix. Deterministic; no randomness; computed once at module
 * load.
 */
export const GONIOMETER_TRACE: readonly GoniometerPoint[] = (() => {
  const points: GoniometerPoint[] = [];
  const samples = 960;
  const span = Math.PI * 2 * 5;
  const root2 = Math.SQRT2;
  for (let i = 0; i < samples; i += 1) {
    const t = (i / samples) * span;
    const left =
      0.5 * Math.sin(t) +
      0.22 * Math.sin(2.31 * t + 0.4) +
      0.09 * Math.sin(5.07 * t + 1.7) +
      0.035 * Math.sin(9.71 * t);
    const right =
      0.5 * Math.sin(t + 0.5) +
      0.2 * Math.sin(2.31 * t + 1.9) +
      0.1 * Math.sin(4.33 * t + 0.9) +
      0.035 * Math.sin(11.3 * t + 2);
    points.push([(right - left) / root2, (left + right) / root2]);
  }
  return points;
})();
