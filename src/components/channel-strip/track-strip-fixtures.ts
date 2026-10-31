/**
 * SIMULATED fixture data for the Console room's regular track channel strips —
 * Task 2.2.
 *
 * Nothing in this file is measured, mixed, routed or persisted: there is no
 * audio, no project model, no peak detection, no mute/solo bus logic. Every
 * value is a typed-in constant chosen so the twenty repeated strips can be
 * judged side by side — varied trims, pans, fader levels, send assignments
 * and amounts (tracks with no send, one send, two sends), two muted tracks,
 * one soloed track, two peak lamps lit, musical track names and a spread of
 * organisational colours (plan §5b; hardware spec §7). The strips' controls
 * are the approved Phase 1 components and keep their local demo behaviour:
 * dragging a knob, pressing MUTE or assigning a send slot changes that one
 * strip's own on-screen state and nothing else.
 *
 * Send slots (owner, Task 2.2 revision): a strip has SEND_SLOT_COUNT slots.
 * A slot is either unassigned (it prints "SEND") or assigned to one of the
 * EFFECT_RETURNS below, whose send level its green knob then shows. The
 * returns are a UI fixture — the list that a later task will populate from
 * the session's real Return buses (plan §8a) — not an effects system.
 *
 * Task 3.1 (shared typed project model) replaces this file; until then the
 * DOM carries `data-simulated` on every strip so the fixture cannot be
 * mistaken for a reading.
 */

export const SIMULATED = "simulated" as const;

/** The curated organisational swatches of plan §5b, as the Task 1.1 tokens name them. */
export type OrgSwatch = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | "neutral";

/** `var()` reference for an organisational swatch — tokens only, never a hex here. */
export function orgToken(swatch: OrgSwatch): string {
  return `var(--al-org-${swatch})`;
}

/** The track-type identifier printed in the strip head. Only regular tracks live in this bank. */
export type TrackType = "TRK";

/* --- effect returns a send slot can feed ---------------------------------- */

export type ReturnId = "room" | "plate" | "delay1";

export interface EffectReturn {
  readonly id: ReturnId;
  /** The return's name, as the send menu lists it. */
  readonly name: string;
  /** The short print for a slot's 72 px scribble window. */
  readonly short: string;
}

/** Representative returns for the send menu (fixture; see the header). */
export const EFFECT_RETURNS: readonly EffectReturn[] = [
  { id: "room", name: "Room Reverb", short: "ROOM" },
  { id: "plate", name: "Plate Reverb", short: "PLATE" },
  { id: "delay1", name: "Delay 1", short: "DELAY 1" },
];

export function effectReturn(id: ReturnId): EffectReturn {
  const found = EFFECT_RETURNS.find((r) => r.id === id);
  if (!found) throw new Error(`unknown effect return: ${id}`);
  return found;
}

/** One assigned send: the return it feeds and its level in dB. */
export interface TrackSend {
  readonly to: ReturnId;
  readonly level: number;
}

/** Send slots per strip: two fixed positions, side by side (owner, D2.2.9). */
export const SEND_SLOT_COUNT = 2;
/** Level a slot takes when a return is assigned in the UI and the fixture holds none for it. */
export const DEFAULT_SEND_LEVEL = -20;

export interface TrackStripFixture {
  /** Two-digit channel number, as the Phase 0 bank, Arrange and Mixer print it. */
  readonly id: string;
  readonly name: string;
  readonly type: TrackType;
  readonly org: OrgSwatch;
  /** Input trim, dB. */
  readonly trim: number;
  /** Pan position: −100 = hard left, 0 = centre, +100 = hard right. */
  readonly pan: number;
  /** Channel fader, dB (the approved fader's −60 … +10 range and console taper). */
  readonly level: number;
  /** Sends assigned at load, in slot order; at most SEND_SLOT_COUNT. */
  readonly sends: readonly TrackSend[];
  readonly mute: boolean;
  readonly solo: boolean;
  /** Peak lamp lit — a fixture flag, not a detection. */
  readonly peak: boolean;
}

/* --- the control ranges, provisional (decisions-log D2.2.x) ----------------
   Plan §4 / §8 name the controls but fix no scales. These are the simplest
   console-like ranges that make the fixtures legible; the project model
   (Phase 3) and the rulebooks (Phase 9) own the real ones. */

/** Input trim: ±20 dB round unity, unity under the knob's reference mark. */
export const TRIM_RANGE = { min: -20, max: 20, step: 0.5 } as const;
/** Pan: hard left to hard right in whole steps, centre under the reference mark. */
export const PAN_RANGE = { min: -100, max: 100, step: 1 } as const;
/** Sends: a post-fader send level in dB; the bottom of the range is "off" (an unassigned slot sits there). */
export const SEND_RANGE = { min: -60, max: 6, step: 1 } as const;

/** "+3.5 dB", "0.0 dB", "−6.0 dB" — a signed dB readout with a true minus sign. */
export function formatSignedDb(value: number, decimals: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "\u2212" : "";
  return `${sign}${Math.abs(value).toFixed(decimals)} dB`;
}

/** "L 30", "C", "R 45" — how a console prints a pan pot's position. */
export function formatPan(value: number): string {
  const amount = Math.round(Math.abs(value));
  if (amount === 0) return "C";
  return `${value < 0 ? "L" : "R"} ${amount}`;
}

/** "OFF" at the bottom of the range, otherwise a signed whole-dB readout. */
export function formatSend(value: number): string {
  if (value <= SEND_RANGE.min) return "OFF";
  return formatSignedDb(value, 0);
}

/**
 * Twenty regular tracks — the Phase 0 bank's count, so Console, Arrange and
 * Mixer still describe the same-sized pretend session. Names, colours and
 * settings are fixtures for visual evaluation only.
 */
export const TRACK_STRIPS: readonly TrackStripFixture[] = [
  { id: "01", name: "Kick", type: "TRK", org: 2, trim: 3.5, pan: 0, level: -2.0, sends: [], mute: false, solo: false, peak: true },
  { id: "02", name: "Snare Top", type: "TRK", org: 2, trim: 1.5, pan: 0, level: -4.5, sends: [{ to: "plate", level: -18 }], mute: false, solo: false, peak: false },
  { id: "03", name: "Snare Bottom", type: "TRK", org: 2, trim: -2.0, pan: 0, level: -12.0, sends: [{ to: "plate", level: -24 }], mute: false, solo: false, peak: false },
  { id: "04", name: "Hi-hat", type: "TRK", org: 2, trim: -4.5, pan: -35, level: -14.0, sends: [], mute: false, solo: false, peak: false },
  { id: "05", name: "Overhead L", type: "TRK", org: 2, trim: 0, pan: -100, level: -9.0, sends: [{ to: "room", level: -30 }], mute: false, solo: false, peak: false },
  { id: "06", name: "Overhead R", type: "TRK", org: 2, trim: 0, pan: 100, level: -9.0, sends: [{ to: "room", level: -30 }], mute: false, solo: false, peak: false },
  { id: "07", name: "Room Mic", type: "TRK", org: 2, trim: 6.0, pan: 0, level: -20.0, sends: [], mute: false, solo: false, peak: false },
  { id: "08", name: "Bass DI", type: "TRK", org: 1, trim: -1.5, pan: 0, level: -3.0, sends: [], mute: false, solo: false, peak: false },
  { id: "09", name: "Bass Amp", type: "TRK", org: 1, trim: 2.0, pan: 0, level: -7.5, sends: [], mute: true, solo: false, peak: false },
  { id: "10", name: "Rhythm Gtr L", type: "TRK", org: 5, trim: -3.0, pan: -70, level: -6.0, sends: [{ to: "room", level: -15 }, { to: "delay1", level: -28 }], mute: false, solo: false, peak: false },
  { id: "11", name: "Rhythm Gtr R", type: "TRK", org: 5, trim: -3.0, pan: 70, level: -6.0, sends: [{ to: "room", level: -15 }, { to: "delay1", level: -28 }], mute: false, solo: false, peak: false },
  { id: "12", name: "Lead Gtr", type: "TRK", org: 5, trim: 4.5, pan: 20, level: -1.0, sends: [{ to: "plate", level: -12 }, { to: "delay1", level: -9 }], mute: false, solo: false, peak: true },
  { id: "13", name: "Piano", type: "TRK", org: 6, trim: 0, pan: -25, level: -8.0, sends: [{ to: "room", level: -10 }, { to: "delay1", level: -20 }], mute: false, solo: false, peak: false },
  { id: "14", name: "Synth Pad", type: "TRK", org: 6, trim: -8.0, pan: 45, level: -16.0, sends: [{ to: "plate", level: -6 }, { to: "delay1", level: -20 }], mute: false, solo: false, peak: false },
  { id: "15", name: "Lead Vocal", type: "TRK", org: 8, trim: 2.5, pan: 0, level: 1.5, sends: [{ to: "plate", level: -14 }, { to: "delay1", level: -16 }], mute: false, solo: true, peak: false },
  { id: "16", name: "Vocal Double", type: "TRK", org: 8, trim: 1.0, pan: 0, level: -11.0, sends: [{ to: "plate", level: -14 }], mute: true, solo: false, peak: false },
  { id: "17", name: "Harmony 1", type: "TRK", org: 4, trim: 0.5, pan: -55, level: -13.0, sends: [{ to: "room", level: -8 }], mute: false, solo: false, peak: false },
  { id: "18", name: "Harmony 2", type: "TRK", org: 4, trim: 0.5, pan: 55, level: -13.0, sends: [{ to: "room", level: -8 }], mute: false, solo: false, peak: false },
  { id: "19", name: "Shaker", type: "TRK", org: 3, trim: -6.5, pan: 60, level: -22.0, sends: [{ to: "room", level: -26 }], mute: false, solo: false, peak: false },
  { id: "20", name: "Riser FX", type: "TRK", org: "neutral", trim: 0, pan: 0, level: -60, sends: [{ to: "delay1", level: -3 }], mute: false, solo: false, peak: false },
];
