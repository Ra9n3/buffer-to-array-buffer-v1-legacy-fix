/**
 * ALLOY — CHANNEL SETTINGS COPY / PASTE — Task 3.3.
 *
 * Pure functions over the field registry (fields.ts). The store wraps them
 * (`clipboard.copy`, `clipboard.paste`) and runs a paste inside one history
 * transaction, so it is one undo step.
 *
 * WHAT IS COPIED (D3.3.4 — the registry's `copyable` fields): the channel's
 * gain structure (trim, pan / balance, level) and its whole processing chain
 * — bypass flags, every parameter's value AND Auto / Manual mode, the
 * character selection and its mode (owner, Task 3.3: a paste carries value
 * and mode; the destination keeps its own loaded `original`). Nothing else
 * leaves the source: not its identity or classification, not its routing,
 * not its sends, not MUTE / SOLO.
 *
 * COMPATIBILITY (D3.3.4): a payload pastes onto a channel of the SAME KIND
 * — track → track, bus → bus, Return → Return of the same effect (a reverb's
 * decay is not a delay's time). The destination's identity, kind, code,
 * name, org, output, sends, baselines and chain STRUCTURE are untouched: a
 * paste only writes values into fields the destination already has.
 *
 * SAFETY: `pasteVerdict` validates everything — the payload's shape, the
 * destination, the kind, every path (it must be a copyable field of the
 * destination) and every value (its field's type and range) — BEFORE a
 * single write. A rejected paste changes nothing; an accepted one applies
 * all of its values. A paste whose values already match is accepted as
 * "unchanged" and writes nothing (so no history entry appears).
 */

import { fieldsOf, isValidValue, sameValue, type FieldRef, type FieldValue } from "./fields";
import type { Channel, ChannelId, Project } from "./model";

export const CLIPBOARD_SCHEMA = "alloy.channel-settings/1";

export interface ChannelSettings {
  readonly schema: typeof CLIPBOARD_SCHEMA;
  readonly kind: Channel["kind"];
  /** Returns only: the effect the chain belongs to. */
  readonly effect: string | null;
  readonly from: { readonly id: ChannelId; readonly code: string; readonly name: string };
  /** relative field path → value, copyable fields only, registry order. */
  readonly settings: Readonly<Record<string, FieldValue>>;
}

export type PasteReason =
  | "malformed"
  | "unknown-destination"
  | "kind-mismatch"
  | "effect-mismatch"
  | "shape-mismatch"
  | "invalid-value";

export interface PasteStep {
  readonly field: FieldRef;
  readonly value: FieldValue;
}

export interface PasteVerdict {
  readonly ok: boolean;
  readonly reason: PasteReason | null;
  /** Plain language, ready to print: "Pasted 36 settings from 01 Kick onto 03 Snare Bottom" / "Rejected: …". */
  readonly message: string;
  /** Fields whose value would change (0 = accepted but nothing to do). */
  readonly changes: number;
  /** Every write an accepted paste performs (changed fields only), in registry order. */
  readonly plan: readonly PasteStep[];
}

function channelOf(project: Project, id: ChannelId): Channel | undefined {
  return (
    project.tracks.find((t) => t.id === id) ??
    project.returns.find((r) => r.id === id) ??
    project.buses.find((b) => b.id === id)
  );
}

function effectOf(channel: Channel): string | null {
  return channel.kind === "return" ? channel.effect : null;
}

function kindName(kind: Channel["kind"]): string {
  return kind === "track" ? "track" : kind === "return" ? "Return" : "bus";
}

/** Read the copyable settings of a channel into a plain, JSON-safe payload. Throws on an unknown channel (a programming error). */
export function copyChannelSettings(project: Project, fields: readonly FieldRef[], id: ChannelId): ChannelSettings {
  const channel = channelOf(project, id);
  if (!channel) throw new Error(`unknown channel: ${id}`);
  const settings: Record<string, FieldValue> = {};
  for (const f of fieldsOf(fields, id)) if (f.copyable) settings[f.rel] = f.get();
  return {
    schema: CLIPBOARD_SCHEMA,
    kind: channel.kind,
    effect: effectOf(channel),
    from: { id: channel.id, code: channel.code, name: channel.name },
    settings,
  };
}

function rejected(reason: PasteReason, message: string): PasteVerdict {
  return { ok: false, reason, message: `Rejected: ${message}`, changes: 0, plan: [] };
}

function isPayload(value: unknown): value is ChannelSettings {
  if (!value || typeof value !== "object") return false;
  const p = value as Partial<ChannelSettings>;
  return (
    p.schema === CLIPBOARD_SCHEMA &&
    (p.kind === "track" || p.kind === "return" || p.kind === "bus") &&
    !!p.from &&
    typeof p.from.id === "string" &&
    !!p.settings &&
    typeof p.settings === "object"
  );
}

/** Decide a paste without touching anything. */
export function pasteVerdict(project: Project, fields: readonly FieldRef[], payload: unknown, destination: ChannelId): PasteVerdict {
  if (!isPayload(payload)) return rejected("malformed", "that is not a channel-settings payload");
  const target = channelOf(project, destination);
  if (!target) return rejected("unknown-destination", `no channel with id ${destination}`);
  const targetName = `${target.code} ${target.name}`;
  const sourceName = `${payload.from.code} ${payload.from.name}`;
  if (payload.kind !== target.kind) {
    return rejected("kind-mismatch", `${sourceName} is a ${kindName(payload.kind)} and ${targetName} is a ${kindName(target.kind)} — settings paste between channels of the same kind`);
  }
  if (target.kind === "return" && payload.effect !== target.effect) {
    return rejected("effect-mismatch", `${sourceName} is a ${payload.effect ?? "?"} Return and ${targetName} is a ${target.effect} Return — their chains differ`);
  }
  const copyable = new Map(fieldsOf(fields, destination).filter((f) => f.copyable).map((f) => [f.rel, f]));
  const plan: PasteStep[] = [];
  for (const [rel, value] of Object.entries(payload.settings)) {
    const field = copyable.get(rel);
    if (!field) return rejected("shape-mismatch", `${targetName} has no setting "${rel}"`);
    if (!isValidValue(field.type, value)) return rejected("invalid-value", `"${rel}" cannot take ${JSON.stringify(value)} on ${targetName}`);
    if (!sameValue(field.get(), value)) plan.push({ field, value });
  }
  // registry order, so a paste writes in the same order every time
  const order = new Map([...copyable.keys()].map((rel, i) => [rel, i]));
  plan.sort((a, b) => (order.get(a.field.rel) ?? 0) - (order.get(b.field.rel) ?? 0));
  const n = Object.keys(payload.settings).length;
  if (plan.length === 0) {
    return { ok: true, reason: null, message: `Unchanged: ${targetName} already has these ${n} settings`, changes: 0, plan };
  }
  return { ok: true, reason: null, message: `Pasted ${n} settings from ${sourceName} onto ${targetName} (${plan.length} changed)`, changes: plan.length, plan };
}

/** Perform an accepted plan. Returns the number of fields written. */
export function applyPaste(plan: readonly PasteStep[]): number {
  for (const step of plan) step.field.set(step.value);
  return plan.length;
}
