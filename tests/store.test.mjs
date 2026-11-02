// Task 3.2 — the real store (its runes compiled by svelte/compiler at load time):
// routing through `ops`, a rejected route leaving the project untouched, the
// Auto / Manual ownership rules on shared state, the sends' ownership, and the
// Returns' identity. One module instance = the one store every room imports.
import { test } from "node:test";
import assert from "node:assert/strict";

const store = await import("../src/lib/project/store.svelte.ts");
const chainOps = await import("../src/lib/mixer-chain.ts");
const { SEND_RANGE, DEFAULT_SEND_LEVEL } = await import("../src/components/channel-strip/track-strip-fixtures.ts");
const { project, ops, trackStrip, returnLive, busLive, arrangeTrackOf, trackMeta } = store;
const { setParamValue, setMode, setAllModes, eqParams, compParams } = chainOps;

const snapshot = () => JSON.stringify({ tracks: project.tracks, returns: project.returns, buses: project.buses });
const chainParamsOf = (chain) => [...eqParams(chain.eq), ...compParams(chain.comp), chain.comp.character];
const modesOf = (chain) => chainParamsOf(chain).map((p) => p.mode);

/* --- the fixture graph ---------------------------------------------------------- */

test("the fixture session is a valid graph: 20 tracks → Mix Bus → Master, Returns → Master", () => {
  const v = project.validateRouting();
  assert.equal(v.ok, true, v.message);
  assert.equal(project.tracks.length, 20);
  assert.ok(project.tracks.every((t) => t.output === "bus-B1"));
  assert.ok(project.returns.every((r) => r.output === "master"));
  assert.deepEqual(project.buses.map((b) => [b.id, b.output]), [["bus-B1", "master"]]);
  assert.deepEqual(project.routeOf("track-01"), ["track-01", "bus-B1", "master"]);
  assert.deepEqual(project.routeOf("bus-B1"), ["bus-B1", "master"]);
  assert.deepEqual(project.routeOf("return-room"), ["return-room", "master"]);
  assert.equal(project.outputLabel(project.track("track-01").output), "Mix Bus");
});

/* --- routing through the store ---------------------------------------------------- */

test("Track → Master and back to the bus: accepted, written once, read by every face of the store", () => {
  const v = ops.setTrackOutput("track-01", "master");
  assert.equal(v.ok, true);
  assert.equal(v.message, "Routed: Kick → Master");
  assert.equal(project.track("track-01").output, "master");
  assert.equal(project.channel("track-01").output, "master"); // the Mixer's lookup
  assert.deepEqual(project.routeOf("track-01"), ["track-01", "master"]);
  assert.equal(project.validateRouting().ok, true);
  const back = ops.setTrackOutput("track-01", "bus-B1");
  assert.equal(back.ok, true);
  assert.deepEqual(project.routeOf("track-01"), ["track-01", "bus-B1", "master"]);
  assert.equal(ops.setTrackOutput("track-01", "bus-B1").message, "Unchanged: Kick → Mix Bus");
});

test("Bus → Master is the only route the one-bus session allows the bus; it is unchanged", () => {
  const v = ops.setBusOutput("bus-B1", "master");
  assert.equal(v.ok, true);
  assert.equal(v.message, "Unchanged: Mix Bus → Master");
});

test("a rejected route leaves the project exactly as it was", () => {
  const before = snapshot();
  const self = ops.setBusOutput("bus-B1", "bus-B1");
  assert.equal(self.ok, false);
  assert.equal(self.reason, "self-route");
  assert.equal(self.message, "Rejected: Mix Bus cannot route into itself");
  const missing = ops.setTrackOutput("track-02", "bus-B9");
  assert.equal(missing.reason, "unknown-destination");
  const toReturn = ops.setTrackOutput("track-02", "return-room");
  assert.equal(toReturn.reason, "destination-not-a-bus");
  const toTrack = ops.setBusOutput("bus-B1", "track-01");
  assert.equal(toTrack.reason, "destination-not-a-bus");
  assert.equal(snapshot(), before);
  assert.equal(project.validateRouting().ok, true);
});

test("an unknown source is a programming error (throws), like every other op; a Return has no output op", () => {
  assert.throws(() => ops.setTrackOutput("track-99", "master"), /unknown track: track-99/);
  assert.throws(() => ops.setBusOutput("bus-B9", "master"), /unknown bus: bus-B9/);
  assert.equal("setReturnOutput" in ops, false);
});

test("destinationsFor on the session: Master and Mix Bus, both valid for a track; the bus may not route into itself", () => {
  assert.deepEqual(project.destinationsFor("track-03").map((d) => [d.id, d.name, d.verdict.ok]), [
    ["master", "Master", true],
    ["bus-B1", "Mix Bus", true],
  ]);
  assert.deepEqual(project.destinationsFor("bus-B1").map((d) => [d.id, d.verdict.reason]), [
    ["master", null],
    ["bus-B1", "self-route"],
  ]);
  assert.deepEqual(project.destinationsFor("return-plate").map((d) => [d.id, d.verdict.reason]), [
    ["master", null],
    ["bus-B1", "return-output-fixed"],
  ]);
});

/* --- Returns keep their identity and sends ------------------------------------------- */

test("Return ids, kinds, sends-in lists and chains are untouched by routing edits", () => {
  const identity = () => project.returns.map((r) => [r.id, r.kind, r.code, r.name, r.output, r.chain.effect]);
  const sendsIn = () => project.returns.map((r) => project.sendsInto(r.id).map((s) => s.code));
  const idBefore = identity();
  const sendsBefore = sendsIn();
  assert.deepEqual(idBefore.map((r) => r[0]), ["return-room", "return-plate", "return-delay1"]);
  assert.deepEqual(sendsBefore[1], ["02", "03", "12", "14", "15", "16"]);
  ops.setTrackOutput("track-02", "master");
  ops.setTrackOutput("track-12", "master");
  ops.setBusOutput("bus-B1", "bus-B1");
  ops.setTrackOutput("track-02", "bus-B1");
  ops.setTrackOutput("track-12", "bus-B1");
  assert.deepEqual(identity(), idBefore);
  assert.deepEqual(sendsIn(), sendsBefore);
});

/* --- Auto / Manual on shared state ------------------------------------------------------ */

test("editing one chain parameter makes only that parameter Manual; nothing else moves", () => {
  const t = project.track("track-03");
  const chain = t.chain;
  const params = chainParamsOf(chain);
  const target = chain.eq.bands[0].gain;
  const index = params.indexOf(target);
  const before = modesOf(chain);
  const valuesBefore = params.map((p) => p.value);
  const othersBefore = project.tracks.filter((x) => x !== t).map((x) => modesOf(x.chain));
  setParamValue(target, target.value + 1);
  const after = modesOf(chain);
  assert.equal(after[index], "manual");
  assert.equal(target.value, valuesBefore[index] + 1);
  assert.equal(target.original, valuesBefore[index]);
  after.forEach((mode, i) => {
    if (i !== index) assert.equal(mode, before[i], `param ${i} changed mode`);
  });
  params.forEach((p, i) => {
    if (i !== index) assert.equal(p.value, valuesBefore[i], `param ${i} changed value`);
  });
  assert.deepEqual(project.tracks.filter((x) => x !== t).map((x) => modesOf(x.chain)), othersBefore);
});

test("returning a parameter to Auto changes ownership only — the value stays (D2.8, kept by the owner for 3.2)", () => {
  const target = project.track("track-03").chain.eq.bands[0].gain;
  const edited = target.value;
  assert.notEqual(edited, target.original);
  setMode(target, "auto");
  assert.equal(target.mode, "auto");
  assert.equal(target.value, edited);
  assert.equal(target.original, target.original);
  setMode(target, "manual");
  assert.equal(target.value, edited);
});

test("ALL AUTO / ALL MANUAL write modes only; values and originals are untouched", () => {
  const chain = project.track("track-04").chain;
  const params = eqParams(chain.eq);
  const values = params.map((p) => [p.value, p.original]);
  setAllModes(params, "manual");
  assert.ok(params.every((p) => p.mode === "manual"));
  setAllModes(params, "auto");
  assert.ok(params.every((p) => p.mode === "auto"));
  assert.deepEqual(params.map((p) => [p.value, p.original]), values);
});

test("the Return strip's binding: a turn is Manual, a same-value write is not a turn, the panel reads the same chain", () => {
  const live = returnLive("return-room");
  const chain = project.returnBus("return-room").chain;
  assert.equal(chain.time.mode, "auto");
  live.time = chain.time.value; // same value: not a turn
  assert.equal(chain.time.mode, "auto");
  live.time = 1.9;
  assert.equal(chain.time.value, 1.9);
  assert.equal(chain.time.mode, "manual");
  assert.equal(chain.second.mode, "auto");
  assert.equal(chain.tone.mode, "auto");
  assert.equal(returnLive("return-room"), live); // one binding per Return for the life of the store
});

test("Manual values survive unrelated edits elsewhere in the project", () => {
  const target = project.track("track-03").chain.eq.bands[0].gain;
  const held = target.value;
  setMode(target, "manual");
  ops.setTrackTrim("track-03", 1.5);
  ops.setTrackOutput("track-03", "master");
  ops.setTrackOutput("track-03", "bus-B1");
  ops.chooseTrackTier("track-03", "primary");
  setParamValue(project.track("track-04").chain.eq.bands[1].gain, 2);
  trackStrip("track-05").mute = true;
  busLive("bus-B1").trim = 0.5;
  assert.equal(target.mode, "manual");
  assert.equal(target.value, held);
});

/* --- sends: the plan §5 per-send ownership (Task 3.2 plumbing, no control yet) -------------- */

test("every loaded send starts Auto at its loaded level; the knob makes the send Manual; mode-only writes keep the level", () => {
  const t = project.track("track-05");
  const slot = t.channel.sends[0];
  assert.equal(slot.to, "return-room");
  assert.equal(slot.mode, "auto");
  assert.equal(slot.level, t.loadedSendLevels["return-room"]);
  const view = trackStrip("track-05").sends[0];
  view.level = slot.level; // same value: not a turn
  assert.equal(slot.mode, "auto");
  view.level = -10;
  assert.equal(slot.level, -10);
  assert.equal(slot.mode, "manual");
  assert.equal(t.channel.sends[1].mode, "auto");
  ops.setSendMode("track-05", 0, "auto");
  assert.equal(slot.mode, "auto");
  assert.equal(slot.level, -10);
});

test("assigning a Return the Task 2.2 way (level first, then destination): the loaded level is Auto, a carried level is Manual, a cleared slot is Auto", () => {
  const t = project.track("track-01");
  const slot = t.channel.sends[0];
  const view = trackStrip("track-01").sends[0];
  assert.equal(slot.to, null);
  assert.equal(slot.mode, "auto");
  // the strip writes the fixture / default level, then the destination
  view.level = t.loadedSendLevels["return-plate"] ?? DEFAULT_SEND_LEVEL;
  assert.equal(slot.mode, "auto", "an unassigned slot has no send to own");
  view.to = "return-plate";
  assert.equal(slot.to, "return-plate");
  assert.equal(slot.mode, "auto");
  // the user turns it, then carries the level to another Return
  view.level = -7;
  assert.equal(slot.mode, "manual");
  view.to = "return-room";
  assert.equal(slot.level, -7);
  assert.equal(slot.mode, "manual");
  // cleared (the strip writes the destination, then the OFF level)
  view.to = null;
  view.level = SEND_RANGE.min;
  assert.equal(slot.mode, "auto");
  assert.equal(slot.level, SEND_RANGE.min);
  assert.throws(() => (view.to = "bus-B1"), /not a Return bus id/);
});

/* --- the rooms read one object ---------------------------------------------------------- */

test("one store: the Console view, the Arrange row and the Mixer lookup reflect the same entity", () => {
  const t = project.track("track-07");
  ops.setTrackOutput("track-07", "master");
  trackMeta("track-07").tier = "background";
  trackStrip("track-07").solo = true;
  assert.equal(project.channel("track-07"), t);
  assert.equal(arrangeTrackOf("track-07").tier, "background");
  assert.equal(trackStrip("track-07").solo, true);
  assert.equal(t.channel.solo, true);
  assert.equal(t.output, "master");
  assert.equal(project.tierOf(t), "background");
  ops.setTrackOutput("track-07", "bus-B1");
});
