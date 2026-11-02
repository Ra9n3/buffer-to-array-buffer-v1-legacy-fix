// Task 3.3 — the project shell: shortcut decisions, text-entry exemption, the ?debug gate, and the wiring
// installProjectShell makes against a fake window (clock, autosave to Web Storage, keydown, debug handle).
import test from "node:test";
import assert from "node:assert/strict";
import {
  AUTOSAVE_DELAY_MS,
  installProjectShell,
  isTextEntry,
  shortcutAction,
  wantsDebugHandle,
} from "../src/lib/project/shell.ts";
import { autosave, history, ops, project } from "../src/lib/project/store.svelte.ts";

const key = (k, mods = {}, target = { tagName: "BUTTON" }) => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  defaultPrevented: false,
  target,
  ...mods,
});

test("shortcutAction: Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z and Ctrl+Y redo; nothing else, nothing with Alt, nothing already handled", () => {
  assert.equal(shortcutAction(key("z", { ctrlKey: true })), "undo");
  assert.equal(shortcutAction(key("Z", { metaKey: true })), "undo");
  assert.equal(shortcutAction(key("z", { ctrlKey: true, shiftKey: true })), "redo");
  assert.equal(shortcutAction(key("Z", { metaKey: true, shiftKey: true })), "redo");
  assert.equal(shortcutAction(key("y", { ctrlKey: true })), "redo");
  assert.equal(shortcutAction(key("y", { metaKey: true })), null, "Cmd+Y is not redo on macOS");
  assert.equal(shortcutAction(key("y", { ctrlKey: true, shiftKey: true })), null);
  assert.equal(shortcutAction(key("z")), null, "plain z types");
  assert.equal(shortcutAction(key("z", { ctrlKey: true, altKey: true })), null);
  assert.equal(shortcutAction(key("z", { ctrlKey: true, defaultPrevented: true })), null);
  assert.equal(shortcutAction(key("s", { ctrlKey: true })), null);
  assert.equal(shortcutAction(key("Control", { ctrlKey: true })), null);
});

test("isTextEntry: text-like inputs, textareas and contenteditable keep the browser's own undo; buttons, sliders, checkboxes and the page do not", () => {
  for (const type of ["text", "number", "search", "email", "url", "tel", "password", "", undefined]) {
    assert.equal(isTextEntry({ tagName: "INPUT", type }), true, `input type=${type}`);
    assert.equal(shortcutAction(key("z", { ctrlKey: true }, { tagName: "input", type })), null);
  }
  for (const type of ["range", "checkbox", "radio", "button", "submit", "color"]) {
    assert.equal(isTextEntry({ tagName: "INPUT", type }), false, `input type=${type}`);
    assert.equal(shortcutAction(key("z", { ctrlKey: true }, { tagName: "INPUT", type })), "undo");
  }
  assert.equal(isTextEntry({ tagName: "TEXTAREA" }), true);
  assert.equal(isTextEntry({ tagName: "DIV", isContentEditable: true }), true);
  assert.equal(isTextEntry({ tagName: "DIV", isContentEditable: false }), false);
  assert.equal(isTextEntry({ tagName: "BUTTON" }), false);
  assert.equal(isTextEntry({ tagName: "BODY" }), false);
  assert.equal(isTextEntry(null), false);
  assert.equal(isTextEntry(undefined), false);
  assert.equal(isTextEntry("body"), false);
});

test("wantsDebugHandle: only a ?debug flag in the URL search", () => {
  assert.equal(wantsDebugHandle(""), false);
  assert.equal(wantsDebugHandle("?x=1"), false);
  assert.equal(wantsDebugHandle("?debug"), true);
  assert.equal(wantsDebugHandle("?debug=1"), true);
  assert.equal(wantsDebugHandle("?a=1&debug&b=2"), true);
  assert.equal(wantsDebugHandle("?debugger"), false);
  assert.equal(wantsDebugHandle("?nodebug"), false);
});

function fakeWindow({ search = "", localStorage } = {}) {
  const listeners = new Map();
  const timers = [];
  let now = 0;
  const win = {
    location: { search },
    performance: { now: () => now },
    setTimeout(fn, ms) {
      const t = { fn, ms, cancelled: false };
      timers.push(t);
      return t;
    },
    clearTimeout(t) {
      if (t) t.cancelled = true;
    },
    addEventListener(type, fn) {
      listeners.set(type, fn);
    },
    removeEventListener(type, fn) {
      if (listeners.get(type) === fn) listeners.delete(type);
    },
    get localStorage() {
      if (localStorage === "throw") throw new Error("SecurityError: storage disabled");
      return localStorage;
    },
  };
  return {
    win,
    listeners,
    timers,
    tick: (ms) => (now += ms),
    fire: (type, e) => listeners.get(type)?.(e),
    runTimers: () => timers.splice(0).filter((t) => !t.cancelled).forEach((t) => t.fn()),
  };
}

function storageStub() {
  const data = new Map();
  return {
    data,
    writes: 0,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem(k, v) {
      this.writes++;
      data.set(k, v);
    },
  };
}

test("installProjectShell: the clock, autosave to Web Storage under alloy.project.<id> after 1 s, the keydown shortcuts, and clean uninstall", () => {
  history.clear();
  const storage = storageStub();
  const fw = fakeWindow({ localStorage: storage });
  const uninstall = installProjectShell(fw.win);
  assert.equal(typeof history.clock, "function");
  assert.equal(autosave.status.storage, "localStorage");
  assert.ok(fw.listeners.has("keydown"));
  assert.equal(fw.win.alloy, undefined, "no ?debug → no handle");
  fw.runTimers(); // the attach-while-dirty save, if earlier edits left the project dirty
  const writes0 = storage.writes;

  const level0 = project.track("track-10").channel.level;
  ops.setTrackLevel("track-10", level0 - 2);
  history.observe();
  assert.equal(autosave.status.state, "dirty");
  assert.equal(fw.timers.at(-1).ms, AUTOSAVE_DELAY_MS);
  fw.runTimers();
  assert.equal(autosave.status.state, "saved");
  assert.equal(storage.writes, writes0 + 1);
  const saved = JSON.parse(storage.data.get("alloy.project.session-fixture"));
  assert.equal(saved.schema, "alloy.project-manifest/1");
  assert.equal(saved.channels["track-10"]["channel/level"], level0 - 2);

  // Ctrl+Z through the window → undo (prevented); Ctrl+Shift+Z → redo; a typing target is left alone
  let prevented = 0;
  const ev = (k, mods, target) => ({ ...key(k, mods, target), preventDefault: () => prevented++ });
  fw.fire("keydown", ev("z", { ctrlKey: true }));
  assert.equal(project.track("track-10").channel.level, level0);
  assert.equal(prevented, 1);
  fw.fire("keydown", ev("z", { ctrlKey: true, shiftKey: true }));
  assert.equal(project.track("track-10").channel.level, level0 - 2);
  fw.fire("keydown", ev("y", { ctrlKey: true }));
  assert.equal(project.track("track-10").channel.level, level0 - 2, "nothing left to redo — harmless");
  fw.fire("keydown", ev("z", { ctrlKey: true }, { tagName: "INPUT", type: "number" }));
  assert.equal(project.track("track-10").channel.level, level0 - 2, "typing in a numeric field keeps the browser's undo");
  assert.equal(prevented, 3);
  fw.fire("keydown", ev("z", { ctrlKey: true }));
  assert.equal(project.track("track-10").channel.level, level0);

  // the clock makes a continuous adjustment one step
  const trim0 = project.track("track-10").channel.trim;
  const n = history.entries.length;
  ops.setTrackTrim("track-10", trim0 + 0.5);
  history.observe();
  fw.tick(300);
  ops.setTrackTrim("track-10", trim0 + 1);
  history.observe();
  fw.tick(300);
  ops.setTrackTrim("track-10", trim0 + 1.5);
  history.observe();
  assert.equal(history.entries.length, n + 1, "three turns within a second = one step");
  fw.fire("keydown", ev("z", { ctrlKey: true }));
  assert.equal(project.track("track-10").channel.trim, trim0);
  fw.runTimers();
  assert.equal(autosave.status.state, "saved");

  uninstall();
  assert.equal(fw.listeners.has("keydown"), false);
  assert.equal(history.clock, null);
  assert.equal(autosave.status.storage, null);
  fw.fire("keydown", ev("z", { ctrlKey: true, shiftKey: true }));
  assert.equal(project.track("track-10").channel.trim, trim0, "uninstalled: the key does nothing");
  history.clear();
});

test("installProjectShell: ?debug exposes window.alloy; a disabled Web Storage leaves autosave unattached and never 'saved'", () => {
  history.clear();
  const fw = fakeWindow({ search: "?debug", localStorage: "throw" });
  const uninstall = installProjectShell(fw.win);
  assert.ok(fw.win.alloy);
  assert.deepEqual(Object.keys(fw.win.alloy).sort(), ["autosave", "clipboard", "fields", "flush", "history", "ops", "project"]);
  assert.equal(fw.win.alloy.fields.length, 1076);
  assert.equal(autosave.status.storage, null);
  const t = project.track("track-11");
  const pan0 = t.channel.pan;
  fw.win.alloy.ops.setTrackPan("track-11", pan0 + 5);
  fw.win.alloy.flush();
  assert.equal(history.canUndo, true);
  assert.equal(autosave.status.state, "dirty", "dirty, never saved — no storage");
  assert.equal(autosave.save().outcome, "no-storage");
  assert.equal(fw.timers.length, 0, "nothing scheduled without storage");
  history.undo();
  uninstall();
  assert.equal(fw.win.alloy, undefined);
  history.clear();
});
