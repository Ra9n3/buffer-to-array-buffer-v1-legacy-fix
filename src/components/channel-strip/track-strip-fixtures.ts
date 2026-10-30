/**
 * SIMULATED fixture data for the Console room's regular track channel strips —
 * Task 2.2.
 *
 * Nothing in this file is measured, mixed, routed or persisted: there is no
 * audio, no project model, no peak detection, no mute/solo bus logic. Every
 * value is a typed-in constant chosen so the twenty repeated strips can be
 * judged side by side — varied trims, pans, fader levels and send amounts
 * (including sends that are off), two muted tracks, one soloed track, two
 * peak lamps lit, musical track names and a spread of organisational colours
 * (plan §5b; hardware spec §7). The strips' controls are the approved Phase 1
 * components and keep their local demo behaviour: dragging a knob or pressing
 * MUTE changes that one control's own state on screen and nothing else.
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
  /** Send to the Reverb Return, dB; at the minimum the send is off. */
  readonly reverbSend: number;
  /** Send to the Delay Return, dB; at the minimum the send is off. */
  readonly delaySend: number;
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
/** Sends: a post-fader send level in dB; the bottom of the range is "off". */
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
  { id: "01", name: "Kick", type: "TRK", org: 2, trim: 3.5, pan: 0, level: -2.0, reverbSend: -60, delaySend: -60, mute: false, solo: false, peak: true },
  { id: "02", name: "Snare Top", type: "TRK", org: 2, trim: 1.5, pan: 0, level: -4.5, reverbSend: -18, delaySend: -60, mute: false, solo: false, peak: false },
  { id: "03", name: "Snare Bottom", type: "TRK", org: 2, trim: -2.0, pan: 0, level: -12.0, reverbSend: -24, delaySend: -60, mute: false, solo: false, peak: false },
  { id: "04", name: "Hi-hat", type: "TRK", org: 2, trim: -4.5, pan: -35, level: -14.0, reverbSend: -60, delaySend: -60, mute: false, solo: false, peak: false },
  { id: "05", name: "Overhead L", type: "TRK", org: 2, trim: 0, pan: -100, level: -9.0, reverbSend: -30, delaySend: -60, mute: false, solo: false, peak: false },
  { id: "06", name: "Overhead R", type: "TRK", org: 2, trim: 0, pan: 100, level: -9.0, reverbSend: -30, delaySend: -60, mute: false, solo: false, peak: false },
  { id: "07", name: "Room Mic", type: "TRK", org: 2, trim: 6.0, pan: 0, level: -20.0, reverbSend: -60, delaySend: -60, mute: false, solo: false, peak: false },
  { id: "08", name: "Bass DI", type: "TRK", org: 1, trim: -1.5, pan: 0, level: -3.0, reverbSend: -60, delaySend: -60, mute: false, solo: false, peak: false },
  { id: "09", name: "Bass Amp", type: "TRK", org: 1, trim: 2.0, pan: 0, level: -7.5, reverbSend: -60, delaySend: -60, mute: true, solo: false, peak: false },
  { id: "10", name: "Rhythm Gtr L", type: "TRK", org: 5, trim: -3.0, pan: -70, level: -6.0, reverbSend: -15, delaySend: -28, mute: false, solo: false, peak: false },
  { id: "11", name: "Rhythm Gtr R", type: "TRK", org: 5, trim: -3.0, pan: 70, level: -6.0, reverbSend: -15, delaySend: -28, mute: false, solo: false, peak: false },
  { id: "12", name: "Lead Gtr", type: "TRK", org: 5, trim: 4.5, pan: 20, level: -1.0, reverbSend: -12, delaySend: -9, mute: false, solo: false, peak: true },
  { id: "13", name: "Piano", type: "TRK", org: 6, trim: 0, pan: -25, level: -8.0, reverbSend: -10, delaySend: -60, mute: false, solo: false, peak: false },
  { id: "14", name: "Synth Pad", type: "TRK", org: 6, trim: -8.0, pan: 45, level: -16.0, reverbSend: -6, delaySend: -20, mute: false, solo: false, peak: false },
  { id: "15", name: "Lead Vocal", type: "TRK", org: 8, trim: 2.5, pan: 0, level: 1.5, reverbSend: -14, delaySend: -16, mute: false, solo: true, peak: false },
  { id: "16", name: "Vocal Double", type: "TRK", org: 8, trim: 1.0, pan: 0, level: -11.0, reverbSend: -14, delaySend: -60, mute: true, solo: false, peak: false },
  { id: "17", name: "Harmony 1", type: "TRK", org: 4, trim: 0.5, pan: -55, level: -13.0, reverbSend: -8, delaySend: -60, mute: false, solo: false, peak: false },
  { id: "18", name: "Harmony 2", type: "TRK", org: 4, trim: 0.5, pan: 55, level: -13.0, reverbSend: -8, delaySend: -60, mute: false, solo: false, peak: false },
  { id: "19", name: "Shaker", type: "TRK", org: 3, trim: -6.5, pan: 60, level: -22.0, reverbSend: -26, delaySend: -60, mute: false, solo: false, peak: false },
  { id: "20", name: "Riser FX", type: "TRK", org: "neutral", trim: 0, pan: 0, level: -60, reverbSend: -60, delaySend: -3, mute: false, solo: false, peak: false },
];
