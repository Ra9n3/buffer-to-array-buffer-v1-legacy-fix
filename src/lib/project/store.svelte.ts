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
 * Routing (Task 3.2): `ops.setTrackOutput` / `ops.setBusOutput` ask the
 * pure rules in lib/project/routing.ts FIRST and write the reference only
 * for an accepted verdict — a rejected route leaves the project exactly as
 * it was, and the verdict's message is returned for whatever control binds
 * it later (owner, Task 3.2: no output field in this build). A Return's
 * output is fixed at Master (no op exists for it). `project.routeOf`,
 * `project.destinationsFor` and `project.validateRouting` are the reads.
 *
 * Editing (Task 3.3): the field registry (lib/project/fields.ts) lists
 * every leaf of this project an approved control or an op can write; ONE
 * reactive observer below reads those fields after every write and hands
 * the changes to `history` (lib/project/history.ts — undo / redo, pure),
 * which tells `autosave` (lib/project/persistence.ts — the manifest and
 * the save lifecycle, pure; storage and timing are attached by the app
 * shell, lib/project/shell.ts). `clipboard` copies the registry's copyable
 * subset between channels of the same kind (lib/project/clipboard.ts) and
 * pastes inside one history transaction. None of these hold project state;
 * the one `$state` tree below is still the only project state in `src/`.
 *
 * Project lifecycle (Task 4.1): the tree is still the one project state,
 * but it is no longer always the fixture session — `loadProject` replaces
 * its contents with another project (reopened from a saved manifest, or
 * started empty; lib/project/lifecycle.ts decides which and talks to
 * storage), rebuilds the field registry in place, rebinds history to it
 * and re-arms the observer over the new fields. The views are forgotten
 * with the project they described; the clipboard is emptied (its payload
 * was another project's). Identity (`id`, `name`, `template`) travels with
 * the project, so a reopened project is the project that was saved.
 *
 * What is NOT here, on purpose: transient UI state (selected room or
 * channel, scroll, open menus — those stay in the rooms and components),
 * the clipboard's reactivity or any Edit menu (no control exists yet),
 * audio, analysis, sidechain relationships (Phase 7).
 */

import {
  RETURN_PARAMS,
  TONE_PARAM,
  busMeterOf,
  returnMeterOf,
  type BusMasterFixture,
  type ReturnStripFixture,
} from "../../components/channel-strip/bus-return-fixtures";
import type { ReturnLive } from "../../components/channel-strip/return-live";
import type { BusLive, SendReturnOption, TrackStripLive } from "../../components/channel-strip/strip-live";
import {
  DEFAULT_SEND_LEVEL,
  FADER_RANGE,
  PAN_RANGE,
  SEND_RANGE,
  SEND_SLOT_COUNT,
  TRIM_RANGE,
} from "../../components/channel-strip/track-strip-fixtures";
import type { TrackMetaLive } from "../../components/arrange-row-live";
import { isValidSource, type ArrangeTrack, type FamilyId, type ProminenceTier } from "../arrange";
import { setParamValue, type Mode } from "../mixer-chain";
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
  type ProjectTemplateId,
  type Arrangement,
  type ReturnBus,
  type ReturnBusId,
  type Track,
  type TrackId,
} from "./model";
import type { ArrangeClip } from "../arrange-timeline";
import {
  destinationsFor,
  routeOf,
  validateGraph,
  validateRoute,
  type RoutingDestination,
  type RoutingNodeId,
  type RoutingVerdict,
} from "./routing";
import { createEmptyProject } from "./templates";
import { untrack } from "svelte";
import { applyPaste, copyChannelSettings, pasteVerdict, type ChannelSettings, type PasteVerdict } from "./clipboard";
import { projectFields } from "./fields";
import { createHistory } from "./history";
import { buildManifest, createAutosave, serializeManifest } from "./persistence";

/* =========================================================================
   THE STATE
   ========================================================================= */

/**
 * The open project. Task 9.1.2 (owner): ALLOY boots with an EMPTY project, not the
 * 20-track development fixture. The fixture session is still the project model's
 * reference (it is what the dev playground and the fixture-based tests use), but a
 * new user who imports stems must never find their audio silent because a fixture
 * track they never touched is still soloed. See `createSessionProject` in
 * `./session` for the development session itself; it is no longer the default.
 */
const state: Project = $state(createEmptyProject("untitled-project", "Untitled project"));

/* =========================================================================
   EDITING (Task 3.3) — the registry, history, autosave, the observer
   ========================================================================= */

/** Every editable leaf of the project, by stable path (fields.ts). Channels are never added or removed within a project; `loadProject` rebuilds the list in place (same array) when the project changes. */
export const fieldRegistry = projectFields(state);

/** Undo / redo over the registry. The shell gives it a clock (coalescing); tests drive `observe()` directly. */
export const history = createHistory({ fields: fieldRegistry });

/** The save lifecycle over the manifest of the registry. The shell attaches storage + scheduling; until then nothing is ever reported saved. */
export const autosave = createAutosave({
  key: `alloy.project.${state.id}`,
  serialize: () => serializeManifest(buildManifest(state, fieldRegistry)),
  revision: () => history.revision,
});
history.subscribe(() => autosave.notifyChange());

/*
 * THE OBSERVER — the one effect in the store. It reads every registered
 * field, so any write to any of them (an op, a Task 2.8 helper, a
 * component's bypass toggle, a paste, a restore) re-runs it after the
 * writing block, and `history.observe()` records what moved as one entry.
 * Reads only; `history` is read untracked so recording never re-triggers
 * it. Restores (undo / redo) run with observation suspended inside
 * `history`, so they are never recorded as new edits.
 *
 * It is created by a function because a project switch (`loadProject`)
 * stops it and starts it again: an effect tracks the signals it read, and
 * after a load those are another project's — only a fresh run reads (and
 * from then on watches) the loaded fields.
 */
function startObserver(): () => void {
  return $effect.root(() => {
    $effect(() => {
      for (const f of fieldRegistry) f.get();
      untrack(() => history.observe());
    });
  });
}

let stopObserver = startObserver();

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
  /** The structure the project was built from (Task 4.1): the fixture session or the empty project. */
  get template(): ProjectTemplateId {
    return state.template;
  },
  /** No tracks, Returns or buses: every room shows its empty state (Task 4.1). */
  get isEmpty(): boolean {
    return state.tracks.length === 0 && state.returns.length === 0 && state.buses.length === 0;
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

  /* --- routing (Task 3.2) — pure reads over the references */

  /** The chain a channel takes to Master, itself first: `["track-01", "bus-B1", "master"]`. */
  routeOf(id: ChannelId): RoutingNodeId[] {
    return routeOf(state, id);
  },
  /** Master and every bus, each with the verdict `id` would get routing to it (valid ones to offer, the rest explained). */
  destinationsFor(id: ChannelId): RoutingDestination[] {
    return destinationsFor(state, id);
  },
  /** Is the whole graph valid right now? (It always is: every write is validated first.) */
  validateRouting(): RoutingVerdict {
    return validateGraph(state);
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
  /**
   * Point a send slot at a Return (a known one), or clear it (`null`). The
   * level is the slot's own, set separately (the strip writes it first —
   * Task 2.2 behaviour). Ownership follows the level the slot now carries
   * for that Return: at the Return's loaded level the send is Auto (the
   * session's value), at any other level it is Manual (the user carried a
   * level over); a cleared slot is Auto.
   */
  setSendTo(id: TrackId, slot: number, to: ReturnBusId | null): void {
    const t = mustTrack(id);
    const s = t.channel.sends[mustSlot(t, slot)];
    if (to !== null) mustReturn(to);
    if (s.to === to) return;
    s.to = to;
    const loaded = to === null ? SEND_RANGE.min : (t.loadedSendLevels[to] ?? DEFAULT_SEND_LEVEL);
    const mode: Mode = to === null || s.level === loaded ? "auto" : "manual";
    if (s.mode !== mode) s.mode = mode;
  },
  /**
   * The send knob moved: the level moves and — on an assigned slot — the
   * send becomes Manual (the Task 2.8 rule applied to sends, plan §8a). A
   * same-value write is not a turn; an unassigned slot has no send to own.
   */
  setSendLevel(id: TrackId, slot: number, value: number): void {
    const t = mustTrack(id);
    const s = t.channel.sends[mustSlot(t, slot)];
    const next = clamp(value, SEND_RANGE);
    if (next === s.level) return;
    s.level = next;
    if (s.to !== null && s.mode !== "manual") s.mode = "manual";
  },
  /** The send's Auto / Manual ownership, mode only — the level stays where it is (D2.8, kept by the owner for Task 3.2). */
  setSendMode(id: TrackId, slot: number, mode: Mode): void {
    const t = mustTrack(id);
    const s = t.channel.sends[mustSlot(t, slot)];
    if (s.mode !== mode) s.mode = mode;
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

  /* --- routing (Task 3.2): validate first, write only an accepted route.
         No control binds these yet (owner): the verdict is returned so the
         future output field can print its message as it is. */

  /** Route a track to a bus or Master. The project is unchanged unless the verdict is `ok`. */
  setTrackOutput(id: TrackId, to: OutputRef): RoutingVerdict {
    const t = mustTrack(id);
    const verdict = validateRoute(state, id, to);
    if (verdict.ok && t.output !== to) t.output = to;
    return verdict;
  },
  /** Route a bus to another bus or Master (bus-to-bus chaining, plan §5). Loops, self-routes and dangling references are rejected unchanged. */
  setBusOutput(id: BusId, to: OutputRef): RoutingVerdict {
    const b = mustBus(id);
    const verdict = validateRoute(state, id, to);
    if (verdict.ok && b.output !== to) b.output = to;
    return verdict;
  },
} as const;

/* =========================================================================
   CLIPBOARD (Task 3.3) — channel settings between channels of one kind.
   `held` is the application clipboard: not project data, not in history,
   not persisted. No control binds this yet (owner): the verdict is
   returned so a future Edit action can print its message as it is.
   ========================================================================= */

let held: ChannelSettings | null = null;

export const clipboard = {
  /** Read the copyable settings of a channel into the clipboard (and return them). Unknown id throws. */
  copy(id: ChannelId): ChannelSettings {
    held = copyChannelSettings(state, fieldRegistry, id);
    return held;
  },
  get held(): ChannelSettings | null {
    return held;
  },
  clear(): void {
    held = null;
  },
  /** Would this payload paste onto that channel? Nothing is written. */
  canPaste(id: ChannelId, payload: unknown = held): PasteVerdict {
    return pasteVerdict(state, fieldRegistry, payload, id);
  },
  /**
   * Paste onto a channel as ONE history entry. The verdict decides first; a
   * rejected or unchanged paste writes nothing.
   */
  paste(id: ChannelId, payload: unknown = held): PasteVerdict {
    const verdict = pasteVerdict(state, fieldRegistry, payload, id);
    if (!verdict.ok || verdict.changes === 0) return verdict;
    const target = project.channel(id);
    history.transaction(`Paste settings → ${target ? `${target.code} ${target.name}` : id}`, () => applyPaste(verdict.plan));
    return verdict;
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
    get meter() {
      /* Task 9.5: the strip meter's fixture reading — typed, not measured. */
      return returnMeterOf(r.id.slice("return-".length) as ReturnId);
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
    get meter() {
      /* Task 9.5: the strip meter's fixture reading — typed, not measured. */
      return busMeterOf();
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

/* =========================================================================
   LIFECYCLE (Task 4.1) — another project into the one tree
   ========================================================================= */

type LoadableProject = { -readonly [K in keyof Project]: Project[K] };

/**
 * Replace the project with `next` (a plain, complete, valid project — the
 * lifecycle validates before calling). Synchronous and whole: identity, the
 * channel lists and the arrangement move together; the registry is rebuilt
 * in place over the new entities; history is rebound (nothing to undo);
 * the views and the clipboard are forgotten; the observer is re-armed. The
 * caller (lib/project/lifecycle.ts) saves the outgoing project first and
 * retargets autosave right after.
 */
export function loadProject(next: Project): void {
  stopObserver();
  const target = state as LoadableProject;
  target.id = next.id;
  target.name = next.name;
  target.template = next.template;
  target.tracks = next.tracks;
  target.returns = next.returns;
  target.buses = next.buses;
  target.arrangement = next.arrangement;
  trackStrips.clear();
  trackMetas.clear();
  arrangeTracks.clear();
  returnLives.clear();
  returnStrips.clear();
  busLives.clear();
  busStrips.clear();
  held = null;
  fieldRegistry.splice(0, fieldRegistry.length, ...projectFields(state));
  history.rebind(fieldRegistry);
  stopObserver = startObserver();
}

/* =========================================================================
   IMPORTED AUDIO (Task 5.1) — tracks appended to the open project
   ========================================================================= */

/**
 * Append imported tracks (templates.ts `createImportedTrack`) to the open
 * project, with the arrangement grown for them. A structural change, not
 * an edit: the registry is rebuilt over the longer track list and history
 * is rebound (an import is not undoable — like a project switch, it leaves
 * nothing to undo), which bumps the revision so autosave writes the
 * manifest with its `tracks` block. The caller has already put the stems'
 * copies in the asset store: nothing is appended that is not stored.
 */
export function appendTracks(tracks: readonly Track[], arrangement: Arrangement): void {
  for (const t of tracks) {
    if (state.tracks.some((x) => x.id === t.id || x.code === t.code)) throw new Error(`track already in the project: ${t.id}`);
  }
  stopObserver();
  state.tracks.push(...tracks);
  (state as LoadableProject).arrangement = arrangement;
  fieldRegistry.splice(0, fieldRegistry.length, ...projectFields(state));
  history.rebind(fieldRegistry);
  stopObserver = startObserver();
}

/**
 * The drawn clips of a track — for an imported one, built from its stored
 * peaks once they are read (lib/project/assets.svelte.ts). Display data,
 * like the fixture's clips: not a field, not in history or the manifest.
 */
export function setTrackClips(id: TrackId, clips: readonly ArrangeClip[]): void {
  mustTrack(id);
  (state.arrangement.clips as Partial<Record<TrackId, readonly ArrangeClip[]>>)[id] = clips;
}

export type { ChannelId };
