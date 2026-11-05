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
import { lifecycle, projectKey, RECENT_KEY } from "../src/lib/project/lifecycle.ts";
import { SESSION_PROJECT_ID } from "../src/lib/project/session.ts";
import { SETTINGS_KEY, settings, settingsOps } from "../src/lib/settings.svelte.ts";
import { motionAttribute, newProjectId } from "../src/lib/project/shell.ts";
// Task 9.1.2: the app boots an EMPTY project. This suite exercises the shell against the
// development session's channels, so it loads that session explicitly.
import { loadFixtureSession } from "./fixture-session.mjs";
loadFixtureSession();

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

function fakeWindow({ search = "", localStorage, crypto } = {}) {
  const listeners = new Map();
  const timers = [];
  let now = 0;
  const attrs = new Map();
  const win = {
    location: { search },
    performance: { now: () => now },
    // Task 4.1: <html> for the motion attribute, crypto for project ids (optional, as in a browser)
    document: {
      documentElement: {
        setAttribute: (k, v) => attrs.set(k, String(v)),
        removeAttribute: (k) => attrs.delete(k),
        getAttribute: (k) => attrs.get(k) ?? null,
      },
    },
    crypto,
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
    attrs,
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
  // Task 4.1 added lifecycle, settings and the start-up outcome to the handle; Task 5.1 the audio assets module; Task 5.2 analysis + hardware; Task 8.1 the shared transport
  assert.deepEqual(Object.keys(fw.win.alloy).sort(), ["analysis", "assets", "autosave", "clipboard", "fields", "flush", "hardware", "history", "lifecycle", "ops", "project", "restored", "settings", "transport"]);
  // the fake window has no IndexedDB: nothing attached, import refused, nothing thrown
  assert.equal(fw.win.alloy.assets.attached, false);
  assert.equal(fw.win.alloy.assets.storeName, null);
  // Task 5.2: no asset store → no analysis queue; the hardware profile is attached (no storage: no cached benchmark) and unmeasured
  assert.equal(fw.win.alloy.analysis.attached, false);
  assert.equal(fw.win.alloy.hardware.attached, true);
  assert.equal(fw.win.alloy.hardware.benchmark, null);
  assert.deepEqual(fw.win.alloy.hardware.profile.id, "standard");
  assert.equal(fw.win.alloy.hardware.profile.source, "unmeasured");
  assert.equal(fw.win.alloy.hardware.estimateSeconds(120), null, "no measurement, no estimate");
  assert.equal(fw.win.alloy.analysis.estimate.seconds, null);
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

// --- Task 4.1: settings onto <html>, the lifecycle wired, the last project back at start ----------

test("installProjectShell: settings read from Web Storage, data-motion mirrored onto <html> now and on change, removed at uninstall", () => {
  history.clear();
  const storage = storageStub();
  storage.data.set(SETTINGS_KEY, JSON.stringify({ schema: "alloy.settings/1", motion: "reduced", onboarding: "skipped" }));
  const fw = fakeWindow({ localStorage: storage });
  const uninstall = installProjectShell(fw.win);
  assert.equal(settings.motion, "reduced");
  assert.equal(settings.onboarding, "skipped");
  assert.equal(settings.storage.storage, "localStorage");
  assert.equal(fw.attrs.get("data-motion"), "reduced", "the stored preference is on <html> before the first paint");
  settingsOps.setMotion("system");
  assert.equal(fw.attrs.get("data-motion"), "system", "a change is mirrored at once");
  assert.equal(JSON.parse(storage.data.get(SETTINGS_KEY)).motion, "system", "and written");
  assert.equal(motionAttribute({ motion: "reduced" }), "reduced");
  assert.equal(motionAttribute({ motion: "system" }), "system");
  uninstall();
  assert.equal(fw.attrs.has("data-motion"), false);
  assert.equal(settings.storage.attached, false);
  settingsOps.setMotion("reduced");
  assert.equal(fw.attrs.has("data-motion"), false, "uninstalled: no mirror");
  settingsOps.resetAll();
  history.clear();
});

test("installProjectShell: no Web Storage → settings at their defaults, data-motion still set from them; the guide is due", () => {
  history.clear();
  const fw = fakeWindow({ localStorage: "throw" });
  const uninstall = installProjectShell(fw.win);
  assert.equal(settings.storage.attached, false);
  assert.equal(settings.motion, "system");
  assert.equal(settings.showGuide, true);
  assert.equal(fw.attrs.get("data-motion"), "system");
  assert.equal(lifecycle.storage, null);
  assert.deepEqual(lifecycle.recent(), []);
  uninstall();
  history.clear();
});

test("installProjectShell: the lifecycle gets storage, a wall clock and ids; the first start records the fixture; the next start restores the last project", () => {
  history.clear();
  const storage = storageStub();
  let fw = fakeWindow({ localStorage: storage, search: "?debug", crypto: { randomUUID: () => "11111111-2222-4333-8444-555555555555" } });
  let uninstall = installProjectShell(fw.win);
  assert.equal(lifecycle.storage, "localStorage");
  assert.deepEqual(fw.win.alloy.restored, { outcome: "fixture", id: SESSION_PROJECT_ID, because: "no-entries" });
  const index = JSON.parse(storage.data.get(RECENT_KEY));
  assert.equal(index.schema, "alloy.projects/1");
  assert.equal(index.entries.length, 1);
  assert.equal(index.entries[0].id, SESSION_PROJECT_ID);
  assert.match(index.entries[0].openedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, "ISO 8601 from the wall clock");
  assert.ok(storage.data.has(projectKey(SESSION_PROJECT_ID)), "the pristine fixture's copy is stored at the first start");

  // start empty through the handle's lifecycle: the id comes from crypto.randomUUID
  const started = fw.win.alloy.lifecycle.startEmpty();
  assert.equal(started.id, "project-11111111-2222-4333-8444-555555555555");
  assert.equal(project.isEmpty, true);
  assert.equal(fw.win.alloy.fields.length, 0, "the handle's registry follows the project");
  uninstall();

  // "a reload": the empty project is what comes back
  history.clear();
  fw = fakeWindow({ localStorage: storage, search: "?debug" });
  uninstall = installProjectShell(fw.win);
  assert.deepEqual(fw.win.alloy.restored, { outcome: "restored", id: started.id, skipped: [] });
  assert.equal(project.id, started.id);
  assert.equal(project.isEmpty, true);
  assert.equal(autosave.status.key, projectKey(started.id));
  // reopen the fixture from the list, edit, let autosave write, reload: the edit is back
  assert.equal(fw.win.alloy.lifecycle.open(SESSION_PROJECT_ID).ok, true);
  assert.equal(project.id, SESSION_PROJECT_ID);
  ops.setTrackLevel("track-12", -11);
  history.observe();
  fw.runTimers();
  assert.equal(autosave.status.state, "saved");
  uninstall();
  history.clear();
  fw = fakeWindow({ localStorage: storage, search: "?debug" });
  uninstall = installProjectShell(fw.win);
  assert.equal(fw.win.alloy.restored.outcome, "restored");
  assert.equal(project.id, SESSION_PROJECT_ID);
  assert.equal(project.track("track-12").channel.level, -11);
  assert.equal(history.canUndo, false, "restoring is not an edit");
  uninstall();

  // put the pristine fixture back for whatever runs next
  fw = fakeWindow({ localStorage: storageStub() });
  uninstall = installProjectShell(fw.win);
  uninstall();
  history.clear();
});

test("newProjectId: crypto.randomUUID when the window has it, a time + random fallback otherwise; always project-<...>", () => {
  assert.equal(newProjectId({ crypto: { randomUUID: () => "abc" } }), "project-abc");
  const a = newProjectId({});
  const b = newProjectId({});
  assert.match(a, /^project-[0-9a-z]+-[0-9a-z]{8}$/);
  assert.notEqual(a, b);
  assert.match(newProjectId({ crypto: {} }), /^project-[0-9a-z]+-[0-9a-z]{8}$/, "a crypto without randomUUID falls back too");
});
