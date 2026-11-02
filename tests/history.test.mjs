// Task 3.3 — history.ts: undo / redo over a field registry, in isolation (no Svelte, no store).
import test from "node:test";
import assert from "node:assert/strict";
import { createHistory, DEFAULT_COALESCE_MS, DEFAULT_HISTORY_LIMIT } from "../src/lib/project/history.ts";

/** A tiny registry over a plain object: paths "<channel>/<key>". */
function registry(data, channel = "track-01") {
  return Object.keys(data).map((key) => ({
    path: `${channel}/${key}`,
    channel,
    rel: key,
    group: "channel",
    copyable: true,
    type: typeof data[key] === "number" ? { kind: "number", min: -1e9, max: 1e9 } : { kind: "boolean" },
    label: `01 Kick · ${key}`,
    get: () => data[key],
    set: (v) => {
      data[key] = v;
    },
  }));
}

function clockAt(start = 0) {
  let t = start;
  const clock = () => t;
  clock.advance = (ms) => {
    t += ms;
  };
  return clock;
}

test("normal edit → undo → redo: the value goes back and forth, the stacks follow", () => {
  const d = { level: -12, pan: 0 };
  const h = createHistory({ fields: registry(d) });
  d.level = -7;
  const entry = h.observe();
  assert.ok(entry);
  assert.deepEqual(entry.patches, [{ path: "track-01/level", before: -12, after: -7 }]);
  assert.equal(entry.label, "01 Kick · level");
  assert.equal(h.canUndo, true);
  assert.equal(h.canRedo, false);
  assert.equal(h.undo(), entry);
  assert.equal(d.level, -12);
  assert.equal(h.canUndo, false);
  assert.equal(h.canRedo, true);
  assert.equal(h.redo(), entry);
  assert.equal(d.level, -7);
  assert.equal(h.canRedo, false);
});

test("multiple edits undo in reverse order and redo in forward order", () => {
  const d = { level: -12, pan: 0, mute: false };
  const h = createHistory({ fields: registry(d) });
  d.level = -7;
  h.observe();
  d.pan = 20;
  h.observe();
  d.mute = true;
  h.observe();
  assert.equal(h.entries.length, 3);
  assert.equal(h.undoLabel, "01 Kick · mute");
  h.undo();
  assert.deepEqual(d, { level: -7, pan: 20, mute: false });
  h.undo();
  assert.deepEqual(d, { level: -7, pan: 0, mute: false });
  h.undo();
  assert.deepEqual(d, { level: -12, pan: 0, mute: false });
  assert.equal(h.undo(), null, "nothing left");
  h.redo();
  assert.deepEqual(d, { level: -7, pan: 0, mute: false });
  h.redo();
  h.redo();
  assert.deepEqual(d, { level: -7, pan: 20, mute: true });
  assert.equal(h.redo(), null);
});

test("a new edit after undo clears the redo history", () => {
  const d = { level: -12 };
  const h = createHistory({ fields: registry(d) });
  d.level = -7;
  h.observe();
  d.level = -3;
  h.observe();
  h.undo();
  assert.equal(h.canRedo, true);
  d.level = 2;
  h.observe();
  assert.equal(h.canRedo, false);
  assert.equal(h.redoEntries.length, 0);
  assert.equal(h.entries.length, 2);
  h.undo();
  assert.equal(d.level, -7);
});

test("no-ops never create entries: nothing changed, or a value written back to itself", () => {
  const d = { level: -12 };
  const h = createHistory({ fields: registry(d) });
  assert.equal(h.observe(), null);
  d.level = -12;
  assert.equal(h.observe(), null);
  d.level = -7;
  d.level = -12; // changed and changed back inside one block
  assert.equal(h.observe(), null);
  assert.equal(h.entries.length, 0);
  assert.equal(h.revision, 0);
});

test("one synchronous block of writes is one entry, whatever it touched", () => {
  const d = { level: -12, pan: 0, mute: false };
  const h = createHistory({ fields: registry(d) });
  d.level = -7;
  d.pan = 20;
  d.mute = true;
  const e = h.observe();
  assert.equal(e.patches.length, 3);
  assert.equal(e.label, "01 Kick · 3 settings");
  h.undo();
  assert.deepEqual(d, { level: -12, pan: 0, mute: false });
});

test("coalescing: a continuous adjustment of the same field is one entry — first before, latest after", () => {
  const d = { level: -12 };
  const clock = clockAt(1000);
  const h = createHistory({ fields: registry(d), clock });
  for (const v of [-11, -10, -9, -8]) {
    d.level = v;
    clock.advance(16);
    h.observe();
  }
  assert.equal(h.entries.length, 1);
  assert.deepEqual(h.entries[0].patches, [{ path: "track-01/level", before: -12, after: -8 }]);
  h.undo();
  assert.equal(d.level, -12);
});

test("coalescing: a change touching a subset of the open entry's paths merges (value after value + mode)", () => {
  const d = { value: -3, mode: 0 };
  const clock = clockAt(0);
  const h = createHistory({ fields: registry(d), clock });
  d.value = -2.5;
  d.mode = 1; // the first turn: value + mode
  h.observe();
  clock.advance(20);
  d.value = -2; // subsequent moves: value only
  h.observe();
  clock.advance(20);
  d.value = -1.5;
  h.observe();
  assert.equal(h.entries.length, 1);
  assert.deepEqual(h.entries[0].patches, [
    { path: "track-01/value", before: -3, after: -1.5 },
    { path: "track-01/mode", before: 0, after: 1 },
  ]);
});

test("coalescing stops at a pause, a different field, an undo / redo, a closed entry, or without a clock", () => {
  const d = { level: -12, pan: 0 };
  const clock = clockAt(0);
  const h = createHistory({ fields: registry(d), clock, coalesceMs: 500 });
  d.level = -11;
  h.observe();
  clock.advance(501); // a pause
  d.level = -10;
  h.observe();
  assert.equal(h.entries.length, 2, "a pause starts a new entry");
  clock.advance(10);
  d.pan = 5; // a different field
  h.observe();
  assert.equal(h.entries.length, 3);
  clock.advance(10);
  d.pan = 6;
  h.observe();
  assert.equal(h.entries.length, 3, "same field within the window merges");
  h.undo();
  h.redo(); // closes the entry
  clock.advance(10);
  d.pan = 7;
  h.observe();
  assert.equal(h.entries.length, 4, "after undo / redo a new entry starts");
  // a transaction is closed and closes what came before
  clock.advance(10);
  h.transaction("Paste", () => {
    d.level = 0;
  });
  clock.advance(10);
  d.level = 1;
  h.observe();
  assert.equal(h.entries.length, 6, "the transaction entry and a fresh one after it");
  // no clock → never coalesce
  const d2 = { level: 0 };
  const h2 = createHistory({ fields: registry(d2) });
  d2.level = 1;
  h2.observe();
  d2.level = 2;
  h2.observe();
  assert.equal(h2.entries.length, 2);
  assert.equal(DEFAULT_COALESCE_MS, 1000);
});

test("a merged adjustment that returns to where it began is dropped (nothing to undo)", () => {
  const d = { level: -12 };
  const clock = clockAt(0);
  const h = createHistory({ fields: registry(d), clock });
  d.level = -11;
  h.observe();
  clock.advance(10);
  d.level = -12;
  h.observe();
  assert.equal(h.entries.length, 0);
  assert.equal(h.canUndo, false);
});

test("transaction: pending changes are recorded first; everything inside is one closed, labelled entry", () => {
  const d = { level: -12, pan: 0, mute: false };
  const h = createHistory({ fields: registry(d) });
  d.level = -7; // pending, not yet observed
  const { result, entry } = h.transaction("Paste settings → 01 Kick", () => {
    d.pan = 30;
    d.mute = true;
    return "done";
  });
  assert.equal(result, "done");
  assert.equal(h.entries.length, 2);
  assert.equal(h.entries[0].label, "01 Kick · level");
  assert.equal(entry.label, "Paste settings → 01 Kick");
  assert.equal(entry.open, false);
  assert.equal(entry.patches.length, 2);
  h.undo();
  assert.deepEqual(d, { level: -7, pan: 0, mute: false }, "the paste undoes as one step");
  h.undo();
  assert.equal(d.level, -12);
  // an empty transaction records nothing
  assert.equal(h.transaction("nothing", () => {}).entry, null);
});

test("the history limit drops the oldest entries", () => {
  const d = { level: 0 };
  const h = createHistory({ fields: registry(d), limit: 3 });
  for (let i = 1; i <= 5; i++) {
    d.level = i;
    h.observe();
  }
  assert.equal(h.entries.length, 3);
  assert.equal(h.entries[0].patches[0].before, 2);
  assert.equal(DEFAULT_HISTORY_LIMIT, 200);
});

test("revision bumps on record, merge, undo and redo; subscribers hear every event", () => {
  const d = { level: 0 };
  const clock = clockAt(0);
  const h = createHistory({ fields: registry(d), clock });
  const kinds = [];
  const off = h.subscribe((e) => kinds.push(e.kind));
  d.level = 1;
  h.observe();
  clock.advance(5);
  d.level = 2;
  h.observe();
  h.undo();
  h.redo();
  assert.deepEqual(kinds, ["record", "merge", "undo", "redo"]);
  assert.equal(h.revision, 4);
  off();
  h.undo();
  assert.equal(kinds.length, 4, "unsubscribed");
  assert.equal(h.revision, 5);
});

test("restores apply through the fields and are never recorded as new edits; clear() keeps the present state", () => {
  const d = { level: 0, pan: 0 };
  const sets = [];
  const fields = registry(d).map((f) => ({ ...f, set: (v) => { sets.push([f.rel, v]); f.set(v); } }));
  const h = createHistory({ fields });
  d.level = 1;
  d.pan = 2;
  h.observe();
  h.undo();
  assert.deepEqual(sets, [["pan", 0], ["level", 0]], "before-values in reverse order");
  assert.equal(h.observe(), null, "the restore left nothing pending");
  h.redo();
  assert.deepEqual(sets.slice(2), [["level", 1], ["pan", 2]]);
  h.clear();
  assert.equal(h.canUndo, false);
  assert.equal(h.canRedo, false);
  assert.deepEqual(d, { level: 1, pan: 2 });
});
