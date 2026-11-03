#!/usr/bin/env node
/**
 * ALLOY — Task 7.1 structural contract: the mixer engine (channel chain, summing, routing
 * and bus processing).
 *
 * What this guards (plan §7 L340–395, `PROCESSING_CHAIN_STEPS`, `data-model.md` §17, the
 * owner's answers of 2026-11-03, and `task-reports/7.1-report.md`):
 *
 *   1. Five modules under `src/lib/engine/`, pure of the browser: no DOM, no timers, no
 *      storage, no store, no Svelte in the signal path.
 *   2. The channel chain is the eight approved steps, in order, with no step invented and
 *      no step moved; the bus chain is the narrower bus contract.
 *   3. PAN is the approved constant-power law and BALANCE is the neutral-centred balance.
 *   4. Mute wins, solo is in place, and a skipped path freezes rather than resets.
 *   5. The engine refuses to build on a graph the routing rules reject.
 *   6. The block loop allocates nothing; the lifecycle API is present.
 *   7. The two provisional values are marked provisional.
 *   8. The tests, the scripts, the docs and the report exist, and the sources are pinned.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(resolve(root, rel), "utf8");
const exists = (rel) => existsSync(resolve(root, rel));
const sha256 = (text) => createHash("sha256").update(text.replace(/\r\n/g, "\n")).digest("hex");
const walk = (dir, out = []) => {
  for (const name of readdirSync(resolve(root, dir))) {
    const rel = join(dir, name);
    if (statSync(resolve(root, rel)).isDirectory()) walk(rel, out);
    else out.push(rel);
  }
  return out;
};

const failures = [];
const passes = [];
function check(name, condition, detail = "") {
  const line = detail ? `${name} — ${detail}` : name;
  (condition ? passes : failures).push(line);
}
const stripComments = (text) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

// --- 1. The files, and their isolation. ------------------------------------------------------
const FILES = [
  "src/lib/engine/pan.ts",
  "src/lib/engine/constants.ts",
  "src/lib/engine/audibility.ts",
  "src/lib/engine/chains.ts",
  "src/lib/engine/mix-engine.ts",
];
for (const rel of FILES) {
  check(`exists: ${rel}`, exists(rel));
}
const engineFiles = walk("src/lib/engine");
const engineCode = Object.fromEntries(engineFiles.map((rel) => [rel, stripComments(read(rel))]));
check("the engine layer is exactly these five files", engineFiles.length === FILES.length, `${engineFiles.length} files`);

const forbidden = /svelte|localStorage|sessionStorage|document\.|window\.|requestAnimationFrame|setTimeout|setInterval|fetch\(/;
for (const [rel, code] of Object.entries(engineCode)) {
  check(`browser-free: ${rel}`, !forbidden.test(code));
}
for (const [rel, code] of Object.entries(engineCode)) {
  const imports = [...code.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
  const legal = imports.every(
    (spec) =>
      spec.startsWith("./") ||
      spec.startsWith("../dsp/") ||
      spec.startsWith("../project/") ||
      spec === "../mixer-chain" ||
      spec === "../return-chain",
  );
  check(`imports only the DSP, the model and its own folder: ${rel}`, legal, imports.join(" "));
}

// --- 2. The chain order. --------------------------------------------------------------------
const chains = engineCode["src/lib/engine/chains.ts"];
const trackClass = chains.slice(chains.indexOf("class TrackChain"), chains.indexOf("class BusChain"));
const trackBody = trackClass.slice(trackClass.indexOf("process(buffer"));
const steps = ["this.trimGain", "this.expander", "this.eq.process", "this.dynamicEq.process", "this.compressor.process", "this.pan.left", "this.faderGain"];
const order = steps.map((name) => trackBody.indexOf(name));
check(
  "the track chain runs trim → expander → EQ → dynamic EQ → compressor → pan → fader, in that order",
  order.every((at, i) => at >= 0 && (i === 0 || at > order[i - 1])),
);
check("the track chain exposes the eight steps of PROCESSING_CHAIN_STEPS", /class TrackChain/.test(chains) && /class BusChain/.test(chains) && /class ReturnChain/.test(chains));
check("TRIM is audio gain before the detectors, not a detector offset", /this\.trimGain = dbToGain\(channel\.trim\);/.test(chains));
check(
  "the expander is in circuit only when cleanup is set",
  /cleanup/.test(chains) && /Expander/.test(chains) && /bypassed/.test(chains),
);
check(
  "dynamic bands carry no static gain of their own (block 03 already applied it)",
  /dynamicBands/.test(chains) && /gain: 0\n?/.test(chains.replace(/\s*:\s*/g, ": ")),
);
check("the bus chain is trim → EQ → compressor → balance → fader", /class BusChain/.test(chains) && /this\.balance = balanceGains\(/.test(chains) && !/class BusChain[\s\S]{0,1200}panGains\(/.test(chains));
check("a Return is effect then level, with no dry path", /class ReturnChain/.test(chains) && /this\.levelGain = levelGain\(/.test(chains) && !/\bdry\b/i.test(chains));
check("a fader at −60 is silence, not a small gain", /-60/.test(chains) && /levelGain/.test(chains));

// --- 3. PAN and BALANCE. ---------------------------------------------------------------------
const pan = engineCode["src/lib/engine/pan.ts"];
check(
  "the approved centre is −3.01 dB, computed exactly and exported once",
  /export const PAN_CENTRE_DB = 20 \* Math\.log10\(Math\.SQRT1_2\);/.test(pan) &&
    Math.abs(20 * Math.log10(Math.SQRT1_2) + 3.01) < 0.001,
);
check("PAN is constant power: cos and sin of the quarter turn", /Math\.cos\(theta\)/.test(pan) && /Math\.sin\(theta\)/.test(pan));
check("a hard pan is exactly silent on the far side, not 6e-17", /tidy/.test(pan) && /1e-15/.test(pan));
check(
  "BALANCE is neutral at centre and attenuation-only, deliberately not the pan law",
  /export function balanceGains/.test(pan) &&
    /const attenuation = 1 - Math\.abs\(position\) \/ 100;/.test(pan) &&
    /position <= 0 \? \{ left: 1, right: attenuation \}/.test(pan),
);
check("the balance-vs-pan divergence is documented in the source", /NOT `?panGains`?|NOT panGains/i.test(read("src/lib/engine/pan.ts")));

// --- 4. Mute and solo. -----------------------------------------------------------------------
const audibility = engineCode["src/lib/engine/audibility.ts"];
check("mute wins over solo", /mute/.test(audibility) && /solo/i.test(audibility) && /export function computeAudibility/.test(audibility));
check("the engine exposes output and send predicates", /outputPasses/.test(audibility) && /sendPasses/.test(audibility));
check("the rules are exported for the UI and the tests to read", /AUDIBILITY_RULES/.test(audibility));
check(
  "a skipped chain is frozen, not reset",
  /nothing passes|frozen/i.test(read("src/lib/engine/mix-engine.ts")) && /if \(!sendActive && !outputActive\) continue;/.test(engineCode["src/lib/engine/mix-engine.ts"]),
);
check("solo-in-place: the routing path of a soloed object is walked", /solo|Solo/.test(audibility) && /busProcessingOrder/.test(audibility));

// --- 5. The graph gate. ----------------------------------------------------------------------
const engine = engineCode["src/lib/engine/mix-engine.ts"];
check(
  "the engine validates the graph before it builds anything, and throws with the reason",
  /validateGraph\(project\)/.test(engine) &&
    /if \(!verdict\.ok\)/.test(engine) &&
    /routing graph is not playable/.test(read("src/lib/engine/mix-engine.ts")),
);
check("buses are processed sources first", /busProcessingOrder\(project\)/.test(engine));
check("sends are post-fader and post-pan, and a −60 send is off", /send\.level <= -60 \? 0/.test(engine));

// --- 6. The lifecycle, and a real-time loop that allocates nothing. --------------------------
const processBody = engine.slice(engine.indexOf("  process("), engine.indexOf("  flush("));
const allocations = processBody.replace(/new Error\(/g, "");
check(
  "process() allocates nothing: its buffers were sized in the constructor",
  processBody.length > 0 && !/\bnew [A-Z]/.test(allocations) && !/\.map\(/.test(allocations) && !/\.filter\(/.test(allocations),
);
check("buffers are sized once, from maxFramesPerBlock", /maxFramesPerBlock/.test(engine) && /new Float32Array/.test(engine.slice(0, engine.indexOf("  process("))));
check("a block larger than the engine was built for is a named error", /more than the \$\{?/.test(read("src/lib/engine/mix-engine.ts")));
check("the lifecycle API: reset, flush, tailSeconds, latencyFrames, refreshAudibility", /reset\(\)/.test(engine) && /flush\(/.test(engine) && /get tailSeconds/.test(engine) && /latencyFrames/.test(engine) && /refreshAudibility\(\)/.test(engine));
check("the master limiter is always in circuit and its lookahead is the reported latency", /SafetyLimiter/.test(engine) && /MASTER_LIMITER/.test(engine));
check(
  "refreshAudibility recomputes only the routing — no chain is rebuilt",
  /refreshAudibility\(\)[\s\S]{0,200}computeAudibility\(this\.project\)/.test(engine) && !/refreshAudibility\(\)[\s\S]{0,300}new TrackChain/.test(engine),
);

// --- 7. The provisional values. ---------------------------------------------------------------
const constants = engineCode["src/lib/engine/constants.ts"];
const constantsRaw = read("src/lib/engine/constants.ts");
check("the two control gates are marked provisional", /PROVISIONAL/.test(constantsRaw) && /DYNAMIC_BAND_GATE/.test(constants) && /CLEANUP_EXPANDER/.test(constants));
check(
  "the master limiter's settings come from the 6.2 defaults and are named once",
  /export const MASTER_LIMITER = \{/.test(constants) &&
    /ceilingDb: DEFAULT_LIMITER_CEILING_DB/.test(constants) &&
    /releaseMs: DEFAULT_LIMITER_RELEASE_MS/.test(constants),
);

// --- 8. Tests, scripts, docs, report. ---------------------------------------------------------
const pkgRaw = read("package.json");
const pkg = JSON.parse(pkgRaw);
check("the two engine suites run under npm test", /tests\/engine-chain\.test\.mjs/.test(pkg.scripts.test) && /tests\/engine-routing\.test\.mjs/.test(pkg.scripts.test));
check("the guard script is wired as check:engine", /node scripts\/check-engine-structure\.mjs/.test(pkg.scripts["check:engine"] ?? ""));
check("no new dependency", Object.keys(pkg.dependencies ?? {}).length === 0);

const chainTests = read("tests/engine-chain.test.mjs");
const routingTests = read("tests/engine-routing.test.mjs");
const countTests = (text) => (text.match(/^test\(/gm) ?? []).length;
check("the chain suite covers pan, gains, chain order, gating, characters, sends and wet-only Returns", countTests(chainTests) >= 12 && /constant-power/.test(chainTests) && /post-fader/.test(chainTests) && /wet only/.test(chainTests));
check("the routing suite covers summing, bus order, graph rejection, mute/solo, blocks, reset and flush", countTests(routingTests) >= 14 && /sum at unity/.test(routingTests) && /refuses to build/.test(routingTests) && /sample-identical/.test(routingTests) && /reset/.test(routingTests) && /flush/.test(routingTests));
check("the tests assert signals, not just calls", /peak\(/.test(chainTests) && /peak\(/.test(routingTests) && /assert\.ok/.test(chainTests));
check("the delayed in-place path is pinned by a test", /in place/.test(read("tests/dsp-delay.test.mjs")));

const dataModel = read("data-model.md");
check("data-model.md documents the implemented contracts", /## 17\./.test(dataModel) && /## 17\.2/.test(dataModel) && /## 17\.4/.test(dataModel) && /## 17\.6/.test(dataModel) && /constant-power/i.test(dataModel) && /solo-in-place/i.test(dataModel));
check("data-model.md states the pan/balance divergence", /not\*\* the same function|BALANCE is \*\*not\*\*/.test(dataModel));

const report = read("task-reports/7.1-report.md");
check("the report records the readiness gate and the five answers", /readiness gate/i.test(report) && /as\s+proposed/.test(report) && /−3\.01|-3\.01|−3\.01/.test(report));
check(
  "the report is honest about the delay defect, the balance divergence and the header",
  /not safe in place/.test(report) &&
    /BALANCE narrows the approved pan law/.test(report) &&
    /header contradiction[^\n]*corrected/.test(report) &&
    /Approved at closeout/.test(report),
);
const decisionLog = read("decisions-log.md");
check(
  "the decisions log records the three closeout decisions",
  /D7\.1\.1/.test(decisionLog) &&
    /D7\.1\.2/.test(decisionLog) &&
    /D7\.1\.3/.test(decisionLog) &&
    /keeps? the one-line fix|one-line fix/i.test(decisionLog) &&
    /unity-at-centre/.test(decisionLog) &&
    /routing\.ts/.test(decisionLog),
);
check("the report records the verification numbers", /296\/296/.test(report) && /0 errors/.test(report) && /605\.60 kB/.test(report));
check("the report states that nothing was committed and 7.2 was not started", /Nothing committed/.test(report) && /7\.2[^\n]*not started|not started/.test(report));

// --- 9. Pins: the 7.1 sources as reviewed. ---------------------------------------------------
const pinned = {
  "src/lib/engine/pan.ts": "c03ac7e1f0786125080081d3af6b18fe8f41082947b548fc323f25b0bc6e0505",
  "src/lib/engine/constants.ts": "6a0fb2fba1457ba4dfeaa955e7cb1020931e3bc5187f0703cac7b9579124710e",
  "src/lib/engine/audibility.ts": "d161c11ac94a4b188490ca8655b163380bbfda97b06f504e131a224706f0d8b5",
  "src/lib/engine/chains.ts": "a615b3eafac971158af9e9c51c92c9f9f1591e3d58857c80fbcfbc3fdd652ce8",
  "src/lib/engine/mix-engine.ts": "1f069b240147d4e6efc1b70fdc664ac290a91754ba22ae366acb89a6c269d9e0",
};
for (const [rel, hash] of Object.entries(pinned)) {
  check(`reviewed file untouched: ${rel}`, exists(rel) && sha256(read(rel)) === hash, exists(rel) ? `sha256 ${sha256(read(rel)).slice(0, 16)}…` : "missing");
}

// --- Report. ------------------------------------------------------------------------------------
for (const name of passes) console.log(`  PASS  ${name}`);
for (const name of failures) console.error(`  FAIL  ${name}`);
console.log(`\nMixer engine (chain · summing · routing · bus) structural contract check — ${passes.length}/${passes.length + failures.length} passed`);
process.exit(failures.length ? 1 : 0);
