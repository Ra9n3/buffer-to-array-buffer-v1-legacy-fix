#!/usr/bin/env node
/**
 * ALLOY — Task 7.2 structural contract: sidechain routing (the detector-signal path).
 *
 * What this guards (plan §8, `data-model.md` §18, the owner's answers of 2026-11-03
 * D7.2.1–D7.2.5, and `task-reports/7.2-report.md`):
 *
 *   1. The model declares the edge kind and nothing else: an optional
 *      `Project.sidechains`, sources as tracks, a processor per edge.
 *   2. The Compressor gained exactly one thing — an optional `key` whose only effect is
 *      `detectorInput = key ?? input`; the Dynamic EQ keeps its approved contract.
 *   3. The engine taps keys PRE-FADER, POST-TRIM, fills them before any chain runs, and
 *      zeroes them when the source is unavailable. No stale buffer is possible.
 *   4. Validation is separate from the audible graph, names every rejection reason, and
 *      never throws. The audible path is untouched.
 *   5. The block loop still allocates nothing and the reported latency is unchanged.
 *   6. The tests, the script, the docs and the report exist; the sources are pinned.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(resolve(root, rel), "utf8");
const exists = (rel) => existsSync(resolve(root, rel));
const sha256 = (text) => createHash("sha256").update(text.replace(/\r\n/g, "\n")).digest("hex");

const failures = [];
const passes = [];
function check(name, condition, detail = "") {
  const line = detail ? `${name} — ${detail}` : name;
  (condition ? passes : failures).push(line);
}
const stripComments = (text) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

// --- 1. The files. ---------------------------------------------------------------------------
const FILES = [
  "src/lib/engine/sidechain.ts",
  "tests/engine-sidechain.test.mjs",
  "scripts/check-sidechain-structure.mjs",
  "task-reports/7.2-report.md",
];
for (const rel of FILES) check(`exists: ${rel}`, exists(rel));

const modelRaw = read("src/lib/project/model.ts");
const model = stripComments(modelRaw);
const sidechainRaw = read("src/lib/engine/sidechain.ts");
const sidechain = stripComments(sidechainRaw);
const compressorRaw = read("src/lib/dsp/compressor.ts");
const compressor = stripComments(compressorRaw);
const dynamicEq = stripComments(read("src/lib/dsp/dynamic-eq.ts"));
const chains = stripComments(read("src/lib/engine/chains.ts"));
const engine = stripComments(read("src/lib/engine/mix-engine.ts"));

// --- 2. The model: one optional field, one edge shape. ----------------------------------------
check(
  "the model declares the two processors and the edge shape",
  /export type SidechainProcessor = "compressor" \| "dynamic-eq";/.test(model) &&
    /export interface SidechainEdge \{/.test(model) &&
    /readonly source: TrackId;/.test(model) &&
    /readonly destination: ChannelId;/.test(model) &&
    /readonly processor: SidechainProcessor;/.test(model),
);
check(
  "the project field is OPTIONAL, so a pre-7.2 project loads unchanged",
  /readonly sidechains\?: readonly SidechainEdge\[\];/.test(model),
);
check(
  "sources are tracks and the destination may be a track or a bus — no audible edge kind was added",
  /readonly source: TrackId;/.test(model) && /readonly destination: ChannelId;/.test(model) && !/RoutingEdgeKind = "output" \| "send" \| "sidechain"/.test(stripComments(read("src/lib/project/routing.ts"))),
);
check(
  "the model's SidechainEdge never carries audio — no buffers, no gains",
  !/Float32Array|gain|level/.test(model.slice(model.indexOf("export interface SidechainEdge"), model.indexOf("export interface SidechainEdge") + 400)),
);

// --- 3. The DSP: one optional key, one expression. -------------------------------------------
check(
  "the compressor takes an optional key and validates it like the Dynamic EQ",
  /key\?: readonly Float32Array\[\]/.test(compressor) &&
    /requireKeyBuffers\("Alloy Compressor"/.test(compressor),
);
check(
  "the key's only effect is which signal the detector reads",
  /const detectorInput = key \?\? input;/.test(compressor) &&
    /detector\.level\(detectorInput, i\)/.test(compressor),
);
check(
  "the Dynamic EQ keeps its approved contract, unchanged in kind",
  /key \?\? input/.test(dynamicEq) && /requireKeyBuffers\("Alloy Dynamic EQ"/.test(dynamicEq),
);
check(
  "no new detector mode, weighting, filter or lookahead was added to either module",
  !/keyFilter|keyWeight|keyLookahead|sidechainGain|keyGain/i.test(compressor + dynamicEq),
);
check(
  "the compressor still processes its own input, not the key",
  /output\[c\]\[i\] = input\[c\]\[i\] \* gain;/.test(compressor),
);

// --- 4. The tap point: pre-fader, post-trim. -------------------------------------------------
check(
  "keys are pre-fader and post-trim: the fill multiplies by the chain's TRIM and by nothing else",
  /const trim = chain\.trimGain;/.test(engine) && /to\[i\] = from\[i\] \* trim;/.test(engine),
);
check(
  "no fader, pan, send or bus gain is applied to a key",
  !/faderGain|pan\.|send\.level|balance\./.test(engine.slice(engine.indexOf("private fillKey("), engine.indexOf("private silenceKey("))),
);
check(
  "keys are filled from THIS block before any chain runs",
  engine.indexOf("this.fillKeys(trackInputs, blockFrames);") > 0 &&
    engine.indexOf("this.fillKeys(trackInputs, blockFrames);") < engine.indexOf("for (const track of this.trackOrder)"),
);
check(
  "an unavailable source zeroes the key — never a stale buffer",
  /this\.silenceKey\(key, frames\);/.test(engine) && /key\[c\]\.fill\(0, 0, frames\)/.test(engine),
);
check(
  "the key follows Task 7.1 audibility for the source",
  /this\.currentAudibility\.outputPasses\(sourceId\)/.test(engine),
);

// --- 5. The audible path is untouched. -------------------------------------------------------
check(
  "the chains only forward a key; they never add one to the signal",
  /keys\?\.dynamicEq/.test(chains) && /keys\?\.compressor/.test(chains) && !/addInto\([^)]*key/.test(engine),
);
check(
  "the sidechain module never sums, sends or copies audio",
  !/addInto|copyInto|\+=/.test(sidechain),
);
check(
  "the reported latency is the limiter's, not a key delay",
  /this\.latencyFrames = this\.limiter\.latencyFrames;/.test(engine) && !/keyDelay|lookahead.*key/i.test(engine),
);

// --- 6. Validation: separate, complete, non-throwing. -----------------------------------------
const reasons = [
  "malformed",
  "unknown-source",
  "unknown-destination",
  "source-not-a-track",
  "self-sidechain",
  "unsupported-destination",
  "duplicate-assignment",
];
for (const reason of reasons) {
  check(`the validator names "${reason}"`, new RegExp(`"${reason}"`).test(sidechain));
}
check(
  "validation is separate from the audible graph",
  /export function validateSidechains/.test(sidechain) && !/validateGraph/.test(sidechain),
);
check(
  "a bad edge is dropped, never silently honoured",
  /continue;/.test(sidechain) && /reject\(/.test(sidechain) && !/throw new Error/.test(sidechain),
);
check(
  "a duplicate assignment keeps the first and reports the second",
  /already listens to/.test(sidechainRaw),
);
check(
  "the engine exposes the verdict so a controller can surface a broken edge",
  /get sidechainVerdict\(\)/.test(engine) && /sidechainVerdict/.test(read("tests/engine-sidechain.test.mjs")),
);

// --- 7. Lifecycle: no allocation in the loop, no rebuild of chains. --------------------------
const processBody = engine.slice(engine.indexOf("  process("), engine.indexOf("  flush("));
check(
  "process() still allocates nothing",
  processBody.length > 0 && !/\bnew [A-Z]/.test(processBody.replace(/new Error\(/g, "")) && !/\.map\(|\.filter\(/.test(processBody),
);
check(
  "key buffers are allocated once, in the constructor and on refresh only",
  /this\.keyBundles = this\.buildKeyBundles\(this\.currentSidechains, maxFrames\);/.test(engine) &&
    /refreshSidechains\(edges\?: readonly SidechainEdge\[\]\)/.test(engine) &&
    !/buildKeyBundles\(.*blockFrames/.test(engine),
);
check(
  "refreshSidechains rebuilds the plan without touching a chain",
  !/refreshSidechains[\s\S]{0,400}new (TrackChain|BusChain|ReturnChain)/.test(engine),
);

// --- 8. Tests, script, docs, report. ---------------------------------------------------------
const pkgRaw = read("package.json");
const pkg = JSON.parse(pkgRaw);
const tests = read("tests/engine-sidechain.test.mjs");
const testCount = (tests.match(/^test\(/gm) ?? []).length;
check("the suite is registered in npm test", /tests\/engine-sidechain\.test\.mjs/.test(pkg.scripts.test));
check("the guard is wired as check:sidechain", /node scripts\/check-sidechain-structure\.mjs/.test(pkg.scripts["check:sidechain"] ?? ""));
check("no new dependency", Object.keys(pkg.dependencies ?? {}).length === 0);
check("the suite covers key selection, routing, timing and regression", testCount >= 17, `${testCount} tests`);
check(
  "the tests assert signal, not just calls",
  /peak\(/.test(tests) && /rms\(/.test(tests) && /trackReductionDb/.test(tests) && /sample-identical/.test(tests),
);
check(
  "the tests cover mute, solo, a bus destination and a stale-key check",
  /muted source keys nothing/.test(tests) && /solo-excluded source keys nothing/.test(tests) && /bus compressor can be keyed/.test(tests) && /never stale/.test(tests),
);

const dataModel = read("data-model.md");
check(
  "data-model.md documents the implemented contract",
  /^## 18\. Sidechain routing/m.test(dataModel) &&
    /pre-fader, post-trim/i.test(dataModel) &&
    /validateSidechains/.test(dataModel) &&
    /duplicate-assignment/.test(dataModel) &&
    /not in this build/i.test(dataModel),
);
const decisionLog = read("decisions-log.md");
check(
  "the decisions log records the five answers",
  ["D7.2.1", "D7.2.2", "D7.2.3", "D7.2.4", "D7.2.5"].every((id) => decisionLog.includes(id)),
);
const report = read("task-reports/7.2-report.md");
check(
  "the report covers the task's eight required sections",
  /Files created or modified/.test(report) &&
    /How the sidechain signal path works/.test(report) &&
    /How external keys reach the two detectors/.test(report) &&
    /Synchronisation and block boundaries/.test(report) &&
    /Routing validation and cycle handling/.test(report) &&
    /Limitations and required future changes/.test(report) &&
    /Tests added/.test(report) &&
    /Deviations from the task/.test(report),
);
check(
  "the report is honest about the two contract gaps and the unsaved store wiring",
  /readiness gate/i.test(report) && /no sidechain field|not modelled/i.test(report) && /Store \/ UI \/ persistence are not wired/.test(report),
);
check("the report records the verification numbers", /313\/313/.test(report) && /605\.60 kB/.test(report));
check(
  "the report records checkpoint c3d9d14, a clean synced tree and that 7.3 was not started",
  /checkpointed as \*\*`c3d9d14`\*\*/.test(report) &&
    /working tree is clean/.test(report) &&
    /7\.3 is\s+\*\*not started\*\*/.test(report),
);

// --- 9. Pins: the 7.2 sources as reviewed. ---------------------------------------------------
const pinned = {
  "src/lib/engine/sidechain.ts": "5ef6f3c2853ce37f4a1f75ee92242f68ffbd8e728a736ed9f8de040326641881",
  "src/lib/dsp/compressor.ts": "bac2cbc5a7894abde0bb1593a6bdf2ecb6d6aa276d9cba38d2cef73fe087503b",
  "src/lib/engine/chains.ts": "3736f3b86130a0512ec777b12ae27605452ff4027178745a3665d0bc264167cd",
  "src/lib/engine/mix-engine.ts": "df267eaaea46eebada03861aae3e1a54bba88e9c0b315580c8efc2acaa78b097",
  "src/lib/project/model.ts": "6bc7373e2ce155f67f5fd4065da57e6d34a316828bdbd55e79edb5f8e9bcefc4",
};
  // Task 11.1 re-pin (rates, conversion, the export dialog): every changed
  // file re-pinned; the unchanged ones keep their hash.
for (const [rel, hash] of Object.entries(pinned)) {
  check(`reviewed file untouched: ${rel}`, exists(rel) && sha256(read(rel)) === hash, exists(rel) ? `sha256 ${sha256(read(rel)).slice(0, 16)}…` : "missing");
}

// --- Report. ---------------------------------------------------------------------------------
for (const name of passes) console.log(`  PASS  ${name}`);
for (const name of failures) console.error(`  FAIL  ${name}`);
console.log(`\nSidechain routing (detector path) structural contract check — ${passes.length}/${passes.length + failures.length} passed`);
process.exit(failures.length ? 1 : 0);
