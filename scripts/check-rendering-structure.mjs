#!/usr/bin/env node
/**
 * ALLOY — Task 7.4 structural contract: bounded rendering, continuity and recovery.
 *
 * Guards the engine-only orchestration boundary: fixed-capacity chunks, seekable
 * sources and a streaming sink, one stateful MixEngine per attempt, full-graph
 * Return tails, limiter latency compensation, cooperative cancellation, abort /
 * cleanup / retry, and reuse of the approved WAV decoder. No UI, transport, export
 * dialog, project schema, DSP algorithm or masking methodology is introduced here.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(resolve(root, rel), "utf8");
const exists = (rel) => existsSync(resolve(root, rel));
const sha256 = (text) => createHash("sha256").update(text.replace(/\r\n/g, "\n")).digest("hex");
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const failures = [];
const passes = [];
function check(name, condition, detail = "") {
  const line = detail ? `${name} — ${detail}` : name;
  (condition ? passes : failures).push(line);
}

const FILES = [
  "src/lib/engine/render.ts",
  "tests/rendering.test.mjs",
  "scripts/check-rendering-structure.mjs",
  "task-reports/7.4-report.md",
];
for (const rel of FILES) check(`exists: ${rel}`, exists(rel));

const renderRaw = exists("src/lib/engine/render.ts") ? read("src/lib/engine/render.ts") : "";
const render = stripComments(renderRaw);
const engine = stripComments(read("src/lib/engine/mix-engine.ts"));
const tests = exists("tests/rendering.test.mjs") ? read("tests/rendering.test.mjs") : "";
const pkg = JSON.parse(read("package.json"));

const forbidden = /svelte|localStorage|sessionStorage|document\.|window\.|requestAnimationFrame|setTimeout|setInterval|fetch\(|AudioContext|decodeAudioData/;
check("renderer is browser-free engine code", !forbidden.test(render));
check("no new dependency", Object.keys(pkg.dependencies ?? {}).length === 0);
check("rendering suite runs under npm test", /tests\/rendering\.test\.mjs/.test(pkg.scripts.test));
check("guard script is wired as check:rendering", /node scripts\/check-rendering-structure\.mjs/.test(pkg.scripts["check:rendering"] ?? ""));

const imports = [...render.matchAll(/from "([^"]+)"/g)].map((match) => match[1]);
check("renderer imports only the approved engine/DSP/analysis/audio/model boundary", imports.every((spec) =>
  spec.startsWith("./") || spec.startsWith("../dsp/") || spec.startsWith("../analysis/") || spec.startsWith("../audio/") || spec.startsWith("../project/"),
), imports.join(" "));

// Bounded orchestration.
check("default chunk is the engine's 4096-frame block", /export const DEFAULT_RENDER_CHUNK_FRAMES = 4096;/.test(render));
check("chunk size has a hard upper bound", /export const MAX_RENDER_CHUNK_FRAMES = 65536;/.test(render));
check("chunk size is validated as a bounded whole number", /Number\.isInteger\(value\) && value < 1 \|\| value > MAX_RENDER_CHUNK_FRAMES/.test(render) || /!Number\.isInteger\(value\) \|\| value < 1 \|\| value > MAX_RENDER_CHUNK_FRAMES/.test(render));
check("the engine is built with the render chunk as its block capacity", /maxFramesPerBlock: chunkFrames/.test(render));
check("one MixEngine is built per render attempt", (render.match(/new MixEngine\(/g) ?? []).length === 1);
check("scratch/output buffers are sized from chunkFrames", /raw = zeroPair\(chunkFrames\)/.test(render) && /output = zeroPair\(chunkFrames\)/.test(render) && /inputBuffers\.set\(track\.id, zeroPair\(chunkFrames\)\)/.test(render));
check("no audio buffer is allocated from total project duration", !/new Float32Array\((?:totalFrames|engineFrames|inputFrames|source\.frames)/.test(render));
check("sources are read by frame range into reused targets", /source\.read\(at, target, count\)/.test(render));
check("a short source read is a named failure, not silent padding", /returned \$\{String\(written\)\} frames/.test(renderRaw));
check("missing/finished inputs are silence", /if \(at >= source\.frames\) continue;/.test(render) && /buffer\[0\]\.fill\(0, 0, frames\)/.test(render));

// Streaming sink and commit/abort boundary.
check("sink has write, finish and abort hooks", /write\(chunk: RenderChunk\)/.test(render) && /finish\?\(result: RenderResult\)/.test(render) && /abort\?\(error: unknown\)/.test(render));
check("output is handed to the sink in bounded chunks", /await sink\.write\(\{ startFrame: framesWritten, frames, channels: output as StereoBlock \}\)/.test(render));
check("finish is the single commit point", /await sink\.finish\?\.\(result\)/.test(render));
check("failure/cancellation aborts the sink", /await sink\.abort\?\.\(finalError\)/.test(render));
check("output arrays are documented as reused after write resolves", /reused after `write` resolves/.test(renderRaw));

// State, tails and latency.
check("the same engine processes every block of the attempt", /engine\.process\(inputBuffers as TrackInputs, raw, count\)/.test(render));
check("Return tail silence is processed through the full graph", /const engineFrames = inputFrames \+ tailFrames;/.test(render) && /for \(let at = 0; at < engineFrames; at \+= chunkFrames\)/.test(render));
check("tail length defaults to the engine's conservative Return tail", /options\.tailSeconds \?\? engine\.tailSeconds/.test(render));
check("limiter latency is dropped at the head", /let latencyToDrop = engine\.latencyFrames;/.test(render) && /latencyToDrop -= skipped;/.test(render));
check("limiter latency is flushed in bounded pieces at the tail", /let remaining = engine\.latencyFrames;/.test(render) && /engine\.flush\(raw, count\)/.test(render));
check("delivered length is input plus rendered tail", /frames: totalFrames/.test(render) && /const totalFrames = inputFrames \+ tailFrames;/.test(render));
check("masking overlays are passed through without per-chunk re-resolution", /maskingDynamicBands: options\.maskingDynamicBands/.test(render) && !/resolveMasking/.test(render));
check("engine reset clears scratch and key buffers for recovery", /this\.scratch\[c\]\.fill\(0\)/.test(engine) && /bundle\.compressor\[c\]\.fill\(0\)/.test(engine) && /bundle\.dynamicEq\[c\]\.fill\(0\)/.test(engine));

// Cancellation and cleanup.
check("cancellation has a named error", /export class RenderCancelledError extends Error/.test(render));
check("a mid-render project change has a named error and cannot commit", /export class RenderProjectChangedError extends Error/.test(render) && /output was not committed/.test(renderRaw));
check("the project is fingerprinted and re-checked before engine blocks and commit", /function projectFingerprint\(project: Project\): string/.test(render) && /const expectedProject = projectFingerprint\(project\)/.test(render) && (render.match(/checkProject\(\)/g) ?? []).length >= 4);
check("AbortSignal is checked around reads, writes and yields", /checkAbort\(options\.signal\)/.test(render) && (render.match(/checkAbort\(options\.signal\)/g) ?? []).length >= 6);
check("sources are closed once per unique source", /const uniqueSources = new Set\(sources\.values\(\)\)/.test(render) && /await source\.close\?\.\(\)/.test(render));
check("cleanup runs before commit", /Cleanup happens before commit/.test(renderRaw) && /engine\?\.reset\(\)/.test(render));
check("retry shares no attempt state", /A retry is a new call/.test(renderRaw) && /no attempt/.test(renderRaw));

// WAV reuse.
check("WAV adapter reuses the Task 5.2 header reader and slice decoder", /readStoredFormat\(source\)/.test(render) && /new SliceDecoder\(source, format\)/.test(render));
check("WAV adapter reuses the Task 5.1 import rules", /judgeFormat\(format\)/.test(render));
check("mono WAV is duplicated to stereo", /format\.channels === 1 \? 0 : c/.test(render));
check("non-finite float samples are rejected", /non-finite sample/.test(renderRaw));

// Tests.
const countTests = (text) => (text.match(/^test\(/gm) ?? []).length;
check("rendering suite covers the required scenarios", countTests(tests) >= 17 && /short renders/.test(tests) && /long render/.test(tests) && /multiple chunk boundaries/.test(tests) && /reverb and delay tails/.test(tests) && /compressor, Dynamic EQ/.test(tests) && /masking overlays/.test(tests) && /cancellation/.test(tests) && /injected source failure/.test(tests) && /Float32 audio allocation/.test(tests) && /continuous reference/.test(tests) && /project change during a render aborts before commit/.test(tests));
check("tests compare objective samples and bounded allocation", /compare\(actual, expected/.test(tests) && /max sample error/.test(tests) && /short\.total, long\.total/.test(tests));

// Docs and report.
const dataModel = read("data-model.md");
const decisions = read("decisions-log.md");
const report = exists("task-reports/7.4-report.md") ? read("task-reports/7.4-report.md") : "";
check("data-model documents the rendering contract", /## 20\. Bounded-chunk rendering/.test(dataModel));
check("decisions log records Task 7.4 choices", /## Task 7\.4/.test(decisions) && /D7\.4\.1/.test(decisions) && /D7\.4\.2/.test(decisions) && /D7\.4\.3/.test(decisions) && /D7\.4\.4/.test(decisions));
check("report records verification and stop condition", /npm run check/.test(report) && /0 errors/.test(report) && /Nothing committed/.test(report) && /No later task was started/.test(report));

const pinned = {
  "src/lib/engine/render.ts": "1a08dd23e75445ca65cb7d7a664f5a42a88cabd7a1f8534a35cdad3f148aba70",
};
for (const [rel, hash] of Object.entries(pinned)) {
  check(`reviewed file pinned: ${rel}`, exists(rel) && sha256(read(rel)) === hash, sha256(read(rel)).slice(0, 16));
}

for (const name of passes) console.log(`  PASS  ${name}`);
for (const name of failures) console.error(`  FAIL  ${name}`);
console.log(`\nBounded rendering structural contract check — ${passes.length}/${passes.length + failures.length} passed`);
process.exit(failures.length ? 1 : 0);
