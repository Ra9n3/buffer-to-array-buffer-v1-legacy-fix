/**
 * SIMULATED fixture data for the Console room's pinned channel strips — the
 * effect Return buses and the bus master — Task 2.4.
 *
 * Nothing in this file is measured, mixed, routed or persisted: there is no
 * audio, no effect processing, no project model. Every value is a typed-in
 * constant chosen so the pinned strips can be judged beside the twenty track
 * strips: a reverb with a short room and one with a long plate, a tape delay
 * sitting bypassed, varied tones and return levels, one lit peak lamp, and a
 * bus master at unity.
 *
 * The Returns are the same returns the track strips' send slots feed
 * (`EFFECT_RETURNS` in `track-strip-fixtures.ts`, plan §8a): one pinned
 * Return strip per listed return, in the list's order, so that a send
 * assigned on a track always has a visible Return at the end of the bank.
 * The list is data — add a return there and the bank grows a strip; nothing
 * here is written for exactly two returns (owner, D2.4.1).
 *
 * Task 3.1 (shared typed project model) replaces this file; until then the
 * DOM carries `data-simulated` on every strip so the fixture cannot be
 * mistaken for a reading.
 */

import {
  EFFECT_RETURNS,
  PAN_RANGE,
  SIMULATED,
  TRIM_RANGE,
  effectReturn,
  formatPan,
  formatSignedDb,
  type OrgSwatch,
  type ReturnId,
} from "./track-strip-fixtures";

export { SIMULATED };

/* --- the Return's effect family and its controls --------------------------
   Plan §8a names the Return's processing controls: effect character or
   algorithm, decay or delay time, pre-delay, tone / damping, delay feedback,
   Return output level and bypass. The Console strip (plan §3: legible and
   relatively simple) carries the character, the time control, the second
   effect control (pre-delay or feedback), the tone, the output level and
   the bypass; the Mixer's chain detail (Task 2.9) carries the rest. */

export type ReturnEffect = "reverb" | "delay";

/** One knob of a Return strip: legend, range, readout. */
export interface ReturnParam {
  /** The knob's `data-strip-section` hook. */
  readonly id: "decay" | "predelay" | "time" | "feedback" | "tone";
  readonly legend: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly decimals: number;
  /** The extreme numerals the knob prints at its two limits. */
  readonly extremes: readonly [string, string];
  readonly format: (value: number) => string;
}

/** "1.4 s" / "12 ms" / "35 %" — a value with its unit and a thin space. */
function formatUnit(value: number, decimals: number, unit: string): string {
  return `${value.toFixed(decimals)}\u2009${unit}`;
}

/** "FLAT" under the mark, otherwise a signed step: "+3" / "−4" (darker). */
export function formatTone(value: number): string {
  const amount = Math.round(value);
  if (amount === 0) return "FLAT";
  return `${amount > 0 ? "+" : "\u2212"}${Math.abs(amount)}`;
}

/* The ranges are provisional (decisions-log D2.4.3): the simplest
   console-like ranges that make the fixtures legible; the effect DSP
   (Phase 6) and the rulebooks (Phase 9) own the real ones. */

/** Reverb decay time, seconds. */
export const DECAY_PARAM: ReturnParam = {
  id: "decay",
  legend: "Decay",
  min: 0.2,
  max: 10,
  step: 0.1,
  decimals: 1,
  extremes: ["0.2", "10"],
  format: (v) => formatUnit(v, 1, "s"),
};

/** Reverb pre-delay, milliseconds. */
export const PREDELAY_PARAM: ReturnParam = {
  id: "predelay",
  legend: "Pre-delay",
  min: 0,
  max: 200,
  step: 1,
  decimals: 0,
  extremes: ["0", "200"],
  format: (v) => formatUnit(v, 0, "ms"),
};

/** Delay time, milliseconds. */
export const DELAY_TIME_PARAM: ReturnParam = {
  id: "time",
  legend: "Time",
  min: 20,
  max: 2000,
  step: 5,
  decimals: 0,
  extremes: ["20", "2000"],
  format: (v) => formatUnit(v, 0, "ms"),
};

/** Delay feedback, per cent of the repeat fed back. */
export const FEEDBACK_PARAM: ReturnParam = {
  id: "feedback",
  legend: "Feedback",
  min: 0,
  max: 90,
  step: 1,
  decimals: 0,
  extremes: ["0", "90"],
  format: (v) => formatUnit(v, 0, "%"),
};

/** Tone / damping: darker below the mark, brighter above, FLAT under it. */
export const TONE_PARAM: ReturnParam = {
  id: "tone",
  legend: "Tone",
  min: -10,
  max: 10,
  step: 1,
  decimals: 0,
  extremes: ["\u221210", "+10"],
  format: formatTone,
};

/** Which knobs an effect family puts on its strip: the time control, then the second effect control. */
export const RETURN_PARAMS: Readonly<Record<ReturnEffect, { readonly time: ReturnParam; readonly second: ReturnParam }>> = {
  reverb: { time: DECAY_PARAM, second: PREDELAY_PARAM },
  delay: { time: DELAY_TIME_PARAM, second: FEEDBACK_PARAM },
};

/** The channel-type identifiers printed in the pinned strips' heads. */
export type PinnedType = "RET" | "BUS";

export interface ReturnStripFixture {
  /** The return this strip is — the same id the track send slots name. */
  readonly returnId: ReturnId;
  /** Channel code printed in the head: R1, R2, … in list order. */
  readonly id: string;
  readonly type: "RET";
  /** The return's name, taken from the shared return list so the two can never disagree. */
  readonly name: string;
  readonly effect: ReturnEffect;
  /** Effect character / algorithm (plan §8a: Room, Hall, Plate; delay-line character). */
  readonly character: { readonly print: string; readonly name: string };
  /** Decay (reverb, s) or delay time (delay, ms). */
  readonly time: number;
  /** Pre-delay (reverb, ms) or feedback (delay, %). */
  readonly second: number;
  readonly tone: number;
  /** Return output level, dB (the approved fader's −60 … +10 range). */
  readonly level: number;
  /** The Return's chain is bypassed — the strip's BYPASS switch is engaged. */
  readonly bypass: boolean;
  readonly mute: boolean;
  readonly solo: boolean;
  /** Peak lamp lit — a fixture flag, not a detection. */
  readonly peak: boolean;
  readonly org: OrgSwatch;
}

export interface BusMasterFixture {
  /** Channel code printed in the head. */
  readonly id: string;
  readonly type: "BUS";
  readonly name: string;
  /** Bus trim, dB (the track strips' TRIM range). */
  readonly trim: number;
  /** Stereo balance: −100 = left, 0 = centre, +100 = right (the track strips' PAN range). */
  readonly balance: number;
  /** Bus master fader, dB. */
  readonly level: number;
  readonly mute: boolean;
  readonly solo: boolean;
  readonly peak: boolean;
  readonly org: OrgSwatch;
}

/* The bus master reuses the track strips' ranges and readouts, so that a
   trim or a balance reads the same wherever it is printed. */
export { PAN_RANGE as BALANCE_RANGE, TRIM_RANGE as BUS_TRIM_RANGE, formatPan as formatBalance, formatSignedDb };

/** The per-return settings of the fixture session, keyed by the shared return id. */
const RETURN_SETTINGS: Readonly<Record<ReturnId, Omit<ReturnStripFixture, "returnId" | "id" | "type" | "name">>> = {
  room: {
    effect: "reverb",
    character: { print: "ROOM", name: "Room" },
    time: 1.4,
    second: 12,
    tone: -2,
    level: -6,
    bypass: false,
    mute: false,
    solo: false,
    peak: false,
    org: "neutral",
  },
  plate: {
    effect: "reverb",
    character: { print: "PLATE", name: "Plate" },
    time: 2.6,
    second: 30,
    tone: 3,
    level: -9,
    bypass: false,
    mute: false,
    solo: false,
    peak: true,
    org: "neutral",
  },
  delay1: {
    effect: "delay",
    character: { print: "TAPE", name: "Tape echo" },
    time: 375,
    second: 35,
    tone: -4,
    level: -12,
    bypass: true,
    mute: false,
    solo: false,
    peak: false,
    org: "neutral",
  },
};

/**
 * One pinned Return strip per shared return, in the shared list's order,
 * numbered R1, R2, … — the strips are derived from the list, never a
 * parallel copy of it.
 */
export const RETURN_STRIPS: readonly ReturnStripFixture[] = EFFECT_RETURNS.map((ret, i) => ({
  returnId: ret.id,
  id: `R${i + 1}`,
  type: "RET",
  name: effectReturn(ret.id).name,
  ...RETURN_SETTINGS[ret.id],
}));

/**
 * The bus master — the one pinned bus of the Phase 0 bank (0.3), read as the
 * mix bus every track and Return sums into. One entry; the bank renders
 * whatever the list holds.
 */
export const BUS_MASTERS: readonly BusMasterFixture[] = [
  { id: "B1", type: "BUS", name: "Mix Bus", trim: 0, balance: 0, level: 0, mute: false, solo: false, peak: false, org: "neutral" },
];
