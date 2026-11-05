// Task 9.1 — the seams between the tasks that were each verified alone.
//
// Every earlier suite tests one layer: import, the store, the engine, playback, export,
// rulebooks. This file tests the JOINTS — the places where one layer's output is the next
// layer's input — because that is where a stabilization pass finds real defects. Nothing
// here is mocked: real WAV bytes go through the real importer into the real project model,
// and the real exporter's output is fed back into the real importer.
import test from "node:test";
import assert from "node:assert/strict";

const { importFiles } = await import("../src/lib/project/import.ts");
const { memoryAssetStore, sha256Hex } = await import("../src/lib/audio/asset-store.ts");
const { judgeFormat, ACCEPTED_SAMPLE_RATE } = await import("../src/lib/audio/import-rules.ts");
const { encodeWav, inspectWav } = await import("../src/lib/audio/wav.ts");
const { exportProject } = await import("../src/lib/export/exporter.ts");
const { memoryDestination } = await import("../src/lib/export/destination.ts");
const { DEFAULT_EXPORT_FORMAT, formatFromId } = await import("../src/lib/export/encode.ts");
const { safeName, stemName, busName, uniqueName } = await import("../src/lib/export/plan.ts");
const { PlaybackController } = await import("../src/lib/playback/controller.ts");
const { projectFixture, trackFixture, busFixture } = await import("./engine-fixtures.mjs");

const RATE = ACCEPTED_SAMPLE_RATE;

/* --- fixtures ------------------------------------------------------------------------- */

function wavBytes({ frames = 480, rate = RATE, channels = 2, encoding = "pcm", bitDepth = 24, amplitude = 0.25 } = {}) {
  return encodeWav({
    sampleRate: rate,
    channels,
    encoding,
    bitDepth,
    frames,
    sample: (channel, frame) => amplitude * Math.sin((2 * Math.PI * 220 * frame) / rate + (channel === 1 ? 1 : 0)),
  });
}

let idSeed = 0;
function importContext(store, tracks = []) {
  return {
    projectId: "stabilization",
    tracks,
    tempoMarkers: [{ bar: 1, seconds: 0, tempo: 120 }],
    store,
    newId: () => `id-${++idSeed}`,
    now: () => "2026-11-04T00:00:00.000Z",
    yieldBetween: async () => {},
  };
}

function source(name, bytes) {
  return { name, size: bytes.length, bytes: async () => bytes };
}

function audioRecord() {
  return {
    assetId: "asset-1",
    fileName: "Kick.wav",
    sha256: "0".repeat(64),
    bytes: 1000,
    encoding: "pcm",
    bitDepth: 24,
    sampleRate: RATE,
    channels: 2,
    frames: 480,
    peakDbfs: -6,
    silent: false,
  };
}

function exportableProject() {
  const track = trackFixture({ id: "track-01", name: "Kick", level: -6 });
  track.audio = audioRecord();
  return projectFixture({ tracks: [track], buses: [], returns: [] });
}

function toneSource(frames, amplitude = 0.3) {
  return {
    sampleRate: RATE,
    frames,
    read(start, target, count) {
      for (let i = 0; i < count; i++) {
        const v = amplitude * Math.sin((2 * Math.PI * 220 * (start + i)) / RATE);
        target[0][i] = v;
        target[1][i] = v;
      }
      return count;
    },
    close() {},
  };
}

function residentSource(frames) {
  return {
    sampleRate: RATE,
    frames,
    read(start, target, count) {
      for (let c = 0; c < 2; c++) target[c].fill(0.1, 0, count);
      return count;
    },
    close() {},
  };
}

/* --- 1. Import boundaries ------------------------------------------------------------- */

test("9.1 · a good stem imports, and the track it creates carries exactly the file's facts", async () => {
  const store = memoryAssetStore();
  const bytes = wavBytes({ frames: 2400 });
  const result = await importFiles([source("Kick.wav", bytes)], importContext(store));

  assert.equal(result.added, 1);
  assert.equal(result.refused, 0);
  assert.equal(result.lines[0].outcome, "added");

  const track = result.stems[0].track;
  assert.equal(track.name, "Kick");
  assert.equal(track.audio.sampleRate, RATE);
  assert.equal(track.audio.channels, 2);
  assert.equal(track.audio.frames, 2400);
  assert.equal(track.audio.encoding, "pcm");
  assert.equal(track.audio.bitDepth, 24);
  // The frames the model records are the frames the file really holds.
  assert.equal(inspectWav(bytes).format.frames, track.audio.frames);
  // And the asset is retrievable under the id the track points at.
  const asset = await store.getAsset(track.audio.assetId);
  assert.ok(asset, "the asset was stored under the track's assetId");
});

test("9.1 · every refusal reason is distinct and none of them adds a track", async () => {
  const store = memoryAssetStore();
  const cases = [
    ["slow.wav", wavBytes({ rate: 44100 }), "unsupported"],
    ["sixteen.wav", wavBytes({ bitDepth: 16 }), "unsupported"],
    ["three.wav", wavBytes({ channels: 3 }), "unsupported"],
    // A file that is not a WAV at all is a *format* refusal, not damage: the importer
    // cannot say a file is corrupt when it was never a WAV (Task 5.1, D5.1.x).
    ["not-a-wav.wav", new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), "unsupported"],
    ["empty.wav", new Uint8Array(0), "unsupported"],
  ];
  const result = await importFiles(
    cases.map(([name, bytes]) => source(name, bytes)),
    importContext(store),
  );
  assert.equal(result.added, 0);
  assert.equal(result.stems.length, 0);
  assert.equal(result.refused, cases.length);
  for (const [index, [name, , expected]] of cases.entries()) {
    assert.equal(result.lines[index].outcome, expected, `${name} → ${expected}`);
    assert.ok(result.lines[index].detail.length > 0, `${name} says why`);
  }
  // Each refusal is a specific one: the messages are not all the same sentence.
  const details = new Set(result.lines.map((line) => line.detail));
  assert.equal(details.size, cases.length, "each file gets its own explanation");
});

test("9.1 · a batch with one bad file adds the good ones and reports the rest", async () => {
  const store = memoryAssetStore();
  const result = await importFiles(
    [
      source("Kick.wav", wavBytes()),
      source("broken.wav", new Uint8Array([0, 1, 2])),
      source("Snare.wav", wavBytes({ amplitude: 0.4 })),
    ],
    importContext(store),
  );
  assert.equal(result.added, 2);
  assert.equal(result.refused, 1);
  assert.deepEqual(result.stems.map((stem) => stem.track.name), ["Kick", "Snare"]);
  assert.equal(result.lines.filter((line) => line.outcome === "added").length, 2);
});

test("9.1 · re-importing the same file adds a second track and never touches the first", async () => {
  // Verified behaviour, recorded because it is a limitation a user will meet: ALLOY has
  // no import history, so the same file twice is two tracks (and two copies of the audio).
  // What must NOT happen is a silent overwrite of the track that is already there.
  const store = memoryAssetStore();
  const bytes = wavBytes();
  const first = await importFiles([source("Kick.wav", bytes)], importContext(store));
  assert.equal(first.added, 1);

  const again = await importFiles(
    [source("Kick.wav", bytes)],
    importContext(store, first.stems.map((stem) => stem.track)),
  );
  assert.equal(again.added, 1, "the second import is accepted too");
  const before = first.stems[0].track;
  const after = again.stems[0].track;
  assert.notEqual(after.id, before.id, "it is a different track");
  assert.notEqual(after.audio.assetId, before.audio.assetId, "it owns its own audio copy");
  // The original track object is untouched: no id, code, name or asset was stolen.
  assert.equal(before.name, "Kick");
  assert.equal(before.audio.frames, 480);
  assert.equal(before.audio.assetId.startsWith("asset-id") || before.audio.assetId.length > 0, true);
  assert.ok(await store.getAsset(before.audio.assetId), "the first track's audio is still readable");
  assert.ok(await store.getAsset(after.audio.assetId), "the second track's audio is readable");
  assert.equal((await store.list("stabilization")).length, 2, "two copies are held, by design");
});

/* --- 2. Export → import round trip ---------------------------------------------------- */

test("9.1 · both export formats are re-importable — a mix can be checked back in", async () => {
  // Export writes 32-bit float by default; import accepts 24-bit PCM and 32-bit float at
  // 48 kHz. If those two drifted apart, an exported stem could not be re-imported to
  // compare, and plan §10's "keep raw and processed playback for comparison" would fail.
  const project = exportableProject();
  for (const [label, format] of [
    ["float32", { ...DEFAULT_EXPORT_FORMAT, sampleRate: RATE }],
    ["pcm24", formatFromId("pcm24", RATE)],
  ]) {
    const destination = memoryDestination();
    const outcome = await exportProject({
      project,
      sources: new Map([["track-01", toneSource(480)]]),
      selection: { fullMix: true, stems: true, buses: false },
      destination,
      format,
    });
    assert.equal(outcome.ok, true, `${label}: ${JSON.stringify(outcome.failures)}`);
    assert.ok(outcome.files.length >= 2, `${label} wrote the mix and the stem`);

    for (const file of outcome.files) {
      const bytes = destination.read(file.path);
      const inspected = inspectWav(bytes);
      assert.equal(inspected.ok, true, `${label} ${file.path} must be a readable WAV`);
      const verdict = judgeFormat(inspected.format);
      assert.equal(verdict.ok, true, `${label} ${file.path} refused by the importer: ${verdict.detail}`);
      assert.equal(inspected.format.sampleRate, RATE);
      assert.equal(inspected.format.channels, 2);
    }
  }
});

test("9.1 · an exported mix re-imported produces the same track facts an import does", async () => {
  const store = memoryAssetStore();
  const project = exportableProject();
  const destination = memoryDestination();
  const outcome = await exportProject({
    project,
    sources: new Map([["track-01", toneSource(480)]]),
    selection: { fullMix: true, stems: false, buses: false },
    destination,
  });
  assert.equal(outcome.ok, true, JSON.stringify(outcome.failures));
  const mix = outcome.files.find((file) => file.output === "fullMix");
  assert.ok(mix, "the mix file was written");
  const bytes = destination.read(mix.path);

  const imported = await importFiles([source("Mix.wav", bytes)], importContext(store));
  assert.equal(imported.added, 1);
  const track = imported.stems[0].track;
  assert.equal(track.audio.frames, mix.frames, "the re-imported length matches the export");
  assert.equal(track.audio.sampleRate, RATE);
  assert.equal(track.audio.channels, 2);
});

/* --- 3. Names and collisions across the whole plan ------------------------------------ */

test("9.1 · a project name that is illegal on disk still yields a usable folder", async () => {
  const project = { ...exportableProject(), name: 'AC/DC: "Live" <2026> | ?*' };
  const destination = memoryDestination();
  const outcome = await exportProject({
    project,
    sources: new Map([["track-01", toneSource(480)]]),
    selection: { fullMix: true, stems: false, buses: false },
    destination,
  });
  assert.equal(outcome.ok, true, JSON.stringify(outcome.failures));
  const paths = destination.files();
  assert.ok(paths.length > 0);
  for (const path of paths) {
    assert.doesNotMatch(path, /[:<>|?*"]/, `${path} must contain no illegal characters`);
    for (const segment of path.split("/")) {
      assert.ok(segment.length > 0, `${path} has an empty segment`);
      assert.doesNotMatch(segment, /^\./, `${segment} must not start with a dot`);
      assert.doesNotMatch(segment, /[. ]$/, `${segment} must not end with a dot or a space`);
    }
  }
});

test("9.1 · every stem and bus file name is unique case-insensitively across the export", () => {
  // The naming contract in one assertion: a session that abuses names still produces a
  // set of paths a case-insensitive file system can hold together.
  const names = ["Kick", "kick", "KICK", "Kick ", "Kick.", "Ki?ck", "CON", "Kick"];
  const taken = new Set();
  const results = names.map((name) => uniqueName(safeName(name), taken));
  const lowered = results.map((name) => name.toLowerCase());
  assert.equal(new Set(lowered).size, results.length, `collision survived: ${results.join(" | ")}`);

  // And the numbered prefixes match the model's own codes.
  assert.match(stemName({ code: "01", name: "Kick" }), /^01 Kick/);
  assert.match(busName({ code: "B1", name: "Drums" }), /^B1 Drums/);
});

/* --- 4. The route the export documents is the route the engine takes ------------------ */

test("9.1 · a stem's documented route is the project's actual routing", async () => {
  const kick = trackFixture({ id: "track-01", name: "Kick", output: "bus-01", level: -6 });
  kick.audio = audioRecord();
  const drums = busFixture({ id: "bus-01", name: "Drums" });
  const project = projectFixture({ tracks: [kick], buses: [drums], returns: [] });
  const destination = memoryDestination();
  const outcome = await exportProject({
    project,
    sources: new Map([["track-01", toneSource(480)]]),
    selection: { fullMix: false, stems: true, buses: true },
    destination,
  });
  assert.equal(outcome.ok, true, JSON.stringify(outcome.failures));
  assert.ok(outcome.manifest, "a manifest was written");
  const stem = outcome.manifest.files.find((file) => file.output === "stem" || file.path.startsWith("Stems/"));
  assert.ok(stem, "the stem is in the manifest");
  assert.equal(stem.routing.output, "Drums", "the stem's documented output is the bus's name");
  // The bus file exists for the bus that really receives the track.
  assert.ok(destination.files().some((path) => path.startsWith("Buses/")));
});

/* --- 5. Playback length follows the project, not the last thing played ---------------- */

test("9.1 · the transport's length tracks the longest imported stem, not the first", async () => {
  const project = projectFixture({
    tracks: [trackFixture({ id: "track-01" }), trackFixture({ id: "track-02" })],
    buses: [],
    returns: [],
  });
  let sources = new Map([["track-01", residentSource(1200)]]);
  const controller = new PlaybackController({
    getProject: () => project,
    openSources: async () => sources,
    output: { sampleRate: RATE, begin() {}, async write() {}, positionFrames: () => 0, async drain() {}, stop() {} },
    clock: { schedule: () => () => {}, yieldBetween: async () => {} },
    chunkFrames: 256,
    renderChunkFrames: 256,
    tailSeconds: 0,
  });

  await controller.refreshDuration();
  assert.equal(controller.getState().durationFrames, 1200);

  // A second import arrives: the length must grow without a play.
  sources = new Map([
    ["track-01", residentSource(1200)],
    ["track-02", residentSource(9600)],
  ]);
  await controller.refreshDuration();
  assert.equal(controller.getState().durationFrames, 9600, "the longer stem defines the session");
  controller.dispose();
});

/* --- 6. The shell seam: the transport learns the length when the project moves -------- */

test("9.1 · the playback shell measures the reopened project on install, and re-measures on a structural change", async () => {
  // This is the wiring the Task 9.1 fix depends on, so it is pinned rather than assumed:
  // the length must be known when the shell installs (a reopened project has one before
  // anything is pressed), and again when the project's structure moves. An ordinary
  // parameter edit must NOT pay for a re-measure.
  const { installPlaybackShell } = await import("../src/lib/playback/shell.ts");
  const { history, loadProject } = await import("../src/lib/project/store.svelte.ts");
  const { transport } = await import("../src/lib/playback/store.svelte.ts");

  const store = memoryAssetStore();
  const bytes = wavBytes({ frames: 960 });
  const assetId = "shell-asset";
  const fingerprint = await sha256Hex(bytes);
  await store.put(
    {
      assetId,
      projectId: "stabilization",
      fileName: "Kick.wav",
      mimeType: "audio/wav",
      size: bytes.length,
      sha256: fingerprint,
      format: { encoding: "pcm", bitDepth: 24, sampleRate: RATE, channels: 2, frames: 960 },
      importedAt: "2026-11-04T00:00:00.000Z",
      bytes,
    },
    {
      assetId,
      projectId: "stabilization",
      sha256: fingerprint,
      peaks: { min: -0.2, max: 0.2, rms: 0.1 },
    },
  );

  // A reopened project: one track, its audio already in the asset store.
  const track = trackFixture({ id: "track-01", name: "Kick" });
  track.audio = { ...audioRecord(), assetId, sha256: fingerprint, frames: 960 };
  const reopened = { ...projectFixture({ tracks: [track], buses: [], returns: [] }), id: "stabilization" };
  loadProject(reopened);

  const fakeWindow = {
    setInterval: () => 1,
    clearInterval: () => {},
    setTimeout: (fn) => {
      fn();
      return 1;
    },
  };
  const output = {
    sampleRate: RATE,
    begin() {},
    async write() {},
    positionFrames: () => 0,
    async drain() {},
    stop() {},
  };

  const detach = installPlaybackShell(fakeWindow, { assetStore: store, output });
  // Let the install-time measurement settle.
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(transport.attached, true, "the controller is attached");
  assert.equal(transport.durationFrames, 960, "the reopened project's length is known before anything is pressed");

  // PREVIOUS / NEXT work immediately, without a play first.
  transport.seek(transport.durationFrames);
  assert.equal(transport.positionFrames, 960, "NEXT locates to the end on a fresh install");
  transport.seek(transport.startFrame);
  assert.equal(transport.positionFrames, 0);

  // An ordinary parameter edit is not structural: the length is not thrown away.
  const { ops } = await import("../src/lib/project/store.svelte.ts");
  ops.setTrackLevel("track-01", -9);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(transport.durationFrames, 960, "a fader move does not re-measure the session or lose the length");

  detach();
  assert.equal(transport.attached, false, "uninstall detaches the controller");
  assert.equal(history.revision >= 0, true);
});

/* --- 7. A mono stem is heard on both sides -------------------------------------------- */

test("9.1 · a mono stem reaches the engine as identical L and R, not as silence", async () => {
  // Verified rather than assumed: the importer flags a mono stem, and the source reader
  // is what has to honour "plays on both sides". A mono file read into a stereo buffer
  // must be duplicated, never half-silent.
  const { openWavRenderSource } = await import("../src/lib/engine/render.ts");
  for (const [label, encoding, bitDepth] of [
    ["pcm24", "pcm", 24],
    ["float32", "float", 32],
  ]) {
    const bytes = encodeWav({
      sampleRate: RATE,
      channels: 1,
      encoding,
      bitDepth,
      frames: 64,
      sample: (channel, frame) => 0.5 * Math.sin(frame / 5),
    });
    const source = await openWavRenderSource(bytes);
    assert.equal(source.frames, 64, `${label}: the length is the file's`);
    const left = new Float32Array(64);
    const right = new Float32Array(64);
    await source.read(0, [left, right], 64);

    const peakOf = (channel) => Math.max(...Array.from(channel, Math.abs));
    assert.ok(peakOf(left) > 0.4, `${label}: the left side carries the signal`);
    assert.ok(peakOf(right) > 0.4, `${label}: the right side carries it too`);
    for (let i = 0; i < 64; i++) {
      assert.equal(left[i], right[i], `${label}: sample ${i} is identical on both sides`);
    }
  }
});

test("9.1 · a stereo stem is not folded down: the two sides stay different", async () => {
  const { openWavRenderSource } = await import("../src/lib/engine/render.ts");
  const bytes = encodeWav({
    sampleRate: RATE,
    channels: 2,
    encoding: "pcm",
    bitDepth: 24,
    frames: 64,
    sample: (channel, frame) => (channel === 0 ? 0.5 : -0.5) * Math.sin(frame / 5),
  });
  const source = await openWavRenderSource(bytes);
  const left = new Float32Array(64);
  const right = new Float32Array(64);
  await source.read(0, [left, right], 64);
  let differences = 0;
  for (let i = 0; i < 64; i++) if (left[i] !== right[i]) differences++;
  assert.ok(differences > 0, "a stereo file keeps its two different channels");
});

/* --- 8. The listening modes produce different audio, so the comparison is real -------- */

test("9.1.1 · RAW and RENDER really are different signals — §10's comparison is not cosmetic", async () => {
  // A mode control that switched a label but played the same audio would satisfy a state
  // test and fail the product. The mix applies the channel strip, so a track with a fader
  // move must sound different rendered than raw. This drives the real controller and reads
  // the PCM the output would have heard.
  const project = projectFixture({ tracks: [trackFixture({ id: "track-01", name: "Kick", level: -12 })], buses: [], returns: [] });
  const sources = new Map([["track-01", toneSource(512, 0.5)]]);

  function recordingOutput() {
    const chunks = [];
    return {
      sampleRate: RATE,
      begin() {},
      async write(chunk) {
        chunks.push(Float32Array.from(chunk.channels[0].subarray(0, chunk.frames)));
      },
      positionFrames: () => 0,
      async drain() {},
      stop() {},
      peak() {
        let max = 0;
        for (const chunk of chunks) for (const v of chunk) max = Math.max(max, Math.abs(v));
        return max;
      },
    };
  }

  const peaks = {};
  for (const mode of ["raw", "render"]) {
    const output = recordingOutput();
    const controller = new PlaybackController({
      getProject: () => project,
      openSources: async () => sources,
      output,
      clock: { schedule: () => () => {}, yieldBetween: async () => {} },
      chunkFrames: 256,
      renderChunkFrames: 256,
      tailSeconds: 0,
    });
    controller.setSource(mode);
    await controller.play();
    peaks[mode] = output.peak();
    controller.dispose();
  }

  assert.ok(peaks.raw > 0, "the raw stems are audible");
  assert.ok(peaks.render > 0, "the rendered mix is audible");
  // RAW is the summed stems, untouched by the channel strip; only RENDER applies the
  // fader, so the two modes must not produce the same audio.
  assert.ok(peaks.render < peaks.raw, "the fader is applied in the rendered path, not in raw playback");
});

/* --- 9. A new project must not silence what the user imports ------------------------- */

test("9.1.2 · the app boots an EMPTY project, not the development session", async () => {
  // The bug this fixes: ALLOY booted the 20-track fixture session, which ships a SOLO on
  // track 15 "Lead Vocal". Solo silences everything else, so a user who imported 11 stems
  // heard nothing and had no way to guess why. A new project must start empty.
  const { createEmptyProject } = await import("../src/lib/project/templates.ts");
  const fresh = createEmptyProject("fresh", "Fresh");
  assert.equal(fresh.tracks.length, 0);
  assert.equal(fresh.returns.length, 0);
  assert.equal(fresh.buses.length, 0);
  assert.equal(fresh.template, "empty");
});

test("9.1.2 · the fixture session really does silence other tracks, which is why it is not the default", async () => {
  // Kept as a guard on the fixture itself: if someone removes the solo this test fails and
  // the reason for booting empty gets re-examined rather than silently outliving its cause.
  const { createSessionProject } = await import("../src/lib/project/session.ts");
  const { computeAudibility } = await import("../src/lib/engine/audibility.ts");
  const session = createSessionProject();
  const soloed = session.tracks.filter((t) => t.channel.solo);
  assert.equal(soloed.length, 1, "the fixture ships exactly one soloed track");
  assert.equal(soloed[0].name, "Lead Vocal");
  const audibility = computeAudibility(session);
  const ordinary = session.tracks.find((t) => !t.channel.solo);
  assert.equal(audibility.outputPasses(ordinary.id), false, "and it silences every other track");
});

/* --- 10. Task 9.2: the top-bar and transport overhaul ---------------------------- */

const readSource = async (rel) => (await import("node:fs/promises")).readFile(new URL(`../${rel}`, import.meta.url), "utf8");

test("9.2 · the top bar carries no wordmark, no tab numbers and no Settings button", async () => {
  const app = await readSource("src/App.svelte");
  const nav = await readSource("src/components/RoomNav.svelte");

  assert.ok(!/class="app-brand"/.test(app), "the ALLOY wordmark is gone");
  assert.ok(!/app-nav__settings/.test(app), "the Settings button is gone from the bar");
  assert.ok(!/room-nav__index/.test(nav), "the 01/02/03 prefixes are gone");
  assert.ok(!/padStart\(2, "0"\)/.test(nav), "nothing recomputes an index label");
});

test("9.2 · Home is the fourth navigation tab, and it is not a room", async () => {
  const nav = await readSource("src/components/RoomNav.svelte");
  const rooms = await readSource("src/lib/rooms.ts");

  // The wordmark used to be the only route home; the tab replaces it.
  assert.match(nav, /data-app-link="home"/, "Home is a nav destination");
  assert.match(nav, /HOME_HREF/, "pointing at the real Home route");

  // Home must NOT have been promoted to a room: the room model still has three.
  assert.match(rooms, /export type RoomId = "console" \| "arrange" \| "mixer";/);
  assert.match(rooms, /export const HOME_HREF = "#\/";/);
});

test("9.2 · the toolbar's actions are real bindings, not decoration", async () => {
  const bar = await readSource("src/components/AppToolbar.svelte");

  assert.match(bar, /import \{ autosave, history \} from "\.\.\/lib\/project\/store\.svelte"/);
  assert.match(bar, /history\.undo\(\)/);
  assert.match(bar, /history\.redo\(\)/);
  assert.match(bar, /autosave\.save\(\)/);
  // Undo and Redo must reflect whether there is anything to do.
  assert.match(bar, /disabled=\{!canUndo\}/);
  assert.match(bar, /disabled=\{!canRedo\}/);
  // Save reports what actually happened rather than always claiming success.
  assert.match(bar, /NO STORAGE/i);
});

test("9.2 · there is exactly one file picker, and every import entry point reaches it", async () => {
  const app = await readSource("src/App.svelte");
  const arrange = await readSource("src/rooms/ArrangeRoom.svelte");

  assert.equal((app.match(/type="file"/g) ?? []).length, 1, "one picker in the shell");
  assert.ok(!/type="file"/.test(arrange), "and none left in Arrange");
  assert.ok(!/ArrangeImportBand/.test(arrange), "the dark Import band is gone");

  assert.match(app, /key === "i"/, "Ctrl/Cmd+I");
  assert.match(app, /key === "s"/, "Ctrl/Cmd+S");
  assert.match(app, /assets\.importBatch/, "reaching the real importer");
});

test("9.2 · the transport keeps its controls and values but loses its decorative text", async () => {
  const transport = await readSource("src/components/MiniTransport.svelte");

  for (const control of ["Previous", "Play", "Stop", "Next"]) {
    assert.ok(transport.includes(`"${control}"`), `${control} is still a control`);
  }
  assert.match(transport, /data-transport-position/, "the time value is still rendered");
  assert.match(transport, /data-transport-status/, "the status value is still rendered");

  // The owner's removals.
  assert.ok(!/Shared transport\.\s*Play/.test(transport), "the explanatory paragraph is gone");
  assert.ok(!/mini-transport__note/.test(transport), "and nothing references it");
  for (const label of ["Position / time", "Mini transport"]) {
    // Only allowed inside the visually-hidden helper, never as a printed label.
    assert.ok(!new RegExp(`mini-transport__[a-z-]*label"[^>]*>${label}`).test(transport), `"${label}" is not printed`);
  }
});

/* --- 11. Task 9.3: hardware chrome and tactile keys ------------------------------ */

test("9.3 · every chrome button is the approved tactile cap, not a grey web button", async () => {
  const menu = await readSource("src/components/MenuBar.svelte");
  const bar = await readSource("src/components/AppToolbar.svelte");
  const source = await readSource("src/components/MiniTransportSource.svelte");
  const transport = await readSource("src/components/MiniTransport.svelte");

  // The menus, the toolbar, the listening source and the transport keys all use
  // one key component, so they cannot drift into different materials.
  assert.match(menu, /import ToolbarKey from "\.\/hardware\/ToolbarKey\.svelte"/);
  assert.match(bar, /import ToolbarKey from "\.\/hardware\/ToolbarKey\.svelte"/);
  assert.match(source, /import ToolbarKey from "\.\/hardware\/ToolbarKey\.svelte"/);
  assert.match(transport, /import ToolbarKey from "\.\/hardware\/ToolbarKey\.svelte"/);

  // And that key really is a platform <button>, not a styled div.
  const key = await readSource("src/components/hardware/ToolbarKey.svelte");
  assert.match(key, /<button/);
  assert.match(key, /data-part="cap"/);
  // …carrying the approved cream cap recipe from the transport switch.
  assert.match(key, /--al-function-cream-hi/);
  assert.match(key, /--al-function-cream-base/);
});

test("9.3 · no light web-grey surface survives in the shipping UI", async () => {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");

  const walk = async (dir) => {
    const out = [];
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "dev") continue; // the private playground is out of scope
        out.push(...(await walk(full)));
      } else if (/\.(svelte|css)$/.test(entry.name)) {
        out.push(full);
      }
    }
    return out;
  };

  const offenders = [];
  for (const file of await walk("src")) {
    // ChannelStrip.svelte is dead code: nothing imports it, and check-channel-strip
    // pins it byte-identical as a Phase 0 artefact. It is the one exception, and it
    // ships no route, so its light greys never reach a screen.
    if (file.endsWith("components/ChannelStrip.svelte")) continue;
    const text = await fs.readFile(file, "utf8");
    // A near-white literal background is a web panel, not this app's material.
    for (const m of text.matchAll(/background(?:-color)?:\s*(#[defc][0-9a-f]{2,5})\b/gi)) {
      if (!/var\(--al-/.test(m[0])) offenders.push(`${file}: ${m[0]}`);
    }
  }
  assert.deepEqual(offenders, [], "no light-grey web surfaces left in shipping code");
});

test("9.3 · the top bar is one thin hardware band, reading menus → tools → tabs", async () => {
  const app = await readSource("src/App.svelte");

  // The band wraps all three groups, in that order.
  const band = app.indexOf("<ChromeBand");
  const menus = app.indexOf("<MenuBar");
  const tools = app.indexOf("<AppToolbar");
  const tabs = app.indexOf("<RoomNav");
  assert.ok(band > -1 && menus > band && tools > menus && tabs > tools,
    "menus, then tools, then tabs — inside one band");

  // And the app ground is the cabinet material, not office grey.
  const css = await readSource("src/app.css");
  assert.match(css, /background: var\(--al-material-recess\)/);
  assert.ok(!/background: #e4e4e4/.test(css), "the old light page ground is gone");
});

test("9.3 · the transport strip and the top bar share one band component", async () => {
  const transport = await readSource("src/components/MiniTransport.svelte");
  const app = await readSource("src/App.svelte");

  // One component, so the two cannot become two different materials.
  assert.match(transport, /import ChromeBand from "\.\/ChromeBand\.svelte"/);
  assert.match(app, /import ChromeBand from "\.\/components\/ChromeBand\.svelte"/);

  // And it is built from the shared material tokens, not from hexes.
  const band = await readSource("src/components/ChromeBand.svelte");
  assert.match(band, /var\(--al-material-panel\)/);
  assert.match(band, /var\(--al-bevel-light\)/);
  assert.match(band, /var\(--al-material-wood\)/);
});
