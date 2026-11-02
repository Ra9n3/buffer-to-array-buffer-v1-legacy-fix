// Task 3.3 — persistence.ts: the manifest and the autosave lifecycle, with injected storage, scheduling and clock.
import test from "node:test";
import assert from "node:assert/strict";
import { createSessionProject } from "../src/lib/project/session.ts";
import { projectFields } from "../src/lib/project/fields.ts";
import { createHistory } from "../src/lib/project/history.ts";
import {
  MANIFEST_SCHEMA,
  buildManifest,
  createAutosave,
  manifestChannel,
  memoryStorage,
  parseManifest,
  serializeManifest,
  webStorageAdapter,
} from "../src/lib/project/persistence.ts";

/** A manual scheduler: `run()` fires what is due; `cancel` removes it. */
function scheduler() {
  const queue = [];
  const schedule = (fn, ms) => {
    const job = { fn, ms };
    queue.push(job);
    return () => {
      const i = queue.indexOf(job);
      if (i >= 0) queue.splice(i, 1);
    };
  };
  schedule.run = () => {
    const jobs = queue.splice(0);
    for (const j of jobs) j.fn();
    return jobs.length;
  };
  schedule.queue = queue;
  return schedule;
}

/** The store's wiring, rebuilt over a fresh project: registry → history → autosave. */
function rig(options = {}) {
  const project = createSessionProject();
  const fields = projectFields(project);
  const history = createHistory({ fields });
  let t = 0;
  const clock = () => t;
  const autosave = createAutosave({
    key: `alloy.project.${project.id}`,
    serialize: () => serializeManifest(buildManifest(project, fields)),
    revision: () => history.revision,
    clock,
  });
  history.subscribe(() => autosave.notifyChange());
  const storage = memoryStorage(options);
  const schedule = scheduler();
  return { project, fields, history, autosave, storage, schedule, tick: (ms) => (t += ms) };
}

test("the manifest holds every field by channel and relative path, carries no timestamp, and round-trips through JSON", () => {
  const project = createSessionProject();
  const fields = projectFields(project);
  const m = buildManifest(project, fields);
  assert.equal(m.schema, MANIFEST_SCHEMA);
  // Task 4.1: the identity names the template the values apply onto (additive; the schema is unchanged)
  assert.deepEqual(m.project, { id: "session-fixture", name: "Fixture session", template: "session-fixture" });
  assert.equal(Object.keys(m.channels).length, 24, "20 tracks + 3 Returns + 1 bus");
  assert.equal(Object.values(m.channels).reduce((n, c) => n + Object.keys(c).length, 0), fields.length);
  assert.equal(manifestChannel(m, "track-03")["channel/level"], -12);
  assert.equal(manifestChannel(m, "track-03")["chain/eq/lf/gain/mode"], "auto");
  assert.equal(manifestChannel(m, "bus-B1").output, "master");
  assert.equal(manifestChannel(m, "return-room")["chain/character/value"], "room");
  assert.equal(manifestChannel(m, "nope"), null);
  const text = serializeManifest(m);
  assert.ok(!/savedAt|timestamp|Date/.test(text));
  assert.deepEqual(parseManifest(text), m);
  assert.equal(serializeManifest(buildManifest(project, fields)), text, "stable: the same project serialises to the same text");
  assert.equal(parseManifest("{"), null);
  assert.equal(parseManifest(JSON.stringify({ schema: "other" })), null);
  assert.equal(parseManifest(JSON.stringify({ schema: MANIFEST_SCHEMA })), null);
  // a Task 3.3 manifest (no template) still parses; the loader decides what it can rebuild
  const legacy = parseManifest(JSON.stringify({ schema: MANIFEST_SCHEMA, project: { id: "session-fixture", name: "Fixture session" }, channels: {} }));
  assert.ok(legacy);
  assert.equal(legacy.project.template, undefined);
  assert.equal(parseManifest(JSON.stringify({ schema: MANIFEST_SCHEMA, project: { id: "x", name: "n", template: 7 }, channels: {} })), null, "a template that is not a string is not a manifest");
});

test("a changed project becomes dirty and schedules one save; the save writes the manifest and marks the project saved", () => {
  const { project, history, autosave, storage, schedule } = rig();
  autosave.attach(storage, { schedule, delayMs: 1000 });
  assert.equal(autosave.status.state, "clean");
  assert.equal(autosave.dirty, false);
  project.tracks[2].channel.level = -7;
  history.observe();
  assert.equal(autosave.dirty, true);
  assert.equal(autosave.status.state, "dirty");
  assert.equal(autosave.status.pending, true);
  assert.equal(schedule.queue.length, 1);
  assert.equal(schedule.queue[0].ms, 1000);
  assert.equal(storage.writes, 0, "nothing written before the delay");
  schedule.run();
  assert.equal(storage.writes, 1);
  assert.equal(autosave.status.state, "saved");
  assert.equal(autosave.dirty, false);
  assert.equal(autosave.status.savedRevision, history.revision);
  assert.equal(autosave.status.pending, false);
  const saved = parseManifest(storage.data.get(autosave.key));
  assert.equal(manifestChannel(saved, "track-03")["channel/level"], -7);
});

test("an unchanged project never triggers a write: no change → no schedule; a burst of changes → one write; save() when clean does nothing", () => {
  const { project, history, autosave, storage, schedule } = rig();
  autosave.attach(storage, { schedule, delayMs: 1000 });
  assert.equal(schedule.queue.length, 0, "attaching a clean project schedules nothing");
  assert.deepEqual(autosave.save(), { ok: true, outcome: "clean", error: null, revision: 0 });
  assert.equal(storage.writes, 0);
  for (const v of [-11, -10, -9]) {
    project.tracks[2].channel.level = v;
    history.observe();
  }
  assert.equal(schedule.queue.length, 1, "each change pushes the one timer back");
  assert.equal(schedule.run(), 1);
  assert.equal(storage.writes, 1);
  assert.equal(schedule.run(), 0);
  assert.equal(storage.writes, 1);
});

test("an edit and its undo move the revision but not the content: the save is skipped, the project is saved", () => {
  const { project, history, autosave, storage, schedule } = rig();
  autosave.attach(storage, { schedule, delayMs: 1000 });
  project.tracks[2].channel.level = -7;
  history.observe();
  schedule.run();
  assert.equal(storage.writes, 1);
  project.tracks[2].channel.pan = 10;
  history.observe();
  history.undo();
  assert.equal(autosave.dirty, true, "the revision moved");
  const r = autosave.save();
  assert.equal(r.outcome, "unchanged");
  assert.equal(storage.writes, 1, "no second write");
  assert.equal(autosave.status.skipped, 1);
  assert.equal(autosave.dirty, false);
  assert.equal(autosave.status.state, "saved");
});

test("a failed save is surfaced and never marks the project saved; the next change retries and succeeds", () => {
  let refuse = true;
  const { project, history, autosave, storage, schedule } = rig({ failWrites: () => refuse });
  autosave.attach(storage, { schedule, delayMs: 1000 });
  project.tracks[2].channel.level = -7;
  history.observe();
  schedule.run();
  assert.equal(storage.writes, 0);
  assert.equal(autosave.status.state, "failed");
  assert.equal(autosave.status.error, "memory storage: write refused");
  assert.equal(autosave.dirty, true);
  assert.equal(autosave.status.savedRevision, 0);
  assert.equal(autosave.status.savedAt, null);
  const again = autosave.save();
  assert.equal(again.ok, false);
  assert.equal(again.outcome, "failed");
  // the storage recovers; the next change schedules a save that lands
  refuse = false;
  project.tracks[2].channel.level = -6;
  history.observe();
  assert.equal(autosave.status.state, "dirty");
  assert.equal(autosave.status.error, "memory storage: write refused", "the last error stays visible until a write succeeds");
  schedule.run();
  assert.equal(storage.writes, 1);
  assert.equal(autosave.status.state, "saved");
  assert.equal(autosave.status.error, null);
  assert.equal(autosave.dirty, false);
  assert.equal(manifestChannel(parseManifest(storage.data.get(autosave.key)), "track-03")["channel/level"], -6);
  // a failure followed by an edit back to exactly the stored content: the stored copy is current → saved, error cleared, no write
  refuse = true;
  project.tracks[2].channel.level = -5;
  history.observe();
  schedule.run();
  assert.equal(autosave.status.state, "failed");
  refuse = false;
  project.tracks[2].channel.level = -6;
  history.observe();
  schedule.run();
  assert.equal(storage.writes, 1, "nothing to write — the stored manifest already matches");
  assert.equal(autosave.status.state, "saved");
  assert.equal(autosave.status.error, null, "no outstanding failure: the stored copy is the project");
  assert.equal(autosave.status.skipped, 1);
  assert.equal(autosave.dirty, false);
});

test("subsequent edits and saves: revisions and saved revisions track each other; savedAt is the clock", () => {
  const { project, history, autosave, storage, schedule, tick } = rig();
  autosave.attach(storage, { schedule, delayMs: 250 });
  for (let i = 1; i <= 3; i++) {
    project.tracks[0].channel.pan = i * 10;
    history.observe();
    tick(1000);
    schedule.run();
    assert.equal(storage.writes, i);
    assert.equal(autosave.status.savedRevision, history.revision);
    assert.equal(autosave.status.savedAt, i * 1000);
  }
  history.undo();
  history.undo();
  schedule.run();
  assert.equal(storage.writes, 4, "two undos = one write of the earlier content");
  assert.equal(manifestChannel(parseManifest(storage.data.get(autosave.key)), "track-01")["channel/pan"], 10);
});

test("an asynchronous adapter: edits that land during a write keep the project dirty and reschedule", async () => {
  const { project, history, autosave, schedule } = rig();
  let release;
  const slow = {
    name: "slow",
    data: new Map(),
    read(k) {
      return this.data.get(k) ?? null;
    },
    write(k, text) {
      return new Promise((resolve) => {
        release = () => {
          this.data.set(k, text);
          resolve();
        };
      });
    },
  };
  autosave.attach(slow, { schedule, delayMs: 100 });
  project.tracks[0].channel.pan = 10;
  history.observe();
  schedule.run();
  assert.equal(autosave.status.state, "saving");
  project.tracks[0].channel.pan = 20; // lands during the write
  history.observe();
  const revisionDuring = history.revision;
  release();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(autosave.dirty, true, "the write carried the older revision");
  assert.equal(autosave.status.savedRevision, revisionDuring - 1);
  assert.equal(autosave.status.pending, true, "a follow-up save is armed");
  schedule.run();
  release();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(autosave.dirty, false);
  assert.equal(manifestChannel(parseManifest(slow.data.get(autosave.key)), "track-01")["channel/pan"], 20);
  // a rejecting adapter fails safely too
  const failing = { name: "reject", read: () => null, write: () => Promise.reject(new Error("quota")) };
  autosave.attach(failing, { schedule, delayMs: 100 });
  project.tracks[0].channel.pan = 30;
  history.observe();
  const r = await autosave.save();
  assert.deepEqual([r.ok, r.outcome, r.error], [false, "failed", "quota"]);
  assert.equal(autosave.status.state, "failed");
  assert.equal(autosave.dirty, true);
});

test("without storage nothing is ever reported saved; attaching to a dirty project arms a save; detach stops it", () => {
  const { project, history, autosave, storage, schedule } = rig();
  project.tracks[0].channel.pan = 10;
  history.observe();
  assert.equal(autosave.status.state, "dirty");
  assert.equal(autosave.status.storage, null);
  assert.deepEqual(autosave.save(), { ok: false, outcome: "no-storage", error: null, revision: history.revision });
  autosave.attach(storage, { schedule, delayMs: 500 });
  assert.equal(autosave.status.pending, true, "dirty at attach → a save is due");
  autosave.detach();
  assert.equal(autosave.status.pending, false);
  assert.equal(schedule.run(), 0);
  assert.equal(storage.writes, 0);
});

test("the Web Storage adapter writes through setItem and lets its errors surface", () => {
  const items = new Map();
  const fake = { getItem: (k) => items.get(k) ?? null, setItem: (k, v) => items.set(k, v) };
  const a = webStorageAdapter(fake);
  assert.equal(a.name, "localStorage");
  assert.equal(a.read("x"), null);
  a.write("x", "1");
  assert.equal(a.read("x"), "1");
  const quota = webStorageAdapter({ getItem: () => null, setItem: () => { throw new Error("QuotaExceededError"); } }, "full");
  assert.throws(() => quota.write("x", "1"), /QuotaExceededError/);
});
