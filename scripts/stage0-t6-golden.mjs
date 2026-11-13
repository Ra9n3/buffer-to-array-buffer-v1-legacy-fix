#!/usr/bin/env node
/**
 * Stage 0, T6 — produce the render golden from the ORIGINAL engine.
 *
 * Run ONCE before the Stage 0 chain changes (at commit d4ae915):
 *
 *     node --import ./tests/register.mjs scripts/stage0-t6-golden.mjs
 *
 * It renders the shared fixture (tests/stage0-render-fixture.mjs) through
 * renderProject and stores the delivered stereo output, planar (all L, then all
 * R), as little-endian float32 in tests/fixtures/stage0-render-golden.f32, with
 * the frame count and a sha256 in tests/fixtures/stage0-render-golden.json.
 * tests/engine-live-gains.test.mjs then renders the same fixture against the
 * Stage 0 engine and requires bit-identical output.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { renderProject } from "../src/lib/engine/render.ts";
import { RATE } from "../tests/engine-fixtures.mjs";
import { T6_CHUNK_FRAMES, T6_INPUT_FRAMES, t6Project, t6Sources } from "../tests/stage0-render-fixture.mjs";

const chunks = [];
const result = await renderProject(t6Project(), t6Sources(), {
  sampleRate: RATE,
  chunkFrames: T6_CHUNK_FRAMES,
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
const f32 = new URL("../tests/fixtures/stage0-render-golden.f32", import.meta.url).pathname;
const json = new URL("../tests/fixtures/stage0-render-golden.json", import.meta.url).pathname;
writeFileSync(f32, bytes);
writeFileSync(
  json,
  `${JSON.stringify(
    {
      note: "produced by scripts/stage0-t6-golden.mjs from the ORIGINAL engine (commit d4ae915, before the Stage 0 live-gain changes)",
      sampleRate: RATE,
      chunkFrames: T6_CHUNK_FRAMES,
      inputFrames: T6_INPUT_FRAMES,
      frames: result.frames,
      tailFrames: result.tailFrames,
      channels: 2,
      layout: "planar float32: frames L samples, then frames R samples",
      sha256,
    },
    null,
    2,
  )}\n`,
);
console.log(`stage0 golden: ${result.frames} frames (${result.frames / RATE} s), sha256 ${sha256.slice(0, 16)}…, ${bytes.length} bytes`);
