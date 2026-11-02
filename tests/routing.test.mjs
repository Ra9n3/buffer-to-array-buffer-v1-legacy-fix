// Task 3.2 — the routing graph rules, tested on their own (no store, no UI).
// Run: npm test   (node --import ./tests/register.mjs --test tests/*.test.mjs)
import { test } from "node:test";
import assert from "node:assert/strict";

const routing = await import("../src/lib/project/routing.ts");
const { validateRoute, validateGraph, routeOf, routingEdges, destinationsFor, isRoutable, routingName } = routing;

/* --- small graphs ------------------------------------------------------------ */

const track = (code, output, sends = []) => ({
  id: `track-${code}`,
  name: `Track ${code}`,
  output,
  channel: { sends: sends.map((to) => ({ to })) },
});
const ret = (key, output = "master") => ({ id: `return-${key}`, name: `Return ${key}`, output });
const bus = (code, output = "master") => ({ id: `bus-${code}`, name: `Bus ${code}`, output });

/** Tracks a, b → B1 → Master; c → Master; one Return fed by a. */
const simple = () => ({
  tracks: [track("a", "bus-B1", ["return-room"]), track("b", "bus-B1"), track("c", "master")],
  returns: [ret("room")],
  buses: [bus("B1")],
});

/** A three-bus chain: B1 → B2 → B3 → Master, track a → B1. */
const chain = () => ({
  tracks: [track("a", "bus-B1")],
  returns: [],
  buses: [bus("B1", "bus-B2"), bus("B2", "bus-B3"), bus("B3")],
});

/* --- valid routes -------------------------------------------------------------- */

test("valid Track → Bus → Master: accepted, and the route reads back to Master", () => {
  const p = simple();
  const v = validateRoute(p, "track-c", "bus-B1");
  assert.equal(v.ok, true);
  assert.equal(v.reason, null);
  assert.deepEqual(v.path, ["track-c", "bus-B1", "master"]);
  assert.equal(v.message, "Routed: Track c → Bus B1");
  assert.deepEqual(routeOf(p, "track-a"), ["track-a", "bus-B1", "master"]);
  assert.equal(validateGraph(p).ok, true);
});

test("valid Bus → Bus → Master: chaining is accepted and the whole graph stays valid", () => {
  const p = chain();
  const v = validateRoute(p, "bus-B1", "bus-B3"); // skip a link: B1 → B3 → Master
  assert.equal(v.ok, true);
  assert.deepEqual(v.path, ["bus-B1", "bus-B3", "master"]);
  assert.deepEqual(routeOf(p, "track-a"), ["track-a", "bus-B1", "bus-B2", "bus-B3", "master"]);
  assert.equal(validateGraph(p).ok, true);
  assert.equal(validateGraph(p).message, "Valid: 4 channels, every route reaches Master");
});

test("routing to the destination already set is accepted as unchanged", () => {
  const v = validateRoute(simple(), "track-a", "bus-B1");
  assert.equal(v.ok, true);
  assert.equal(v.message, "Unchanged: Track a → Bus B1");
});

test("Master is always a valid destination for a track or a bus", () => {
  const p = chain();
  assert.equal(validateRoute(p, "track-a", "master").ok, true);
  assert.equal(validateRoute(p, "bus-B1", "master").ok, true);
  assert.equal(validateRoute(p, "bus-B3", "master").message, "Unchanged: Bus B3 → Master");
});

/* --- invalid references --------------------------------------------------------- */

test("a missing bus id is a dangling reference and is rejected", () => {
  const v = validateRoute(simple(), "track-a", "bus-B9");
  assert.equal(v.ok, false);
  assert.equal(v.reason, "unknown-destination");
  assert.equal(v.message, "Rejected: no bus with id bus-B9");
});

test("a track or a Return is not a destination (only a bus or Master is)", () => {
  const p = simple();
  const toTrack = validateRoute(p, "track-a", "track-b");
  assert.equal(toTrack.reason, "destination-not-a-bus");
  assert.equal(toTrack.message, "Rejected: Track b is not a bus — a channel routes to a bus or to Master");
  const toReturn = validateRoute(p, "bus-B1", "return-room");
  assert.equal(toReturn.reason, "destination-not-a-bus");
  assert.equal(validateRoute(p, "track-a", "nonsense").reason, "destination-not-a-bus");
});

test("an unknown source is rejected", () => {
  const v = validateRoute(simple(), "track-zz", "master");
  assert.equal(v.reason, "unknown-source");
  assert.equal(v.message, "Rejected: no channel with id track-zz");
});

test("validateGraph reports a dangling output, a dangling send and a wrong-kind output", () => {
  const dangling = simple();
  dangling.tracks[1] = track("b", "bus-B7");
  assert.equal(validateGraph(dangling).reason, "unknown-destination");
  assert.equal(validateGraph(dangling).message, "Rejected: Track b routes to a bus that does not exist (bus-B7)");

  const danglingSend = simple();
  danglingSend.tracks[0] = track("a", "bus-B1", ["return-hall"]);
  assert.equal(validateGraph(danglingSend).reason, "unknown-destination");

  const wrongKind = simple();
  wrongKind.tracks[2] = track("c", "track-a");
  assert.equal(validateGraph(wrongKind).reason, "destination-not-a-bus");
});

/* --- self-routing ------------------------------------------------------------------- */

test("a bus cannot route into itself", () => {
  const v = validateRoute(simple(), "bus-B1", "bus-B1");
  assert.equal(v.ok, false);
  assert.equal(v.reason, "self-route");
  assert.equal(v.message, "Rejected: Bus B1 cannot route into itself");
  assert.deepEqual(v.path, ["bus-B1", "bus-B1"]);
  const p = simple();
  p.buses[0] = bus("B1", "bus-B1");
  assert.equal(validateGraph(p).reason, "self-route");
});

/* --- cycles --------------------------------------------------------------------------- */

test("a direct cycle (B1 → B2 → B1) is rejected with the loop spelled out", () => {
  const p = { tracks: [], returns: [], buses: [bus("B1", "bus-B2"), bus("B2")] };
  const v = validateRoute(p, "bus-B2", "bus-B1");
  assert.equal(v.ok, false);
  assert.equal(v.reason, "cycle");
  assert.deepEqual(v.path, ["bus-B2", "bus-B1", "bus-B2"]);
  assert.equal(v.message, "Rejected: Bus B2 → Bus B1 → Bus B2 would loop");
});

test("an indirect cycle (B3 → B1 while B1 → B2 → B3) is rejected", () => {
  const p = chain();
  const v = validateRoute(p, "bus-B3", "bus-B1");
  assert.equal(v.reason, "cycle");
  assert.deepEqual(v.path, ["bus-B3", "bus-B1", "bus-B2", "bus-B3"]);
  assert.equal(v.message, "Rejected: Bus B3 → Bus B1 → Bus B2 → Bus B3 would loop");
  // the middle link too
  assert.equal(validateRoute(p, "bus-B2", "bus-B1").reason, "cycle");
});

test("validateGraph finds an existing loop even when no single change is proposed", () => {
  const p = { tracks: [track("a", "bus-B1")], returns: [], buses: [bus("B1", "bus-B2"), bus("B2", "bus-B3"), bus("B3", "bus-B1")] };
  const v = validateGraph(p);
  assert.equal(v.ok, false);
  assert.equal(v.reason, "cycle");
  assert.deepEqual(v.path, ["bus-B1", "bus-B2", "bus-B3", "bus-B1"]);
  assert.equal(v.message, "Rejected: Bus B1 → Bus B2 → Bus B3 → Bus B1 loops");
});

test("a route into a graph that already loops elsewhere is reported, never walked forever", () => {
  const p = { tracks: [track("a", "master")], returns: [], buses: [bus("B1", "bus-B2"), bus("B2", "bus-B1")] };
  const v = validateRoute(p, "track-a", "bus-B1");
  assert.equal(v.reason, "cycle");
  assert.match(v.message, /already loops$/);
  assert.deepEqual(routeOf(p, "bus-B1"), ["bus-B1", "bus-B2", "bus-B1"]);
});

/* --- Returns (owner, Task 3.2): fixed at Master, never a destination ------------------ */

test("a Return's output is fixed at Master: any other destination is rejected, Master is unchanged", () => {
  const p = simple();
  const v = validateRoute(p, "return-room", "bus-B1");
  assert.equal(v.ok, false);
  assert.equal(v.reason, "return-output-fixed");
  assert.equal(v.message, "Rejected: Return room is a Return — a Return always routes to Master (plan §8a)");
  assert.equal(validateRoute(p, "return-room", "master").ok, true);
  const bad = simple();
  bad.returns[0] = ret("room", "bus-B1");
  assert.equal(validateGraph(bad).reason, "return-output-fixed");
  assert.equal(isRoutable("return-room"), false);
  assert.equal(isRoutable("track-a"), true);
  assert.equal(isRoutable("bus-B1"), true);
});

test("sends are edges of the graph and keep their Return relationships intact", () => {
  const p = simple();
  const edges = routingEdges(p);
  assert.deepEqual(
    edges.filter((e) => e.kind === "send"),
    [{ from: "track-a", to: "return-room", kind: "send" }],
  );
  assert.equal(edges.filter((e) => e.kind === "output").length, 5);
  assert.equal(validateRoute(p, "track-a", "master").ok, true);
  assert.deepEqual(routingEdges(p).filter((e) => e.kind === "send"), edges.filter((e) => e.kind === "send"));
});

/* --- what a future output field will bind (owner: offer valid ones, explain the rest) ---- */

test("destinationsFor lists Master and every bus with its verdict — valid ones to offer, the rest explained", () => {
  const p = chain();
  const forB3 = destinationsFor(p, "bus-B3");
  assert.deepEqual(forB3.map((d) => [d.id, d.name, d.verdict.ok, d.verdict.reason]), [
    ["master", "Master", true, null],
    ["bus-B1", "Bus B1", false, "cycle"],
    ["bus-B2", "Bus B2", false, "cycle"],
    ["bus-B3", "Bus B3", false, "self-route"],
  ]);
  const forTrack = destinationsFor(p, "track-a");
  assert.deepEqual(forTrack.map((d) => d.verdict.ok), [true, true, true, true]);
  const forReturn = destinationsFor(simple(), "return-room");
  assert.deepEqual(forReturn.map((d) => [d.id, d.verdict.reason]), [["master", null], ["bus-B1", "return-output-fixed"]]);
});

test("names print as the channel's name, Master as Master, an unknown id as itself", () => {
  const p = simple();
  assert.equal(routingName(p, "master"), "Master");
  assert.equal(routingName(p, "bus-B1"), "Bus B1");
  assert.equal(routingName(p, "bus-B9"), "bus-B9");
});

test("validation never writes: the project is the same object graph before and after", () => {
  const p = chain();
  const before = JSON.stringify(p);
  validateRoute(p, "bus-B3", "bus-B1");
  validateRoute(p, "bus-B1", "bus-B1");
  validateRoute(p, "track-a", "bus-B9");
  validateGraph(p);
  destinationsFor(p, "bus-B2");
  assert.equal(JSON.stringify(p), before);
});
