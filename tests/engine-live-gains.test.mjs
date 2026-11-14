// Stage 0 — live mixer gains, engine level, no DOM.
//
// T1 and T2 pin the Step 2 contract: a control that changes between blocks is a
// linear ramp across the block that follows — it starts between the old and the
// new gain, ends at the new gain, and moves monotonically — while an unchanged
// control keeps the constant multiply. T6 pins the no-edit identity: the same
// fixture rendered by the ORIGINAL engine (the stored golden) must be produced
// bit-identically by the Stage 0 engine.
//
// Stage 0b adds what Step 3 of Stage 0 could not: T3 (a mute fades out), T4 (an
// unmute fades in) and T5 (a soloed Return fades the dry path out while the send
// path stays at unity) — the one bit-exact resumption comparison in
// engine-routing.test.mjs was changed by Stage 0b to the fade-in envelope it now
// expects. T7 pins the no-transition identity: a muted track and an unmuted
// track, ten blocks, no change — bit-identical to the golden the code BEFORE
// Stage 0b produced (commit 5857fec).
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { MixEngine } from "../src/lib/engine/mix-engine.ts";
import { renderProject } from "../src/lib/engine/render.ts";
import { RATE, busFixture, dc, emptyMaster, peak, projectFixture, returnFixture, tapBlock, trackFixture } from "./engine-fixtures.mjs";
import { t6Project, t6Sources } from "./stage0-render-fixture.mjs";
import { t7Project, t7Sources } from "./stage0b-fade-fixture.mjs";

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

/* --- T3, T4, T5: the Stage 0b mute/solo fades ----------------------------------------------- */

test("T3 a mute fades the contribution out: monotonic to 0 within the ramp, exactly 0 for the rest of the block and the next block", () => {
  const frames = 2048;
  const ramp = Math.round(0.01 * RATE);
  const project = projectFixture({ tracks: [trackFixture({ id: "track-a" })] });
  const engine = new MixEngine(project, { sampleRate: RATE, maxFramesPerBlock: frames });
  const input = dc(frames, 0.5);

  const first = { tracks: new Map([["track-a", tapBlock(frames)]]) };
  const master1 = emptyMaster(frames);
  engine.process(new Map([["track-a", input]]), master1, frames, first);
  const base = constantOf(first.tracks.get("track-a"), frames, "block 1");
  assert.ok(base > 0, "block 1 carried no contribution to fade out");

  project.tracks[0].channel.mute = true;
  engine.refreshAudibility();
  const second = { tracks: new Map([["track-a", tapBlock(frames)]]) };
  const master2 = emptyMaster(frames);
  engine.process(new Map([["track-a", input]]), master2, frames, second);
  const fading = second.tracks.get("track-a");

  for (let c = 0; c < 2; c++) {
    const tap = fading[c];
    for (let i = 0; i < ramp; i++) {
      const expected = Math.fround(base * (1 - (i + 1) / ramp));
      if (tap[i] !== expected) assert.fail(`T3 channel ${c} sample ${i}: ${tap[i]}, expected the faded ${expected}`);
      if (i > 0 && tap[i] >= tap[i - 1]) assert.fail(`T3 channel ${c} sample ${i} did not fall: ${tap[i - 1]} → ${tap[i]}`);
    }
    for (let i = ramp; i < frames; i++) {
      if (tap[i] !== 0) assert.fail(`T3 channel ${c} sample ${i} is ${tap[i]}, not exactly 0`);
    }
  }

  // The same envelope reached the sum: after the limiter's lookahead the master is
  // the faded contribution, and exactly silence from the ramp's end. The samples
  // before it are the previous block's tail, still at the pre-mute level.
  const latency = engine.latencyFrames;
  for (let i = 0; i < latency; i++) {
    if (master2[0][i] !== base) assert.fail(`T3 master sample ${i} is ${master2[0][i]}, not the previous block's ${base}`);
  }
  for (let i = latency; i < frames; i++) {
    const at = i - latency;
    const expected = at < ramp ? Math.fround(base * (1 - (at + 1) / ramp)) : 0;
    if (master2[0][i] !== expected) assert.fail(`T3 master sample ${i} is ${master2[0][i]}, not the faded ${expected}`);
  }

  const third = { tracks: new Map([["track-a", tapBlock(frames)]]) };
  const master3 = emptyMaster(frames);
  engine.process(new Map([["track-a", input]]), master3, frames, third);
  for (let c = 0; c < 2; c++) {
    const tap = third.tracks.get("track-a")[c];
    for (let i = 0; i < frames; i++) {
      if (tap[i] !== 0) assert.fail(`T3 channel ${c} sample ${i} of the next block is ${tap[i]}, not exactly 0`);
    }
  }
  for (let i = 0; i < frames; i++) {
    if (master3[0][i] !== 0) assert.fail(`T3 master sample ${i} of the next block is ${master3[0][i]}, not exactly 0`);
  }
});

test("T4 an unmute fades the contribution in: the mirror of T3, rising to full within the ramp and exactly full after it and in the next block", () => {
  const frames = 2048;
  const ramp = Math.round(0.01 * RATE);
  const project = projectFixture({ tracks: [trackFixture({ id: "track-a", mute: true })] });
  const engine = new MixEngine(project, { sampleRate: RATE, maxFramesPerBlock: frames });
  const input = dc(frames, 0.5);

  // Block 1 while still muted: an engine built muted treats its first block as
  // steady-off, exactly today's silence — nothing fades in.
  const first = { tracks: new Map([["track-a", tapBlock(frames)]]) };
  engine.process(new Map([["track-a", input]]), emptyMaster(frames), frames, first);
  const still = first.tracks.get("track-a");
  for (let c = 0; c < 2; c++) {
    for (let i = 0; i < frames; i++) {
      if (still[c][i] !== 0) assert.fail(`T4 channel ${c} sample ${i} while muted is ${still[c][i]}, not 0`);
    }
  }

  project.tracks[0].channel.mute = false;
  engine.refreshAudibility();
  const second = { tracks: new Map([["track-a", tapBlock(frames)]]) };
  const master2 = emptyMaster(frames);
  engine.process(new Map([["track-a", input]]), master2, frames, second);
  const fading = second.tracks.get("track-a");

  // Block 3 is steady, so its tap is the full contribution the fade-in ends at.
  const third = { tracks: new Map([["track-a", tapBlock(frames)]]) };
  const master3 = emptyMaster(frames);
  engine.process(new Map([["track-a", input]]), master3, frames, third);
  const full = constantOf(third.tracks.get("track-a"), frames, "block 3");
  assert.ok(full > 0, "the block after the fade carried no contribution");

  for (let c = 0; c < 2; c++) {
    const tap = fading[c];
    for (let i = 0; i < ramp; i++) {
      const expected = Math.fround(full * ((i + 1) / ramp));
      if (tap[i] !== expected) assert.fail(`T4 channel ${c} sample ${i}: ${tap[i]}, expected the faded ${expected}`);
      if (i > 0 && tap[i] <= tap[i - 1]) assert.fail(`T4 channel ${c} sample ${i} did not rise: ${tap[i - 1]} → ${tap[i]}`);
    }
    for (let i = ramp; i < frames; i++) {
      if (tap[i] !== full) assert.fail(`T4 channel ${c} sample ${i} is ${tap[i]}, not the full contribution ${full}`);
    }
  }

  // The master follows the same envelope after the limiter's lookahead; the next
  // block is the full contribution with no ramp left anywhere in it.
  const latency = engine.latencyFrames;
  for (let i = latency; i < frames; i++) {
    const at = i - latency;
    const expected = at < ramp ? Math.fround(full * ((at + 1) / ramp)) : full;
    if (master2[0][i] !== expected) assert.fail(`T4 master sample ${i} is ${master2[0][i]}, not the faded ${expected}`);
  }
  for (let i = 0; i < frames; i++) {
    if (master3[0][i] !== full) assert.fail(`T4 master sample ${i} of the next block is ${master3[0][i]}, not the full contribution ${full}`);
  }
});

test("T5 soloing a Return fades the dry path out while the send path stays at unity, sample-exact", () => {
  // The track's dry path to Master runs through the bus, so soloing the Return
  // fails the BUS's output path: the dry contribution is the bus's, and it ramps
  // out. The track itself stays upstream of the solo, so its send into the soloed
  // Return keeps passing at unity.
  const frames = 12000; // the 250 ms delay is one block at 48 kHz: a one-block delay line
  const ramp = Math.round(0.01 * RATE);
  const project = projectFixture({
    tracks: [trackFixture({ id: "track-a", output: "bus-B1", sends: [{ to: "return-dly", level: 0 }] })],
    buses: [busFixture({ id: "bus-B1" })],
    returns: [returnFixture({ id: "return-dly", effect: "delay", time: 250, second: 0 })],
  });
  const engine = new MixEngine(project, { sampleRate: RATE, maxFramesPerBlock: frames });
  const input = dc(frames, 0.5);

  // Block 1, nothing soloed: everything passes, and the delay line is still empty.
  const taps1 = { buses: new Map([["bus-B1", tapBlock(frames)]]), returns: new Map([["return-dly", tapBlock(frames)]]) };
  engine.process(new Map([["track-a", input]]), emptyMaster(frames), frames, taps1);
  const bus1 = taps1.buses.get("bus-B1");
  const ret1 = taps1.returns.get("return-dly");
  assert.ok(constantOf(bus1, frames, "the bus's block 1") > 0, "the dry path carried nothing before the solo");
  assert.equal(peak(ret1[0]), 0, "the delay emitted audio in its first block");

  // Solo the Return: the bus's output path fails; the track and its send still pass.
  project.returns[0].channel.solo = true;
  engine.refreshAudibility();
  assert.equal(engine.audibility.outputPasses("bus-B1"), false, "precondition: the bus's dry path fails under the solo");
  assert.equal(engine.audibility.outputPasses("track-a"), true, "precondition: the track still feeds the bus at unity");
  assert.equal(engine.audibility.sendPasses("track-a", "return-dly"), true, "precondition: the send path still passes");

  const taps2 = { buses: new Map([["bus-B1", tapBlock(frames)]]), returns: new Map([["return-dly", tapBlock(frames)]]) };
  engine.process(new Map([["track-a", input]]), emptyMaster(frames), frames, taps2);
  const bus2 = taps2.buses.get("bus-B1");

  // The dry contribution ramps out on the block-1 value, sample-exact.
  for (let c = 0; c < 2; c++) {
    for (let i = 0; i < frames; i++) {
      const fade = i < ramp ? 1 - (i + 1) / ramp : 0;
      const expected = Math.fround(bus1[c][i] * fade);
      if (bus2[c][i] !== expected) assert.fail(`T5 dry channel ${c} sample ${i}: ${bus2[c][i]}, expected the faded ${expected}`);
    }
  }

  // The send contribution stayed at unity: the delay shows each block's send sum
  // one block later, so block 3's Return tap — block 2's send sum, taken under the
  // solo — equals block 2's Return tap, block 1's send sum before it, sample-exact.
  const taps3 = { returns: new Map([["return-dly", tapBlock(frames)]]) };
  engine.process(new Map([["track-a", input]]), emptyMaster(frames), frames, taps3);
  const ret2 = taps2.returns.get("return-dly");
  const ret3 = taps3.returns.get("return-dly");
  for (let c = 0; c < 2; c++) {
    for (let i = 0; i < frames; i++) {
      if (ret3[c][i] !== ret2[c][i]) assert.fail(`T5 send channel ${c} sample ${i}: ${ret3[c][i]} under the solo vs ${ret2[c][i]} before it`);
    }
  }
});

/* --- T6, T7: the no-change render identities ------------------------------------------------ */

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

test("T7 ten blocks with a muted track and an unmuted track, no transition, are bit-identical to the code before this stage", async () => {
  const meta = JSON.parse(readFileSync(new URL("./fixtures/stage0b-t7-golden.json", import.meta.url), "utf8"));
  const goldenBuffer = readFileSync(new URL("./fixtures/stage0b-t7-golden.f32", import.meta.url));
  const golden = new Float32Array(
    goldenBuffer.buffer.slice(goldenBuffer.byteOffset, goldenBuffer.byteOffset + goldenBuffer.byteLength),
  );

  const chunks = [];
  const result = await renderProject(t7Project(), t7Sources(), {
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

  // Bit-identical, sample for sample: with no transition anywhere, Stage 0b fades
  // nothing, so the output is exactly the pre-Stage-0b engine's.
  for (let i = 0; i < actual.length; i++) {
    if (actual[i] !== golden[i]) {
      assert.fail(`T7: sample ${i} differs from the pre-Stage-0b copy: ${actual[i]} vs ${golden[i]}`);
    }
  }
  // And the golden's own digest, as a second, whole-stream proof.
  const actualBytes = new Uint8Array(actual.buffer, actual.byteOffset, actual.byteLength);
  assert.equal(
    createHash("sha256").update(actualBytes).digest("hex"),
    meta.sha256,
    "the rendered stream's sha256 differs from the pre-Stage-0b copy",
  );
});
