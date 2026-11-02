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
  assert.deepEqual(DEFAULT_SETTINGS, { hardwareProfile: "auto", export: { fullMix: true, stems: false, buses: false }, motion: "system", onboarding: "pending" });
  assert.equal(SETTINGS_SCHEMA, "alloy.settings/1");
  assert.equal(SETTINGS_KEY, "alloy.settings");
});

test("the document: a round trip is exact; missing, malformed or out-of-vocabulary fields fall back one by one; junk is null", () => {
  const all = { hardwareProfile: "performance", export: { fullMix: false, stems: true, buses: true }, motion: "reduced", onboarding: "done" };
  const text = serializeSettings(all);
  assert.equal(JSON.parse(text).schema, SETTINGS_SCHEMA);
  assert.deepEqual(parseSettings(text), all);
  assert.deepEqual(parseSettings(JSON.stringify({ schema: SETTINGS_SCHEMA })), DEFAULT_SETTINGS, "an empty document is all defaults");
  assert.deepEqual(
    parseSettings(JSON.stringify({ schema: SETTINGS_SCHEMA, hardwareProfile: "turbo", export: { stems: "yes", buses: true }, motion: 3, onboarding: "skipped" })),
    { hardwareProfile: "auto", export: { fullMix: true, stems: false, buses: true }, motion: "system", onboarding: "skipped" },
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
  assert.deepEqual(settings.export, { fullMix: false, stems: true, buses: false });
  assert.equal(storage.writes, 3);
  settingsOps.setExportOutput("buses", false);
  assert.equal(storage.writes, 3);

  settingsOps.setMotion("reduced");
  assert.equal(settings.motion, "reduced");
  assert.equal(storage.writes, 4);
  settingsOps.setMotion("reduced");
  assert.equal(storage.writes, 4);

  assert.throws(() => settingsOps.setHardwareProfile("turbo"), /unknown hardware profile/);
  assert.throws(() => settingsOps.setExportOutput("midi", true), /unknown export output/);
  assert.throws(() => settingsOps.setMotion("none"), /unknown motion preference/);
  assert.equal(storage.writes, 4, "a refused op writes nothing");

  const stored = parseSettings(storage.data.get(SETTINGS_KEY));
  assert.deepEqual(stored, { hardwareProfile: "lite", export: { fullMix: false, stems: true, buses: false }, motion: "reduced", onboarding: "pending" });
  assert.equal(settings.storage.writes, 4);
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
  const text = storage.data.get(SETTINGS_KEY);

  // "another session": defaults in memory, then the same storage attached
  fresh();
  assert.deepEqual(settings.snapshot(), DEFAULT_SETTINGS);
  assert.equal(attachSettings(storage), true);
  assert.deepEqual(settings.snapshot(), { hardwareProfile: "standard", export: { fullMix: true, stems: false, buses: true }, motion: "reduced", onboarding: "done" });
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
