/**
 * ALLOY — the EDITABLE-FIELD REGISTRY — Task 3.3.
 *
 * One flat, typed list of every project leaf an approved control or a store
 * op can write, each under a stable id-based path ("track-03/chain/eq/lf/
 * gain/value"). The registry IS the editing boundary of Phase 3, and three
 * things consume it so they can never disagree about what a "project edit"
 * is:
 *
 *   - history (history.ts)       watches every field for changes and
 *                                restores fields by path — undo / redo;
 *   - autosave (persistence.ts)  serialises every field into the JSON
 *                                manifest (plan §11: "parameter values /
 *                                modes, routing, settings");
 *   - copy / paste (clipboard.ts) copies the `copyable` subset between
 *                                channels of the same kind.
 *
 * What is NOT a field, on purpose: identity that no control edits (`id`,
 * `code`, `kind`, `type`, `name`, `org`, `role`, `effect`, `short`), the
 * loaded baselines (`original`, `loadedSendLevels` — the engine's values,
 * never a user edit), fixture facts (`display`, `notes`, `gainReductionDb`,
 * `peakProtection`, `cleanup`, `dynamicDepthDb`), a Return's `output` (fixed
 * at Master by rule — owner, Task 3.2 — so there is nothing to edit or
 * restore), the Arrangement (fixture-backed, read-only until Phase 5), and
 * every piece of room-local UI state (selection, scroll, open menus), which
 * is not in the project at all. None of that can enter history, the
 * manifest or a paste because none of it is here.
 *
 * The COPYABLE boundary (D3.3.4): the channel's gain structure — `trim`,
 * `pan` / `balance`, `level` — and its whole processing chain (bypass
 * flags, every parameter's value AND mode, the character selection and its
 * mode). Not copyable: identity and classification (family, source type,
 * priority, tier confirmation), routing (`output`), the sends (destination,
 * level, mode — they are relationships with Returns, not settings), and the
 * performance switches MUTE / SOLO.
 *
 * The registry is built once over the live `$state` project (store), so the
 * getters read reactive proxies — inside an effect they are tracked, which
 * is how the store's observer learns of every write, wherever it came from
 * (an op, a Task 2.8 helper, a component's direct bypass toggle).
 */

import {
  FADER_RANGE,
  PAN_RANGE,
  SEND_RANGE,
  TRIM_RANGE,
} from "../../components/channel-strip/track-strip-fixtures";
import { FAMILIES } from "../arrange";
import { COMP_CHARACTERS, type ChainParam, type CharacterParam, type CompState, type EqState } from "../mixer-chain";
import { RETURN_CHARACTERS, type ReturnChainState } from "../return-chain";
import type { Bus, Channel, ChannelId, Project, ReturnBus, Track } from "./model";

/* =========================================================================
   SHAPES
   ========================================================================= */

/** Every value a field can hold. Flat on purpose: a field is a leaf. */
export type FieldValue = number | boolean | string | null;

export type FieldType =
  | { readonly kind: "number"; readonly min: number; readonly max: number; readonly values?: readonly number[] }
  | { readonly kind: "boolean" }
  | { readonly kind: "enum"; readonly values: readonly string[]; readonly nullable: boolean }
  /** Free text that another rule validates (a source type belongs to its family — `ops.setTrackSourceType`). */
  | { readonly kind: "text"; readonly nullable: boolean }
  /** A reference another rule validates (an output — routing.ts; a send destination — the Return list). */
  | { readonly kind: "ref"; readonly nullable: boolean };

export type FieldGroup = "identity" | "channel" | "send" | "routing" | "chain";

export interface FieldRef {
  /** Stable, id-based: `<channelId>/<rel>`. */
  readonly path: string;
  readonly channel: ChannelId;
  /** The path within the channel: "channel/level", "chain/eq/lf/gain/mode", "sends/0/to" … */
  readonly rel: string;
  readonly group: FieldGroup;
  /** In the copy / paste boundary (see the header). */
  readonly copyable: boolean;
  readonly type: FieldType;
  /** For a history label or a future Edit menu: "03 Snare Bottom · EQ LF gain". */
  readonly label: string;
  get(): FieldValue;
  set(value: FieldValue): void;
}

const MODES: readonly string[] = ["auto", "manual"];

/* =========================================================================
   VALIDATION — what a value must be to enter a field from outside (paste,
   a future load). The ops keep their own clamping; this is the gate for
   values that arrive already "final".
   ========================================================================= */

export function isValidValue(type: FieldType, value: FieldValue): boolean {
  switch (type.kind) {
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) return false;
      if (type.values) return type.values.includes(value);
      return value >= type.min && value <= type.max;
    case "boolean":
      return typeof value === "boolean";
    case "enum":
      if (value === null) return type.nullable;
      return typeof value === "string" && type.values.includes(value);
    case "text":
      if (value === null) return type.nullable;
      return typeof value === "string";
    case "ref":
      if (value === null) return type.nullable;
      return typeof value === "string" && value.length > 0;
  }
}

/** Two field values are the same (no epsilon: the ops write exact steps). */
export function sameValue(a: FieldValue, b: FieldValue): boolean {
  return a === b || (typeof a === "number" && typeof b === "number" && Number.isNaN(a) && Number.isNaN(b));
}

/* =========================================================================
   BUILDERS
   ========================================================================= */

function channelLabel(ch: Channel): string {
  return `${ch.code} ${ch.name}`;
}

interface Ctx {
  readonly channel: Channel;
  readonly out: FieldRef[];
}

function field(ctx: Ctx, rel: string, group: FieldGroup, copyable: boolean, type: FieldType, what: string, get: () => FieldValue, set: (v: FieldValue) => void): void {
  ctx.out.push({
    path: `${ctx.channel.id}/${rel}`,
    channel: ctx.channel.id,
    rel,
    group,
    copyable,
    type,
    label: `${channelLabel(ctx.channel)} · ${what}`,
    get,
    set,
  });
}

function paramType(param: ChainParam): FieldType {
  const s = param.spec;
  if (s.taper === "list") {
    const values = [...s.values];
    return { kind: "number", min: Math.min(...values), max: Math.max(...values), values };
  }
  return { kind: "number", min: s.min, max: s.max };
}

/** A chain parameter is two fields: its value and its ownership. Both copyable (owner, Task 3.3: a paste carries value and mode). */
function paramFields(ctx: Ctx, rel: string, what: string, param: ChainParam): void {
  field(ctx, `${rel}/value`, "chain", true, paramType(param), what, () => param.value, (v) => {
    param.value = v as number;
  });
  field(ctx, `${rel}/mode`, "chain", true, { kind: "enum", values: MODES, nullable: false }, `${what} mode`, () => param.mode, (v) => {
    param.mode = v as ChainParam["mode"];
  });
}

function characterFields(ctx: Ctx, rel: string, what: string, character: CharacterParam, ids: readonly string[]): void {
  field(ctx, `${rel}/value`, "chain", true, { kind: "enum", values: ids, nullable: false }, what, () => character.value, (v) => {
    character.value = v as string;
  });
  field(ctx, `${rel}/mode`, "chain", true, { kind: "enum", values: MODES, nullable: false }, `${what} mode`, () => character.mode, (v) => {
    character.mode = v as CharacterParam["mode"];
  });
}

function eqFields(ctx: Ctx, eq: EqState): void {
  field(ctx, "chain/eq/bypassed", "chain", true, { kind: "boolean" }, "EQ bypass", () => eq.bypassed, (v) => {
    eq.bypassed = v as boolean;
  });
  for (const band of eq.bands) {
    paramFields(ctx, `chain/eq/${band.band.id}/freq`, `EQ ${band.band.label} frequency`, band.freq);
    paramFields(ctx, `chain/eq/${band.band.id}/gain`, `EQ ${band.band.label} gain`, band.gain);
    if (band.q) paramFields(ctx, `chain/eq/${band.band.id}/q`, `EQ ${band.band.label} Q`, band.q);
  }
}

function compFields(ctx: Ctx, comp: CompState): void {
  field(ctx, "chain/comp/bypassed", "chain", true, { kind: "boolean" }, "compressor bypass", () => comp.bypassed, (v) => {
    comp.bypassed = v as boolean;
  });
  characterFields(ctx, "chain/comp/character", "compressor character", comp.character, COMP_CHARACTERS.map((c) => c.id));
  paramFields(ctx, "chain/comp/threshold", "compressor threshold", comp.threshold);
  paramFields(ctx, "chain/comp/ratio", "compressor ratio", comp.ratio);
  paramFields(ctx, "chain/comp/attack", "compressor attack", comp.attack);
  paramFields(ctx, "chain/comp/release", "compressor release", comp.release);
  paramFields(ctx, "chain/comp/makeup", "compressor make-up", comp.makeup);
}

function returnChainFields(ctx: Ctx, chain: ReturnChainState): void {
  field(ctx, "chain/bypassed", "chain", true, { kind: "boolean" }, "effect bypass", () => chain.bypassed, (v) => {
    chain.bypassed = v as boolean;
  });
  characterFields(ctx, "chain/character", "character", chain.character, RETURN_CHARACTERS[chain.effect].map((c) => c.id));
  paramFields(ctx, "chain/time", chain.time.spec.name, chain.time);
  paramFields(ctx, "chain/second", chain.second.spec.name, chain.second);
  paramFields(ctx, "chain/tone", chain.tone.spec.name, chain.tone);
}

function trackFields(t: Track, out: FieldRef[]): void {
  const ctx: Ctx = { channel: t, out };
  // identity / classification (Arrange row, Mixer identity) — never copied
  field(ctx, "familyId", "identity", false, { kind: "enum", values: FAMILIES.map((f) => f.familyId), nullable: true }, "family", () => t.familyId, (v) => {
    t.familyId = v as Track["familyId"];
  });
  field(ctx, "sourceTypeId", "identity", false, { kind: "text", nullable: true }, "source type", () => t.sourceTypeId, (v) => {
    t.sourceTypeId = v as string | null;
  });
  field(ctx, "priority", "identity", false, { kind: "number", min: 1, max: 10 }, "priority", () => t.priority, (v) => {
    t.priority = v as number;
  });
  field(ctx, "tierConfirmed", "identity", false, { kind: "boolean" }, "tier confirmed", () => t.tierConfirmed, (v) => {
    t.tierConfirmed = v as boolean;
  });
  // routing — never copied
  field(ctx, "output", "routing", false, { kind: "ref", nullable: false }, "output", () => t.output, (v) => {
    t.output = v as Track["output"];
  });
  // the Console strip
  const c = t.channel;
  field(ctx, "channel/trim", "channel", true, { kind: "number", min: TRIM_RANGE.min, max: TRIM_RANGE.max }, "trim", () => c.trim, (v) => {
    c.trim = v as number;
  });
  field(ctx, "channel/pan", "channel", true, { kind: "number", min: PAN_RANGE.min, max: PAN_RANGE.max }, "pan", () => c.pan, (v) => {
    c.pan = v as number;
  });
  field(ctx, "channel/level", "channel", true, { kind: "number", min: FADER_RANGE.min, max: FADER_RANGE.max }, "level", () => c.level, (v) => {
    c.level = v as number;
  });
  field(ctx, "channel/mute", "channel", false, { kind: "boolean" }, "mute", () => c.mute, (v) => {
    c.mute = v as boolean;
  });
  field(ctx, "channel/solo", "channel", false, { kind: "boolean" }, "solo", () => c.solo, (v) => {
    c.solo = v as boolean;
  });
  c.sends.forEach((s, i) => {
    field(ctx, `sends/${i}/to`, "send", false, { kind: "ref", nullable: true }, `send ${i + 1} destination`, () => s.to, (v) => {
      s.to = v as typeof s.to;
    });
    field(ctx, `sends/${i}/level`, "send", false, { kind: "number", min: SEND_RANGE.min, max: SEND_RANGE.max }, `send ${i + 1} level`, () => s.level, (v) => {
      s.level = v as number;
    });
    field(ctx, `sends/${i}/mode`, "send", false, { kind: "enum", values: MODES, nullable: false }, `send ${i + 1} mode`, () => s.mode, (v) => {
      s.mode = v as typeof s.mode;
    });
  });
  eqFields(ctx, t.chain.eq);
  compFields(ctx, t.chain.comp);
}

function returnFields(r: ReturnBus, out: FieldRef[]): void {
  const ctx: Ctx = { channel: r, out };
  const c = r.channel;
  field(ctx, "channel/level", "channel", true, { kind: "number", min: FADER_RANGE.min, max: FADER_RANGE.max }, "return level", () => c.level, (v) => {
    c.level = v as number;
  });
  field(ctx, "channel/mute", "channel", false, { kind: "boolean" }, "mute", () => c.mute, (v) => {
    c.mute = v as boolean;
  });
  field(ctx, "channel/solo", "channel", false, { kind: "boolean" }, "solo", () => c.solo, (v) => {
    c.solo = v as boolean;
  });
  returnChainFields(ctx, r.chain);
}

function busFields(b: Bus, out: FieldRef[]): void {
  const ctx: Ctx = { channel: b, out };
  field(ctx, "output", "routing", false, { kind: "ref", nullable: false }, "output", () => b.output, (v) => {
    b.output = v as Bus["output"];
  });
  const c = b.channel;
  field(ctx, "channel/trim", "channel", true, { kind: "number", min: TRIM_RANGE.min, max: TRIM_RANGE.max }, "bus trim", () => c.trim, (v) => {
    c.trim = v as number;
  });
  field(ctx, "channel/balance", "channel", true, { kind: "number", min: PAN_RANGE.min, max: PAN_RANGE.max }, "balance", () => c.balance, (v) => {
    c.balance = v as number;
  });
  field(ctx, "channel/level", "channel", true, { kind: "number", min: FADER_RANGE.min, max: FADER_RANGE.max }, "level", () => c.level, (v) => {
    c.level = v as number;
  });
  field(ctx, "channel/mute", "channel", false, { kind: "boolean" }, "mute", () => c.mute, (v) => {
    c.mute = v as boolean;
  });
  field(ctx, "channel/solo", "channel", false, { kind: "boolean" }, "solo", () => c.solo, (v) => {
    c.solo = v as boolean;
  });
  eqFields(ctx, b.chain.eq);
  compFields(ctx, b.chain.comp);
}

/** The fields of one channel, in a fixed order (identity, routing, channel, sends, chain). */
export function channelFields(channel: Channel): FieldRef[] {
  const out: FieldRef[] = [];
  if (channel.kind === "track") trackFields(channel, out);
  else if (channel.kind === "return") returnFields(channel, out);
  else busFields(channel, out);
  return out;
}

/** Every field of the project: tracks, then Returns, then buses — session order. */
export function projectFields(project: Project): FieldRef[] {
  const out: FieldRef[] = [];
  for (const t of project.tracks) trackFields(t, out);
  for (const r of project.returns) returnFields(r, out);
  for (const b of project.buses) busFields(b, out);
  return out;
}

/** The fields of one channel out of a project registry. */
export function fieldsOf(fields: readonly FieldRef[], channel: ChannelId): FieldRef[] {
  return fields.filter((f) => f.channel === channel);
}
