#!/usr/bin/env node
/**
 * Playhead & transport scrolling structural contract check — Task 10.1.
 *
 * Dependency-free guard (Node built-ins only) over the spec's contract:
 * the §3 stop semantics and the two Stop preferences, lastPlaybackStartPosition,
 * stoppedPosition, the §7 loop wrap and its restart guard, the §1 live position
 * from the engine's own clock, the pure follow engine's §4/§7 geometry, the
 * §13 per-panel follow state with the §5 auto-resume rule, the panel wiring
 * (the layer, the toolbar control, the Re-follow shortcut), the §14 preferences,
 * and the tests + docs that pin it all. It does not measure pixels or listen.
 *
 * Run: npm run check:playhead
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
const count = (text, re) => (text.match(re) ?? []).length;

const files = {
  follow: "src/lib/playback/follow.ts",
  playheadModule: "src/lib/playback/playhead.svelte.ts",
  controller: "src/lib/playback/controller.ts",
  types: "src/lib/playback/types.ts",
  store: "src/lib/playback/store.svelte.ts",
  playbackShell: "src/lib/playback/shell.ts",
  arrangeAudio: "src/lib/arrange-audio.ts",
  layer: "src/components/playhead/ArrangePlayhead.svelte",
  followControl: "src/components/playhead/FollowControl.svelte",
  toolbar: "src/components/AppToolbar.svelte",
  app: "src/App.svelte",
  room: "src/rooms/ArrangeRoom.svelte",
  settingsScreen: "src/screens/SettingsScreen.svelte",
  settings: "src/lib/settings.svelte.ts",
  textEntry: "src/lib/text-entry.ts",
  projectShell: "src/lib/project/shell.ts",
};
for (const [key, rel] of Object.entries(files)) check(`the file exists: ${rel}`, exists(rel));

const F = read(files.follow);
const PM = read(files.playheadModule);
const C = read(files.controller);
const T = read(files.types);
const ST = read(files.store);
const PS = read(files.playbackShell);
const AA = read(files.arrangeAudio);
const L = read(files.layer);
const FC = read(files.followControl);
const TB = read(files.toolbar);
const AP = read(files.app);
const RM = read(files.room);
const SS = read(files.settingsScreen);
const SET = read(files.settings);
const TE = read(files.textEntry);
const PSH = read(files.projectShell);
const pkg = JSON.parse(read("package.json"));
const tests = read("tests/playhead.test.mjs");
const playbackTests = read("tests/playback.test.mjs");
const settingsTests = read("tests/settings.test.mjs");

// --- 1. The pure follow engine (§4/§7/§10/§12) ---------------------------------
check("the follow vocabulary is the spec's five modes with long names, short caps and intents",
  /export type FollowMode = "off" \| "page" \| "smooth" \| "centered" \| "stationary";/.test(F) &&
  /FOLLOW_MODES: readonly FollowMode\[\] = \["off", "page", "smooth", "centered", "stationary"\];/.test(F) &&
  /smooth: \{\s*name: "Smooth continuous follow",\s*short: "Smooth",/.test(F));
check("the trigger points are an explicit list with 0.75 the default — never a range a document could smuggle into",
  /export const FOLLOW_TRIGGER_POINTS: readonly number\[\] = \[0\.5, 0\.55, 0\.6, 0\.65, 0\.7, 0\.75, 0\.8, 0\.85, 0\.9\];/.test(F) &&
  /export const DEFAULT_FOLLOW_TRIGGER = 0\.75;/.test(F) &&
  /export const DEFAULT_FOLLOW_MODE: FollowMode = "smooth";/.test(F));
check("followTarget decides in timeline-local pixels and clamps to the scroller's bounds — the engine imports nothing (pure geometry)",
  /followTarget\(\s*mode: FollowMode,\s*trigger: number,\s*playheadT: number,\s*win: FollowWindow,\s*loop: FollowLoop \| null,\s*\): number \| null/.test(F) &&
  /function clampScroll\(value: number, win: FollowWindow\): number/.test(F) &&
  !/^import /m.test(F));
check("smooth holds left of the trigger line, tracks at and past it, and brings an off-window playhead back",
  /case "smooth":\s*if \(visible && lineV < triggerV\) return null;\s*return clampScroll\(t - triggerV, win\);/.test(F));
check("page holds while visible and snaps on exit; centered and stationary always track",
  /case "page":\s*return visible \? null : clampScroll\(t, win\);/.test(F) &&
  /case "centered":\s*return clampScroll\(t - 0\.5 \* win\.viewW, win\);/.test(F) &&
  /case "stationary":\s*return clampScroll\(t - triggerV, win\);/.test(F));
check("a loop that fits on screen holds every mode (§7); the loop test is in the window's own coordinates",
  /if \(loop && loop\.startT >= win\.scrollLeft && loop\.endT <= win\.scrollLeft \+ win\.viewW\) return null;/.test(F));
check("§10's remap and §12's threshold are pure and documented",
  /export function effectiveFollowMode\(\s*mode: FollowMode,\s*opts: \{ readonly recording\?: boolean; readonly stationaryWhileRecording\?: boolean \} = \{\},\s*\): FollowMode/.test(F) &&
  /if \(opts\.recording && opts\.stationaryWhileRecording\) return "stationary";/.test(F) &&
  /export function isReposition\(delta: number, viewW: number\): boolean \{\s*return Math\.abs\(delta\) > Math\.max\(120, viewW \* 0\.5\);\s*\}/.test(F));

// --- 2. The transport semantics (§1/§2/§3/§7/§8/§11) ------------------------------
check("the state carries the §3 pair: startFrame AS lastPlaybackStartPosition, and stoppedPosition",
  /readonly startFrame: number;/.test(T) &&
  /readonly stoppedPosition: number \| null;/.test(T) &&
  /export const STOP_BEHAVIOUR_OFF: Readonly<StopBehaviour> = \{ returnToStartOnStop: false, secondStopReturnsToStart: false \};/.test(T) &&
  /initialPlaybackState[\s\S]*stoppedPosition: null/.test(T));
check("the controller reads the Stop preferences live through an injected provider, both off when omitted",
  /private readonly stopBehaviour: \(\) => StopBehaviour;/.test(C) &&
  /this\.stopBehaviour = options\.stopBehaviour \?\? \(\(\) => STOP_BEHAVIOUR_OFF\);/.test(C));
check("§3: stop freezes at the output's own clock, records stoppedPosition, and honours return-to-start; the second Stop returns only with the preference; no Stop rewrites the start memory",
  /const freeze = wasPlaying\s*\? clampFrame\(this\.output\.positionFrames\(\), this\.state\.durationFrames\)\s*: clampFrame\(this\.state\.positionFrames, this\.state\.durationFrames\);/.test(C) &&
  /positionFrames: behaviour\.returnToStartOnStop \? this\.state\.startFrame : freeze,\s*stoppedPosition: freeze,/.test(C) &&
  /\} else if \(behaviour\.secondStopReturnsToStart\) \{\s*this\.set\(\{ positionFrames: this\.state\.startFrame \}\);/.test(C));
check("§2/§3: a fresh start records startFrame; a pause-resume deliberately does not",
  /if \(this\.state\.status !== "paused"\) this\.set\(\{ startFrame: from \}\);/.test(C));
check("§8: a seek while playing continues playback from the new position and makes it the start memory",
  /this\.set\(\{ startFrame: target \}\);\s*this\.restartAt\(target\);/.test(C) &&
  /position, and the new position becomes the last fresh start\./.test(C) &&
  /Task 10\.1 \(§8\)/.test(C));
check("§7: the wrap rides the poll, is guarded against stacking, and never rewrites the start memory",
  /const loop = this\.loop\(\);\s*if \(loop\) \{[\s\S]*if \(!this\.restarting\) this\.restartAt\(loop\.startFrame\);/.test(C) &&
  /if \(end > loop\.startFrame && this\.output\.positionFrames\(\) >= end\) \{/.test(C) &&
  /const end = Math\.min\(loop\.endFrame, this\.state\.durationFrames > 0 \? this\.state\.durationFrames : loop\.endFrame\);/.test(C));
check("the restart guard: the poll and the live read hold the TARGET through the wrap's async gap, never the dead clock",
  /private restarting = false;/.test(C) &&
  /if \(this\.restarting\) return;[\s\S]*const position = clampFrame/.test(C) &&
  /positionFramesNow\(\): number \{\s*if \(this\.restarting\) return this\.state\.positionFrames;/.test(C) &&
  /this\.restarting = false;[\s\S]*if \(source === "render"\)/.test(C) &&
  /wrap and locate would blip the playhead to the/.test(C));
check("§1: positionFramesNow reads the output's own clock while playing — never a JS interval's guess",
  /positionFramesNow\(\): number \{\s*if \(this\.restarting\) return this\.state\.positionFrames;\s*if \(this\.state\.status === "playing" \|\| this\.state\.status === "rendering"\) \{\s*return clampFrame\(this\.output\.positionFrames\(\), this\.state\.durationFrames\);/.test(C));
check("§11: the natural end stops at the project's end and records it",
  /\/\/ Task 10\.1: the natural end is a stop at the project's end[\s\S]*this\.set\(\{ status: "stopped", positionFrames: this\.state\.durationFrames, stoppedPosition: this\.state\.durationFrames, renderProgress: null \}\);/.test(C) &&
  /mixedAt: this\.clock\.now\(\),\s*stoppedPosition: duration,/.test(C));
check("the facade exposes the live read and the stopped position beside the existing surface",
  /get stoppedPosition\(\) \{ return state\.stoppedPosition; \}/.test(ST) &&
  /positionFramesNow\(\): number \{ return controller\?\.positionFramesNow\(\) \?\? state\.positionFrames; \}/.test(ST));
check("the playback shell wires the Stop preferences and the loop region live into the controller",
  /stopBehaviour: \(\) => \(\{[\s\S]*returnToStartOnStop: settings\.transport\.returnToStartOnStop,[\s\S]*secondStopReturnsToStart: settings\.transport\.secondStopReturnsToStart,[\s\S]*\}\),/.test(PS) &&
  /loop: \(\) => playhead\.activeLoopRegion,/.test(PS));
check("the inverse musical map accumulates seconds across the tempo segments",
  /export function barsToSeconds\(bars: number, markers: readonly TempoMarker\[\]\): number \{[\s\S]*let seconds = 0;[\s\S]*seconds \+= span \* spb;[\s\S]*\}/.test(AA) &&
  /Seconds ACCUMULATE across the segments/.test(AA));

// --- 3. The playhead module (§1/§5/§13) -------------------------------------------
check("the module carries the spec's §1 list over the facade",
  /get positionFrames\(\): number \{ return transport\.positionFrames; \}/.test(PM) &&
  /get isPlaying\(\): boolean/.test(PM) &&
  /get isPaused\(\): boolean/.test(PM) &&
  /get isRecording\(\): boolean \{ return false; \}/.test(PM) &&
  /get lastPlaybackStartPosition\(\): number \{ return transport\.startFrame; \}/.test(PM) &&
  /get stoppedPosition\(\): number \| null \{ return transport\.stoppedPosition; \}/.test(PM) &&
  /get activeLoopRegion\(\)/.test(PM));
check("isRecording is honestly false with the reason said in the file (no recording path exists in v1)",
  /FALSE in this build and never otherwise: ALLOY v1 has no recording path/.test(PM));
check("the loop region validates and the controller clamps the wrap point — setLoop throws on the impossible",
  /throw new Error\(`Alloy playhead: an invalid loop region/.test(PM) &&
  /loopRegion = \{ startFrame: Math\.floor\(startFrame\), endFrame: Math\.floor\(endFrame\) \};/.test(PM));
check("§13: a panel that never chose reads the Settings defaults; one panel's choice never reaches another",
  /function viewOf\(panel: string\): PanelFollowView \{[\s\S]*mode: settings\.transport\.autoScrollMode,[\s\S]*trigger: settings\.transport\.autoScrollTriggerPoint,[\s\S]*suspended: false,/.test(PM) &&
  /followOf\(panel: string\): PanelFollowView \{\s*return viewOf\(panel\);\s*\}/.test(PM));
check("suspension carries a reason; resume and choosing a mode both clear it",
  /suspendFollow\(panel: string, reason: FollowSuspensionReason\): void \{[\s\S]*entry\.suspended = true;\s*entry\.reason = reason;/.test(PM) &&
  /setFollowMode\(panel: string, mode: FollowMode\): void \{[\s\S]*entry\.suspended = false;\s*entry\.reason = null;/.test(PM));
check("§5's auto-resume watcher lives in an $effect.root and resumes only on a restart or a locate-while-playing",
  /\$effect\.root\(\(\) => \{\s*\$effect\(\(\) => \{[\s\S]*const restarted = seenStatus === "stopped" \|\| seenStatus === "error";[\s\S]*if \(playing && \(restarted \|\| start !== seenStart\)\) resumeAllPanels\(\);/.test(PM) &&
  /The watcher lives in an \$effect\.root/.test(PM));

// --- 4. The Arrange layer (§15/§16) ------------------------------------------------
check("the layer is an absolute overlay of the timeline column: the head's own height formula, z-index 1 beneath the pinned rows, no scrolling axis, no pointer events",
  /--arrange-playhead-top: calc\(2 \* var\(--arrange-band-height\) \+ var\(--arrange-tempo-height\) \+ 2px\);/.test(L) &&
  /position: absolute;\s*top: var\(--arrange-playhead-top\);\s*bottom: 0;\s*left: var\(--arrange-track-list-width\);\s*width: var\(--arrange-timeline-width\);/.test(L) &&
  /z-index: 1;/.test(L) &&
  /pointer-events: none;/.test(L) &&
  !/overflow(?:-[xy])?\s*:\s*(auto|scroll)/.test(L) &&
  /a spanning grid child would sit IN the lanes' rows/.test(L));
check("the line is one element moved by transform with will-change, and nothing else re-renders while it moves",
  /will-change: transform;/.test(L) &&
  /cursorEl\.style\.transform = `translateX\(\$\{x\.toFixed\(2\)\}px\)`;/.test(L) &&
  /if \(!cursorEl \|\| Math\.abs\(x - drawnX\) < 0\.25\) return;/.test(L));
check("the rAF loop runs only while something moves; at rest one draw per change and no per-frame work",
  /\$effect\(\(\) => \{\s*if \(playhead\.isPlaying \|\| dragging\) \{\s*if \(!raf\) raf = requestAnimationFrame\(loop\);/.test(L) &&
  /\/\/ Not moving: one draw per position or geometry change; no per-frame work at rest\./.test(L));
check("the line's position comes from the engine's own clock through the project's tempo map — the same coordinates the clips use",
  /const bars = secondsToBars\(frames \/ transport\.sampleRate, markers\);/.test(L) &&
  /import \{ barsToSeconds, secondsToBars \} from "\.\.\/\.\.\/lib\/arrange-audio";/.test(L) &&
  /Math\.min\(Math\.max\(0, bars\) \* barWidth, barCount \* barWidth\)/.test(L));
check("the follow engine is applied per frame with the loop region, the recording remap and the catch-up easing",
  /const mode = effectiveFollowMode\(view\.mode, \{[\s\S]*recording: playhead\.isRecording,[\s\S]*stationaryWhileRecording: settings\.transport\.stationaryWhileRecording,/.test(L) &&
  /const loopT = region \? \{ startT: timelineXOf\(region\.startFrame\), endT: timelineXOf\(region\.endFrame\) \} : null;/.test(L) &&
  /const CATCHUP_MS = 240;/.test(L) &&
  /function easeOutCubic\(p: number\): number \{\s*return 1 - Math\.pow\(1 - p, 3\);\s*\}/.test(L));
check("reduced motion makes every correction exact, and page mode never eases",
  /function reducedMotion\(\): boolean \{[\s\S]*if \(settings\.motion === "reduced"\) return true;[\s\S]*window\.matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches;/.test(L) &&
  /if \(mode === "page" \|\| !isReposition\(delta, clientWidth - listWidth\) \|\| reducedMotion\(\)\) \{/.test(L));
check("§5: the user's own scrolling suspends follow — gated by the preference, told from the engine's write",
  /function onScrollerScroll\(\): void \{[\s\S]*if \(Math\.abs\(scroller\.scrollLeft - lastEngineScroll\) <= 1\) return;[\s\S]*userScrolled\(\);/.test(L) &&
  /if \(Math\.abs\(event\.deltaX\) > 0\) userScrolled\(\); \/\/ horizontal intent; vertical browsing never fights the follow/.test(L) &&
  /if \(!settings\.transport\.suspendOnManualScroll\) return;/.test(L) &&
  /playhead\.suspendFollow\(PANEL, "manual-scroll"\);/.test(L));
check("§2/§8: a click in the timeline region locates — never the pinned furniture — and click-to-play starts besides",
  /if \(vx < listWidth\) return; \/\/ the pinned track list is the furniture, not the timeline/.test(L) &&
  /locateAt\(vx - listWidth \+ scroller\.scrollLeft, \{ clickMayPlay: true \}\);/.test(L) &&
  /if \(opts\.clickMayPlay && settings\.transport\.clickToPlay && !playhead\.isPlaying && !playhead\.isPaused\) \{[\s\S]*void transport\.play\(\);/.test(L));
check("§12: the drag cap scrubs — the line follows the hand, follow stands down, ONE locate lands on release",
  /if \(event\.button !== 0\) return;\s*handleEl\.setPointerCapture\(event\.pointerId\);/.test(L) &&
  /playhead\.suspendFollow\(PANEL, "scrub"\);/.test(L) &&
  /locateAt\(dragT, \{ clickMayPlay: false \}\);/.test(L) &&
  /ONE locate lands on release/.test(L) &&
  /would reopen the sources per event/.test(L));
check("the drag cap is the layer's one real control: a focusable button with keyboard nudges",
  /<button\s+type="button"\s+class="arrange-playhead__handle"/.test(L) &&
  /aria-label="Playhead\. Drag to scrub; arrow keys move it by a bar\."/.test(L) &&
  /if \(event\.key === "ArrowLeft"\) next = bars - 1;/.test(L) &&
  /pointer-events: auto;/.test(L));
check("the layer resolves the room's scroller itself; the room holds no state of its own",
  /scroller = layerEl\.closest<HTMLElement>\("\[data-arrange-scroll\]"\);/.test(L) &&
  !/\$state/.test(RM) &&
  /<ArrangePlayhead markers=\{arrangement\.tempoMarkers\} barCount=\{arrangement\.barCount\} \/>/.test(RM) &&
  /\.arrange-grid \{[\s\S]*position: relative;/.test(RM));

// --- 5. The toolbar control and the shortcut (§5/§13/§15) ---------------------------
check("the follow group is contextual: the toolbar carries it only for the active timeline panel",
  /followPanel = null,/.test(TB) &&
  /\{#if followPanel\}\s*<span class="toolbar__divider" aria-hidden="true"><\/span>\s*<FollowControl panel=\{followPanel\} \/>/.test(TB) &&
  /const followPanel = \$derived<"arrange" \| null>\(room === "arrange" \? "arrange" : null\);/.test(AP) &&
  /<AppToolbar onImport=\{\(\) => requestImport\(\)\} followPanel=\{followPanel\} \/>/.test(AP));
check("the control reads and writes one panel's state through the module, with the approved selector",
  /const view = \$derived\(playhead\.followOf\(panel\)\);/.test(FC) &&
  /bind:value=\{\(\) => view\.mode, \(id\) => playhead\.setFollowMode\(panel, id as FollowMode\)\}/.test(FC) &&
  /hook="follow-mode"/.test(FC));
check("the suspended badge with its reason and the Re-follow key appear only while suspended",
  /data-follow-suspended=\{view\.reason \?\? ""\}/.test(FC) &&
  /label="Re-follow"/.test(FC) &&
  /onpress=\{\(\) => playhead\.resumeFollow\(panel\)\}/.test(FC));
check("the F shortcut resumes follow, guarded by the typing predicate, and never reaches into the shell for it",
  /if \(event\.key\.toLowerCase\(\) !== "f"\) return;/.test(FC) &&
  /if \(event\.defaultPrevented \|\| isTextEntry\(event\.target\)\) return;/.test(FC) &&
  /import \{ isTextEntry \} from "\.\.\/\.\.\/lib\/text-entry";/.test(FC) &&
  !/project\/shell/.test(FC));
check("the typing predicate moved to its own module; the shell re-exports it and nothing else changed about the shell's exclusivity",
  /const TEXT_INPUT_TYPES = new Set\(\["text", "number", "search", "email", "url", "tel", "password", ""\]\);/.test(TE) &&
  /export \{ isTextEntry \} from "\.\.\/text-entry";/.test(PSH));

// --- 6. The preferences (§14) -------------------------------------------------------
check("the transport group: the §14 list plus click-to-play and the §10 override, every default exactly as the spec lists it",
  /export interface TransportPreferences \{[\s\S]*returnToStartOnStop: boolean;[\s\S]*secondStopReturnsToStart: boolean;[\s\S]*autoScrollMode: FollowMode;[\s\S]*autoScrollTriggerPoint: number;[\s\S]*suspendOnManualScroll: boolean;[\s\S]*clickToPlay: boolean;[\s\S]*stationaryWhileRecording: boolean;[\s\S]*\}/.test(SET) &&
  /returnToStartOnStop: false,[\s\S]*secondStopReturnsToStart: false,[\s\S]*autoScrollMode: DEFAULT_FOLLOW_MODE,[\s\S]*autoScrollTriggerPoint: DEFAULT_FOLLOW_TRIGGER,[\s\S]*suspendOnManualScroll: true,[\s\S]*clickToPlay: false,[\s\S]*stationaryWhileRecording: false,/.test(SET));
check("the document round-trips the group; the mode and trigger fall back to the defaults; the switches are the setExportOutput pattern",
  /function transportGroup\(value: unknown\): TransportPreferences \{[\s\S]*FOLLOW_TRIGGER_POINTS\.includes\(doc\.autoScrollTriggerPoint\)[\s\S]*oneOf\(FOLLOW_MODES, doc\.autoScrollMode, DEFAULT_SETTINGS\.transport\.autoScrollMode\),/.test(SET) &&
  /transport: \{ \.\.\.s\.transport \},/.test(SET) &&
  /setTransportSwitch\(key: TransportSwitchKey, on: boolean\): void \{[\s\S]*if \(!TRANSPORT_SWITCH_KEYS\.includes\(key\)\) throw new Error\(`unknown transport switch: \$\{key\}`\);/.test(SET));
check("the Settings screen: the panels — Task 10.1's transport & playhead, Task 11.1's project rate (sixth) — the approved controls only",
  count(SS, /<ScreenPanel /g) === 6 &&
  /<ScreenPanel title="Transport & playhead" id="settings-transport-title"/.test(SS) &&
  /hook="follow-mode"/.test(SS) &&
  /hook="follow-trigger"/.test(SS) &&
  count(SS, /<ScribbleSelect/g) === 4 && /<ScreenPanel title="Project rate" id="settings-rate-title"/.test(SS) &&
  /data-settings-transport=\{sw\.key\}/.test(SS) &&
  /\{#each TRANSPORT_SWITCHES as sw \(sw\.key\)\}/.test(SS) &&
  count(SS, /data-settings-transport=\{sw\.key\}/g) === 1 &&
  !/<(button|input|select|textarea)\b/.test(SS));

// --- 7. Tests, docs, package -------------------------------------------------------
const countTests = (tests.match(/^test\(/gm) ?? []).length;
check("the playhead suite is substantial and covers the spec's own sections",
  countTests >= 16 &&
  /§3 · the default Stop freezes at the stopped position/.test(tests) &&
  /§3 · the second Stop returns to the start only with the preference/.test(tests) &&
  /§7 · the wrap's async gap never blips the playhead to the dead clock/.test(tests) &&
  /§5 · a restart of playback resumes every panel/.test(tests) &&
  /§4 · smooth follow holds left of the trigger line/.test(tests) &&
  /the frame ↔ bar mapping is mutual/.test(tests));
check("the playback suite's stop semantics were re-cut to §3, and the settings suite covers the transport ops",
  /10\.1 · stop leaves the playhead at the stopped position; the natural end records it \(§3, §11\)/.test(playbackTests) &&
  !/stop returns to the defined start position and natural end leaves the playhead at duration/.test(playbackTests) &&
  /setTransportMode\("page"\)/.test(settingsTests) &&
  /setTransportTriggerPoint\(0\.5\)/.test(settingsTests) &&
  /setTransportSwitch\("returnToStartOnStop", true\)/.test(settingsTests) &&
  /unknown follow mode/.test(settingsTests));
check("npm test runs the playhead suite; the guard is wired as check:playhead",
  /tests\/playhead\.test\.mjs/.test(pkg.scripts.test) &&
  pkg.scripts["check:playhead"] === "node scripts/check-playhead-structure.mjs");
check("no new dependency", Object.keys(pkg.dependencies ?? {}).length === 0 && JSON.stringify(Object.keys(pkg.devDependencies).sort()) === JSON.stringify(["@sveltejs/vite-plugin-svelte", "@types/node", "svelte", "svelte-check", "typescript", "vite", "vite-plugin-singlefile"]));
check("data-model documents the playhead contract (§23)", /## 23\./.test(read("data-model.md")) && /lastPlaybackStartPosition/.test(read("data-model.md")) && /followTarget/.test(read("data-model.md")));
check("the decisions log records Task 10.1", /## Task 10\.1/.test(read("decisions-log.md")) && count(read("decisions-log.md"), /D10\.1\.\d+/g) >= 7);
check("the task report exists", exists("task-reports/10.1-playhead-transport.md"));

// --- 8. This task's own files are pinned so the next task reopens them knowingly ----
const pinned = {
  // Task 10.1: the follow engine, the pure geometry — new in this task.
  "src/lib/playback/follow.ts": "507f2b05c12d4a96c583bcecd7f2bac135ce86bfdc4dfb72c484495d4c5f844d",
  // Task 10.1: the playhead state module — new in this task.
  "src/lib/playback/playhead.svelte.ts": "f333a97a3f3a25735eaa1ce49b77bcc30a9fbf2747799e292c58db722d463343",
};
for (const [rel, hash] of Object.entries(pinned)) {
  check(`this task's own file is pinned: ${rel}`, exists(rel) && sha256(read(rel)) === hash, exists(rel) ? `sha256 ${sha256(read(rel)).slice(0, 16)}…` : "missing");
}

for (const name of passes) console.log(`  PASS  ${name}`);
if (failures.length > 0) {
  console.error("");
  for (const failure of failures) console.error(`  FAIL  ${failure}`);
  console.error("");
  console.error(`Playhead structural contract check — ${passes.length}/${passes.length + failures.length} passed`);
  process.exit(1);
}
console.log("");
console.log(`Playhead structural contract check — ${passes.length}/${passes.length} passed`);
