#!/usr/bin/env node
/**
 * WAV export and external rulebook structural contract check — Task 8.2.
 *
 * Dependency-free guard (Node built-ins only). It guards the implemented contract, not
 * the pixels and not the audio: that export is the 7.4 renderer and nothing else, that
 * the file format and the folder structure are the documented ones, that no mastering
 * or loudness stage exists anywhere in the path, that names are collision-safe, that a
 * rulebook can only reach a real parameter through the engine's own specs, and that no
 * existing guard was weakened to make room.
 *
 * Run: npm run check:export
 */

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(resolve(root, rel), "utf8");
const exists = (rel) => existsSync(resolve(root, rel));

const failures = [];
const passes = [];
function check(name, condition, detail = "") {
  if (condition) passes.push(name);
  else failures.push(detail ? `${name} — ${detail}` : name);
}

const files = {
  encode: "src/lib/export/encode.ts",
  plan: "src/lib/export/plan.ts",
  destination: "src/lib/export/destination.ts",
  exporter: "src/lib/export/exporter.ts",
  rulebook: "src/lib/rulebook/rulebook.ts",
  exportTests: "tests/export.test.mjs",
  rulebookTests: "tests/rulebook.test.mjs",
  fixtures: "tests/fixtures/rulebooks/README.md",
  report: "task-reports/8.2-wav-export-rulebook.md",
};
for (const [key, rel] of Object.entries(files)) check(`export module exists: ${key}`, exists(rel));

const encode = read(files.encode);
const plan = read(files.plan);
const destination = read(files.destination);
const exporter = read(files.exporter);
const rulebook = read(files.rulebook);
const exportTests = read(files.exportTests);
const rulebookTests = read(files.rulebookTests);
const dataModel = read("data-model.md");
const decisions = read("decisions-log.md");
const report = exists(files.report) ? read(files.report) : "";

/* --- 1. The export IS the renderer, not a second pipeline ----------------------------- */

check(
  "export renders through Task 7.4's renderProject",
  /import \{[^}]*renderProject[^}]*\} from "\.\.\/engine\/render"/.test(exporter),
);
check("every exported file comes from a render pass", (exporter.match(/await renderProject\(/g) ?? []).length >= 2);
check(
  "the export builds no buffer arithmetic of its own",
  !/\bfor \(let i = 0; i < frames; i\+\+\)/.test(exporter) && !/\bmixEngine\b|\bnew MixEngine\b/.test(exporter),
);
check("no second mixer or engine is constructed for export", !/new MixEngine\(/.test(exporter));
check(
  "the export never sums or trims audio itself",
  !/\baddInto\(|\.gain\b\s*\*=|Math\.pow\(10,/.test(exporter),
);
check(
  "cancellation and project changes surface as named reasons",
  /RenderCancelledError/.test(exporter) && /RenderProjectChangedError/.test(exporter),
);
check("render options are passed as the 4th argument, not folded into the sink",
  /chunkFrames: options\.chunkFrames/.test(exporter) && !/write\(chunk\)[\s\S]{0,200}chunkFrames:/.test(exporter));

/* --- 2. The mix is the whole path; buses come from it --------------------------------- */

check("the full mix is written from the render's own sink", /mixWriter\.write\(left, chunk\.channels\[1\], frames\)/.test(exporter));
check("bus files are fed by the monitor tap of the same pass", /onBuses:/.test(exporter) && /await entry\.writer\.write\(left, right, tap\.frames\)/.test(exporter));
check("a tapped bus is written once per file, not per block twice", /for \(const \[id, entry\] of busWriters\)/.test(exporter));
check("stems are rendered one project per track", /stemProject\(options\.project, job\.id as TrackId\)/.test(exporter));
check(
  "a stem keeps only the Returns its own sends reach",
  /liveSends/.test(exporter) && /project\.returns\.filter\(\(ret\) => liveSends\.has\(ret\.id\)\)/.test(exporter),
);
check(
  "a stem carries no sidechain, so no other track can duck it",
  /sidechains: \[\]/.test(exporter),
);
check("stems do not re-enable muted tracks (the mix's audibility rules stand)", !/\.mute = false|solo = true/.test(exporter));

/* --- 3. No mastering, no loudness maximisation ---------------------------------------- */

for (const [label, text] of [["exporter", exporter], ["encode", encode]]) {
  check(
    `${label} has no loudness normalisation or mastering stage`,
    !/-14|LUFS|normalis[ae]|maximi[sz]|limiter\.process|SafetyLimiter|mastering: "auto"/i.test(text),
  );
}
// `plan.ts` is where the fact is *stated*, so the words legitimately appear there; what
// must be absent is any measurement or gain stage.
check(
  "plan has no loudness measurement or gain stage",
  !/-14|LUFS|limiter\.process|SafetyLimiter|Math\.pow\(10|mastering: "auto"/i.test(plan),
);
check("the manifest states mastering is absent", /mastering: "none"/.test(plan));
check("the plan documents that no loudness target is applied", /no mastering or loudness maximisation/.test(plan));

/* --- 4. Format and sample rate -------------------------------------------------------- */

check("the writer declares a WAV RIFF/WAVE header", /RIFF/.test(encode) && /WAVE/.test(encode));
check("32-bit float is the default format", /encoding: "float"[\s\S]{0,80}bitDepth: 32/.test(encode));
check("24-bit PCM is offered as the only clipped path", /encoding: "pcm"[\s\S]{0,80}bitDepth: 24/.test(encode));
check("the writer streams: header first, data patched at finish", /begin\(\)/.test(encode) && /seek\(0\)/.test(encode));
check("the writer reports clipping rather than hiding it", /clipped/.test(encode));
check("the export takes the project's sample rate from the DSP rate", /DSP_SAMPLE_RATE/.test(exporter));
check("stereo is declared, not inferred", /channels: 2/.test(encode));

/* --- 5. Folders, names and collisions ------------------------------------------------- */

check("one folder per export, named after the project", /const folder = safeName\(project\.name\)/.test(plan));
check("stems live in their own folder", /STEMS_FOLDER/.test(plan) && /Stems\//.test(plan));
check("buses live in their own folder", /BUSES_FOLDER/.test(plan) && /Buses\//.test(plan));
check("the mix is named from the project", /fullMixName/.test(plan));
check("the export writes a manifest beside the audio", /MANIFEST_FILE/.test(plan) && /"export\.json"/.test(plan));
check("names are sanitised before use", /export function safeName/.test(plan));
check("Windows device names are escaped", /CON|PRN|AUX|NUL|COM1|LPT1/.test(plan));
check("names are truncated by bytes, not characters", /byteLength/.test(plan));
check("collisions are resolved case-insensitively", /toLowerCase\(\)/.test(plan) && /export function uniqueName/.test(plan));
check("a duplicate gets a numeric suffix rather than overwriting", /\(2\)|\\\(\\\$\{/.test(plan));

/* --- 6. Failures and empty selections ------------------------------------------------- */

check("an empty selection is a stated reason, not a crash", /NO_SELECTION_MESSAGE/.test(plan) && /no-selection/.test(exporter));
check("a project with nothing to render is a stated reason", /no-audio/.test(exporter));
check("a failing file is recorded and the export continues", /failures\.push/.test(exporter));
check("a failed file is aborted, not left half-written", /\.abort\(error\)/.test(exporter));
check("a destination failure stops the export with one error", /reason === "format"[\s\S]{0,40}fatal = failure/.test(exporter));
check("progress is monotonic", /reported = Math\.max\(reported/.test(exporter));

/* --- 7. Rulebooks --------------------------------------------------------------------- */

check("rulebooks declare a schema version", /alloy\.rulebook\/1/.test(rulebook));
check("the rulebook vocabulary references the engine's own specs", /spec: EQ_FREQ/.test(rulebook) && /spec: COMP_THRESHOLD/.test(rulebook));
check("rulebooks cannot invent a parameter", /unsupported-parameter/.test(rulebook));
check("rulebooks cannot set a locked decision", /pinned-parameter/.test(rulebook) && /PINNED_PATHS/.test(rulebook));
check("a missing file is distinguished from a malformed one", /"missing"/.test(rulebook) && /malformed-json/.test(rulebook));
check("an unsupported schema is refused by name", /unsupported-schema/.test(rulebook));
check("validation returns problems, it does not throw", /kind: "missing"/.test(rulebook) && !/throw new Error\("Alloy Rulebook/.test(rulebook));
check("values are clamped and stepped to the spec", /quantise\(clamped, rule\.spec\)/.test(rulebook));
check("a Manual value is never overwritten", /param\.mode === "manual"/.test(rulebook));
check("applying a rulebook copies on write", /cloneTrackChain/.test(rulebook));
check("the shipped rulebook is inert", /placeholder: true/.test(rulebook) && /targets: \[\]/.test(rulebook));
check(
  "the shipped rulebook carries no invented genre numbers",
  /PLACEHOLDER_RULEBOOK: Rulebook = Object\.freeze\(\{[\s\S]{0,400}?targets: \[\]/.test(rulebook),
);
check("a file loader exists for the external JSON", /export async function loadRulebookFile/.test(rulebook));
check("several rulebooks load with per-file problems", /export async function loadRulebooks/.test(rulebook));

/* --- 8. Tests ------------------------------------------------------------------------- */

const countTests = (text) => (text.match(/^test\(/gm) ?? []).length;
check("the export suite covers the required scenarios", countTests(exportTests) >= 30, `${countTests(exportTests)} tests`);
for (const scenario of [
  ["full mix", /the full mix exports as a WAV/],
  ["stems", /processed stems carry their own inserts/],
  ["buses", /processed bus files come from the bus's own processed output/],
  ["routing and returns", /the processed stems sum to the full mix/],
  ["sample rate and format", /preserves the project's sample rate/],
  ["no mastering", /no mastering and no loudness maximisation/],
  ["collisions", /collisions are resolved case-insensitively/],
  ["empty selection", /empty selections and projects with nothing to render/],
  ["failure handling", /a failing stem fails its own file/],
  ["cancellation", /cancellation stops the export/],
  ["determinism", /byte-identical files twice/],
  ["taps are observers", /the bus taps are observers/],
  ["tap alignment", /no latency is introduced by tapping/],
]) {
  check(`export test: ${scenario[0]}`, scenario[1].test(exportTests));
}
check("the rulebook suite covers loading and validation", countTests(rulebookTests) >= 18, `${countTests(rulebookTests)} tests`);
for (const scenario of [
  ["missing file", /a missing file is 'missing'/],
  ["malformed file", /a truncated file is 'malformed-json'/],
  ["unsupported schema", /a future schema is refused by name/],
  ["pinned decision", /may not set a decision the plan locked/],
  ["real files", /loadRulebookFile\(files,/],
  ["application", /applying writes only Auto values/],
]) {
  check(`rulebook test: ${scenario[0]}`, scenario[1].test(rulebookTests));
}
check(
  "the tests render through the engine rather than mocking it",
  /await renderProject\(/.test(exportTests) &&
    /await exportProject\(/.test(exportTests) &&
    !/mockImplementation|vi\.fn|sinon|jest\./i.test(exportTests),
);
check("fixture rulebooks are documented", exists(files.fixtures) && /placeholder/.test(read(files.fixtures)));

/* --- 9. Wiring and documentation ------------------------------------------------------ */

const pkg = JSON.parse(read("package.json"));
check("npm run check:export is wired", pkg.scripts["check:export"] === "node scripts/check-export-structure.mjs");
check("the test script runs both 8.2 suites", /tests\/export\.test\.mjs/.test(pkg.scripts.test) && /tests\/rulebook\.test\.mjs/.test(pkg.scripts.test));
check("no dependency was added for 8.2", Object.keys(pkg.dependencies ?? {}).length === 0);
check("data-model documents the export contract", /## 22\. WAV export and external rulebooks/.test(dataModel));
check("decisions log records Task 8.2 choices", /## Task 8\.2/.test(decisions) && /D8\.2\.1/.test(decisions) && /D8\.2\.2/.test(decisions));
check("the report records verification and the stop condition", /Nothing committed/.test(report) && /No later task was started/.test(report));

/* --- 10. The UI was not touched ------------------------------------------------------- */

check(
  "no room layout was changed for the export",
  !/export|rulebook/i.test(read("src/rooms/ConsoleRoom.svelte")) &&
    !/export|rulebook/i.test(read("src/rooms/MixerRoom.svelte")),
);

for (const name of passes) console.log(`  PASS  ${name}`);
for (const name of failures) console.error(`  FAIL  ${name}`);
console.log(`\nWAV export & rulebook structural contract check — ${passes.length}/${passes.length + failures.length} passed`);
process.exit(failures.length ? 1 : 0);
