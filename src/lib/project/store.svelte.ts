/**
 * ALLOY — the ONE project store — Task 3.1.
 *
 * The single authoritative, in-memory project state that Console, Arrange
 * and Mixer all read and edit (plan §5: one project model shared by every
 * room; §14 Phase 3.1). It opens on the approved fixture session
 * (`createSessionProject`) and holds it as one Svelte 5 `$state` tree, so
 * a value turned in any room is the value every other room shows at once
 * — no copies, no events, no second source.
 *
 * Three faces, all over the same tree:
 *
 *   `project`   READS — the entities and the selectors / derived views the
 *               rooms render from (tracks, Returns, buses, channels in the
 *               Mixer's order, the sends feeding a Return, a track's tier).
 *   `ops`       WRITES — typed, narrow operations, one per editable control
 *               the approved UI already has. Every op validates (known id,
 *               slot in range, value clamped to its control range), ignores
 *               a write of the value already there, and touches exactly the
 *               field it names. The Mixer's processing parameters are edited
 *               by the chain operations of lib/mixer-chain.ts (the Task 2.8
 *               ownership rule) on the same tree; the store does not wrap
 *               them, so the approved panel components are unchanged.
 *   views       the strip-side BINDINGS: `trackStrip`, `returnLive`,
 *               `busLive`, `trackMeta` hand a strip or a row one object
 *               whose getters read the project and whose setters call the
 *               ops — the Task 2.9 `returnLive` pattern, generalised.
 *
 * What is NOT here, on purpose: transient UI state (selected room or
 * channel, scroll, open menus — those stay in the rooms and components),
 * routing behaviour (Task 3.2), undo / redo, autosave, persistence (Task
 * 3.3), audio, analysis.
 */

import {
  RETURN_PARAMS,
  TONE_PARAM,
  type BusMasterFixture,
  type ReturnStripFixture,
} from "../../components/channel-strip/bus-return-fixtures";
import type { ReturnLive } from "../../components/channel-strip/return-live";
import type { BusLive, SendReturnOption, TrackStripLive } from "../../components/channel-strip/strip-live";
import {
  FADER_RANGE,
  PAN_RANGE,
  SEND_RANGE,
  SEND_SLOT_COUNT,
  TRIM_RANGE,
} from "../../components/channel-strip/track-strip-fixtures";
import type { TrackMetaLive } from "../../components/arrange-row-live";
import { isValidSource, type ArrangeTrack, type FamilyId, type ProminenceTier } from "../arrange";
import { setParamValue } from "../mixer-chain";
import { returnCharacter, type SendInto } from "../return-chain";
import type { ReturnId } from "../../components/channel-strip/track-strip-fixtures";
import {
  TIER_ANCHOR,
  clampPriority,
  isBusId,
  isReturnBusId,
  isTrackId,
  outputLabel,
  tierOfPriority,
  type Bus,
  type BusId,
  type Channel,
  type ChannelId,
  type OutputRef,
  type Project,
  type ReturnBus,
  type ReturnBusId,
  type Track,
  type TrackId,
} from "./model";
import { createSessionProject } from "./session";

/* =========================================================================
   THE STATE
   ========================================================================= */

const state: Project = $state(createSessionProject());

/* --- lookups: an unknown id is a programming error, never a silent no-op --- */

function mustTrack(id: TrackId): Track {
  const track = state.tracks.find((t) => t.id === id);
  if (!track) throw new Error(`unknown track: ${id}`);
  return track;
}

function mustReturn(id: ReturnBusId): ReturnBus {
  const ret = state.returns.find((r) => r.id === id);
  if (!ret) throw new Error(`unknown Return bus: ${id}`);
  return ret;
}

function mustBus(id: BusId): Bus {
  const bus = state.buses.find((b) => b.id === id);
  if (!bus) throw new Error(`unknown bus: ${id}`);
  return bus;
}

function mustSlot(track: Track, slot: number): number {
  if (!Number.isInteger(slot) || slot < 0 || slot >= SEND_SLOT_COUNT) {
    throw new Error(`send slot out of range for ${track.id}: ${slot}`);
  }
  return slot;
}

function clamp(value: number, range: { readonly min: number; readonly max: number }): number {
  if (!Number.isFinite(value)) throw new Error(`not a finite value: ${value}`);
  return Math.min(range.max, Math.max(range.min, value));
}

/* =========================================================================
   READS
   ========================================================================= */

export const project = {
  get id(): string {
    return state.id;
  },
  get name(): string {
    return state.name;
  },
  /** Session order — the channel order of every room. */
  get tracks(): readonly Track[] {
    return state.tracks;
  },
  get returns(): readonly ReturnBus[] {
    return state.returns;
  },
  get buses(): readonly Bus[] {
    return state.buses;
  },
  get arrangement() {
    return state.arrangement;
  },
  /** Every channel in the Mixer's order: tracks, then Returns, then the buses (Task 0.3 / 2.4 / 2.7). */
  get channels(): readonly Channel[] {
    return [...state.tracks, ...state.returns, ...state.buses];
  },

  track(id: TrackId): Track | undefined {
    return state.tracks.find((t) => t.id === id);
  },
  returnBus(id: ReturnBusId): ReturnBus | undefined {
    return state.returns.find((r) => r.id === id);
  },
  bus(id: BusId): Bus | undefined {
    return state.buses.find((b) => b.id === id);
  },
  /** Any channel by id; undefined for an id the session has no channel for. */
  channel(id: string): Channel | undefined {
    if (isTrackId(id)) return project.track(id);
    if (isReturnBusId(id)) return project.returnBus(id);
    if (isBusId(id)) return project.bus(id);
    return undefined;
  },

  /** A track's Prominence Tier — a reading of its priority (plan §5a; D3.1.2). */
  tierOf(track: Track): ProminenceTier {
    return tierOfPriority(track.priority);
  },

  /** The tracks sending into a Return, in session order — the Return's input (plan §8a), live. */
  sendsInto(returnId: ReturnBusId): SendInto[] {
    const out: SendInto[] = [];
    for (const track of state.tracks) {
      const send = track.channel.sends.find((s) => s.to === returnId);
      if (send) out.push({ code: track.code, name: track.name, level: send.level });
    }
    return out;
  },

  /** The Returns a send slot can feed, as the send menu lists them. */
  get sendReturns(): readonly SendReturnOption[] {
    return state.returns.map((r) => ({ id: r.id, name: r.name, short: r.short }));
  },

  /** "Master", or the name of the bus an output reference points at. */
  outputLabel(ref: OutputRef): string {
    return outputLabel(ref, state.buses);
  },
} as const;

/* =========================================================================
   WRITES — one narrow, typed operation per editable control
   ========================================================================= */

export const ops = {
  /* --- track channel strip (Console and Mixer, Task 2.2 / 2.7) ----------- */

  setTrackTrim(id: TrackId, value: number): void {
    const t = mustTrack(id);
    const next = clamp(value, TRIM_RANGE);
    if (next !== t.channel.trim) t.channel.trim = next;
  },
  setTrackPan(id: TrackId, value: number): void {
    const t = mustTrack(id);
    const next = clamp(value, PAN_RANGE);
    if (next !== t.channel.pan) t.channel.pan = next;
  },
  setTrackLevel(id: TrackId, value: number): void {
    const t = mustTrack(id);
    const next = clamp(value, FADER_RANGE);
    if (next !== t.channel.level) t.channel.level = next;
  },
  setTrackMute(id: TrackId, on: boolean): void {
    const t = mustTrack(id);
    if (t.channel.mute !== on) t.channel.mute = on;
  },
  setTrackSolo(id: TrackId, on: boolean): void {
    const t = mustTrack(id);
    if (t.channel.solo !== on) t.channel.solo = on;
  },
  /** Point a send slot at a Return (a known one), or clear it (`null`). The level is the slot's own, set separately. */
  setSendTo(id: TrackId, slot: number, to: ReturnBusId | null): void {
    const t = mustTrack(id);
    const s = t.channel.sends[mustSlot(t, slot)];
    if (to !== null) mustReturn(to);
    if (s.to !== to) s.to = to;
  },
  setSendLevel(id: TrackId, slot: number, value: number): void {
    const t = mustTrack(id);
    const s = t.channel.sends[mustSlot(t, slot)];
    const next = clamp(value, SEND_RANGE);
    if (next !== s.level) s.level = next;
  },

  /* --- track classification (Arrange rows, Mixer identity — Task 2.5 / 2.7) */

  /** Set the family; a source type that does not belong to it is cleared (the Task 2.5 invariant). */
  setTrackFamily(id: TrackId, family: FamilyId | null): void {
    const t = mustTrack(id);
    if (t.familyId === family) return;
    t.familyId = family;
    if (!isValidSource(family, t.sourceTypeId)) t.sourceTypeId = null;
  },
  /** Set the source type (null = Unspecified); it must belong to the track's family. */
  setTrackSourceType(id: TrackId, sourceTypeId: string | null): void {
    const t = mustTrack(id);
    if (!isValidSource(t.familyId, sourceTypeId)) {
      throw new Error(`source type ${sourceTypeId} is not in family ${t.familyId} (${id})`);
    }
    if (t.sourceTypeId !== sourceTypeId) t.sourceTypeId = sourceTypeId;
  },
  /**
   * The user chose a Prominence Tier (plan §5a): the priority moves to the
   * tier's anchor value and the tier counts as confirmed — from Arrange or
   * the Mixer alike (owner, Task 3.1).
   */
  chooseTrackTier(id: TrackId, tier: ProminenceTier): void {
    const t = mustTrack(id);
    if (tierOfPriority(t.priority) !== tier) t.priority = TIER_ANCHOR[tier];
    if (!t.tierConfirmed) t.tierConfirmed = true;
  },
  /** The numeric Priority override (plan §5a); clamped to 1–10. Confirms the tier it lands in. */
  setTrackPriority(id: TrackId, priority: number): void {
    const t = mustTrack(id);
    const next = clampPriority(priority);
    if (next !== t.priority) t.priority = next;
    if (!t.tierConfirmed) t.tierConfirmed = true;
  },

  /* --- Return strip (Task 2.4): level, MUTE, SOLO; the effect module is edited
         through lib/mixer-chain.ts on `ret.chain` ---------------------------- */

  setReturnLevel(id: ReturnBusId, value: number): void {
    const r = mustReturn(id);
    const next = clamp(value, FADER_RANGE);
    if (next !== r.channel.level) r.channel.level = next;
  },
  setReturnMute(id: ReturnBusId, on: boolean): void {
    const r = mustReturn(id);
    if (r.channel.mute !== on) r.channel.mute = on;
  },
  setReturnSolo(id: ReturnBusId, on: boolean): void {
    const r = mustReturn(id);
    if (r.channel.solo !== on) r.channel.solo = on;
  },
  setReturnBypass(id: ReturnBusId, on: boolean): void {
    const r = mustReturn(id);
    if (r.chain.bypassed !== on) r.chain.bypassed = on;
  },

  /* --- bus master strip (Task 2.4) -------------------------------------- */

  setBusTrim(id: BusId, value: number): void {
    const b = mustBus(id);
    const next = clamp(value, TRIM_RANGE);
    if (next !== b.channel.trim) b.channel.trim = next;
  },
  setBusBalance(id: BusId, value: number): void {
    const b = mustBus(id);
    const next = clamp(value, PAN_RANGE);
    if (next !== b.channel.balance) b.channel.balance = next;
  },
  setBusLevel(id: BusId, value: number): void {
    const b = mustBus(id);
    const next = clamp(value, FADER_RANGE);
    if (next !== b.channel.level) b.channel.level = next;
  },
  setBusMute(id: BusId, on: boolean): void {
    const b = mustBus(id);
    if (b.channel.mute !== on) b.channel.mute = on;
  },
  setBusSolo(id: BusId, on: boolean): void {
    const b = mustBus(id);
    if (b.channel.solo !== on) b.channel.solo = on;
  },
} as const;

/* =========================================================================
   VIEWS — what the strips and rows bind to
   One adapter per entity, created on first use and kept, so a strip keeps
   the same object for its life (Svelte binds to it by identity).
   ========================================================================= */

const trackStrips = new Map<TrackId, TrackStripLive>();
const trackMetas = new Map<TrackId, TrackMetaLive>();
const arrangeTracks = new Map<TrackId, ArrangeTrack>();
const returnLives = new Map<ReturnBusId, ReturnLive>();
const returnStrips = new Map<ReturnBusId, ReturnStripFixture>();
const busLives = new Map<BusId, BusLive>();
const busStrips = new Map<BusId, BusMasterFixture>();

/** The Console / Mixer track strip's binding (TrackStrip.svelte). */
export function trackStrip(id: TrackId): TrackStripLive {
  let view = trackStrips.get(id);
  if (view) return view;
  const t = mustTrack(id);
  const sends = t.channel.sends.map((_, i) => ({
    get to(): string | null {
      return t.channel.sends[i].to;
    },
    set to(v: string | null) {
      if (v !== null && !isReturnBusId(v)) throw new Error(`not a Return bus id: ${v}`);
      ops.setSendTo(id, i, v);
    },
    get level(): number {
      return t.channel.sends[i].level;
    },
    set level(v: number) {
      ops.setSendLevel(id, i, v);
    },
  }));
  view = {
    get code() {
      return t.code;
    },
    get name() {
      return t.name;
    },
    get type() {
      return t.type;
    },
    get org() {
      return t.org;
    },
    get peak() {
      return t.display.peak;
    },
    get trim() {
      return t.channel.trim;
    },
    set trim(v: number) {
      ops.setTrackTrim(id, v);
    },
    get pan() {
      return t.channel.pan;
    },
    set pan(v: number) {
      ops.setTrackPan(id, v);
    },
    get level() {
      return t.channel.level;
    },
    set level(v: number) {
      ops.setTrackLevel(id, v);
    },
    get mute() {
      return t.channel.mute;
    },
    set mute(on: boolean) {
      ops.setTrackMute(id, on);
    },
    get solo() {
      return t.channel.solo;
    },
    set solo(on: boolean) {
      ops.setTrackSolo(id, on);
    },
    sends,
    get returns() {
      return project.sendReturns;
    },
    get loadedSendLevels() {
      return t.loadedSendLevels as Readonly<Record<string, number>>;
    },
  };
  trackStrips.set(id, view);
  return view;
}

/** The Arrange row's / Mixer identity's binding (ArrangeTrackRow.svelte, MixerTrackStrip.svelte). */
export function trackMeta(id: TrackId): TrackMetaLive {
  let view = trackMetas.get(id);
  if (view) return view;
  const t = mustTrack(id);
  view = {
    get familyId() {
      return t.familyId;
    },
    set familyId(v: FamilyId | null) {
      ops.setTrackFamily(id, v);
    },
    get sourceTypeId() {
      return t.sourceTypeId;
    },
    set sourceTypeId(v: string | null) {
      ops.setTrackSourceType(id, v);
    },
    get tier() {
      return tierOfPriority(t.priority);
    },
    set tier(v: ProminenceTier) {
      ops.chooseTrackTier(id, v);
    },
    get tierConfirmed() {
      return t.tierConfirmed;
    },
  };
  trackMetas.set(id, view);
  return view;
}

/**
 * The Arrange row's `track` — the identity and classification the approved
 * `ArrangeTrackRow` prints, in the shape it was approved with
 * (`ArrangeTrack`), derived LIVE from the entity: getters, never a copy;
 * the tier is read from the priority.
 */
export function arrangeTrackOf(id: TrackId): ArrangeTrack {
  let view = arrangeTracks.get(id);
  if (view) return view;
  const t = mustTrack(id);
  view = {
    get code() {
      return t.code;
    },
    get name() {
      return t.name;
    },
    get org() {
      return t.org;
    },
    get familyId() {
      return t.familyId;
    },
    get sourceTypeId() {
      return t.sourceTypeId;
    },
    get role() {
      return t.role;
    },
    get tier() {
      return tierOfPriority(t.priority);
    },
    get tierConfirmed() {
      return t.tierConfirmed;
    },
  };
  arrangeTracks.set(id, view);
  return view;
}

/**
 * The Return strip's binding (ReturnStrip.svelte `live`), in both rooms.
 * Effect writes go through the ownership rule (a turned knob is Manual; a
 * write of the same value is not a turn), so a knob turned on either
 * room's strip is a knob turned in the Mixer's effect module.
 */
export function returnLive(id: ReturnBusId): ReturnLive {
  let view = returnLives.get(id);
  if (view) return view;
  const r = mustReturn(id);
  const chain = r.chain;
  const params = RETURN_PARAMS[r.effect];
  view = {
    get time() {
      return chain.time.value;
    },
    set time(v: number) {
      const next = clamp(v, params.time);
      if (next !== chain.time.value) setParamValue(chain.time, next);
    },
    get second() {
      return chain.second.value;
    },
    set second(v: number) {
      const next = clamp(v, params.second);
      if (next !== chain.second.value) setParamValue(chain.second, next);
    },
    get tone() {
      return chain.tone.value;
    },
    set tone(v: number) {
      const next = clamp(v, TONE_PARAM);
      if (next !== chain.tone.value) setParamValue(chain.tone, next);
    },
    get bypass() {
      return chain.bypassed;
    },
    set bypass(on: boolean) {
      ops.setReturnBypass(id, on);
    },
    get character() {
      const c = returnCharacter(chain.effect, chain.character.value);
      return { print: c.print, name: c.name };
    },
    get level() {
      return r.channel.level;
    },
    set level(v: number) {
      ops.setReturnLevel(id, v);
    },
    get mute() {
      return r.channel.mute;
    },
    set mute(on: boolean) {
      ops.setReturnMute(id, on);
    },
    get solo() {
      return r.channel.solo;
    },
    set solo(on: boolean) {
      ops.setReturnSolo(id, on);
    },
  };
  returnLives.set(id, view);
  return view;
}

/**
 * The Return strip's `ret` — the identity the approved `ReturnStrip` prints
 * (code, type, name, colour, effect, peak), in the shape it was approved
 * with, derived LIVE from the entity (getters, never a copy). Its settings
 * fields are the current values too, though a strip given `returnLive` as
 * well never reads them.
 */
export function returnStripOf(id: ReturnBusId): ReturnStripFixture {
  let view = returnStrips.get(id);
  if (view) return view;
  const r = mustReturn(id);
  const live = returnLive(id);
  view = {
    get returnId() {
      return r.id.slice("return-".length) as ReturnId;
    },
    get id() {
      return r.code;
    },
    get type() {
      return r.type;
    },
    get name() {
      return r.name;
    },
    get effect() {
      return r.effect;
    },
    get character() {
      return live.character;
    },
    get time() {
      return live.time;
    },
    get second() {
      return live.second;
    },
    get tone() {
      return live.tone;
    },
    get level() {
      return live.level;
    },
    get bypass() {
      return live.bypass;
    },
    get mute() {
      return live.mute;
    },
    get solo() {
      return live.solo;
    },
    get peak() {
      return r.display.peak;
    },
    get org() {
      return r.org;
    },
  };
  returnStrips.set(id, view);
  return view;
}

/** The bus master strip's `bus` — its approved identity shape, derived live from the entity (see `returnStripOf`). */
export function busStripOf(id: BusId): BusMasterFixture {
  let view = busStrips.get(id);
  if (view) return view;
  const b = mustBus(id);
  view = {
    get id() {
      return b.code;
    },
    get type() {
      return b.type;
    },
    get name() {
      return b.name;
    },
    get trim() {
      return b.channel.trim;
    },
    get balance() {
      return b.channel.balance;
    },
    get level() {
      return b.channel.level;
    },
    get mute() {
      return b.channel.mute;
    },
    get solo() {
      return b.channel.solo;
    },
    get peak() {
      return b.display.peak;
    },
    get org() {
      return b.org;
    },
  };
  busStrips.set(id, view);
  return view;
}

/** The bus master strip's binding (BusMasterStrip.svelte `live`), in both rooms. */
export function busLive(id: BusId): BusLive {
  let view = busLives.get(id);
  if (view) return view;
  const b = mustBus(id);
  view = {
    get trim() {
      return b.channel.trim;
    },
    set trim(v: number) {
      ops.setBusTrim(id, v);
    },
    get balance() {
      return b.channel.balance;
    },
    set balance(v: number) {
      ops.setBusBalance(id, v);
    },
    get level() {
      return b.channel.level;
    },
    set level(v: number) {
      ops.setBusLevel(id, v);
    },
    get mute() {
      return b.channel.mute;
    },
    set mute(on: boolean) {
      ops.setBusMute(id, on);
    },
    get solo() {
      return b.channel.solo;
    },
    set solo(on: boolean) {
      ops.setBusSolo(id, on);
    },
  };
  busLives.set(id, view);
  return view;
}

export type { ChannelId };
