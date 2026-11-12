#!/usr/bin/env node
/**
 * ALLOY — Task 5.2 structural contract: the analysis engine and the hardware profile.
 *
 * What this guards (plan §7 L295–335 analysis categories; §11 L459–487 hardware
 * profiles, benchmark, estimate, chunking; §13 "measures, never alters"; owner
 * answers 2026-11-02; decisions D5.2.x, decisions-log.md):
 *
 *   1. The engine measures every plan §7 category — level / loudness, energy by
 *      band, transients, stereo image, integrity — on one common 100 ms grid,
 *      as whole-stem figures and as series; it is pure of the browser (no DOM,
 *      no timers, no storage, no Web Audio) and never writes audio.
 *   2. The standards are the published ones: BS.1770-4 K-weighting at 48 kHz
 *      (the coefficients as printed), 400 ms / 3 s windows, −70 / −10 gates,
 *      EBU 3342 range; 4× true peak; the −80 dBFS silence rule of Task 5.1
 *      is reused, not redefined.
 *   3. Chunked and streaming: pushes of any length, state carried, the slice
 *      length from the profile; the tests hold one pass and many slices to
 *      the same figures.
 *   4. Results live with the asset: IndexedDB `alloy` version 2 adds the
 *      `analysis` store (assets and peaks untouched), keyed by asset id with
 *      the SHA-256 and the engine version; the manifest carries no results.
 *   5. The queue is automatic and bounded: after an import (the `afterImport`
 *      hook), after a reopen (`analysis.hydrate()` from `install()`), one
 *      stem at a time, yielding, dropped on a project switch.
 *   6. Hardware profile per plan §11: measured, not promised — the benchmark
 *      runs the real engine over a deterministic workload, caches under
 *      `alloy.benchmark` for 30 days, re-measures on an engine-version or
 *      core-count change; the estimate is null until measured; the Settings
 *      override wins; before any measurement the engine is Standard.
 *   7. No UI beyond the Settings note and the Automatic intent sentence;
 *      no room reads the analysis yet; no new dependency; no processing DSP.
 *   8. Tests exist per category and run under `npm test`; docs carry §13 and D5.2.x.
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
const count = (text, re) => (text.match(re) ?? []).length;
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/^\s*\/\/.*$/gm, "");
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
  fft: "src/lib/analysis/fft.ts",
  filters: "src/lib/analysis/filters.ts",
  loudness: "src/lib/analysis/loudness.ts",
  spectral: "src/lib/analysis/spectral.ts",
  transient: "src/lib/analysis/transient.ts",
  stereo: "src/lib/analysis/stereo.ts",
  integrity: "src/lib/analysis/integrity.ts",
  decode: "src/lib/analysis/decode.ts",
  analyser: "src/lib/analysis/analyser.ts",
  analyse: "src/lib/analysis/analyse.ts",
  profiles: "src/lib/analysis/profiles.ts",
  benchmark: "src/lib/analysis/benchmark.ts",
  queue: "src/lib/project/analysis.svelte.ts",
  hardware: "src/lib/project/hardware.svelte.ts",
  assetStore: "src/lib/audio/asset-store.ts",
  assets: "src/lib/project/assets.svelte.ts",
  wav: "src/lib/audio/wav.ts",
  rules: "src/lib/audio/import-rules.ts",
  lifecycle: "src/lib/project/lifecycle.ts",
  shell: "src/lib/project/shell.ts",
  settings: "src/lib/settings.svelte.ts",
  settingsScreen: "src/screens/SettingsScreen.svelte",
  persistence: "src/lib/project/persistence.ts",
  fixtures: "tests/analysis-fixtures.mjs",
  levelTest: "tests/analysis-level.test.mjs",
  spectralTest: "tests/analysis-spectral.test.mjs",
  transientTest: "tests/analysis-transient.test.mjs",
  stereoTest: "tests/analysis-stereo.test.mjs",
  integrityTest: "tests/analysis-integrity.test.mjs",
  engineTest: "tests/analysis-engine.test.mjs",
  benchmarkTest: "tests/benchmark.test.mjs",
  shellTest: "tests/shell.test.mjs",
  pkg: "package.json",
  dataModel: "data-model.md",
  decisions: "decisions-log.md",
};
for (const [key, rel] of Object.entries(FILES)) check(`file exists: ${rel}`, exists(rel), key);
if (failures.length) {
  for (const f of failures) console.error(`  FAIL  ${f}`);
  process.exit(1);
}
const S = Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, read(rel)]));
const engineFiles = Object.values(FILES).filter((rel) => rel.startsWith("src/lib/analysis/"));
const engineCode = engineFiles.map((rel) => stripComments(read(rel))).join("\n");

// --- 1. The engine: every category, one grid, pure. -------------------------------------------------
check("the result carries the five plan §7 categories and the grid (schema alloy.analysis/1, engine version, 100 ms cells)", /export const ANALYSIS_SCHEMA = "alloy\.analysis\/1";/.test(S.analyser) && /export const ENGINE_VERSION = 1;/.test(S.analyser) && /export const CELL_SECONDS = 0\.1;/.test(S.analyser) && /readonly level: LevelMeasures;\s*readonly spectral: SpectralMeasures;\s*readonly transient: TransientMeasures;\s*readonly stereo: StereoMeasures;\s*readonly integrity: IntegrityMeasures;/.test(S.analyser));
check("level: sample peak, true peak (dBTP), RMS, crest, integrated / momentary / short-term loudness, loudness range — and the per-cell series", /samplePeakDbfs/.test(S.analyser) && /truePeakDbtp/.test(S.analyser) && /rmsDbfs: number \| null/.test(S.analyser) && /crestFactorDb/.test(S.analyser) && /integratedLufs/.test(S.analyser) && /momentaryMaxLufs/.test(S.analyser) && /shortTermMaxLufs/.test(S.analyser) && /loudnessRangeLu/.test(S.analyser) && /rmsDbfsCells: Float32Array/.test(S.analyser) && /momentaryLufs: Float32Array/.test(S.analyser) && /shortTermLufs: Float32Array/.test(S.analyser));
check("spectral: six named bands (Sub … High, provisional edges), band dB per cell, band means, centroid per cell and overall, low / mid / high balance", /id: "sub", label: "Sub", lowHz: 20, highHz: 60/.test(S.spectral) && /id: "high", label: "High", lowHz: 6000, highHz: 20000/.test(S.spectral) && count(S.spectral, /lowHz: \d+, highHz: \d+/g) === 6 && /bandDb: readonly Float32Array\[\]/.test(S.analyser) && /centroidHz: Float32Array/.test(S.analyser) && /centroidHzOverall/.test(S.analyser) && /balance: \{ readonly low: number; readonly mid: number; readonly high: number \} \| null/.test(S.analyser));
check("transient: 10 ms log-energy flux, onsets (6 dB, −60 dBFS floor, 50 ms apart), per-cell flux and crest, count and rate per active second", /export const BLOCK_SECONDS = 0\.01;/.test(S.transient) && /export const ONSET_FLUX_DB = 6;/.test(S.transient) && /export const ONSET_FLOOR_DBFS = -60;/.test(S.transient) && /export const ONSET_SPACING_BLOCKS = 5;/.test(S.transient) && /fluxDb: Float32Array/.test(S.analyser) && /crestDb: Float32Array/.test(S.analyser) && /onsetSeconds: Float32Array/.test(S.analyser) && /onsetsPerSecond/.test(S.analyser));
check("stereo: correlation, balance, width (side / mid), mono loss, worst and negative share, per-cell series; mono files are not applicable", /correlationCells: Float32Array/.test(S.analyser) && /balanceDbCells: Float32Array/.test(S.analyser) && /widthDbCells: Float32Array/.test(S.analyser) && /monoLossDb/.test(S.stereo) && /minCorrelation/.test(S.stereo) && /fractionNegative/.test(S.stereo) && /applicable: false,\s*correlation: null,/.test(S.analyser));
check("integrity: DC per channel, clipping runs (≥ 3 full-scale samples against one rail), true-peak-over cells, non-finite count, silence by the Task 5.1 rule, near-silence, leading / trailing / active seconds, analysis target", /export const CLIP_LEVEL = 0\.9999;/.test(S.integrity) && /export const CLIP_RUN_SAMPLES = 3;/.test(S.integrity) && /dcOffsetDbfs/.test(S.integrity) && /truePeakOverCells/.test(S.analyser) && /nonFinite: number;/.test(S.analyser) && /leadingSilenceSeconds/.test(S.analyser) && /trailingSilenceSeconds/.test(S.analyser) && /activeSeconds/.test(S.analyser) && /analysisTarget: !silent/.test(S.analyser) && /export const NEAR_SILENT_PEAK_DBFS = -60;/.test(S.analyser));
check("the silence rule is Task 5.1's, imported not redefined (isSilentPeak / SILENCE_PEAK_DBFS from import-rules)", /import \{ dbfs, isSilentPeak, SILENCE_PEAK_DBFS \} from "\.\.\/audio\/import-rules";/.test(S.analyser) && !/-80\b/.test(stripComments(S.analyser)));
check("the engine is pure of the browser: no window / document / DOM, no timers, no storage, no Web Audio, no fetch anywhere under src/lib/analysis", !/\bwindow\b|\bdocument\b|localStorage|indexedDB|setTimeout|setInterval|requestAnimationFrame|AudioContext|AudioWorklet|decodeAudioData|fetch\(|XMLHttpRequest|navigator\./.test(engineCode));
check("the engine measures only: no audio is written, no gain / EQ / compression / reverb applied (no output buffers, no node graph, no 'render')", !/createGain|GainNode|BiquadFilterNode|DynamicsCompressor|Convolver|DelayNode|\brender\w*\(/i.test(engineCode));
check("mono stems are measured as the engine plays them (D5.1.3): both sides, so the K-weighted sum doubles", /this\.cellK\[cell\] \+= this\.channels === 1 \? 2 \* k : k;/.test(S.analyser));

// --- 2. The standards. -----------------------------------------------------------------------------
check("BS.1770-4 K-weighting at 48 kHz, coefficients as published (pre-filter and RLB)", /b0: 1\.53512485958697, b1: -2\.69169618940638, b2: 1\.19839281085285, a1: -1\.69065929318241, a2: 0\.73248077421585/.test(S.filters) && /b0: 1, b1: -2, b2: 1, a1: -1\.99004745483398, a2: 0\.99007225036621/.test(S.filters));
check("loudness windows and gates: 400 ms / 3 s, −0.691 offset, −70 LUFS absolute, −10 LU relative, EBU 3342 −20 LU and 10th–95th percentiles", /export const LUFS_OFFSET = -0\.691;/.test(S.loudness) && /export const ABSOLUTE_GATE_LUFS = -70;/.test(S.loudness) && /export const RELATIVE_GATE_LU = -10;/.test(S.loudness) && /export const LRA_RELATIVE_GATE_LU = -20;/.test(S.loudness) && /export const MOMENTARY_CELLS = 4;/.test(S.loudness) && /export const SHORT_TERM_CELLS = 30;/.test(S.loudness) && /percentile\(kept, 0\.95\) - percentile\(kept, 0\.1\)/.test(S.loudness));
check("true peak: 4× oversampling, 12 taps per phase, windowed sinc, unit DC gain per phase, state carried", /export const TRUE_PEAK_OVERSAMPLING = 4;/.test(S.filters) && /export const TRUE_PEAK_TAPS = 12;/.test(S.filters) && /taps\[k\] \/= sum;/.test(S.filters) && /private readonly tail = new Float64Array\(TRUE_PEAK_TAPS - 1\);/.test(S.filters));
check("spectral frames: 4096-point Hann, hop 2400 (two frames per cell), one complex FFT per pair, Parseval energy normalisation (2 / (N · Σw²))", /export const FFT_SIZE = 4096;/.test(S.spectral) && /export const FRAME_HOP = 2400;/.test(S.spectral) && /powerSpectraOfPair\(this\.fft, this\.re, this\.im, this\.powerA, this\.powerB\);/.test(S.spectral) && /const norm = 2 \/ \(FFT_SIZE \* this\.windowEnergy\);/.test(S.spectral) && /0\.5 - 0\.5 \* Math\.cos\(\(2 \* Math\.PI \* i\) \/ FFT_SIZE\)/.test(S.spectral));
check("the FFT is the project's own radix-2 (no dependency), checked against a naive DFT in the tests", /export class Fft/.test(S.fft) && /export function naiveDft/.test(S.fft) && /naiveDft/.test(S.spectralTest));

// --- 3. Chunked and streaming. ---------------------------------------------------------------------
check("the analyser streams: push(channels, count) with carried state, finish() once, frames checked against the format", /push\(channels: readonly Float32Array\[\], count: number, nonFinite\?: readonly number\[\]\): void/.test(S.analyser) && /if \(this\.finished\) throw new Error\("Analyser: push after finish"\);/.test(S.analyser) && /if \(this\.frame !== this\.format\.frames\) throw new Error/.test(S.analyser));
check("the run reads the stored copy in slices from a ByteSource (Blob.slice in the browser), the header from the file's head with the real length, slices rounded to whole cells, yielding between slices, abortable", /bytes\.slice\(offset, Math\.min\(bytes\.size, offset \+ length\)\)\.arrayBuffer\(\)/.test(S.decode) && /inspectWav\(head, source\.size\)/.test(S.decode) && /const sliceFrames = Math\.max\(cellFrames, Math\.floor\(requested \/ cellFrames\) \* cellFrames\);/.test(S.analyse) && /if \(at < format\.frames && options\.yieldBetween\) await options\.yieldBetween\(\);/.test(S.analyse) && /if \(options\.signal\?\.aborted\) throw new AnalysisAborted\(\);/.test(S.analyse));
check("the decoder is Task 5.1's sample readers — the same two layouts, nothing converted or resampled", /import \{ inspectWav, sampleReaderFor, type SampleReader, type WavFormat \} from "\.\.\/audio\/wav";/.test(S.decode) && !/resample|convert/i.test(stripComments(S.decode)));
check("wav.ts: readWavHeader / inspectWav take an optional real length so a head can be judged (the only Task 5.1 reader change; backward compatible)", /export function readWavHeader\(input: ArrayBuffer \| Uint8Array, totalBytes\?: number\)/.test(S.wav) && /const fileBytes = totalBytes \?\? bytes\.length;/.test(S.wav) && /export function inspectWav\(input: ArrayBuffer \| Uint8Array, totalBytes\?: number\): WavInspection/.test(S.wav));
check("tests hold one pass and many slices to the same figures (level, bands, flux, correlation, integrity), stereo and mono", /slicing never changes a figure/.test(S.engineTest) && /assertSameResult\(one, fine\);/.test(S.engineTest) && /assertSameResult\(one, odd\);/.test(S.engineTest));

// --- 4. Persistence with the asset. ----------------------------------------------------------------
check("IndexedDB `alloy` version 2: the `analysis` store added in onupgradeneeded, assets and peaks untouched; AnalysisRecord = assetId, projectId, sha256, engineVersion, analysedAt, elapsedMs, result", /export const ASSET_DB_VERSION = 2;/.test(S.assetStore) && /export const ANALYSIS_STORE = "analysis";/.test(S.assetStore) && /if \(!d\.objectStoreNames\.contains\(ANALYSIS_STORE\)\) \{/.test(S.assetStore) && /readonly assetId: string;\s*readonly projectId: string;\s*(?:\/\*\*[^*]*\*\/\s*)?readonly sha256: string;\s*readonly engineVersion: number;\s*readonly analysedAt: string;\s*(?:\/\*\*[^*]*\*\/\s*)?readonly elapsedMs: number;\s*readonly result: AnalysisResult;/.test(S.assetStore));
check("AssetStore gains putAnalysis / getAnalysis; remove() deletes all three records; the memory store mirrors it (analysis map, analysisPuts, failAnalysisPuts)", /putAnalysis\(record: AnalysisRecord\): Promise<void>;\s*getAnalysis\(assetId: string\): Promise<AnalysisRecord \| null>;/.test(S.assetStore) && /tx\.objectStore\(ANALYSIS_STORE\)\.delete\(id\);/.test(S.assetStore) && /analysis\.delete\(id\);/.test(S.assetStore) && /analysisPuts: 0,/.test(S.assetStore) && /failAnalysisPuts/.test(S.assetStore));
check("the 5.1 put stays atomic for asset + peaks; the analysis is a later, separate write", /const tx = d\.transaction\(\[ASSETS_STORE, PEAKS_STORE\], "readwrite"\);\s*tx\.objectStore\(ASSETS_STORE\)\.put\(asset\);\s*tx\.objectStore\(PEAKS_STORE\)\.put\(peaks\);/.test(S.assetStore));
check("a stored result is valid only with the track's SHA-256 and this engine version; otherwise it is measured again", /record\.sha256 === sha256 && record\.engineVersion === ENGINE_VERSION && record\.result\?\.schema === ANALYSIS_SCHEMA/.test(S.queue));
check("the manifest carries no analysis (persistence.ts untouched by analysis; the test checks the saved text)", !/analysis/i.test(stripComments(S.persistence)) && /a manifest never carries results/.test(S.engineTest));
check("IndexedDB is still reached in asset-store.ts and the shell only", walk("src").filter((rel) => /\.(ts|svelte)$/.test(rel) && rel !== FILES.assetStore && rel !== FILES.shell).every((rel) => !/indexedDB|IDBFactory|IDBDatabase/.test(stripComments(read(rel)))));

// --- 5. The queue. ---------------------------------------------------------------------------------
check("statuses pending · queued · analysing · ready · missing · failed; one worker; a project switch aborts (generation + signal) and drops writes", /export type AnalysisStatus = "pending" \| "queued" \| "analysing" \| "ready" \| "missing" \| "failed";/.test(S.queue) && /function abortAll\(\): void \{\s*signal\.aborted = true;\s*signal = \{ aborted: false \};\s*generation\+\+;/.test(S.queue) && /if \(gen !== generation\) return;/.test(S.queue) && /if \(worker\) return;/.test(S.queue));
check("automatic after an import: assets.attach's afterImport hook → analysis.enqueue (shell); and after a reopen: install() ends with assets.hydrate then analysis.hydrate", /readonly afterImport\?: \(trackIds: readonly TrackId\[\]\) => void;/.test(S.assets) && /ids\.afterImport\?\.\(tracks\.map\(\(t\) => t\.id\)\);/.test(S.assets) && /afterImport: \(ids\) => \{\s*analysis\.enqueue\(ids\);\s*\},/.test(S.shell) && /void assets\.hydrate\(\);\s*(?:\/\/[^\n]*\n\s*)?void analysis\.hydrate\(\);\s*\}/.test(S.lifecycle));
check("the lazy benchmark runs before the first stem of a session (hardware.ensure() inside the run), the slice length comes from the resolved profile", /await hardware\.ensure\(\);/.test(S.queue) && /sliceFrames: Math\.round\(profile\.settings\.sliceSeconds \* audio\.sampleRate\),/.test(S.queue));
check("a missing or swapped copy is `missing`, an unreadable one `failed` with the reason, a refused write keeps the result for the session (stored: false)", /if \(!asset \|\| asset\.sha256 !== audio\.sha256\) \{\s*set\(id, \{ status: "missing", progress: 0 \}\);/.test(S.queue) && /set\(id, \{ status: "failed", progress: 0, error: e instanceof Error \? e\.message : String\(e\) \}\);/.test(S.queue) && /error = `measured, but not stored: /.test(S.queue));
check("the queue module is pure of the browser (clock, yield and store injected); the shell wires performance.now and a macrotask yield", !/\.localStorage|localStorage\.|performance\.now|setTimeout|setInterval|Date\.now|\bwindow\b|\bdocument\b/.test(stripComments(S.queue)) && /analysis\.attach\(assetStore, \{ now, clock: \(\) => win\.performance\.now\(\), yieldBetween \}\);/.test(S.shell));
check("the estimate reports the work left (queued + the unread remainder) and seconds only from a measurement (null when unmeasured)", /work \+= e\?\.status === "analysing" \? seconds \* \(1 - e\.progress\) : seconds;/.test(S.queue) && /seconds: hardware\.estimateSeconds\(work\)/.test(S.queue) && /basis: profile\.source === "unmeasured" \? "unmeasured" : "benchmark"/.test(S.queue));

// --- 6. Hardware profile (plan §11). ----------------------------------------------------------------
check("profiles: lite · standard · performance differ by slice length only (2 / 5 / 10 s, provisional); unmeasured = standard", /lite: \{ id: "lite", sliceSeconds: 2 \},\s*standard: \{ id: "standard", sliceSeconds: 5 \},\s*performance: \{ id: "performance", sliceSeconds: 10 \},/.test(S.profiles) && /export const UNMEASURED_PROFILE: ProfileId = "standard";/.test(S.profiles));
check("the benchmark runs the real engine over a deterministic 4 s stereo 24-bit workload; throughput = audio seconds / wall seconds from an injected clock; thresholds 25× / 100× with cores ≥ 4 and memory ≥ 4 GB where reported (provisional)", /export const BENCHMARK_WORKLOAD_SECONDS = 4;/.test(S.benchmark) && /const result = await analyseBytes\(bytes, \{ sliceFrames: 48000, yieldBetween: deps\.yieldBetween \}\);/.test(S.benchmark) && /const throughput = workloadSeconds \/ \(elapsedMs \/ 1000\);/.test(S.benchmark) && /liteBelow: 25,/.test(S.profiles) && /performanceFrom: 100,/.test(S.profiles) && /performanceCores: 4,/.test(S.profiles) && /performanceMemoryGb: 4,/.test(S.profiles) && /seed = \(Math\.imul\(1664525, seed\) \+ 1013904223\) >>> 0;/.test(S.benchmark));
check("the cache: alloy.benchmark (schema alloy.benchmark/1), 30-day expiry, rejected on another engine version or core count, from the future, malformed", /export const BENCHMARK_KEY = "alloy\.benchmark";/.test(S.benchmark) && /export const BENCHMARK_SCHEMA = "alloy\.benchmark\/1";/.test(S.benchmark) && /export const BENCHMARK_MAX_AGE_MS = 30 \* 24 \* 60 \* 60 \* 1000;/.test(S.benchmark) && /if \(r\.engineVersion !== \(validity\.engineVersion \?\? ENGINE_VERSION\)\) return null;/.test(S.benchmark) && /if \(cores !== validity\.cores\) return null;/.test(S.benchmark) && /validity\.nowMs - measured > BENCHMARK_MAX_AGE_MS/.test(S.benchmark));
check("measured, not promised: the estimate is null without a record, work / throughput × 1.25 rounded up otherwise", /if \(!record \|\| !\(record\.throughput > 0\)\) return null;/.test(S.benchmark) && /export const ESTIMATE_MARGIN = 1\.25;/.test(S.benchmark) && /Math\.ceil\(\(workSeconds \/ record\.throughput\) \* ESTIMATE_MARGIN\)/.test(S.benchmark));
check("the hardware module resolves override (Settings) > benchmark > unmeasured, shares one run between callers, caches on success, forgets on detach", /if \(chosen !== "auto"\) return \{ id: chosen, source: "override", settings: PROFILE_SETTINGS\[chosen\] \};/.test(S.hardware) && /if \(benchmark\) return \{ id: benchmark\.profile, source: "benchmark", settings: PROFILE_SETTINGS\[benchmark\.profile\] \};/.test(S.hardware) && /return \{ id: UNMEASURED_PROFILE, source: "unmeasured", settings: PROFILE_SETTINGS\[UNMEASURED_PROFILE\] \};/.test(S.hardware) && /if \(running\) return running;/.test(S.hardware) && /writeCached\(record\);/.test(S.hardware));
check("the shell wires the hardware module with localStorage (the shared adapter), performance.now, navigator.hardwareConcurrency / deviceMemory where reported, and detaches it", /hardware\.attach\(\{\s*storage: adapter,\s*now,\s*nowMs: \(\) => Date\.now\(\),\s*clock: \(\) => win\.performance\.now\(\),\s*cores: device\.cores,\s*memoryGb: device\.memoryGb,\s*yieldBetween,\s*\}\);/.test(S.shell) && /hardwareConcurrency/.test(S.shell) && /deviceMemory/.test(S.shell) && /hardware\.detach\(\);/.test(S.shell));
check("the Settings profile is read by the hardware module only (no room, no engine file reads settings)", /import \{ settings \} from "\.\.\/settings\.svelte";/.test(S.hardware) && !/settings\.svelte/.test(engineCode) && !/settings\.svelte/.test(S.queue));

// --- 7. No UI, no dependency, no processing. ---------------------------------------------------------
const uiFiles = walk("src").filter((rel) => rel.endsWith(".svelte"));
check("no room or component imports the analysis engine, the queue or the hardware module (nothing is drawn from the analysis yet)", uiFiles.every((rel) => !/lib\/analysis\/|analysis\.svelte|hardware\.svelte/.test(read(rel))));
check("the Settings panel's one text correction: the note and the Automatic intent say the profile is in use and measured; no number, no new control", /note="Used by the analysis engine: Automatic follows the benchmark measured on this computer before its first analysis; choosing a profile overrides that measurement\."/.test(S.settingsScreen) && /auto: \{ name: "Automatic", intent: "The profile the hardware benchmark selects, measured on this computer before its first analysis\." \}/.test(S.settings) && count(S.settingsScreen, /<ScreenPanel /g) === 5 && !/\d+\s*(GB|MB|cores?|threads?|ms\b|%|×)/.test(S.settings));
check("no new runtime dependency", !/"dependencies"/.test(S.pkg) || /"dependencies":\s*\{\s*\}/.test(S.pkg));
check("NO SCREWS, EVER (owner, D2.1.9)", walk("src").every((rel) => !/(class=["'{][^"'}]*screw|\.[\w-]*screw[\w-]*\s*[{,:]|data-[\w-]*screw|__screw)/i.test(read(rel))));

// --- 8. Tests and docs. ------------------------------------------------------------------------------
check("tests per category: level (BS.1770 calibration, true peak, gating, LRA, silence / short), spectral, transient, stereo, integrity; the engine (slicing, head reads, abort, in-app queue, reload, stale, missing, switch); benchmark / estimate / cache / override", /−3\.01 LUFS/.test(S.levelTest) && /true peak/.test(S.levelTest) && /loudness range/.test(S.levelTest) && /short stems/.test(S.levelTest) && /band energy is calibrated/.test(S.spectralTest) && /onsets/.test(S.transientTest) && /anti-phase/.test(S.stereoTest) && /mono stem has no stereo image/.test(S.stereoTest) && /DC offset/.test(S.integrityTest) && /clipping/.test(S.integrityTest) && /non-finite/.test(S.integrityTest) && /reload: reopening the project reads the stored results back/.test(S.engineTest) && /missing and failing copies/.test(S.engineTest) && /project switch mid-analysis/.test(S.engineTest) && /the cache: a record round-trips/.test(S.benchmarkTest) && /the estimate: null without a measurement/.test(S.benchmarkTest) && /the Settings override wins/.test(S.benchmarkTest));
check("tests: the fixtures are generated (encodeWav), never shipped binaries", /encodeWav/.test(S.fixtures) && !walk("tests").some((r) => /\.(wav|mp3|flac|aif)$/i.test(r)));
check("the shell test covers the new debug-handle keys and the unmeasured state", /"analysis", "assets", "autosave", "clipboard", "fields", "flush", "hardware"/.test(S.shellTest) && /no measurement, no estimate/.test(S.shellTest));
check("package.json: the seven 5.2 suites run under `npm test`; `check:analysis` is this guard", /tests\/analysis-level\.test\.mjs tests\/analysis-spectral\.test\.mjs tests\/analysis-transient\.test\.mjs tests\/analysis-stereo\.test\.mjs tests\/analysis-integrity\.test\.mjs tests\/analysis-engine\.test\.mjs tests\/benchmark\.test\.mjs(?: |")/.test(S.pkg) && /"check:analysis": "node scripts\/check-analysis-structure\.mjs"/.test(S.pkg));
check("docs: data-model.md carries §13 (analysis results, the benchmark record); decisions-log.md carries Task 5.2", /^## 13\. /m.test(S.dataModel) && /alloy\.analysis\/1/.test(S.dataModel) && /alloy\.benchmark/.test(S.dataModel) && /^## Task 5\.2/m.test(S.decisions) && /D5\.2\.1/.test(S.decisions));

// --- 9. Pins: the 5.2 modules as reviewed. ----------------------------------------------------------
const pinned = {
  "src/lib/analysis/fft.ts": "41ab33c563e4a77f5e91bb644cb585146a65ac93df90feca45094b9fa2cf23d6",
  "src/lib/analysis/filters.ts": "8ce515a13bfccc91a658cf6bf63afc64b841a6d265c7fedb29162bdfb0834a13",
  "src/lib/analysis/loudness.ts": "6be991fc47607d65102160284ce86a1eb3d0d98e6ac1c9e52941a3ee7f791de3",
  "src/lib/analysis/spectral.ts": "274f04218d165b075dcd8f5d2c7064971f73896a9792c01c22887bf0847944a4",
  "src/lib/analysis/transient.ts": "8d52582b9c7cc5302ac12e65f6c167d335a4dbdb4334dce3acc5f03ed3eaf51f",
  "src/lib/analysis/stereo.ts": "86c42a90d75ffe0809ad74cdfa0e461d03d6881df789a4d5947626e46e007a48",
  "src/lib/analysis/integrity.ts": "a9a5646b4c3b1aef7d2ea6ad9be5ab89c9748fc4013b651191c7051d07e2a6ea",
  "src/lib/analysis/decode.ts": "0362a695655d9f00f322b274c10777313f10227e7c27b2518459ad018e0fbc1d",
  "src/lib/analysis/analyser.ts": "416af51808667354e2ee111d2d2bc37c93dc6d832f24259f568009f56753a96b",
  "src/lib/analysis/analyse.ts": "9e60cf90df358cc36c850dfe27e697a94b09bc3264e3dad084ed604af38ffd06",
  "src/lib/analysis/profiles.ts": "c0f1afc04845045427bbec6952ff238807d758d61ec6946dbf2eddca922f5983",
  "src/lib/analysis/benchmark.ts": "c61406f6d3184e2283664ac2ab0d96524da4348fac94319dd04e2b5bf6ab5a53",
  "src/lib/project/analysis.svelte.ts": "95c39791234becfeadb4867aafd67527bfc62d99f8a345b393f2443c09c5fcf7",
  "src/lib/project/hardware.svelte.ts": "8f760c17dd38e4b55712d6a186d5540792dd7578042ed14073d569e20c22edee",
};
for (const [rel, hash] of Object.entries(pinned)) {
  check(`reviewed file untouched: ${rel}`, exists(rel) && sha256(read(rel)) === hash, exists(rel) ? `sha256 ${sha256(read(rel)).slice(0, 16)}…` : "missing");
}

// --- Report. ---------------------------------------------------------------------------------
for (const name of passes) console.log(`  PASS  ${name}`);
for (const name of failures) console.error(`  FAIL  ${name}`);
console.log(`\nAnalysis engine · hardware profile structural contract check — ${passes.length}/${passes.length + failures.length} passed`);
process.exit(failures.length ? 1 : 0);
