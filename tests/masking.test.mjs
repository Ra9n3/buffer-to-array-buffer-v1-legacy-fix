// Task 7.3 — masking resolution: detection, priority, static/dynamic EQ, re-measurement,
// cumulative safety, wet tails, sends, Manual ownership and sidechain fallback.
import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_MASKING_DETECTION,
  DEFAULT_MASKING_RESOLUTION,
  detectMaskingConflicts,
  measureMaskingSources,
  resolveMaskingAudio,
  resolveMaskingConflicts,
} from "../src/lib/engine/masking.ts";
import { MixEngine } from "../src/lib/engine/mix-engine.ts";
import { ReturnChain } from "../src/lib/engine/chains.ts";
import { validateSidechains } from "../src/lib/engine/sidechain.ts";
import { BANDS } from "../src/lib/analysis/spectral.ts";
import { RATE, projectFixture, returnFixture, rms, tapBlock, toneBlock, trackFixture } from "./engine-fixtures.mjs";

const CELL_SECONDS = 0.1;

function source(id, trackId, priority, bandIndex, cells, kind = "dry", returnId = null) {
  const bandDb = BANDS.map(() => new Float32Array(cells).fill(-Infinity));
  const bandShare = BANDS.map(() => new Float32Array(cells).fill(0));
  return { id, trackId, priority, kind, returnId, bandDb, bandShare, bandIndex };
}

function put(src, bandIndex, cell, db, share = 0.8) {
  src.bandDb[bandIndex][cell] = db;
  src.bandShare[bandIndex][cell] = share;
}

function measurement(sources, cells = 20) {
  return { sampleRate: RATE, cellSeconds: CELL_SECONDS, cellCount: cells, frames: cells * 4800, sources };
}

function audioOf(tracks, frames) {
  const inputs = new Map();
  for (const [id, signal] of Object.entries(tracks)) inputs.set(id, { channels: signal, frames });
  return inputs;
}

function burst(frames, hz, amplitude, ranges) {
  const signal = toneBlock(frames, hz, amplitude);
  for (let i = 0; i < frames; i++) {
    const t = i / RATE;
    if (!ranges.some(([start, end]) => t >= start && t < end)) {
      signal[0][i] = 0;
      signal[1][i] = 0;
    }
  }
  return signal;
}

function bandIndex(id) {
  return BANDS.findIndex((band) => band.id === id);
}

// --- detection -----------------------------------------------------------------

test("same frequency band at different times is not a masking conflict", () => {
  const a = source("track-a", "track-a", 9, bandIndex("mid"), 20);
  const b = source("track-b", "track-b", 3, bandIndex("mid"), 20);
  for (let c = 0; c < 10; c++) put(a, bandIndex("mid"), c, -20);
  for (let c = 10; c < 20; c++) put(b, bandIndex("mid"), c, -20);
  assert.deepEqual(detectMaskingConflicts(measurement([a, b])), []);
});

test("meaningful simultaneous overlap identifies contributors, region, intervals and priority", () => {
  const a = source("track-a", "track-a", 9, bandIndex("mid"), 20);
  const b = source("track-b", "track-b", 3, bandIndex("mid"), 20);
  for (let c = 2; c < 12; c++) {
    put(a, bandIndex("mid"), c, -20);
    put(b, bandIndex("mid"), c, -18);
  }
  const [conflict] = detectMaskingConflicts(measurement([a, b]));
  assert.ok(conflict);
  assert.equal(conflict.protectedSource.trackId, "track-a");
  assert.equal(conflict.yieldingSource.trackId, "track-b");
  assert.equal(conflict.band.id, "mid");
  assert.equal(conflict.persistence, "persistent");
  assert.equal(conflict.intervals[0].startSeconds, 0.2);
  assert.ok(Math.abs(conflict.intervals[0].endSeconds - 1.2) < 1e-9);
  assert.ok(conflict.excessDb > 1.9 && conflict.excessDb < 2.1);
  assert.equal(conflict.priorityDifference, 6);
});

test("a quiet spectral overlap outside the masking window does not trigger a cut", () => {
  const a = source("track-a", "track-a", 9, bandIndex("mid"), 20);
  const b = source("track-b", "track-b", 3, bandIndex("mid"), 20);
  for (let c = 0; c < 20; c++) {
    put(a, bandIndex("mid"), c, -10);
    put(b, bandIndex("mid"), c, -40);
  }
  assert.deepEqual(detectMaskingConflicts(measurement([a, b])), []);
});

test("intermittent overlap is classified separately from persistent overlap", () => {
  const a = source("track-a", "track-a", 9, bandIndex("mid"), 40);
  const b = source("track-b", "track-b", 3, bandIndex("mid"), 40);
  for (let c = 0; c < 40; c++) put(b, bandIndex("mid"), c, -20);
  for (const c of [2, 3, 12, 13, 22, 23]) put(a, bandIndex("mid"), c, -20);
  const [conflict] = detectMaskingConflicts(measurement([a, b], 40));
  assert.ok(conflict);
  assert.equal(conflict.persistence, "intermittent");
  assert.equal(conflict.intervals.length, 3);
});

test("equal priority does not arbitrarily choose a yielding track", () => {
  const a = source("track-a", "track-a", 5, bandIndex("mid"), 10);
  const b = source("track-b", "track-b", 5, bandIndex("mid"), 10);
  for (let c = 0; c < 10; c++) {
    put(a, bandIndex("mid"), c, -20);
    put(b, bandIndex("mid"), c, -20);
  }
  assert.deepEqual(detectMaskingConflicts(measurement([a, b], 10)), []);
});

// --- resolution on synthetic measurements --------------------------------------

function conflictFixture(persistence = "persistent") {
  const cells = 20;
  const a = source("track-a", "track-a", 9, bandIndex("mid"), cells);
  const b = source("track-b", "track-b", 3, bandIndex("mid"), cells);
  for (let c = 0; c < cells; c++) {
    put(a, bandIndex("mid"), c, -20);
    put(b, bandIndex("mid"), c, -18);
  }
  if (persistence === "intermittent") {
    for (let c = 0; c < cells; c++) {
      if (c % 5 >= 2) {
        a.bandDb[bandIndex("mid")][c] = -Infinity;
        a.bandShare[bandIndex("mid")][c] = 0;
      }
    }
  }
  return detectMaskingConflicts(measurement([a, b], cells));
}

test("persistent conflict uses a proportional static EQ cut on the lower-priority Auto band", () => {
  const project = projectFixture({ tracks: [trackFixture({ id: "track-a" }), trackFixture({ id: "track-b" })] });
  const [conflict] = conflictFixture("persistent");
  const result = resolveMaskingConflicts(project, [conflict]);
  const action = result.actions.find((entry) => entry.kind === "static-eq");
  assert.ok(action);
  assert.equal(action.trackId, "track-b");
  assert.ok(action.cutDb > 0 && action.cutDb <= DEFAULT_MASKING_RESOLUTION.maxCutPerConflictDb);
  const original = project.tracks[1].chain.eq.bands.find((band) => band.band.id === action.bandId);
  const resolved = result.project.tracks[1].chain.eq.bands.find((band) => band.band.id === action.bandId);
  assert.equal(resolved.gain.value, original.gain.value - action.cutDb);
  assert.equal(resolved.gain.mode, "auto");
  assert.equal(result.project.tracks[0].chain.eq.bands[1].gain.value, 0);
});

test("intermittent conflict uses an external-key Dynamic EQ dip and preserves existing depths", () => {
  const project = projectFixture({ tracks: [trackFixture({ id: "track-a" }), trackFixture({ id: "track-b" })] });
  const [conflict] = conflictFixture("intermittent");
  const result = resolveMaskingConflicts(project, [conflict]);
  const action = result.actions.find((entry) => entry.kind === "dynamic-eq");
  assert.ok(action);
  assert.equal(action.trackId, "track-b");
  assert.ok(result.dynamicBands.get("track-b")?.some((band) => band.bandId === action.bandId));
  assert.ok(result.project.sidechains.some((edge) => edge.source === "track-a" && edge.destination === "track-b" && edge.processor === "dynamic-eq"));
  assert.equal(result.project.tracks[1].chain.eq.bands.find((band) => band.band.id === action.bandId).dynamicDepthDb, null);
});

test("Manual EQ gain and Manual sends are never overwritten", () => {
  const trackB = trackFixture({ id: "track-b" });
  const gain = trackB.chain.eq.bands.find((band) => band.band.id === "lmf").gain;
  gain.mode = "manual";
  gain.value = -4;
  const project = projectFixture({ tracks: [trackFixture({ id: "track-a" }), trackB] });
  const [conflict] = conflictFixture("persistent");
  const result = resolveMaskingConflicts(project, [conflict]);
  const resolved = result.project.tracks[1].chain.eq.bands.find((band) => band.band.id === "lmf").gain;
  assert.equal(resolved.value, -4);
  assert.equal(resolved.mode, "manual");
  assert.ok(result.actions.some((entry) => entry.kind === "skipped" || entry.bandId !== "lmf"));

  const wet = source("track-b>return-room", "track-b", 3, bandIndex("mid"), 20, "wet", "return-room");
  const dry = source("track-a", "track-a", 9, bandIndex("mid"), 20);
  for (let c = 0; c < 20; c++) {
    put(dry, bandIndex("mid"), c, -20);
    put(wet, bandIndex("mid"), c, -18);
  }
  const [wetConflict] = detectMaskingConflicts(measurement([dry, wet]));
  const sender = trackFixture({ id: "track-b", sends: [{ to: "return-room", level: -6 }] });
  sender.channel.sends[0].mode = "manual";
  const wetProject = projectFixture({ tracks: [trackFixture({ id: "track-a" }), sender], returns: [returnFixture({ id: "return-room" })] });
  const wetResult = resolveMaskingConflicts(wetProject, [wetConflict]);
  assert.equal(wetResult.project.tracks[1].channel.sends[0].level, -6);
  assert.ok(wetResult.actions.some((entry) => entry.kind === "skipped" && entry.reason === "send is Manual"));
});

test("multiple competing tracks are resolved deterministically in priority order under a cumulative cut limit", () => {
  const tracks = [
    trackFixture({ id: "track-a" }),
    trackFixture({ id: "track-b" }),
    trackFixture({ id: "track-c" }),
  ];
  tracks[0].priority = 9;
  tracks[1].priority = 5;
  tracks[2].priority = 2;
  const project = projectFixture({ tracks });
  const cells = 20;
  const sources = tracks.map((track) => source(track.id, track.id, track.priority, bandIndex("mid"), cells));
  for (let c = 0; c < cells; c++) {
    put(sources[0], bandIndex("mid"), c, -20);
    put(sources[1], bandIndex("mid"), c, -16);
    put(sources[2], bandIndex("mid"), c, -14);
  }
  const conflicts = detectMaskingConflicts(measurement(sources, cells));
  const config = { ...DEFAULT_MASKING_RESOLUTION, cumulativeCutLimitDb: 4, maxCutPerConflictDb: 3 };
  const first = resolveMaskingConflicts(project, conflicts, config);
  const eqActions = first.actions.filter((entry) => entry.kind === "static-eq");
  assert.ok(eqActions.length >= 2);
  assert.equal(eqActions[0].trackId, "track-c");
  assert.ok(first.ledger.get("track-c").totalEqCutDb <= 4 + 1e-9);
  const second = resolveMaskingConflicts(first.project, conflicts, config, first.ledger);
  assert.ok(second.ledger.get("track-c").totalEqCutDb <= 4 + 1e-9);
  const reordered = resolveMaskingConflicts(project, [...conflicts].reverse(), config);
  assert.deepEqual(reordered.actions.map((entry) => [entry.kind, entry.trackId, entry.cutDb]), first.actions.map((entry) => [entry.kind, entry.trackId, entry.cutDb]));
});

// --- audio integration ---------------------------------------------------------

test("controlled persistent tones: static EQ reduces the lower-priority band and re-measurement avoids unnecessary compression", () => {
  const frames = RATE;
  const project = projectFixture({
    tracks: [
      trackFixture({ id: "track-a", priority: undefined }),
      trackFixture({ id: "track-b", priority: undefined }),
    ],
  });
  project.tracks[0].priority = 9;
  project.tracks[1].priority = 3;
  const inputs = audioOf({ "track-a": toneBlock(frames, 1000, 0.4), "track-b": toneBlock(frames, 1000, 0.45) }, frames);
  const result = resolveMaskingAudio(project, inputs, DEFAULT_MASKING_RESOLUTION, { sampleRate: RATE, maxFramesPerBlock: 4096 });
  assert.ok(result.conflicts.some((conflict) => conflict.persistence === "persistent"));
  assert.ok(result.actions.some((entry) => entry.kind === "static-eq"));
  assert.ok(!result.actions.some((entry) => entry.kind === "compressor"));
  const before = result.measurement.sources.find((entry) => entry.id === "track-b");
  const after = measureMaskingSources(result.project, inputs, { sampleRate: RATE, maskingDynamicBands: result.dynamicBands }).sources.find((entry) => entry.id === "track-b");
  const mid = bandIndex("mid");
  const beforeDb = before.bandDb[mid][5];
  const afterDb = after.bandDb[mid][5];
  assert.ok(afterDb < beforeDb - 1, `expected measurable EQ reduction, ${beforeDb} -> ${afterDb}`);
});

test("controlled intermittent tones: Dynamic EQ dips only while the protected key is present", () => {
  const frames = RATE * 2;
  const project = projectFixture({
    tracks: [trackFixture({ id: "track-a" }), trackFixture({ id: "track-b" })],
  });
  project.tracks[0].priority = 9;
  project.tracks[1].priority = 3;
  const key = burst(frames, 1000, 0.25, [[0.2, 0.4], [1.2, 1.4]]);
  const inputs = audioOf({ "track-a": key, "track-b": toneBlock(frames, 1000, 0.5) }, frames);
  const result = resolveMaskingAudio(project, inputs, DEFAULT_MASKING_RESOLUTION, { sampleRate: RATE, maxFramesPerBlock: 4096 });
  assert.ok(result.actions.some((entry) => entry.kind === "dynamic-eq"));
  const engine = new MixEngine(result.project, { sampleRate: RATE, maxFramesPerBlock: 4096, maskingDynamicBands: result.dynamicBands });
  const tap = tapBlock(4096);
  const master = tapBlock(4096);
  const inputsBlocks = new Map();
  let activeRms = 0;
  let idleRms = 0;
  let activeCount = 0;
  let idleCount = 0;
  for (let offset = 0; offset < frames; offset += 4096) {
    const count = Math.min(4096, frames - offset);
    for (const id of ["track-a", "track-b"]) {
      const full = inputs.get(id).channels;
      inputsBlocks.set(id, [full[0].subarray(offset, offset + count), full[1].subarray(offset, offset + count)]);
    }
    engine.process(inputsBlocks, master, count, { tracks: new Map([["track-b", tap]]) });
    const t = offset / RATE;
    const value = rms(tap[0], 0, count);
    if (t >= 0.25 && t < 0.35) {
      activeRms += value;
      activeCount++;
    } else if (t >= 0.7 && t < 0.8) {
      idleRms += value;
      idleCount++;
    }
  }
  assert.ok(activeCount > 0 && idleCount > 0);
  assert.ok(activeRms / activeCount < (idleRms / idleCount) * 0.8, "Dynamic EQ did not dip during the external key");
});

test("wet delay tail participates in masking and a persistent wet/dry conflict reduces the Auto send", () => {
  const frames = RATE * 2;
  const project = projectFixture({
    tracks: [
      trackFixture({ id: "track-a" }),
      trackFixture({ id: "track-b", sends: [{ to: "return-delay", level: -3 }] }),
    ],
    returns: [returnFixture({ id: "return-delay", effect: "delay", time: 250, second: 50 })],
  });
  project.tracks[0].priority = 9;
  project.tracks[1].priority = 3;
  const inputs = audioOf({
    "track-a": toneBlock(frames, 1000, 0.35),
    "track-b": burst(frames, 1000, 0.5, [[0, 0.5]]),
  }, frames);
  const measured = measureMaskingSources(project, inputs, { sampleRate: RATE, maxFramesPerBlock: 4096 });
  const wet = measured.sources.find((entry) => entry.id === "track-b>return-delay");
  assert.ok(wet);
  const mid = bandIndex("mid");
  assert.ok(wet.bandDb[mid][10] > -60, "delay tail was not measured after the dry source stopped");
  const result = resolveMaskingAudio(project, inputs, DEFAULT_MASKING_RESOLUTION, { sampleRate: RATE, maxFramesPerBlock: 4096 });
  assert.ok(result.conflicts.some((conflict) => conflict.yieldingSource.kind === "wet"));
  assert.ok(result.actions.some((entry) => entry.kind === "send" && entry.trackId === "track-b"));
  assert.ok(result.project.tracks[1].channel.sends[0].level < -3);
  assert.equal(result.project.tracks[1].channel.sends[0].mode, "auto");
});

test("wet reverb tail is measured after the dry source stops and send reduction lowers the Return output", () => {
  const frames = RATE * 2;
  const project = projectFixture({
    tracks: [
      trackFixture({ id: "track-a" }),
      trackFixture({ id: "track-b", sends: [{ to: "return-verb", level: 0 }] }),
    ],
    returns: [returnFixture({ id: "return-verb", effect: "reverb", time: 1.5, second: 0 })],
  });
  project.tracks[0].priority = 9;
  project.tracks[1].priority = 3;
  const inputs = audioOf({
    "track-a": toneBlock(frames, 1000, 0.2),
    "track-b": burst(frames, 1000, 0.8, [[0, 0.4]]),
  }, frames);
  const measured = measureMaskingSources(project, inputs, { sampleRate: RATE, maxFramesPerBlock: 4096 });
  const wet = measured.sources.find((entry) => entry.id === "track-b>return-verb");
  assert.ok(wet);
  assert.ok(wet.bandDb[bandIndex("mid")][10] > -70, "reverb tail was not measured after the dry source stopped");
  const result = resolveMaskingAudio(project, inputs, DEFAULT_MASKING_RESOLUTION, { sampleRate: RATE, maxFramesPerBlock: 4096 });
  const sendAction = result.actions.find((entry) => entry.kind === "send" && entry.trackId === "track-b");
  assert.ok(sendAction);
  assert.ok(result.project.tracks[1].channel.sends[0].level < 0);

  function returnTailRms(proj) {
    const engine = new MixEngine(proj, { sampleRate: RATE, maxFramesPerBlock: 4096, maskingDynamicBands: result.dynamicBands });
    const master = tapBlock(4096);
    const retTap = tapBlock(4096);
    const blocks = new Map();
    let sum = 0;
    let count = 0;
    const total = frames + RATE;
    for (let offset = 0; offset < total; offset += 4096) {
      const blockFrames = Math.min(4096, total - offset);
      for (const id of ["track-a", "track-b"]) {
        const full = inputs.get(id).channels;
        if (offset >= frames) blocks.set(id, [new Float32Array(blockFrames), new Float32Array(blockFrames)]);
        else {
          const n = Math.min(blockFrames, frames - offset);
          const left = new Float32Array(blockFrames);
          const right = new Float32Array(blockFrames);
          left.set(full[0].subarray(offset, offset + n));
          right.set(full[1].subarray(offset, offset + n));
          blocks.set(id, [left, right]);
        }
      }
      engine.process(blocks, master, blockFrames, { returns: new Map([["return-verb", retTap]]) });
      if (offset >= frames) {
        sum += rms(retTap[0], 0, blockFrames);
        count++;
      }
    }
    return sum / Math.max(1, count);
  }
  const before = returnTailRms(project);
  const after = returnTailRms(result.project);
  assert.ok(after < before * 0.95, `send reduction did not lower the wet tail: ${before} -> ${after}`);
});

test("invalid or unavailable sidechain sources preserve Task 7.2 validation and fallback", () => {
  const project = projectFixture({
    tracks: [trackFixture({ id: "track-a" }), trackFixture({ id: "track-b" })],
    sidechains: [{ source: "track-missing", destination: "track-b", processor: "dynamic-eq" }],
  });
  const verdict = validateSidechains(project);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.problems[0].reason, "unknown-source");
  const [conflict] = conflictFixture("intermittent");
  const result = resolveMaskingConflicts(project, [conflict]);
  assert.equal(result.sidechainVerdict.ok, false);
  assert.equal(result.sidechainVerdict.problems[0].reason, "unknown-source");
  assert.ok(!result.sidechainVerdict.plan.has("track-b"));

  const muted = projectFixture({ tracks: [trackFixture({ id: "track-a", mute: true }), trackFixture({ id: "track-b" })] });
  muted.tracks[0].priority = 9;
  muted.tracks[1].priority = 3;
  const frames = RATE;
  const inputs = audioOf({ "track-a": toneBlock(frames, 1000, 0.5), "track-b": toneBlock(frames, 1000, 0.3) }, frames);
  const measured = measureMaskingSources(muted, inputs, { sampleRate: RATE });
  assert.ok(!measured.sources.some((entry) => entry.id === "track-a" && entry.bandDb[bandIndex("mid")][5] > -60));
});

test("compression escalation happens only when meaningful conflict remains after EQ", () => {
  const frames = RATE;
  const project = projectFixture({
    tracks: [
      trackFixture({ id: "track-a" }),
      trackFixture({ id: "track-b", compBypassed: false, threshold: -10, ratio: 1.5 }),
    ],
  });
  project.tracks[0].priority = 9;
  project.tracks[1].priority = 3;
  const inputs = audioOf({ "track-a": toneBlock(frames, 1000, 0.2), "track-b": toneBlock(frames, 1000, 0.8) }, frames);
  const config = { ...DEFAULT_MASKING_RESOLUTION, maxCutPerConflictDb: 1, cumulativeCutLimitDb: 1, escalationThresholdDb: 0.5 };
  const result = resolveMaskingAudio(project, inputs, config, { sampleRate: RATE, maxFramesPerBlock: 4096 });
  assert.ok(result.actions.some((entry) => entry.kind === "static-eq"));
  assert.ok(result.postEqConflicts.length > 0);
  assert.ok(result.actions.some((entry) => entry.kind === "compressor"));
  assert.ok(result.project.sidechains.some((edge) => edge.processor === "compressor" && edge.source === "track-a" && edge.destination === "track-b"));
});

// --- focused verification: Dynamic EQ depth ownership ---------------------------

test("focused: a configured dynamicDepthDb is preserved and caps the masking dip", () => {
  const frames = RATE * 2;
  const project = projectFixture({
    tracks: [trackFixture({ id: "track-a" }), trackFixture({ id: "track-b", dynamic: { lmf: 1 } })],
  });
  project.tracks[0].priority = 9;
  project.tracks[1].priority = 3;
  const key = burst(frames, 1000, 0.25, [[0.2, 0.4], [1.2, 1.4]]);
  const inputs = audioOf({ "track-a": key, "track-b": toneBlock(frames, 1000, 0.5) }, frames);
  const result = resolveMaskingAudio(project, inputs, DEFAULT_MASKING_RESOLUTION, { sampleRate: RATE, maxFramesPerBlock: 4096 });

  const action = result.actions.find((entry) => entry.kind === "dynamic-eq" && entry.trackId === "track-b");
  assert.ok(action, "expected a Dynamic EQ action on the yielding track");
  assert.equal(action.bandId, "lmf");
  // The requested cut is larger than the configured depth; the action must report
  // the depth that can actually be applied, not the unachievable request.
  assert.equal(action.cutDb, 1);
  assert.match(action.reason, /configured 1\.00 dB depth/);

  const band = result.project.tracks[1].chain.eq.bands.find((entry) => entry.band.id === "lmf");
  assert.equal(band.dynamicDepthDb, 1, "configured depth must not be overwritten");
  assert.equal(band.gain.value, 0, "intermittent path must not add a static gain cut");
  assert.ok(!result.dynamicBands.get("track-b")?.some((entry) => entry.bandId === "lmf"), "no masking overlay on a configured band");
  assert.ok(result.project.sidechains.some((edge) => edge.source === "track-a" && edge.destination === "track-b" && edge.processor === "dynamic-eq"));
  assert.equal(result.ledger.get("track-b").eqBands.get("lmf"), 1);

  // Objective audio check: the keyed dip is ~1 dB, not the ~3 dB request.
  const engine = new MixEngine(result.project, { sampleRate: RATE, maxFramesPerBlock: 4096, maskingDynamicBands: result.dynamicBands });
  const tap = tapBlock(4096);
  const master = tapBlock(4096);
  const blocks = new Map();
  let active = 0;
  let idle = 0;
  let activeN = 0;
  let idleN = 0;
  for (let offset = 0; offset < frames; offset += 4096) {
    const count = Math.min(4096, frames - offset);
    for (const id of ["track-a", "track-b"]) {
      const full = inputs.get(id).channels;
      blocks.set(id, [full[0].subarray(offset, offset + count), full[1].subarray(offset, offset + count)]);
    }
    engine.process(blocks, master, count, { tracks: new Map([["track-b", tap]]) });
    const t = offset / RATE;
    const value = rms(tap[0], 0, count);
    if (t >= 0.25 && t < 0.35) { active += value; activeN++; }
    else if (t >= 0.7 && t < 0.8) { idle += value; idleN++; }
  }
  assert.ok(activeN > 0 && idleN > 0);
  const dipDb = 20 * Math.log10((active / activeN) / (idle / idleN));
  assert.ok(dipDb > -1.4 && dipDb < -0.6, `expected ~1 dB configured dip, measured ${dipDb.toFixed(3)} dB`);
  // With the compressor bypassed there is no escalation path, so the conflict remains.
  assert.ok(result.finalConflicts.some((entry) => entry.yieldingSource.trackId === "track-b"));
});

test("focused: a persistent conflict on a configured dynamic band still uses static EQ without changing the depth", () => {
  const project = projectFixture({
    tracks: [trackFixture({ id: "track-a" }), trackFixture({ id: "track-b", dynamic: { lmf: 2 } })],
  });
  const [conflict] = conflictFixture("persistent");
  const result = resolveMaskingConflicts(project, [conflict]);
  const action = result.actions.find((entry) => entry.kind === "static-eq" && entry.trackId === "track-b");
  assert.ok(action);
  assert.equal(action.bandId, "lmf");
  const band = result.project.tracks[1].chain.eq.bands.find((entry) => entry.band.id === "lmf");
  assert.equal(band.dynamicDepthDb, 2, "configured depth preserved");
  assert.ok(band.gain.value < -2, "persistent path adds an independent static cut");
  assert.ok(!result.dynamicBands.get("track-b")?.some((entry) => entry.bandId === "lmf"));
});

// --- focused verification: wet-source attribution / Return linearity -------------

test("focused: isolated per-send ReturnChain output sums to the combined Return output (reverb + delay)", () => {
  const cases = [
    { effect: "reverb", character: "room", time: 0.4, second: 20 },
    { effect: "reverb", character: "hall", time: 0.5, second: 35 },
    { effect: "reverb", character: "plate", time: 0.3, second: 10 },
    { effect: "delay", character: "digital", time: 120, second: 65 },
  ];
  for (const config of cases) {
    const frames = Math.floor(RATE * 0.6);
    const ret = returnFixture({ id: "return-r", effect: config.effect, character: config.character, time: config.time, second: config.second, tone: 3, level: -3 });
    const project = projectFixture({
      tracks: [
        trackFixture({ id: "track-a", sends: [{ to: "return-r", level: -4 }] }),
        trackFixture({ id: "track-b", sends: [{ to: "return-r", level: -8 }] }),
      ],
      returns: [ret],
    });
    const inputs = audioOf({
      "track-a": burst(frames, 700, 0.5, [[0, 0.25]]),
      "track-b": burst(frames, 1100, 0.4, [[0.15, 0.45]]),
    }, frames);
    const engine = new MixEngine(project, { sampleRate: RATE, maxFramesPerBlock: 4096 });
    const isolated = project.tracks.map(() => new ReturnChain(ret, { channels: 2, sampleRate: RATE }));
    const total = frames + Math.ceil(engine.tailSeconds * RATE);
    const master = tapBlock(4096);
    const retTap = tapBlock(4096);
    const trackTaps = new Map(project.tracks.map((track) => [track.id, tapBlock(4096)]));
    const blocks = new Map();
    const scratch = [new Float32Array(4096), new Float32Array(4096)];
    let maxAbs = 0;
    let tailMax = 0;
    let errSq = 0;
    let combSq = 0;
    for (let offset = 0; offset < total; offset += 4096) {
      const count = Math.min(4096, total - offset);
      for (const track of project.tracks) {
        const input = inputs.get(track.id);
        const left = new Float32Array(count);
        const right = new Float32Array(count);
        if (input && offset < input.frames) {
          const take = Math.min(count, input.frames - offset);
          left.set(input.channels[0].subarray(offset, offset + take));
          right.set(input.channels[1].subarray(offset, offset + take));
        }
        blocks.set(track.id, [left, right]);
      }
      engine.process(blocks, master, count, { tracks: trackTaps, returns: new Map([["return-r", retTap]]) });
      const sum = [new Float64Array(count), new Float64Array(count)];
      project.tracks.forEach((track, index) => {
        const tap = trackTaps.get(track.id);
        const gain = 10 ** (track.channel.sends[0].level / 20);
        for (let c = 0; c < 2; c++) for (let i = 0; i < count; i++) scratch[c][i] = tap[c][i] * gain;
        isolated[index].process(scratch, count);
        for (let c = 0; c < 2; c++) for (let i = 0; i < count; i++) sum[c][i] += scratch[c][i];
      });
      for (let c = 0; c < 2; c++) {
        for (let i = 0; i < count; i++) {
          const err = Math.abs(sum[c][i] - retTap[c][i]);
          if (err > maxAbs) maxAbs = err;
          if (offset >= frames && err > tailMax) tailMax = err;
          errSq += err * err;
          combSq += retTap[c][i] * retTap[c][i];
        }
      }
    }
    assert.ok(combSq > 0, `${config.effect}/${config.character}: combined Return was silent`);
    const relRms = Math.sqrt(errSq / combSq);
    const label = `${config.effect}/${config.character}`;
    assert.ok(maxAbs < 1e-6, `${label}: max sample error ${maxAbs}`);
    assert.ok(tailMax < 1e-6, `${label}: tail sample error ${tailMax}`);
    assert.ok(relRms < 1e-6, `${label}: relative RMS error ${relRms}`);
    assert.ok(20 * Math.log10(relRms) < -120, `${label}: error not below -120 dBFS-relative`);
  }
});
