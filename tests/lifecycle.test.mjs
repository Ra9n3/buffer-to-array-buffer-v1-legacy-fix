// Task 4.1 — the project lifecycle against the shared store: the recent list from what is actually
// stored, start-empty under a new identity, reopening = template + saved values, entries that cannot
// be opened said so and never opened, restore at start, and the fixture workflow intact.
//
// One module-level store: every test ends by putting the pristine fixture session back.
import test from "node:test";
import assert from "node:assert/strict";
import {
  RECENT_KEY,
  RECENT_LIMIT,
  RECENT_SCHEMA,
  UNAVAILABLE_DETAIL,
  lifecycle,
  parseRecentIndex,
  projectKey,
  serializeRecentIndex,
} from "../src/lib/project/lifecycle.ts";
import {
  autosave,
  clipboard,
  fieldRegistry,
  history,
  loadProject,
  ops,
  project,
  arrangeTrackOf,
  trackStrip,
} from "../src/lib/project/store.svelte.ts";
import { SESSION_PROJECT_ID, createSessionProject } from "../src/lib/project/session.ts";
import { EMPTY_PROJECT_NAME } from "../src/lib/project/templates.ts";
import { MANIFEST_SCHEMA, buildManifest, memoryStorage, parseManifest, serializeManifest } from "../src/lib/project/persistence.ts";
import { projectFields } from "../src/lib/project/fields.ts";

/** A rig: memory storage, a counting clock, predictable ids; autosave attached the way the shell does it. */
function rig({ storage = memoryStorage(), ids = ["project-a", "project-b", "project-c", "project-d"] } = {}) {
  reset();
  let tick = 0;
  const now = () => `2026-11-02T10:00:${String(tick++).padStart(2, "0")}.000Z`;
  let n = 0;
  const newId = () => ids[n++ % ids.length];
  const schedule = { queue: [], run() { this.queue.splice(0).forEach((t) => t.fn()); } };
  if (storage) {
    autosave.attach(storage, {
      delayMs: 1000,
      schedule: (fn, ms) => {
        const t = { fn, ms };
        schedule.queue.push(t);
        return () => schedule.queue.splice(schedule.queue.indexOf(t), 1);
      },
    });
  }
  lifecycle.attach({ storage, now, newId });
  return { storage, schedule, now, newId };
}

function reset() {
  autosave.detach();
  lifecycle.detach();
  clipboard.clear();
  loadProject(createSessionProject());
  history.clear();
  // the app's invariant: autosave's key is the open project's, and a project that nothing has
  // changed yet is clean (the shell boots that way with the fixture)
  autosave.retarget(projectKey(SESSION_PROJECT_ID), null);
}

const index = (storage) => parseRecentIndex(storage.data.get(RECENT_KEY) ?? "") ?? [];

test("without storage: nothing listed, no reopening, start-empty still works (unstored, and says so)", () => {
  rig({ storage: null });
  assert.equal(lifecycle.attached, true);
  assert.equal(lifecycle.storage, null);
  assert.deepEqual(lifecycle.recent(), []);
  assert.deepEqual(lifecycle.open("anything"), { ok: false, reason: "unknown", detail: "Not in the recent projects" });
  const r = lifecycle.startEmpty();
  assert.equal(r.ok, true);
  assert.equal(r.stored, false);
  assert.equal(r.error, UNAVAILABLE_DETAIL["no-storage"]);
  assert.equal(project.id, "project-a");
  assert.equal(project.isEmpty, true);
  assert.deepEqual(lifecycle.recent(), [], "no storage, no list — nothing is claimed");
  assert.equal(lifecycle.restoreLast().outcome, "fixture");
  reset();
});

test("the index: schema, newest first, malformed and duplicate entries dropped, junk → nothing", () => {
  assert.equal(RECENT_SCHEMA, "alloy.projects/1");
  assert.equal(RECENT_KEY, "alloy.projects");
  assert.equal(RECENT_LIMIT, 12);
  assert.equal(projectKey("project-x"), "alloy.project.project-x");
  const text = serializeRecentIndex([
    { id: "a", name: "A", template: "empty", openedAt: "2026-01-01T00:00:01.000Z" },
    { id: "b", name: "B", template: "session-fixture", openedAt: "2026-01-01T00:00:02.000Z" },
  ]);
  assert.deepEqual(JSON.parse(text).schema, RECENT_SCHEMA);
  assert.deepEqual(parseRecentIndex(text).map((e) => e.id), ["b", "a"], "newest first whatever the stored order");
  const mixed = JSON.stringify({
    schema: RECENT_SCHEMA,
    entries: [
      { id: "ok", name: "Fine", template: "empty", openedAt: "2026-01-01T00:00:00.000Z" },
      { id: "", name: "no id", template: "empty", openedAt: "2026-01-01T00:00:00.000Z" },
      { id: "t", name: "bad template", template: "mystery", openedAt: "2026-01-01T00:00:00.000Z" },
      { id: "n", template: "empty", openedAt: "2026-01-01T00:00:00.000Z" },
      { id: "d", name: "no date", template: "empty" },
      { id: "ok", name: "duplicate", template: "empty", openedAt: "2026-01-01T00:00:00.000Z" },
      null,
      "string",
    ],
  });
  assert.deepEqual(parseRecentIndex(mixed).map((e) => e.id), ["ok"]);
  assert.equal(parseRecentIndex("not json"), null);
  assert.equal(parseRecentIndex("[]"), null);
  assert.equal(parseRecentIndex(JSON.stringify({ schema: "alloy.projects/2", entries: [] })), null);
  assert.deepEqual(parseRecentIndex(JSON.stringify({ schema: RECENT_SCHEMA, entries: [] })), []);
});

test("recent(): entries come from the stored index and each is judged against its stored copy — never presented as openable without one", () => {
  const { storage } = rig();
  assert.deepEqual(lifecycle.recent(), [], "nothing stored yet (the shell's restoreLast records the first entry; here it has not run)");
  assert.equal(storage.data.size, 0, "listing writes nothing");
  const stamp = "2026-11-01T09:00:00.000Z";
  const entries = [
    { id: SESSION_PROJECT_ID, name: "Fixture session", template: "session-fixture", openedAt: "2026-11-01T09:00:06.000Z" },
    { id: "project-ready", name: "Ready one", template: "empty", openedAt: "2026-11-01T09:00:05.000Z" },
    { id: "project-missing", name: "Missing copy", template: "empty", openedAt: "2026-11-01T09:00:04.000Z" },
    { id: "project-damaged", name: "Damaged copy", template: "empty", openedAt: "2026-11-01T09:00:03.000Z" },
    { id: "project-mismatch", name: "Someone else's copy", template: "empty", openedAt: "2026-11-01T09:00:02.000Z" },
    { id: "project-unknown", name: "Unknown structure", template: "empty", openedAt: "2026-11-01T09:00:01.000Z" },
    { id: "project-invalid", name: "Bad routing", template: "session-fixture", openedAt: stamp },
  ];
  storage.data.set(RECENT_KEY, serializeRecentIndex(entries));
  const ready = { schema: MANIFEST_SCHEMA, project: { id: "project-ready", name: "Ready one", template: "empty" }, channels: {} };
  storage.data.set(projectKey("project-ready"), JSON.stringify(ready));
  storage.data.set(projectKey("project-damaged"), "{not a manifest");
  storage.data.set(projectKey("project-mismatch"), JSON.stringify({ ...ready, project: { ...ready.project, id: "project-other" } }));
  storage.data.set(projectKey("project-unknown"), JSON.stringify({ ...ready, project: { id: "project-unknown", name: "x", template: "mystery" } }));
  // a fixture-template manifest under a foreign id: the template cannot take that identity
  storage.data.set(projectKey("project-invalid"), JSON.stringify({ schema: MANIFEST_SCHEMA, project: { id: "project-invalid", name: "Bad routing", template: "session-fixture" }, channels: {} }));

  const views = lifecycle.recent();
  assert.deepEqual(views.map((v) => v.entry.id), entries.map((e) => e.id), "newest first, as stored");
  const byId = Object.fromEntries(views.map((v) => [v.entry.id, v.status]));
  assert.deepEqual(byId[SESSION_PROJECT_ID], { kind: "current" }, "the open project is 'current' even with no stored copy");
  assert.equal(byId["project-ready"].kind, "ready");
  assert.equal(byId["project-ready"].template, "empty");
  assert.deepEqual(byId["project-missing"], { kind: "unavailable", reason: "missing", detail: UNAVAILABLE_DETAIL.missing });
  assert.deepEqual(byId["project-damaged"], { kind: "unavailable", reason: "damaged", detail: UNAVAILABLE_DETAIL.damaged });
  assert.deepEqual(byId["project-mismatch"], { kind: "unavailable", reason: "mismatch", detail: UNAVAILABLE_DETAIL.mismatch });
  assert.deepEqual(byId["project-unknown"], { kind: "unavailable", reason: "unknown-template", detail: UNAVAILABLE_DETAIL["unknown-template"] });
  assert.equal(byId["project-invalid"].kind, "ready", "the manifest reads; the mismatch shows when it is rebuilt");

  // opening what cannot be opened: refused with the reason, the store untouched
  const before = project.id;
  for (const id of ["project-missing", "project-damaged", "project-mismatch", "project-unknown"]) {
    const r = lifecycle.open(id);
    assert.equal(r.ok, false, id);
    assert.equal(project.id, before, `${id}: nothing switched`);
  }
  assert.deepEqual(lifecycle.open("project-invalid"), { ok: false, reason: "mismatch", detail: UNAVAILABLE_DETAIL.mismatch });
  assert.deepEqual(lifecycle.open(SESSION_PROJECT_ID), { ok: false, reason: "current", detail: "This project is open now" });
  assert.deepEqual(lifecycle.open("never-listed"), { ok: false, reason: "unknown", detail: "Not in the recent projects" });
  assert.equal(project.id, SESSION_PROJECT_ID);
  assert.equal(project.tracks.length, 20);
  reset();
});

test("startEmpty: a new unique identity, a valid Master-only project in the shared store, stored and listed first; nothing carries over", () => {
  const { storage, schedule } = rig();
  // dirty the fixture first: an edit, something on the clipboard
  ops.setTrackLevel("track-01", -9);
  history.observe();
  clipboard.copy("track-01");
  assert.ok(clipboard.held);
  assert.equal(autosave.status.state, "dirty");
  const fixtureKey = autosave.status.key;

  const r = lifecycle.startEmpty();
  assert.deepEqual(r, { ok: true, id: "project-a", name: EMPTY_PROJECT_NAME, stored: true, error: null });
  assert.equal(project.id, "project-a");
  assert.equal(project.name, EMPTY_PROJECT_NAME);
  assert.equal(project.template, "empty");
  assert.equal(project.isEmpty, true);
  assert.deepEqual([project.tracks.length, project.returns.length, project.buses.length], [0, 0, 0]);
  assert.equal(project.arrangement.barCount, 0);
  assert.equal(fieldRegistry.length, 0, "the registry follows the project");
  assert.equal(history.canUndo, false, "nothing to undo in a new project");
  assert.equal(history.entries.length, 0);
  assert.equal(clipboard.held, null, "the clipboard does not cross projects");
  assert.equal(autosave.status.key, projectKey("project-a"), "autosave now writes the new project");
  assert.equal(autosave.status.state, "clean");

  // the outgoing fixture was flushed before the switch, under its own key
  const saved = parseManifest(storage.data.get(fixtureKey));
  assert.ok(saved);
  assert.equal(saved.project.id, SESSION_PROJECT_ID);
  assert.equal(saved.channels["track-01"]["channel/level"], -9);

  // the new project is stored at creation and listed first, the fixture behind it
  const stored = parseManifest(storage.data.get(projectKey("project-a")));
  assert.ok(stored);
  assert.deepEqual(stored.project, { id: "project-a", name: EMPTY_PROJECT_NAME, template: "empty" });
  assert.deepEqual(stored.channels, {});
  assert.deepEqual(index(storage).map((e) => [e.id, e.name, e.template]), [["project-a", EMPTY_PROJECT_NAME, "empty"]]);
  assert.deepEqual(lifecycle.recent().map((v) => v.status.kind), ["current"]);

  // a second start: a distinct id and a distinct name
  const r2 = lifecycle.startEmpty();
  assert.equal(r2.id, "project-b");
  assert.equal(r2.name, `${EMPTY_PROJECT_NAME} 2`);
  assert.deepEqual(index(storage).map((e) => e.id), ["project-b", "project-a"]);
  assert.deepEqual(lifecycle.recent().map((v) => v.status.kind), ["current", "ready"]);
  assert.equal(schedule.queue.length, 0, "nothing pending: a new project is clean");
  reset();
});

test("startEmpty: an id already listed is skipped; a refused write leaves the project open but unstored and said so", () => {
  const { storage } = rig({ ids: ["project-a", "project-a", "project-z"] });
  storage.data.set(RECENT_KEY, serializeRecentIndex([{ id: "project-a", name: "Taken", template: "empty", openedAt: "2026-01-01T00:00:00.000Z" }]));
  const r = lifecycle.startEmpty();
  assert.equal(r.id, "project-z", "the id source is asked again until the id is new");
  assert.equal(r.name, EMPTY_PROJECT_NAME, "names are unique against the listed names, 'Taken' is not one");
  reset();

  let refuse = false;
  const failing = memoryStorage({ failWrites: () => refuse });
  rig({ storage: failing, ids: ["project-q"] });
  refuse = true;
  const r2 = lifecycle.startEmpty();
  assert.equal(r2.ok, true);
  assert.equal(r2.stored, false);
  assert.match(r2.error, /write refused/);
  assert.equal(project.id, "project-q", "the project is open all the same");
  assert.equal(project.isEmpty, true);
  assert.equal(failing.data.has(projectKey("project-q")), false);
  assert.equal(lifecycle.indexError !== null, true, "the index write failed too, and is reported");
  refuse = false;
  reset();
});

test("open: the template under the saved identity with the saved values applied; invalid values skipped and reported; rooms' views follow", () => {
  const { storage } = rig();
  assert.equal(lifecycle.restoreLast().outcome, "fixture", "as the shell starts: the fixture is the first entry");
  // leave the fixture: an edited fixture goes to storage on the way out
  ops.setTrackLevel("track-01", -12);
  ops.setTrackPan("track-02", 30);
  history.observe();
  const start = lifecycle.startEmpty();
  assert.equal(project.isEmpty, true);

  // tamper with the stored fixture: one invalid level, one send to a Return that does not exist, one unknown key
  const key = projectKey(SESSION_PROJECT_ID);
  const m = parseManifest(storage.data.get(key));
  m.channels["track-03"]["channel/level"] = 999;
  m.channels["track-04"]["sends/0/to"] = "return-nowhere";
  m.channels["track-05"]["channel/nothing"] = 1;
  storage.data.set(key, serializeManifest(m));

  const views = lifecycle.recent();
  assert.deepEqual(views.map((v) => [v.entry.id, v.status.kind]), [[start.id, "current"], [SESSION_PROJECT_ID, "ready"]]);
  const r = lifecycle.open(SESSION_PROJECT_ID);
  assert.equal(r.ok, true);
  assert.equal(r.id, SESSION_PROJECT_ID);
  assert.deepEqual(r.skipped, ["track-03/channel/level", "track-04/sends/0/to"], "invalid saved values are skipped by path; an unknown key is simply not a field");
  assert.equal(r.applied > 1000, true, "the rest of the registry was applied");
  assert.equal(project.id, SESSION_PROJECT_ID);
  assert.equal(project.template, "session-fixture");
  assert.equal(project.isEmpty, false);
  assert.equal(project.tracks.length, 20);
  assert.equal(project.track("track-01").channel.level, -12, "the saved edit is back");
  assert.equal(project.track("track-02").channel.pan, 30);
  assert.equal(project.track("track-03").channel.level, createSessionProject().tracks[2].channel.level, "the invalid level stays at the template's value");
  assert.equal(project.track("track-04").channel.sends[0].to, createSessionProject().tracks[3].channel.sends[0].to);
  assert.equal(fieldRegistry.length, 1076);
  assert.equal(history.canUndo, false, "reopening is not an edit");
  assert.equal(trackStrip("track-01").level, -12, "the Console strip view reads the reopened project");
  assert.equal(arrangeTrackOf("track-02").name, "Snare Top", "the Arrange row view reads the reopened project");

  // the next edit saves under the reopened project's key, and the list puts it first
  assert.equal(autosave.status.key, key);
  assert.deepEqual(index(storage).map((e) => e.id), [SESSION_PROJECT_ID, start.id]);
  // skipped values: the saved text is not trusted as 'already saved' — the first save rewrites it clean
  assert.equal(autosave.status.state, "clean");
  ops.setTrackLevel("track-06", -1);
  history.observe();
  assert.equal(autosave.save().outcome, "written");
  const rewritten = parseManifest(storage.data.get(key));
  assert.equal(rewritten.channels["track-03"]["channel/level"], createSessionProject().tracks[2].channel.level, "the tampered value is gone from storage");
  assert.equal(rewritten.channels["track-06"]["channel/level"], -1);
  reset();
});

test("open: a saved copy whose values make an invalid routing graph is refused, named, and never loaded", () => {
  const { storage } = rig();
  lifecycle.restoreLast();
  lifecycle.startEmpty();
  const key = projectKey(SESSION_PROJECT_ID);
  const m = parseManifest(storage.data.get(key));
  // every field value is individually valid but the graph is not: the bus feeds itself? buses have one output field — point the only bus at itself
  m.channels["bus-B1"]["output"] = "bus-B1";
  storage.data.set(key, serializeManifest(m));
  const r = lifecycle.open(SESSION_PROJECT_ID);
  assert.equal(r.ok, false);
  assert.equal(r.reason, "invalid");
  assert.match(r.detail, new RegExp(`^${UNAVAILABLE_DETAIL.invalid}: `));
  assert.equal(project.isEmpty, true, "the empty project is still open");
  assert.equal(lifecycle.recent().find((v) => v.entry.id === SESSION_PROJECT_ID).status.kind, "ready", "readable until rebuilt; the refusal is the answer to open()");
  reset();
});

test("restoreLast: the newest stored project comes back at start; nothing stored or unreadable → the pristine fixture, with the reason", () => {
  // nothing stored: the fixture, recorded as the first entry, its pristine copy written so the entry can be reopened later
  let { storage } = rig();
  let r = lifecycle.restoreLast();
  assert.deepEqual(r, { outcome: "fixture", id: SESSION_PROJECT_ID, because: "no-entries" });
  assert.deepEqual(index(storage).map((e) => [e.id, e.template]), [[SESSION_PROJECT_ID, "session-fixture"]]);
  assert.deepEqual(lifecycle.recent().map((v) => v.status.kind), ["current"]);
  const first = parseManifest(storage.data.get(projectKey(SESSION_PROJECT_ID)));
  assert.ok(first, "the never-edited fixture has a stored copy from the start");
  assert.equal(first.channels["track-01"]["channel/trim"], 3.5);
  assert.equal(autosave.status.state, "clean", "that first copy is not an autosave event");
  assert.equal(autosave.save().outcome, "clean");

  // an edited fixture saved, then a restart: the edit is back
  ops.setTrackLevel("track-07", -4);
  history.observe();
  assert.equal(autosave.save().outcome, "written");
  reset();
  rig({ storage });
  r = lifecycle.restoreLast();
  assert.deepEqual(r, { outcome: "restored", id: SESSION_PROJECT_ID, skipped: [] });
  assert.equal(project.track("track-07").channel.level, -4);
  assert.equal(autosave.status.state, "clean");
  assert.equal(autosave.save().outcome, "clean", "restored text = saved text; nothing to write");

  // a newer empty project, then a restart: the empty one comes back
  lifecycle.startEmpty();
  reset();
  rig({ storage });
  r = lifecycle.restoreLast();
  assert.equal(r.outcome, "restored");
  assert.equal(r.id, "project-a");
  assert.equal(project.isEmpty, true);
  assert.equal(project.name, EMPTY_PROJECT_NAME);

  // the newest copy damaged: the fixture, pristine, with the reason; the damaged entry still listed as unavailable
  storage.data.set(projectKey("project-a"), "garbage");
  reset();
  rig({ storage });
  r = lifecycle.restoreLast();
  assert.deepEqual(r, { outcome: "fixture", id: SESSION_PROJECT_ID, because: "damaged" });
  assert.equal(project.track("track-07").channel.level, createSessionProject().tracks[6].channel.level, "pristine: the stored fixture copy was not applied over the damaged newest");
  const views = lifecycle.recent();
  assert.deepEqual(views.map((v) => [v.entry.id, v.status.kind]), [[SESSION_PROJECT_ID, "current"], ["project-a", "unavailable"]]);
  assert.equal(views[1].status.reason, "damaged");

  // no storage at all
  reset();
  rig({ storage: null });
  assert.deepEqual(lifecycle.restoreLast(), { outcome: "fixture", id: SESSION_PROJECT_ID, because: "no-storage" });
  reset();
});

test("the recent list is capped at RECENT_LIMIT, newest first; the fixture workflow stays: the pristine fixture is what boots", () => {
  const ids = Array.from({ length: 15 }, (_, i) => `project-${String(i).padStart(2, "0")}`);
  const { storage } = rig({ ids });
  for (let i = 0; i < 14; i++) lifecycle.startEmpty();
  const listed = index(storage);
  assert.equal(listed.length, RECENT_LIMIT);
  assert.equal(listed[0].id, "project-13");
  assert.equal(listed[RECENT_LIMIT - 1].id, "project-02");
  assert.equal(storage.data.has(projectKey("project-00")), true, "falling off the list does not delete the stored copy");
  reset();
  assert.equal(project.id, SESSION_PROJECT_ID);
  assert.equal(project.template, "session-fixture");
  assert.equal(project.tracks.length, 20);
  assert.equal(project.track("track-01").channel.trim, 3.5, "the development fixture, untouched");
  assert.equal(fieldRegistry.length, 1076);
});
