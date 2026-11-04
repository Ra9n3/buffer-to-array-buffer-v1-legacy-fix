// Task 7.4 — bounded rendering: streaming sources/sinks, state continuity,
// latency compensation, Return tails, masking/sidechains, recovery and allocation.
import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_RENDER_CHUNK_FRAMES,
  MAX_RENDER_CHUNK_FRAMES,
  RenderCancelledError,
  RenderProjectChangedError,
  openWavRenderSource,
  renderProject,
} from "../src/lib/engine/render.ts";
import { MixEngine } from "../src/lib/engine/mix-engine.ts";
import { DEFAULT_MASKING_RESOLUTION, resolveMaskingAudio } from "../src/lib/engine/masking.ts";
import { byteSourceOf } from "../src/lib/analysis/decode.ts";
import { encodeWav } from "../src/lib/audio/wav.ts";
import { RATE, busFixture, projectFixture, returnFixture, trackFixture } from "./engine-fixtures.mjs";

function pair(frames) {
  return [new Float32Array(frames), new Float32Array(frames)];
}

function signalSource(frames, sample, options = {}) {
  let closed = 0;
  let reads = 0;
  return {
    sampleRate: options.sampleRate ?? RATE,
    frames,
    read(start, target, count) {
      reads++;
      if (options.failRead === reads) throw new Error("injected source failure");
      for (let i = 0; i < count; i++) {
        const value = sample(start + i, 0);
        target[0][i] = value;
        target[1][i] = options.stereo ? sample(start + i, 1) : value;
      }
      return count;
    },
    close() { closed++; options.onClose?.(); },
    get closed() { return closed; },
    get reads() { return reads; },
  };
}

function tone(frame, hz, amplitude) {
  return amplitude * Math.sin((2 * Math.PI * hz * frame) / RATE);
}

function collector(options = {}) {
  const chunks = [];
  let writes = 0;
  const state = { chunks, finished: null, aborted: null, writes: 0, maxChunk: 0, reused: null };
  const sink = {
    write(chunk) {
      writes++;
      state.writes = writes;
      state.maxChunk = Math.max(state.maxChunk, chunk.frames);
      if (state.reused === null) state.reused = chunk.channels;
      else if (state.reused !== chunk.channels) state.reused = false;
      if (options.failWrite === writes) throw new Error("injected sink failure");
      if (options.onWrite) options.onWrite(chunk, writes);
      chunks.push({ startFrame: chunk.startFrame, frames: chunk.frames, channels: [chunk.channels[0].slice(0, chunk.frames), chunk.channels[1].slice(0, chunk.frames)] });
    },
    finish(result) {
      if (options.failFinish) throw new Error("injected finish failure");
      state.finished = result;
    },
    abort(error) { state.aborted = error; },
  };
  return { sink, state };
}

function joined(state, frames) {
  const out = pair(frames);
  for (const chunk of state.chunks) {
    for (let c = 0; c < 2; c++) out[c].set(chunk.channels[c], chunk.startFrame);
  }
  return out;
}

function compare(actual, expected, tolerance = 1e-6) {
  assert.equal(actual[0].length, expected[0].length);
  let max = 0;
  let errSq = 0;
  let refSq = 0;
  let first = -1;
  for (let c = 0; c < 2; c++) {
    for (let i = 0; i < actual[c].length; i++) {
      const err = Math.abs(actual[c][i] - expected[c][i]);
      if (err > max) max = err;
      if (err > tolerance && first < 0) first = i;
      errSq += err * err;
      refSq += expected[c][i] * expected[c][i];
    }
  }
  assert.ok(max <= tolerance, `max sample error ${max} at frame ${first}`);
  const relative = refSq > 0 ? Math.sqrt(errSq / refSq) : Math.sqrt(errSq);
  assert.ok(relative <= tolerance, `relative RMS error ${relative}`);
  return { max, relative };
}

// A test-only continuous reference. Production rendering never uses this shape:
// it deliberately allocates the whole reference so the streaming path can be
// compared sample-for-sample against the same engine run in one block.
async function continuousReference(project, makeSources, options = {}) {
  const sources = makeSources();
  let inputFrames = 0;
  for (const source of sources.values()) inputFrames = Math.max(inputFrames, source.frames);
  const probe = new MixEngine(project, { sampleRate: RATE, maskingDynamicBands: options.maskingDynamicBands });
  const tailFrames = Math.ceil((options.tailSeconds ?? probe.tailSeconds) * RATE);
  const engineFrames = inputFrames + tailFrames;
  const latency = probe.latencyFrames;
  const engine = new MixEngine(project, { sampleRate: RATE, maxFramesPerBlock: Math.max(1, engineFrames), maskingDynamicBands: options.maskingDynamicBands });
  const inputs = new Map();
  for (const [id, source] of sources) {
    const buffer = pair(engineFrames);
    if (source.frames > 0) await source.read(0, buffer, Math.min(engineFrames, source.frames));
    inputs.set(id, buffer);
    await source.close?.();
  }
  const raw = pair(engineFrames + latency);
  if (engineFrames > 0) engine.process(inputs, [raw[0].subarray(0, engineFrames), raw[1].subarray(0, engineFrames)], engineFrames);
  if (latency > 0) engine.flush([raw[0].subarray(engineFrames, engineFrames + latency), raw[1].subarray(engineFrames, engineFrames + latency)], latency);
  return [raw[0].slice(latency, latency + engineFrames), raw[1].slice(latency, latency + engineFrames)];
}

function complexProject() {
  return projectFixture({
    tracks: [
      trackFixture({ id: "track-a", priority: 9, trim: -2, pan: -15, compBypassed: false, threshold: -22, ratio: 3, attack: 5, release: 120, dynamic: { lmf: 4 }, cleanup: true, sends: [{ to: "return-verb", level: -8 }, { to: "return-delay", level: -10 }] }),
      trackFixture({ id: "track-b", priority: 3, pan: 20, level: -3, output: "bus-group", compBypassed: false, threshold: -18, ratio: 2, sends: [{ to: "return-verb", level: -6 }] }),
    ],
    buses: [busFixture({ id: "bus-group", compBypassed: false, threshold: -20, ratio: 2 })],
    returns: [
      returnFixture({ id: "return-verb", effect: "reverb", character: "room", time: 0.4, second: 12, level: -4 }),
      returnFixture({ id: "return-delay", effect: "delay", character: "digital", time: 120, second: 55, level: -5 }),
    ],
    sidechains: [
      { source: "track-a", destination: "track-b", processor: "compressor" },
      { source: "track-a", destination: "track-b", processor: "dynamic-eq" },
    ],
  });
}

function complexSources(frames) {
  return new Map([
    ["track-a", signalSource(frames, (i, c) => tone(i, c ? 701 : 699, 0.35) + tone(i, 110, 0.1), { stereo: true })],
    ["track-b", signalSource(frames, (i) => tone(i, 440, 0.3) * (Math.floor(i / 2400) % 2 ? 0.4 : 1))],
  ]);
}

test("short renders keep input alignment and length across the limiter latency", async () => {
  const project = projectFixture({ tracks: [trackFixture({ id: "track-a" })] });
  for (const frames of [0, 1, 239, 240, 241, 1024, 4097]) {
    const make = () => new Map([["track-a", signalSource(frames, () => 0.2)]]);
    const { sink, state } = collector();
    const result = await renderProject(project, make(), sink, { chunkFrames: 1024, tailSeconds: 0 });
    assert.equal(result.frames, frames);
    assert.equal(result.latencyFrames, 240);
    const actual = joined(state, frames);
    const expected = await continuousReference(project, make, { tailSeconds: 0 });
    compare(actual, expected, 0);
    if (frames > 0) assert.ok(Math.abs(actual[0][0] - 0.2 * Math.SQRT1_2) < 1e-6, "leading latency was not compensated");
  }
});

test("multiple chunk boundaries through active stateful audio match a continuous render", async () => {
  const project = complexProject();
  const frames = Math.floor(RATE * 0.75);
  const { sink, state } = collector();
  const result = await renderProject(project, complexSources(frames), sink, { chunkFrames: 997, tailSeconds: 0.2 });
  assert.ok(result.chunks > 30);
  assert.equal(state.maxChunk, 997);
  const actual = joined(state, result.frames);
  const expected = await continuousReference(project, () => complexSources(frames), { tailSeconds: 0.2 });
  const measured = compare(actual, expected, 1e-6);
  assert.equal(measured.max, 0, "the approved DSP should be block-invariant, not merely close");
});

test("a long render streams many chunks without a full-project output buffer", async () => {
  const project = complexProject();
  const frames = RATE * 6;
  const { sink, state } = collector();
  const result = await renderProject(project, complexSources(frames), sink, { chunkFrames: DEFAULT_RENDER_CHUNK_FRAMES, tailSeconds: 0.25 });
  assert.equal(result.inputFrames, frames);
  assert.equal(result.frames, frames + Math.ceil(0.25 * RATE));
  assert.ok(result.chunks > 70);
  assert.ok(state.maxChunk <= DEFAULT_RENDER_CHUNK_FRAMES);
  assert.equal(state.reused !== null && state.reused !== false, true, "output buffers should be reused");
  const expected = await continuousReference(project, () => complexSources(frames), { tailSeconds: 0.25 });
  compare(joined(state, result.frames), expected, 1e-6);
});

test("reverb and delay tails cross chunk boundaries after the final input", async () => {
  const project = projectFixture({
    tracks: [trackFixture({ id: "track-a", sends: [{ to: "return-verb", level: 0 }, { to: "return-delay", level: 0 }] })],
    returns: [
      returnFixture({ id: "return-verb", effect: "reverb", character: "plate", time: 0.4, second: 20, level: 0 }),
      returnFixture({ id: "return-delay", effect: "delay", time: 120, second: 65, level: 0 }),
    ],
  });
  const frames = Math.floor(RATE * 0.1);
  const make = () => new Map([["track-a", signalSource(frames, (i) => tone(i, 900, 0.35))]]);
  const { sink, state } = collector();
  const result = await renderProject(project, make(), sink, { chunkFrames: 1000 });
  assert.ok(result.tailFrames > RATE, "the conservative Return tail was not scheduled");
  const actual = joined(state, result.frames);
  const expected = await continuousReference(project, make);
  compare(actual, expected, 1e-6);
  const energy = (from, to) => {
    let sum = 0;
    for (let i = from; i < to; i++) sum += actual[0][i] * actual[0][i] + actual[1][i] * actual[1][i];
    return sum;
  };
  const earlyTail = energy(frames + 1000, frames + 5000);
  const lateTail = energy(result.frames - 5000, result.frames);
  assert.ok(earlyTail > 1e-6, "no wet tail after the input stopped");
  assert.ok(lateTail < earlyTail, "the rendered tail does not decay");
  assert.ok(state.chunks.some((chunk) => chunk.startFrame >= frames && chunk.frames > 0));
});

test("compressor, Dynamic EQ and expander state is not reset at a chunk edge", async () => {
  const project = projectFixture({
    tracks: [trackFixture({ id: "track-a", compBypassed: false, threshold: -24, ratio: 6, attack: 2, release: 250, dynamic: { lmf: 6 }, cleanup: true })],
  });
  const chunkFrames = 1000;
  const frames = chunkFrames * 4 + 17;
  const make = () => new Map([["track-a", signalSource(frames, (i) => tone(i, 500, i < chunkFrames * 2 ? 0.7 : 0.12))]]);
  const { sink, state } = collector();
  const result = await renderProject(project, make(), sink, { chunkFrames, tailSeconds: 0 });
  const actual = joined(state, result.frames);
  const expected = await continuousReference(project, make, { tailSeconds: 0 });
  compare(actual, expected, 0);

  // A deliberately wrong renderer that rebuilds the engine every chunk must not
  // match: this proves the comparison is sensitive to lost envelope/filter state.
  const naive = pair(frames);
  for (let at = 0; at < frames; at += chunkFrames) {
    const count = Math.min(chunkFrames, frames - at);
    const fresh = new MixEngine(project, { sampleRate: RATE, maxFramesPerBlock: chunkFrames });
    const input = pair(count);
    for (let i = 0; i < count; i++) input[0][i] = input[1][i] = tone(at + i, 500, at + i < chunkFrames * 2 ? 0.7 : 0.12);
    const out = pair(count);
    fresh.process(new Map([["track-a", input]]), out, count);
    for (let c = 0; c < 2; c++) naive[c].set(out[c], at);
  }
  let difference = 0;
  for (let i = 0; i < frames; i++) difference = Math.max(difference, Math.abs(naive[0][i] - actual[0][i]));
  assert.ok(difference > 1e-3, "resetting state at chunk edges was not detectable");
});

test("sidechain keys and Task 7.3 masking overlays remain correct across chunks", async () => {
  const frames = RATE * 2;
  const base = projectFixture({ tracks: [trackFixture({ id: "track-a" }), trackFixture({ id: "track-b" })] });
  base.tracks[0].priority = 9;
  base.tracks[1].priority = 3;
  const keySample = (i) => {
    const t = i / RATE;
    return (t >= 0.2 && t < 0.4) || (t >= 1.2 && t < 1.4) ? tone(i, 1000, 0.25) : 0;
  };
  const bodySample = (i) => tone(i, 1000, 0.5);
  const keyBuffer = pair(frames);
  const bodyBuffer = pair(frames);
  for (let i = 0; i < frames; i++) {
    keyBuffer[0][i] = keyBuffer[1][i] = keySample(i);
    bodyBuffer[0][i] = bodyBuffer[1][i] = bodySample(i);
  }
  const inputs = new Map([["track-a", { channels: keyBuffer, frames }], ["track-b", { channels: bodyBuffer, frames }]]);
  const resolved = resolveMaskingAudio(base, inputs, DEFAULT_MASKING_RESOLUTION, { sampleRate: RATE, maxFramesPerBlock: 4096 });
  assert.ok(resolved.actions.some((action) => action.kind === "dynamic-eq"));
  const make = () => new Map([["track-a", signalSource(frames, keySample)], ["track-b", signalSource(frames, bodySample)]]);
  const { sink, state } = collector();
  const result = await renderProject(resolved.project, make(), sink, { chunkFrames: 777, tailSeconds: 0, maskingDynamicBands: resolved.dynamicBands });
  const actual = joined(state, result.frames);
  const expected = await continuousReference(resolved.project, make, { tailSeconds: 0, maskingDynamicBands: resolved.dynamicBands });
  compare(actual, expected, 0);
  assert.ok(resolved.project.sidechains.some((edge) => edge.processor === "dynamic-eq"));
});

test("cancellation aborts the sink, closes sources, and a fresh retry is clean", async () => {
  const project = complexProject();
  const frames = RATE;
  const controller = new AbortController();
  let closed = 0;
  const make = () => new Map([["track-a", signalSource(frames, (i) => tone(i, 500, 0.3), { onClose: () => closed++ })]]);
  const first = collector({ onWrite: (_chunk, writes) => { if (writes === 2) controller.abort(); } });
  await assert.rejects(renderProject(project, make(), first.sink, { chunkFrames: 1000, tailSeconds: 0.1, signal: controller.signal }), { name: "RenderCancelledError" });
  assert.equal(first.state.finished, null);
  assert.ok(first.state.aborted instanceof RenderCancelledError);
  assert.equal(closed, 1);

  const second = collector();
  const result = await renderProject(project, make(), second.sink, { chunkFrames: 1000, tailSeconds: 0.1 });
  assert.ok(second.state.finished);
  assert.equal(second.state.aborted, null);
  const expected = await continuousReference(project, () => make(), { tailSeconds: 0.1 });
  compare(joined(second.state, result.frames), expected, 0);
});

test("an already-aborted signal never writes or commits", async () => {
  const project = projectFixture({ tracks: [trackFixture({ id: "track-a" })] });
  const controller = new AbortController();
  controller.abort();
  const source = signalSource(1000, () => 0.2);
  const { sink, state } = collector();
  await assert.rejects(renderProject(project, new Map([["track-a", source]]), sink, { signal: controller.signal }), { name: "RenderCancelledError" });
  assert.equal(state.writes, 0);
  assert.equal(state.finished, null);
  assert.ok(state.aborted instanceof RenderCancelledError);
  assert.equal(source.closed, 1);
});

test("an injected source failure aborts partial output and can be retried", async () => {
  const project = projectFixture({ tracks: [trackFixture({ id: "track-a" })] });
  const frames = 5000;
  const bad = signalSource(frames, (i) => tone(i, 400, 0.3), { failRead: 2 });
  const first = collector();
  await assert.rejects(renderProject(project, new Map([["track-a", bad]]), first.sink, { chunkFrames: 1000, tailSeconds: 0 }), /injected source failure/);
  assert.equal(first.state.finished, null);
  assert.match(first.state.aborted.message, /injected source failure/);
  assert.equal(bad.closed, 1);
  const make = () => new Map([["track-a", signalSource(frames, (i) => tone(i, 400, 0.3))]]);
  const second = collector();
  const result = await renderProject(project, make(), second.sink, { chunkFrames: 1000, tailSeconds: 0 });
  compare(joined(second.state, result.frames), await continuousReference(project, make, { tailSeconds: 0 }), 0);
});

test("sink write and commit failures are abortable and retryable", async () => {
  const project = projectFixture({ tracks: [trackFixture({ id: "track-a" })] });
  const frames = 3000;
  const make = () => new Map([["track-a", signalSource(frames, () => 0.2)]]);
  for (const options of [{ failWrite: 2 }, { failFinish: true }]) {
    const first = collector(options);
    await assert.rejects(renderProject(project, make(), first.sink, { chunkFrames: 1000, tailSeconds: 0 }), /injected/);
    assert.equal(first.state.finished, null);
    assert.ok(first.state.aborted);
    const second = collector();
    const result = await renderProject(project, make(), second.sink, { chunkFrames: 1000, tailSeconds: 0 });
    assert.ok(second.state.finished);
    assert.equal(result.frames, frames);
  }
});

test("Float32 audio allocation is independent of project duration", async () => {
  const NativeFloat32Array = globalThis.Float32Array;
  const project = projectFixture({
    tracks: [trackFixture({ id: "track-a", compBypassed: false, threshold: -20, ratio: 2, sends: [{ to: "return-delay", level: -6 }] })],
    returns: [returnFixture({ id: "return-delay", effect: "delay", time: 120, second: 50 })],
  });
  const measure = async (frames) => {
    let total = 0;
    let max = 0;
    globalThis.Float32Array = new Proxy(NativeFloat32Array, {
      construct(target, args) {
        const value = new target(...args);
        total += value.length;
        max = Math.max(max, value.length);
        return value;
      },
    });
    try {
      const sink = { write() {}, finish() {}, abort() {} };
      const source = signalSource(frames, (i) => tone(i, 500, 0.3));
      const result = await renderProject(project, new Map([["track-a", source]]), sink, { chunkFrames: 4096, tailSeconds: 0.2 });
      assert.equal(result.frames, frames + Math.ceil(0.2 * RATE));
      return { total, max };
    } finally {
      globalThis.Float32Array = NativeFloat32Array;
    }
  };
  const short = await measure(RATE / 2);
  const long = await measure(RATE * 4);
  assert.equal(short.total, long.total, "audio allocation grew with duration");
  assert.equal(short.max, long.max);
  assert.ok(long.max <= 4096, `a duration-sized buffer appeared: ${long.max}`);
});

test("WAV sources reuse the approved decoder, duplicate mono, and reject damaged audio", async () => {
  const frames = 2500;
  const stereo = encodeWav({ sampleRate: RATE, channels: 2, encoding: "pcm", bitDepth: 24, frames, sample: (c, i) => (c ? -0.2 : 0.2) * Math.sin(i / 17) });
  const mono = encodeWav({ sampleRate: RATE, channels: 1, encoding: "float", bitDepth: 32, frames, sample: () => 0.1 });
  const project = projectFixture({ tracks: [trackFixture({ id: "track-a" }), trackFixture({ id: "track-b" })] });
  const { sink, state } = collector();
  const sources = new Map([["track-a", await openWavRenderSource(byteSourceOf(stereo))], ["track-b", await openWavRenderSource(mono)]]);
  const result = await renderProject(project, sources, sink, { chunkFrames: 700, tailSeconds: 0 });
  const out = joined(state, result.frames);
  assert.ok(Math.abs(out[0][100] - 0.2 * Math.sin(100 / 17) * Math.SQRT1_2 - 0.1 * Math.SQRT1_2) < 1e-5);
  assert.ok(Math.abs(out[1][100] + 0.2 * Math.sin(100 / 17) * Math.SQRT1_2 - 0.1 * Math.SQRT1_2) < 1e-5);

  const damaged = encodeWav({ sampleRate: RATE, channels: 1, encoding: "float", bitDepth: 32, frames: 10, sample: () => NaN });
  const source = await openWavRenderSource(damaged);
  const target = pair(10);
  await assert.rejects(source.read(0, target, 10), /non-finite/);
  await source.close();
  await assert.rejects(source.read(0, target, 10), /closed/);
});

test("render configuration and source mismatches are named errors", async () => {
  const project = projectFixture({ tracks: [trackFixture({ id: "track-a" })] });
  const { sink } = collector();
  const good = () => new Map([["track-a", signalSource(100, () => 0.1)]]);
  for (const chunkFrames of [0, -1, 1.5, MAX_RENDER_CHUNK_FRAMES + 1]) {
    await assert.rejects(renderProject(project, good(), sink, { chunkFrames }), /chunkFrames/);
  }
  await assert.rejects(renderProject(project, good(), sink, { tailSeconds: -1 }), /tailSeconds/);
  await assert.rejects(renderProject(project, new Map([["track-missing", signalSource(100, () => 0.1)]]), sink), /not a track/);
  await assert.rejects(renderProject(project, new Map([["track-a", signalSource(100, () => 0.1, { sampleRate: 44100 })]]), sink), /no resampling/);
});

test("progress is monotonic, chunk-bounded, and ends at the delivered frame count", async () => {
  const project = projectFixture({ tracks: [trackFixture({ id: "track-a" })] });
  const progress = [];
  const { sink, state } = collector();
  const result = await renderProject(project, new Map([["track-a", signalSource(5000, () => 0.1)]]), sink, {
    chunkFrames: 1000,
    tailSeconds: 0.05,
    onProgress: (value) => progress.push(value),
  });
  assert.ok(progress.length > 1);
  for (let i = 0; i < progress.length; i++) {
    assert.ok(progress[i].framesWritten <= result.frames);
    if (i > 0) assert.ok(progress[i].framesWritten > progress[i - 1].framesWritten);
  }
  assert.equal(progress.at(-1).fraction, 1);
  assert.equal(state.finished.frames, result.frames);
});

test("tiny and non-divisible chunk partitions agree with the continuous reference", async () => {
  const project = complexProject();
  const frames = 600;
  const expected = await continuousReference(project, () => complexSources(frames), { tailSeconds: 0.05 });
  for (const chunkFrames of [1, 7, 64, 999]) {
    const { sink, state } = collector();
    const result = await renderProject(project, complexSources(frames), sink, { chunkFrames, tailSeconds: 0.05 });
    compare(joined(state, result.frames), expected, 0);
  }
});

test("a short source read or a failed close aborts instead of committing partial audio", async () => {
  const project = projectFixture({ tracks: [trackFixture({ id: "track-a" })] });
  const shortRead = {
    sampleRate: RATE,
    frames: 2000,
    read(_start, _target, count) { return count - 1; },
  };
  const first = collector();
  await assert.rejects(renderProject(project, new Map([["track-a", shortRead]]), first.sink, { chunkFrames: 1000, tailSeconds: 0 }), /returned 999 frames/);
  assert.equal(first.state.finished, null);
  assert.ok(first.state.aborted);

  const badClose = signalSource(2000, () => 0.1);
  badClose.close = () => { throw new Error("injected close failure"); };
  const second = collector();
  await assert.rejects(renderProject(project, new Map([["track-a", badClose]]), second.sink, { chunkFrames: 1000, tailSeconds: 0 }), /injected close failure/);
  assert.equal(second.state.finished, null);
  assert.match(second.state.aborted.message, /injected close failure/);
});

test("a project change during a render aborts before commit and a stable retry succeeds", async () => {
  const project = projectFixture({
    tracks: [trackFixture({ id: "track-a", sends: [{ to: "return-delay", level: -6 }] })],
    returns: [returnFixture({ id: "return-delay", effect: "delay", time: 120, second: 50 })],
  });
  const frames = 5000;
  const make = () => new Map([["track-a", signalSource(frames, (i) => tone(i, 500, 0.3))]]);
  const first = collector({
    onWrite: (_chunk, writes) => {
      if (writes === 1) project.tracks[0].channel.sends[0].level = -20;
    },
  });
  await assert.rejects(renderProject(project, make(), first.sink, { chunkFrames: 1000, tailSeconds: 0.1 }), { name: "RenderProjectChangedError" });
  assert.equal(first.state.finished, null);
  assert.ok(first.state.aborted instanceof RenderProjectChangedError);
  assert.ok(first.state.writes >= 1, "the mutation should be observed after a partial write");

  // A retry is a fresh attempt against the now-stable project and must commit cleanly.
  const second = collector();
  const result = await renderProject(project, make(), second.sink, { chunkFrames: 1000, tailSeconds: 0.1 });
  assert.ok(second.state.finished);
  assert.equal(second.state.aborted, null);
  const expected = await continuousReference(project, make, { tailSeconds: 0.1 });
  compare(joined(second.state, result.frames), expected, 0);
});
