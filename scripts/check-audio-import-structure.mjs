#!/usr/bin/env node
/**
 * ALLOY — Task 5.1 structural contract: real audio import and validation.
 *
 * What this guards (plan §11 L497–515 import rules; Arrange L127–135; Phase 5
 * L655–659; owner answers 2026-11-02; decisions D5.1.x, decisions-log.md):
 *
 *   1. The format rules are the plan's and nothing wider: a WAV container,
 *      48 kHz, 24-bit PCM or 32-bit float, mono or stereo. 16-bit, other
 *      rates and compressed WAVs are refused with a line that asks for a
 *      re-export; nothing is resampled or converted on the quiet.
 *   2. Validation per file: not-WAV / corrupt / truncated never crash and are
 *      never partly added; mono is accepted and flagged; silence is accepted,
 *      flagged, left out of analysis; shorter stems are padded at render and
 *      flagged; a very short stem is one buffer; the batch keeps what passed.
 *   3. The copy is the project's: bytes into IndexedDB (`alloy`, `assets` +
 *      `peaks`) with a SHA-256 fingerprint; the peaks are computed from the
 *      decoded samples, bounded (Int8 min/max per bucket, 50 a second), and
 *      stored under the same fingerprint — never the PCM, never invented.
 *   4. The project model carries the imported track's identity and metadata
 *      (`Track.audio`), the manifest carries it (`tracks`, only when there
 *      are imported tracks — fixture and empty manifests unchanged), and the
 *      lifecycle rebuilds the project from template + tracks + values.
 *   5. The audio modules are pure of the browser: no timers, no storage, no
 *      Web Audio, no DOM; IndexedDB is reached in asset-store.ts and handed
 *      over by the shell only; the asset store is injected and detached with
 *      the lifecycle; a project switch clears the status map and the report.
 *   6. Arrange: one slim band above the grid in both states, the approved
 *      ActionKey and EngravedLabel only, the platform's file input hidden
 *      behind the key, a per-file report with the stamps ADDED / REFUSED /
 *      UNREADABLE / FAILED; imported rows print MONO / SILENT / PADDED /
 *      MISSING and are not "simulated"; imported clips are drawn from real
 *      peaks (`data-clip-source="audio"`); fixture clips stay as they were.
 *   7. Nothing of Phase 5.2+: no analysis engine, no Web Audio, no playback,
 *      no EQ / compression / reverb / delay, no invented analysis values.
 *   8. Tests exist and run under `npm test`; the docs carry §12 and D5.1.x.
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
const scriptOf = (svelte) => (svelte.match(/<script lang="ts">([\s\S]*?)<\/script>/) ?? [])[1] ?? "";
const templateOf = (svelte) => svelte.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style>[\s\S]*<\/style>/, "");
const styleOf = (svelte) => (svelte.match(/<style>([\s\S]*)<\/style>/) ?? [])[1] ?? "";
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
  wav: "src/lib/audio/wav.ts",
  rules: "src/lib/audio/import-rules.ts",
  peaks: "src/lib/audio/peaks.ts",
  assetStore: "src/lib/audio/asset-store.ts",
  arrangeAudio: "src/lib/arrange-audio.ts",
  importer: "src/lib/project/import.ts",
  assets: "src/lib/project/assets.svelte.ts",
  band: "src/components/ArrangeImportBand.svelte",
  model: "src/lib/project/model.ts",
  templates: "src/lib/project/templates.ts",
  persistence: "src/lib/project/persistence.ts",
  store: "src/lib/project/store.svelte.ts",
  lifecycle: "src/lib/project/lifecycle.ts",
  shell: "src/lib/project/shell.ts",
  room: "src/rooms/ArrangeRoom.svelte",
  row: "src/components/ArrangeTrackRow.svelte",
  lane: "src/components/ArrangeTimelineLane.svelte",
  head: "src/components/ArrangeTimelineHeader.svelte",
  fixtures: "tests/wav-fixtures.mjs",
  wavTest: "tests/wav.test.mjs",
  peaksTest: "tests/peaks.test.mjs",
  importTest: "tests/import.test.mjs",
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
const W = S.wav, R = S.rules, PK = S.peaks, AS = S.assetStore, AA = S.arrangeAudio, IM = S.importer, AX = S.assets;
const band = S.band, bandScript = scriptOf(band), bandTpl = templateOf(band), bandStyle = styleOf(band);
const room = S.room, roomTpl = templateOf(room), roomScript = scriptOf(room);
const row = S.row, rowTpl = templateOf(row), rowScript = scriptOf(row);
const lane = S.lane, laneTpl = templateOf(lane);
const AUDIO_MODULES = { wav: W, rules: R, peaks: PK, assetStore: AS, arrangeAudio: AA, importer: IM, assets: AX };

// --- 1. The plan's formats, exactly. ---------------------------------------------------------
check("rules: the accepted rate is 48 kHz", /export const ACCEPTED_SAMPLE_RATE = 48000;/.test(R));
check("rules: the accepted formats are 24-bit PCM and 32-bit float", /export const ACCEPTED_FORMATS = \["24-bit PCM", "32-bit float"\] as const;/.test(R));
check("rules: a stem is mono or stereo (MAX_CHANNELS 2)", /export const MAX_CHANNELS = 2;/.test(R));
check("rules: the depth rule is exactly pcm 24 or float 32", /\(f\.encoding === "pcm" && f\.bitDepth === 24\) \|\| \(f\.encoding === "float" && f\.bitDepth === 32\)/.test(R));
check("rules: another rate is refused — ALLOY does not resample", /f\.sampleRate !== ACCEPTED_SAMPLE_RATE/.test(R) && /does not resample/.test(R));
check("rules: a compressed WAV is refused", /f\.encoding === "other"/.test(R) && /a compressed WAV/.test(R));
check("rules: every refusal asks for the plan's re-export", /export const RE_EXPORT_ADVICE = "re-export the stem as a 48 kHz WAV, 24-bit or 32-bit float";/.test(R) && count(R, /\$\{RE_EXPORT_ADVICE\}/g) >= 3);
check("rules: no 16-bit or 44.1 kHz acceptance anywhere in the rules", !/16-bit/.test(stripComments(R)) && !/44100|44\.1/.test(stripComments(R)));
check("rules: the plan's silence threshold and short-stem length are named", /export const SILENCE_PEAK_DBFS = -80;/.test(R) && /export const SHORT_SECONDS = 1;/.test(R));
check("wav: the reader names what a non-WAV is (MP3 / FLAC / AIFF / Ogg …) rather than guessing", /export function looksLike\(bytes: Uint8Array\): string \| null/.test(W) && /ID3/.test(W) && /fLaC/.test(W) && /FORM/.test(W));
check("wav: inspection returns ok | not-wav | corrupt — never throws into the batch", /export type WavProblem =/.test(W) && /"not-wav"/.test(W) && /"corrupt"/.test(W) && /export function inspectWav\(/.test(W));
check("wav: a truncated data chunk is corrupt, with the counts", /ends before its audio data does/.test(W) && /truncated/.test(W));
check("import: the format is judged before any sample is read — the reader never decides acceptance", /export function sampleReaderFor\(/.test(W) && IM.indexOf("judgeFormat(") < IM.indexOf("computePeaks(") && IM.indexOf("judgeFormat(") > 0 && !/judgeFormat|ACCEPTED_/.test(stripComments(W)));
check("wav: no resampling, no conversion", !/resample|convert|OfflineAudioContext/i.test(stripComments(W)));

// --- 2. Validation outcomes, per file. -------------------------------------------------------
check("import: the four outcomes", /export type ImportOutcome = "added" \| "unsupported" \| "corrupt" \| "failed";/.test(IM));
check("import: the plan's flags", /export type ImportFlag = "mono" \| "silent" \| "short" \| "padded";/.test(IM));
check("import: the batch judges every file and keeps what passed (importFiles → lines + stems)", /export async function importFiles\(sources: readonly ImportSource\[\], ctx: ImportContext\): Promise<ImportResult>/.test(IM) && /export interface ImportResult/.test(IM) && /readonly lines: readonly ImportLine\[\];/.test(IM) && /readonly stems: readonly ImportedStem\[\];/.test(IM));
check("import: a not-WAV is 'unsupported' with the re-export advice; a damaged WAV is 'corrupt'", /outcome: "unsupported", detail: `\$\{p\.detail\}; \$\{RE_EXPORT_ADVICE\}`/.test(IM) && /outcome: "corrupt", detail: p\.detail/.test(IM));
check("import: a read failure is 'failed', the file never added", /outcome: "failed", detail: `could not be read: /.test(IM) && /could not be read whole/.test(IM));
check("import: mono is flagged, not refused", /if \(format\.channels === 1\) flags\.push\("mono"\);/.test(IM) && /played on both sides/.test(IM));
check("import: silence is flagged and left out of analysis", /if \(isSilentPeak\(peaks\.peak, format\.frames\)\) flags\.push\("silent"\);/.test(IM) && /silent — kept, left out of analysis/.test(IM));
check("import: a very short stem is one buffer", /if \(isVeryShort\(format\.seconds\)\) flags\.push\("short"\);/.test(IM) && /very short — processed as one buffer/.test(IM));
check("import: shorter stems are flagged padded to the longest", /"padded" as const/.test(IM) && /shorter than the longest stem — padded to \$\{printSeconds\(longestSeconds\)\}/.test(IM));
check("import: non-finite float data is corrupt", /not a number — the float data is damaged/.test(IM));
check("import: a store failure is 'failed' — nothing partial reaches the project", /could not be stored:/.test(IM) && /could not be fingerprinted:/.test(IM));
check("import: the silent stem carries no peak level (null), silence is recorded", /export function trackAudioOf\(asset: AssetRecord, peaks: PeakData\): TrackAudio/.test(IM) && /silent/.test(IM));

// --- 3. The copy and the peaks. ----------------------------------------------------------------
check("asset-store: the database is `alloy` with `assets` and `peaks`", /export const ASSET_DB_NAME = "alloy";/.test(AS) && /export const ASSETS_STORE = "assets";/.test(AS) && /export const PEAKS_STORE = "peaks";/.test(AS));
check("asset-store: a record carries the file's identity (name, size, sha256, format, bytes)", /export interface AssetRecord/.test(AS) && /readonly sha256: string;/.test(AS) && /readonly bytes: Blob \| Uint8Array;/.test(AS) && /readonly fileName: string;/.test(AS) && /readonly size: number;/.test(AS));
check("asset-store: peaks are stored with the asset under its fingerprint", /export interface PeaksRecord/.test(AS) && /readonly peaks: PeakData;/.test(AS));
check("asset-store: one interface, a memory store for tests and an IndexedDB store for the shell", /export interface AssetStore/.test(AS) && /export function memoryAssetStore\(/.test(AS) && /export function indexedDbAssetStore\(factory: IDBFactory/.test(AS));
check("asset-store: the fingerprint is SHA-256 via SubtleCrypto", /export async function sha256Hex\(bytes: Uint8Array, subtle: SubtleCrypto/.test(AS) && /subtle\.digest\("SHA-256"/.test(AS));
check("peaks: computed from the decoded samples (reader from wav.ts), per channel", /import \{ sampleReaderFor, type WavFormat \} from "\.\/wav";/.test(PK) && /export async function computePeaks\(/.test(PK));
check("peaks: bounded — Int8 min/max per bucket, 50 buckets a second, never the PCM", /export const PEAKS_PER_SECOND = 50;/.test(PK) && /export const PEAK_SCALE = 127;/.test(PK) && /new Int8Array\(bucketCount \* 2\)/.test(PK) && !/Float32Array\(format\.frames|new Float32Array\(frames/.test(PK));
check("peaks: processed in slices, not one allocation of the whole file", /sliceFrames/.test(PK));
check("peaks: non-finite samples are counted, not hidden", /readonly nonFinite: number;/.test(PK) && /nonFinite\+\+/.test(PK));
check("peaks: the waveform path is drawn from the stored peaks (peaksPath) and validated on reopen (isPeakData)", /export function peaksPath\(channel: Int8Array, bucketCount: number, pointCount: number, centre: number, half: number\): string/.test(PK) && /export function isPeakData\(value: unknown\): value is PeakData/.test(PK));
check("arrange-audio: imported clips come from real peaks (`source: \"audio\"`) at bar 1 under 120 bpm 4/4", /export const DEFAULT_TEMPO: TempoMarker = \{ bar: 1, bpm: 120, signature: TIME_SIGNATURE \};/.test(AA) && /source: "audio"/.test(AA) && /startBar: 1/.test(AA) && /peaksPath\(/.test(AA));
check("arrange-audio: the bar count follows the longest stem, rounded up", /export function barCountFor\(seconds: number, markers: readonly TempoMarker\[\], existing: number\): number/.test(AA) && /Math\.ceil/.test(AA));
check("arrange-audio: no invented waveform — no random, no sine synthesis", !/Math\.random|Math\.sin\(/.test(stripComments(AA)) && !/Math\.random/.test(stripComments(AX)) && !/Math\.random/.test(stripComments(IM)));

// --- 4. The model, the manifest, the lifecycle. ------------------------------------------------
check("model: Track carries `audio: TrackAudio | null` and a nullable role", /readonly audio: TrackAudio \| null;/.test(S.model) && /export interface TrackAudio/.test(S.model) && /^\s*role: RoleId \| null;/m.test(S.model));
check("model: TrackAudio is identity + metadata, not samples", /readonly assetId: string;/.test(S.model) && /readonly sha256: string;/.test(S.model) && /readonly frames: number;/.test(S.model) && /readonly silent: boolean;/.test(S.model) && !/Float32Array|ArrayBuffer|Blob/.test(stripComments(S.model)));
check("templates: imported tracks are appended to a template project (withImportedTracks / createImportedTrack / nextTrackCode)", /export function withImportedTracks\(project: Project, specs: readonly ImportedTrackSpec\[\]\): Project \| ImportedTrackProblem/.test(S.templates) && /export function createImportedTrack\(/.test(S.templates) && /export function nextTrackCode\(/.test(S.templates));
check("templates: a duplicate code or id is a problem, never a silent overwrite", /is already in the project/.test(S.templates));
check("persistence: the manifest's `tracks` block is optional and only written with imported tracks", /readonly tracks\?: readonly ManifestTrack\[\];/.test(S.persistence) && /if \(imported\.length === 0\) return manifest;/.test(S.persistence));
check("persistence: a stored track is validated field by field (isTrackAudio) before it is rebuilt", /function isTrackAudio\(value: unknown\): value is TrackAudio/.test(S.persistence) && /isTrackAudio\(t\.audio\)/.test(S.persistence));
check("lifecycle: reopen = template + imported tracks + saved values; a bad tracks block is 'damaged'", /withImportedTracks/.test(S.lifecycle) && /"ok" in withImports/.test(S.lifecycle));
check("store: imported tracks are appended through the shared store (appendTracks) and their clips set (setTrackClips)", /appendTracks/.test(S.store) && /setTrackClips/.test(S.store) && /import \{ appendTracks, project, setTrackClips \} from "\.\/store\.svelte";/.test(AX));
check("assets: hydration per project — ready | missing — and the status map is cleared on a switch", /export type AudioStatus = "pending" \| "ready" \| "missing";/.test(AX) && /hydrate/.test(AX) && /statusOf/.test(AX) && /isPeakData\(/.test(AX));
check("assets: the batch is refused while detached (no store → nothing imported)", /importBatch/.test(AX) && /detach/.test(AX) && /attached/.test(AX));

// --- 5. Purity of the audio modules; the shell hands IndexedDB over. ---------------------------
for (const [key, text] of Object.entries(AUDIO_MODULES)) {
  const body = stripComments(text);
  check(`${key}: no timers, no DOM, no Web Audio, no localStorage`, !/setTimeout|setInterval|requestAnimationFrame|document\.|AudioContext|AudioBuffer|\.localStorage|localStorage\./.test(body));
  check(`${key}: no network, no backend`, !/fetch\(|XMLHttpRequest|WebSocket/.test(body));
}
check("IndexedDB is reached in asset-store.ts and the shell only", walk("src").filter((rel) => /\.(ts|svelte)$/.test(rel) && rel !== FILES.assetStore && rel !== FILES.shell).every((rel) => !/indexedDB|IDBFactory|IDBDatabase/.test(stripComments(read(rel)))));
check("shell: the asset store is the browser's IndexedDB, injected (ShellOptions.assetStore) and handed to `assets.attach`", /const idb = win\.indexedDB;\s*return idb \? indexedDbAssetStore\(idb\) : null;/.test(S.shell) && /assets\.attach\(assetStore, \{/.test(S.shell) && /const yieldBetween = \(\): Promise<void> => new Promise\(\(resolve\) => win\.setTimeout\(resolve, 0\)\);/.test(S.shell) && /newId: \(\) => newAssetId\(win\),\s*now,\s*yieldBetween,/.test(S.shell));
check("shell: unwire detaches the assets after the lifecycle", /lifecycle\.detach\(\);[\s\S]*?assets\.detach\(\);/.test(S.shell));
check("shell: asset ids come from the platform's crypto, like project ids", /export function newAssetId\(win: \{ readonly crypto\?: Crypto \}\): string/.test(S.shell));
check("shell: `window.alloy.assets` under ?debug", /assets,/.test(S.shell) || /assets:/.test(S.shell));

// --- 6. Arrange: the band, the rows, the lanes. ------------------------------------------------
/*
  Task 9.2 (owner) — the owner ordered the dark IMPORT STEMS band removed from
  Arrange and importing promoted to the top toolbar and File > Import stems….
  This check pinned the band as the first thing in the room; that instruction is
  reversed deliberately, so the check inverts.

  The invariant that must survive is stronger than the band's position: there is
  still exactly ONE file picker in the application, it is still the platform's
  input, it is still multiple and WAV-only, and every entry point reaches that
  one input rather than growing a second.
*/
check(
  "room: the Arrange band is gone, as ordered (Task 9.2)",
  !/<ArrangeImportBand/.test(roomTpl) && !/ArrangeImportBand/.test(roomScript),
);
check(
  "import: exactly one file picker in the shell, still the platform's input, multiple, WAV only",
  count(read("src/App.svelte"), /type="file"/g) === 1 &&
    /\bmultiple\b/.test(read("src/App.svelte")) &&
    /accept="\.wav,audio\/wav,audio\/x-wav,audio\/wave,audio\/vnd\.wave"/.test(read("src/App.svelte")) &&
    /data-import-input/.test(read("src/App.svelte")) &&
    !/type="file"/.test(roomTpl),
);
check(
  "import: the toolbar and File > Import stems… both reach that one picker",
  /<ToolbarKey label="Import stems"[^>]*hook="import"/.test(read("src/components/AppToolbar.svelte")) &&
    /data-menu-item="import"/.test(read("src/components/MenuBar.svelte")) &&
    /requestImport/.test(read("src/App.svelte")) &&
    /assets\.importBatch/.test(read("src/App.svelte")),
);
check("room: the rows get the imported audio, the padded flag and the stored copy's status", /audio=\{track\.audio\}/.test(roomTpl) && /padded=\{isPadded\(track\.audio\)\}/.test(roomTpl) && /audioStatus=\{assets\.statusOf\(track\.id\)\}/.test(roomTpl));
check("room: padded = shorter than the longest imported stem (by more than a sample)", /const longestSeconds = \$derived\(tracks\.reduce\(/.test(roomScript) && /longestSeconds - audio\.frames \/ audio\.sampleRate > 1 \/ audio\.sampleRate/.test(roomScript));
check("band: the approved controls only — ActionKey and EngravedLabel, plus the platform's file input", /import ActionKey from "\.\.\/screens\/ActionKey\.svelte";/.test(bandScript) && /import EngravedLabel from "\.\/hardware\/EngravedLabel\.svelte";/.test(bandScript) && !/<button|<select|<a\b|<dialog/.test(bandTpl));
check("band: the file input is the platform's, multiple, WAV only, hidden behind the key", /type="file"/.test(bandTpl) && /\bmultiple\b/.test(bandTpl) && /accept="\.wav,audio\/wav,audio\/x-wav,audio\/wave,audio\/vnd\.wave"/.test(bandTpl) && /data-import-input/.test(bandTpl) && /aria-hidden="true"/.test(bandTpl) && /tabindex="-1"/.test(bandTpl));
check("band: the import key and the report's clear key", /hook="import-stems"/.test(bandTpl) && /hook="import-clear"/.test(bandTpl) && /\{#if report\}\s*<ActionKey label="Clear"/.test(bandTpl));
check("band: one live status readout: busy → done → notice", /role="status" aria-live="polite" data-import-status=\{busy \? "busy" : report \? "done" : notice \? "notice" : "idle"\}/.test(bandTpl));
check("band: the per-file report with its four stamps", /data-import-report/.test(bandTpl) && /data-import-line=\{line\.outcome\}/.test(bandTpl) && /data-import-file=\{line\.file\}/.test(bandTpl) && /added: "ADDED",/.test(bandScript) && /unsupported: "REFUSED",/.test(bandScript) && /corrupt: "UNREADABLE",/.test(bandScript) && /failed: "FAILED",/.test(bandScript));
check("band: refusals first, then the additions, each group in the batch's order", /report\.lines\.filter\(\(l\) => l\.outcome !== "added"\), \.\.\.report\.lines\.filter\(\(l\) => l\.outcome === "added"\)/.test(bandScript) && /\{#each ordered as line, index \(index\)\}/.test(bandTpl));
check("band: the report belongs to the project it was made in", /if \(report && report\.projectId !== project\.id\) report = null;/.test(bandScript));
check("band: no IndexedDB → the import is refused with a line, nothing imported", /if \(!assets\.attached\)/.test(bandScript) && /nothing was imported/.test(bandScript));
check("band: the band only prints — no decoding, no judging here", !/inspectWav|judgeFormat|computePeaks|sha256|indexedDB/.test(bandScript));
check("band: a refused line is a warning by the shell's red rule on the stamp, never red text", /\.line\.is-refused \.line__stamp \{\s*box-shadow: inset 0 -1px 0 var\(--al-function-red-base\);\s*\}/.test(bandStyle) && !/color:\s*var\(--al-function-red/.test(bandStyle));
check("band: the report is capped and scrolls inside the band (compact feedback)", /max-height: 7\.5rem;/.test(bandStyle) && /overflow: auto;/.test(bandStyle));
check("band: tokens only (no raw colours), no glow, no screws", !/#[0-9a-fA-F]{3,8}\b/.test(bandStyle.replace(/rgba?\([^)]*\)/g, "")) && !/text-shadow:[^;]*rgba\(\d+, \d+, \d+, 0\.[5-9]/.test(bandStyle) && !/screw/i.test(band) && !/filter:\s*blur|drop-shadow/.test(bandStyle));
check("band: no timers, no dialogs, no navigation", !/setTimeout|setInterval|location\.|history\.|<dialog|alert\(|confirm\(/.test(stripComments(bandScript) + bandTpl));
check("row: imported rows are not simulated and say so", /data-track-audio=\{audio \? "imported" : "none"\}/.test(rowTpl) && /data-simulated=\{audio \? false : SIMULATED\}/.test(rowTpl));
check("row: the stamps MONO / SILENT / PADDED / MISSING, MISSING the warning", /id: "mono", text: "MONO"/.test(rowScript) && /id: "silent", text: "SILENT"/.test(rowScript) && /id: "padded", text: "PADDED"/.test(rowScript) && /id: "missing", text: "MISSING"/.test(rowScript) && /class:is-warning=\{stamp\.id === "missing"\}/.test(rowTpl) && /data-track-stamp=\{stamp\.id\}/.test(rowTpl));
check("row: a stamp's meaning is one short title, no decorative text", /title=\{stamp\.title\}/.test(rowTpl) && /padded with silence to its length/.test(rowScript));
check("lane: every clip says where it came from (`data-clip-source`)", /data-clip-source=\{clip\.source\}/.test(laneTpl));
check("lane: an imported clip's tooltip prints its real length", /printSeconds/.test(lane));
check("header: the fixture's sections are a prop (an imported project has none)", /sections/.test(scriptOf(S.head)) && /sections=\{arrangement\.sections\}/.test(roomTpl));

// --- 7. Nothing of Phase 5.3+ in the import pipeline (Task 8.1 adds Web Audio only under src/lib/playback). ----
const phase5Negative = /AudioContext|OfflineAudioContext|AudioWorklet|createGain|BiquadFilterNode|DynamicsCompressor|ConvolverNode|DelayNode|decodeAudioData/;
const importScope = (rel) => /\.(ts|svelte)$/.test(rel) && !/^src\/lib\/playback\//.test(rel);
for (const rel of walk("src").filter(importScope)) {
  const body = stripComments(read(rel));
  if (phase5Negative.test(body)) check(`no Web Audio / processing DSP in ${rel}`, false, (body.match(phase5Negative) ?? [])[0]);
}
check("no Web Audio / processing DSP outside the Task 8.1 playback backend", !walk("src").filter(importScope).some((rel) => phase5Negative.test(stripComments(read(rel)))));
check("loudness vocabulary (LUFS) lives in the analysis engine only, not in the import pipeline or any room", !walk("src").filter((r) => /\.(ts|svelte)$/.test(r) && !/^src\/lib\/analysis\//.test(r)).some((rel) => /LUFS/.test(stripComments(read(rel)))));
check("no new runtime dependency", !/"dependencies"/.test(S.pkg) || /"dependencies":\s*\{\s*\}/.test(S.pkg));

// --- 8. Tests, scripts, docs. ----------------------------------------------------------------------
check("tests: the WAV fixtures are generated, not shipped binaries", /export function sine\(/.test(S.fixtures) && /export function silence\(/.test(S.fixtures) && /export function truncated\(/.test(S.fixtures) && /export const MP3ISH/.test(S.fixtures) && !walk("tests").some((r) => /\.(wav|mp3|flac|aif)$/i.test(r)));
check("tests: wav / peaks / import suites cover formats, corrupt, mono, silent, mismatch, short, bounded peaks, storage, partial batch", /16-bit/.test(S.wavTest) && /truncated/.test(S.importTest) && /mono/.test(S.importTest) && /silent/.test(S.importTest) && /padded/.test(S.importTest) && /one buffer/.test(S.importTest) && /bucketCount/.test(S.peaksTest) && /failPuts/.test(S.importTest));
check("tests: the shell test covers the asset store wiring and the debug handle", /assets/.test(S.shellTest));
check("package.json: the suites run under `npm test`; `check:import` is this guard", /tests\/wav\.test\.mjs tests\/peaks\.test\.mjs tests\/import\.test\.mjs /.test(S.pkg) && /"check:import": "node scripts\/check-audio-import-structure\.mjs"/.test(S.pkg));
check("docs: data-model.md carries §12 (import, assets, peaks)", /^## 12\. /m.test(S.dataModel) && /TrackAudio/.test(S.dataModel) && /peaks/.test(S.dataModel));
check("docs: decisions-log.md carries Task 5.1", /^## Task 5\.1/m.test(S.decisions) && /D5\.1\.1/.test(S.decisions));

// --- 9. Pins: the 5.1 modules as reviewed. ----------------------------------------------------------
const pinned = {
  "src/lib/audio/wav.ts": "f5608528957db9eba1de9219c7f60b8852807379f62451a1cfa4c522e102f75f",
  "src/lib/audio/import-rules.ts": "194b85961406be10597b59405332999edde2dfd5602cf1c3bb73017526504679",
  "src/lib/audio/peaks.ts": "5901653f01067a408ce22a912d568cae6ca8fe24de459f5d094fdbc6d1b3f1d6",
  "src/lib/audio/asset-store.ts": "c86008b8656f5b55ed4b9735ddb57a4cae95608eba6a58ee3172fc89e4318a5b",
  // Task 10.1 re-pinned (barsToSeconds, the inverse musical map, D10.1.3): an
  // added export; every existing one is unchanged.
  "src/lib/arrange-audio.ts": "1feb6eb618c50278058237e3108893490f55f10d3ce8e615f2cefd3ac84e3edd",
  "src/lib/project/import.ts": "338fbae109f473df660a8d481a21162471f16cb8e01183bb3fdb77403e3a107f",
  "src/lib/project/assets.svelte.ts": "a86ef41994159e1f6ed0fdbb7ebd0bb0fb50fa20302350d2d5d0b868ac553695",
  "src/components/ArrangeImportBand.svelte": "bc45fef96941cda65d24ce26e89e0ef8374a8b8df7a8a4383be8156036e08ff9",
};
for (const [rel, hash] of Object.entries(pinned)) {
  check(`reviewed file untouched: ${rel}`, exists(rel) && sha256(read(rel)) === hash, exists(rel) ? `sha256 ${sha256(read(rel)).slice(0, 16)}…` : "missing");
}

// --- Report. ---------------------------------------------------------------------------------
for (const name of passes) console.log(`  PASS  ${name}`);
for (const name of failures) console.error(`  FAIL  ${name}`);
console.log(`\nAudio import · validation · assets · peaks structural contract check — ${passes.length}/${passes.length + failures.length} passed`);
process.exit(failures.length ? 1 : 0);
