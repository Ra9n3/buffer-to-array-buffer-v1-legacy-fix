#!/usr/bin/env node
/**
 * ALLOY — Task 7.3 structural contract: masking resolution.
 *
 * Guards the engine-only boundary: detection is separate from resolution, the
 * Task 5.2 spectral grid is reused, wet tails are attributed through existing
 * post-fader sends and ReturnChain DSP, priority protects the higher track,
 * Auto/Manual is respected, cumulative cuts are limited, and compressor
 * escalation follows re-measurement. No UI, store, transport, export, new DSP,
 * new dependency, or Task 7.4 rendering orchestration is introduced here.
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
  "src/lib/engine/masking.ts",
  "tests/masking.test.mjs",
  "scripts/check-masking-structure.mjs",
  "task-reports/7.3-report.md",
];
for (const rel of FILES) check(`exists: ${rel}`, exists(rel));

const maskingRaw = exists("src/lib/engine/masking.ts") ? read("src/lib/engine/masking.ts") : "";
const masking = stripComments(maskingRaw);
const chains = stripComments(read("src/lib/engine/chains.ts"));
const engine = stripComments(read("src/lib/engine/mix-engine.ts"));
const tests = exists("tests/masking.test.mjs") ? read("tests/masking.test.mjs") : "";
const pkg = JSON.parse(read("package.json"));

const forbidden = /svelte|localStorage|sessionStorage|document\.|window\.|requestAnimationFrame|setTimeout|setInterval|fetch\(|AudioContext|decodeAudioData/;
check("masking is browser-free engine code", !forbidden.test(masking));
check("no new dependency", Object.keys(pkg.dependencies ?? {}).length === 0);
check("masking suite runs under npm test", /tests\/masking\.test\.mjs/.test(pkg.scripts.test));
check("guard script is wired as check:masking", /node scripts\/check-masking-structure\.mjs/.test(pkg.scripts["check:masking"] ?? ""));

// Detection / measurement boundary.
check("reuses the Task 5.2 SpectralAnalyser and band grid", /SpectralAnalyser/.test(masking) && /BANDS/.test(masking) && /CELL_SECONDS/.test(masking) && /cellFramesFor/.test(masking));
check("detection is a separate exported function", /export function detectMaskingConflicts/.test(masking));
check("resolution is a separate exported function", /export function resolveMaskingConflicts/.test(masking));
check("audio orchestration re-measures before escalation", /export function resolveMaskingAudio/.test(masking) && /postEqConflicts/.test(masking) && /finalConflicts/.test(masking));
check("conflicts carry contributors, frequency region, intervals and energy", /protectedSource/.test(masking) && /yieldingSource/.test(masking) && /band: BandDef/.test(masking) && /intervals/.test(masking) && /excessDb/.test(masking));
check("ordinary spectral overlap is gated by time, level and band salience", /maskingWindowDb/.test(masking) && /minBandShare/.test(masking) && /energyFloorDb/.test(masking) && /conflictCells/.test(masking));
check("persistent and intermittent conflicts are distinguished", /persistentRatio/.test(masking) && /"persistent"/.test(masking) && /"intermittent"/.test(masking));

// Priority and ownership.
check("higher priority is protected and equal priority is not arbitrarily cut", /protectedSource\.priority === yieldingSource\.priority/.test(masking) && /priorityDifference/.test(masking));
check("Role is not used as a prominence substitute", !/\.role\b/.test(masking));
check("Manual parameters are never written", /mode !== "auto"/.test(masking) && /send\.mode !== "auto"/.test(masking) && /gain\.mode !== "auto"/.test(masking));
check("static EQ is preferred for persistent dry conflicts", /persistent conflict; proportional static EQ cut/.test(maskingRaw));
check("intermittent dry conflicts use external-key Dynamic EQ", /intermittent conflict; external-key Dynamic EQ dip/.test(maskingRaw) && /processor: "dynamic-eq"/.test(masking));
check("existing configured Dynamic EQ depths are preserved", /configuredDepthDb === null/.test(masking) && /effectiveDepthDb = configuredDepthDb \?\? depth/.test(masking) && /Existing configured Dynamic EQ depths are never replaced|existing configured depth/i.test(maskingRaw));
check("cumulative EQ cut safety is deterministic and configurable", /cumulativeCutLimitDb/.test(masking) && /totalEqCutDb/.test(masking) && /DEFAULT_MASKING_RESOLUTION/.test(masking));
check("compressor escalation requires remaining meaningful conflict after EQ", /eqActions\.has\(conflict\.id\)/.test(masking) && /escalationThresholdDb/.test(masking) && /processor: "compressor"/.test(masking));

// Wet tails and existing routing.
check("wet sources are attributed to sending tracks, not treated as ordinary tracks", /kind: "wet"/.test(masking) && /returnId/.test(masking) && /trackId/.test(masking));
check("wet attribution reuses the approved ReturnChain and post-fader send gain", /new ReturnChain\(ret, dspOptions\)/.test(masking) && /sendGain/.test(masking) && /send\.level/.test(masking));
check("wet tails are included by analysing silence after the input", /tailSeconds/.test(masking) && /tailFrames/.test(masking) && /totalFrames = inputFrames \+ tailFrames/.test(masking));
check("persistent wet/dry conflict reduces the lower-priority Auto send", /lower-priority send yields/.test(maskingRaw) && /send\.level -= cut/.test(masking));
check("sidechain validation and fallback are preserved", /validateSidechains/.test(masking) && /sidechainVerdict/.test(masking));
check("no Return sidechain destination or new routing edge kind is introduced", !/destination: ret\.id/.test(masking) && !/RoutingEdgeKind/.test(masking));

// Engine integration is tap/overlay only.
check("MixEngine exposes optional track taps for measurement", /readonly tracks\?: ReadonlyMap<TrackId, StereoBlock>/.test(engine));
check("MixEngine accepts engine-owned masking Dynamic EQ overlays", /maskingDynamicBands\?: ReadonlyMap<TrackId, readonly MaskingDynamicBand\[\]>/.test(engine));
check("TrackChain overlays never replace a configured dynamicDepthDb", /band\.dynamicDepthDb \?\? overlay\?\.depthDb \?\? null/.test(chains));

// Tests.
const countTests = (text) => (text.match(/^test\(/gm) ?? []).length;
check("masking suite covers the required scenarios", countTests(tests) >= 14 && /different times/.test(tests) && /persistent/.test(tests) && /intermittent/.test(tests) && /Manual/.test(tests) && /cumulative/.test(tests) && /wet delay tail/.test(tests) && /invalid or unavailable sidechain/.test(tests) && /compression escalation/.test(tests));
check("tests assert objective audio measurements, not only calls", /rms\(/.test(tests) && /bandDb/.test(tests) && /assert\.ok/.test(tests));
check("focused verification covers configured-depth ownership and Return superposition", countTests(tests) >= 18 && /configured dynamicDepthDb is preserved/.test(tests) && /isolated per-send ReturnChain output sums/.test(tests) && /tailMax/.test(tests));

// Docs and report.
const dataModel = read("data-model.md");
const decisions = read("decisions-log.md");
const report = exists("task-reports/7.3-report.md") ? read("task-reports/7.3-report.md") : "";
check("data-model documents the masking contract", /## 19\. Masking resolution/.test(dataModel));
check("decisions log records Task 7.3 provisional defaults", /## Task 7\.3/.test(decisions) && /D7\.3\.1/.test(decisions));
check("report records verification and stop condition", /npm run check/.test(report) && /0 errors/.test(report) && /Task 7\.4 was not started/.test(report) && /Nothing committed/.test(report));

// Pins.
const pinned = {
  "src/lib/engine/masking.ts": "67ad5bc2d52389cdea0dcefccd029b63d87c3b8f7c0e359da363b208e6963e23",
};
for (const [rel, hash] of Object.entries(pinned)) {
  check(`reviewed file pinned: ${rel}`, exists(rel) && sha256(read(rel)) === hash, sha256(read(rel)).slice(0, 16));
}

for (const name of passes) console.log(`  PASS  ${name}`);
for (const name of failures) console.error(`  FAIL  ${name}`);
console.log(`\nMasking resolution structural contract check — ${passes.length}/${passes.length + failures.length} passed`);
process.exit(failures.length ? 1 : 0);
