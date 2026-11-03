#!/usr/bin/env node
/**
 * ALLOY — Task 6.2 structural contract: the compressor, the expander and the safety limiter.
 *
 * What this guards (plan §8 blocks 2 and 5 and the output stage, L341–365 / L371 / L397; §11
 * chunking L485; D2.8.1 / D2.8.3 / D2.8.5; the owner's answers of 2026-11-03; the report
 * `task-reports/6.2-report.md` and `data-model.md` §15):
 *
 *   1. Four isolated modules under `src/lib/dsp/`, pure of the browser — no DOM, no timers, no
 *      storage, no Web Audio, no randomness — importing nothing from outside their own folder,
 *      and one shared engine so their decibel, their linking and their timing cannot drift.
 *   2. Four compressor characters on that engine, with the documented knee widths (0 / 3 / 9 /
 *      12 dB), detectors (peak / peak / rms / rms) and progressive ratios, and NO added
 *      saturation: a character is a curve, a detector and a release law, nothing else.
 *   3. Auto Release exists as the owner specified it and nowhere in the documents: OFF is the
 *      knob's fixed release for every character, ON is that character's own adaptive law, and
 *      the default is OFF so an old project is unchanged.
 *   4. The expander is downward and smooth, with five controls, a 6 dB knee, a RANGE clamp,
 *      ATTACK opening and RELEASE closing, maximum-channel linking and no Hold and no gate.
 *   5. The limiter is a sample-peak brickwall with 5 ms of lookahead: ceiling −12 … 0 dBFS
 *      (default −1), latency reported as `latencyFrames`, a tail flushed rather than trimmed,
 *      and no make-up gain, no normalisation and no loudness target.
 *   6. The project's conventions hold: channels of Float32 at 48 kHz, mono or stereo, carried
 *      state across blocks, no allocation in the processing path, a non-finite value throws, a
 *      finite out-of-range one clamps.
 *   7. Scope: nothing outside `src/lib/dsp/` imports them; no new dependency.
 *   8. The tests, the package script and the docs exist, and the files are pinned as reviewed.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
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
  text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const walk = (dir, out = []) => {
  for (const name of readdirSync(resolve(root, dir))) {
    const rel = join(dir, name);
    if (statSync(resolve(root, rel)).isDirectory()) walk(rel, out);
    else out.push(rel);
  }
  return out;
};
const count = (text, re) => (text.match(re) ?? []).length;

/** The body of the first `signature(` in `text`, by brace matching. */
function methodBody(text, signature) {
  const at = text.indexOf(signature);
  if (at < 0) return "";
  const open = text.indexOf("{", at);
  if (open < 0) return "";
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth += 1;
    else if (text[i] === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(open, i + 1);
    }
  }
  return "";
}

// --- Files. --------------------------------------------------------------------------------
const FILES = {
  params: "src/lib/dsp/params.ts",
  dynamics: "src/lib/dsp/dynamics.ts",
  compressor: "src/lib/dsp/compressor.ts",
  expander: "src/lib/dsp/expander.ts",
  limiter: "src/lib/dsp/limiter.ts",
  compressorTest: "tests/dsp-compressor.test.mjs",
  expanderTest: "tests/dsp-expander.test.mjs",
  limiterTest: "tests/dsp-limiter.test.mjs",
  dataModel: "data-model.md",
  report: "task-reports/6.2-report.md",
  pkg: "package.json",
};
for (const [key, rel] of Object.entries(FILES)) check(`file exists: ${rel}`, exists(rel), key);
const S = Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, exists(rel) ? read(rel) : ""]));
const dspFiles = Object.values(FILES).filter((rel) => rel.startsWith("src/lib/dsp/"));
const paramsCode = stripComments(S.params);
const dynamicsCode = stripComments(S.dynamics);
const compressorCode = stripComments(S.compressor);
const expanderCode = stripComments(S.expander);
const limiterCode = stripComments(S.limiter);
const dspCode = [paramsCode, dynamicsCode, compressorCode, expanderCode, limiterCode].join("\n");
// The prose lives in comments, which `stripComments` removes: claims about the design are checked
// against the file as written, code properties against the stripped body.
const paramsRaw = S.params;
const dynamicsRaw = S.dynamics;
const compressorRaw = S.compressor;
const expanderRaw = S.expander;
const limiterRaw = S.limiter;
const pkg = S.pkg ? JSON.parse(S.pkg) : { scripts: {} };

// --- 1. Isolation and purity. --------------------------------------------------------------
for (const rel of dspFiles) {
  const body = stripComments(read(rel));
  check(
    `pure of the browser: ${rel}`,
    !/\bwindow\b|\bdocument\b|localStorage|sessionStorage|indexedDB|performance\.now|Date\.now|setTimeout|setInterval|requestAnimationFrame|Math\.random|new Worker|fetch\(|WebSocket/.test(body),
  );
  check(`imports only its own folder: ${rel}`, !/from "\.\.\//.test(body) && !/from "@\//.test(body));
}
check(
  "no Web Audio API in the dynamics: the modules are the project's arithmetic, not browser nodes",
  !/AudioContext|AudioWorklet|DynamicsCompressor|BiquadFilterNode|decodeAudioData|OfflineAudioContext/.test(dspCode),
);

// --- 2. The shared engine. -------------------------------------------------------------------
check(
  "one detector for all of them, linked by the MAXIMUM channel and never by a sum",
  /export type DetectorKind = "peak" \| "rms";/.test(dynamicsCode) &&
    /if \(value > magnitude\) magnitude = value;/.test(dynamicsCode) &&
    /if \(mean > power\) power = mean;/.test(dynamicsCode) &&
    !/\+\s*input\[1\]|input\[0\]\[i\] \+ input\[1\]\[i\]/.test(dynamicsCode),
);
check(
  "the RMS characters keep an RMS detector (a 10 ms mean square), not a peak one wearing its name",
  /export const RMS_WINDOW_MS = 10;/.test(dynamicsCode) &&
    /this\.meanSquares\[c\] \+ \(square - this\.meanSquares\[c\]\) \* this\.coefficient/.test(dynamicsCode),
);
check(
  "one timing convention, stated in the domain it is measured in: 1 − e^(−1/(τ·fs)), 63.2 % of a step",
  /export function timeConstant\(milliseconds: number, sampleRate: number\): number \{/.test(dynamicsCode) &&
    /1 - Math\.exp\(-1 \/ \(milliseconds \* 0\.001 \* sampleRate\)\)/.test(dynamicsCode) &&
    /63\.2 %/.test(dynamicsRaw),
);
check(
  "silence reads −120 dBFS, never −∞: an envelope has to be able to carry it",
  /export const SILENCE_DB = -120;/.test(dynamicsCode) && /return SILENCE_DB;/.test(dynamicsCode),
);
check(
  "the soft knee is one quadratic shared by both directions, continuous in value at both edges",
  /export function kneeReduction\(overDb: number, kneeDb: number, amount: number\): number \{/.test(dynamicsCode) &&
    /const x = overDb \+ half;/.test(dynamicsCode) &&
    /\(amount \* x \* x\) \/ \(2 \* kneeDb\)/.test(dynamicsCode),
);
check(
  "the progressive ratio is the owner's law: exact at the knob up to the reference, then walking toward 20:1",
  /export const RATIO_REFERENCE_DB = 10;/.test(dynamicsCode) &&
    /export function effectiveRatio\(ratio: number, overDb: number, factor: number, spanDb: number\): number \{/.test(dynamicsCode) &&
    /1 \+ \(ratio - 1\) \* factor/.test(dynamicsCode) &&
    /if \(ratio <= 1\) return 0;/.test(dynamicsCode),
);

// --- 3. The four characters. -----------------------------------------------------------------
check(
  "four characters, in the console's order, on one engine",
  /"vca", "opto", "fet", "vari-mu"/.test(compressorCode) &&
    /export class VcaCompressor extends Compressor/.test(compressorCode) &&
    /export class OptoCompressor extends Compressor/.test(compressorCode) &&
    /export class FetCompressor extends Compressor/.test(compressorCode) &&
    /export class VariMuCompressor extends Compressor/.test(compressorCode),
);
check(
  "the documented differences: hard knee for VCA, 3 dB for FET, 9 dB for Opto, 12 dB for Vari-Mu",
  /kneeDb: 0,/.test(compressorCode) && /kneeDb: 3,/.test(compressorCode) && /kneeDb: 9,/.test(compressorCode) && /kneeDb: 12,/.test(compressorCode),
);
check(
  "the detectors differ too: peak for VCA and FET, rms for Opto and Vari-Mu",
  count(compressorCode, /detector: "peak",/g) === 2 && count(compressorCode, /detector: "rms",/g) === 2,
);
check(
  "NO ADDED SATURATION anywhere: no tanh, no clip, no waveshaper, no 'distortion-free' claim",
  !/tanh|waveshap|\bclip(?:ping|ped)?\b|distortion-free|saturation stage/i.test(dspCode) &&
    /no added saturation/i.test(compressorRaw) &&
    /no added saturation/i.test(S.report),
);
check(
  "the characters are topology-INSPIRED, never sold as hardware emulations",
  /topology-INSPIRED/.test(compressorRaw) && /without claiming any emulation/.test(compressorRaw) && !/\bemulat/i.test(compressorCode),
);
check(
  "the five controls are the chain's (D2.8.3) and the module adds no sixth knob",
  /thresholdDb: requireInRange\(requireFinite\(settings\.thresholdDb, "thresholdDb"\), COMPRESSOR_THRESHOLD_DB, "thresholdDb"\)/.test(compressorCode) &&
    /ratio: requireInRange\(requireFinite\(settings\.ratio, "ratio"\), COMPRESSOR_RATIO, "ratio"\)/.test(compressorCode) &&
    /attackMs: requireInRange\(requireFinite\(settings\.attackMs, "attackMs"\), DYNAMICS_ATTACK_MS, "attackMs"\)/.test(compressorCode) &&
    /releaseMs: requireInRange\(requireFinite\(settings\.releaseMs, "releaseMs"\), DYNAMICS_RELEASE_MS, "releaseMs"\)/.test(compressorCode) &&
    /makeupDb: requireInRange\(requireFinite\(settings\.makeupDb, "makeupDb"\), COMPRESSOR_MAKEUP_DB, "makeupDb"\)/.test(compressorCode),
);

// --- 4. Auto Release, the owner's one new control. ---------------------------------------------
check(
  "Auto Release: OFF by default, so a project that predates it behaves as if it were always off",
  /settings\.autoRelease === undefined \? false : requireBoolean\(settings\.autoRelease, "autoRelease"\)/.test(compressorCode) &&
    /if \(!this\.settings\.autoRelease\) return base;/.test(compressorCode),
);
check(
  "Auto Release ON is character-specific: four laws, not one law with four names",
  /case "depth-slower"/.test(compressorCode) &&
    /case "depth-faster"/.test(compressorCode) &&
    /case "two-stage"/.test(compressorCode) &&
    /case "two-stage-tail"/.test(compressorCode),
);
check(
  "and the report says plainly that no document defines this control — it is the owner's, dated",
  /Auto Release/.test(S.report) && /2026-11-03/.test(S.report) && /(?:nowhere|not documented|no document)/i.test(S.report),
);
check(
  "a character change never rewrites a value: the settings pass through as they came",
  /return \{\s*character,\s*thresholdDb:/.test(compressorCode) &&
    /never substitutes a value for a[\s\S]{0,60}missing control/.test(compressorRaw) &&
    /the settings are the caller's, never rewritten/.test(S.compressorTest),
);

// --- 5. The expander. ---------------------------------------------------------------------------
check(
  "the expander's five controls, and no sixth: no Hold, no gate mode, no extra switch",
  /thresholdDb: number;/.test(expanderCode) &&
    /ratio: number;/.test(expanderCode) &&
    /rangeDb: number;/.test(expanderCode) &&
    !/\bhold\b/i.test(expanderCode) &&
    !/gate/i.test(expanderCode.replace(/gate(?:s)? the|no gate|not a gate/gi, "")) &&
    count(expanderCode, /readonly \w+Ms: number;/g) >= 2,
);
check(
  "its knee is fixed at 6 dB and PROVISIONAL — no document fixes an expander knee",
  /export const EXPANDER_KNEE_DB = 6;/.test(expanderCode) && /PROVISIONAL/.test(expanderRaw),
);
check(
  "ATTACK OPENS and RELEASE CLOSES, and the code says so where it applies the envelope",
  /Attack opens \(level rising\), release closes \(level falling\)/.test(expanderRaw) &&
    /envelope\.step\(target, attack, release\)/.test(expanderCode) &&
    /ATTACK is the opening/.test(S.report),
);
check(
  "below the threshold is turned DOWN by at most RANGE: a clamp, never a mute",
  /export function expansionReduction\(belowDb: number, kneeDb: number, amount: number, rangeDb: number\): number \{/.test(dynamicsCode) &&
    /return reduction > rangeDb \? rangeDb : reduction;/.test(dynamicsCode),
);
check(
  "1:1 and RANGE 0 are exactly neutral — two ways to do nothing, both exact",
  /if \(amount <= 0\) return 0;/.test(dynamicsCode) && /ratio: 1/.test(S.expanderTest) && /rangeDb: 0/.test(S.expanderTest),
);
check(
  "maximum-channel linking in the expander too, and a test that says the sum would be wrong",
  /new LevelDetector\("peak", this\.channels, this\.sampleRate\)/.test(expanderCode) &&
    /max\(\|L\|,\|R\|\), not \|L\+R\|/.test(S.expanderTest),
);

// --- 6. The limiter. ------------------------------------------------------------------------------
check(
  "5 ms of lookahead, converted from the ACTUAL rate and rounded to whole frames",
  /export const LIMITER_LOOKAHEAD_MS = 5;/.test(limiterCode) &&
    /Math\.max\(1, Math\.round\(LIMITER_LOOKAHEAD_MS \* 0\.001 \* this\.sampleRate\)\)/.test(limiterCode),
);
check(
  "the latency is public and the tail is flushed, not trimmed: compensation by construction",
  /readonly latencyFrames: number;/.test(limiterCode) &&
    /flush\(output: readonly Float32Array\[\], count = this\.latencyFrames\): void \{/.test(limiterCode) &&
    /drop(?:s|ping)? that many leading[\s\S]{0,40}frames/.test(limiterRaw),
);
check(
  "a SAMPLE-peak ceiling, said in those words: −1 dBFS by default, a margin, not a loudness target",
  /export const DEFAULT_LIMITER_CEILING_DB = -1;/.test(limiterCode) &&
    /sample-peak/.test(limiterRaw) &&
    /not a true-peak/.test(limiterRaw) &&
    /not a mastering-headroom policy, not a loudness[\s\S]{0,40}target/.test(limiterRaw),
);
check(
  "it detects max(|L|,|R|) and applies one gain to the pair",
  /let peak = 0;/.test(limiterCode) &&
    /if \(value > peak\) peak = value;/.test(limiterCode) &&
    /output\[c\]\[i\] = line\[p\] \* applied;/.test(limiterCode),
);
check(
  "the release can never raise a scheduled reduction: the applied gain is the minimum of the two",
  /const applied = scheduled < recovered \? scheduled : recovered;/.test(limiterCode) &&
    /if \(value < schedule\[at\]\) schedule\[at\] = value;/.test(limiterCode),
);
check(
  "no make-up, no normalisation, no LUFS, no boost: the gain never exceeds unity",
  !/makeup|LUFS|lufs|\bRMS\b|normaliseGain|maximi[sz]e/i.test(limiterCode) && /const target = peak > ceiling \? ceiling \/ peak : 1;/.test(limiterCode),
);

// --- 7. Allocation and conventions. ---------------------------------------------------------------
const processBodies = [methodBody(compressorCode, "process("), methodBody(expanderCode, "process("), methodBody(limiterCode, "process(")];
check(
  "no allocation in any processing path: no `new`, no array literal, no slice / map / subarray / fill",
  processBodies.every((body) => body.length > 0 && !/\bnew [A-Z]|\[\]|\.slice\(|\.map\(|\.subarray\(|\.fill\(|\.filter\(/.test(body)),
  processBodies.map((body) => body.length).join(" / "),
);
check(
  "state is carried between blocks, not rebuilt: the detector, the envelope and the reduction live on the instance",
  /private readonly detector: LevelDetector;/.test(compressorCode) &&
    /private readonly envelope = new EnvelopeFollower\(\);/.test(compressorCode) &&
    /this\.reductionDb = reduction;/.test(compressorCode) &&
    /private readonly meanSquares: Float64Array;/.test(dynamicsCode),
);
check(
  "every module resets, reports its reduction, copies when bypassed and checks its buffers",
  count(dspCode, /reset\(\): void \{/g) >= 4 &&
    count(dspCode, /get gainReductionDb\(\): number \{/g) >= 3 &&
    /bypassed\) \{\s*\n?\s*copyChannels\(this\.channels, input, output, frames\);/.test(compressorCode) &&
    /copyChannels\(this\.channels, input, output, frames\);/.test(expanderCode) &&
    /requireBuffers\("Alloy Compressor"/.test(compressorCode) &&
    /requireBuffers\("Alloy Expander"/.test(expanderCode) &&
    /requireBuffers\("Alloy Safety Limiter"/.test(limiterCode),
);
check(
  "a non-finite value throws, a finite out-of-range one clamps — including the new switches",
  /export function requireBoolean\(value: unknown, what: string\): boolean \{/.test(paramsCode) &&
    /out-of-range clamps/.test(S.compressorTest) &&
    /out-of-range clamps/.test(S.expanderTest) &&
    /out-of-range clamps/.test(S.limiterTest),
);

// --- 8. Ranges: the chain's own, and the provisional ones named as such. --------------------------
check(
  "the compressor's ranges are D2.8.3's chain specs, not new ones",
  /export const COMPRESSOR_THRESHOLD_DB: DspRange = \{ min: -40, max: 0 \};/.test(paramsCode) &&
    /export const COMPRESSOR_RATIO: DspRange = \{ min: 1, max: 20 \};/.test(paramsCode) &&
    /export const COMPRESSOR_MAKEUP_DB: DspRange = \{ min: 0, max: 20 \};/.test(paramsCode) &&
    /export const DYNAMICS_ATTACK_MS: DspRange = \{ min: 0\.1, max: 100 \};/.test(paramsCode) &&
    /export const DYNAMICS_RELEASE_MS: DspRange = \{ min: 10, max: 1000 \};/.test(paramsCode),
);
check(
  "the expander's and the limiter's ranges are marked PROVISIONAL in the file that owns them",
  /export const EXPANDER_THRESHOLD_DB: DspRange = \{ min: -60, max: 0 \};/.test(paramsCode) &&
    /export const EXPANDER_RATIO: DspRange = \{ min: 1, max: 4 \};/.test(paramsCode) &&
    /export const EXPANDER_RANGE_DB: DspRange = \{ min: 0, max: 40 \};/.test(paramsCode) &&
    /export const LIMITER_CEILING_DB: DspRange = \{ min: -12, max: 0 \};/.test(paramsCode) &&
    /PROVISIONAL/.test(paramsRaw),
);

// --- 9. Scope: nothing is wired, nothing new is depended on. --------------------------------------
// Task 7.1 wired the DSP into `src/lib/engine/`: that is the only door into it.
const outside = walk("src").filter(
  (rel) => !rel.startsWith("src/lib/dsp/") && !rel.startsWith("src/lib/engine/"),
);
check(
  "only the 7.1 engine layer imports the dynamics: no store, no room, no UI",
  outside.every((rel) => !/lib\/dsp\/|from "\.\.\/dsp\/|from "\.\/dsp\//.test(stripComments(read(rel)))),
);
check(
  "the engine layer is the one bridge to the DSP (Task 7.1)",
  walk("src/lib/engine").some((rel) => /from "\.\.\/dsp\//.test(read(rel))),
);
check("no new runtime dependency", !pkg.dependencies || Object.keys(pkg.dependencies).length === 0);

// --- 10. Tests, script, docs. ----------------------------------------------------------------------
check(
  "the suites cover the task's list: thresholds, ratio, make-up, attack, release, characters, expander law, ceiling, transients, linking, continuity, neutral, validation, determinism",
  /below the knee/.test(S.compressorTest) &&
    /above the knee/.test(S.compressorTest) &&
    /make-up gain is applied exactly/.test(S.compressorTest) &&
    /63\.2 % of its step after ATTACK/.test(S.compressorTest) &&
    /36\.8 % left after RELEASE/.test(S.compressorTest) &&
    /the ratio law is exact/.test(S.expanderTest) &&
    /RANGE is a clamp on the law/.test(S.expanderTest) &&
    /nothing crosses the ceiling/.test(S.limiterTest) &&
    /the lookahead catches the transient/.test(S.limiterTest) &&
    /release never compromises the ceiling/.test(S.limiterTest) &&
    /maximum channel/.test(S.compressorTest) + /max\(\|L\|,\|R\|\)/.test(S.expanderTest) + /max\(\|L\|,\|R\|\)/.test(S.limiterTest) >= 3 &&
    count(S.compressorTest, /^test\(/gm) >= 15 &&
    count(S.expanderTest, /^test\(/gm) >= 12 &&
    count(S.limiterTest, /^test\(/gm) >= 12,
);
check(
  "the tests are recorded in the timeline and in npm test, with the guard script beside them",
  /"test": "node --import \.\/tests\/register\.mjs --test /.test(S.pkg) &&
    /tests\/dsp-compressor\.test\.mjs tests\/dsp-expander\.test\.mjs tests\/dsp-limiter\.test\.mjs/.test(S.pkg) &&
    /"check:dynamics": "node scripts\/check-dynamics-structure\.mjs"/.test(S.pkg),
);
check(
  "docs: data-model.md carries §15 — the three contracts, the linking convention and the timing",
  /^## 15\. /m.test(S.dataModel) &&
    /src\/lib\/dsp\/dynamics\.ts/.test(S.dataModel) &&
    /src\/lib\/dsp\/compressor\.ts/.test(S.dataModel) &&
    /src\/lib\/dsp\/expander\.ts/.test(S.dataModel) &&
    /src\/lib\/dsp\/limiter\.ts/.test(S.dataModel) &&
    /maximum-channel/.test(S.dataModel) &&
    /Auto Release/.test(S.dataModel) &&
    /latencyFrames/.test(S.dataModel),
);
check(
  "the report exists and names the modules, the model decisions, the tests and the gaps",
  /Task 6\.2/.test(S.report) &&
    /dsp-compressor/.test(S.report) &&
    /dsp-expander/.test(S.report) &&
    /dsp-limiter/.test(S.report) &&
    /provisional/i.test(S.report) &&
    /limitation|unresolved/i.test(S.report),
);

// --- 11. Pins: the 6.2 modules as reviewed. ----------------------------------------------------------
const pinned = {
  "src/lib/dsp/dynamics.ts": "242b86ec893c8a4b5db58727fad140321e39192b284f4ec61359739c269e4675",
  "src/lib/dsp/compressor.ts": "b94a5b1ee7a2ab32730d56e8e71b05d1e330dc04e482c047da3cfc94698d493e",
  "src/lib/dsp/expander.ts": "66ad6a901516072bcb8507030e67e376a09e8544dfee7ee0ea832450f1760bd9",
  "src/lib/dsp/limiter.ts": "f31f07e9db3ed4bef3bf9147e4d1ed7cb20479d59f456c5eb202ef37068b1522",
};
for (const [rel, hash] of Object.entries(pinned)) {
  check(`reviewed file untouched: ${rel}`, exists(rel) && sha256(read(rel)) === hash, exists(rel) ? `sha256 ${sha256(read(rel)).slice(0, 16)}…` : "missing");
}

// --- Report. ------------------------------------------------------------------------------------
for (const name of passes) console.log(`  PASS  ${name}`);
for (const name of failures) console.error(`  FAIL  ${name}`);
console.log(`\nDynamics modules (compressor · expander · safety limiter) structural contract check — ${passes.length}/${passes.length + failures.length} passed`);
process.exit(failures.length ? 1 : 0);
