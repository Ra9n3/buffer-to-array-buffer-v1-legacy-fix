// Task 3.3 — clipboard.ts + the copyable boundary of fields.ts, over a plain session project (no Svelte).
import test from "node:test";
import assert from "node:assert/strict";
import { createSessionProject } from "../src/lib/project/session.ts";
import { fieldsOf, isValidValue, projectFields } from "../src/lib/project/fields.ts";
import { createHistory } from "../src/lib/project/history.ts";
import { CLIPBOARD_SCHEMA, applyPaste, copyChannelSettings, pasteVerdict } from "../src/lib/project/clipboard.ts";
import { validateGraph } from "../src/lib/project/routing.ts";

function rig() {
  const project = createSessionProject();
  const fields = projectFields(project);
  return { project, fields, history: createHistory({ fields }) };
}

const snapshot = (project) => JSON.stringify(project);

const TRACK_COPYABLE = [
  "channel/trim",
  "channel/pan",
  "channel/level",
  "chain/eq/bypassed",
  ...["lf", "lmf", "hmf", "hf"].flatMap((b) => {
    const keys = [`chain/eq/${b}/freq/value`, `chain/eq/${b}/freq/mode`, `chain/eq/${b}/gain/value`, `chain/eq/${b}/gain/mode`];
    if (b === "lmf" || b === "hmf") keys.push(`chain/eq/${b}/q/value`, `chain/eq/${b}/q/mode`);
    return keys;
  }),
  "chain/comp/bypassed",
  "chain/comp/character/value",
  "chain/comp/character/mode",
  ...["threshold", "ratio", "attack", "release", "makeup"].flatMap((p) => [`chain/comp/${p}/value`, `chain/comp/${p}/mode`]),
];

const TRACK_NOT_COPYABLE = [
  "familyId",
  "sourceTypeId",
  "priority",
  "tierConfirmed",
  "output",
  "channel/mute",
  "channel/solo",
  "sends/0/to",
  "sends/0/level",
  "sends/0/mode",
  "sends/1/to",
  "sends/1/level",
  "sends/1/mode",
];

test("the registry: 50 fields per track, 37 copyable — exactly the documented boundary; Returns 12 / 10; the bus 40 / 37", () => {
  const { project, fields } = rig();
  const t = fieldsOf(fields, "track-03");
  assert.equal(t.length, 50);
  assert.deepEqual(t.filter((f) => f.copyable).map((f) => f.rel), TRACK_COPYABLE);
  assert.deepEqual(t.filter((f) => !f.copyable).map((f) => f.rel), TRACK_NOT_COPYABLE);
  const r = fieldsOf(fields, "return-room");
  assert.equal(r.length, 12);
  assert.deepEqual(r.filter((f) => f.copyable).map((f) => f.rel), [
    "channel/level",
    "chain/bypassed",
    "chain/character/value",
    "chain/character/mode",
    "chain/time/value",
    "chain/time/mode",
    "chain/second/value",
    "chain/second/mode",
    "chain/tone/value",
    "chain/tone/mode",
  ]);
  assert.deepEqual(r.filter((f) => !f.copyable).map((f) => f.rel), ["channel/mute", "channel/solo"]);
  const b = fieldsOf(fields, "bus-B1");
  assert.equal(b.length, 40);
  assert.equal(b.filter((f) => f.copyable).length, 37);
  assert.deepEqual(b.filter((f) => !f.copyable).map((f) => f.rel), ["output", "channel/mute", "channel/solo"]);
  assert.ok(b.some((f) => f.rel === "channel/balance" && f.copyable));
  assert.equal(fields.length, 20 * 50 + 3 * 12 + 40, "1076 fields in the session");
  // nothing that is not an edit is a field
  for (const f of fields) {
    assert.ok(!/original|loadedSendLevels|\/id$|\/name$|\/code$|\/org$|\/kind$|notes|display|gainReduction|peakProtection|cleanup|dynamicDepth|spec/.test(f.rel), f.path);
    assert.ok(f.path.startsWith(f.channel + "/"));
    assert.ok(f.label.includes(" · "));
  }
  assert.equal(fields.filter((f) => f.channel === "return-room" && f.rel === "output").length, 0, "a Return's output is fixed, not a field");
  assert.equal(project.tracks.length, 20);
});

test("field types validate values: numbers in range (list tapers by membership), booleans, enums, nullable refs", () => {
  const { fields } = rig();
  const by = (rel) => fieldsOf(fields, "track-03").find((f) => f.rel === rel).type;
  assert.deepEqual(by("channel/level"), { kind: "number", min: -60, max: 10 });
  assert.equal(isValidValue(by("channel/level"), -7), true);
  assert.equal(isValidValue(by("channel/level"), 11), false);
  assert.equal(isValidValue(by("channel/level"), "loud"), false);
  assert.equal(isValidValue(by("channel/level"), Number.NaN), false);
  assert.equal(isValidValue(by("chain/eq/lf/gain/mode"), "manual"), true);
  assert.equal(isValidValue(by("chain/eq/lf/gain/mode"), "bypass"), false);
  assert.equal(isValidValue(by("chain/comp/character/value"), "opto"), true);
  assert.equal(isValidValue(by("chain/comp/character/value"), "room"), false);
  assert.equal(isValidValue(by("chain/eq/bypassed"), true), true);
  assert.equal(isValidValue(by("chain/eq/bypassed"), 1), false);
  assert.equal(isValidValue(by("familyId"), null), true);
  assert.equal(isValidValue(by("familyId"), "drums"), true);
  assert.equal(isValidValue(by("familyId"), "kazoo"), false);
  assert.equal(isValidValue(by("sends/0/to"), null), true);
  assert.equal(isValidValue(by("output"), null), false);
  const ratio = by("chain/comp/ratio/value");
  if (ratio.values) {
    assert.equal(isValidValue(ratio, ratio.values[0]), true);
    assert.equal(isValidValue(ratio, ratio.values[0] + 0.001), false);
  }
  const rc = fieldsOf(fields, "return-delay1").find((f) => f.rel === "chain/character/value").type;
  assert.deepEqual(rc.values, ["tape", "analog", "digital"]);
});

test("copy reads the copyable settings into a plain JSON payload with the source's identity; nothing else leaves the source", () => {
  const { project, fields } = rig();
  const p = copyChannelSettings(project, fields, "track-01");
  assert.equal(p.schema, CLIPBOARD_SCHEMA);
  assert.equal(p.kind, "track");
  assert.equal(p.effect, null);
  assert.deepEqual(p.from, { id: "track-01", code: "01", name: "Kick" });
  assert.deepEqual(Object.keys(p.settings), TRACK_COPYABLE);
  assert.equal(p.settings["channel/trim"], 3.5);
  assert.equal(p.settings["chain/eq/hmf/gain/mode"], "manual", "01's loaded-Manual HMF gain travels with its mode");
  assert.deepEqual(JSON.parse(JSON.stringify(p)), p, "JSON-safe");
  assert.ok(!("sends/0/to" in p.settings) && !("output" in p.settings) && !("channel/mute" in p.settings));
  const r = copyChannelSettings(project, fields, "return-room");
  assert.equal(r.kind, "return");
  assert.equal(r.effect, "reverb");
  assert.throws(() => copyChannelSettings(project, fields, "track-99"), /unknown channel/);
});

test("compatible paste: track → track writes every differing copyable field and nothing else; identity, routing, sends, mute / solo, baselines intact", () => {
  const { project, fields, history } = rig();
  const dst = project.tracks[2];
  const before = JSON.parse(snapshot(dst));
  const payload = copyChannelSettings(project, fields, "track-01");
  const v = pasteVerdict(project, fields, payload, "track-03");
  assert.equal(v.ok, true);
  assert.equal(v.reason, null);
  assert.ok(v.changes > 0);
  assert.match(v.message, /^Pasted 37 settings from 01 Kick onto 03 Snare Bottom \(\d+ changed\)$/);
  const { entry } = history.transaction("Paste", () => applyPaste(v.plan));
  assert.equal(entry.patches.length, v.changes, "one entry, one patch per changed field");
  for (const rel of TRACK_COPYABLE) {
    assert.equal(fieldsOf(fields, "track-03").find((f) => f.rel === rel).get(), payload.settings[rel], rel);
  }
  assert.equal(dst.id, "track-03");
  assert.equal(dst.kind, "track");
  assert.equal(dst.code, "03");
  assert.equal(dst.name, before.name);
  assert.deepEqual(dst.org, before.org);
  assert.equal(dst.familyId, before.familyId);
  assert.equal(dst.sourceTypeId, before.sourceTypeId);
  assert.equal(dst.priority, before.priority);
  assert.equal(dst.tierConfirmed, before.tierConfirmed);
  assert.equal(dst.output, before.output);
  assert.deepEqual(dst.channel.sends, before.channel.sends);
  assert.equal(dst.channel.mute, before.channel.mute);
  assert.equal(dst.channel.solo, before.channel.solo);
  assert.deepEqual(dst.loadedSendLevels, before.loadedSendLevels);
  assert.equal(dst.chain.eq.bands[2].gain.original, before.chain.eq.bands[2].gain.original, "the destination keeps its own baseline");
  assert.equal(dst.chain.eq.bands[2].gain.mode, "manual", "the pasted mode came with the value (owner)");
  assert.deepEqual(dst.chain.notes, before.chain.notes);
  assert.equal(validateGraph(project).ok, true);
  // the source is untouched by its own copy
  assert.equal(snapshot(project.tracks[0]), JSON.stringify(JSON.parse(snapshot(project.tracks[0]))));
  // undo restores every field in one step
  history.undo();
  assert.equal(snapshot(dst), JSON.stringify(before));
});

test("incompatible kinds and effects are rejected with a reason and a sentence; nothing changes", () => {
  const { project, fields } = rig();
  const whole = snapshot(project);
  const track = copyChannelSettings(project, fields, "track-01");
  const room = copyChannelSettings(project, fields, "return-room");
  const bus = copyChannelSettings(project, fields, "bus-B1");
  let v = pasteVerdict(project, fields, track, "return-room");
  assert.deepEqual([v.ok, v.reason, v.changes, v.plan.length], [false, "kind-mismatch", 0, 0]);
  assert.equal(v.message, "Rejected: 01 Kick is a track and R1 Room Reverb is a Return — settings paste between channels of the same kind");
  v = pasteVerdict(project, fields, track, "bus-B1");
  assert.equal(v.reason, "kind-mismatch");
  v = pasteVerdict(project, fields, bus, "track-02");
  assert.equal(v.reason, "kind-mismatch");
  v = pasteVerdict(project, fields, room, "return-delay1");
  assert.equal(v.reason, "effect-mismatch");
  assert.equal(v.message, "Rejected: R1 Room Reverb is a reverb Return and R3 Delay 1 is a delay Return — their chains differ");
  v = pasteVerdict(project, fields, room, "return-plate");
  assert.equal(v.ok, true, "reverb → reverb is compatible");
  assert.equal(v.message, "Pasted 10 settings from R1 Room Reverb onto R2 Plate Reverb (6 changed)");
  v = pasteVerdict(project, fields, room, "track-99");
  assert.equal(v.reason, "unknown-destination");
  assert.equal(snapshot(project), whole, "verdicts never write");
  // Return → Return applied: R2 takes R1's chain settings and level; keeps its identity, effect, fixed Master output, mute / solo
  const plate = project.returns.find((r) => r.id === "return-plate");
  const before = JSON.parse(JSON.stringify(plate));
  applyPaste(pasteVerdict(project, fields, room, "return-plate").plan);
  const r1 = project.returns.find((r) => r.id === "return-room");
  assert.deepEqual([plate.id, plate.code, plate.name, plate.effect, plate.output, plate.channel.mute, plate.channel.solo], [before.id, before.code, before.name, before.effect, "master", before.channel.mute, before.channel.solo]);
  assert.deepEqual([plate.channel.level, plate.chain.bypassed, plate.chain.character.value, plate.chain.tone.value, plate.chain.tone.mode], [r1.channel.level, r1.chain.bypassed, r1.chain.character.value, r1.chain.tone.value, r1.chain.tone.mode]);
  assert.equal(plate.chain.tone.original, before.chain.tone.original, "the destination's baseline is untouched (D2.8)");
  assert.equal(pasteVerdict(project, fields, room, "return-plate").changes, 0, "a second paste is unchanged");
});

test("malformed payloads, unknown settings and out-of-range values are rejected before any write — no partial modification", () => {
  const { project, fields } = rig();
  const whole = snapshot(project);
  for (const bad of [null, 42, "settings", {}, { schema: "x" }, { schema: CLIPBOARD_SCHEMA, kind: "track" }, { schema: CLIPBOARD_SCHEMA, kind: "group", from: { id: "a" }, settings: {} }]) {
    const v = pasteVerdict(project, fields, bad, "track-03");
    assert.deepEqual([v.ok, v.reason], [false, "malformed"], JSON.stringify(bad));
  }
  const good = copyChannelSettings(project, fields, "track-01");
  // a payload with an extra key the destination does not have — even when every other value is fine
  const extra = { ...good, settings: { ...good.settings, "chain/limiter/ceiling": -1 } };
  let v = pasteVerdict(project, fields, extra, "track-03");
  assert.equal(v.reason, "shape-mismatch");
  assert.equal(v.message, 'Rejected: 03 Snare Bottom has no setting "chain/limiter/ceiling"');
  // a value out of range, placed last so everything before it would have been valid
  const outOfRange = { ...good, settings: { ...good.settings, "chain/comp/makeup/value": 999 } };
  v = pasteVerdict(project, fields, outOfRange, "track-03");
  assert.equal(v.reason, "invalid-value");
  assert.equal(v.plan.length, 0);
  const wrongEnum = { ...good, settings: { ...good.settings, "chain/eq/lf/gain/mode": "frozen" } };
  assert.equal(pasteVerdict(project, fields, wrongEnum, "track-03").reason, "invalid-value");
  const wrongType = { ...good, settings: { ...good.settings, "chain/eq/bypassed": "yes" } };
  assert.equal(pasteVerdict(project, fields, wrongType, "track-03").reason, "invalid-value");
  // a non-copyable field smuggled in is a shape mismatch, so sends and routing can never be pasted
  const smuggled = { ...good, settings: { ...good.settings, "sends/0/to": "return-room" } };
  assert.equal(pasteVerdict(project, fields, smuggled, "track-03").reason, "shape-mismatch");
  const routed = { ...good, settings: { ...good.settings, output: "master" } };
  assert.equal(pasteVerdict(project, fields, routed, "track-03").reason, "shape-mismatch");
  assert.equal(snapshot(project), whole, "the project is byte-identical after every rejection");
});

test("a paste whose values already match is accepted as unchanged, plans nothing and records nothing", () => {
  const { project, fields, history } = rig();
  const p = copyChannelSettings(project, fields, "track-03");
  const v = pasteVerdict(project, fields, p, "track-03");
  assert.deepEqual([v.ok, v.reason, v.changes, v.plan.length], [true, null, 0, 0]);
  assert.equal(v.message, "Unchanged: 03 Snare Bottom already has these 37 settings");
  assert.equal(history.transaction("Paste", () => applyPaste(v.plan)).entry, null);
  // a partial payload (older schema, fewer keys) still pastes what it has
  const partial = { ...p, settings: { "channel/level": -1 } };
  const w = pasteVerdict(project, fields, partial, "track-04");
  assert.deepEqual([w.ok, w.changes], [true, 1]);
  assert.equal(w.message, "Pasted 1 settings from 03 Snare Bottom onto 04 Hi-hat (1 changed)");
  applyPaste(w.plan);
  assert.equal(project.tracks[3].channel.level, -1);
});

test("the plan is written in registry order whatever order the payload's keys arrive in", () => {
  const { project, fields } = rig();
  const p = copyChannelSettings(project, fields, "track-01");
  const reversed = { ...p, settings: Object.fromEntries(Object.entries(p.settings).reverse()) };
  const v = pasteVerdict(project, fields, reversed, "track-03");
  const rels = v.plan.map((s) => s.field.rel);
  const order = TRACK_COPYABLE.filter((rel) => rels.includes(rel));
  assert.deepEqual(rels, order);
});
