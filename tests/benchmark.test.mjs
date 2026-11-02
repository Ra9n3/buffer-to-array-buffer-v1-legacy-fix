// Task 5.2 — the hardware benchmark and the estimate (plan §11, "measured, not promised"): the
// workload is deterministic, the throughput is what the clock says, the profile follows the
// thresholds, the cache is honoured only while valid, the estimate exists only once measured, and
// the Settings override always wins.
import test from "node:test";
import assert from "node:assert/strict";
import { BENCHMARK_KEY, BENCHMARK_MAX_AGE_MS, BENCHMARK_SCHEMA, BENCHMARK_WORKLOAD_SECONDS, ESTIMATE_MARGIN, benchmarkWorkload, estimateSeconds, parseBenchmark, runBenchmark, serializeBenchmark } from "../src/lib/analysis/benchmark.ts";
import { ENGINE_VERSION } from "../src/lib/analysis/analyser.ts";
import { PROFILE_SETTINGS, PROFILE_THRESHOLDS, UNMEASURED_PROFILE, chooseProfile } from "../src/lib/analysis/profiles.ts";
import { analyseBytes } from "../src/lib/analysis/analyse.ts";
import { sha256Hex } from "../src/lib/audio/asset-store.ts";
import { hardware } from "../src/lib/project/hardware.svelte.ts";
import { memoryStorage } from "../src/lib/project/persistence.ts";
import { detachSettings, settingsOps } from "../src/lib/settings.svelte.ts";

const NOW = "2026-11-03T12:00:00.000Z";
const nowMs = () => Date.parse(NOW);

test("the workload is the same bytes every time, a representative stem (tones, hiss, clicks) the engine measures in full", async () => {
  const a = benchmarkWorkload();
  const b = benchmarkWorkload();
  assert.equal(await sha256Hex(a), await sha256Hex(b));
  const r = await analyseBytes(a);
  assert.equal(r.format.seconds, BENCHMARK_WORKLOAD_SECONDS);
  assert.equal(r.format.channels, 2);
  assert.equal(r.format.bitDepth, 24);
  assert.ok(r.transient.onsetCount >= 8, `clicks found: ${r.transient.onsetCount}`);
  assert.ok(r.level.integratedLufs > -20 && r.level.integratedLufs < -5, `level ${r.level.integratedLufs}`);
  assert.ok(r.spectral.balance.low > 0.3, "the 110 Hz tone");
  assert.ok(r.stereo.correlation > 0 && r.stereo.correlation < 1, "the channels differ");
  assert.equal(r.integrity.clipped, false);
});

test("runBenchmark: throughput = audio seconds / wall seconds from the injected clock; the profile follows the thresholds with the cores / memory rule", async () => {
  const clockOf = (elapsedMs) => {
    let calls = 0;
    return () => (calls++ === 0 ? 1000 : 1000 + elapsedMs);
  };
  const fast = await runBenchmark({ now: () => NOW, clock: clockOf(20), cores: 8, memoryGb: 8 });
  assert.equal(fast.schema, BENCHMARK_SCHEMA);
  assert.equal(fast.engineVersion, ENGINE_VERSION);
  assert.equal(fast.measuredAt, NOW);
  assert.equal(fast.workloadSeconds, 4);
  assert.equal(fast.elapsedMs, 20);
  assert.equal(fast.throughput, 200);
  assert.equal(fast.profile, "performance");
  assert.deepEqual([fast.cores, fast.memoryGb], [8, 8]);
  const fewCores = await runBenchmark({ now: () => NOW, clock: clockOf(20), cores: 2, memoryGb: null });
  assert.equal(fewCores.profile, "standard", "fast but two cores");
  const slow = await runBenchmark({ now: () => NOW, clock: clockOf(400), cores: 8, memoryGb: 8 });
  assert.equal(slow.throughput, 10);
  assert.equal(slow.profile, "lite");
  const middling = await runBenchmark({ now: () => NOW, clock: clockOf(80), cores: null, memoryGb: null });
  assert.equal(middling.throughput, 50);
  assert.equal(middling.profile, "standard");

  assert.equal(chooseProfile(PROFILE_THRESHOLDS.liteBelow - 0.01, { cores: null, memoryGb: null }), "lite");
  assert.equal(chooseProfile(PROFILE_THRESHOLDS.liteBelow, { cores: null, memoryGb: null }), "standard");
  assert.equal(chooseProfile(PROFILE_THRESHOLDS.performanceFrom, { cores: null, memoryGb: null }), "performance", "unknown cores / memory do not block");
  assert.equal(chooseProfile(PROFILE_THRESHOLDS.performanceFrom, { cores: 4, memoryGb: 2 }), "standard", "known low memory does");
  assert.equal(chooseProfile(Number.NaN, { cores: 8, memoryGb: 8 }), "lite");
  assert.deepEqual(Object.keys(PROFILE_SETTINGS), ["lite", "standard", "performance"]);
  assert.ok(PROFILE_SETTINGS.lite.sliceSeconds < PROFILE_SETTINGS.standard.sliceSeconds && PROFILE_SETTINGS.standard.sliceSeconds < PROFILE_SETTINGS.performance.sliceSeconds);
  assert.equal(UNMEASURED_PROFILE, "standard");
});

test("the cache: a record round-trips; it is rejected when malformed, from another engine version, another core count, older than 30 days or from the future", async () => {
  const record = await runBenchmark({ now: () => NOW, clock: (() => { let c = 0; return () => (c++ === 0 ? 0 : 40); })(), cores: 4, memoryGb: 8 });
  const text = serializeBenchmark(record);
  assert.deepEqual(parseBenchmark(text, { cores: 4, nowMs: nowMs() }), record);
  assert.deepEqual(parseBenchmark(text, { cores: 4, nowMs: nowMs() + BENCHMARK_MAX_AGE_MS }), record, "on the last day");
  assert.equal(parseBenchmark(text, { cores: 4, nowMs: nowMs() + BENCHMARK_MAX_AGE_MS + 1 }), null, "expired");
  assert.equal(parseBenchmark(text, { cores: 4, nowMs: nowMs() - 3_600_000 }), null, "a record from the future");
  assert.equal(parseBenchmark(text, { cores: 8, nowMs: nowMs() }), null, "another machine (cores)");
  assert.equal(parseBenchmark(text, { cores: 4, nowMs: nowMs(), engineVersion: ENGINE_VERSION + 1 }), null, "another engine");
  assert.equal(parseBenchmark(null, { cores: 4, nowMs: nowMs() }), null);
  assert.equal(parseBenchmark("junk", { cores: 4, nowMs: nowMs() }), null);
  assert.equal(parseBenchmark(JSON.stringify({ ...record, throughput: 0 }), { cores: 4, nowMs: nowMs() }), null);
  assert.equal(parseBenchmark(JSON.stringify({ ...record, profile: "turbo" }), { cores: 4, nowMs: nowMs() }), null);
  assert.equal(parseBenchmark(JSON.stringify({ ...record, schema: "alloy.benchmark/0" }), { cores: 4, nowMs: nowMs() }), null);
  assert.equal(parseBenchmark(JSON.stringify({ ...record, cores: null }), { cores: null, nowMs: nowMs() }).cores, null, "no cores reported, consistently");
});

test("the estimate: null without a measurement; otherwise work / throughput with the margin, rounded up to whole seconds; nothing to do is 0", () => {
  assert.equal(estimateSeconds(300, null), null);
  const record = { schema: BENCHMARK_SCHEMA, engineVersion: ENGINE_VERSION, measuredAt: NOW, workloadSeconds: 4, elapsedMs: 50, throughput: 80, profile: "standard", cores: 4, memoryGb: null };
  assert.equal(estimateSeconds(300, record), Math.ceil((300 / 80) * ESTIMATE_MARGIN));
  assert.equal(estimateSeconds(0, record), 0);
  assert.equal(estimateSeconds(1, record), 1);
  assert.equal(estimateSeconds(10, { ...record, throughput: 0 }), null);
  assert.equal(ESTIMATE_MARGIN, 1.25);
});

test("the hardware module: unmeasured until ensure(); one run shared by concurrent callers; cached under alloy.benchmark and read back on attach; invalidate() measures again; the Settings override wins over the benchmark", async () => {
  detachSettings();
  settingsOps.resetAll();
  const storage = memoryStorage();
  let t = 0;
  const deps = { storage, now: () => NOW, nowMs, clock: () => (t += 25), cores: 8, memoryGb: 8 };
  hardware.attach(deps);
  assert.equal(hardware.benchmark, null);
  assert.deepEqual(hardware.profile, { id: "standard", source: "unmeasured", settings: PROFILE_SETTINGS.standard });
  assert.equal(hardware.estimateSeconds(60), null);
  assert.equal(hardware.measuring, false);

  const [a, b] = await Promise.all([hardware.ensure(), hardware.ensure()]);
  assert.equal(a, b, "one run");
  assert.equal(hardware.runs, 1);
  assert.equal(a.throughput, 4000 / 25, "4 s of audio in the clock's 25 ms");
  assert.equal(a.profile, "performance");
  assert.deepEqual(hardware.profile, { id: "performance", source: "benchmark", settings: PROFILE_SETTINGS.performance });
  assert.equal(hardware.estimateSeconds(600), Math.ceil((600 / 160) * ESTIMATE_MARGIN));
  assert.equal(storage.data.get(BENCHMARK_KEY), serializeBenchmark(a));
  assert.equal(await hardware.ensure(), a, "cached in memory");
  assert.equal(hardware.runs, 1);

  // a new session on the same machine reads the cache; on another core count it does not
  hardware.detach();
  assert.equal(hardware.benchmark, null);
  hardware.attach(deps);
  assert.deepEqual(hardware.benchmark, a);
  assert.equal(hardware.profile.source, "benchmark");
  hardware.attach({ ...deps, cores: 2 });
  assert.equal(hardware.benchmark, null, "another core count: measure again");
  hardware.attach(deps);

  hardware.invalidate();
  assert.equal(hardware.profile.source, "unmeasured");
  const again = await hardware.ensure();
  assert.equal(hardware.runs, 1, "runs count since attach");
  assert.notEqual(again, a);
  assert.equal(storage.data.get(BENCHMARK_KEY), serializeBenchmark(again));

  // the override
  settingsOps.setHardwareProfile("lite");
  assert.deepEqual(hardware.profile, { id: "lite", source: "override", settings: PROFILE_SETTINGS.lite });
  assert.equal(hardware.estimateSeconds(600), Math.ceil((600 / again.throughput) * ESTIMATE_MARGIN), "the estimate still comes from the measurement");
  settingsOps.setHardwareProfile("auto");
  assert.equal(hardware.profile.id, "performance");

  // no storage: works, never caches
  hardware.attach({ ...deps, storage: null });
  assert.equal(hardware.benchmark, null);
  await hardware.ensure();
  assert.equal(hardware.profile.source, "benchmark");
  // detach mid-run: the result is dropped
  hardware.attach({ ...deps, storage: memoryStorage() });
  const pending = hardware.ensure();
  hardware.detach();
  assert.equal(await pending, null);
  assert.equal(hardware.benchmark, null);
  assert.equal(await hardware.ensure(), null, "not attached");
  settingsOps.resetAll();
});
