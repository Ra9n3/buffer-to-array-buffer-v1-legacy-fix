#!/usr/bin/env node
/**
 * ALLOY — Task 6.1 structural contract: the Custom EQ and the Dynamic EQ.
 *
 * What this guards (plan §8 blocks 3 and 4, L337–349; §11 chunking L483–487;
 * D2.8.3 / D2.8.4; the owner's three answers of 2026-11-03; the report
 * `task-reports/6.1-report.md` and `data-model.md` §14):
 *
 *   1. The two modules exist as isolated DSP under `src/lib/dsp/`, pure of the
 *      browser — no DOM, no timers, no storage, no Web Audio, no randomness —
 *      and import nothing from outside their own folder.
 *   2. The EQ is the documented one: four bands (LF low shelf, LMF / HMF bells,
 *      HF high shelf), FREQ 20 Hz – 20 kHz, GAIN ±15 dB, Q 0.3 – 10, the RBJ
 *      prototypes at slope S = 1 and the session rate, the same maths the
 *      Mixer's graph draws, so curve and filter cannot disagree.
 *   3. The dynamic band is frequency-selective and level-dependent: a
 *      band-limited, stereo-linked peak-power detector with one-pole attack /
 *      release, THRESH −40 … 0 dBFS, full depth (0 … 15 dB) downward only, a
 *      key that replaces the program when supplied, and a 2 ms slew so the
 *      gain never steps.
 *   4. The project's conventions hold: channels of Float32 at 48 kHz, mono or
 *      stereo, carried state across blocks, no allocation in the processing
 *      path, a non-finite value throws, a finite out-of-range one clamps.
 *   5. Scope: nothing outside `src/lib/dsp/` imports it — no channel chain, no
 *      room, no store, no UI; no new dependency.
 *   6. The tests, the package script and the docs exist.
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

// --- Files. ------------------------------------------------------------------------------
const FILES = {
  params: "src/lib/dsp/params.ts",
  biquad: "src/lib/dsp/biquad.ts",
  buffers: "src/lib/dsp/buffers.ts",
  eq: "src/lib/dsp/eq.ts",
  dynamicEq: "src/lib/dsp/dynamic-eq.ts",
  fixtures: "tests/dsp-fixtures.mjs",
  eqTest: "tests/dsp-eq.test.mjs",
  dynamicTest: "tests/dsp-dynamic-eq.test.mjs",
  pkg: "package.json",
  dataModel: "data-model.md",
  report: "task-reports/6.1-report.md",
};
for (const [key, rel] of Object.entries(FILES)) check(`file exists: ${rel}`, exists(rel), key);
if (failures.length) {
  for (const f of failures) console.error(`  FAIL  ${f}`);
  process.exit(1);
}
const S = Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, read(rel)]));
const dspFiles = Object.values(FILES).filter((rel) => rel.startsWith("src/lib/dsp/"));
const dspCode = dspFiles.map((rel) => stripComments(read(rel))).join("\n");
const eqCode = stripComments(S.eq);
const dynCode = stripComments(S.dynamicEq);
const biquadCode = stripComments(S.biquad);
const paramsCode = stripComments(S.params);

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
  "no Web Audio API in the DSP: a section is the project's arithmetic, not a node",
  !/AudioContext|AudioWorklet|BiquadFilterNode|DynamicsCompressor|ConvolverNode|DelayNode|decodeAudioData|OfflineAudioContext/.test(dspCode),
);
check(
  "the sample format is the project's: one Float32Array per channel, mono or stereo, 48 kHz",
  /export const DSP_SAMPLE_RATE = 48000;/.test(paramsCode) &&
    /channels !== 1 && channels !== 2/.test(paramsCode) &&
    /instanceof Float32Array/.test(stripComments(S.buffers)) &&
    /sampleRate\?: number;/.test(paramsCode),
);
check(
  "the session rate is the import contract's (the test asserts the equality; the module does not import it)",
  !/import-rules|ACCEPTED_SAMPLE_RATE/.test(dspCode),
);

// --- 2. The documented ranges and bands. ---------------------------------------------------
check(
  "the documented ranges live in one file: FREQ 20–20 000 Hz, GAIN ±15 dB, Q 0.3–10, depth 0–15 dB, THRESH −40–0 dB, ATTACK 0.1–100 ms, RELEASE 10–1 000 ms",
  /export const EQ_FREQUENCY_HZ: DspRange = \{ min: 20, max: 20000 \};/.test(paramsCode) &&
    /export const EQ_GAIN_DB: DspRange = \{ min: -15, max: 15 \};/.test(paramsCode) &&
    /export const EQ_Q: DspRange = \{ min: 0\.3, max: 10 \};/.test(paramsCode) &&
    /export const DYNAMIC_DEPTH_DB: DspRange = \{ min: 0, max: 15 \};/.test(paramsCode) &&
    /export const DYNAMIC_THRESHOLD_DB: DspRange = \{ min: -40, max: 0 \};/.test(paramsCode) &&
    /export const DYNAMIC_ATTACK_MS: DspRange = \{ min: 0\.1, max: 100 \};/.test(paramsCode) &&
    /export const DYNAMIC_RELEASE_MS: DspRange = \{ min: 10, max: 1000 \};/.test(paramsCode) &&
    /export const EQ_MAX_BANDS = 4;/.test(paramsCode),
);
check(
  "the four documented bands: LF low shelf, LMF / HMF bells, HF high shelf",
  /export const EQ_BAND_IDS = \["lf", "lmf", "hmf", "hf"\] as const;/.test(eqCode) &&
    /lf: "shelf-low",\s*lmf: "bell",\s*hmf: "bell",\s*hf: "shelf-high",/.test(eqCode),
);
check(
  "the biquad is the Task 2.8 curve's maths: the RBJ prototypes, shelves at slope S = 1, `a0` normalised to 1",
  /export const SHELF_SLOPE = 1;/.test(biquadCode) &&
    /const A = 10 \*\* \(gainDb \/ 40\);/.test(biquadCode) &&
    /export function bandCoefficients\(/.test(biquadCode) &&
    /out\[0\] = \(1 \+ alpha \* A\) \/ a0;/.test(biquadCode) &&
    /export function magnitudeDb\(/.test(biquadCode) &&
    /const num = \(b0 \+ b1 \* c1 \+ b2 \* c2\) \*\* 2 \+ \(b1 \* s1 \+ b2 \* s2\) \*\* 2;/.test(biquadCode),
);
check(
  "a 0 dB band is the identity, set exactly, so a neutral band is bit-for-bit transparent",
  /if \(gainDb === 0\) \{\s*identity\(out\);\s*return;\s*\}/.test(biquadCode) &&
    /deepStrictEqual\(neutralOut, input/.test(S.eqTest),
);
check(
  "transposed direct form II with carried state, and both entry points: a block and one sample",
  /const y = b0 \* x \+ z1;\s*z1 = b1 \* x - a1 \* y \+ z2;\s*z2 = b2 \* x - a2 \* y;/.test(biquadCode) &&
    /process\(input: Float32Array, output: Float32Array, count = input\.length\): void/.test(biquadCode) &&
    /step\(x: number\): number/.test(biquadCode) &&
    /reset\(\): void/.test(biquadCode),
);

// --- 3. The Custom EQ. ---------------------------------------------------------------------
check(
  "the EQ builds one section per channel per band, once — not in the loop",
  /for \(let c = 0; c < this\.channels; c\+\+\) \{[\s\S]{0,320}new BiquadSection\(\)/.test(eqCode),
);
check(
  "the EQ carries state across blocks and processes in place; bypass copies and is transparent",
  /copyChannels\(this\.channels, input, output, count\);\s*if \(this\.settings\.bypassed \|\| count === 0\) return;/.test(eqCode) &&
    /process\(input: readonly Float32Array\[\], output: readonly Float32Array\[\], count = defaultCount\(input\)\): void/.test(eqCode) &&
    /deepStrictEqual\(bypassedOut, input/.test(S.eqTest),
);
check(
  "the EQ can be drawn: its response is the sum of its bands, and 0 dB while bypassed",
  /responseDbAt\(freqHz: number\): number/.test(eqCode) && /if \(this\.settings\.bypassed\) return 0;/.test(eqCode),
);

// --- 4. The Dynamic EQ. --------------------------------------------------------------------
check(
  "the detector is band-limited to the band: a bell's band-pass, a shelf's low / high side at its corner",
  /case "bell":\s*detector\.setBandPass\(band\.freq, band\.q, this\.sampleRate\);/.test(dynCode) &&
    /case "shelf-low":\s*detector\.setLowPass\(band\.freq, SHELF_Q, this\.sampleRate\);/.test(dynCode) &&
    /case "shelf-high":\s*detector\.setHighPass\(band\.freq, SHELF_Q, this\.sampleRate\);/.test(dynCode),
);
check(
  "the detector is level-dependent: stereo-linked peak power smoothed by a one-pole attack / release",
  /if \(squared > power\) power = squared;/.test(dynCode) &&
    /envelope \+= \(power - envelope\) \* \(power > envelope \? attack : release\);/.test(dynCode) &&
    /const target = envelope >= threshold \? 1 : 0;/.test(dynCode),
);
check(
  "the threshold is a power ratio; the law is FULL depth, downward only (the owner's answer)",
  /this\.thresholds\[b\] = 10 \*\* \(band\.thresholdDb \/ 10\);/.test(dynCode) &&
    /const gain = staticGain - blend \* depth;/.test(dynCode) &&
    /this\.reduction\[b\] = blend \* depth;/.test(dynCode),
);
check(
  "the gain cannot step: a named 2 ms slew on the indicator (provisional)",
  /export const DETECTOR_SWITCH_SLEW_MS = 2;/.test(dynCode) && /blend \+= \(target - blend\) \* this\.slew;/.test(dynCode),
);
check(
  "the gain is redesigned into the section only while it moves (0.01 dB), so a steady band pays no trigonometry",
  /export const GAIN_REDESIGN_STEP_DB = 0\.01;/.test(dynCode) &&
    /if \(Math\.abs\(gain - designed\) >= GAIN_REDESIGN_STEP_DB\)/.test(dynCode) &&
    /this\.sections\[c\]\[b\]\.setBand\(band\.kind, band\.freq, gain, band\.q, this\.sampleRate\);/.test(dynCode),
);
check(
  "self-detection or a key: when a key is supplied the detector reads it and nothing else",
  /const detectorInput = key \?\? input;/.test(dynCode) &&
    /if \(key !== undefined\) requireKeyBuffers\("Alloy Dynamic EQ", this\.channels, key, count\);/.test(dynCode) &&
    /self-detection listens to its own signal/.test(S.dynamicTest),
);
check(
  "the reduction is published per band, and a band with no depth is a static band",
  /get gainReductionDb\(\): Float64Array/.test(dynCode) &&
    /if \(band\.depthDb === 0\) \{[\s\S]{0,240}this\.reduction\[b\] = 0;/.test(dynCode),
);

// --- 5. Allocation and conventions. --------------------------------------------------------
const processBodies = [methodBody(eqCode, "process("), methodBody(dynCode, "process(")];
check(
  "no allocation in either processing path: no `new`, no array literal, no slice / map / subarray / fill",
  processBodies.every(
    (body) => body.length > 0 && !/\bnew [A-Z]|\[\]|\.slice\(|\.map\(|\.subarray\(|\.fill\(|\.filter\(/.test(body),
  ),
  processBodies.map((body) => body.length).join(" / "),
);
check(
  "a non-finite value throws; a finite out-of-range one clamps (the console's own rule)",
  /export function requireFinite\(/.test(paramsCode) &&
    /Number\.isFinite\(value\)/.test(paramsCode) &&
    /return Math\.min\(range\.max, Math\.max\(range\.min, finite\)\);/.test(paramsCode) &&
    /clamp to the documented ranges/.test(S.eqTest) &&
    /clamp to the documented ranges/.test(S.dynamicTest),
);
check(
  "an impossible setting throws a named error rather than building a filter",
  /throw a named error instead of building a filter/.test(S.eqTest) &&
    /impossible settings, buffers and keys throw a named error/.test(S.dynamicTest) &&
    /Alloy EQ: /.test(eqCode) &&
    /Alloy Dynamic EQ: /.test(dynCode),
);
check(
  "every channel has its own state and the same coefficients; the detected gain is one for the pair",
  /this\.sections\[c\]\[b\]/.test(dynCode) && /this\.detectors\[c\]\[b\]/.test(dynCode) && /stereo: one linked gain/.test(S.dynamicTest),
);

// --- 6. Scope: nothing is wired, nothing new is depended on. -------------------------------
// Task 7.1 wired the DSP into `src/lib/engine/`: that is the only door into it.
// Task 8.2 added `src/lib/export/` and `src/lib/rulebook/`: both read the sample-rate
// contract (`DSP_SAMPLE_RATE`) and the export renders through the engine. They are the
// second and third sanctioned doorways, named here rather than removing the rule.
const SANCTIONED = ["src/lib/dsp/", "src/lib/engine/", "src/lib/export/", "src/lib/rulebook/"];
const outside = walk("src").filter((rel) => !SANCTIONED.some((prefix) => rel.startsWith(prefix)));
check(
  "only the 7.1 engine layer imports the DSP: no store, no room, no UI",
  outside.every((rel) => !/lib\/dsp\/|from "\.\.\/dsp\/|from "\.\/dsp\//.test(stripComments(read(rel)))),
);
check(
  "the engine layer is the one bridge to the DSP (Task 7.1)",
  walk("src/lib/engine").some((rel) => /from "\.\.\/dsp\//.test(read(rel))),
);
check("no new runtime dependency", !/"dependencies"/.test(S.pkg) || /"dependencies":\s*\{\s*\}/.test(S.pkg));

// --- 7. Tests, script, docs. ----------------------------------------------------------------
check(
  "the suites cover the task's list: below / above the threshold, full depth, attack, release, selectivity, self versus key, stereo, continuity, determinism, bypass, depth 0, validation, stability",
  /below its threshold/.test(S.dynamicTest) &&
    /above its threshold/.test(S.dynamicTest) &&
    /the law is full depth/.test(S.dynamicTest) &&
    /attack: the dip arrives/.test(S.dynamicTest) &&
    /release: the band holds/.test(S.dynamicTest) &&
    /frequency-selective/.test(S.dynamicTest) &&
    /self-detection listens/.test(S.dynamicTest) &&
    /stereo: one linked gain/.test(S.dynamicTest) &&
    /state carries/.test(S.dynamicTest) &&
    /deterministic/.test(S.dynamicTest) &&
    /bypass is transparent/.test(S.dynamicTest) &&
    /depth 0 is the static EQ/.test(S.dynamicTest) &&
    /stability/.test(S.dynamicTest) &&
    /stability/.test(S.eqTest),
);
check(
  "the EQ suite holds the drawn curve against the measured filter, gain / frequency / Q / shelves, stereo, continuity, determinism, in-place, validation",
  /the audible filter is the drawn curve/.test(S.eqTest) &&
    /a bell's gain is its gain at its centre/.test(S.eqTest) &&
    /frequency moves the peak/.test(S.eqTest) &&
    /Q sets the width/.test(S.eqTest) &&
    /the shelves tilt one side/.test(S.eqTest) &&
    /stereo is processed consistently and independently/.test(S.eqTest) &&
    /state carries/.test(S.eqTest) &&
    /deterministic/.test(S.eqTest) &&
    /in place/.test(S.eqTest),
);
check(
  "the tests measure the FILTER, not just the coefficients: an impulse response is transformed and compared with the Mixer's `eqResponseDb`",
  /impulseResponse\(/.test(S.fixtures) && /responseDbOf\(/.test(S.fixtures) && /eqResponseDb/.test(S.eqTest),
);
check(
  "the fixtures are generated, never shipped binaries",
  !walk("tests").some((rel) => /\.(wav|mp3|flac|aif)$/i.test(rel)) && /export function tone\(/.test(S.fixtures),
);
check(
  "package.json: the two 6.1 suites run under `npm test`; `check:dsp` is this guard",
  /tests\/dsp-eq\.test\.mjs tests\/dsp-dynamic-eq\.test\.mjs/.test(S.pkg) &&
    /"check:dsp": "node scripts\/check-dsp-structure\.mjs"/.test(S.pkg),
);
check(
  "docs: data-model.md carries §14 — the two module contracts and their provisional decisions",
  /^## 14\. /m.test(S.dataModel) &&
    /src\/lib\/dsp\/eq\.ts/.test(S.dataModel) &&
    /src\/lib\/dsp\/dynamic-eq\.ts/.test(S.dataModel) &&
    /DETECTOR_SWITCH_SLEW_MS/.test(S.dataModel),
);
check(
  "the report exists and names the modules, the tests and the decisions",
  /Task 6\.1/.test(S.report) && /dsp-eq/.test(S.report) && /dsp-dynamic-eq/.test(S.report),
);

// --- 8. Pins: the 6.1 modules as reviewed. ---------------------------------------------------
const pinned = {
  // params.ts is shared: Task 6.2 appended the dynamics ranges and requireBoolean, Task 6.3 the five Return
  // ranges, below the
  // Task 6.1 ones without touching them (the 6.1 assertions above still hold).
  "src/lib/dsp/params.ts": "6653a527255d80a62d435e63aa0abc9170fb24c7cbea8d1a84aa58be72185a71",
  "src/lib/dsp/biquad.ts": "919d840eda33cd022c3f4c0bc73531608ecdcb14ee7251abb7cd4da5924fa8e8",
  "src/lib/dsp/buffers.ts": "6054edf494a5b44bf35edc2813e6487118d0b8678b50bf394cea623a1ae8af20",
  "src/lib/dsp/eq.ts": "08bb262554a4bf44bd93de22844f2b9c7cc6d208bccd0b69390c46c5e0b219d5",
  "src/lib/dsp/dynamic-eq.ts": "57bcf8e1693e224fae39229a045941934414dca17635444623778e101706189a",
};
for (const [rel, hash] of Object.entries(pinned)) {
  check(`reviewed file untouched: ${rel}`, exists(rel) && sha256(read(rel)) === hash, exists(rel) ? `sha256 ${sha256(read(rel)).slice(0, 16)}…` : "missing");
}

// --- Report. ---------------------------------------------------------------------------------
for (const name of passes) console.log(`  PASS  ${name}`);
for (const name of failures) console.error(`  FAIL  ${name}`);
console.log(`\nDSP modules (Custom EQ · Dynamic EQ) structural contract check — ${passes.length}/${passes.length + failures.length} passed`);
process.exit(failures.length ? 1 : 0);
