// Task 5.2 — the engine as a whole and in the app: slicing never changes a figure; the stored copy is
// read in slices from its head; the queue runs automatically after an import and after a reopen,
// stores its results, reads them back on reload without re-measuring, re-measures stale ones, marks
// missing copies, drops a run when the project switches, and keeps a result the store refused.
import test from "node:test";
import assert from "node:assert/strict";
import { analyseBytes, analyseSource, AnalysisAborted } from "../src/lib/analysis/analyse.ts";
import { ANALYSIS_SCHEMA, ENGINE_VERSION } from "../src/lib/analysis/analyser.ts";
import { byteSourceOf, readStoredFormat, AnalysisError } from "../src/lib/analysis/decode.ts";
import { memoryAssetStore } from "../src/lib/audio/asset-store.ts";
import { analysis } from "../src/lib/project/analysis.svelte.ts";
import { assets } from "../src/lib/project/assets.svelte.ts";
import { hardware } from "../src/lib/project/hardware.svelte.ts";
import { lifecycle, projectKey } from "../src/lib/project/lifecycle.ts";
import { autosave, clipboard, history, loadProject, project } from "../src/lib/project/store.svelte.ts";
import { SESSION_PROJECT_ID, createSessionProject } from "../src/lib/project/session.ts";
import { memoryStorage } from "../src/lib/project/persistence.ts";
import { detachSettings, settingsOps } from "../src/lib/settings.svelte.ts";
import { MP3ISH, silence, sine, source } from "./wav-fixtures.mjs";
import { RATE, mono, noiseSampler, stereo } from "./analysis-fixtures.mjs";

const seriesEqual = (a, b, what) => {
  assert.equal(a.length, b.length, `${what} length`);
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (Number.isNaN(x) && Number.isNaN(y)) continue;
    if (x === y) continue;
    assert.ok(Math.abs(x - y) <= 1e-5 * Math.max(1, Math.abs(x)), `${what}[${i}] ${x} vs ${y}`);
  }
};

function assertSameResult(a, b) {
  assert.deepEqual(a.format, b.format);
  assert.equal(a.cellCount, b.cellCount);
  for (const key of ["samplePeakDbfs", "truePeakDbtp", "rmsDbfs", "crestFactorDb", "integratedLufs", "momentaryMaxLufs", "shortTermMaxLufs", "loudnessRangeLu"]) {
    const x = a.level[key];
    const y = b.level[key];
    if (x === null || y === null) assert.equal(x, y, key);
    else assert.ok(Math.abs(x - y) <= 1e-6 * Math.max(1, Math.abs(x)), `${key} ${x} vs ${y}`);
  }
  for (const key of ["rmsDbfsCells", "peakDbfsCells", "momentaryLufs", "shortTermLufs"]) seriesEqual(a.level[key], b.level[key], key);
  a.spectral.bandDb.forEach((s, i) => seriesEqual(s, b.spectral.bandDb[i], `band ${i}`));
  seriesEqual(a.spectral.centroidHz, b.spectral.centroidHz, "centroid");
  assert.deepEqual(a.spectral.balance, b.spectral.balance);
  seriesEqual(a.transient.fluxDb, b.transient.fluxDb, "flux");
  seriesEqual(a.transient.crestDb, b.transient.crestDb, "crest");
  assert.deepEqual(Array.from(a.transient.onsetSeconds), Array.from(b.transient.onsetSeconds));
  seriesEqual(a.stereo.correlationCells, b.stereo.correlationCells, "correlation");
  seriesEqual(a.stereo.widthDbCells, b.stereo.widthDbCells, "width");
  assert.deepEqual(a.integrity, b.integrity);
}

test("slicing never changes a figure: one pass, 100 ms slices and 0.7 s slices give the same result for a busy stereo stem and for a mono one; progress and yields are reported per slice", async () => {
  const noise = noiseSampler(0.2);
  const busy = stereo(3.37, (c, n) => noise(c, n) + 0.3 * Math.sin((2 * Math.PI * 220 * n) / RATE) * (n % 24000 < 6000 ? 1 : 0.1) + (n % 19200 < 96 ? 0.6 : 0));
  const one = await analyseBytes(busy, { sliceFrames: 10 ** 9 });
  const progress = [];
  let yields = 0;
  const fine = await analyseBytes(busy, { sliceFrames: 4800, onProgress: (f) => progress.push(f), yieldBetween: async () => void yields++ });
  const odd = await analyseBytes(busy, { sliceFrames: 0.7 * RATE });
  assertSameResult(one, fine);
  assertSameResult(one, odd);
  assert.equal(progress.length, Math.ceil(3.37 * 10));
  assert.equal(progress.at(-1), 1);
  assert.equal(yields, progress.length - 1, "no yield after the last slice");
  assert.ok(one.transient.onsetCount >= 8 && one.stereo.correlation > 0.5, "the stem was busy");

  const m = mono(2.05, (n) => 0.4 * Math.sin(n * 0.07) * (n % 9600 < 2400 ? 1 : 0.2), { encoding: "float", bitDepth: 32 });
  assertSameResult(await analyseBytes(m), await analyseBytes(m, { sliceFrames: 4800 }));
  // a slice request smaller than a cell is a cell; a non-multiple is rounded down to whole cells
  const tiny = [];
  await analyseBytes(m, { sliceFrames: 10, onProgress: (f) => tiny.push(f) });
  assert.equal(tiny.length, 21);
  const rounded = [];
  await analyseBytes(m, { sliceFrames: 7000, onProgress: (f) => rounded.push(f) });
  assert.equal(rounded.length, 21, "7000 frames → one 4800-frame cell per slice");
});

test("the stored copy is read from its head: the header from 64 kB, samples by frame range; a long pre-data chunk is still found; an abort stops between slices; a non-WAV copy is unreadable", async () => {
  const bytes = sine(2, { channels: 2 });
  const reads = [];
  const source = {
    size: bytes.length,
    read: async (offset, length) => {
      reads.push([offset, length]);
      return bytes.subarray(offset, Math.min(bytes.length, offset + length));
    },
  };
  const result = await analyseSource(source, { sliceFrames: 48000 });
  assert.equal(result.format.frames, 96000);
  assert.deepEqual(reads[0], [0, Math.min(bytes.length, 65536)], "the head");
  assert.equal(reads.length, 3, "head + two slices");
  assert.equal(reads[1][1], 48000 * 6, "one second of 24-bit stereo frames");
  assert.equal(reads[2][0], reads[1][0] + reads[1][1]);

  // a 200 kB chunk before `data`: the first head is too short, the next is not
  const padded = sine(1, { channels: 1, extraChunks: [{ id: "JUNK", bytes: new Uint8Array(200 * 1024) }] });
  const format = await readStoredFormat(byteSourceOf(padded));
  assert.equal(format.frames, 48000);
  assert.ok(format.dataOffset > 200 * 1024);
  const r = await analyseBytes(padded);
  assert.equal(r.format.channels, 1);

  const signal = { aborted: false };
  let slices = 0;
  await assert.rejects(
    analyseBytes(sine(3, { channels: 2 }), {
      sliceFrames: 4800,
      signal,
      onProgress: () => {
        if (++slices === 5) signal.aborted = true;
      },
    }),
    (e) => e instanceof AnalysisAborted,
  );
  assert.equal(slices, 5, "nothing read after the stop");

  await assert.rejects(analyseBytes(MP3ISH), (e) => e instanceof AnalysisError && e.reason === "unreadable");
  await assert.rejects(analyseBytes(bytes.subarray(0, 1000)), (e) => e instanceof AnalysisError && /truncated/.test(e.message));
});

// --- in the app ----------------------------------------------------------------------------------

const newId = (() => {
  let n = 0;
  return () => `asset-${++n}`;
})();
const now = () => "2026-11-03T10:00:00.000Z";
const tick = () => new Promise((r) => setTimeout(r, 0));

async function settle(predicate, limitMs = 20000) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > limitMs) throw new Error("the queue did not settle");
    await tick();
  }
}

function rig({ storage = memoryStorage(), ids = ["project-a", "project-b", "project-c"], storeOptions } = {}) {
  reset();
  let i = 0;
  autosave.attach(storage, { delayMs: 1000, schedule: () => () => {} });
  lifecycle.attach({ storage, now, newId: () => ids[i++ % ids.length] });
  const assetStore = memoryAssetStore(storeOptions);
  let ms = 0;
  hardware.attach({ storage, now, nowMs: () => Date.parse(now()), clock: () => (ms += 50), cores: 8, memoryGb: 8 });
  assets.attach(assetStore, { newId, now, afterImport: (trackIds) => analysis.enqueue(trackIds) });
  analysis.attach(assetStore, { now, clock: () => (ms += 10), yieldBetween: tick });
  return { storage, assetStore };
}

function reset() {
  analysis.detach();
  assets.detach();
  hardware.detach();
  detachSettings();
  settingsOps.resetAll();
  autosave.detach();
  lifecycle.detach();
  clipboard.clear();
  loadProject(createSessionProject());
  history.clear();
  autosave.retarget(projectKey(SESSION_PROJECT_ID), null);
}

test("in the app: an import queues the new tracks automatically; they are analysed one at a time, the results stored under the asset with the track's hash and the engine version; the benchmark ran once first", async () => {
  const { storage, assetStore } = rig();
  lifecycle.restoreLast();
  lifecycle.startEmpty();
  assert.equal(hardware.benchmark, null);
  assert.equal(hardware.profile.source, "unmeasured");
  const result = await assets.importBatch([source("kick.wav", sine(1.5, { channels: 2 })), source("vox.wav", sine(1.2, { channels: 1 })), source("bad.mp3", MP3ISH)]);
  assert.equal(result.added, 2);
  const [kick, vox] = project.tracks;
  assert.ok(["queued", "analysing"].includes(analysis.statusOf(kick.id)), `queued at once: ${analysis.statusOf(kick.id)}`);
  assert.equal(analysis.statusOf(vox.id), "queued");
  assert.equal(analysis.statusOf("track-99"), null);
  assert.deepEqual(analysis.queued, [kick.id, vox.id]);
  assert.equal(analysis.estimate.seconds, null, "unmeasured: no estimate before the benchmark");
  assert.ok(Math.abs(analysis.estimate.workSeconds - 2.7) < 1e-9);

  await settle(() => analysis.summary.ready === 2);
  assert.equal(hardware.runs, 1, "the benchmark ran once, before the first stem");
  assert.ok(hardware.benchmark && hardware.benchmark.throughput > 0);
  assert.equal(hardware.profile.source, "benchmark");
  assert.ok(storage.data.has("alloy.benchmark"), "cached");
  assert.equal(analysis.queued.length, 0);
  assert.equal(analysis.current, null);
  const kickEntry = analysis.entryOf(kick.id);
  assert.equal(kickEntry.status, "ready");
  assert.equal(kickEntry.stored, true);
  assert.equal(kickEntry.progress, 1);
  assert.ok(kickEntry.elapsedMs >= 0);
  assert.equal(kickEntry.result.format.channels, 2);
  assert.equal(kickEntry.result.cellCount, 15);
  assert.ok(Math.abs(kickEntry.result.level.samplePeakDbfs - (-6.02)) < 0.01, "the fixture sine at 0.5");
  assert.equal(analysis.resultOf(vox.id).stereo.applicable, false, "a mono stem");
  assert.equal(assetStore.analysisPuts, 2);
  const stored = assetStore.analysis.get(kick.audio.assetId);
  assert.equal(stored.sha256, kick.audio.sha256);
  assert.equal(stored.engineVersion, ENGINE_VERSION);
  assert.equal(stored.projectId, project.id);
  assert.equal(stored.analysedAt, now());
  assert.equal(stored.result.schema, ANALYSIS_SCHEMA);
  assert.ok(stored.elapsedMs > 0);
  assert.equal(analysis.estimate.workSeconds, 0);
  assert.equal(analysis.estimate.seconds, 0);
  assert.equal(analysis.estimate.basis, "benchmark");
  // a manifest never carries results (the record lives with the asset)
  assert.ok(!storage.data.get(projectKey(project.id)).includes("alloy.analysis"));
});

test("reload: reopening the project reads the stored results back without re-measuring; a stale record (other hash, other engine version) is measured again; a silent stem is analysed but not a target", async () => {
  const { storage, assetStore } = rig();
  lifecycle.restoreLast();
  lifecycle.startEmpty();
  const projectId = project.id;
  await assets.importBatch([source("pad.wav", sine(1, { channels: 2 })), source("room.wav", silence(1, { channels: 2 }))]);
  await settle(() => analysis.summary.ready === 2);
  const [pad, room] = project.tracks;
  assert.equal(analysis.resultOf(room.id).integrity.silent, true);
  assert.equal(analysis.resultOf(room.id).integrity.analysisTarget, false);
  assert.equal(analysis.resultOf(pad.id).integrity.analysisTarget, true);
  const putsAfterImport = assetStore.analysisPuts;
  const padResult = analysis.resultOf(pad.id);

  // away and back
  lifecycle.startEmpty();
  assert.equal(analysis.summary.tracks, 0, "a fresh project has no entries");
  const opened = lifecycle.open(projectId);
  assert.equal(opened.ok, true);
  await settle(() => analysis.summary.ready === 2);
  assert.equal(assetStore.analysisPuts, putsAfterImport, "nothing re-measured");
  assert.equal(analysis.entryOf(pad.id).elapsedMs, null, "read back, not run this session");
  assert.equal(analysis.entryOf(pad.id).stored, true);
  assert.deepEqual(Array.from(analysis.resultOf(pad.id).level.momentaryLufs), Array.from(padResult.level.momentaryLufs));

  // stale by hash → measured again; stale by engine version → measured again
  const record = assetStore.analysis.get(pad.audio.assetId);
  assetStore.analysis.set(pad.audio.assetId, { ...record, sha256: "0".repeat(64) });
  const roomRecord = assetStore.analysis.get(room.audio.assetId);
  assetStore.analysis.set(room.audio.assetId, { ...roomRecord, engineVersion: ENGINE_VERSION + 1 });
  lifecycle.startEmpty();
  lifecycle.open(projectId);
  await settle(() => analysis.summary.ready === 2);
  assert.equal(assetStore.analysisPuts, putsAfterImport + 2, "both re-measured and re-stored");
  assert.equal(assetStore.analysis.get(pad.audio.assetId).sha256, pad.audio.sha256);
  assert.equal(assetStore.analysis.get(room.audio.assetId).engineVersion, ENGINE_VERSION);
  assert.ok(storage.data.has(projectKey(projectId)));
});

test("missing and failing copies: no copy → missing; a copy whose hash is not the track's → missing; a copy the engine cannot read → failed with the reason; a store that refuses the write keeps the result for the session", async () => {
  let refuse = false;
  const { assetStore } = rig({ storeOptions: { failAnalysisPuts: () => refuse } });
  lifecycle.restoreLast();
  lifecycle.startEmpty();
  await assets.importBatch([source("a.wav", sine(1, { channels: 2 })), source("b.wav", sine(1, { channels: 1 })), source("c.wav", sine(1, { channels: 2 }))]);
  await settle(() => analysis.summary.ready === 3);
  const [a, b, c] = project.tracks;
  const projectId = project.id;

  // tamper: a's copy gone, b's copy swapped, c's copy corrupted — and every result forgotten
  assetStore.assets.delete(a.audio.assetId);
  assetStore.assets.set(b.audio.assetId, { ...assetStore.assets.get(b.audio.assetId), sha256: "f".repeat(64) });
  const cRecord = assetStore.assets.get(c.audio.assetId);
  assetStore.assets.set(c.audio.assetId, { ...cRecord, bytes: cRecord.bytes.slice(0, 500) }); // a Blob in Node 20 too
  assetStore.analysis.clear();
  hardware.invalidate(); // the benchmark forgotten too: a missing copy must not cost a measurement
  const runsBefore = hardware.runs;
  lifecycle.startEmpty();
  lifecycle.open(projectId);
  await settle(() => analysis.summary.ready + analysis.summary.missing + analysis.summary.failed === 3);
  assert.equal(analysis.statusOf(a.id), "missing");
  assert.equal(analysis.statusOf(b.id), "missing");
  assert.equal(analysis.statusOf(c.id), "failed");
  assert.equal(hardware.runs, runsBefore + 1, "measured once, for the stem whose copy was there (c), not for the missing ones");
  assert.match(analysis.entryOf(c.id).error, /truncated/);
  assert.equal(analysis.resultOf(c.id), null);
  assert.equal(analysis.summary.failed, 1);

  // a refused write: measured, kept, flagged
  assetStore.assets.set(c.audio.assetId, cRecord);
  refuse = true;
  assert.equal(analysis.reanalyse(c.id), true);
  await settle(() => analysis.statusOf(c.id) === "ready");
  assert.equal(analysis.entryOf(c.id).stored, false);
  assert.match(analysis.entryOf(c.id).error, /not stored/);
  assert.ok(analysis.resultOf(c.id).level.integratedLufs < 0);
  assert.equal(analysis.reanalyse("track-nope"), false);
});

test("a project switch mid-analysis drops the run and its write; the next project's hydration starts clean; without an asset store nothing is queued and imported tracks are missing", async () => {
  const { assetStore } = rig();
  lifecycle.restoreLast();
  lifecycle.startEmpty();
  settingsOps.setHardwareProfile("lite"); // 2 s slices: the 6 s stem yields twice
  assert.equal(hardware.profile.source, "override");
  assert.equal(hardware.profile.settings.sliceSeconds, 2);
  const first = project.id;
  await assets.importBatch([source("long.wav", sine(6, { channels: 2 }))]);
  const [long] = project.tracks;
  await settle(() => analysis.statusOf(long.id) === "analysing" && analysis.entryOf(long.id).progress > 0);
  assert.ok(analysis.entryOf(long.id).progress < 1);
  assert.ok(analysis.estimate.workSeconds > 0 && analysis.estimate.workSeconds < 6, "the unread remainder");
  assert.equal(typeof analysis.estimate.seconds, "number", "measured by now");
  const putsBefore = assetStore.analysisPuts;
  lifecycle.startEmpty();
  assert.notEqual(project.id, first);
  assert.equal(analysis.statusOf(long.id), null, "the entries belong to the open project");
  assert.equal(analysis.current, null);
  assert.deepEqual(analysis.queued, []);
  await tick();
  await tick();
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(assetStore.analysisPuts, putsBefore, "the interrupted run wrote nothing");
  assert.equal(assetStore.analysis.has(long.audio.assetId), false);

  // back to the first project: measured now, from the start
  lifecycle.open(first);
  await settle(() => analysis.statusOf(long.id) === "ready");
  assert.equal(assetStore.analysisPuts, putsBefore + 1);

  // no store: hydrate says so
  analysis.detach();
  const report = await analysis.hydrate();
  assert.deepEqual(report, { projectId: first, ready: 0, queued: 0, aborted: false, because: "no-storage" });
  assert.equal(analysis.statusOf(long.id), "missing");
  assert.equal(analysis.enqueue([long.id]), 0);
  reset();
});

test("the asset store contract (Task 5.2): putAnalysis / getAnalysis keyed by the asset, overwrite, and remove() deletes the analysis with the copy; the memory store counts its writes", async () => {
  const store = memoryAssetStore();
  const bytes = sine(0.5, { channels: 2 });
  const result = await analyseBytes(bytes);
  assert.equal(await store.getAnalysis("asset-x"), null);
  const record = { assetId: "asset-x", projectId: "p", sha256: "a".repeat(64), engineVersion: ENGINE_VERSION, analysedAt: now(), elapsedMs: 12, result };
  await store.putAnalysis(record);
  assert.equal(store.analysisPuts, 1);
  assert.equal(await store.getAnalysis("asset-x"), record);
  await store.putAnalysis({ ...record, elapsedMs: 13 });
  assert.equal((await store.getAnalysis("asset-x")).elapsedMs, 13, "overwritten");
  await store.remove("asset-x");
  assert.equal(await store.getAnalysis("asset-x"), null);
  const failing = memoryAssetStore({ failAnalysisPuts: () => true });
  await assert.rejects(failing.putAnalysis(record), /refused/);
});
