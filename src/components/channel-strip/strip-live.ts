/**
 * The live settings the track and bus strips are BOUND to — Task 3.1.
 *
 * The Task 2.9 pattern (`return-live.ts`), for the other two strips: the
 * strip draws and turns ONE object that owns its settings. In the rooms
 * that object is a view the project store hands out (`trackStrip`,
 * `busLive` in lib/project/store.svelte.ts): reads come straight from the
 * shared project, writes go through the store's typed operations, so a
 * knob turned in the Console is the knob the Mixer shows. A caller outside
 * the rooms (the component playground) may hand a plain `$state` object
 * instead and get the strip's local behaviour.
 *
 * This file is only the shapes — no state, no fixture, no model lives here.
 */
import type { OrgSwatch, TrackType } from "./track-strip-fixtures";

/** A Return a send slot can feed: its id, the name the menu lists and the short print of the 72 px window. */
export interface SendReturnOption {
  readonly id: string;
  readonly name: string;
  readonly short: string;
}

/** One send slot: unassigned (`to` null, level at OFF) or feeding a Return at a level in dB. */
export interface SendSlotLive {
  to: string | null;
  level: number;
}

export interface TrackStripLive {
  /** The printed two-digit channel number (the strip's DOM hook). */
  readonly code: string;
  readonly name: string;
  readonly type: TrackType;
  readonly org: OrgSwatch;
  /** Peak lamp lit — a reading the strip shows, never edits. */
  readonly peak: boolean;
  /** Input trim, dB. */
  trim: number;
  /** Pan, −100 … +100. */
  pan: number;
  /** Channel fader, dB. */
  level: number;
  mute: boolean;
  solo: boolean;
  /** Exactly SEND_SLOT_COUNT slots, in position order. */
  readonly sends: readonly SendSlotLive[];
  /** The Returns the send menu offers, in the session's order. */
  readonly returns: readonly SendReturnOption[];
  /** The level a slot takes back when a Return is assigned to it and the session loaded one for that Return. */
  readonly loadedSendLevels: Readonly<Record<string, number>>;
}

export interface BusLive {
  /** Bus trim, dB. */
  trim: number;
  /** Balance, −100 … +100. */
  balance: number;
  /** Bus fader, dB. */
  level: number;
  mute: boolean;
  solo: boolean;
}
