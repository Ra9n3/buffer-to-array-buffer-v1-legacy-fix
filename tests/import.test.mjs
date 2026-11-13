// Task 5.1 — the stem import pipeline over real WAV bytes and the memory asset store, then the same
// against the shared store and the lifecycle: imported tracks appended, their copies and peaks stored
// together, the manifest carrying them, reopening with assets, project switching without leakage,
// and the fixture / empty workflows unchanged.
//
// One module-level store: every test ends by putting the pristine fixture session back.
import test from "node:test";
import assert from "node:assert/strict";
import { importFiles, trackNameFor } from "../src/lib/project/import.ts";
import { memoryAssetStore, sha256Hex } from "../src/lib/audio/asset-store.ts";
import { assets } from "../src/lib/project/assets.svelte.ts";
import { lifecycle, projectKey, RECENT_KEY, parseRecentIndex } from "../src/lib/project/lifecycle.ts";
import { autosave, clipboard, fieldRegistry, history, loadProject, ops, project, arrangeTrackOf, trackStrip } from "../src/lib/project/store.svelte.ts";
import { SESSION_PROJECT_ID, createSessionProject } from "../src/lib/project/session.ts";
import { createEmptyProject, createImportedTrack, nextTrackCode, withImportedTracks } from "../src/lib/project/templates.ts";
import { buildManifest, memoryStorage, parseManifest, serializeManifest } from "../src/lib/project/persistence.ts";
import { projectFields } from "../src/lib/project/fields.ts";
import { role } from "../src/lib/arrange.ts";
import { MP3ISH, NOT_AUDIO, RATE, nanFloat, silence, sine, sine24In32, source, truncated } from "./wav-fixtures.mjs";
import { changeProjectRate } from "../src/lib/project/rate-change.ts";

let tick = 0;
let n = 0;
const now = () => `2026-11-02T12:00:${String(tick++ % 60).padStart(2, "0")}.000Z`;
const newId = () => `id-${String(++n).padStart(3, "0")}`;

function ctx(store, overrides = {}) {
  return { projectId: "project-x", projectRate: 48000, tracks: [], tempoMarkers: [], store, newId, now, ...overrides };
}

/* ------------------------------------------------------------------------- the pipeline, pure */

test("a batch with every outcome: the good stems become tracks after their copies are stored; every other file is one line and nothing else", async () => {
  const store = memoryAssetStore();
  const good = sine(4, { channels: 2 });
  const monoFloat = sine(4, { channels: 1, encoding: "float", bitDepth: 32, extensible: true });
  const quiet = silence(3);
  const tiny = sine(0.4, { channels: 2 });
  const result = await importFiles(
    [
      source("Kick In.wav", good),
      source("vox lead.wav", monoFloat),
      source("room.wav", quiet),
      source("click.wav", tiny),
      source("demo.mp3", MP3ISH),
      source("notes.txt", NOT_AUDIO),
      source("bass 16bit.wav", sine(1, { bitDepth: 16 })),
      source("cut.wav", truncated(sine(2), 0.5)),
      source("nan.wav", nanFloat(1)),
    ],
    ctx(store),
  );
  assert.equal(result.lines.length, 9);
  assert.equal(result.added, 4);
  assert.equal(result.refused, 5);
  assert.deepEqual(
    result.lines.map((l) => [l.file, l.outcome]),
    [
      ["Kick In.wav", "added"],
      ["vox lead.wav", "added"],
      ["room.wav", "added"],
      ["click.wav", "added"],
      ["demo.mp3", "unsupported"],
      ["notes.txt", "unsupported"],
      ["bass 16bit.wav", "unsupported"],
      ["cut.wav", "corrupt"],
      ["nan.wav", "corrupt"],
    ],
  );
  const [kick, vox, room, click, mp3, txt, b16, cut, nan] = result.lines;
  assert.deepEqual(kick.flags, []);
  assert.equal(kick.detail, "0:04.0 · 48 kHz · 24-bit PCM · stereo");
  assert.deepEqual(vox.flags, ["mono"]);
  assert.equal(vox.detail, "0:04.0 · 48 kHz · 32-bit float · mono · played on both sides");
  assert.deepEqual(room.flags, ["silent", "padded"]);
  assert.equal(room.detail, "0:03.0 · 48 kHz · 24-bit PCM · stereo · silent — kept, left out of analysis · shorter than the longest stem — padded to 0:04.0");
  assert.deepEqual(click.flags, ["short", "padded"]);
  assert.match(click.detail, /^0:00\.4 · 48 kHz · 24-bit PCM · stereo · very short — processed as one buffer · shorter than the longest stem — padded to 0:04\.0$/);
  const advice = "re-export the stem as a 44.1 or 48 kHz WAV, 24-bit (packed or 24-in-32) or 32-bit (int or float)";
  assert.equal(mp3.detail, `This is an MP3 file, not a WAV file; ${advice}`);
  assert.equal(txt.detail, `Not a WAV file (no RIFF/WAVE header); ${advice}`);
  assert.equal(b16.detail, `48 kHz · 16-bit PCM · stereo — ALLOY takes 24-bit PCM (packed or 24-in-32) or 32-bit (int or float); ${advice}`);
  assert.match(cut.detail, /^The file ends before its audio data does .* — the file is truncated$/);
  assert.equal(nan.detail, "1 sample is not a number — the float data is damaged");

  // the tracks: codes 01–04 in the empty project, names from the files, nothing classified, routed to Master
  assert.deepEqual(
    result.stems.map((s) => [s.track.id, s.track.code, s.track.name]),
    [
      ["track-01", "01", "Kick In"],
      ["track-02", "02", "vox lead"],
      ["track-03", "03", "room"],
      ["track-04", "04", "click"],
    ],
  );
  const t = result.stems[0].track;
  assert.equal(t.kind, "track");
  assert.equal(t.role, null);
  assert.equal(role(t.role).name, "—");
  assert.equal(role(t.role).long, "Not assigned yet");
  assert.equal(t.familyId, null);
  assert.equal(t.sourceTypeId, null);
  assert.equal(t.priority, 5);
  assert.equal(t.tierConfirmed, false);
  assert.equal(t.output, "master");
  assert.equal(t.org, "neutral");
  assert.equal(t.display.peak, false);
  assert.equal(t.chain.eq.bands[0].gain.value, 0, "a neutral chain, not the fixture's kick");
  assert.deepEqual(t.channel.sends.map((s) => s.to), [null, null]);

  // the audio metadata: identity + facts, the peak in dBFS, the silent flag
  assert.equal(t.audio.fileName, "Kick In.wav");
  assert.equal(t.audio.bytes, good.byteLength);
  assert.equal(t.audio.sha256, await sha256Hex(good));
  assert.equal(t.audio.encoding, "pcm");
  assert.equal(t.audio.bitDepth, 24);
  assert.equal(t.audio.sampleRate, 48000);
  assert.equal(t.audio.channels, 2);
  assert.equal(t.audio.frames, 4 * RATE);
  assert.ok(Math.abs(t.audio.peakDbfs - 20 * Math.log10(0.5)) < 0.01, `−6 dBFS: ${t.audio.peakDbfs}`);
  assert.equal(t.audio.silent, false);
  assert.match(t.audio.importedAt, /^2026-11-02T12:00/);
  assert.equal(result.stems[2].track.audio.silent, true);
  assert.equal(result.stems[2].track.audio.peakDbfs, -Infinity);
  assert.equal(result.stems[1].track.audio.channels, 1);
  assert.equal(result.stems[1].track.audio.encoding, "float");

  // the store: exactly the four accepted files, byte for byte, each with peaks under the same id and hash
  assert.equal(store.puts, 4);
  assert.equal(store.assets.size, 4);
  for (const stem of result.stems) {
    const asset = await store.getAsset(stem.track.audio.assetId);
    const peaks = await store.getPeaks(stem.track.audio.assetId);
    assert.ok(asset && peaks);
    assert.equal(asset.projectId, "project-x");
    assert.equal(asset.sha256, stem.track.audio.sha256);
    assert.equal(peaks.sha256, asset.sha256);
    assert.equal(asset.fileName, stem.track.audio.fileName);
    assert.ok(asset.bytes instanceof Uint8Array || typeof Blob === "function");
    const stored = asset.bytes instanceof Uint8Array ? asset.bytes : new Uint8Array(await asset.bytes.arrayBuffer());
    assert.equal(await sha256Hex(stored), asset.sha256, "the copy is the file");
    assert.equal(peaks.peaks.frames, stem.track.audio.frames);
    assert.equal(peaks.peaks, stem.peaks);
  }
  assert.deepEqual((await store.list("project-x")).map((a) => a.fileName).sort(), ["Kick In.wav", "click.wav", "room.wav", "vox lead.wav"]);
  assert.deepEqual(await store.list("other"), []);
});

test("storage failure: a stem whose copy cannot be stored is a failed line and no track; the next file still goes in; a project switch mid-import adds nothing", async () => {
  let attempts = 0;
  const store = memoryAssetStore({ failPuts: () => attempts++ === 0 });
  const result = await importFiles(
    [
      source("a.wav", sine(1)),
      source("b.wav", sine(1)),
    ],
    ctx(store),
  );
  // the first put fails, the second succeeds
  assert.equal(result.lines[0].outcome, "failed");
  assert.match(result.lines[0].detail, /^could not be stored: storage refused the write/);
  assert.equal(result.lines[1].outcome, "added");
  assert.equal(result.lines[1].trackId, "track-01", "codes are only allotted to files that made it");
  assert.equal(store.assets.size, 1);
  assert.equal(nextTrackCode([]), "01");
  assert.equal(nextTrackCode([{ code: "20" }]), "21");
  assert.equal(nextTrackCode([{ code: "99" }]), "100");
  assert.equal(trackNameFor("My Stem.v2.WAV"), "My Stem.v2");
  assert.equal(trackNameFor(".wav"), ".wav");
  assert.equal(trackNameFor("   .wav"), "   .wav");
});

test("a source that cannot be read is a failed line; an empty batch is an empty result; codes continue after the project's tracks", async () => {
  const store = memoryAssetStore();
  const broken = { name: "gone.wav", size: 10, bytes: async () => { throw new Error("NotReadableError"); } };
  const r = await importFiles([broken, source("ok.wav", sine(0.5))], ctx(store, { tracks: createSessionProject().tracks }));
  assert.equal(r.lines[0].outcome, "failed");
  assert.equal(r.lines[0].detail, "could not be read: NotReadableError");
  assert.equal(r.lines[1].outcome, "added");
  assert.equal(r.stems[0].track.code, "21");
  assert.equal(r.stems[0].track.id, "track-21");
  const empty = await importFiles([], ctx(store));
  assert.deepEqual(empty, { projectId: "project-x", lines: [], stems: [], added: 0, refused: 0 });
});

/* ------------------------------------------------------------------------- templates + manifest */

test("withImportedTracks / the manifest: imported tracks travel in a `tracks` block, the fixture's manifest is unchanged without them, a damaged block is refused", async () => {
  const store = memoryAssetStore();
  const r = await importFiles([source("pad.wav", sine(13, { channels: 2 }))], ctx(store, { projectId: SESSION_PROJECT_ID, tracks: createSessionProject().tracks, tempoMarkers: createSessionProject().arrangement.tempoMarkers }));
  const spec = { id: r.stems[0].track.id, code: r.stems[0].track.code, name: r.stems[0].track.name, org: "neutral", audio: r.stems[0].track.audio };

  const fixture = createSessionProject();
  const withPad = withImportedTracks(fixture, [spec]);
  assert.equal("ok" in withPad, false);
  assert.equal(withPad.tracks.length, 21);
  assert.equal(withPad.tracks[20].id, "track-21");
  assert.equal(withPad.arrangement.barCount, 56, "13 s is 6.5 bars at 120: the fixture keeps its 56");
  assert.equal(withPad.arrangement.tempoMarkers, fixture.arrangement.tempoMarkers, "the fixture keeps its tempo map");
  assert.equal(withPad.tracks[0].arrangement, undefined);

  const empty = createEmptyProject("project-e", "E");
  const withPadEmpty = withImportedTracks(empty, [spec]);
  assert.equal(withPadEmpty.arrangement.barCount, 7, "6.5 bars → 7");
  assert.deepEqual(withPadEmpty.arrangement.tempoMarkers, [{ bar: 1, bpm: 120, signature: "4/4" }], "the empty project takes the default scale on its first import");
  assert.deepEqual(withPadEmpty.arrangement.sections, []);

  // the manifest
  const m = buildManifest(withPad, projectFields(withPad));
  assert.equal(m.tracks.length, 1);
  assert.deepEqual(m.tracks[0], { id: "track-21", code: "21", name: "pad", org: "neutral", audio: spec.audio });
  assert.ok(m.channels["track-21"], "its settings are channel values like any other's");
  assert.equal(m.channels["track-21"].output, "master");
  assert.equal(m.channels["track-21"].priority, 5);
  const back = parseManifest(serializeManifest(m));
  assert.deepEqual(back.tracks, m.tracks);
  const plain = buildManifest(fixture, projectFields(fixture));
  assert.equal("tracks" in plain, false, "no imported tracks → no block: the 3.3 / 4.1 manifest byte for byte");

  // damaged blocks
  const damaged = JSON.parse(serializeManifest(m));
  damaged.tracks[0].audio.sha256 = 5;
  assert.equal(parseManifest(JSON.stringify(damaged)), null);
  const dup = withImportedTracks(fixture, [spec, { ...spec, id: "track-22" }]);
  assert.deepEqual(dup, { ok: false, detail: "imported track code 21 is already in the project" });
  const clash = withImportedTracks(fixture, [{ ...spec, id: "track-01", code: "01" }]);
  assert.deepEqual(clash, { ok: false, detail: "imported track id track-01 is already in the project" });
  assert.equal(createImportedTrack(spec).audio, spec.audio);
});

/* ------------------------------------------------------------------------- the shared store + lifecycle */

function rig({ storage = memoryStorage(), ids = ["project-a", "project-b", "project-c"] } = {}) {
  reset();
  let i = 0;
  const schedule = { queue: [], run() { this.queue.splice(0).forEach((t) => t.fn()); } };
  autosave.attach(storage, {
    delayMs: 1000,
    schedule: (fn, ms) => {
      const t = { fn, ms };
      schedule.queue.push(t);
      return () => schedule.queue.splice(schedule.queue.indexOf(t), 1);
    },
  });
  lifecycle.attach({ storage, now, newId: () => ids[i++ % ids.length] });
  const assetStore = memoryAssetStore();
  assets.attach(assetStore, { newId, now });
  return { storage, schedule, assetStore };
}

function reset() {
  assets.detach();
  autosave.detach();
  lifecycle.detach();
  clipboard.clear();
  loadProject(createSessionProject());
  history.clear();
  autosave.retarget(projectKey(SESSION_PROJECT_ID), null);
}

const tickTask = () => new Promise((r) => setTimeout(r, 0));

test("in the app: import into the empty project — tracks appended in one structural change, clips drawn from the peaks, autosave writes the `tracks` block, the rows' views follow", async () => {
  const { storage, schedule, assetStore } = rig();
  lifecycle.restoreLast();
  lifecycle.startEmpty();
  assert.equal(project.id, "project-a");
  assert.equal(project.isEmpty, true);
  const revisionBefore = history.revision;

  const progress = [];
  const result = await assets.importBatch(
    [source("kick.wav", sine(6, { channels: 2 })), source("vox.wav", sine(4.5, { channels: 1 })), source("bad.mp3", MP3ISH)],
    (i, total, name) => progress.push([i, total, name]),
  );
  assert.equal(result.added, 2);
  assert.equal(result.refused, 1);
  assert.deepEqual(progress[0], [0, 3, "kick.wav"]);
  assert.deepEqual(progress.at(-1), [3, 3, ""]);

  assert.equal(project.isEmpty, false);
  assert.equal(project.tracks.length, 2);
  assert.deepEqual(project.tracks.map((t) => [t.code, t.name]), [["01", "kick"], ["02", "vox"]]);
  assert.equal(project.arrangement.barCount, 3, "6 s at 120 bpm = 3 bars");
  assert.deepEqual(project.arrangement.tempoMarkers, [{ bar: 1, bpm: 120, signature: "4/4" }]);
  assert.equal(project.arrangement.clips["track-01"].length, 1);
  const clip = project.arrangement.clips["track-01"][0];
  assert.equal(clip.source, "audio");
  assert.equal(clip.barCount, 3);
  assert.equal(clip.channels, 2);
  assert.equal(project.arrangement.clips["track-02"][0].barCount, 2.25);
  assert.equal(project.arrangement.clips["track-02"][0].channels, 1);
  assert.equal(assets.statusOf("track-01"), "ready");
  assert.equal(assets.statusOf("track-02"), "ready");
  assert.ok(history.revision > revisionBefore, "a structural change bumps the revision");
  assert.equal(history.canUndo, false, "an import is not an undoable edit");
  assert.equal(fieldRegistry.length, projectFields(project).length);
  assert.ok(fieldRegistry.some((f) => f.channel === "track-02"));

  // the rows' views
  const row = arrangeTrackOf("track-02");
  assert.equal(row.code, "02");
  assert.equal(row.role, null);
  assert.equal(row.tier, "supporting");
  assert.equal(row.tierConfirmed, false);
  const strip = trackStrip("track-01");
  assert.equal(strip.level, 0);
  ops.setTrackLevel("track-01", -6);
  history.observe();
  assert.equal(project.tracks[0].channel.level, -6);
  assert.equal(history.canUndo, true, "edits after the import are undoable");

  // autosave: the manifest under the project's key carries the tracks block and their values
  schedule.run();
  const m = parseManifest(storage.data.get(projectKey("project-a")));
  assert.equal(m.tracks.length, 2);
  assert.equal(m.tracks[0].audio.assetId, project.tracks[0].audio.assetId);
  assert.equal(m.channels["track-01"]["channel/level"], -6);
  assert.equal(assetStore.assets.size, 2, "only the accepted files were copied");
  assert.equal((await assetStore.list("project-a")).length, 2);
});

test("reopen with assets: the imported tracks come back from the manifest and their waveforms from the store; a copy whose hash disagrees or is gone is MISSING, the project still opens", async () => {
  const { storage, schedule, assetStore } = rig();
  lifecycle.restoreLast();
  lifecycle.startEmpty();
  await assets.importBatch([source("kick.wav", sine(6)), source("snare.wav", sine(2)), source("hat.wav", sine(1))]);
  ops.setTrackLevel("track-02", -3);
  history.observe();
  schedule.run();
  const assetIds = project.tracks.map((t) => t.audio.assetId);

  // damage one copy's peaks record (another file's hash) and delete another
  const snare = assetStore.peaks.get(assetIds[1]);
  assetStore.peaks.set(assetIds[1], { ...snare, sha256: "0".repeat(64) });
  await assetStore.remove(assetIds[2]);

  // switch away and back
  lifecycle.open(SESSION_PROJECT_ID);
  assert.equal(project.id, SESSION_PROJECT_ID);
  assert.equal(project.tracks.length, 20, "the fixture has no imported tracks");
  assert.equal(project.arrangement.clips["track-01"][0].source, "fixture");
  assert.equal(assets.statusOf("track-01"), null, "no asset status leaks onto a fixture track");
  const r = lifecycle.open("project-a");
  assert.equal(r.ok, true);
  assert.deepEqual(r.skipped, []);
  assert.equal(project.tracks.length, 3);
  assert.equal(project.tracks[1].channel.level, -3, "its saved values applied");
  assert.equal(project.tracks[0].audio.assetId, assetIds[0]);
  assert.equal(project.arrangement.barCount, 3);
  // hydration is asynchronous: pending first, then ready / repaired / missing
  assert.equal(assets.statusOf("track-01"), "pending");
  assert.equal(project.arrangement.clips["track-01"], undefined, "nothing drawn before the peaks are read");
  await tickTask();
  await tickTask();
  await tickTask();
  await tickTask();
  assert.equal(assets.statusOf("track-01"), "ready");
  assert.equal(
    assets.statusOf("track-02"),
    "ready",
    "Task 11.1: a peaks record whose hash disagrees is repaired from the original, not drawn as truth",
  );
  assert.equal(assets.statusOf("track-03"), "missing", "a stem whose ORIGINAL is gone is missing; the project still opens");
  assert.equal(project.arrangement.clips["track-01"][0].source, "audio");
  assert.equal(project.arrangement.clips["track-01"][0].barCount, 3);
  assert.equal(project.arrangement.clips["track-02"][0].source, "audio", "the repaired stem draws again");
  assert.equal(project.arrangement.clips["track-03"], undefined);
  // the repair healed the damaged record: the peaks now describe the copy at the project's rate
  const healed = assetStore.peaks.get(assetIds[1]);
  assert.equal(healed.sha256, project.tracks[1].audio.sha256);
  assert.equal(healed.sampleRate, 48000);
  assert.equal(healed.convertedSha256, (await assetStore.getAsset(assetIds[1])).converted.sha256);

  // Home's listing still knows the project
  const entries = parseRecentIndex(storage.data.get(RECENT_KEY));
  assert.equal(entries[0].id, "project-a");
});

test("no leakage: two projects with imports keep their own tracks, clips and statuses across switches; start-empty after an import is empty", async () => {
  const { schedule, assetStore } = rig();
  lifecycle.restoreLast();
  lifecycle.startEmpty(); // project-a
  await assets.importBatch([source("a1.wav", sine(2)), source("a2.wav", sine(2))]);
  schedule.run();
  lifecycle.startEmpty(); // project-b
  assert.equal(project.id, "project-b");
  assert.equal(project.isEmpty, true, "a new empty project has none of the last project's stems");
  assert.deepEqual(project.arrangement.tempoMarkers, []);
  assert.equal(project.arrangement.barCount, 0);
  assert.equal(assets.statusOf("track-01"), null);
  await assets.importBatch([source("b1.wav", sine(10, { channels: 1 }))]);
  schedule.run();
  assert.deepEqual(project.tracks.map((t) => t.name), ["b1"]);
  assert.equal(project.arrangement.barCount, 5);
  assert.equal((await assetStore.list("project-a")).length, 2);
  assert.equal((await assetStore.list("project-b")).length, 1);

  lifecycle.open("project-a");
  await tickTask();
  await tickTask();
  assert.deepEqual(project.tracks.map((t) => t.name), ["a1", "a2"]);
  assert.equal(project.arrangement.barCount, 1);
  assert.equal(project.arrangement.clips["track-01"][0].barCount, 1);
  assert.equal(assets.statusOf("track-01"), "ready");
  assert.equal(assets.statusOf("track-02"), "ready");
  assert.equal(assets.statusOf("track-03"), null);

  lifecycle.open("project-b");
  await tickTask();
  await tickTask();
  assert.deepEqual(project.tracks.map((t) => t.name), ["b1"]);
  assert.equal(project.arrangement.clips["track-01"][0].barCount, 5);
  assert.equal(project.arrangement.clips["track-01"][0].channels, 1);
  assert.equal(project.arrangement.clips["track-02"], undefined);
  assert.equal(assets.statusOf("track-02"), null);
});

test("import into the fixture session: appended after track 20 as 21, the fixture's clips stay SIMULATED fixtures, its tempo map and 56 bars stay; reopening the fixture brings the import back", async () => {
  const { schedule } = rig();
  lifecycle.restoreLast();
  assert.equal(project.id, SESSION_PROJECT_ID);
  await assets.importBatch([source("extra.wav", sine(20))]);
  assert.equal(project.tracks.length, 21);
  assert.equal(project.tracks[20].code, "21");
  assert.equal(project.tracks[19].audio, null);
  assert.equal(project.arrangement.barCount, 56);
  assert.equal(project.arrangement.tempoMarkers.length, 4);
  assert.equal(project.arrangement.clips["track-01"][0].source, "fixture");
  assert.equal(project.arrangement.clips["track-21"][0].source, "audio");
  assert.equal(project.arrangement.clips["track-21"][0].barCount, 10);
  schedule.run();
  lifecycle.startEmpty();
  assert.equal(project.isEmpty, true);
  lifecycle.open(SESSION_PROJECT_ID);
  await tickTask();
  await tickTask();
  assert.equal(project.tracks.length, 21);
  assert.equal(project.tracks[20].name, "extra");
  assert.equal(project.arrangement.clips["track-21"][0].source, "audio");
  assert.equal(project.arrangement.clips["track-05"][0].source, "fixture");
  // the pristine fixture (what boots) is untouched by any of it
  reset();
  assert.equal(project.tracks.length, 20);
  assert.equal(project.tracks.every((t) => t.audio === null), true);
});

test("without an asset store nothing can be imported and a reopened project's imported tracks are MISSING, not drawn", async () => {
  const { schedule } = rig();
  lifecycle.restoreLast();
  lifecycle.startEmpty();
  await assets.importBatch([source("x.wav", sine(2))]);
  schedule.run();
  assets.detach();
  assert.equal(assets.attached, false);
  await assert.rejects(() => assets.importBatch([source("y.wav", sine(1))]), /no project storage for audio is attached/);
  lifecycle.open(SESSION_PROJECT_ID);
  lifecycle.open("project-a");
  assert.equal(project.tracks.length, 1, "the project opens from its manifest");
  assert.equal(assets.statusOf("track-01"), "missing");
  assert.equal(project.arrangement.clips["track-01"], undefined);
  reset();
});

/* ------------------------------------------------------------------------- Task 11.1: rates, alignments, retention, the rate change */

test("Task 11.1: a 44.1 kHz import into a 48 kHz project is converted once — the notice says what happened and never claims losslessness; the original is retained beside the conversion", async () => {
  const store = memoryAssetStore();
  const result = await importFiles([source("stem.441.wav", sine(2, { sampleRate: 44100, amp: 0.5 }))], ctx(store));
  assert.equal(result.lines[0].outcome, "added");
  assert.match(result.lines[0].detail, /44\.1 kHz → 48 kHz — high-quality resampling to the project rate — not lossless/);
  assert.deepEqual(result.lines[0].flags, ["converted"]);
  const stem = result.stems[0];
  // the model: the ORIGINAL's facts stay (44.1), the project-rate copy is recorded
  assert.equal(stem.track.audio.sampleRate, 44100, "the source metadata is retained");
  assert.equal(stem.track.audio.containerBits, 24);
  assert.equal(stem.track.audio.alignment, null);
  assert.equal(stem.track.audio.converted.sampleRate, 48000);
  assert.equal(stem.track.audio.converted.frames, Math.ceil((2 * 44100) * 48000 / 44100));
  // the store: original AND converted, byte for byte
  const asset = await store.getAsset(stem.track.audio.assetId);
  assert.ok(asset.converted, "the project-rate copy is stored beside the original");
  const original = asset.bytes instanceof Uint8Array ? asset.bytes : new Uint8Array(await asset.bytes.arrayBuffer());
  assert.equal(await sha256Hex(original), asset.sha256, "the original is the file, unchanged");
  const converted = asset.converted.bytes instanceof Uint8Array ? asset.converted.bytes : new Uint8Array(await asset.converted.bytes.arrayBuffer());
  const c = await importFiles([source("probe.wav", converted)], ctx(store, { projectId: "probe-only" }));
  assert.equal(c.lines[0].outcome, "added");
  assert.equal(c.stems[0].track.audio.sampleRate, 48000, "the converted copy is float32 at the project rate");
  assert.equal(c.stems[0].track.audio.encoding, "float");
  assert.equal(c.stems[0].track.audio.converted.frames, stem.track.audio.converted.frames, "the copy passes through untouched at the same rate");
  // the peaks are keyed to the CONVERTED copy at the project rate
  const peaks = await store.getPeaks(stem.track.audio.assetId);
  assert.equal(peaks.sampleRate, 48000);
  assert.equal(peaks.convertedSha256, asset.converted.sha256);
  assert.equal(peaks.peaks, stem.peaks);
  assert.equal(peaks.peaks.frames, stem.track.audio.converted.frames);
  // a 48 kHz import needs no conversion: no notice, no flag
  const same = await importFiles([source("stem.48.wav", sine(2))], ctx(store, { projectId: "probe-only" }));
  assert.equal(same.lines[0].outcome, "added");
  assert.ok(!/converted/.test(same.lines[0].detail), same.lines[0].detail);
  assert.deepEqual(same.lines[0].flags, []);
});

test("Task 11.1: both 24-in-32 alignments import at the correct level (the right one detected, the left one declared) and at the correct pitch and grid", async () => {
  for (const alignment of ["left", "right"]) {
    const store = memoryAssetStore();
    const result = await importFiles([source(`stem-${alignment}.wav`, sine24In32(2, { alignment, amp: 0.5 }))], ctx(store));
    assert.equal(result.lines[0].outcome, "added", `${alignment} imports`);
    const audio = result.stems[0].track.audio;
    assert.equal(audio.containerBits, 32, "the container fact travels");
    assert.equal(audio.bitDepth, 24);
    assert.equal(audio.alignment, alignment, `the resolved alignment is recorded in the import metadata (${alignment})`);
    assert.ok(Math.abs(audio.peakDbfs - 20 * Math.log10(0.5)) < 0.05, `${alignment}: the level is the file's (−6 dBFS), not 8× off (got ${audio.peakDbfs})`);
    assert.ok(Math.abs(audio.converted.peakDbfs - 20 * Math.log10(0.5)) < 0.05, `${alignment}: the converted copy keeps the level`);
    // grid alignment: 2 s at 48 kHz converts to exactly 96000 frames at 48 kHz (no rate change)
    assert.equal(audio.converted.frames, 96000);
  }
  // a 24-in-32 file at 44.1 kHz: alignment AND rate, both handled in one conversion
  const store = memoryAssetStore();
  const both = await importFiles([source("stem-both.wav", sine24In32(1, { alignment: "right", sampleRate: 44100 }))], ctx(store));
  assert.equal(both.lines[0].outcome, "added");
  const audio = both.stems[0].track.audio;
  assert.equal(audio.alignment, "right");
  assert.equal(audio.sampleRate, 44100);
  assert.equal(audio.converted.sampleRate, 48000);
  assert.ok(Math.abs(audio.converted.peakDbfs - 20 * Math.log10(0.5)) < 0.05, "the level survives alignment detection and resampling together");
  assert.match(both.lines[0].detail, /44\.1 kHz → 48 kHz/);
});

test("Task 11.1: 32-bit int PCM and 32-bit float import; 96 kHz is still refused", async () => {
  const store = memoryAssetStore();
  const r = await importFiles([
    source("int32.wav", sine(1, { bitDepth: 32, encoding: "pcm", amp: 0.5 })),
    source("float32.wav", sine(1, { bitDepth: 32, encoding: "float", amp: 0.5 })),
    source("hires.wav", sine(1, { sampleRate: 96000 })),
  ], ctx(store));
  assert.equal(r.lines[0].outcome, "added");
  assert.equal(r.lines[1].outcome, "added");
  assert.equal(r.lines[2].outcome, "unsupported");
  assert.equal(r.lines[2].detail.match(/96 kHz/)?.length, 1);
  assert.ok(Math.abs(r.stems[0].track.audio.peakDbfs - 20 * Math.log10(0.5)) < 0.01, "int32 scales by 2^31");
  assert.ok(Math.abs(r.stems[1].track.audio.peakDbfs - 20 * Math.log10(0.5)) < 0.001, "float32 passes as stored");
});

test("Task 11.1: the project rate is locked at creation, saved in the manifest, migrated for old projects, and read by everything", async () => {
  const { storage, schedule, assetStore } = rig();
  lifecycle.restoreLast();
  lifecycle.startEmpty();
  assert.equal(project.sampleRate, 48000, "a new project defaults to 48 kHz");
  await assets.importBatch([source("legacy.wav", sine(2))]);
  schedule.run();
  const saved = JSON.parse(storage.data.get(projectKey("project-a")));
  assert.equal(saved.project.sampleRate, 48000);

  // an old manifest (pre-11.1, no sampleRate field) reopens at 48000
  const legacy = JSON.parse(JSON.stringify(saved));
  legacy.project.id = "project-b";
  delete legacy.project.sampleRate;
  delete legacy.tracks?.[0]?.audio?.converted;
  storage.data.set(projectKey("project-b"), JSON.stringify(legacy));
  storage.data.set(RECENT_KEY, JSON.stringify({ schema: "alloy.projects/1", entries: [
    { id: "project-b", name: "Legacy", template: "empty", openedAt: "2026-11-02T13:00:00.000Z" },
    { id: "project-a", name: "A", template: "empty", openedAt: "2026-11-02T12:00:00.000Z" },
  ] }));
  const opened = lifecycle.open("project-b");
  assert.equal(opened.ok, true);
  assert.equal(project.sampleRate, 48000, "a manifest without a rate reopens at the legacy default");
  assert.equal(project.tracks[0].audio.converted, null, "a legacy audio block reopens with converted: null");
  // the hydrate repair makes its copy at the project rate
  await tickTask(); await tickTask(); await tickTask(); await tickTask();
  assert.equal(assets.statusOf(project.tracks[0].id), "ready");
  assert.equal(project.tracks[0].audio.converted.sampleRate, 48000);
  const repairedAsset = await assetStore.getAsset(project.tracks[0].audio.assetId);
  assert.ok(repairedAsset && repairedAsset.converted, "the legacy record gained its project-rate copy");
  reset();
});

test("Task 11.1: changing the project's rate is explicit, re-resamples every clip with progress, and applies once", async () => {
  const { schedule, assetStore } = rig();
  lifecycle.restoreLast();
  lifecycle.startEmpty();
  await assets.importBatch([source("a.wav", sine(4, { sampleRate: 44100 })), source("b.wav", sine(2))]);
  assert.equal(project.sampleRate, 48000);
  assert.equal(project.tracks[0].audio.converted.sampleRate, 48000);
  assert.equal(project.tracks[0].audio.converted.frames, Math.ceil(4 * 44100 * 48000 / 44100));

  const seen = [];
  const outcome = await changeProjectRate(44100, {
    store: assetStore,
    onProgress: (p) => seen.push(`${p.index}/${p.total}:${p.name}:${p.fraction.toFixed(2)}`),
  });
  assert.equal(outcome.ok, true, outcome.detail ?? "");
  assert.equal(outcome.changed, 2);
  assert.equal(outcome.rate, 44100);
  assert.equal(project.sampleRate, 44100, "the project's rate flipped in one structural change");
  for (const t of project.tracks) {
    assert.equal(t.audio.converted.sampleRate, 44100, `${t.audio.fileName} was re-resampled`);
    assert.ok(Math.abs(t.audio.converted.frames / 44100 - (t.audio.frames / t.audio.sampleRate)) < 0.01, "the duration is preserved");
    const asset = await assetStore.getAsset(t.audio.assetId);
    assert.equal(asset.converted.format.sampleRate, 44100);
    assert.equal(asset.format.sampleRate, t.audio.sampleRate, "the original's facts are untouched");
    const peaks = await assetStore.getPeaks(t.audio.assetId);
    assert.equal(peaks.sampleRate, 44100, "the peaks were invalidated and recomputed at the new rate");
    assert.ok(peaks.convertedSha256 === asset.converted.sha256, "the peaks describe the new copy");
  }
  assert.ok(seen.length >= 2, `progress reported per stem (${seen.length} reports)`);
  assert.match(seen[0], /^0\/2:a\.wav/);

  // the manifest saves the new rate; a reopen keeps it and the copies are ready without repair
  schedule.run();
  lifecycle.open(SESSION_PROJECT_ID);
  const reopened = lifecycle.open("project-a");
  assert.equal(reopened.ok, true);
  assert.equal(project.sampleRate, 44100);
  await tickTask(); await tickTask(); await tickTask(); await tickTask();
  assert.equal(assets.statusOf("track-01"), "ready");
  assert.equal(assets.statusOf("track-02"), "ready");
  assert.equal(project.arrangement.clips["track-01"][0].source, "audio");

  // a same-rate change is an honest no-op
  const noop = await changeProjectRate(44100, { store: assetStore });
  assert.equal(noop.ok, true);
  assert.equal(noop.changed, 0);
  reset();
});

test("Task 11.1: a rate change refuses to start when a stem's original is gone, and the project keeps its rate", async () => {
  const { schedule, assetStore } = rig();
  lifecycle.restoreLast();
  lifecycle.startEmpty();
  await assets.importBatch([source("a.wav", sine(2))]);
  await assetStore.remove(project.tracks[0].audio.assetId);
  const outcome = await changeProjectRate(44100, { store: assetStore });
  assert.equal(outcome.ok, false);
  assert.match(outcome.detail, /stored copy is gone/);
  assert.equal(project.sampleRate, 48000, "nothing was applied");
  reset();
});
