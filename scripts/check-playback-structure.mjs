#!/usr/bin/env node
/**
 * Shared transport and playback structural contract check — Task 8.1.
 *
 * Dependency-free guard (Node built-ins only). It guards the implemented contract:
 * one shared transport, bounded raw/preview/render producers, reuse of the 7.x
 * engine/renderer, Web Audio confined to the playback backend, recovery on
 * pause/seek/stop, and the room wiring. It does not measure pixels or listen.
 *
 * Run: npm run check:playback
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(resolve(root, rel), "utf8");
const exists = (rel) => existsSync(resolve(root, rel));
const sha256 = (text) => createHash("sha256").update(text.replace(/\r\n/g, "\n")).digest("hex");

const failures = [];
const passes = [];
function check(name, condition, detail = "") {
  if (condition) passes.push(name);
  else failures.push(detail ? `${name} — ${detail}` : name);
}

const files = {
  types: "src/lib/playback/types.ts",
  sources: "src/lib/playback/sources.ts",
  sessions: "src/lib/playback/sessions.ts",
  controller: "src/lib/playback/controller.ts",
  webAudio: "src/lib/playback/web-audio.ts",
  store: "src/lib/playback/store.svelte.ts",
  shell: "src/lib/playback/shell.ts",
};
for (const [key, rel] of Object.entries(files)) check(`playback module exists: ${key}`, exists(rel));
const T = read(files.types);
const S = read(files.sources);
const P = read(files.sessions);
const C = read(files.controller);
const W = read(files.webAudio);
const ST = read(files.store);
const SH = read(files.shell);
const pkg = JSON.parse(read("package.json"));
const tests = read("tests/playback.test.mjs");
const mini = read("src/components/MiniTransport.svelte");
const deck = read("src/components/console-transport/ConsoleTransport.svelte");
const mix = read("src/components/console-transport/MixButton.svelte");
const consoleRoom = read("src/rooms/ConsoleRoom.svelte");
const projectShell = read("src/lib/project/shell.ts");

// --- 1. One shared transport -------------------------------------------------
check("the three plan listening modes are the transport's source type", /export type ListeningSource = "raw" \| "preview" \| "render"/.test(T));
check("transport state carries status, source, playhead, start, duration, render progress and error", /export interface PlaybackState \{[\s\S]*status: TransportStatus[\s\S]*source: ListeningSource[\s\S]*positionFrames: number[\s\S]*startFrame: number[\s\S]*durationFrames: number[\s\S]*renderProgress: number \| null[\s\S]*error: string \| null/.test(T));
check("one reactive module-level transport state, attached once by the shell", /const state: PlaybackState = \$state\(initialPlaybackState\(48000\)\)/.test(ST) && /attach\(next: PlaybackController\)/.test(ST));
check("the facade exposes play/pause/stop/seek/source/render", /play\(\): Promise<void>/.test(ST) && /pause\(\): void/.test(ST) && /stop\(\): void/.test(ST) && /seek\(frames: number\): void/.test(ST) && /setSource\(source: ListeningSource\): void/.test(ST) && /render\(\): Promise<void>/.test(ST));
check("the project shell installs and detaches the shared playback controller", /installPlaybackShell\(win, \{ assetStore \}\)/.test(projectShell) && /detachPlayback\(\)/.test(projectShell));
check("the debug handle exposes the transport facade", /readonly transport: typeof transport;/.test(projectShell) && /transport,/.test(projectShell));

// --- 2. Raw synchronized playback -------------------------------------------
check("imported stems are opened through the 7.4 WAV source adapter and 5.1 asset store", /openWavRenderSource/.test(S) && /AssetStore/.test(S) && /store\.getAsset\(audio\.assetId\)/.test(S));
check("raw playback is a bounded unity sum with shared mute/solo audibility", /createRawSession/.test(P) && /computeAudibility\(project\)/.test(P) && /audibility\.outputPasses\(id\)/.test(P));
check("raw reads are frame-range reads into reused buffers, never a whole stem", /source\.read\(at, target, take\)/.test(P) && /zeroPair\(chunkFrames\)/.test(P));

// --- 3. Live preview ----------------------------------------------------------
check("live preview reuses MixEngine, not a second DSP path", /new MixEngine\(project, \{ sampleRate, maxFramesPerBlock: chunkFrames \}\)/.test(P) && /engine\.process\(inputBuffers as TrackInputs, raw, count\)/.test(P));
const previewBody = P.slice(P.indexOf("export function createPreviewSession"));
check("preview refreshes audibility without rebuilding chains", /engine\.refreshAudibility\(\)/.test(previewBody) && !/new MixEngine/.test(previewBody.slice(previewBody.indexOf("async next"))));
check("preview compensates the master limiter latency and flushes the tail", /latencyToDrop = engine\.latencyFrames/.test(P) && /engine\.flush\(raw, count\)/.test(P));
check("preview state is reset on close", /engine\.reset\(\)/.test(P));

// --- 4. Rendered mix ----------------------------------------------------------
check("rendered playback calls the Task 7.4 renderer, never a second renderer", /renderProject\(project, sources, sink, \{/.test(C) && /from "\.\.\/engine\/render"/.test(C));
check("rendered playback honors cancellation, progress and commit", /signal,/.test(C) && /onProgress: \(progress\)/.test(C) && /finish: \(result: RenderResult\)/.test(C));
check("a render seek discards output before the target frame", /if \(end <= start\) return;/.test(C) && /const offset = Math\.max\(0, start - chunk\.startFrame\)/.test(C));

// --- 5. Recovery and bounded output -----------------------------------------
check("pause/stop/seek cancel the attempt and stop the output generation", /private cancelAttempt\(\): void \{[\s\S]*this\.abort\?\.abort\(\)[\s\S]*this\.output\.stop\(\)/.test(C));
check("the controller checks generation after async boundaries", /generation !== this\.generation/.test(C) && /abort\.signal\.aborted/.test(C));
check("Web Audio output applies backpressure and discards stale scheduled chunks", /maxQueueFrames/.test(W) && /scheduledUntil - positionFrames\(\) > maxQueueFrames/.test(W) && /generation\+\+/.test(W) && /node\.stop\(\)/.test(W) && /node\.disconnect\(\)/.test(W));
check("Web Audio is confined to the playback backend", /AudioContext/.test(W) && !/AudioContext/.test(C + P + S + ST));

// --- 6. Room integration ------------------------------------------------------
check("the mini transport drives the shared facade", /transport\.togglePlay\(\)/.test(mini) && /transport\.stop\(\)/.test(mini) && /transport\.seek/.test(mini));
check("the Console deck is live and drives the same facade", /<ConsoleTransport live \/>/.test(consoleRoom) && /transport\.togglePlay\(\)/.test(deck) && /transport\.render\(\)/.test(deck));
check("MIX starts the rendered path through a callback, not a navigation", /onPress\?: \(\(\) => void\) \| undefined/.test(mix) && /onclick=\{press\}/.test(mix));
check("the playground deck can still run simulated", /live = false/.test(deck) && /data-simulated={simulated}/.test(deck));

// --- 7. Tests, docs, package --------------------------------------------------
const countTests = (tests.match(/^test\(/gm) ?? []).length;
check("the playback suite is substantial and deterministic", countTests >= 14 && /signalSource/.test(tests) && /autoOutput/.test(tests));
check("the suite covers transport, raw sync, mute/solo, preview routing, render failure and bounded memory", /reactive transport facade/.test(tests) && /raw playback sums imported tracks/.test(tests) && /mute and solo/.test(tests) && /bus, Return send and sidechain/.test(tests) && /render failure and cancellation/.test(tests) && /duration-proportional/.test(tests));
check("npm test runs the playback suite", /tests\/playback\.test\.mjs/.test(pkg.scripts.test));
check("the guard is wired as check:playback", pkg.scripts["check:playback"] === "node scripts/check-playback-structure.mjs");
check("data-model documents the playback contract", /## 21\./.test(read("data-model.md")) && /### 21\.1/.test(read("data-model.md")));
check("the decisions log records Task 8.1", /D8\.1\.1/.test(read("decisions-log.md")));
check("the task report exists", exists("task-reports/8.1-report.md"));
check("no new dependency", Object.keys(pkg.dependencies ?? {}).length === 0 && JSON.stringify(Object.keys(pkg.devDependencies).sort()) === JSON.stringify(["@sveltejs/vite-plugin-svelte", "@types/node", "svelte", "svelte-check", "typescript", "vite", "vite-plugin-singlefile"]));

// --- 8. The 7.x engine/renderer are unchanged --------------------------------
const pinned = {
  "src/lib/engine/render.ts": "1a08dd23e75445ca65cb7d7a664f5a42a88cabd7a1f8534a35cdad3f148aba70",
  "src/lib/engine/mix-engine.ts": "df267eaaea46eebada03861aae3e1a54bba88e9c0b315580c8efc2acaa78b097",
};
for (const [rel, hash] of Object.entries(pinned)) {
  check(`reviewed 7.x file unchanged: ${rel}`, exists(rel) && sha256(read(rel)) === hash, exists(rel) ? `sha256 ${sha256(read(rel)).slice(0, 16)}…` : "missing");
}

for (const name of passes) console.log(`  PASS  ${name}`);
if (failures.length > 0) {
  console.error("");
  for (const failure of failures) console.error(`  FAIL  ${failure}`);
  console.error("");
  console.error(`Shared playback structural contract check — ${passes.length}/${passes.length + failures.length} passed`);
  process.exit(1);
}
console.log("");
console.log(`Shared playback structural contract check — ${passes.length}/${passes.length} passed`);
