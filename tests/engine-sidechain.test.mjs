// Task 7.2 — sidechain routing: the detector-signal path. Key selection (compressor and
// dynamic EQ, key present or absent), main audio staying the processed signal, routing
// validation (valid, unknown, self, Return, duplicate, one source to many), no audible
// duplicate, assignment changes and removal, block alignment and stale-key safety,
// mute/solo interaction, a bus destination, chunked continuity, no new latency, and a
// block loop that allocates nothing.
import test from "node:test";
import assert from "node:assert/strict";
import { MixEngine } from "../src/lib/engine/mix-engine.ts";
import { validateSidechains, sidechainSourceOf } from "../src/lib/engine/sidechain.ts";
import {
  RATE,
  busFixture,
  dc,
  emptyMaster,
  peak,
  projectFixture,
  rms,
  tapBlock,
  toneBlock,
  trackFixture,
} from "./engine-fixtures.mjs";

const FRAMES = 4096;
const CENTRE = Math.SQRT1_2;

function engineOf(project, maxFrames = FRAMES) {
  return new MixEngine(project, { sampleRate: RATE, maxFramesPerBlock: maxFrames });
}

/** A compressor that bites hard, so a keyed reduction is unmistakable. */
const HOT_COMP = { compBypassed: false, threshold: -30, ratio: 6, attack: 1, release: 40 };

/**
 * Destination on B1 (neutral bus, tapped), key source sent to a bus at −60 dB so it can
 * be audible for the detector while contributing nothing to the master.
 */
function keyedProject({ sidechains, destination = HOT_COMP, solo = null, keyMute = false } = {}) {
  return projectFixture({
    tracks: [
      trackFixture({ id: "track-dest", output: "bus-B1", ...destination, solo: solo === "dest" }),
      trackFixture({ id: "track-key", output: "bus-silent", mute: keyMute, solo: solo === "key" }),
      ...(solo === "other" ? [trackFixture({ id: "track-other", output: "master", solo: true })] : []),
    ],
    buses: [busFixture({ id: "bus-B1" }), busFixture({ id: "bus-silent", level: -60 })],
    sidechains,
  });
}

function render(engine, inputs, frames = FRAMES) {
  const master = emptyMaster(frames);
  const tap = tapBlock(frames);
  engine.process(inputs, master, frames, { buses: new Map([["bus-B1", tap]]) });
  return { master, tap };
}

// --- key selection ---------------------------------------------------------------

test("with no key assigned the compressor detects from its own input", () => {
  const engine = engineOf(keyedProject());
  const quiet = dc(FRAMES, 0.02); // −34 dBFS: below the −30 dBFS threshold
  const loud = dc(FRAMES, 0.5);
  render(engine, new Map([["track-dest", quiet], ["track-key", loud]]), FRAMES);
  assert.ok(engine.trackReductionDb("track-dest") < 0.05, `self-detection pulled ${engine.trackReductionDb("track-dest")} dB from a quiet input`);
});

test("an external key drives the compressor's detector while the main audio stays the processed signal", () => {
  const engine = engineOf(
    keyedProject({ sidechains: [{ source: "track-key", destination: "track-dest", processor: "compressor" }] }),
  );
  const quiet = dc(FRAMES, 0.02); // below threshold on its own
  const key = dc(FRAMES, 0.5); // −6 dBFS: well over it
  const { tap } = render(engine, new Map([["track-dest", quiet], ["track-key", key]]), FRAMES);

  const reduction = engine.trackReductionDb("track-dest");
  assert.ok(reduction > 10, `the key produced only ${reduction} dB of reduction`);

  // What comes out is the destination's own audio times the reported gain — the key is
  // never the signal being processed, and never appears in the output.
  const gain = 10 ** (-reduction / 20);
  const expected = 0.02 * CENTRE * gain;
  const measured = peak(tap[0], 512, FRAMES);
  assert.ok(Math.abs(measured - expected) < 1e-4, `output ${measured} is not the destination at −${reduction.toFixed(1)} dB (${expected})`);
  assert.ok(measured < 0.02 * CENTRE * 0.5, "the output did not follow the keyed gain reduction");
});

test("with no key assigned the dynamic EQ detects from its own input", () => {
  const project = keyedProject({
    destination: { dynamic: { lmf: 12 }, bands: { lmf: [500, 0, 1] } },
  });
  const engine = engineOf(project);
  const quiet = toneBlock(FRAMES, 500, 0.02); // −34 dBFS at the band: under the −24 dBFS gate
  const key = toneBlock(FRAMES, 500, 0.6);
  const { tap } = render(engine, new Map([["track-dest", quiet], ["track-key", key]]), FRAMES);
  const reference = render(
    engineOf(keyedProject({ destination: { dynamic: { lmf: 12 }, bands: { lmf: [500, 0, 1] } } })),
    new Map([["track-dest", quiet], ["track-key", key]]),
    FRAMES,
  );
  assert.ok(Math.abs(rms(tap[0], 1024, FRAMES) - rms(reference.tap[0], 1024, FRAMES)) < 1e-6, "the unkeyed EQ changed with an unrelated key source present");
});

test("an external key drives the dynamic EQ's detector while its own bands process the main audio", () => {
  const project = keyedProject({
    destination: { dynamic: { lmf: 12 }, bands: { lmf: [500, 0, 1] } },
    sidechains: [{ source: "track-key", destination: "track-dest", processor: "dynamic-eq" }],
  });
  const engine = engineOf(project);
  const quiet = toneBlock(FRAMES, 500, 0.02);
  const key = toneBlock(FRAMES, 500, 0.6);
  const keyed = render(engine, new Map([["track-dest", quiet], ["track-key", key]]), FRAMES);

  const selfEngine = engineOf(
    keyedProject({ destination: { dynamic: { lmf: 12 }, bands: { lmf: [500, 0, 1] } } }),
  );
  const self = render(selfEngine, new Map([["track-dest", quiet], ["track-key", key]]), FRAMES);

  const unkeyed = rms(self.tap[0], 2048, FRAMES);
  const withKey = rms(keyed.tap[0], 2048, FRAMES);
  assert.ok(unkeyed > 0, "the unkeyed reference is silent");
  const drop = 20 * Math.log10(unkeyed / withKey);
  assert.ok(drop > 6, `the keyed EQ dipped only ${drop.toFixed(1)} dB (depth is 12 dB)`);
  assert.ok(drop < 14, `the keyed EQ dipped ${drop.toFixed(1)} dB — more than its 12 dB depth`);
});

// --- routing validation -----------------------------------------------------------

test("validation accepts a valid edge and names every rejection reason", () => {
  const base = {
    tracks: [trackFixture({ id: "track-a" }), trackFixture({ id: "track-b" })],
    buses: [busFixture({ id: "bus-B1" })],
    returns: [],
  };
  const good = validateSidechains(projectFixture({ ...base, sidechains: [{ source: "track-b", destination: "track-a", processor: "compressor" }] }));
  assert.equal(good.ok, true);
  assert.equal(good.problems.length, 0);
  assert.equal(sidechainSourceOf(good, "track-a", "compressor"), "track-b");

  const cases = [
    [{ source: "track-ghost", destination: "track-a", processor: "compressor" }, "unknown-source"],
    [{ source: "track-b", destination: "bus-ghost", processor: "compressor" }, "unknown-destination"],
    [{ source: "track-b", destination: "track-b", processor: "compressor" }, "self-sidechain"],
    [{ source: "bus-B1", destination: "track-a", processor: "compressor" }, "unknown-source"],
  ];
  for (const [edge, reason] of cases) {
    const verdict = validateSidechains(projectFixture({ ...base, sidechains: [edge] }));
    assert.equal(verdict.ok, false, `${reason} was accepted`);
    assert.equal(verdict.problems[0].reason, reason);
    assert.equal(verdict.edges.length, 0, `${reason} still produced an edge`);
    assert.match(verdict.problems[0].message, /Alloy Sidechain/);
  }
});

test("a Return cannot be a destination, and a duplicate assignment is refused not overridden", () => {
  const project = projectFixture({
    tracks: [trackFixture({ id: "track-a" }), trackFixture({ id: "track-b" }), trackFixture({ id: "track-c" })],
    buses: [busFixture({ id: "bus-B1" })],
    returns: [{ ...projectFixture().tracks[0], kind: "return", id: "return-verb", channel: {}, chain: {} }],
  });
  const withReturn = validateSidechains({
    ...project,
    sidechains: [{ source: "track-b", destination: "return-verb", processor: "compressor" }],
  });
  assert.equal(withReturn.problems[0].reason, "unsupported-destination");

  const duplicated = validateSidechains({
    ...project,
    sidechains: [
      { source: "track-b", destination: "track-a", processor: "compressor" },
      { source: "track-c", destination: "track-a", processor: "compressor" },
    ],
  });
  assert.equal(duplicated.ok, false);
  assert.equal(duplicated.problems[0].reason, "duplicate-assignment");
  assert.equal(sidechainSourceOf(duplicated, "track-a", "compressor"), "track-b", "the first assignment must win");
});

test("an unknown source falls back to self-detection and is reported, never silently connected", () => {
  const engine = engineOf(
    keyedProject({ sidechains: [{ source: "track-ghost", destination: "track-dest", processor: "compressor" }] }),
  );
  assert.equal(engine.sidechainVerdict.ok, false);
  assert.equal(engine.sidechainVerdict.problems[0].reason, "unknown-source");

  const quiet = dc(FRAMES, 0.02);
  const loud = dc(FRAMES, 0.5);
  render(engine, new Map([["track-dest", quiet], ["track-key", loud]]), FRAMES);
  assert.ok(engine.trackReductionDb("track-dest") < 0.05, "a broken edge still keyed the compressor");
});

test("a self-sidechain is rejected and leaves the processor on its own input", () => {
  const engine = engineOf(
    keyedProject({ sidechains: [{ source: "track-dest", destination: "track-dest", processor: "compressor" }] }),
  );
  assert.equal(engine.sidechainVerdict.problems[0].reason, "self-sidechain");
  render(engine, new Map([["track-dest", dc(FRAMES, 0.02)]]), FRAMES);
  assert.ok(engine.trackReductionDb("track-dest") < 0.05, "a self-key produced reduction");
});

test("one source can key several destinations, and the key never becomes an audible duplicate", () => {
  const two = (bypassed) =>
    projectFixture({
      tracks: [
        trackFixture({ id: "track-dest", output: "bus-B1", ...HOT_COMP, compBypassed: bypassed }),
        trackFixture({ id: "track-dest2", output: "bus-B1", ...HOT_COMP, compBypassed: bypassed }),
        trackFixture({ id: "track-key", output: "bus-silent" }),
      ],
      buses: [busFixture({ id: "bus-B1" }), busFixture({ id: "bus-silent", level: -60 })],
    });
  const edges = [
    { source: "track-key", destination: "track-dest", processor: "compressor" },
    { source: "track-key", destination: "track-dest2", processor: "compressor" },
  ];
  const engine = engineOf({ ...two(false), sidechains: edges });
  const inputs = new Map([
    ["track-dest", dc(FRAMES, 0.02)],
    ["track-dest2", dc(FRAMES, 0.02)],
    ["track-key", dc(FRAMES, 0.5)],
  ]);
  render(engine, inputs, FRAMES);
  const first = engine.trackReductionDb("track-dest");
  const second = engine.trackReductionDb("track-dest2");
  assert.ok(first > 10 && second > 10, `one source did not key both: ${first} / ${second}`);
  assert.ok(Math.abs(first - second) < 1e-9, "the same key produced different reductions");

  // With both destinations bypassed, the key must change nothing in the output: a
  // detector edge never carries audio.
  const withEdge = render(engineOf({ ...two(true), sidechains: edges }), inputs, FRAMES);
  const without = render(engineOf(two(true)), inputs, FRAMES);
  for (let i = 0; i < FRAMES; i++) {
    if (withEdge.master[0][i] !== without.master[0][i]) assert.fail(`frame ${i}: the sidechain altered the audible mix`);
  }
});

test("an assignment can be changed and removed without rebuilding the engine", () => {
  const engine = engineOf(keyedProject());
  const dest = dc(FRAMES, 0.02);
  const hot = dc(FRAMES, 0.5);
  const cold = dc(FRAMES, 0.001);

  render(engine, new Map([["track-dest", dest], ["track-key", hot]]), FRAMES);
  assert.ok(engine.trackReductionDb("track-dest") < 0.05, "unassigned engine already had a key");

  engine.refreshSidechains([{ source: "track-key", destination: "track-dest", processor: "compressor" }]);
  assert.equal(engine.sidechainVerdict.ok, true);
  render(engine, new Map([["track-dest", dest], ["track-key", hot]]), FRAMES);
  assert.ok(engine.trackReductionDb("track-dest") > 10, "the new assignment did not take effect");

  // Removing it returns the processor to self-detection on the next block.
  engine.refreshSidechains([]);
  assert.equal(engine.sidechainVerdict.plan.size, 0);
  render(engine, new Map([["track-dest", dest], ["track-key", cold]]), FRAMES);
  assert.ok(engine.trackReductionDb("track-dest") < 0.05, "the removed assignment still keyed the compressor");
});

// --- timing -----------------------------------------------------------------------

test("the key is block-aligned: it acts on the same block, and adds no latency", () => {
  const engine = engineOf(
    keyedProject({ sidechains: [{ source: "track-key", destination: "track-dest", processor: "compressor" }] }),
  );
  assert.equal(engine.latencyFrames, Math.round(0.005 * RATE), "sidechains changed the engine's latency");
  // The key starts at frame 0 of block 1; the reduction must be there inside block 1.
  render(engine, new Map([["track-dest", dc(FRAMES, 0.02)], ["track-key", dc(FRAMES, 0.5)]]), FRAMES);
  assert.ok(engine.trackReductionDb("track-dest") > 10, "the key acted on a later block");
});

test("a key buffer is never stale: a source that disappears stops keying immediately", () => {
  const engine = engineOf(
    keyedProject({ sidechains: [{ source: "track-key", destination: "track-dest", processor: "compressor" }] }),
  );
  const dest = dc(FRAMES, 0.02);
  render(engine, new Map([["track-dest", dest], ["track-key", dc(FRAMES, 0.5)]]), FRAMES);
  const keyed = engine.trackReductionDb("track-dest");
  assert.ok(keyed > 10);

  // The key source is simply absent from the next block: the buffer must be cleared,
  // not replayed.
  render(engine, new Map([["track-dest", dest]]), FRAMES);
  const after = engine.trackReductionDb("track-dest");
  assert.ok(after < 1, `the previous block's key was reused: ${after} dB of reduction`);

  // And with the source present but silent, the same must hold.
  render(engine, new Map([["track-dest", dest], ["track-key", dc(FRAMES, 0)]]), FRAMES);
  assert.ok(engine.trackReductionDb("track-dest") < 1, "a silent source kept the detector pinned");
});

test("chunked processing with a sidechain is sample-identical to one pass", () => {
  const project = keyedProject({
    sidechains: [
      { source: "track-key", destination: "track-dest", processor: "compressor" },
      { source: "track-key", destination: "track-dest", processor: "dynamic-eq" },
    ],
    destination: { ...HOT_COMP, dynamic: { lmf: 8 }, bands: { lmf: [500, 0, 1] } },
  });
  const frames = 6000;
  const dest = toneBlock(frames, 500, 0.3);
  const key = toneBlock(frames, 300, 0.6);

  const whole = engineOf(project, frames);
  const oneShot = emptyMaster(frames);
  whole.process(new Map([["track-dest", dest], ["track-key", key]]), oneShot, frames);

  const split = engineOf(project, frames);
  const chunked = emptyMaster(frames);
  for (let start = 0; start < frames; start += 700) {
    const count = Math.min(700, frames - start);
    split.process(
      new Map([
        ["track-dest", dest.map((channel) => channel.subarray(start, start + count))],
        ["track-key", key.map((channel) => channel.subarray(start, start + count))],
      ]),
      chunked.map((channel) => channel.subarray(start, start + count)),
      count,
    );
  }
  for (let i = 0; i < frames; i++) {
    if (chunked[0][i] !== oneShot[0][i]) assert.fail(`frame ${i} differs between chunked and one pass`);
  }
});

// --- mute, solo and bus destinations -----------------------------------------------

test("the key follows Task 7.1 audibility: a muted source keys nothing", () => {
  const engine = engineOf(
    keyedProject({
      sidechains: [{ source: "track-key", destination: "track-dest", processor: "compressor" }],
      keyMute: true,
    }),
  );
  render(engine, new Map([["track-dest", dc(FRAMES, 0.02)], ["track-key", dc(FRAMES, 0.5)]]), FRAMES);
  assert.ok(engine.trackReductionDb("track-dest") < 0.05, "a muted source still keyed the compressor");
});

test("the key follows Task 7.1 audibility: a solo-excluded source keys nothing", () => {
  const engine = engineOf(
    keyedProject({
      sidechains: [{ source: "track-key", destination: "track-dest", processor: "compressor" }],
      solo: "other",
    }),
  );
  render(
    engine,
    new Map([["track-dest", dc(FRAMES, 0.02)], ["track-key", dc(FRAMES, 0.5)], ["track-other", dc(FRAMES, 0.1)]]),
    FRAMES,
  );
  assert.ok(engine.trackReductionDb("track-dest") < 0.05, "a solo-excluded source still keyed the compressor");
});

test("a bus compressor can be keyed from a track", () => {
  const project = projectFixture({
    tracks: [
      trackFixture({ id: "track-dest", output: "bus-B1" }),
      trackFixture({ id: "track-key", output: "bus-silent" }),
    ],
    buses: [busFixture({ id: "bus-B1", ...HOT_COMP }), busFixture({ id: "bus-silent", level: -60 })],
    sidechains: [{ source: "track-key", destination: "bus-B1", processor: "compressor" }],
  });
  const engine = engineOf(project);
  assert.equal(engine.sidechainVerdict.ok, true);
  render(engine, new Map([["track-dest", dc(FRAMES, 0.02)], ["track-key", dc(FRAMES, 0.5)]]), FRAMES);
  assert.ok(engine.busReductionDb("bus-B1") > 10, `the bus was not keyed: ${engine.busReductionDb("bus-B1")}`);
});

// --- regression -------------------------------------------------------------------

test("the block loop still allocates nothing", () => {
  // A thrown Error is the error path, not an allocation in the audio path.
  const source = MixEngine.prototype.process.toString().replace(/new Error\(/g, "");
  assert.ok(!/\bnew [A-Z]/.test(source), "process() constructs an object");
  assert.ok(!/\.map\(/.test(source) && !/\.filter\(/.test(source), "process() builds an array");
});
