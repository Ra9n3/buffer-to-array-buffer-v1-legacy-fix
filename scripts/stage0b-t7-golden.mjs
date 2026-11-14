#!/usr/bin/env node
/**
 * Stage 0b, T7 — produce the no-transition golden from the code BEFORE this stage.
 *
 * Run ONCE before the Stage 0b fade changes (the engine as committed at 5857fec):
 *
 *     node --import ./tests/register.mjs scripts/stage0b-t7-golden.mjs
 *
 * It renders the shared fixture (tests/stage0b-fade-fixture.mjs — one muted track
 * and one unmuted track, ten blocks, no transition ever) through renderProject and
 * stores the delivered stereo output, planar (all L, then all R), as little-endian
 * float32 in tests/fixtures/stage0b-t7-golden.f32, with the frame count and a
 * sha256 in tests/fixtures/stage0b-t7-golden.json. tests/engine-live-gains.test.mjs
 * then renders the same fixture against the Stage 0b engine and requires
 * bit-identical output: no transition, no difference — not one sample of fade.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { renderProject } from "../src/lib/engine/render.ts";
import { RATE } from "../tests/engine-fixtures.mjs";
import { T7_CHUNK_FRAMES, t7Project, t7Sources } from "../tests/stage0b-fade-fixture.mjs";

const chunks = [];
const result = await renderProject(t7Project(), t7Sources(), {
  sampleRate: RATE,
  chunkFrames: T7_CHUNK_FRAMES,
  write(chunk) {
    chunks.push([
      Float32Array.from(chunk.channels[0].subarray(0, chunk.frames)),
      Float32Array.from(chunk.channels[1].subarray(0, chunk.frames)),
    ]);
  },
});

const left = new Float32Array(result.frames);
const right = new Float32Array(result.frames);
let at = 0;
for (const [l, r] of chunks) {
  left.set(l, at);
  right.set(r, at);
  at += l.length;
}
if (at !== result.frames) throw new Error(`golden: joined ${at} frames, renderer reported ${result.frames}`);

const planar = new Float32Array(result.frames * 2);
planar.set(left, 0);
planar.set(right, result.frames);
const bytes = new Uint8Array(planar.buffer, planar.byteOffset, planar.byteLength);
const sha256 = createHash("sha256").update(bytes).digest("hex");

mkdirSync(new URL("../tests/fixtures/", import.meta.url).pathname, { recursive: true });
const f32 = new URL("../tests/fixtures/stage0b-t7-golden.f32", import.meta.url).pathname;
const json = new URL("../tests/fixtures/stage0b-t7-golden.json", import.meta.url).pathname;
writeFileSync(f32, bytes);
writeFileSync(
  json,
  `${JSON.stringify(
    {
      note: "produced by scripts/stage0b-t7-golden.mjs from the engine BEFORE the Stage 0b mute/solo fade changes (commit 5857fec)",
      sampleRate: RATE,
      chunkFrames: T7_CHUNK_FRAMES,
      inputFrames: result.inputFrames,
      frames: result.frames,
      tailFrames: result.tailFrames,
      blocks: 10,
      channels: 2,
      layout: "planar float32: frames L samples, then frames R samples",
      sha256,
    },
    null,
    2,
  )}\n`,
);
console.log(`stage0b T7 golden: ${result.frames} frames in ${result.chunks} chunks, sha256 ${sha256.slice(0, 16)}…, ${bytes.length} bytes`);
