/**
 * ALLOY — the shared typed PROJECT MODEL — Task 3.1.
 *
 * One description of the session that Console, Arrange and Mixer all read
 * (plan §5: "Changes to track names, order, colors, groups, buses, routing,
 * and settings appear immediately in all rooms because they share one
 * project model"; §18: data-model.md). This file is the SHAPE only — plain
 * TypeScript, no Svelte, no state, no fixture values. The approved fixture
 * session is built from these types in `session.ts`; the one authoritative
 * store that holds it, and the narrow operations that change it, live in
 * `store.svelte.ts`.
 *
 * What the model covers (the approved Phase 0–2 UI, nothing beyond it):
 *   - tracks: identity, instrument (family + source type), musical Role,
 *     prominence (Priority 1–10, read as a Prominence Tier), routing
 *     destination REFERENCE, the Console strip's channel settings (trim, pan,
 *     fader, MUTE, SOLO, two send slots) and the Mixer's processing chain
 *     (EQ, compressor, with per-parameter Auto / Manual ownership and the
 *     loaded "original" next to the current value — Task 2.8);
 *   - Return buses (plan §8a): identity, effect, the effect module
 *     (character, time, second control, tone, bypass, ownership — Task 2.9)
 *     and the strip's level / MUTE / SOLO;
 *   - regular buses (plan §8): identity, the strip's trim / balance / level /
 *     MUTE / SOLO, the bus chain (EQ, compressor, peak-protection status —
 *     Task 2.9) and a routing destination reference;
 *   - the arrangement the Arrange room draws: bars, sections, tempo markers,
 *     waveform placeholder clips (fixture-backed display data, read-only).
 *
 * What it deliberately does NOT contain: undo / redo or persistence (Task
 * 3.3), audio, analysis, measured readings, DSP values presented as final
 * (plan §17), sidechain relationships (plan §8, Phase 7). The routing
 * RULES (which references are valid, loop rejection) are pure functions in
 * `routing.ts` (Task 3.2); the model only holds the references.
 *
 * IDENTITY. Every entity has a stable, opaque `id` and a printed `code`.
 * References between entities (a send's destination, an output) are ids,
 * never array positions or display names (owner, Task 3.1). The ids are
 * kind-prefixed — `track-01`, `return-room`, `bus-B1` — which are the Mixer's
 * channel ids since Task 2.7, so the Mixer's selection, DOM hooks and
 * measurements are unchanged by the model.
 */

import type { OrgSwatch } from "../../components/channel-strip/track-strip-fixtures";
import type { ReturnEffect } from "../../components/channel-strip/bus-return-fixtures";
import type { FamilyId, ProminenceTier, RoleId } from "../arrange";
import type { ArrangeClip, ArrangeSection, TempoMarker } from "../arrange-timeline";
import type { ChainState, Mode } from "../mixer-chain";
import type { ReturnChainState } from "../return-chain";
import type { BusChainState } from "../bus-chain";

/* =========================================================================
   IDENTITY AND REFERENCES
   ========================================================================= */

export type TrackId = `track-${string}`;
export type ReturnBusId = `return-${string}`;
export type BusId = `bus-${string}`;
export type ChannelId = TrackId | ReturnBusId | BusId;

/** The printed channel-type badge of a strip head (Tasks 2.2 / 2.4). */
export type ChannelKind = "track" | "return" | "bus";

/**
 * Where a channel's output goes: a bus, or the Master output. A REFERENCE
 * only — the routing graph that follows these references, offers
 * destinations and rejects cycles is Task 3.2 (plan §5).
 */
export type OutputRef = BusId | "master";
export const MASTER_OUTPUT: OutputRef = "master";

export const trackId = (code: string): TrackId => `track-${code}`;
export const returnBusId = (key: string): ReturnBusId => `return-${key}`;
export const busId = (code: string): BusId => `bus-${code}`;

export function isTrackId(id: string): id is TrackId {
  return id.startsWith("track-");
}
export function isReturnBusId(id: string): id is ReturnBusId {
  return id.startsWith("return-");
}
export function isBusId(id: string): id is BusId {
  return id.startsWith("bus-");
}

/* =========================================================================
   PRIORITY AND PROMINENCE TIER (plan §5, §5a)
   Priority is the stored, user-editable 1–10 value; the Prominence Tier the
   UI shows is a READING of it. The band edges and the value a chosen tier
   lands on are provisional (owner, Task 3.1; decisions-log D3.1.2): no
   document fixes them, so these are the simplest testable mapping and can
   change without touching the UI.
   ========================================================================= */

export const PRIORITY_RANGE = { min: 1, max: 10 } as const;

/** Lowest priority of each tier's band: Primary 8–10, Supporting 4–7, Background 1–3. */
export const TIER_FLOOR: Readonly<Record<ProminenceTier, number>> = {
  primary: 8,
  supporting: 4,
  background: 1,
};

/** The priority a track takes when the user CHOOSES a tier (the band's representative value). */
export const TIER_ANCHOR: Readonly<Record<ProminenceTier, number>> = {
  primary: 9,
  supporting: 5,
  background: 2,
};

export function tierOfPriority(priority: number): ProminenceTier {
  if (priority >= TIER_FLOOR.primary) return "primary";
  if (priority >= TIER_FLOOR.supporting) return "supporting";
  return "background";
}

export function clampPriority(priority: number): number {
  const whole = Math.round(priority);
  return Math.min(PRIORITY_RANGE.max, Math.max(PRIORITY_RANGE.min, whole));
}

/* =========================================================================
   TRACKS
   ========================================================================= */

/**
 * One of a track's fixed send slots (D2.2.9): unassigned (`to` null, level
 * at the bottom of the range) or feeding one Return bus at a level in dB.
 * Post-fader (plan §16). `mode` is the send's own Auto / Manual ownership
 * (plan §5: "an independent Auto/Manual mode for each send"; §8a: "Auto
 * values may be recalculated on a MIX rerun, while Manual values are
 * preserved") — Task 3.2 plumbing, no control shows it yet. The send's
 * "original" is the level the session loaded with for that Return
 * (`Track.loadedSendLevels`), not a second stored value.
 */
export interface SendSlot {
  to: ReturnBusId | null;
  level: number;
  mode: Mode;
}

/** The Console strip's channel settings (plan §5 "channel-strip state"). */
export interface TrackChannel {
  /** Input trim, dB (TRIM_RANGE). */
  trim: number;
  /** Pan, −100 (hard left) … +100 (hard right) (PAN_RANGE). */
  pan: number;
  /** Channel fader, dB (the approved fader's −60 … +10). */
  level: number;
  mute: boolean;
  solo: boolean;
  /** Exactly SEND_SLOT_COUNT entries, in slot order. */
  readonly sends: SendSlot[];
}

/**
 * Fixture-backed DISPLAY readings a strip shows and no one edits: lamps
 * that a real meter or detector will drive from Phase 5 on. Kept apart from
 * the settings so nothing mistakes them for state the user owns.
 */
export interface ChannelDisplay {
  /** Peak lamp lit (Task 2.2: a flag, not a detection). */
  readonly peak: boolean;
}

export interface Track {
  readonly kind: "track";
  readonly id: TrackId;
  /** The printed two-digit channel number. Display only — never a reference. */
  readonly code: string;
  readonly type: "TRK";
  name: string;
  /** Organisational colour (plan §5b): a swatch, never a functional colour. */
  org: OrgSwatch;
  /** Instrument: the family and, within it, the source type (plan §5, §5a); null = not assigned / Unspecified. */
  familyId: FamilyId | null;
  sourceTypeId: string | null;
  /** Musical function (plan §5) — independent of prominence (§5a). */
  role: RoleId;
  /** 1–10 (plan §5); the Prominence Tier is read from it (`tierOfPriority`). */
  priority: number;
  /** False while a suggested tier awaits the user's confirmation (plan §5a). */
  tierConfirmed: boolean;
  /** Routing destination — a reference (plan §5): a bus or Master, validated by `routing.ts` before it changes. */
  output: OutputRef;
  readonly channel: TrackChannel;
  /**
   * The send levels the session LOADED with, by Return: what a slot takes
   * back when that Return is assigned to it again (Task 2.2 behaviour) —
   * the sends' "original" values.
   */
  readonly loadedSendLevels: Readonly<Partial<Record<ReturnBusId, number>>>;
  /** The Mixer's processing chain (Task 2.8): EQ, compressor, ownership, originals, notes. */
  readonly chain: ChainState;
  readonly display: ChannelDisplay;
}

/* =========================================================================
   RETURN BUSES (plan §8a)
   ========================================================================= */

export interface ReturnChannel {
  /** Return output level, dB (the strip's fader). */
  level: number;
  mute: boolean;
  solo: boolean;
}

export interface ReturnBus {
  readonly kind: "return";
  readonly id: ReturnBusId;
  /** Printed code: R1, R2 … */
  readonly code: string;
  readonly type: "RET";
  name: string;
  /** The short print a send slot's 72 px window shows for this Return (ROOM, PLATE, DELAY 1). */
  readonly short: string;
  org: OrgSwatch;
  readonly effect: ReturnEffect;
  readonly channel: ReturnChannel;
  /** The effect module (Task 2.9): character, time, second control, tone, bypass, ownership, notes. */
  readonly chain: ReturnChainState;
  /** A Return feeds the Master output (plan §8a) — a reference the routing rules keep at Master (owner, Task 3.2). */
  output: OutputRef;
  readonly display: ChannelDisplay;
}

/* =========================================================================
   REGULAR BUSES (plan §5, §8)
   ========================================================================= */

export interface BusChannel {
  /** Bus trim, dB (the track trim's range). */
  trim: number;
  /** Balance, −100 … +100 (the pan range). */
  balance: number;
  /** Bus fader, dB. */
  level: number;
  mute: boolean;
  solo: boolean;
}

export interface Bus {
  readonly kind: "bus";
  readonly id: BusId;
  /** Printed code: B1 … */
  readonly code: string;
  readonly type: "BUS";
  name: string;
  org: OrgSwatch;
  readonly channel: BusChannel;
  /** The bus chain (Task 2.9): EQ, compressor, peak-protection status, notes. */
  readonly chain: BusChainState;
  /** Where the bus sums to: another bus (bus-to-bus chaining, plan §5) or Master — a reference; loops are rejected by `routing.ts`. */
  output: OutputRef;
  readonly display: ChannelDisplay;
}

/* =========================================================================
   CHANNELS — what the Mixer selects among
   ========================================================================= */

export type Channel = Track | ReturnBus | Bus;

/* =========================================================================
   THE ARRANGEMENT (Arrange room, Tasks 2.5 / 2.6) — fixture-backed, read-only
   ========================================================================= */

export interface Arrangement {
  readonly barCount: number;
  readonly timeSignature: string;
  readonly sections: readonly ArrangeSection[];
  readonly tempoMarkers: readonly TempoMarker[];
  /** Waveform placeholder clips by track id (plan §14 2.6: placeholders until Phase 5). */
  readonly clips: Readonly<Partial<Record<TrackId, readonly ArrangeClip[]>>>;
}

/* =========================================================================
   THE PROJECT
   ========================================================================= */

/**
 * The structure a saved project is rebuilt from (Task 4.1). The manifest
 * (persistence.ts) holds identity and field values, not channels, so a
 * reopened project is its template — the approved fixture session, or the
 * empty project (Master only) — with the saved values applied onto it.
 * Imported projects (Phase 5) will need the manifest to carry their tracks.
 */
export type ProjectTemplateId = "session-fixture" | "empty";

export interface Project {
  readonly id: string;
  name: string;
  readonly template: ProjectTemplateId;
  /** Session order = channel order in every room. */
  readonly tracks: Track[];
  readonly returns: ReturnBus[];
  readonly buses: Bus[];
  readonly arrangement: Arrangement;
}

/** The label the rooms print for a channel kind (Task 0.5 / 2.7). */
const KIND_LABELS: Readonly<Record<ChannelKind, string>> = {
  track: "Track",
  bus: "Bus",
  return: "Return bus",
};

export function channelKindLabel(kind: ChannelKind): string {
  return KIND_LABELS[kind];
}

/** "Master", or the printed name of the bus an output reference points at. */
export function outputLabel(ref: OutputRef, buses: readonly Bus[]): string {
  if (ref === "master") return "Master";
  return buses.find((b) => b.id === ref)?.name ?? ref;
}
