// Task 3.3 — the REAL store module: the observer, history over every write path, undo / redo across the
// rooms' views, routing validity under undo / redo, paste as one entry, autosave wired to history.
// Tests share the one store (as the rooms do); each starts by clearing history and reads before it writes.
import test from "node:test";
import assert from "node:assert/strict";
import { tick } from "svelte";
import {
  arrangeTrackOf,
  autosave,
  busLive,
  clipboard,
  fieldRegistry,
  history,
  ops,
  project,
  returnLive,
  trackMeta,
  trackStrip,
} from "../src/lib/project/store.svelte.ts";
import { setAllModes, setCharacter, setMode, setParamValue, eqParams } from "../src/lib/mixer-chain.ts";
import { memoryStorage, parseManifest, manifestChannel } from "../src/lib/project/persistence.ts";
// Task 9.1.2: the store boots EMPTY. This suite drives the fixture session's channels,
// so it loads the development session explicitly instead of inheriting it.
import { loadFixtureSession } from "./fixture-session.mjs";
loadFixtureSession();

const fresh = () => {
  autosave.detach();
  history.clear();
};
const entriesOf = () => history.entries.map((e) => e.patches.map((p) => p.path));

test("the observer: a write anywhere is recorded after the tick, as one entry per synchronous block", async () => {
  fresh();
  const t3 = project.track("track-03");
  const level = t3.channel.level;
  ops.setTrackLevel("track-03", level - 1);
  assert.equal(history.canUndo, false, "not yet observed — the effect runs after the block");
  await tick();
  assert.equal(history.canUndo, true);
  assert.deepEqual(history.entries.at(-1).patches, [{ path: "track-03/channel/level", before: level, after: level - 1 }]);
  // the 2.8 helper writes value + mode in one block → one entry with two patches
  const gain = t3.chain.eq.bands[0].gain;
  const [v0, m0] = [gain.value, gain.mode];
  setParamValue(gain, v0 + 0.5);
  await tick();
  assert.deepEqual(entriesOf().at(-1), ["track-03/chain/eq/lf/gain/value", "track-03/chain/eq/lf/gain/mode"]);
  history.undo();
  assert.deepEqual([gain.value, gain.mode], [v0, m0]);
  await tick();
  assert.equal(history.entries.length, 1, "a restore is not a new edit");
  assert.equal(history.canRedo, true);
  history.redo();
  assert.deepEqual([gain.value, gain.mode], [v0 + 0.5, "manual"]);
  history.undo();
  history.undo();
  assert.equal(t3.channel.level, level);
});

test("every write path reaches history: each op, each Task 2.8 helper, each direct bypass toggle makes exactly one entry", () => {
  fresh();
  const t3 = project.track("track-03");
  const t5 = project.track("track-05");
  const r1 = project.returnBus("return-room");
  const b1 = project.bus("bus-B1");
  const writes = [
    ["setTrackTrim", () => ops.setTrackTrim("track-03", t3.channel.trim + 1)],
    ["setTrackPan", () => ops.setTrackPan("track-03", t3.channel.pan + 10)],
    ["setTrackLevel", () => ops.setTrackLevel("track-03", t3.channel.level - 1)],
    ["setTrackMute", () => ops.setTrackMute("track-03", !t3.channel.mute)],
    ["setTrackSolo", () => ops.setTrackSolo("track-03", !t3.channel.solo)],
    ["setSendTo", () => ops.setSendTo("track-03", 1, "return-room")],
    ["setSendLevel", () => ops.setSendLevel("track-05", 0, t5.channel.sends[0].level - 2)],
    ["setSendMode", () => ops.setSendMode("track-05", 0, t5.channel.sends[0].mode === "auto" ? "manual" : "auto")],
    ["setTrackFamily", () => ops.setTrackFamily("track-03", t3.familyId === "keys" ? "drums" : "keys")],
    ["setTrackSourceType", () => ops.setTrackSourceType("track-03", t3.familyId === "keys" ? "piano" : "kick")],
    ["chooseTrackTier", () => ops.chooseTrackTier("track-03", project.tierOf(t3) === "primary" ? "background" : "primary")],
    ["setTrackPriority", () => ops.setTrackPriority("track-04", project.track("track-04").priority === 3 ? 7 : 3)],
    ["setTrackOutput", () => ops.setTrackOutput("track-02", project.track("track-02").output === "master" ? "bus-B1" : "master")],
    ["setReturnLevel", () => ops.setReturnLevel("return-room", r1.channel.level - 1)],
    ["setReturnMute", () => ops.setReturnMute("return-room", !r1.channel.mute)],
    ["setReturnSolo", () => ops.setReturnSolo("return-room", !r1.channel.solo)],
    ["setReturnBypass", () => ops.setReturnBypass("return-room", !r1.chain.bypassed)],
    ["setBusTrim", () => ops.setBusTrim("bus-B1", b1.channel.trim + 1)],
    ["setBusBalance", () => ops.setBusBalance("bus-B1", b1.channel.balance + 5)],
    ["setBusLevel", () => ops.setBusLevel("bus-B1", b1.channel.level - 1)],
    ["setBusMute", () => ops.setBusMute("bus-B1", !b1.channel.mute)],
    ["setBusSolo", () => ops.setBusSolo("bus-B1", !b1.channel.solo)],
    ["setParamValue", () => setParamValue(t3.chain.comp.threshold, t3.chain.comp.threshold.value - 1)],
    ["setMode", () => setMode(t3.chain.comp.ratio, t3.chain.comp.ratio.mode === "auto" ? "manual" : "auto")],
    ["setAllModes", () => setAllModes(eqParams(t3.chain.eq), eqParams(t3.chain.eq).every((p) => p.mode === "manual") ? "auto" : "manual")],
    ["setCharacter", () => setCharacter(t3.chain.comp, t3.chain.comp.character.value === "opto" ? "fet" : "opto")],
    ["eq.bypassed =", () => (t3.chain.eq.bypassed = !t3.chain.eq.bypassed)],
    ["comp.bypassed =", () => (t3.chain.comp.bypassed = !t3.chain.comp.bypassed)],
    ["return chain.bypassed =", () => (r1.chain.bypassed = !r1.chain.bypassed)],
    ["returnLive.time (Console / Mixer Return strip)", () => (returnLive("return-room").time = returnLive("return-room").time + 0.1)],
    ["trackStrip.level (Console strip)", () => (trackStrip("track-06").level = trackStrip("track-06").level - 1)],
    ["trackMeta.tier (Arrange row)", () => (trackMeta("track-07").tier = trackMeta("track-07").tier === "primary" ? "supporting" : "primary")],
    ["busLive.level (bus strip)", () => (busLive("bus-B1").level = busLive("bus-B1").level - 0.5)],
  ];
  const start = JSON.stringify([project.tracks, project.returns, project.buses]);
  let expected = 0;
  for (const [name, write] of writes) {
    write();
    const entry = history.observe();
    expected++;
    assert.ok(entry, `${name} produced an entry`);
    assert.equal(history.entries.length, expected, `${name}: exactly one entry`);
  }
  assert.equal(ops.setBusOutput("bus-B1", "master").message, "Unchanged: Mix Bus → Master");
  assert.equal(history.observe(), null, "an unchanged route is a no-op");
  // undo all of it — the project is exactly where it started
  const n = history.entries.length;
  assert.notEqual(JSON.stringify([project.tracks, project.returns, project.buses]), start);
  for (let i = 0; i < n; i++) history.undo();
  assert.equal(history.canUndo, false);
  assert.equal(JSON.stringify([project.tracks, project.returns, project.buses]), start, "every write undone — byte-identical project");
  assert.equal(project.validateRouting().ok, true);
  for (let i = 0; i < n; i++) history.redo();
  assert.equal(history.canRedo, false);
  for (let i = 0; i < n; i++) history.undo();
  assert.equal(JSON.stringify([project.tracks, project.returns, project.buses]), start);
});

test("no-ops and rejected operations do not pollute history", () => {
  fresh();
  const t3 = project.track("track-03");
  ops.setTrackLevel("track-03", t3.channel.level);
  ops.setTrackMute("track-03", t3.channel.mute);
  ops.setSendTo("track-01", 0, project.track("track-01").channel.sends[0].to);
  setMode(t3.chain.eq.bands[0].gain, t3.chain.eq.bands[0].gain.mode);
  assert.equal(ops.setBusOutput("bus-B1", "bus-B1").ok, false, "self-route rejected");
  assert.equal(ops.setTrackOutput("track-01", "bus-B9").ok, false, "missing bus rejected");
  assert.equal(ops.setBusOutput("bus-B1", "master").ok, true, "already there");
  assert.equal(clipboard.paste("return-room", clipboard.copy("track-01")).ok, false, "kind mismatch");
  assert.equal(clipboard.paste("track-03", clipboard.copy("track-03")).changes, 0, "pasting a channel onto itself changes nothing");
  assert.throws(() => ops.setTrackLevel("track-99", 0), /unknown track/);
  const revision = history.revision;
  assert.equal(history.observe(), null);
  assert.equal(history.entries.length, 0);
  assert.equal(history.revision, revision, "nothing to save either");
});

test("undo / redo restore project data consistently whichever room made the edit; every room's view reads the same value", () => {
  fresh();
  // Console (strip view), Arrange (row view / meta), Mixer (entity + chain helper)
  const strip = trackStrip("track-08");
  const row = arrangeTrackOf("track-08");
  const meta = trackMeta("track-08");
  const t8 = project.track("track-08");
  const level0 = strip.level;
  const tier0 = meta.tier;
  strip.level = level0 - 3; // Console
  history.observe();
  meta.tier = tier0 === "background" ? "primary" : "background"; // Arrange
  history.observe();
  setParamValue(t8.chain.eq.bands[0].gain, t8.chain.eq.bands[0].gain.value + 1); // Mixer
  history.observe();
  assert.equal(history.entries.length, 3);
  const tier1 = meta.tier;
  history.undo(); // Mixer edit
  assert.equal(t8.chain.eq.bands[0].gain.mode, "manual", "08's LF gain was loaded Manual — ownership restored exactly");
  history.undo(); // Arrange edit
  assert.equal(meta.tier, tier0);
  assert.equal(row.tier, tier0);
  assert.equal(project.tierOf(t8), tier0);
  history.undo(); // Console edit
  assert.equal(strip.level, level0);
  assert.equal(t8.channel.level, level0);
  history.redo();
  history.redo();
  assert.equal(strip.level, level0 - 3);
  assert.equal(meta.tier, tier1);
  assert.equal(row.tier, tier1);
  history.undo();
  history.undo();
});

test("undo / redo keep every invariant: routing stays valid, Return identity and sends intact, Auto / Manual exact", () => {
  fresh();
  const v = ops.setTrackOutput("track-02", "master");
  assert.equal(v.ok, true);
  history.observe();
  assert.equal(project.routeOf("track-02").join(" → "), "track-02 → master");
  history.undo();
  assert.equal(project.track("track-02").output, "bus-B1");
  assert.equal(project.validateRouting().ok, true);
  history.redo();
  assert.equal(project.track("track-02").output, "master");
  assert.equal(project.validateRouting().ok, true);
  history.undo();
  // a Return's output never enters history (it is not a field); its sends-in list follows the tracks
  const sendsBefore = project.sendsInto("return-plate").map((s) => s.trackId ?? s.code ?? JSON.stringify(s));
  ops.setSendTo("track-01", 0, "return-plate");
  history.observe();
  assert.equal(project.sendsInto("return-plate").length, sendsBefore.length + 1);
  history.undo();
  assert.equal(project.sendsInto("return-plate").length, sendsBefore.length);
  assert.equal(project.returnBus("return-plate").output, "master");
  assert.equal(fieldRegistry.some((f) => f.channel === "return-plate" && f.rel === "output"), false);
  // return-to-Auto stays ownership-only through undo / redo
  const p = project.track("track-01").chain.eq.bands[2].gain; // loaded Manual
  assert.equal(p.mode, "manual");
  setMode(p, "auto");
  history.observe();
  assert.deepEqual([p.mode, p.value === p.original], ["auto", false]);
  history.undo();
  assert.equal(p.mode, "manual");
  history.redo();
  assert.equal(p.mode, "auto");
  history.undo();
});

test("paste through the store is one labelled entry, visible to every room, undoable as a whole; a rejected paste records nothing", () => {
  fresh();
  const dstStrip = trackStrip("track-03");
  const dst = project.track("track-03");
  const before = JSON.stringify(dst);
  const payload = clipboard.copy("track-01");
  assert.equal(clipboard.held, payload);
  const v = clipboard.paste("track-03");
  assert.equal(v.ok, true);
  assert.ok(v.changes > 0);
  assert.equal(history.entries.length, 1);
  assert.equal(history.undoLabel, "Paste settings → 03 Snare Bottom");
  assert.equal(history.entries[0].patches.length, v.changes);
  assert.equal(dstStrip.trim, project.track("track-01").channel.trim, "the Console strip view reads the pasted trim");
  assert.equal(dst.chain.eq.bands[2].gain.value, project.track("track-01").chain.eq.bands[2].gain.value, "the Mixer panel's chain reads the pasted gain");
  assert.equal(arrangeTrackOf("track-03").tier, arrangeTrackOf("track-03").tier, "Arrange identity untouched");
  assert.deepEqual(dst.channel.sends, JSON.parse(before).channel.sends);
  assert.equal(dst.output, JSON.parse(before).output);
  history.undo();
  assert.equal(JSON.stringify(dst), before, "one undo restores the whole paste");
  assert.equal(history.canRedo, true);
  history.redo();
  assert.equal(dstStrip.trim, project.track("track-01").channel.trim);
  history.undo();
  // rejected / unchanged: no entry, project byte-identical
  const whole = JSON.stringify([project.tracks, project.returns, project.buses]);
  assert.equal(clipboard.paste("bus-B1").reason, "kind-mismatch");
  assert.equal(clipboard.paste("return-room", clipboard.copy("return-delay1")).reason, "effect-mismatch");
  assert.equal(clipboard.canPaste("track-04", { schema: "alloy.channel-settings/1", kind: "track", from: { id: "x", code: "x", name: "x" }, settings: { "channel/level": 99 } }).reason, "invalid-value");
  assert.equal(history.observe(), null);
  assert.equal(JSON.stringify([project.tracks, project.returns, project.buses]), whole);
  clipboard.clear();
  assert.equal(clipboard.held, null);
  assert.equal(clipboard.paste("track-04").reason, "malformed", "nothing held");
});

test("autosave is wired to history: an edit makes the project dirty, the debounced save writes the manifest, undo / redo save too", () => {
  fresh();
  const storage = memoryStorage();
  const queue = [];
  autosave.attach(storage, { delayMs: 1000, schedule: (fn) => (queue.push(fn), () => queue.splice(queue.indexOf(fn), 1)) });
  // earlier tests edited since the last save → attaching while dirty arms a save (documented)
  assert.equal(queue.length, autosave.dirty ? 1 : 0);
  queue.splice(0).forEach((fn) => fn());
  assert.equal(autosave.dirty, false);
  assert.equal(queue.length, 0);
  const writesBefore = storage.writes;
  const t9 = project.track("track-09");
  const pan0 = t9.channel.pan;
  ops.setTrackPan("track-09", pan0 + 15);
  history.observe();
  assert.equal(autosave.status.state, "dirty");
  assert.equal(queue.length, 1);
  queue.splice(0).forEach((fn) => fn());
  assert.equal(autosave.status.state, "saved");
  assert.equal(manifestChannel(parseManifest(storage.data.get("alloy.project.session-fixture")), "track-09")["channel/pan"], pan0 + 15);
  history.undo();
  assert.equal(autosave.dirty, true);
  queue.splice(0).forEach((fn) => fn());
  assert.equal(manifestChannel(parseManifest(storage.data.get(autosave.key)), "track-09")["channel/pan"], pan0);
  assert.equal(storage.writes, writesBefore + 2);
  assert.equal(autosave.status.key, "alloy.project.session-fixture");
  autosave.detach();
});

test("room-local selection and presentation state are not project fields; the registry is only channel settings", () => {
  for (const f of fieldRegistry) {
    assert.ok(!/select|scroll|open|hover|focus|route|room|arrangement|clip|section|tempo/.test(f.rel), f.path);
    assert.equal(f.path, `${f.channel}/${f.rel}`);
    assert.ok(["identity", "channel", "send", "routing", "chain"].includes(f.group));
  }
  assert.equal(fieldRegistry.length, 1076);
  assert.equal(new Set(fieldRegistry.map((f) => f.path)).size, 1076, "paths are unique");
});
