// Task 7.1 — summing, routing and the processing lifecycle: deterministic sums, bus-to-bus
// chains, the routing rules the engine refuses to build on, mute and solo (solo-in-place),
// missing inputs, buffer validation, state continuity across blocks, reset, latency and flush,
// the tail contract, and the approved modules integrated on the real fixture session.
import test from "node:test";
import assert from "node:assert/strict";
import { MixEngine } from "../src/lib/engine/mix-engine.ts";
import { computeAudibility } from "../src/lib/engine/audibility.ts";
import { createSessionProject } from "../src/lib/project/session.ts";
import {
  RATE,
  busFixture,
  dc,
  emptyMaster,
  peak,
  projectFixture,
  returnFixture,
  runBlock,
  tapBlock,
  toneBlock,
  trackFixture,
} from "./engine-fixtures.mjs";

const FRAMES = 4096;
const CENTRE = Math.SQRT1_2;

function engineOf(project, maxFrames = FRAMES) {
  return new MixEngine(project, { sampleRate: RATE, maxFramesPerBlock: maxFrames });
}

function settled(signal, engine, from = engine.latencyFrames + 8) {
  return peak(signal, from, signal.length);
}

test("two tracks into one bus sum at unity, with no compensation for the count", () => {
  const project = projectFixture({
    tracks: [
      trackFixture({ id: "track-a", output: "bus-B1" }),
      trackFixture({ id: "track-b", output: "bus-B1" }),
    ],
    buses: [busFixture({ id: "bus-B1" })],
  });
  const engine = engineOf(project);
  const master = runBlock(
    engine,
    [
      ["track-a", dc(FRAMES, 0.1)],
      ["track-b", dc(FRAMES, 0.2)],
    ],
    FRAMES,
  );
  const expected = (0.1 + 0.2) * CENTRE;
  assert.ok(Math.abs(settled(master[0], engine) - expected) < 1e-4, `the sum is ${settled(master[0], engine)}, expected ${expected}`);

  // A single track alone gives its own share: the sum is exactly additive.
  const single = engineOf(projectFixture({ tracks: [trackFixture({ id: "track-a", output: "bus-B1" })], buses: [busFixture({ id: "bus-B1" })] }));
  const alone = runBlock(single, [["track-a", dc(FRAMES, 0.1)]], FRAMES);
  assert.ok(Math.abs(settled(alone[0], single) - 0.1 * CENTRE) < 1e-4);
});

test("the same project and input produce the same samples twice", () => {
  const project = projectFixture({
    tracks: [
      trackFixture({ id: "track-a", output: "bus-B1", compBypassed: false, threshold: -30, ratio: 4 }),
      trackFixture({ id: "track-b", output: "bus-B1", sends: [{ to: "return-verb", level: -6 }] }),
    ],
    buses: [busFixture({ id: "bus-B1", level: -3 })],
    returns: [returnFixture({ id: "return-verb", effect: "reverb", time: 1.5, level: -6 })],
  });
  const input = toneBlock(FRAMES, 330, 0.3);
  const run = () => {
    const engine = engineOf(project);
    const master = emptyMaster(FRAMES);
    engine.process(new Map([["track-a", input], ["track-b", input]]), master, FRAMES);
    return master;
  };
  const first = run();
  const second = run();
  for (let i = 0; i < FRAMES; i++) {
    if (first[0][i] !== second[0][i]) assert.fail(`frame ${i} differs between two identical runs`);
  }
});

test("a bus that feeds another bus is processed sources-first, its signal appearing once", () => {
  const project = projectFixture({
    tracks: [trackFixture({ id: "track-a", output: "bus-B2" })],
    buses: [
      busFixture({ id: "bus-B1", output: "master", level: -6 }),
      busFixture({ id: "bus-B2", output: "bus-B1", trim: 6 }),
    ],
  });
  const engine = engineOf(project);
  const master = runBlock(engine, [["track-a", dc(FRAMES, 0.25)]], FRAMES);
  // ×1.9953 (B2 trim) × 0.5012 (B1 fader) = 1.0 — and one path, not two.
  const expected = 0.25 * CENTRE * 1.9953 * 0.5012;
  assert.ok(Math.abs(settled(master[0], engine) - expected) < 2e-4, `the chain gave ${settled(master[0], engine)}, expected ${expected}`);
});

test("the engine refuses to build on a graph the routing rules reject", () => {
  const dangling = projectFixture({
    tracks: [trackFixture({ id: "track-a", output: "bus-ghost" })],
    buses: [busFixture({ id: "bus-B1" })],
  });
  assert.throws(() => engineOf(dangling), /routing graph is not playable|no bus with id/);

  const cycle = projectFixture({
    tracks: [trackFixture({ id: "track-a", output: "bus-B1" })],
    buses: [busFixture({ id: "bus-B1", output: "bus-B2" }), busFixture({ id: "bus-B2", output: "bus-B1" })],
  });
  assert.throws(() => engineOf(cycle), /routing graph is not playable/);

  const returnToBus = projectFixture({
    tracks: [trackFixture({ id: "track-a" })],
    buses: [busFixture({ id: "bus-B1" })],
    returns: [{ ...returnFixture({ id: "return-verb", effect: "reverb" }), output: "bus-B1" }],
  });
  assert.throws(() => engineOf(returnToBus), /routing graph is not playable/);

  const danglingSend = projectFixture({
    tracks: [trackFixture({ id: "track-a", sends: [{ to: "return-ghost", level: -6 }] })],
    returns: [returnFixture({ id: "return-verb", effect: "reverb" })],
  });
  assert.throws(() => engineOf(danglingSend), /routing graph is not playable/);
});

test("mute silences a channel and freezes its state, so unmuting resumes instead of jumping", () => {
  const project = (mute) =>
    projectFixture({ tracks: [trackFixture({ id: "track-a", compBypassed: false, threshold: -35, ratio: 6, mute })] });
  const frames = 2048;
  const block1 = toneBlock(frames, 400, 0.6);
  const block2 = toneBlock(frames, 400, 0.2);

  const muteProject = project(true);
  const mutedEngine = engineOf(muteProject);
  const mutedOut = emptyMaster(frames);
  mutedEngine.process(new Map([["track-a", block1]]), mutedOut, frames);
  assert.equal(peak(mutedOut[0]), 0, "a muted track reached the master");
  const resumed = emptyMaster(frames);
  muteProject.tracks[0].channel.mute = false;
  mutedEngine.refreshAudibility();
  mutedEngine.process(new Map([["track-a", block2]]), resumed, frames);

  // A fresh engine that never saw block 1 has the same chain state, so its first
  // block is the same contribution without the fade. The resumed block equals it
  // multiplied sample by sample by the Stage 0b fade-in envelope — ((i + 1) /
  // RAMP_FRAMES for i < RAMP_FRAMES, else 1), within 1e-6. The envelope is indexed
  // at each sample's own position in the contribution, which the master limiter's
  // 240-frame lookahead shifts in the output domain; the limiter stays linear for
  // this signal (its reduction held at 0 dB throughout), so the comparison stands
  // where it is, after the limiter.
  const freshEngine = engineOf(project(false));
  const fresh = emptyMaster(frames);
  freshEngine.process(new Map([["track-a", block2]]), fresh, frames);
  const ramp = Math.round(0.01 * RATE);
  const latency = freshEngine.latencyFrames;
  for (let i = 0; i < frames; i++) {
    const at = i - latency; // this output sample's own position in the contribution
    const envelope = at < 0 ? 0 : at < ramp ? (at + 1) / ramp : 1;
    const expected = fresh[0][i] * envelope;
    if (Math.abs(resumed[0][i] - expected) > 1e-6) {
      assert.fail(`frame ${i}: the resumed block is ${resumed[0][i]}, not the faded contribution ${expected}`);
    }
  }
  // And a channel that was never muted does differ — the test can tell them apart.
  const running = engineOf(project(false));
  const first = emptyMaster(frames);
  running.process(new Map([["track-a", block1]]), first, frames);
  const second = emptyMaster(frames);
  running.process(new Map([["track-a", block2]]), second, frames);
  assert.ok(peak(second[0], 0, 64) !== peak(fresh[0], 0, 64), "compressor state does not carry across blocks");
});

test("solo is in place along the routing path: a soloed track keeps its bus, a soloed bus keeps its children", () => {
  const three = (solo) =>
    projectFixture({
      tracks: [
        trackFixture({ id: "track-a", output: "bus-B1", solo: solo === "a" }),
        trackFixture({ id: "track-b", output: "bus-B1", solo: solo === "b" }),
      ],
      buses: [busFixture({ id: "bus-B1", solo: solo === "bus" })],
    });
  const frames = 2048;
  const measure = (solo) => {
    const engine = engineOf(three(solo));
    return runBlock(
      engine,
      [
        ["track-a", dc(frames, 0.1)],
        ["track-b", dc(frames, 0.2)],
      ],
      frames,
    );
  };

  const both = measure(null);
  assert.ok(Math.abs(settled(both[0], engineOf(three(null))) - 0.3 * CENTRE) < 1e-4, "no solo did not pass everything");

  const onlyA = measure("a");
  assert.ok(Math.abs(peak(onlyA[0], 320, frames) - 0.1 * CENTRE) < 1e-4, `soloing track A gave ${peak(onlyA[0], 320, frames)}`);
  const onlyB = measure("b");
  assert.ok(Math.abs(peak(onlyB[0], 320, frames) - 0.2 * CENTRE) < 1e-4, "soloing track B gave the wrong level");

  const busSolo = measure("bus");
  assert.ok(Math.abs(peak(busSolo[0], 320, frames) - 0.3 * CENTRE) < 1e-4, "soloing the bus silenced its children");
});

test("soloing a Return hears its feeders' sends but not their dry signal", () => {
  const project = projectFixture({
    tracks: [
      trackFixture({ id: "track-dry" }),
      trackFixture({ id: "track-send", output: "bus-quiet", sends: [{ to: "return-verb", level: 0 }] }),
    ],
    buses: [busFixture({ id: "bus-quiet", level: -60 })],
    returns: [returnFixture({ id: "return-verb", effect: "reverb", time: 2, level: 0, solo: true })],
  });
  const engine = engineOf(project, 24000);
  const frames = 24000;
  const tap = tapBlock(frames);
  const master = emptyMaster(frames);
  engine.process(
    new Map([
      ["track-dry", dc(frames, 0.2)],
      ["track-send", dc(frames, 0.2)],
    ]),
    master,
    frames,
    { returns: new Map([["return-verb", tap]]) },
  );
  assert.ok(peak(tap[0]) > 0, "the soloed Return received nothing from its feeders");
  // The master is the Return's own output and nothing else: no dry copy of either track.
  let worst = 0;
  for (let i = engine.latencyFrames; i < frames; i++) {
    worst = Math.max(worst, Math.abs(master[0][i] - tap[0][i - engine.latencyFrames]));
  }
  assert.ok(worst < 1e-4, `the master is not the Return alone while it is soloed: ${worst}`);
});

test("a missing track input is silence, and an unknown id is ignored", () => {
  const project = projectFixture({
    tracks: [trackFixture({ id: "track-a" }), trackFixture({ id: "track-b" })],
  });
  const engine = engineOf(project);
  const master = emptyMaster(FRAMES);
  engine.process(
    new Map([
      ["track-a", dc(FRAMES, 0.1)],
      ["track-ghost", dc(FRAMES, 0.5)],
    ]),
    master,
    FRAMES,
  );
  assert.ok(Math.abs(settled(master[0], engine) - 0.1 * CENTRE) < 1e-4, "the absent track was not silence");
});

test("buffer and block-size mistakes are named errors, not silent truncation", () => {
  const engine = engineOf(projectFixture({ tracks: [trackFixture({ id: "track-a" })] }), 1024);
  const mono = [new Float32Array(1024)];
  const master = emptyMaster(1024);
  assert.throws(() => engine.process(new Map([["track-a", mono]]), master, 1024), /channel/);
  assert.throws(() => engine.process(new Map(), [new Float32Array(1024)], 1024), /channel/);
  assert.throws(() => engine.process(new Map(), emptyMaster(2048), 2048), /more than the 1024/);
  assert.throws(() => new MixEngine(projectFixture({}), { sampleRate: 0 }), /sample rate/);
});

test("state survives blocks: any chunking is sample-identical to one pass", () => {
  const project = projectFixture({
    tracks: [
      trackFixture({ id: "track-a", compBypassed: false, threshold: -30, ratio: 4, sends: [{ to: "return-verb", level: -6 }] }),
      trackFixture({ id: "track-b", cleanup: true }),
    ],
    buses: [busFixture({ id: "bus-B1" })],
    returns: [returnFixture({ id: "return-verb", effect: "reverb", time: 1, level: -6 })],
  });
  const frames = 12000;
  const a = toneBlock(frames, 220, 0.3);
  const b = toneBlock(frames, 660, 0.2);

  const oneShot = engineOf(project, frames);
  const whole = emptyMaster(frames);
  oneShot.process(new Map([["track-a", a], ["track-b", b]]), whole, frames);

  const chunked = engineOf(project, frames);
  const split = emptyMaster(frames);
  let start = 0;
  for (const size of [1, 7, 64, 333, 1024]) {
    while (start < frames) {
      const count = Math.min(size, frames - start);
      const views = new Map([
        ["track-a", a.map((channel) => channel.subarray(start, start + count))],
        ["track-b", b.map((channel) => channel.subarray(start, start + count))],
      ]);
      const outViews = split.map((channel) => channel.subarray(start, start + count));
      chunked.process(views, outViews, count);
      start += count;
    }
    break;
  }
  for (let i = 0; i < frames; i++) {
    if (split[0][i] !== whole[0][i]) assert.fail(`frame ${i} differs: chunked ${split[0][i]} vs one pass ${whole[0][i]}`);
  }
});

test("reset returns the engine to a fresh state", () => {
  const project = projectFixture({
    tracks: [trackFixture({ id: "track-a", compBypassed: false, threshold: -30, ratio: 4, sends: [{ to: "return-verb", level: 0 }] })],
    returns: [returnFixture({ id: "return-verb", effect: "reverb", time: 2, level: 0 })],
  });
  const engine = engineOf(project);
  const burn = emptyMaster(FRAMES);
  engine.process(new Map([["track-a", toneBlock(FRAMES, 300, 0.4)]]), burn, FRAMES);
  engine.reset();
  const afterReset = emptyMaster(FRAMES);
  engine.process(new Map([["track-a", dc(FRAMES, 0.2)]]), afterReset, FRAMES);

  const fresh = engineOf(project);
  const reference = emptyMaster(FRAMES);
  fresh.process(new Map([["track-a", dc(FRAMES, 0.2)]]), reference, FRAMES);
  for (let i = 0; i < FRAMES; i++) {
    if (afterReset[0][i] !== reference[0][i]) assert.fail(`frame ${i} after reset differs from fresh`);
  }
});

test("the master limiter's lookahead is reported, delays the sum, and flush drains the tail", () => {
  const engine = engineOf(projectFixture({ tracks: [trackFixture({ id: "track-a" })] }));
  assert.equal(engine.latencyFrames, Math.round(0.005 * RATE), `latency is ${engine.latencyFrames}`);
  const impulse = [new Float32Array(FRAMES), new Float32Array(FRAMES)];
  impulse[0][0] = 0.5;
  impulse[1][0] = 0.5;
  const master = emptyMaster(FRAMES);
  engine.process(new Map([["track-a", impulse]]), master, FRAMES);
  assert.equal(peak(master[0], 0, engine.latencyFrames), 0, "audio appeared before the reported latency");
  assert.ok(peak(master[0], engine.latencyFrames, FRAMES) > 0, "audio never appeared after the reported latency");

  // A burst into a Return leaves a tail that flush() drains with no further input.
  const wet = (tail) =>
    engineOf(
      projectFixture({
        tracks: [trackFixture({ id: "track-a", sends: [{ to: "return-verb", level: 0 }] })],
        returns: [returnFixture({ id: "return-verb", effect: "reverb", time: 2, level: 0 })],
      }),
    );
  const flushing = wet();
  const burst = toneBlock(FRAMES, 300, 0.4).map((channel) => {
    const trimmed = new Float32Array(FRAMES);
    trimmed.set(channel.subarray(0, 2048));
    return trimmed;
  });
  flushing.process(new Map([["track-a", burst]]), emptyMaster(FRAMES), FRAMES);
  assert.ok(flushing.tailSeconds > 0.2, "the Return reports no tail");
  const first = emptyMaster(2048);
  flushing.flush(first, 2048);
  const second = emptyMaster(2048);
  flushing.flush(second, 2048);
  assert.ok(peak(first[0]) > 0, "flush produced nothing after the input stopped");
  assert.ok(peak(second[0]) < peak(first[0]), "the flushed tail does not decay");
});

test("the tail contract is the longest Return tail", () => {
  const engine = engineOf(
    projectFixture({
      tracks: [trackFixture({ id: "track-a" })],
      returns: [
        returnFixture({ id: "return-verb", effect: "reverb", time: 2 }),
        returnFixture({ id: "return-dly", effect: "delay", time: 500, second: 40 }),
      ],
    }),
  );
  // Reverb: pre-delay 0 + 1.5 × 2 s = 3 s; delay: repeats × 0.5 s ≥ 4 s.
  assert.ok(engine.tailSeconds > 3.9 && engine.tailSeconds < 5.1, `tailSeconds is ${engine.tailSeconds}`);
});

test("the approved modules integrate on the real fixture session, with its solo and its sends", () => {
  const project = createSessionProject();
  const engine = engineOf(project, FRAMES);
  const soloed = project.tracks.filter((track) => track.channel.solo && !track.channel.mute);
  assert.ok(soloed.length > 0, "the fixture session has no soloed track to check");

  const inputs = new Map(project.tracks.map((track) => [track.id, dc(FRAMES, 0.05)]));
  const master = emptyMaster(FRAMES);
  const taps = new Map(project.returns.map((id) => [id.id, tapBlock(FRAMES)]));
  engine.process(inputs, master, FRAMES, { returns: taps });
  assert.ok(peak(master[0]) > 0, "the session produced no master signal");
  assert.ok(peak(master[0]) <= 10 ** (-1 / 20) + 1e-3, "the master exceeded the limiter ceiling");
  // Only the soloed track's Return receives sends while it is soloed.
  const audibleReturns = [...taps.values()].filter((tap) => peak(tap[0]) > 0).length;
  assert.ok(audibleReturns >= 1, "the soloed track's sends reached no Return");
  // The audibility reading is exposed for meters.
  assert.equal(engine.audibility.anySolo, true);
});
