// Task 4.1 — application settings: the document (lenient per field), the store (one write per change,
// same-value writes do nothing), the first-run guide's states, and storage attach / detach.
import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SETTINGS,
  EXPORT_FORMAT,
  EXPORT_OUTPUTS,
  EXPORT_OUTPUT_PRINT,
  HARDWARE_PROFILES,
  HARDWARE_PROFILE_PRINT,
  MOTION_PREFERENCES,
  ONBOARDING_STATES,
  SETTINGS_KEY,
  SETTINGS_SCHEMA,
  attachSettings,
  detachSettings,
  parseSettings,
  serializeSettings,
  settings,
  settingsOps,
} from "../src/lib/settings.svelte.ts";
import { memoryStorage } from "../src/lib/project/persistence.ts";

function fresh() {
  detachSettings();
  settingsOps.resetAll();
}

test("the vocabulary: profiles with the plan's intents (no benchmark values), WAV only, three outputs, two motion modes, three guide states", () => {
  assert.deepEqual([...HARDWARE_PROFILES], ["auto", "lite", "standard", "performance"]);
  assert.equal(HARDWARE_PROFILE_PRINT.lite.name, "Lite");
  assert.equal(HARDWARE_PROFILE_PRINT.standard.name, "Standard");
  assert.equal(HARDWARE_PROFILE_PRINT.performance.name, "Performance");
  assert.equal(HARDWARE_PROFILE_PRINT.auto.name, "Automatic");
  for (const p of HARDWARE_PROFILES) {
    assert.doesNotMatch(HARDWARE_PROFILE_PRINT[p].intent, /\d+\s*(GB|MB|cores?|threads?|ms|%)/i, `${p}: no invented numbers`);
  }
  assert.match(HARDWARE_PROFILE_PRINT.lite.intent, /lowest RAM/i);
  assert.match(HARDWARE_PROFILE_PRINT.standard.intent, /balanced/i);
  assert.match(HARDWARE_PROFILE_PRINT.performance.intent, /higher concurrency/i);
  assert.equal(EXPORT_FORMAT, "WAV");
  assert.deepEqual([...EXPORT_OUTPUTS], ["fullMix", "stems", "buses"]);
  assert.deepEqual(EXPORT_OUTPUT_PRINT, { fullMix: "Full mix", stems: "Processed individual stems", buses: "Processed buses" });
  assert.deepEqual([...MOTION_PREFERENCES], ["system", "reduced"]);
  assert.deepEqual([...ONBOARDING_STATES], ["pending", "skipped", "done"]);
  assert.deepEqual(DEFAULT_SETTINGS, {
    hardwareProfile: "auto",
    export: { fullMix: true, stems: false, buses: false, depth: "float32", rate: null, dither: false },
    motion: "system",
    onboarding: "pending",
    // Task 10.1 (§14): every default exactly as the spec lists it
    transport: {
      returnToStartOnStop: false,
      secondStopReturnsToStart: false,
      autoScrollMode: "smooth",
      autoScrollTriggerPoint: 0.75,
      suspendOnManualScroll: true,
      clickToPlay: false,
      stationaryWhileRecording: false,
    },
  });
  assert.equal(SETTINGS_SCHEMA, "alloy.settings/1");
  assert.equal(SETTINGS_KEY, "alloy.settings");
});

test("the document: a round trip is exact; missing, malformed or out-of-vocabulary fields fall back one by one; junk is null", () => {
  const all = {
    hardwareProfile: "performance",
    export: { fullMix: false, stems: true, buses: true, depth: "float32", rate: null, dither: false },
    motion: "reduced",
    onboarding: "done",
    transport: { returnToStartOnStop: true, secondStopReturnsToStart: true, autoScrollMode: "page", autoScrollTriggerPoint: 0.5, suspendOnManualScroll: false, clickToPlay: true, stationaryWhileRecording: true },
  };
  const text = serializeSettings(all);
  assert.equal(JSON.parse(text).schema, SETTINGS_SCHEMA);
  assert.deepEqual(parseSettings(text), all);
  assert.deepEqual(parseSettings(JSON.stringify({ schema: SETTINGS_SCHEMA })), DEFAULT_SETTINGS, "an empty document is all defaults");
  assert.deepEqual(
    parseSettings(JSON.stringify({ schema: SETTINGS_SCHEMA, hardwareProfile: "turbo", export: { stems: "yes", buses: true }, motion: 3, onboarding: "skipped", transport: { autoScrollMode: "warp", autoScrollTriggerPoint: 0.42, clickToPlay: "maybe" } })),
    {
      hardwareProfile: "auto",
      export: { fullMix: true, stems: false, buses: true, depth: "float32", rate: null, dither: false },
      motion: "system",
      onboarding: "skipped",
      // field by field: the mode and the trigger fall back to the defaults,
      // the malformed booleans to theirs; no value a control never offered.
      transport: { returnToStartOnStop: false, secondStopReturnsToStart: false, autoScrollMode: "smooth", autoScrollTriggerPoint: 0.75, suspendOnManualScroll: true, clickToPlay: false, stationaryWhileRecording: false },
    },
  );
  assert.deepEqual(parseSettings(JSON.stringify({ schema: SETTINGS_SCHEMA, export: null })), DEFAULT_SETTINGS);
  assert.equal(parseSettings("nope"), null);
  assert.equal(parseSettings("[]"), null);
  assert.equal(parseSettings("null"), null);
  assert.equal(parseSettings(JSON.stringify({ schema: "alloy.settings/0", motion: "reduced" })), null, "another schema is not read");
});

test("the store: every op is one write of the whole document; same-value writes change nothing; unknown values throw", () => {
  fresh();
  const storage = memoryStorage();
  assert.equal(attachSettings(storage), false, "nothing stored: defaults, 'loaded' false");
  assert.deepEqual(settings.snapshot(), DEFAULT_SETTINGS);
  assert.deepEqual(settings.storage, { attached: true, storage: "memory", loaded: false, error: null, writes: 0 });
  assert.equal(storage.data.has(SETTINGS_KEY), false, "attaching writes nothing");

  settingsOps.setHardwareProfile("lite");
  assert.equal(settings.hardwareProfile, "lite");
  assert.equal(storage.writes, 1);
  assert.deepEqual(parseSettings(storage.data.get(SETTINGS_KEY)), { ...DEFAULT_SETTINGS, hardwareProfile: "lite" });
  settingsOps.setHardwareProfile("lite");
  assert.equal(storage.writes, 1, "same value: no write");

  settingsOps.setExportOutput("stems", true);
  settingsOps.setExportOutput("fullMix", false);
  assert.deepEqual(settings.export, { fullMix: false, stems: true, buses: false, depth: "float32", rate: null, dither: false });
  assert.equal(storage.writes, 3);
  settingsOps.setExportOutput("buses", false);
  assert.equal(storage.writes, 3);

  settingsOps.setMotion("reduced");
  assert.equal(settings.motion, "reduced");
  assert.equal(storage.writes, 4);
  settingsOps.setMotion("reduced");
  assert.equal(storage.writes, 4);

  // Task 10.1: the transport & playhead preferences — one write per control.
  settingsOps.setTransportMode("page");
  assert.equal(settings.transport.autoScrollMode, "page");
  assert.equal(storage.writes, 5);
  settingsOps.setTransportMode("page");
  assert.equal(storage.writes, 5, "same value: no write");

  settingsOps.setTransportTriggerPoint(0.5);
  assert.equal(settings.transport.autoScrollTriggerPoint, 0.5);
  assert.equal(storage.writes, 6);

  settingsOps.setTransportSwitch("returnToStartOnStop", true);
  settingsOps.setTransportSwitch("clickToPlay", true);
  assert.deepEqual(settings.transport, { returnToStartOnStop: true, secondStopReturnsToStart: false, autoScrollMode: "page", autoScrollTriggerPoint: 0.5, suspendOnManualScroll: true, clickToPlay: true, stationaryWhileRecording: false });
  assert.equal(storage.writes, 8);
  settingsOps.setTransportSwitch("clickToPlay", true);
  assert.equal(storage.writes, 8, "same value: no write");

  assert.throws(() => settingsOps.setHardwareProfile("turbo"), /unknown hardware profile/);
  assert.throws(() => settingsOps.setExportOutput("midi", true), /unknown export output/);
  assert.throws(() => settingsOps.setMotion("none"), /unknown motion preference/);
  assert.throws(() => settingsOps.setTransportMode("warp"), /unknown follow mode/);
  assert.throws(() => settingsOps.setTransportTriggerPoint(0.42), /unknown trigger point/);
  assert.throws(() => settingsOps.setTransportSwitch("turbo", true), /unknown transport switch/);
  assert.equal(storage.writes, 8, "a refused op writes nothing");

  const stored = parseSettings(storage.data.get(SETTINGS_KEY));
  assert.deepEqual(stored, {
    hardwareProfile: "lite",
    export: { fullMix: false, stems: true, buses: false, depth: "float32", rate: null, dither: false },
    motion: "reduced",
    onboarding: "pending",
    transport: { returnToStartOnStop: true, secondStopReturnsToStart: false, autoScrollMode: "page", autoScrollTriggerPoint: 0.5, suspendOnManualScroll: true, clickToPlay: true, stationaryWhileRecording: false },
  });
  assert.equal(settings.storage.writes, 8);
  fresh();
});

test("stored once, restored at the next attach — profile, export outputs, motion and the guide's state together", () => {
  fresh();
  const storage = memoryStorage();
  attachSettings(storage);
  settingsOps.setHardwareProfile("standard");
  settingsOps.setExportOutput("buses", true);
  settingsOps.setMotion("reduced");
  settingsOps.finishGuide();
  settingsOps.setTransportMode("centered");
  settingsOps.setTransportSwitch("secondStopReturnsToStart", true);
  const text = storage.data.get(SETTINGS_KEY);

  // "another session": defaults in memory, then the same storage attached
  fresh();
  assert.deepEqual(settings.snapshot(), DEFAULT_SETTINGS);
  assert.equal(attachSettings(storage), true);
  assert.deepEqual(settings.snapshot(), {
    hardwareProfile: "standard",
    export: { fullMix: true, stems: false, buses: true, depth: "float32", rate: null, dither: false },
    motion: "reduced",
    onboarding: "done",
    transport: { returnToStartOnStop: false, secondStopReturnsToStart: true, autoScrollMode: "centered", autoScrollTriggerPoint: 0.75, suspendOnManualScroll: true, clickToPlay: false, stationaryWhileRecording: false },
  });
  assert.equal(settings.transport.autoScrollMode, "centered");
  assert.equal(settings.storage.loaded, true);
  assert.equal(settings.showGuide, false);
  assert.equal(storage.data.get(SETTINGS_KEY), text, "reading does not rewrite");

  // a damaged document: defaults, said so, and the next change writes a good one
  storage.data.set(SETTINGS_KEY, "{broken");
  fresh();
  assert.equal(attachSettings(storage), false);
  assert.deepEqual(settings.snapshot(), DEFAULT_SETTINGS);
  settingsOps.setMotion("reduced");
  assert.deepEqual(parseSettings(storage.data.get(SETTINGS_KEY)), { ...DEFAULT_SETTINGS, motion: "reduced" });
  fresh();
});

test("the first-run guide: due until skipped or finished; both are remembered; Settings can bring it back; non-blocking by construction", () => {
  fresh();
  const storage = memoryStorage();
  attachSettings(storage);
  assert.equal(settings.onboarding, "pending");
  assert.equal(settings.showGuide, true, "a fresh profile: the guide is due");

  settingsOps.skipGuide();
  assert.equal(settings.onboarding, "skipped");
  assert.equal(settings.showGuide, false);
  assert.equal(storage.writes, 1);
  settingsOps.skipGuide();
  assert.equal(storage.writes, 1);

  fresh();
  attachSettings(storage);
  assert.equal(settings.showGuide, false, "skipped is remembered across sessions");

  settingsOps.showGuideAgain();
  assert.equal(settings.onboarding, "pending");
  assert.equal(settings.showGuide, true);
  settingsOps.finishGuide();
  assert.equal(settings.onboarding, "done");
  assert.equal(settings.showGuide, false);
  fresh();
  attachSettings(storage);
  assert.equal(settings.onboarding, "done", "finished is remembered across sessions");
  assert.equal(settings.showGuide, false);

  // no storage at all: the guide can still be skipped for the session; nothing is reported stored
  fresh();
  assert.equal(settings.storage.attached, false);
  assert.equal(settings.showGuide, true);
  settingsOps.skipGuide();
  assert.equal(settings.showGuide, false);
  assert.equal(settings.storage.writes, 0);
  fresh();
});

test("subscribers hear every change and the attach; a failing storage keeps the setting and reports the error; detach stops writing", () => {
  fresh();
  const heard = [];
  const stop = settings.subscribe((s) => heard.push(`${s.motion}/${s.onboarding}`));
  let refuse = false;
  const storage = memoryStorage({ failWrites: () => refuse });
  attachSettings(storage);
  assert.deepEqual(heard, ["system/pending"], "attach announces the (default) state once");
  settingsOps.setMotion("reduced");
  assert.deepEqual(heard, ["system/pending", "reduced/pending"]);
  refuse = true;
  settingsOps.skipGuide();
  assert.equal(settings.onboarding, "skipped", "the setting holds in memory");
  assert.match(settings.storage.error, /write refused/);
  assert.equal(settings.storage.writes, 1);
  assert.deepEqual(heard.at(-1), "reduced/skipped", "listeners hear it even when storage did not take it");
  refuse = false;
  settingsOps.finishGuide();
  assert.equal(settings.storage.error, null, "the next successful write clears the error");
  assert.equal(settings.storage.writes, 2);
  stop();
  settingsOps.setMotion("system");
  assert.equal(heard.length, 4, "unsubscribed");
  detachSettings();
  assert.deepEqual(settings.storage, { attached: false, storage: null, loaded: false, error: null, writes: 0 });
  settingsOps.setMotion("reduced");
  assert.equal(storage.writes, 3, "detached: nothing more is written");
  fresh();
});

test("Task 11.1: the export dialog's remembered format — depth, rate and dither — persists and an old document takes the defaults", () => {
  fresh();
  const storage = memoryStorage();
  attachSettings(storage);
  assert.deepEqual(settings.snapshot().export, { fullMix: true, stems: false, buses: false, depth: "float32", rate: null, dither: false }, "the honest defaults: float32, the project's rate, no dither");
  settingsOps.setExportDepth("pcm24");
  settingsOps.setExportRate(44100);
  settingsOps.setExportDither(true);
  const text = storage.data.get(SETTINGS_KEY);
  assert.ok(/"depth":"pcm24"/.test(text) && /"rate":44100/.test(text) && /"dither":true/.test(text), text);

  fresh();
  attachSettings(storage);
  assert.deepEqual(settings.snapshot().export, { fullMix: true, stems: false, buses: false, depth: "pcm24", rate: 44100, dither: true }, "remembered");

  // a document from before 11.1 (no depth/rate/dither keys) takes the defaults
  storage.data.set(SETTINGS_KEY, JSON.stringify({ schema: SETTINGS_SCHEMA, hardwareProfile: "auto", export: { fullMix: true, stems: true, buses: false }, motion: "system", onboarding: "pending", transport: { ...DEFAULT_SETTINGS.transport } }));
  fresh();
  assert.equal(attachSettings(storage), true);
  assert.deepEqual(settings.snapshot().export, { fullMix: true, stems: true, buses: false, depth: "float32", rate: null, dither: false }, "an old document keeps its outputs and takes the format defaults");

  // the rate select's null is legal (follow the project) and anything else is refused
  assert.throws(() => settingsOps.setExportRate(96000), /unknown export rate/);
  fresh();
});
