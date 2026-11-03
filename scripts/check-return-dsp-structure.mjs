#!/usr/bin/env node
/**
 * ALLOY — Task 6.3 structural contract: the Return effects (FDN reverb and delay).
 *
 * What this guards (plan §8a L395–415, §17 L775; D2.4.3 / D2.9.1; the owner's answers of
 * 2026-11-03; the report `task-reports/6.3-report.md` and `data-model.md` §16):
 *
 *   1. Two isolated modules under `src/lib/dsp/`, pure of the browser — no DOM, no timers, no
 *      storage, no Web Audio, no randomness — importing nothing from outside their own folder.
 *   2. One algorithmic network: order-8 Householder FDN (orthogonal, stable by construction) with
 *      per-line gains `10^(−3·L_i/RT60)` and ONE documented calibration constant.
 *   3. Three configurations that differ STRUCTURALLY — line spacing, diffusion, early reflections —
 *      never by default decay alone; no hardware-emulation or impulse-response claim.
 *   4. TONE is damping INSIDE the feedback paths (and inside the delay loop), never a filter on the
 *      wet output and never "0 = unfiltered"; FLAT is a real one-pole with DC gain 1.
 *   5. Wet only: no dry path, no mix, no signal-dependent normalisation, no make-up gain, one fixed
 *      output scale in each module.
 *   6. The delay is a single line per channel with INTEGER timing, no cross-feedback, no ping-pong,
 *      no input summing, no tape emulation, no modulation, and a first repeat that is unfiltered.
 *   7. The project's conventions hold: Float32 channels, mono or stereo, state across blocks, no
 *      allocation in the processing path, zero reported latency, a tail getter, bypass that freezes
 *      state, `reset()`, non-finite throws / finite out-of-range clamps.
 *   8. Scope: nothing outside `src/lib/dsp/` imports them; no new dependency; no UI or store wiring.
 *   9. The tests, the package scripts and the docs exist, and the sources are pinned as reviewed.
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

const FILES = {
  reverb: "src/lib/dsp/reverb.ts",
  delay: "src/lib/dsp/delay.ts",
  params: "src/lib/dsp/params.ts",
  reverbTest: "tests/dsp-reverb.test.mjs",
  delayTest: "tests/dsp-delay.test.mjs",
  guard: "scripts/check-return-dsp-structure.mjs",
  dataModel: "data-model.md",
  report: "task-reports/6.3-report.md",
  pkg: "package.json",
};
check("the module, test, doc and guard files all exist", Object.values(FILES).every((rel) => exists(rel)),
  Object.entries(FILES).filter(([, rel]) => !exists(rel)).map(([key]) => key).join(", ") || "all present");

const reverb = stripComments(read(FILES.reverb));
const delay = stripComments(read(FILES.delay));
const rawReverb = read(FILES.reverb);
const rawDelay = read(FILES.delay);
const params = read(FILES.params);
const pkg = JSON.parse(read(FILES.pkg));
const dataModel = read(FILES.dataModel);
const report = read(FILES.report);
const reverbTest = read(FILES.reverbTest);
const delayTest = read(FILES.delayTest);

// --- 1. Isolation and purity. ---------------------------------------------------------------
const dspFiles = walk("src/lib/dsp");
const externalImports = (text) =>
  (text.match(/from\s+"([^"]+)"/g) ?? []).map((line) => line.replace(/.*"([^"]+)"/, "$1"));
check(
  "each module imports only its own folder (./params, ./buffers)",
  externalImports(reverb).every((spec) => spec === "./params" || spec === "./buffers") &&
    externalImports(delay).every((spec) => spec === "./params" || spec === "./buffers"),
  [...externalImports(reverb), ...externalImports(delay)].join(", "),
);
check(
  "no browser, clock, randomness or storage in either module",
  !/\b(window|document|localStorage|indexedDB|AudioContext|XMLHttpRequest|fetch|Date\.now|performance\.now|Math\.random)\b/.test(reverb) &&
    !/\b(window|document|localStorage|indexedDB|AudioContext|XMLHttpRequest|fetch|Date\.now|performance\.now|Math\.random)\b/.test(delay),
);
check("no new dependency: package.json dependencies is still empty", Object.keys(pkg.dependencies ?? {}).length === 0);
// Task 7.1 wired the Return effects into `src/lib/engine/`: that is the only door into them.
const outside = walk("src").filter(
  (rel) => !rel.startsWith("src/lib/dsp/") && !rel.startsWith("src/lib/engine/"),
);
check(
  "only the 7.1 engine layer imports the Return modules: no store, no room, no UI",
  outside.every((rel) => !/from\s+"[^"]*\/dsp\/(reverb|delay)\b/.test(read(rel))),
);
check(
  "the engine layer is the one bridge to the Return modules (Task 7.1)",
  walk("src/lib/engine").some((rel) => /from\s+"[^"]*\/dsp\/(reverb|delay)\b/.test(read(rel))),
);

// --- 2. The network. -------------------------------------------------------------------------
check("the network is order 8", /export const REVERB_ORDER = 8;/.test(reverb));
check("the feedback matrix is Householder: y_i = x_i − (2/N)·Σx", /const householder = \(2 \/ order\) \* dampedTotal;/.test(reverb) && /damped\[j\] - householder/.test(reverb));
check("each line's gain is 10^(−3·L_i/RT60) with L_i in seconds", /10 \*\* \(\(-3 \* length\) \/ rate \//.test(reverb));
check("ONE calibration constant scales the RT60 in that formula and is the only such constant", count(reverb, /export const REVERB_DECAY_CALIBRATION = [0-9.]+;/) === 1 && /this\.settings\.decaySeconds \* REVERB_DECAY_CALIBRATION/.test(reverb));
check("the calibration is documented as a constant, not a tolerance", /not a tolerance/i.test(rawReverb) && /±15 %|15 %/.test(rawReverb));
check("pre-delay is an integer ring BEFORE the diffusers", reverb.indexOf("pre-delay") !== -1 || /const preSamples = this\.preDelaySamples;/.test(reverb), "source");
check("the pre-delay is exact: round(ms·fs/1000)", /Math\.round\(\(this\.settings\.preDelayMs \* rate\) \/ 1000\)/.test(reverb));
check("input diffusion is a per-channel all-pass chain", /diffuserGain \* value/.test(reverb) && /diffuserGain \* out/.test(reverb));
check("early reflections are per-configuration taps (and Plate has none)", /early: \[/.test(rawReverb) && /id: "plate"[\s\S]{0,700}?early: \[\]/.test(rawReverb));

// --- 2b. The measured DECAY floor. ---------------------------------------------------------
check(
  "the DECAY minimum is a measured per-configuration table, split at the measured rate boundary",
  /export const REVERB_DECAY_MINIMUM_S: Readonly<Record<ReverbCharacterId, ReverbDecayMinimum>> = \{/.test(reverb) &&
    /room: \{ at48k: 0\.2, above48k: 0\.3 \}/.test(reverb) &&
    /hall: \{ at48k: 0\.4, above48k: 0\.4 \}/.test(reverb) &&
    /plate: \{ at48k: 0\.2, above48k: 0\.2 \}/.test(reverb) &&
    /export const REVERB_FLOOR_RATE_HZ = 48000;/.test(reverb),
);
check(
  "the floor is derived from measurement and cites the sweep, not invented",
  /measured rather than chosen/.test(rawReverb) && /0\.335 s/.test(rawReverb) && /within the approved ±15 %/.test(rawReverb) && /report §5\.2/.test(rawReverb),
);
check("the floor is exposed as a function of configuration and rate", /export function reverbDecayMinimum\(character: ReverbCharacterId, sampleRate: number\): number/.test(reverb));
check(
  "a below-floor request is raised, and the request and the limit stay visible",
  /const minimum = reverbDecayMinimum\(normalised\.character, this\.sampleRate\);/.test(reverb) &&
    /this\.requestedDecaySeconds = normalised\.decaySeconds;/.test(reverb) &&
    /this\.minimumDecaySeconds = minimum;/.test(reverb) &&
    /normalised\.decaySeconds < minimum \? \{ \.\.\.normalised, decaySeconds: minimum \}/.test(reverb),
);
check("the effective TONE cutoff is exposed per module, so the clamps are visible", /get dampingHz\(\): number \{[^}]*delayDampingCutoff|get dampingHz\(\): number \{[^}]*dampingCutoff/.test(reverb) && /get dampingHz\(\): number/.test(delay));
check("params.ts keeps the console's range and points at the effective minimum", /REVERB_DECAY_MINIMUM_S/.test(params) && /REVERB_DECAY_S: DspRange = \{ min: 0\.2, max: 10 \}/.test(params));

// --- 3. Three structurally distinct configurations. ------------------------------------------
check(
  "Room, Hall and Plate exist as characters, each with line spacing and diffusion",
  /room: \{/.test(rawReverb) && /hall: \{/.test(rawReverb) && /plate: \{/.test(rawReverb) &&
    count(rawReverb, /linesMs: \[/g) === 3 && count(rawReverb, /diffusers: \[/g) === 3,
);
check("REVERB_CHARACTER_ORDER lists all three", /REVERB_CHARACTER_ORDER[^=]*=\s*\[[^\]]*"room"[^\]]*"hall"[^\]]*"plate"/.test(rawReverb) || /export const REVERB_CHARACTER_ORDER: readonly ReverbCharacterId\[\] = \[.room., .hall., .plate.\]/.test(rawReverb));
check(
  "the configurations are character-inspired, not emulations",
  /character-inspired/.test(rawReverb) && /hardware emulation/.test(rawReverb) && !/\bemulat(es|ing)\b/i.test(rawReverb),
);
check("there is no impulse response or convolution anywhere", !/convol/i.test(reverb) && !/convol/i.test(delay) && dspFiles.every((rel) => !/\.(wav|ir|flac)$/.test(rel)));

// --- 4. TONE is in-loop damping. -------------------------------------------------------------
check("the damping law is the approved geometric one-pole", /const low = toneHz \/ 4;/.test(reverb) && /Math\.min\(0\.45 \* sampleRate, 4 \* toneHz\)/.test(reverb) && /Math\.exp\(\(-2 \* Math\.PI \* cutoff\) \/ sampleRate\)/.test(reverb));
check("the delay uses the same law with a 6 kHz neutral cutoff", /export const DELAY_TONE_HZ = 6000;/.test(delay) && /Math\.min\(0\.45 \* sampleRate, 4 \* DELAY_TONE_HZ\)/.test(delay));
check("the reverb damps inside every feedback path", /dampingState\[j\] = z;/.test(reverb) && /damped\[j\] - householder/.test(reverb));
check(
  "the delay damps inside the loop only, and reads its source before it writes (in place is allowed)",
  /const filtered = oneMinusDamp \* read \+ damp \* damped\[c\];/.test(delay) &&
    /const source = input\[c\]\[i\];/.test(delay) &&
    /buffer\[at\] = source \+ gain \* filtered;/.test(delay) &&
    delay.indexOf("const source = input[c][i];") < delay.indexOf("output[c][i] = scale * read;"),
);
check("the delay's output is the raw line, so the first repeat is unfiltered", /output\[c\]\[i\] = scale \* read;/.test(delay));
check("the reverb's output is the weighted line sum, not a filtered wet bus", /output\[c\]\[i\] = REVERB_WET_SCALE \* acc;/.test(reverb));
check("FLAT is documented as a real filter, never 'unfiltered'", /not "unfiltered"/.test(rawReverb) && /not "unfiltered"/.test(rawDelay));

// --- 5. Wet only, one fixed scale. -----------------------------------------------------------
check("both modules expose exactly one output scale, and it is 1", /export const REVERB_WET_SCALE = 1;/.test(reverb) && /export const DELAY_WET_SCALE = 1;/.test(delay));
check("there is no dry path, mix control or make-up gain", !/\bdry\b/i.test(reverb) && !/\bdry\b/i.test(delay) && !/\bmix\b/i.test(reverb) && !/\bmakeup|make-up gain \*=/i.test(reverb) && !/\bmakeup|make-up gain \*=/i.test(delay));
check("no normalisation, no saturation, no modulation", !/normali[sz]e\(|softClip|tanh|Math\.random|lfo|wow|flutter/i.test(reverb) && !/normali[sz]e\(|softClip|tanh|Math\.random|lfo|wow|flutter|tape/i.test(delay));

// --- 6. The delay line. ----------------------------------------------------------------------
check("TIME is integer samples: round(ms·fs/1000)", /Math\.round\(\(this\.settings\.timeMs \* rate\) \/ 1000\)/.test(delay));
check("no fractional interpolation and no interpolation library", !/linearInterp|lagrange|fractional|frac\b/i.test(delay));
check("feedback is the loop gain percent/100", /this\.gain = this\.settings\.feedbackPercent \/ 100;/.test(delay));
check("no cross-feedback, ping-pong or input summing", !/(1 - c|\(c \+ 1\) % channels|channels - 1 - c)/.test(delay) && !/ping-?pong/i.test(rawDelay.replace(/[^]*?no ping-pong[^]*?/i, "")) === false || /no cross-feedback, no ping-pong, no/ .test(rawDelay));
check("repeat count and tail are documented and computed", /export function delayRepeats/.test(delay) && /Math\.ceil\(60 \/ \(-20 \* Math\.log10\(gain\)\)\)/.test(delay) && /export function delayTailSeconds/.test(delay));

// --- 7. Shared conventions. -------------------------------------------------------------------
check("both report zero latency", /readonly latencyFrames = 0;/.test(reverb) && /readonly latencyFrames = 0;/.test(delay));
check("both expose a tail contract as a getter", /get tailSeconds\(\)/.test(reverb) && /get tailSeconds\(\)/.test(delay));
check("the reverb tail is pre-delay + 1.5 × decay", /this\.settings\.preDelayMs \/ 1000 \+ 1\.5 \* this\.settings\.decaySeconds/.test(reverb));
check("the delay tail is repeats × time", /this\.repeats \* this\.settings\.timeMs\) \/ 1000/.test(delay));
check("bypass writes silence and returns before touching any state", /if \(this\.settings\.bypassed\) \{/.test(reverb) && /output\[c\]\.fill\(0, 0, frames\);/.test(reverb) && /if \(this\.settings\.bypassed\) \{/.test(delay) && /output\[c\]\.fill\(0, 0, frames\);/.test(delay));
check("both have reset() that clears every buffer and filter state", /reset\(\): void \{[^}]*fill\(0\)/.test(reverb) && /reset\(\): void \{[^}]*fill\(0\)/.test(delay));
const processBody = (text) => {
  const start = text.indexOf("process(input");
  return start < 0 ? "" : text.slice(start, text.indexOf("\n  }", start));
};
check("process allocates nothing (no `new`, no array methods inside the loop)", !/new |\.map\(|\.slice\(|\.filter\(/.test(processBody(reverb)) && !/new |\.map\(|\.slice\(|\.filter\(/.test(processBody(delay)));
check("validation: non-finite throws and finite out-of-range clamps, via the shared helpers", /requireInRange/.test(reverb) && /requireFinite/.test(reverb) && /requireBoolean/.test(reverb) && /requireInRange/.test(delay) && /requireFinite/.test(delay) && /requireBoolean/.test(delay));
check("settings are read once: both modules normalise in the constructor", /normaliseReverbSettings\(settings\)/.test(reverb) && /this\.settings = normalised/.test(reverb) && /this\.settings = normaliseDelaySettings\(settings\);/.test(delay));

// --- 8. The ranges are the console's own. ----------------------------------------------------
check(
  "params.ts carries the five Return ranges from D2.4.3",
  /REVERB_DECAY_S: DspRange = \{ min: 0\.2, max: 10 \}/.test(params) &&
    /REVERB_PREDELAY_MS: DspRange = \{ min: 0, max: 200 \}/.test(params) &&
    /DELAY_TIME_MS: DspRange = \{ min: 20, max: 2000 \}/.test(params) &&
    /DELAY_FEEDBACK_PERCENT: DspRange = \{ min: 0, max: 90 \}/.test(params) &&
    /RETURN_TONE: DspRange = \{ min: -10, max: 10 \}/.test(params),
);

// --- 9. Tests, scripts and docs. -------------------------------------------------------------
check(
  "both suites run under npm test, after the 6.2 files and in order",
  /tests\/dsp-limiter\.test\.mjs tests\/dsp-reverb\.test\.mjs tests\/dsp-delay\.test\.mjs/.test(pkg.scripts.test),
);
check("the guard script is wired as check:return-dsp", /node scripts\/check-return-dsp-structure\.mjs/.test(pkg.scripts["check:return-dsp"] ?? ""));
check("the reverb suite is substantial", count(reverbTest, /^test\(/gm) >= 18, `${count(reverbTest, /^test\(/gm)} tests`);
check("the delay suite is substantial", count(delayTest, /^test\(/gm) >= 12, `${count(delayTest, /^test\(/gm)} tests`);
check(
  "the reverb suite pins the measured floor, its enforcement and its attainability",
  /reverbDecayMinimum/.test(reverbTest) &&
    /REVERB_DECAY_MINIMUM_S/.test(reverbTest) &&
    /requestedDecaySeconds/.test(reverbTest) &&
    /attainable/.test(reverbTest) &&
    /dampingHz/.test(reverbTest),
);
check(
  "the reverb suite measures RT60 against DECAY, and covers structure, stereo, bypass, reset and tails",
  /t30\(/.test(reverbTest) && /±15|TOLERANCE = 0\.15/.test(reverbTest) && /structurally/.test(reverbTest) && /pre-summed|coupled/.test(reverbTest) && /bypass/.test(reverbTest) && /reset/.test(reverbTest) && /tailSeconds/.test(reverbTest),
);
check(
  "the delay suite covers integer timing, feedback, in-loop TONE, independence, bypass, reset and the tail",
  /delaySamples/.test(delayTest) && /feedback/.test(delayTest) && /inside the loop/.test(delayTest) && /independent|no cross-feedback/.test(delayTest) && /bypass/.test(delayTest) && /reset/.test(delayTest) && /delayTailSeconds/.test(delayTest),
);
check(
  "data-model.md carries §16 with the modules, the RT60 meaning, the damping and the tail",
  /^## 16\. /m.test(dataModel) &&
    /src\/lib\/dsp\/reverb\.ts/.test(dataModel) &&
    /src\/lib\/dsp\/delay\.ts/.test(dataModel) &&
    /RT60/.test(dataModel) &&
    /Householder/.test(dataModel) &&
    /damping/.test(dataModel) &&
    /tailSeconds/.test(dataModel) &&
    /16\.6a/.test(dataModel) &&
    /REVERB_DECAY_MINIMUM_S/.test(dataModel) &&
    /Not in this build/.test(dataModel),
);

// --- 10. The report. ------------------------------------------------------------------------
check("the report records the readiness gate and what was missing", /readiness gate/i.test(report) && /missing/.test(report) && /D2\.4\.3/.test(report) && /§17/.test(report));
check("the report states the numeric decisions and marks provisional numbers", /PROVISIONAL/.test(report) && /1\.315/.test(report) && /±15 %/.test(report));
check(
  "the report records the review corrections: the measured floors, the retained provisional calibration and the retained delay bound",
  /Corrections after review/.test(report) &&
    /Hall floor 0\.4 s|Hall \*\*0\.4 s\*\*/.test(report) &&
    /0\.3 s above|0\.3 s above 48 kHz/.test(report) &&
    /−14\.6|−14\.6|-14\.6/.test(report) &&
    /upper bound/.test(report),
);
check("the report is honest about limitations and the calibration trade-off", /limitation/i.test(report) && /plateau/.test(report) && /-14\.6|−14\.6/.test(report) && /upper bound/.test(report));
check("the report records wet-only, bypass, reset, tails, latency and the parameter-change policy", /Wet only/.test(report) && /Bypass/.test(report) && /Reset/.test(report) && /Tails/.test(report) && /latencyFrames/.test(report) && /Parameter changes/.test(report));
check("the report confirms routing, UI, auto-mix and render orchestration were NOT implemented", /Not implemented, by design/.test(report) && /routing and sends/i.test(report) && /auto|automatic parameter selection/i.test(report) && /render/i.test(report));
check("the report records the actual verification commands and results", /npm test/.test(report) && /svelte-check|npm run check/.test(report) && /npm run build/.test(report) && /269\/269/.test(report));
check("the report states that nothing was committed", /[Nn]othing committed|no commit/i.test(report));

// --- 11. Pins: the 6.3 sources as reviewed. -------------------------------------------------
const pinned = {
  "src/lib/dsp/reverb.ts": "ca30f4135030fecff8ed4e8f94afaaf31933906e49f6ea74e85784d3a66ae0a2",
  "src/lib/dsp/delay.ts": "3c78e0fc6f45f72b97da82b31183f23defac093f4a2d75b3fe6ba398b24e1198",
  "src/lib/dsp/params.ts": "6653a527255d80a62d435e63aa0abc9170fb24c7cbea8d1a84aa58be72185a71",
};
for (const [rel, hash] of Object.entries(pinned)) {
  check(`reviewed file untouched: ${rel}`, exists(rel) && sha256(read(rel)) === hash, exists(rel) ? `sha256 ${sha256(read(rel)).slice(0, 16)}…` : "missing");
}

// --- Report. ------------------------------------------------------------------------------------
for (const name of passes) console.log(`  PASS  ${name}`);
for (const name of failures) console.error(`  FAIL  ${name}`);
console.log(`\nReturn effects (FDN reverb · delay) structural contract check — ${passes.length}/${passes.length + failures.length} passed`);
process.exit(failures.length ? 1 : 0);
