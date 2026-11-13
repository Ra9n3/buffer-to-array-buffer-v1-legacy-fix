// Stage 0 — live mixer gains, engine level, no DOM.
//
// T1 and T2 pin the Step 2 contract: a control that changes between blocks is a
// linear ramp across the block that follows — it starts between the old and the
// new gain, ends at the new gain, and moves monotonically — while an unchanged
// control keeps the constant multiply. T6 pins the no-edit identity: the same
// fixture rendered by the ORIGINAL engine (the stored golden) must be produced
// bit-identically by the Stage 0 engine.
//
// T3, T4 and T5 (the mute/solo fades) are deliberately absent: Step 3 was
// stopped — its unmute fade-in cannot coexist with the existing bit-exact
// resumption test in engine-routing.test.mjs, and the task forbids changing
// existing expectations. See the Stage 0 report.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { MixEngine } from "../src/lib/engine/mix-engine.ts";
import { renderProject } from "../src/lib/engine/render.ts";
import { RATE, busFixture, dc, emptyMaster, projectFixture, returnFixture, tapBlock, trackFixture } from "./engine-fixtures.mjs";
import { t6Project, t6Sources } from "./stage0-render-fixture.mjs";

const CENTRE = Math.cos(Math.PI / 4); // the pan law's centre gain, the engine's own arithmetic

/** Assert a tap block is one constant DC value on both channels, and return it. */
function constantOf(tap, frames, label) {
  const value = tap[0][0];
  for (let c = 0; c < 2; c++) {
    for (let i = 0; i < frames; i++) {
      if (tap[c][i] !== value) assert.fail(`${label}: sample ${i} of channel ${c} is ${tap[c][i]}, not the constant ${value}`);
    }
  }
  return value;
}

/**
 * The per-sample gain of one channel of a ramped block, normalised by the unity
 * block's value, checked against the Step 2 contract: the first sample strictly
 * between the old and the new gain, the last at the new gain within 1e-6, and
 * monotonic throughout.
 */
function assertRamp(channel, base, frames, from, target, label) {
  const rising = target > from;
  const gain = (i) => channel[i] / base;
  const first = gain(0);
  assert.ok(
    rising ? first > from && first < target : first < from && first > target,
    `${label}: the block starts at ${first}, not between ${from} and ${target}`,
  );
  const last = gain(frames - 1);
  assert.ok(Math.abs(last - target) < 1e-6, `${label}: the block ends at ${last}, not the new gain ${target} (within 1e-6)`);
  for (let i = 1; i < frames; i++) {
    const previous = gain(i - 1);
    const here = gain(i);
    assert.ok(rising ? here >= previous : here <= previous, `${label}: sample ${i} moved the wrong way (${previous} → ${here})`);
  }
}

/* --- T1: the channel fader ------------------------------------------------------------------ */

test("T1 a fader edit ramps across the next block: between the gains at the start, at the new gain by the end, monotonic", () => {
  const frames = 4096;
  const project = projectFixture({ tracks: [trackFixture({ id: "track-a" })] });
  const engine = new MixEngine(project, { sampleRate: RATE, maxFramesPerBlock: frames });
  const input = dc(frames, 0.5);

  const first = { tracks: new Map([["track-a", tapBlock(frames)]]) };
  engine.process(new Map([["track-a", input]]), emptyMaster(frames), frames, first);
  const base = constantOf(first.tracks.get("track-a"), frames, "block 1");

  project.tracks[0].channel.level = -6;
  const second = { tracks: new Map([["track-a", tapBlock(frames)]]) };
  engine.process(new Map([["track-a", input]]), emptyMaster(frames), frames, second);
  const tap = second.tracks.get("track-a");

  assertRamp(tap[0], base, frames, 1, 10 ** (-6 / 20), "T1 fader, left");
  assertRamp(tap[1], base, frames, 1, 10 ** (-6 / 20), "T1 fader, right");
});

/* --- T2: trim, pan (both sides), bus balance, Return level ----------------------------------- */

test("T2 a trim edit ramps across the next block", () => {
  const frames = 4096;
  const project = projectFixture({ tracks: [trackFixture({ id: "track-a" })] });
  const engine = new MixEngine(project, { sampleRate: RATE, maxFramesPerBlock: frames });
  const input = dc(frames, 0.5);

  const first = { tracks: new Map([["track-a", tapBlock(frames)]]) };
  engine.process(new Map([["track-a", input]]), emptyMaster(frames), frames, first);
  const base = constantOf(first.tracks.get("track-a"), frames, "block 1");

  project.tracks[0].channel.trim = -6;
  const second = { tracks: new Map([["track-a", tapBlock(frames)]]) };
  engine.process(new Map([["track-a", input]]), emptyMaster(frames), frames, second);
  assertRamp(second.tracks.get("track-a")[0], base, frames, 1, 10 ** (-6 / 20), "T2 trim");
});

test("T2 a pan edit ramps the two sides separately: L falls, R rises", () => {
  const frames = 4096;
  const project = projectFixture({ tracks: [trackFixture({ id: "track-a" })] });
  const engine = new MixEngine(project, { sampleRate: RATE, maxFramesPerBlock: frames });
  const input = dc(frames, 0.5);

  const first = { tracks: new Map([["track-a", tapBlock(frames)]]) };
  engine.process(new Map([["track-a", input]]), emptyMaster(frames), frames, first);
  constantOf(first.tracks.get("track-a"), frames, "block 1"); // centre pan: both sides equal

  project.tracks[0].channel.pan = 50;
  const second = { tracks: new Map([["track-a", tapBlock(frames)]]) };
  engine.process(new Map([["track-a", input]]), emptyMaster(frames), frames, second);
  const tap2 = second.tracks.get("track-a");

  // Normalised by the input's 0.5 DC, the per-side gain is the pan law itself.
  const theta = ((50 + 100) / 200) * (Math.PI / 2); // the engine's own pan arithmetic
  assertRamp(tap2[0], 0.5, frames, CENTRE, Math.cos(theta), "T2 pan, left");
  assertRamp(tap2[1], 0.5, frames, CENTRE, Math.sin(theta), "T2 pan, right");
});

test("T2 a bus BALANCE edit ramps only the attenuated side; the untouched side is bit-identical", () => {
  const frames = 4096;
  const project = projectFixture({
    tracks: [trackFixture({ id: "track-a", output: "bus-B1" })],
    buses: [busFixture({ id: "bus-B1" })],
  });
  const engine = new MixEngine(project, { sampleRate: RATE, maxFramesPerBlock: frames });
  const input = dc(frames, 0.5);

  const first = { buses: new Map([["bus-B1", tapBlock(frames)]]) };
  engine.process(new Map([["track-a", input]]), emptyMaster(frames), frames, first);
  const tap1 = first.buses.get("bus-B1");
  const base = constantOf(tap1, frames, "block 1");

  project.buses[0].channel.balance = -50; // the right side attenuates to 0.5, the left stays at unity
  const second = { buses: new Map([["bus-B1", tapBlock(frames)]]) };
  engine.process(new Map([["track-a", input]]), emptyMaster(frames), frames, second);
  const tap2 = second.buses.get("bus-B1");

  for (let i = 0; i < frames; i++) {
    if (tap2[0][i] !== tap1[0][i]) assert.fail(`T2 balance: the untouched left side moved at sample ${i}`);
  }
  assertRamp(tap2[1], base, frames, 1, 0.5, "T2 balance, right");
});

test("T2 a Return level edit ramps across the next block", () => {
  // The Return is a 250 ms delay at 0 % feedback — an exact one-block delay line —
  // so block N's tap is the previous block's send sum, scaled by the Return level.
  const frames = 12000;
  const project = projectFixture({
    tracks: [trackFixture({ id: "track-a", sends: [{ to: "return-dly", level: 0 }] })],
    returns: [returnFixture({ id: "return-dly", effect: "delay", time: 250, second: 0 })],
  });
  const engine = new MixEngine(project, { sampleRate: RATE, maxFramesPerBlock: frames });
  const input = dc(frames, 0.5);

  engine.process(new Map([["track-a", input]]), emptyMaster(frames), frames, {
    returns: new Map([["return-dly", tapBlock(frames)]]),
  });
  const second = { returns: new Map([["return-dly", tapBlock(frames)]]) };
  engine.process(new Map([["track-a", input]]), emptyMaster(frames), frames, second);
  const base = constantOf(second.returns.get("return-dly"), frames, "block 2 (the delayed send)");

  project.returns[0].channel.level = -6;
  const third = { returns: new Map([["return-dly", tapBlock(frames)]]) };
  engine.process(new Map([["track-a", input]]), emptyMaster(frames), frames, third);
  assertRamp(third.returns.get("return-dly")[0], base, frames, 1, 10 ** (-6 / 20), "T2 Return level");
});

/* --- T6: no-edit render identity ------------------------------------------------------------ */

test("T6 a render of the unchanged fixture project is bit-identical to the copy produced by the original code", async () => {
  const meta = JSON.parse(readFileSync(new URL("./fixtures/stage0-render-golden.json", import.meta.url), "utf8"));
  const goldenBuffer = readFileSync(new URL("./fixtures/stage0-render-golden.f32", import.meta.url));
  const golden = new Float32Array(
    goldenBuffer.buffer.slice(goldenBuffer.byteOffset, goldenBuffer.byteOffset + goldenBuffer.byteLength),
  );

  const chunks = [];
  const result = await renderProject(t6Project(), t6Sources(), {
    sampleRate: meta.sampleRate,
    chunkFrames: meta.chunkFrames,
    write(chunk) {
      chunks.push([
        Float32Array.from(chunk.channels[0].subarray(0, chunk.frames)),
        Float32Array.from(chunk.channels[1].subarray(0, chunk.frames)),
      ]);
    },
  });
  assert.equal(result.frames, meta.frames, "the render length changed");

  const actual = new Float32Array(result.frames * 2);
  let at = 0;
  for (const [l, r] of chunks) {
    actual.set(l, at);
    actual.set(r, at + result.frames);
    at += l.length;
  }
  assert.equal(at, result.frames, "the joined chunks do not cover the render");

  // Bit-identical, sample for sample.
  for (let i = 0; i < actual.length; i++) {
    if (actual[i] !== golden[i]) {
      assert.fail(`T6: sample ${i} differs from the golden copy: ${actual[i]} vs ${golden[i]}`);
    }
  }
  // And the golden's own digest, as a second, whole-stream proof.
  const actualBytes = new Uint8Array(actual.buffer, actual.byteOffset, actual.byteLength);
  assert.equal(
    createHash("sha256").update(actualBytes).digest("hex"),
    meta.sha256,
    "the rendered stream's sha256 differs from the golden copy",
  );
});
