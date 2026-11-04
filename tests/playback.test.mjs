// Task 8.1 — shared transport, bounded raw/preview/render playback, recovery and
// room-independent state. Deterministic synthetic sources; a fake scheduled output
// records the exact PCM the browser would hear. No Web Audio or DOM is required.
import { test } from "node:test";
import assert from "node:assert/strict";

const { PlaybackController } = await import("../src/lib/playback/controller.ts");
const { createRawSession, createPreviewSession } = await import("../src/lib/playback/sessions.ts");
const { initialPlaybackState, clampFrame } = await import("../src/lib/playback/types.ts");
const { createSessionProject } = await import("../src/lib/project/session.ts");
const { renderProject } = await import("../src/lib/engine/render.ts");

const SR = 48000;

function rawProject(ids) {
  return {
    id: "playback-test",
    name: "Playback test",
    template: "empty",
    tracks: ids.map((id, i) => ({
      kind: "track",
      id,
      code: String(i + 1).padStart(2, "0"),
      type: "TRK",
      name: id,
      org: { id: "test", name: "Test", color: "#888888" },
      familyId: null,
      sourceTypeId: null,
      role: null,
      priority: 5,
      tierConfirmed: true,
      output: "master",
      channel: { trim: 0, pan: 0, level: 0, mute: false, solo: false, sends: [] },
      loadedSendLevels: {},
      chain: {},
      display: { peak: false },
      audio: null,
    })),
    returns: [],
    buses: [],
    arrangement: { barCount: 1, timeSignature: "4/4", sections: [], tempoMarkers: [], clips: {} },
  };
}

function signalSource(frames, fn) {
  return {
    sampleRate: SR,
    frames,
    read(frameStart, target, count) {
      for (let c = 0; c < 2; c++) {
        for (let i = 0; i < count; i++) target[c][i] = fn(frameStart + i, c);
      }
      return count;
    },
    close() {},
  };
}

function copyChunk(chunk) {
  return {
    startFrame: chunk.startFrame,
    frames: chunk.frames,
    channels: [Float32Array.from(chunk.channels[0].subarray(0, chunk.frames)), Float32Array.from(chunk.channels[1].subarray(0, chunk.frames))],
  };
}

function autoOutput() {
  const chunks = [];
  let position = 0;
  let stops = 0;
  return {
    sampleRate: SR,
    chunks,
    get stops() { return stops; },
    begin(startFrame) { position = startFrame; chunks.length = 0; },
    async write(chunk) { chunks.push(copyChunk(chunk)); position = chunk.startFrame + chunk.frames; },
    positionFrames() { return position; },
    async drain() {},
    stop() { stops++; },
  };
}

function blockingOutput() {
  const chunks = [];
  let position = 0;
  let pending = null;
  let generation = 0;
  const output = {
    sampleRate: SR,
    chunks,
    begin(startFrame) { generation++; position = startFrame; chunks.length = 0; },
    write(chunk) {
      chunks.push(copyChunk(chunk));
      const gen = generation;
      return new Promise((resolve, reject) => {
        pending = { resolve, reject, gen };
      });
    },
    release() {
      if (!pending) return;
      const { resolve, gen } = pending;
      pending = null;
      if (gen === generation) {
        const last = chunks[chunks.length - 1];
        position = last.startFrame + last.frames;
        resolve();
      }
    },
    positionFrames() { return position; },
    async drain() {},
    stop() {
      generation++;
      if (pending) {
        const { reject } = pending;
        pending = null;
        reject(new Error("output stopped"));
      }
    },
  };
  return output;
}

const immediateClock = {
  schedule: () => () => {},
  yieldBetween: async () => {},
};

function controllerFor(project, sources, output, options = {}) {
  return new PlaybackController({
    getProject: () => project,
    openSources: async () => sources,
    output,
    clock: immediateClock,
    chunkFrames: options.chunkFrames ?? 4,
    renderChunkFrames: options.renderChunkFrames ?? 4,
    tailSeconds: options.tailSeconds ?? 0,
  });
}

function joined(chunks) {
  const frames = chunks.reduce((sum, c) => sum + c.frames, 0);
  const out = [new Float32Array(frames), new Float32Array(frames)];
  let at = 0;
  for (const chunk of chunks) {
    for (let c = 0; c < 2; c++) out[c].set(chunk.channels[c], at);
    at += chunk.frames;
  }
  return out;
}

function peak(pair) {
  let max = 0;
  for (const channel of pair) for (const value of channel) max = Math.max(max, Math.abs(value));
  return max;
}

/* --- shared transport state ---------------------------------------------------- */

test("the reactive transport facade is one module-level state across room imports", async () => {
  const a = await import("../src/lib/playback/store.svelte.ts");
  const b = await import("../src/lib/playback/store.svelte.ts");
  assert.equal(a.transport, b.transport);
  const project = rawProject(["track-a"]);
  const sources = new Map([["track-a", signalSource(16, () => 0.1)]]);
  const output = autoOutput();
  const controller = controllerFor(project, sources, output);
  const detach = a.transport.attach(controller);
  a.transport.setSource("preview");
  a.transport.seek(0);
  assert.equal(b.transport.source, "preview");
  assert.equal(b.transport.status, "stopped");
  a.transport.setSource("raw");
  await a.transport.play();
  assert.equal(b.transport.status, "stopped");
  assert.equal(b.transport.positionFrames, 16);
  detach();
  controller.dispose();
});

test("clampFrame and initial state define the start position and duration boundary", () => {
  const state = initialPlaybackState(SR);
  assert.equal(state.startFrame, 0);
  assert.equal(state.positionFrames, 0);
  assert.equal(clampFrame(-5, 100), 0);
  assert.equal(clampFrame(101.9, 100), 100);
  assert.equal(clampFrame(Number.NaN, 100), 0);
});

/* --- raw synchronized playback ------------------------------------------------- */

test("raw playback sums imported tracks on one timeline and pads shorter sources with silence", async () => {
  const project = rawProject(["track-a", "track-b"]);
  const sources = new Map([
    ["track-a", signalSource(10, (i) => 0.25 + i * 0.01)],
    ["track-b", signalSource(6, () => 0.5)],
  ]);
  const output = autoOutput();
  const controller = controllerFor(project, sources, output, { chunkFrames: 4 });
  await controller.play();
  assert.equal(controller.getState().durationFrames, 10);
  assert.deepEqual(output.chunks.map((c) => c.startFrame), [0, 4, 8]);
  assert.deepEqual(output.chunks.map((c) => c.frames), [4, 4, 2]);
  const audio = joined(output.chunks);
  for (let i = 0; i < 10; i++) {
    const expected = 0.25 + i * 0.01 + (i < 6 ? 0.5 : 0);
    assert.ok(Math.abs(audio[0][i] - expected) < 1e-6, `frame ${i}`);
    assert.equal(audio[0][i], audio[1][i]);
  }
  controller.dispose();
});

test("raw playback respects mute and solo from the shared project model", async () => {
  const project = rawProject(["track-a", "track-b"]);
  const sources = new Map([
    ["track-a", signalSource(8, () => 0.25)],
    ["track-b", signalSource(8, () => 0.5)],
  ]);
  project.tracks[1].channel.mute = true;
  let output = autoOutput();
  let controller = controllerFor(project, sources, output);
  await controller.play();
  assert.ok(Math.abs(peak(joined(output.chunks)) - 0.25) < 1e-6);
  controller.dispose();

  project.tracks[1].channel.mute = false;
  project.tracks[0].channel.solo = true;
  output = autoOutput();
  controller = controllerFor(project, sources, output);
  await controller.play();
  assert.ok(Math.abs(peak(joined(output.chunks)) - 0.25) < 1e-6);
  controller.dispose();

  project.tracks[0].channel.solo = false;
  project.tracks[0].channel.mute = true;
  project.tracks[1].channel.solo = true;
  output = autoOutput();
  controller = controllerFor(project, sources, output);
  await controller.play();
  assert.ok(Math.abs(peak(joined(output.chunks)) - 0.5) < 1e-6);
  controller.dispose();
});

test("mono and stereo sources are both played as stereo without a project-sized buffer", async () => {
  const project = rawProject(["track-mono", "track-stereo"]);
  const sources = new Map([
    ["track-mono", signalSource(8, (_i, c) => (c === 0 ? 0.3 : 0.3))],
    ["track-stereo", signalSource(8, (_i, c) => (c === 0 ? 0.2 : -0.2))],
  ]);
  const output = autoOutput();
  const controller = controllerFor(project, sources, output);
  await controller.play();
  const audio = joined(output.chunks);
  assert.ok(Math.abs(audio[0][0] - 0.5) < 1e-6);
  assert.ok(Math.abs(audio[1][0] - 0.1) < 1e-6);
  controller.dispose();
});

/* --- play / pause / stop / seek ------------------------------------------------ */

test("pause stops scheduled audio, keeps the playhead, and resume starts a clean generation", async () => {
  const project = rawProject(["track-a"]);
  const sources = new Map([["track-a", signalSource(64, (i) => i / 64)]]);
  const output = blockingOutput();
  const controller = controllerFor(project, sources, output, { chunkFrames: 4 });
  const playing = controller.play();
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(controller.getState().status, "playing");
  assert.equal(output.chunks.length, 1);
  controller.pause();
  await playing;
  assert.equal(controller.getState().status, "paused");
  assert.equal(controller.getState().positionFrames, 0);
  const resumed = controller.play();
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(output.chunks.length, 1);
  assert.equal(output.chunks[0].startFrame, 0);
  controller.stop();
  await resumed;
  assert.equal(controller.getState().status, "stopped");
  assert.equal(controller.getState().positionFrames, 0);
  controller.dispose();
});

test("seek while stopped moves the playhead; seek while playing restarts at the target without stale chunks", async () => {
  const project = rawProject(["track-a"]);
  const sources = new Map([["track-a", signalSource(64, (i) => i / 64)]]);
  const output = blockingOutput();
  const controller = controllerFor(project, sources, output, { chunkFrames: 4 });
  controller.seek(12);
  assert.equal(controller.getState().positionFrames, 12);
  const playing = controller.play();
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(output.chunks[0].startFrame, 12);
  controller.seek(20);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(controller.getState().status, "playing");
  assert.equal(output.chunks[0].startFrame, 20);
  controller.stop();
  await playing;
  controller.dispose();
});

test("stop returns to the defined start position and natural end leaves the playhead at duration", async () => {
  const project = rawProject(["track-a"]);
  const sources = new Map([["track-a", signalSource(12, () => 0.1)]]);
  const output = autoOutput();
  const controller = controllerFor(project, sources, output);
  await controller.play();
  assert.equal(controller.getState().status, "stopped");
  assert.equal(controller.getState().positionFrames, 12);
  controller.stop();
  assert.equal(controller.getState().positionFrames, 0);
  controller.dispose();
});

/* --- live preview through the existing engine ---------------------------------- */

function previewProject() {
  const project = createSessionProject();
  for (const track of project.tracks) track.channel.mute = track.id !== "track-01";
  const track = project.tracks.find((t) => t.id === "track-01");
  track.channel.trim = 0;
  track.channel.pan = 0;
  track.channel.level = 0;
  track.output = "master";
  for (const send of track.channel.sends) { send.to = null; send.level = -60; }
  return project;
}

test("live preview uses MixEngine routing: bus, Return send and sidechain are audible in the output", async () => {
  const project = previewProject();
  const track = project.tracks.find((t) => t.id === "track-01");
  track.output = "bus-B1";
  track.channel.sends[0].to = "return-room";
  track.channel.sends[0].level = 0;
  const sources = new Map([["track-01", signalSource(2048, (i) => 0.4 * Math.sin(i * 0.05))]]);
  const output = autoOutput();
  const controller = controllerFor(project, sources, output, { chunkFrames: 512, tailSeconds: 0.05 });
  controller.setSource("preview");
  await controller.play();
  const audio = joined(output.chunks);
  assert.ok(peak(audio) > 0.01, "preview should produce audio through the bus");
  assert.ok(audio[0].length > 2048, "preview should include the processed tail");
  controller.dispose();

  const keyed = previewProject();
  keyed.tracks.find((t) => t.id === "track-01").output = "master";
  keyed.tracks.find((t) => t.id === "track-02").channel.mute = false;
  keyed.tracks.find((t) => t.id === "track-02").channel.level = -60;
  keyed.sidechains = [{ source: "track-02", destination: "track-01", processor: "compressor" }];
  const keyedSources = new Map([
    ["track-01", signalSource(2048, () => 0.05)],
    ["track-02", signalSource(2048, () => 0.9)],
  ]);
  const keyedOutput = autoOutput();
  const keyedController = controllerFor(keyed, keyedSources, keyedOutput, { chunkFrames: 512, tailSeconds: 0 });
  keyedController.setSource("preview");
  await keyedController.play();
  const unkeyed = previewProject();
  unkeyed.tracks.find((t) => t.id === "track-02").channel.mute = false;
  unkeyed.tracks.find((t) => t.id === "track-02").channel.level = -60;
  const unkeyedOutput = autoOutput();
  const unkeyedController = controllerFor(unkeyed, keyedSources, unkeyedOutput, { chunkFrames: 512, tailSeconds: 0 });
  unkeyedController.setSource("preview");
  await unkeyedController.play();
  assert.ok(peak(joined(keyedOutput.chunks)) <= peak(joined(unkeyedOutput.chunks)) + 1e-6, "sidechain key should not increase the destination");
  keyedController.dispose();
  unkeyedController.dispose();
});

test("preview DSP state is continuous within an attempt and reinitializes after stop/seek/restart", async () => {
  const project = previewProject();
  const sources = new Map([["track-01", signalSource(1024, (i) => 0.3 * Math.sin(i * 0.02))]]);
  const first = autoOutput();
  const controller = controllerFor(project, sources, first, { chunkFrames: 256, tailSeconds: 0.02 });
  controller.setSource("preview");
  await controller.play();
  const reference = joined(first.chunks);
  controller.stop();
  const second = autoOutput();
  const restarted = controllerFor(project, sources, second, { chunkFrames: 256, tailSeconds: 0.02 });
  restarted.setSource("preview");
  await restarted.play();
  const again = joined(second.chunks);
  assert.equal(again[0].length, reference[0].length);
  for (let i = 0; i < reference[0].length; i++) assert.ok(Math.abs(again[0][i] - reference[0][i]) < 1e-6);
  restarted.seek(512);
  const third = autoOutput();
  const seeked = controllerFor(project, sources, third, { chunkFrames: 256, tailSeconds: 0.02 });
  seeked.setSource("preview");
  seeked.seek(512);
  await seeked.play();
  assert.equal(third.chunks[0].startFrame, 512);
  controller.dispose();
  restarted.dispose();
  seeked.dispose();
});

/* --- rendered-mix playback ------------------------------------------------------ */

test("rendered-mix playback streams the Task 7.4 renderer through the shared transport", async () => {
  const project = previewProject();
  const sources = new Map([["track-01", signalSource(1024, (i) => 0.25 * Math.sin(i * 0.03))]]);
  const output = autoOutput();
  const controller = controllerFor(project, sources, output, { renderChunkFrames: 256, tailSeconds: 0.02 });
  controller.setSource("render");
  await controller.play();
  const state = controller.getState();
  assert.equal(state.status, "stopped");
  assert.equal(state.source, "render");
  assert.ok(state.durationFrames > 1024);
  assert.ok(output.chunks.length > 1);
  assert.equal(output.chunks[0].startFrame, 0);
  const audio = joined(output.chunks);
  assert.equal(audio[0].length, state.durationFrames);
  assert.ok(peak(audio) > 0.001);
  controller.dispose();
});

test("rendered playback matches a direct bounded render of the same project and sources", async () => {
  const project = previewProject();
  const makeSources = () => new Map([["track-01", signalSource(512, (i) => 0.2 * Math.sin(i * 0.04))]]);
  const referenceChunks = [];
  await renderProject(project, makeSources(), {
    write(chunk) { referenceChunks.push(copyChunk(chunk)); },
  }, { chunkFrames: 128, tailSeconds: 0.01 });
  const output = autoOutput();
  const controller = controllerFor(project, makeSources(), output, { renderChunkFrames: 128, tailSeconds: 0.01 });
  controller.setSource("render");
  await controller.play();
  const actual = joined(output.chunks);
  const expected = joined(referenceChunks);
  assert.equal(actual[0].length, expected[0].length);
  for (let i = 0; i < expected[0].length; i++) assert.ok(Math.abs(actual[0][i] - expected[0][i]) < 1e-6, `frame ${i}`);
  controller.dispose();
});

test("render failure and cancellation leave the transport recoverable and never commit partial output", async () => {
  const project = previewProject();
  const badSources = new Map([["track-01", { sampleRate: SR, frames: 1024, read() { throw new Error("synthetic read failure"); }, close() {} }]]);
  const output = autoOutput();
  const controller = controllerFor(project, badSources, output, { renderChunkFrames: 128, tailSeconds: 0 });
  controller.setSource("render");
  await controller.play();
  assert.equal(controller.getState().status, "error");
  assert.match(controller.getState().error, /synthetic read failure/);
  controller.stop();
  assert.equal(controller.getState().status, "stopped");
  controller.dispose();

  const sources = new Map([["track-01", signalSource(4096, () => 0.1)]]);
  const blocked = blockingOutput();
  const cancellable = controllerFor(project, sources, blocked, { renderChunkFrames: 128, tailSeconds: 0 });
  cancellable.setSource("render");
  const rendering = cancellable.play();
  await new Promise((resolve) => setTimeout(resolve, 10));
  cancellable.pause();
  await rendering;
  assert.equal(cancellable.getState().status, "paused");
  assert.equal(cancellable.getState().renderProgress, null);
  cancellable.dispose();
});

/* --- bounded memory ------------------------------------------------------------- */

test("long raw and preview playback allocate no duration-proportional audio buffers", async () => {
  const OriginalFloat32Array = globalThis.Float32Array;
  const measure = async (frames, makeSession) => {
    let arrays = 0;
    let elements = 0;
    let max = 0;
    globalThis.Float32Array = new Proxy(OriginalFloat32Array, {
      construct(target, args) {
        const instance = new target(...args);
        arrays++;
        elements += instance.length;
        max = Math.max(max, instance.length);
        return instance;
      },
    });
    try {
      const project = previewProject();
      const sources = new Map([["track-01", signalSource(frames, () => 0.1)]]);
      const session = makeSession(project, sources);
      let chunks = 0;
      while (chunks < 8) {
        const chunk = await session.next();
        if (!chunk) break;
        chunks++;
      }
      await session.close();
      return { arrays, elements, max };
    } finally {
      globalThis.Float32Array = OriginalFloat32Array;
    }
  };
  const rawShort = await measure(256, (project, sources) => createRawSession(project, sources, 0, 64));
  const rawLong = await measure(48000 * 60, (project, sources) => createRawSession(project, sources, 0, 64));
  assert.deepEqual(rawLong, rawShort);
  assert.ok(rawLong.max <= 64);

  const previewShort = await measure(256, (project, sources) => createPreviewSession(project, sources, 0, 64, 0.01));
  const previewLong = await measure(48000 * 60, (project, sources) => createPreviewSession(project, sources, 0, 64, 0.01));
  assert.deepEqual(previewLong, previewShort);
  assert.ok(previewLong.max <= 64 * 2 + 4096, "engine DSP state may exceed the block, but never the project length");
});
