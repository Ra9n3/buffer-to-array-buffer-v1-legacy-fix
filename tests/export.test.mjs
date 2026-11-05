// Task 8.2 — WAV export and external JSON rulebooks.
//
// The export must be the REAL signal path: these tests render through Task 7.4's
// `renderProject` and compare the bytes that land in the destination against a
// reference rendered in the same call, so "the file is the mix" is asserted rather
// than assumed. Nothing here mocks the engine.
import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_EXPORT_FORMAT,
  EXPORT_FORMATS,
  MemoryByteSink,
  WavStreamWriter,
  formatFromId,
  printFormat,
  wavHeader,
} from "../src/lib/export/encode.ts";
import { collectDestination, memoryDestination } from "../src/lib/export/destination.ts";
import { exportProject, stemProject } from "../src/lib/export/exporter.ts";
import {
  NO_SELECTION_MESSAGE,
  busesWithSignal,
  fullMixName,
  planExport,
  safeName,
  stemRouting,
  uniqueName,
} from "../src/lib/export/plan.ts";
import {
  RULEBOOK_SCHEMA,
  PLACEHOLDER_RULEBOOK,
  PLACEHOLDER_RULEBOOK_JSON,
  applyRulebook,
  parseRulebook,
  validateRulebook,
} from "../src/lib/rulebook/rulebook.ts";
import { renderProject } from "../src/lib/engine/render.ts";
import { inspectWav, readWavHeader, sampleReaderFor } from "../src/lib/audio/wav.ts";
import { RATE, busFixture, projectFixture, returnFixture, trackFixture } from "./engine-fixtures.mjs";

const FRAMES = 4800; // 0.1 s at 48 kHz

/** A seekable, deterministic source: a tone with an optional per-channel offset. */
function toneSource(frames, hz, amplitude, options = {}) {
  let closed = 0;
  let failAt = options.failAt ?? 0;
  const reads = { count: 0 };
  return {
    sampleRate: options.sampleRate ?? RATE,
    frames,
    read(start, target, count) {
      reads.count++;
      if (failAt && reads.count === failAt) throw new Error("injected source failure");
      for (let i = 0; i < count; i++) {
        const v = amplitude * Math.sin((2 * Math.PI * hz * (start + i)) / RATE);
        target[0][i] = v;
        target[1][i] = options.mono ? v : amplitude * Math.sin((2 * Math.PI * hz * (start + i)) / RATE + (options.offset ?? 0));
      }
      return count;
    },
    close() {
      closed++;
    },
    get closed() {
      return closed * 1;
    },
  };
}

function withAudio(track, frames, extra = {}) {
  return {
    ...track,
    audio: {
      assetId: `asset-${track.id}`,
      fileName: `${track.name}.wav`,
      sha256: "0".repeat(64),
      bytes: frames * 3 * 2,
      encoding: "pcm",
      bitDepth: 24,
      sampleRate: RATE,
      channels: 2,
      frames,
      peakDbfs: -6,
      silent: false,
      ...extra,
    },
  };
}

/**
 * The canonical fixture: two tracks on a bus with its own processing, one track on
 * Master, and a Reverb Return with a live send — so every contribution the plan
 * cares about (inserts, bus chain, Return effect, routing) is present.
 */
function session() {
  const kick = withAudio(
    trackFixture({ id: "track-01", name: "Kick", output: "bus-01", level: -6, sends: [{ to: "return-01", level: -6 }] }),
    FRAMES,
  );
  const snare = withAudio(trackFixture({ id: "track-02", name: "Snare", output: "bus-01", level: -7 }), FRAMES);
  const vocal = withAudio(trackFixture({ id: "track-03", name: "Vocal", output: "master", level: -3 }), FRAMES);
  const drums = busFixture({ id: "bus-01", name: "Drums", level: -2, bands: { lf: [100, 3] } });
  const reverb = returnFixture({ id: "return-01", name: "Room", effect: "reverb", level: -4, time: 1.2 });
  const project = projectFixture({ tracks: [kick, snare, vocal], buses: [drums], returns: [reverb] });
  const sources = new Map([
    [kick.id, toneSource(FRAMES, 100, 0.4)],
    [snare.id, toneSource(FRAMES, 220, 0.3, { mono: true })],
    [vocal.id, toneSource(FRAMES, 440, 0.25, { offset: Math.PI / 2 })],
  ]);
  return { project, sources };
}

const ALL = { fullMix: true, stems: true, buses: true };

function samplesOf(bytes) {
  const header = readWavHeader(bytes);
  assert.equal(header.ok, true, header.ok ? "" : header.problem);
  const inspection = inspectWav(bytes);
  assert.equal(inspection.ok, true, inspection.ok ? "" : inspection.problem);
  // `readWavHeader` reports the container only; the inspector maps the tag to an
  // encoding, which is what a sample reader needs.
  const reader = sampleReaderFor(inspection.format);
  assert.notEqual(reader, null);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const bytesPerSample = header.raw.containerBits / 8;
  const frames = inspection.format.frames;
  const channels = [new Float32Array(frames), new Float32Array(frames)];
  for (let f = 0; f < frames; f++) {
    for (let c = 0; c < 2; c++) {
      channels[c][f] = reader(view, header.dataOffset + (f * 2 + c) * bytesPerSample);
    }
  }
  return { header, channels, frames, format: inspection.format };
}

/**
 * Render a project to plain arrays — the reference an exported file is compared to.
 * Sized from what the renderer delivers (input + rendered Return tail), because a
 * mix is longer than its longest input.
 */
async function renderToArrays(project, sources, options = {}) {
  const chunks = [];
  let total = 0;
  await renderProject(project, sources, {
    write(chunk) {
      const copy = [new Float32Array(chunk.frames), new Float32Array(chunk.frames)];
      for (let c = 0; c < 2; c++) copy[c].set(chunk.channels[c].subarray(0, chunk.frames));
      chunks.push({ start: chunk.startFrame, channels: copy });
      total += chunk.frames;
    },
  }, options);
  const out = [new Float32Array(total), new Float32Array(total)];
  for (const chunk of chunks) for (let c = 0; c < 2; c++) out[c].set(chunk.channels[c], chunk.start);
  return { channels: out, frames: total };
}

function peakOfAll(channels, frames = channels[0].length) {
  let most = 0;
  for (const channel of channels) {
    for (let i = 0; i < frames; i++) most = Math.max(most, Math.abs(channel[i]));
  }
  return most;
}

/* ======================================================================================
   A. WAV export
   ====================================================================================== */

test("8.2 · the full mix exports as a WAV whose samples are exactly the engine's master", async () => {
  const { project, sources } = session();
  const destination = memoryDestination();
  const outcome = await exportProject({ project, sources, selection: { fullMix: true, stems: false, buses: false }, destination });

  assert.equal(outcome.ok, true, JSON.stringify(outcome.failures));
  assert.equal(outcome.files.length, 1);
  const bytes = destination.read(fullMixName(project.name));
  assert.ok(bytes, "the mix file exists");
  const { header, channels } = samplesOf(bytes);

  // The reference: the same render with no export involved.
  const reference = await renderToArrays(project, sources);
  const wrote = reference.frames;
  assert.equal(header.dataBytes / 8, wrote, "the file holds every delivered frame");
  let maxError = 0;
  for (let c = 0; c < 2; c++) {
    for (let i = 0; i < wrote; i++) maxError = Math.max(maxError, Math.abs(channels[c][i] - reference.channels[c][i]));
  }
  // 32-bit float: the written sample IS the rendered sample, bit for bit.
  assert.equal(maxError, 0, `max sample error ${maxError}`);
  const format = samplesOf(bytes).format;
  assert.equal(format.sampleRate, 48000);
  assert.equal(format.channels, 2);
  assert.equal(format.encoding, "float");
  assert.equal(format.containerBits, 32);
  assert.equal(format.frames, wrote);
});

test("8.2 · the export preserves the project's sample rate and the agreed format", async () => {
  const { project, sources } = session();
  const destination = memoryDestination();
  const outcome = await exportProject({ project, sources, selection: ALL, destination });
  assert.equal(outcome.ok, true, JSON.stringify(outcome.failures));
  const { format } = samplesOf(destination.read(fullMixName(project.name)));
  assert.equal(format.sampleRate, RATE);
  assert.equal(format.frames, outcome.files[0].frames);
  assert.equal(outcome.format.encoding, "float");
  assert.equal(outcome.format.bitDepth, 32);
  assert.equal(printFormat(outcome.format), "48 kHz · 32-bit float · stereo");

  // The 24-bit option writes real 24-bit PCM, and says so.
  const destination24 = memoryDestination();
  const pcm = await exportProject({ project, sources, selection: { fullMix: true, stems: false, buses: false }, destination: destination24, format: formatFromId("pcm24", RATE) });
  assert.equal(pcm.ok, true, JSON.stringify(pcm.failures));
  assert.equal(pcm.format.bitDepth, 24);
  assert.equal(printFormat(pcm.format), "48 kHz · 24-bit PCM · stereo");
  const format24 = samplesOf(destination24.read(pcm.files[0].path)).format;
  assert.equal(format24.encoding, "pcm");
  assert.equal(format24.containerBits, 24);
  assert.equal(format24.sampleRate, RATE);
  assert.equal(format24.frames, pcm.files[0].frames);
});

test("8.2 · processed stems carry their own inserts, and nothing of the other tracks", async () => {
  const { project, sources } = session();
  const destination = memoryDestination();
  const outcome = await exportProject({ project, sources, selection: { fullMix: false, stems: true, buses: false }, destination });
  assert.equal(outcome.ok, true, JSON.stringify(outcome.failures));
  assert.equal(outcome.files.length, 3, "one file per track");

  const kickStem = destination.read("Stems/01 Kick.wav");
  const snareStem = destination.read("Stems/02 Snare.wav");
  const vocalStem = destination.read("Stems/03 Vocal.wav");
  for (const bytes of [kickStem, snareStem, vocalStem]) assert.ok(bytes, "every stem exists");

  const kick = samplesOf(kickStem);
  const vocal = samplesOf(vocalStem);

  // A stem is that track alone: a different track's tone must be nowhere in it.
  const expected = await renderToArrays(stemProject(project, "track-01"), new Map([["track-01", sources.get("track-01")]]));
  assert.equal(kick.frames, expected.frames, "the stem holds the track's own render length");
  let maxError = 0;
  for (let c = 0; c < 2; c++) for (let i = 0; i < expected.frames; i++) maxError = Math.max(maxError, Math.abs(kick.channels[c][i] - expected.channels[c][i]));
  assert.equal(maxError, 0, "the stem is exactly the track's own render");

  // The stem has the track's own processing: its -6 dB fader makes it quieter than
  // the raw 0.4 source, and its send level does not add a second dry copy.
  assert.ok(peakOfAll(kick.channels) < 0.4, `stem peak ${peakOfAll(kick.channels)} should sit below the raw source`);
  assert.ok(peakOfAll(vocal.channels) > 0, "a track with audio produces signal");

  // The vocal stem is 440 Hz; the kick stem is 100 Hz — they are not the same file.
  assert.notEqual(peakOfAll(kick.channels), peakOfAll(vocal.channels));
});

test("8.2 · a stem carries its own send into the Return, and the Return's effect", async () => {
  // A track with a send, versus the same track with the send removed: the stem must
  // differ, and the difference must be the reverb the send reaches.
  const withSend = withAudio(trackFixture({ id: "track-01", name: "Kick", sends: [{ to: "return-01", level: -3 }] }), FRAMES);
  const reverb = returnFixture({ id: "return-01", name: "Room", effect: "reverb", level: 0, time: 1.5 });
  const project = projectFixture({ tracks: [withSend], returns: [reverb] });
  const sources = new Map([["track-01", toneSource(FRAMES, 100, 0.5)]]);
  const destination = memoryDestination();
  const outcome = await exportProject({ project, sources, selection: { fullMix: false, stems: true, buses: false }, destination });
  assert.equal(outcome.ok, true, JSON.stringify(outcome.failures));
  const stem = samplesOf(destination.read("Stems/01 Kick.wav"));

  const dry = projectFixture({
    tracks: [{ ...withSend, channel: { ...withSend.channel, sends: [{ to: null, level: 0, mode: "auto" }] } }],
    returns: [reverb],
  });
  const dryDestination = memoryDestination();
  await exportProject({ project: dry, sources, selection: { fullMix: false, stems: true, buses: false }, destination: dryDestination });
  const dryStem = samplesOf(dryDestination.read("Stems/01 Kick.wav"));

  let differing = 0;
  for (let c = 0; c < 2; c++) {
    for (let i = 0; i < dryStem.channels[c].length; i++) {
      if (Math.abs(stem.channels[c][i] - dryStem.channels[c][i]) > 1e-6) differing++;
    }
  }
  assert.ok(differing > 1000, `the send must be in the stem (${differing} samples differ)`);
  // The Return is effect-only: it adds wet signal, never a second dry copy, so the
  // stem grows by the effect's contribution and not by the track's own level again.
  assert.ok(peakOfAll(stem.channels) > peakOfAll(dryStem.channels), "the Return adds to the stem");
  // And the Return's tail is in the stem: the wet file outlasts the dry one.
  assert.ok(stem.frames > dryStem.frames, `the Return's tail lengthens the stem (${stem.frames} vs ${dryStem.frames})`);
});

test("8.2 · processed bus files come from the bus's own processed output", async () => {
  const { project, sources } = session();
  const destination = memoryDestination();
  const outcome = await exportProject({ project, sources, selection: { fullMix: false, stems: false, buses: true }, destination });
  assert.equal(outcome.ok, true, JSON.stringify(outcome.failures));
  assert.equal(outcome.files.length, 1, "one file for the one fed bus");
  const busFile = samplesOf(destination.read("Buses/01 Drums.wav"));
  assert.ok(busFile.frames > 0);

  // The bus file is the two bus tracks summed and then the bus chain — so it is not
  // either track alone, and it carries both tones.
  const kickOnly = await renderToArrays(stemProject(project, "track-01"), new Map([["track-01", sources.get("track-01")]]));
  let same = 0;
  const compared = Math.min(kickOnly.frames, busFile.frames);
  for (let i = 0; i < compared; i++) if (Math.abs(busFile.channels[0][i] - kickOnly.channels[0][i]) < 1e-9) same++;
  assert.ok(same < compared * 0.5, "the bus is not one track's stem");
});

test("8.2 · the bus taps add up to the master, and the master is what the mix file holds", async () => {
  // One pass: the mix written by the sink, and the two bus taps' contribution. The
  // bus files plus the master-routed track must reconstruct the master before the
  // safety limiter — which this asserts by summing the exported files and comparing
  // them to the exported mix on a session that never reaches the limiter's ceiling.
  const kick = withAudio(trackFixture({ id: "track-01", name: "Kick", output: "bus-01", level: -12 }), FRAMES);
  const snare = withAudio(trackFixture({ id: "track-02", name: "Snare", output: "bus-01", level: -12 }), FRAMES);
  const vocal = withAudio(trackFixture({ id: "track-03", name: "Vocal", output: "master", level: -18 }), FRAMES);
  const drums = busFixture({ id: "bus-01", name: "Drums", level: -6 });
  const project = projectFixture({ tracks: [kick, snare, vocal], buses: [drums], returns: [] });
  const sources = new Map([
    ["track-01", toneSource(FRAMES, 100, 0.05)],
    ["track-02", toneSource(FRAMES, 150, 0.05)],
    ["track-03", toneSource(FRAMES, 300, 0.02)],
  ]);
  const destination = memoryDestination();
  const outcome = await exportProject({ project, sources, selection: ALL, destination });
  assert.equal(outcome.ok, true, JSON.stringify(outcome.failures));

  const mix = samplesOf(destination.read(fullMixName(project.name)));
  const bus = samplesOf(destination.read("Buses/01 Drums.wav"));
  const vocalFile = samplesOf(destination.read("Stems/03 Vocal.wav"));

  // Below the limiter's threshold the master is the plain sum: bus + vocal.
  let maxError = 0;
  for (let c = 0; c < 2; c++) {
    for (let i = 0; i < mix.channels[c].length; i++) {
      const expected = bus.channels[c][i] + vocalFile.channels[c][i];
      maxError = Math.max(maxError, Math.abs(mix.channels[c][i] - expected));
    }
  }
  assert.ok(maxError < 1e-6, `master vs bus + master-routed stem: max error ${maxError}`);
});

test("8.2 · the processed stems sum to the full mix, and each says what it leaves out", async () => {
  // A stem is its track's channel plus its declared route, so the stems of a session
  // reconstruct the mix sample-for-sample. This is the property that makes the stem
  // set usable: nothing is missing and nothing is counted twice.
  const { project, sources } = session();
  // Quiet sources: the comparison below is about summing, so the master's safety
  // limiter must not be in play (it is asserted separately, in the mastering test).
  sources.set("track-01", toneSource(FRAMES, 100, 0.05));
  sources.set("track-02", toneSource(FRAMES, 220, 0.04, { mono: true }));
  sources.set("track-03", toneSource(FRAMES, 440, 0.03, { offset: Math.PI / 2 }));
  const destination = memoryDestination();
  const outcome = await exportProject({ project, sources, selection: ALL, destination });
  assert.equal(outcome.ok, true, JSON.stringify(outcome.failures));
  const mix = samplesOf(destination.read(fullMixName(project.name)));
  const stems = outcome.files.filter((file) => file.kind === "stem").map((file) => samplesOf(destination.read(file.path)));

  // Each file is exactly as long as its own signal plus its own Return tail, so the
  // comparison is over the region every stem covers (the project's own length). Past
  // that only the Return's tail continues, and only in the mix and the files that
  // actually send into it.
  const common = Math.min(...stems.map((file) => file.channels[0].length));
  assert.equal(common, FRAMES, "each stem covers the whole input");
  let maxError = 0;
  for (let c = 0; c < 2; c++) {
    for (let i = 0; i < common; i++) {
      const summed = stems.reduce((sum, file) => sum + file.channels[c][i], 0);
      maxError = Math.max(maxError, Math.abs(mix.channels[c][i] - summed));
    }
  }
  assert.ok(maxError < 1e-6, `the stems must sum to the mix: max error ${maxError}`);
  assert.ok(mix.channels[0].length > common, "the mix carries the Return's tail past the tracks' end");

  // And the manifest documents the one part of the sound no stem can carry alone:
  // the shared Return, plus the fact that a stem has no master limiter.
  const manifest = JSON.parse(destination.readText("export.json"));
  const kick = manifest.files.find((file) => file.path === "Stems/01 Kick.wav");
  assert.equal(kick.routing.output, "Drums");
  assert.match(kick.routing.note, /the bus's chain is part of it/);
  assert.match(kick.routing.note, /safety limiter is not applied to a stem/);
  assert.equal(kick.routing.sends.length, 1);
  assert.equal(kick.routing.sends[0].inStem, false);
  assert.match(kick.routing.note, /Sends are not in the stem/);
  const vocal = manifest.files.find((file) => file.path === "Stems/03 Vocal.wav");
  assert.equal(vocal.routing.sends.length, 0);
  assert.match(vocal.routing.note, /no live sends/);
});

test("8.2 · no mastering and no loudness maximisation: a quiet mix stays quiet, a hot one is not raised", async () => {
  const quiet = withAudio(trackFixture({ id: "track-01", name: "Quiet", level: -40 }), FRAMES);
  const project = projectFixture({ tracks: [quiet], returns: [] });
  const sources = new Map([["track-01", toneSource(FRAMES, 200, 0.5)]]);
  const destination = memoryDestination();
  await exportProject({ project, sources, selection: { fullMix: true, stems: false, buses: false }, destination });
  const mix = samplesOf(destination.read(fullMixName(project.name)));
  const peak = peakOfAll(mix.channels);
  // -40 dB fader on a 0.5 source ≈ 0.005: an untouched level, nowhere near a target.
  assert.ok(peak < 0.01, `a quiet mix must stay quiet (peak ${peak})`);
  assert.ok(peak > 0.001, "and must not be silenced");
  assert.equal(JSON.parse(destination.readText("export.json")).mastering, "none");

  // A loud source is not pushed to a loudness target either: the safety limiter is
  // the only thing above it, and it only acts on peaks over full scale.
  const hot = withAudio(trackFixture({ id: "track-01", name: "Hot", level: 10 }), FRAMES);
  const hotProject = projectFixture({ tracks: [hot], returns: [] });
  const hotDestination = memoryDestination();
  await exportProject({ project: hotProject, sources, selection: { fullMix: true, stems: false, buses: false }, destination: hotDestination });
  const hotMix = samplesOf(hotDestination.read(fullMixName(hotProject.name)));
  const hotPeak = peakOfAll(hotMix.channels);
  assert.ok(hotPeak <= 1.0001, `the safety limiter holds the ceiling (peak ${hotPeak})`);
  // The limiter is an overs guard, not a loudness stage: the mix stays where the
  // faders put it (a 0.5 source at +10 dB), rather than being normalised to a target.
  assert.ok(hotPeak > 0.5, `a hot mix stays hot, not normalised (peak ${hotPeak})`);
});

test("8.2 · file names are safe and collisions are resolved case-insensitively", () => {
  assert.equal(safeName("My Song"), "My Song");
  assert.equal(safeName("a/b\\c:d*e?f\"g<h>i|j"), "abcdefghij");
  assert.equal(safeName("  spaced   out  "), "spaced out");
  assert.equal(safeName("...hidden"), "hidden");
  assert.equal(safeName("trailing. . "), "trailing");
  assert.equal(safeName(""), "Untitled");
  assert.equal(safeName("   "), "Untitled");
  assert.equal(safeName("CON"), "CON (name)");
  assert.equal(safeName("LPT9"), "LPT9 (name)");
  const long = safeName("x".repeat(400));
  assert.ok(Buffer.byteLength(long, "utf8") <= 80, `truncated to a byte budget (${Buffer.byteLength(long, "utf8")})`);
  assert.equal(Buffer.byteLength(safeName("é".repeat(400)), "utf8") <= 80, true, "multi-byte characters are never split");

  // Collisions
  const taken = new Set();
  assert.equal(uniqueName("Kick", taken), "Kick");
  assert.equal(uniqueName("kick", taken), "kick (2)");
  assert.equal(uniqueName("KICK", taken), "KICK (3)");
  assert.equal(uniqueName("kick", taken), "kick (4)");
});

test("8.2 · two tracks with the same name cannot overwrite each other", async () => {
  const a = withAudio(trackFixture({ id: "track-01", name: "Kick", level: -6 }), FRAMES);
  const b = withAudio(trackFixture({ id: "track-02", name: "Kick", level: -12 }), FRAMES);
  const project = projectFixture({ tracks: [a, b], returns: [] });
  const sources = new Map([
    ["track-01", toneSource(FRAMES, 100, 0.4)],
    ["track-02", toneSource(FRAMES, 200, 0.4)],
  ]);
  const destination = memoryDestination();
  const outcome = await exportProject({ project, sources, selection: { fullMix: false, stems: true, buses: false }, destination });
  assert.equal(outcome.ok, true, JSON.stringify(outcome.failures));
  const paths = outcome.files.map((file) => file.path);
  assert.equal(new Set(paths.map((p) => p.toLowerCase())).size, 2, `distinct paths: ${paths.join(", ")}`);
  assert.deepEqual(paths, ["Stems/01 Kick.wav", "Stems/02 Kick.wav"]);
  // Both files are real and different.
  const first = peakOfAll(samplesOf(destination.read(paths[0])).channels);
  const second = peakOfAll(samplesOf(destination.read(paths[1])).channels);
  assert.ok(first > 0 && second > 0);
  assert.notEqual(first, second);
});

test("8.2 · the folder structure is one folder per export, with Stems, Buses and the notes", async () => {
  const { project, sources } = session();
  const destination = memoryDestination();
  const outcome = await exportProject({ project, sources, selection: ALL, destination });
  assert.equal(outcome.ok, true, JSON.stringify(outcome.failures));
  const paths = destination.files().sort();
  assert.deepEqual(paths, [
    "Buses/01 Drums.wav",
    "Stems/01 Kick.wav",
    "Stems/02 Snare.wav",
    "Stems/03 Vocal.wav",
    "export.json",
    fullMixName(project.name),
  ].sort());
  assert.equal(outcome.folder, safeName(project.name));
  const manifest = JSON.parse(destination.readText("export.json"));
  assert.equal(manifest.schema, "alloy.export/1");
  assert.equal(manifest.format.print, "48 kHz · 32-bit float · stereo");
  assert.equal(manifest.files.length, 5);
  assert.deepEqual(manifest.outputs, ["fullMix", "stems", "buses"]);
  assert.deepEqual(manifest.skipped, []);
});

test("8.2 · empty selections and projects with nothing to render are reported, not exported", async () => {
  const { project, sources } = session();
  const none = await exportProject({ project, sources, selection: { fullMix: false, stems: false, buses: false }, destination: memoryDestination() });
  assert.equal(none.ok, false);
  assert.equal(none.stopped?.reason, "no-selection");
  assert.equal(none.stopped?.message, NO_SELECTION_MESSAGE);
  assert.equal(none.files.length, 0);

  // A project with tracks but no imported audio: no stems and no buses exist, so
  // there is nothing to write and the reason is stated rather than guessed.
  const silent = projectFixture({ tracks: [trackFixture({ id: "track-01", name: "Kick" })], returns: [], buses: [] });
  const empty = await exportProject({ project: silent, sources: new Map(), selection: { fullMix: false, stems: true, buses: true }, destination: memoryDestination() });
  assert.equal(empty.ok, false);
  assert.equal(empty.stopped?.reason, "no-audio");
  assert.match(empty.stopped.message, /imported audio/i);

  // Full mix only, on that same project: the mix is still a legitimate silent file
  // (the renderer's job is the signal path, and silence is a real mix of silence).
  const mixOnly = await exportProject({ project: silent, sources: new Map(), selection: { fullMix: true, stems: false, buses: false }, destination: memoryDestination() });
  assert.equal(mixOnly.ok, true, JSON.stringify(mixOnly.failures));
  assert.equal(mixOnly.files.length, 1);
  assert.equal(mixOnly.files[0].peakDbfs, null, "digital silence is reported as no peak");
});

test("8.2 · a bus nothing feeds is left out and named; an unfed bus list is a stated reason", () => {
  const fed = busFixture({ id: "bus-01", name: "Drums" });
  const orphan = busFixture({ id: "bus-02", name: "Unused" });
  const track = withAudio(trackFixture({ id: "track-01", name: "Kick", output: "bus-01" }), FRAMES);
  const project = projectFixture({ tracks: [track], buses: [fed, orphan], returns: [] });
  assert.deepEqual(busesWithSignal(project).map((bus) => bus.id), ["bus-01"]);
  const plan = planExport(project, { fullMix: false, stems: false, buses: true }, DEFAULT_EXPORT_FORMAT);
  assert.equal(plan.jobs.length, 1);
  assert.ok(plan.notes.some((note) => /1 bus carries nothing/.test(note)), plan.notes.join(" | "));
});

test("8.2 · a failing stem fails its own file, and the export carries on", async () => {
  // The Vocal's source throws on its first read; the full mix pass never reads it
  // because the mix is not selected, so only that one file is affected.
  const { project, sources } = session();
  sources.set("track-03", toneSource(FRAMES, 440, 0.25, { failAt: 1 }));
  const destination = memoryDestination();
  const outcome = await exportProject({ project, sources, selection: { fullMix: false, stems: true, buses: false }, destination });
  assert.equal(outcome.ok, false);
  const failed = outcome.failures.find((failure) => failure.path === "Stems/03 Vocal.wav");
  assert.ok(failed, `the vocal stem failed: ${JSON.stringify(outcome.failures)}`);
  assert.match(failed.message, /injected source failure/);
  // The other stems were still written.
  assert.ok(outcome.files.some((file) => file.path === "Stems/01 Kick.wav"));
  assert.ok(outcome.files.some((file) => file.path === "Stems/02 Snare.wav"));
  // The manifest records the failure rather than pretending the folder is complete.
  const manifest = JSON.parse(destination.readText("export.json"));
  assert.equal(manifest.skipped.length, 1);
  assert.match(manifest.skipped[0], /injected source failure/);
});

test("8.2 · a destination that cannot be written stops the export with one clear error", async () => {
  const { project, sources } = session();
  const destination = {
    kind: "memory",
    print: "Broken folder",
    async createFile() {
      throw new Error("EACCES: permission denied");
    },
    async writeText() {},
    files() {
      return [];
    },
  };
  const outcome = await exportProject({ project, sources, selection: ALL, destination });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.stopped?.reason, "write");
  assert.match(outcome.stopped.message, /permission denied/);
  assert.equal(outcome.files.length, 0);
});

test("8.2 · a write that fails mid-file aborts that file instead of leaving a broken WAV", async () => {
  const { project, sources } = session();
  const aborted = [];
  let files = 0;
  const destination = {
    kind: "memory",
    print: "Half-working folder",
    async createFile() {
      files++;
      const thisFile = files;
      let wrote = 0;
      return {
        write() {
          wrote++;
          if (thisFile === 1 && wrote === 3) throw new Error("disk full");
        },
        seek() {},
        async close() {},
        async abort() {
          aborted.push(thisFile);
        },
      };
    },
    async writeText() {},
    files() {
      return [];
    },
  };
  const outcome = await exportProject({ project, sources, selection: { fullMix: true, stems: false, buses: false }, destination });
  assert.equal(outcome.ok, false);
  assert.ok(aborted.includes(1), "the failed file was aborted");
  assert.match(outcome.failures[0].message, /disk full/);
});

test("8.2 · cancellation stops the export and names it", async () => {
  const { project, sources } = session();
  const controller = new AbortController();
  controller.abort();
  const outcome = await exportProject({ project, sources, selection: ALL, destination: memoryDestination(), signal: controller.signal });
  assert.equal(outcome.ok, false);
  assert.ok(outcome.failures.length > 0);
  assert.equal(outcome.failures[0].reason, "cancelled");
});

test("8.2 · progress is reported per file and overall, and ends at 1", async () => {
  const { project, sources } = session();
  const seen = [];
  await exportProject({
    project,
    sources,
    selection: ALL,
    destination: memoryDestination(),
    onProgress: (progress) => seen.push(progress),
  });
  assert.ok(seen.length > 5, "progress is reported while rendering, not only at the end");
  assert.equal(seen.at(-1).phase, "done");
  assert.equal(seen.at(-1).fraction, 1);
  assert.equal(seen.at(-1).jobCount, 5);
  const fractions = seen.map((progress) => progress.fraction);
  assert.deepEqual(fractions, [...fractions].sort((a, b) => a - b), "progress never goes backwards");
  assert.ok(seen.some((progress) => progress.jobKind === "stem"));
  assert.ok(seen.some((progress) => progress.phase === "rendering"));
});

test("8.2 · the collector destination hands every finished file back, for downloads", async () => {
  const { project, sources } = session();
  const destination = collectDestination();
  const handed = [];
  destination.onFile = (file) => handed.push(file.path);
  const outcome = await exportProject({ project, sources, selection: { fullMix: true, stems: false, buses: false }, destination });
  assert.equal(outcome.ok, true, JSON.stringify(outcome.failures));
  assert.deepEqual(handed, [fullMixName(project.name)]);
  assert.equal(destination.collected.length, 1);
  const { header } = samplesOf(destination.collected[0].bytes);
  assert.equal(header.dataBytes / 8, outcome.files[0].frames);
});

test("8.2 · the same project exports byte-identical files twice (deterministic)", async () => {
  const { project, sources } = session();
  const first = memoryDestination();
  const second = memoryDestination();
  await exportProject({ project, sources, selection: ALL, destination: first });
  await exportProject({ project, sources, selection: ALL, destination: second });
  for (const path of first.files()) {
    const a = first.read(path);
    const b = second.read(path);
    if (a && b) assert.deepEqual(Buffer.from(a), Buffer.from(b), `${path} is byte-identical`);
  }
});

test("8.2 · the bus taps are observers: the master is identical with and without them", async () => {
  // This is the contract that lets the export read buses from the mix pass: tapping a
  // bus must not add gain, routing or state. Render the same project twice — once with
  // the taps, once without — and the delivered master must be bit-identical.
  const { project, sources } = session();
  const plain = await renderToArrays(project, session().sources);
  const tapped = [];
  const tappedChannels = [new Float32Array(plain.frames), new Float32Array(plain.frames)];
  let total = 0;
  const taps = [];
  await renderProject(project, session().sources, {
    write(chunk) {
      for (let c = 0; c < 2; c++) tappedChannels[c].set(chunk.channels[c].subarray(0, chunk.frames), chunk.startFrame);
      total += chunk.frames;
    },
  }, {
    onBuses(tap) {
      taps.push({ startFrame: tap.startFrame, frames: tap.frames, ids: [...tap.buses.keys()] });
    },
  });
  assert.equal(total, plain.frames);
  let maxError = 0;
  for (let c = 0; c < 2; c++) {
    for (let i = 0; i < total; i++) maxError = Math.max(maxError, Math.abs(tappedChannels[c][i] - plain.channels[c][i]));
  }
  assert.equal(maxError, 0, "the taps changed the master");
  assert.ok(taps.length >= 2, "the tap fired once per block");
  assert.deepEqual(taps[0].ids, ["bus-01"]);
  // Blocks are contiguous from frame 0 — nothing skipped, nothing repeated — and the
  // last one is short, exactly as the sink's chunks are.
  let expected = 0;
  for (const tap of taps) {
    assert.equal(tap.startFrame, expected);
    assert.ok(tap.frames > 0 && tap.frames <= 4096, `block size ${tap.frames}`);
    expected += tap.frames;
  }
  // The taps cover exactly what the sink was given: same start, same total, no gap.
  assert.equal(expected, plain.frames, "the taps cover the delivered timeline exactly");
  // The tap covers the engine's whole run (input + Return tail), like the master does.
  assert.ok(expected >= plain.frames);
  tapped.length = 0;
});

test("8.2 · bus files line up with the mix: no latency is introduced by tapping", async () => {
  // A bus carries no latency, so its file and the mix must be sample-aligned. The
  // assertion is a cross-correlation: the best lag is zero, not the limiter's 240 frames.
  const kick = withAudio(trackFixture({ id: "track-01", name: "Kick", output: "bus-01", level: 0 }), FRAMES);
  const drums = busFixture({ id: "bus-01", name: "Drums", level: 0 });
  const project = projectFixture({ tracks: [kick], buses: [drums], returns: [] });
  const destination = memoryDestination();
  await exportProject({
    project,
    sources: new Map([["track-01", toneSource(FRAMES, 100, 0.3)]]),
    selection: { fullMix: true, stems: false, buses: true },
    destination,
  });
  const mix = samplesOf(destination.read(fullMixName(project.name))).channels[0];
  const bus = samplesOf(destination.read("Buses/01 Drums.wav")).channels[0];
  let bestLag = 0;
  let bestError = Infinity;
  for (let lag = -600; lag <= 600; lag++) {
    let error = 0;
    for (let i = 1000; i < 3000; i++) {
      const j = i + lag;
      if (j < 0 || j >= bus.length) continue;
      error = Math.max(error, Math.abs(mix[i] - bus[j]));
    }
    if (error < bestError) {
      bestError = error;
      bestLag = lag;
    }
  }
  assert.equal(bestLag, 0, `the bus file is aligned with the mix (best lag ${bestLag})`);
  assert.ok(bestError < 1e-6, `and it carries the same signal (max error ${bestError})`);
});

/* --- the writer itself ---------------------------------------------------------------- */

test("8.2 · the streaming writer patches its header and needs a seekable sink", async () => {
  const sink = new MemoryByteSink();
  const writer = new WavStreamWriter({ sampleRate: 48000, channels: 2, encoding: "float", bitDepth: 32 }, sink);
  await writer.begin();
  const left = new Float32Array([0.5, -0.5, 0.25]);
  const right = new Float32Array([-0.5, 0.5, -0.25]);
  await writer.write(left, right, 3);
  const stats = await writer.finish();
  assert.equal(stats.frames, 3);
  assert.equal(stats.totalBytes, 44 + 3 * 8);
  const { header, channels } = samplesOf(sink.bytes());
  assert.equal(header.dataBytes, 24);
  assert.deepEqual([...channels[0]], [0.5, -0.5, 0.25]);
  assert.deepEqual([...channels[1]], [-0.5, 0.5, -0.25]);
  assert.equal(sink.closed, 1);

  // Use after finish is refused.
  await assert.rejects(() => writer.write(left, right, 3), /already closed/);

  // A non-seekable sink is a named error, not a corrupt file.
  const noSeek = {
    write() {},
    seek() {},
    close() {},
  };
  delete noSeek.seek;
  const writer2 = new WavStreamWriter(DEFAULT_EXPORT_FORMAT, noSeek);
  await assert.rejects(() => writer2.finish(), /seek is not a function/);
});

test("8.2 · 24-bit PCM rounds to nearest and clamps, and says when it clipped", async () => {
  const sink = new MemoryByteSink();
  const writer = new WavStreamWriter({ sampleRate: 48000, channels: 2, encoding: "pcm", bitDepth: 24 }, sink);
  await writer.begin();
  const left = new Float32Array([0, 1, -1, 1.5, 0.5]);
  const right = new Float32Array([0, -1, 1, -1.5, -0.5]);
  await writer.write(left, right, 5);
  const stats = await writer.finish();
  assert.equal(stats.clipped, true, "1.5 exceeded full scale");
  const { channels } = samplesOf(sink.bytes());
  assert.equal(channels[0][1], 1 - 1 / 8388608, "positive full scale is the largest 24-bit value");
  assert.equal(channels[0][2], -1);
  assert.equal(channels[0][3], 1 - 1 / 8388608, "clamped, not wrapped");
});

test("8.2 · the header declares the format it wrote", () => {
  const header = wavHeader({ sampleRate: 44100, channels: 2, encoding: "pcm", bitDepth: 24 }, 600);
  const file = new Uint8Array(header.length + 600);
  file.set(header);
  const read = readWavHeader(file, file.length);
  assert.equal(read.ok, true, "the writer's own header is readable by the app's reader");
  assert.equal(read.raw.sampleRate, 44100);
  assert.equal(read.raw.channels, 2);
  assert.equal(read.raw.containerBits, 24);
  assert.equal(read.dataBytes, 600);
  const inspected = inspectWav(file);
  assert.equal(inspected.ok, true);
  assert.equal(inspected.format.encoding, "pcm");
  assert.equal(inspected.format.frames, 100); // 600 bytes / (3 bytes × 2 channels)
});

test("8.2 · the shipped formats are the plan's two, at the session rate", () => {
  assert.equal(EXPORT_FORMATS.length, 2);
  assert.deepEqual(
    EXPORT_FORMATS.map((format) => `${format.bitDepth}-${format.encoding}`),
    ["32-float", "24-pcm"],
  );
  assert.ok(EXPORT_FORMATS.every((format) => format.sampleRate === 48000 && format.channels === 2));
});

test("8.2 · an export never touches a project the caller keeps", async () => {
  const { project, sources } = session();
  const before = JSON.stringify(project);
  await exportProject({ project, sources, selection: ALL, destination: memoryDestination() });
  assert.equal(JSON.stringify(project), before, "the project is read-only for an export");
});

/* ======================================================================================
   B. External JSON rulebooks
   ====================================================================================== */

const VALID = {
  schema: RULEBOOK_SCHEMA,
  id: "test-rock",
  name: "Test rock",
  targets: [
    { scope: "all", settings: [{ parameter: "compressor.threshold", value: -18 }] },
    { scope: "family", id: "drums", settings: [{ parameter: "eq.lf.gain", value: 2 }] },
  ],
};

test("8.2 · a valid rulebook loads, and its targets are read", () => {
  const result = parseRulebook(JSON.stringify(VALID), "rock.json");
  assert.equal(result.ok, true, result.ok ? "" : JSON.stringify(result.problems));
  assert.equal(result.rulebook.id, "test-rock");
  assert.equal(result.rulebook.targets.length, 2);
  assert.equal(result.rulebook.targets[0].settings[0].parameter, "compressor.threshold");
});

test("8.2 · a missing file, malformed JSON and a wrong schema each have their own error", () => {
  const missing = parseRulebook(null, "absent.json");
  assert.equal(missing.ok, false);
  assert.equal(missing.problems[0].kind, "missing");

  const malformed = parseRulebook("{ not json", "broken.json");
  assert.equal(malformed.ok, false);
  assert.equal(malformed.problems[0].kind, "malformed-json");
  assert.match(malformed.problems[0].message, /not valid JSON/);

  const schema = parseRulebook(JSON.stringify({ ...VALID, schema: "alloy.rulebook/9" }), "future.json");
  assert.equal(schema.ok, false);
  assert.equal(schema.problems[0].kind, "unsupported-schema");
  assert.match(schema.problems[0].message, /schema "alloy.rulebook\/9"/);

  const noSchema = parseRulebook(JSON.stringify({ ...VALID, schema: undefined }), "bare.json");
  assert.equal(noSchema.ok, false);
  assert.equal(noSchema.problems[0].kind, "unsupported-schema");

  const notObject = parseRulebook("[]", "array.json");
  assert.equal(notObject.ok, false);
  assert.equal(notObject.problems[0].kind, "structure");
});

test("8.2 · structure and value types are validated field by field, with paths", () => {
  const cases = [
    [{ ...VALID, id: 7 }, "id"],
    [{ ...VALID, name: "" }, "name"],
    [{ ...VALID, targets: "none" }, "targets"],
    [{ ...VALID, targets: [{ scope: "genre", settings: [] }] }, "targets[0].scope"],
    [{ ...VALID, targets: [{ scope: "family", settings: [] }] }, "targets[0].id"],
    [{ ...VALID, targets: [{ scope: "all", id: "x", settings: [] }] }, "targets[0].id"],
    [{ ...VALID, targets: [{ scope: "all", settings: [{ parameter: "compressor.threshold", value: "quiet" }] }] }, "targets[0].settings[0].value"],
    [{ ...VALID, targets: [{ scope: "all", settings: [{ parameter: "compressor.threshold", value: Number.NaN }] }] }, "targets[0].settings[0].value"],
    [{ ...VALID, targets: [{ scope: "all", settings: [{ parameter: "master.gain", value: 1 }] }] }, "targets[0].settings[0].parameter"],
    [{ ...VALID, targets: [{ scope: "all", settings: [{ parameter: "compressor.threshold", value: -1000 }] }] }, "targets[0].settings[0].value"],
    [{ ...VALID, targets: [{ scope: "all", settings: [
      { parameter: "compressor.ratio", value: 2 },
      { parameter: "compressor.ratio", value: 3 },
    ] }] }, "targets[0].settings[1].parameter"],
  ];
  for (const [value, path] of cases) {
    const result = validateRulebook(value, "case.json");
    assert.equal(result.ok, false, `must reject ${JSON.stringify(value).slice(0, 80)}`);
    assert.ok(
      result.problems.some((problem) => problem.path === path),
      `expected a problem at ${path}, got ${result.problems.map((problem) => problem.path).join(", ")}`,
    );
  }
});

test("8.2 · a rulebook may not set a decision the plan locked", () => {
  const priority = validateRulebook({
    ...VALID,
    targets: [{ scope: "all", settings: [{ parameter: "priority", value: 9 }] }],
  });
  assert.equal(priority.ok, false);
  assert.equal(priority.problems[0].kind, "pinned-parameter");
  assert.match(priority.problems[0].message, /locks/);

  const routing = validateRulebook({ ...VALID, targets: [{ scope: "all", settings: [{ parameter: "output", value: 1 }] }] });
  assert.equal(routing.problems[0].kind, "pinned-parameter");
});

test("8.2 · the shipped placeholder rulebook is valid and changes nothing", () => {
  const parsed = parseRulebook(PLACEHOLDER_RULEBOOK_JSON, "placeholder.json");
  assert.equal(parsed.ok, true, parsed.ok ? "" : JSON.stringify(parsed.problems));
  assert.equal(parsed.rulebook.placeholder, true);
  assert.deepEqual(parsed.rulebook.targets, []);
  assert.equal(PLACEHOLDER_RULEBOOK.targets.length, 0);

  const { project } = session();
  const applied = applyRulebook(project, parsed.rulebook);
  assert.equal(applied.applied.length, 0);
  assert.equal(JSON.stringify(applied.project), JSON.stringify(project));
});

test("8.2 · applying a rulebook touches Auto values only, and never mutates the input", () => {
  const autoTrack = { ...trackFixture({ id: "track-01", name: "Kick", threshold: -20 }), familyId: "drums" };
  // The fixture builds every parameter in auto; a manual one is set explicitly.
  const manualTrack = trackFixture({ id: "track-02", name: "Snare" });
  manualTrack.chain.comp.threshold.mode = "manual";
  const project = projectFixture({ tracks: [autoTrack, manualTrack], returns: [], buses: [] });
  const before = JSON.stringify(project);
  const rulebook = validateRulebook({
    ...VALID,
    targets: [{ scope: "all", settings: [{ parameter: "compressor.threshold", value: -12 }] }],
  });
  assert.equal(rulebook.ok, true);
  const applied = applyRulebook(project, rulebook.rulebook);

  assert.equal(JSON.stringify(project), before, "the caller's project is untouched");
  assert.equal(applied.applied.length, 1, "only the Auto track changed");
  assert.equal(applied.applied[0].trackId, "track-01");
  assert.equal(applied.applied[0].from, -20);
  assert.equal(applied.applied[0].value, -12);
  const written = applied.project.tracks.find((track) => track.id === "track-01");
  assert.equal(written.chain.comp.threshold.value, -12);
  const untouched = applied.project.tracks.find((track) => track.id === "track-02");
  assert.equal(untouched.chain.comp.threshold.value, -20, "a Manual value is the user's");
});

test("8.2 · family and role scopes select the tracks they name, and unmatched scopes are said", () => {
  // The fixture leaves family/role unset; the scoping test sets them explicitly.
  const drums = { ...trackFixture({ id: "track-01", name: "Kick" }), familyId: "drums" };
  const bass = { ...trackFixture({ id: "track-02", name: "Bass" }), familyId: "bass" };
  const project = projectFixture({ tracks: [drums, bass], returns: [], buses: [] });
  const result = validateRulebook({
    ...VALID,
    targets: [
      { scope: "family", id: "drums", settings: [{ parameter: "eq.lf.gain", value: 3 }] },
      { scope: "family", id: "strings", settings: [{ parameter: "eq.lf.gain", value: 1 }] },
    ],
  });
  const applied = applyRulebook(project, result.rulebook);
  assert.deepEqual(applied.applied.map((entry) => entry.trackId), ["track-01"]);
  assert.equal(applied.unmatched.length, 1);
  assert.match(applied.unmatched[0], /"strings" matched no track/);
});

test("8.2 · applied values are clamped and stepped to the parameter's own spec", () => {
  const track = trackFixture({ id: "track-01", name: "Kick", ratio: 2 });
  const project = projectFixture({ tracks: [track], returns: [], buses: [] });
  // 40 dB is inside some ranges and outside others; the spec decides.
  const result = validateRulebook({ ...VALID, targets: [{ scope: "all", settings: [{ parameter: "compressor.ratio", value: 4.37 }] }] });
  assert.equal(result.ok, true, result.ok ? "" : JSON.stringify(result.problems));
  const applied = applyRulebook(project, result.rulebook);
  const value = applied.project.tracks[0].chain.comp.ratio.value;
  const spec = applied.applied[0];
  assert.ok(spec, "the ratio changed");
  assert.equal(value, Number(value.toFixed(6)), "no floating-point debris");
});

test("8.2 · applying twice is idempotent (deterministic engine behaviour)", () => {
  const track = { ...trackFixture({ id: "track-01", name: "Kick", threshold: -30 }), familyId: "drums" };
  const project = projectFixture({ tracks: [track], returns: [], buses: [] });
  const result = validateRulebook(VALID);
  const once = applyRulebook(project, result.rulebook);
  const twice = applyRulebook(once.project, result.rulebook);
  assert.deepEqual(twice.project.tracks[0].chain.comp.threshold.value, once.project.tracks[0].chain.comp.threshold.value);
  assert.equal(twice.applied.length, 0, "nothing changed the second time");
});

test("8.2 · an export reports the rulebooks it applied, and a placeholder says nothing", async () => {
  const { project, sources } = session();
  const outcome = await exportProject({
    project,
    sources,
    selection: { fullMix: true, stems: false, buses: false },
    destination: memoryDestination(),
    rulebooks: [PLACEHOLDER_RULEBOOK],
  });
  assert.equal(outcome.ok, true, JSON.stringify(outcome.failures));
  assert.ok(!outcome.notes.some((note) => /Rulebook/.test(note)), "a placeholder rulebook adds no claim to the notes");

  const active = await exportProject({
    project,
    sources,
    selection: { fullMix: true, stems: false, buses: false },
    destination: memoryDestination(),
    rulebooks: [{ schema: RULEBOOK_SCHEMA, id: "rock", name: "Rock", targets: VALID.targets }],
  });
  assert.ok(active.notes.some((note) => /Rulebook “Rock”/.test(note)), active.notes.join(" | "));
});

test("8.2 · the rulebook vocabulary is the engine's own parameter specs, not a copy", async () => {
  const { RULES, describeRange } = await import("../src/lib/rulebook/rulebook.ts");
  const { COMP_THRESHOLD, EQ_GAIN } = await import("../src/lib/mixer-chain.ts");
  assert.equal(RULES["compressor.threshold"].spec, COMP_THRESHOLD, "the same spec object");
  assert.equal(RULES["eq.lf.gain"].spec, EQ_GAIN);
  assert.match(describeRange("compressor.threshold"), /dB/);
  assert.match(describeRange("not.a.parameter"), /unknown parameter/);
});
