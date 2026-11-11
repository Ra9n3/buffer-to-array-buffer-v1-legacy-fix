#!/usr/bin/env node
/**
 * ALLOY — Task 4.1 structural contract: Home, onboarding, Settings and the
 * project lifecycle under them.
 *
 * What this guards (plan L651–653 Phase 4 foundation; §11 hardware profiles;
 * §12 export; owner decisions D4.1.1–D4.1.6, decisions-log.md):
 *
 *   1. Routes: Home is `#/` (and where an empty or unrecognised hash lands),
 *      Settings `#/settings`; neither is a room — ROOMS and the room tabs are
 *      unchanged; the wordmark is the way Home; one Settings link in the
 *      header beside the tabs.
 *   2. Home lists only what the lifecycle finds in storage, judged entry by
 *      entry (open now · ready · unavailable + reason); only a READY entry
 *      gets an Open key; nothing fabricated; a clear Start empty; a status
 *      line that says what happened; the fixture workflow intact.
 *   3. The lifecycle is pure of the browser (storage, clock and ids are
 *      injected by the shell): reopen = template + saved values validated
 *      field by field and as a graph; start empty = a new unique id and a
 *      valid Master-only project through the shared store; restore at start,
 *      else the pristine fixture; the recent index schema'd and capped.
 *   4. The empty project is Master only (no invented Returns) and every room
 *      shows an explicit empty state for it; the rooms are otherwise
 *      untouched (pinned).
 *   5. The first-run guide: one panel on Home while pending, four steps,
 *      Skip / Done remembered in the stored settings, Settings brings it
 *      back; never a dialog, never modal, never a timer.
 *   6. Settings: the plan's items only — hardware profile (auto + the three,
 *      the plan's intents, no invented numbers, "not yet operational"),
 *      export (WAV only, three output types, nothing exported), motion
 *      (applied: <html data-motion> + preferences.css), the guide. One
 *      schema'd document, lenient per field, one write per change.
 *   7. Visual system: the approved controls only (no raw buttons, inputs or
 *      selects on the screens), tokens only (the one exception: the rooms'
 *      band greys mirrored from app.css), no glow, no screws, no new
 *      dependency, no audio, no delete / rename / forget UI.
 *   8. Tests exist and run under `npm test`; the docs carry §11 and D4.1.x;
 *      the approved hardware components and app.css are unchanged.
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
  rooms: "src/lib/rooms.ts",
  app: "src/App.svelte",
  main: "src/main.ts",
  shell: "src/lib/project/shell.ts",
  lifecycle: "src/lib/project/lifecycle.ts",
  templates: "src/lib/project/templates.ts",
  persistence: "src/lib/project/persistence.ts",
  store: "src/lib/project/store.svelte.ts",
  model: "src/lib/project/model.ts",
  settings: "src/lib/settings.svelte.ts",
  prefs: "src/lib/preferences.css",
  screenShell: "src/screens/ScreenShell.svelte",
  screenPanel: "src/screens/ScreenPanel.svelte",
  print: "src/screens/Print.svelte",
  actionKey: "src/screens/ActionKey.svelte",
  guide: "src/screens/FirstRunGuide.svelte",
  home: "src/screens/HomeScreen.svelte",
  settingsScreen: "src/screens/SettingsScreen.svelte",
  notice: "src/components/EmptyProjectNotice.svelte",
  consoleRoom: "src/rooms/ConsoleRoom.svelte",
  arrangeRoom: "src/rooms/ArrangeRoom.svelte",
  mixerRoom: "src/rooms/MixerRoom.svelte",
  appCss: "src/app.css",
  templatesTests: "tests/templates.test.mjs",
  lifecycleTests: "tests/lifecycle.test.mjs",
  settingsTests: "tests/settings.test.mjs",
  shellTests: "tests/shell.test.mjs",
  pkg: "package.json",
  dataModel: "data-model.md",
  decisions: "decisions-log.md",
  report: "task-reports/4.1-report.md",
};
for (const rel of Object.values(FILES)) check(`file exists: ${rel}`, exists(rel));
if (failures.length) {
  for (const f of failures) console.error(`  FAIL  ${f}`);
  process.exit(1);
}
const S = Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, read(rel)]));
const C = Object.fromEntries(Object.entries(S).map(([k, src]) => [k, stripComments(src)]));
const R = C.rooms;
const L = C.lifecycle;
const T = C.templates;
const SET = C.settings;
const SH = C.shell;
const ST = C.store;
const pkg = JSON.parse(S.pkg);
const appT = stripComments(templateOf(S.app));
const appS = stripComments(scriptOf(S.app));
const homeT = stripComments(templateOf(S.home));
const homeS = stripComments(scriptOf(S.home));
const setT = stripComments(templateOf(S.settingsScreen));
const setS = stripComments(scriptOf(S.settingsScreen));
const guideT = stripComments(templateOf(S.guide));
const guideS = stripComments(scriptOf(S.guide));
const screenFiles = walk("src/screens").filter((rel) => rel.endsWith(".svelte"));
const screenSrc = screenFiles.map((rel) => read(rel));
const screenCode = screenSrc.map((s) => stripComments(scriptOf(s)) + "\n" + stripComments(templateOf(s))).join("\n");
const screenStyles = screenSrc.map((s) => stripComments(styleOf(s))).join("\n") + "\n" + stripComments(styleOf(S.notice));

// --- 1. Routes and the shell. ---------------------------------------------------------------
check("Home is `#/`, Settings `#/settings`; both are routes of their own kind, never rooms", /export const HOME_HREF = "#\/";/.test(R) && /export const SETTINGS_PATH = "\/settings";/.test(R) && /export const SETTINGS_HREF = `#\$\{SETTINGS_PATH\}`;/.test(R) && /\| \{ readonly kind: "home" \}\s*\| \{ readonly kind: "settings" \};/.test(R) && /export type RoomId = "console" \| "arrange" \| "mixer";/.test(R));
check("the room list and default room are unchanged (three rooms, Console default); Home and Settings are absent from ROOMS", /export const DEFAULT_ROOM: RoomId = "console";/.test(R) && !/home|settings/i.test(R.slice(R.indexOf("export const ROOMS"), R.indexOf("DEFAULT_ROOM"))) && count(R.slice(R.indexOf("export const ROOMS"), R.indexOf("DEFAULT_ROOM")), /id: "/g) === 3);
check("an empty or unrecognised hash lands on Home; the dev page and Settings are recognised before the rooms", /export function routeFromHash\(hash: string\): AppRoute \{\s*if \(isDevComponentsHash\(hash\)\) return \{ kind: "dev-components" \};\s*if \(isSettingsHash\(hash\)\) return \{ kind: "settings" \};\s*const room = parseRoomHash\(hash\);\s*if \(room\) return \{ kind: "room", room \};\s*return \{ kind: "home" \};\s*\}/.test(R) && /case "home":\s*return HOME_HREF;/.test(R) && /case "settings":\s*return SETTINGS_HREF;/.test(R));
/*
  Task 9.2 (owner) — the top bar overhaul. The old contract said the wordmark was
  the way Home and Settings stood in its own landmark beside the room tabs. The
  owner ordered the wordmark, the tab numbers and the Settings button removed
  from the bar, so the contract is rewritten to the *new* intent rather than
  deleted: every destination that used to be reachable must still be reachable,
  by a different door.

    Home      -> the fourth navigation tab (owner's answer), still #/
    Settings  -> Help > Settings in the menu bar, still #/settings
    Import    -> the toolbar and File > Import stems…, both reaching one picker

  The screens still render by route kind, and the rooms still render as before.
*/
check(
  "App: Home is the fourth nav tab, Settings lives in Help, and the screens still render by route kind",
  /<RoomNav room=\{room\} onHome=\{route\.kind === "home"\} \/>/.test(appT) &&
    /<MenuBar [^>]*onSettings=\{/.test(appT) &&
    /data-menu-item="settings"/.test(read("src/components/MenuBar.svelte")) &&
    count(appT, /href=\{SETTINGS_HREF\}/g) === 0 &&
    !/class="app-brand"/.test(appT) &&
    /\{#if room === "console"\}\s*<ConsoleRoom \/>\s*\{:else if room === "arrange"\}\s*<ArrangeRoom \/>\s*\{:else if room === "mixer"\}\s*<MixerRoom \/>\s*\{:else if route\.kind === "settings"\}\s*<SettingsScreen \/>\s*\{:else if route\.kind === "home"\}\s*<HomeScreen \/>\s*\{:else\}\s*<DevComponentsPage \/>\s*\{\/if\}/.test(appT) &&
    /<MiniTransport \/>/.test(appT),
);
check("App: the screens are not flagged as rooms (no per-room shell rule applies); the route is on the shell for styling and evidence", /data-active-room=\{activeRoom\} data-route=\{route\.kind\}/.test(appT) && /const activeRoom = \$derived\(room \?\? \(route\.kind === "dev-components" \? "dev" : route\.kind\)\);/.test(appS));
check("main.ts loads preferences.css after the tokens and the shell stylesheet, and installs the project shell before the mount", /import "\.\/lib\/tokens\.css";\s*import "\.\/app\.css";\s*import "\.\/lib\/preferences\.css";/.test(C.main) && /installProjectShell\(window\);\s*mount\(App, \{ target \}\);/.test(C.main));

// --- 2. Home. --------------------------------------------------------------------------------
check("Home: the screen frame (h1 `home-title`), the panels open-now · start · recent, the status line", /<ScreenShell screenId="home" title="Home"/.test(homeT) && /<ScreenPanel title="Open now" id="home-current-title" hook="current">/.test(homeT) && /<ScreenPanel title="Start" id="home-start-title"[^>]*hook="start">/.test(homeT) && /<ScreenPanel title="Recent projects" id="home-recent-title" hook="recent">/.test(homeT) && /role="status" aria-live="polite" data-home-status=\{notice\?\.tone \?\? "none"\}/.test(homeT) && /<section class="screen" data-screen=\{screenId\} aria-labelledby="\{screenId\}-title">/.test(S.screenShell) && /<h1 class="screen__title" id="\{screenId\}-title">\{title\}<\/h1>/.test(S.screenShell));
check("Home: the recent list is the lifecycle's judgement of what is stored, re-read after every action and whenever the open project changes; nothing is listed from anywhere else", /return lifecycle\.recent\(\);/.test(homeS) && /void version;\s*void project\.id;/.test(homeS) && count(homeS, /version\+\+;/g) === 2 && !/openedAt:|"project-|localStorage|JSON\.parse/.test(homeS));
check("Home: an entry gets an Open key ONLY when it is ready; the open project is marked open now; an unavailable entry prints its reason and has no key", /\{#if view\.status\.kind === "current"\}\s*<EngravedLabel text="Open now"[^>]*\/>\s*\{:else if view\.status\.kind === "ready"\}\s*<ActionKey label="Open" name=\{`Open \$\{view\.entry\.name\}`\} hook="open" onpress=\{\(\) => open\(view\)\} \/>\s*\{:else\}\s*<span class="recent__unavailable" data-home-unavailable=\{view\.status\.reason\}>/.test(homeT) && count(homeT, /hook="open"/g) === 1 && /data-home-entry=\{view\.entry\.id\} data-home-entry-status=\{view\.status\.kind\}/.test(homeT));
check("Home: the template label names the project's starting point, never its state (owner, 5.1 review: a started-empty project may carry stems)", /"session-fixture": "Started as the development session",\s*empty: "Started empty",/.test(S.templates));
check("Home: an empty list is said plainly, with the no-storage case distinguished; the open project's identity, template, counts and room links are on the card", /\{#if recent\.length === 0\}/.test(homeT) && /lifecycle\.storage \? "No recent projects yet\." : "Storage is not available in this browser, so recent projects cannot be kept\."/.test(homeT) && /data-home-recent-empty/.test(homeT) && /data-home-current=\{project\.id\}/.test(homeT) && /TEMPLATE_LABELS\[project\.template\]/.test(homeT) && /data-home-room="arrange"/.test(homeT) && /data-home-room="console"/.test(homeT) && /data-home-room="mixer"/.test(homeT) && /"Empty: no tracks, Returns or buses yet"/.test(homeS));
check("Home: Start empty is one momentary key through the lifecycle; Open goes through the lifecycle; both report in the status line (stored or not, applied / skipped counts, the refusal's detail)", /<ActionKey label="Start empty" name="Start an empty project" hook="start-empty" onpress=\{startEmpty\} \/>/.test(homeT) && /const result = lifecycle\.startEmpty\(\);/.test(homeS) && /const result = lifecycle\.open\(view\.entry\.id\);/.test(homeS) && /but it could not be saved: \$\{result\.error/.test(homeS) && /Could not open “\$\{view\.entry\.name\}”: \$\{result\.detail\}/.test(homeS) && /result\.skipped\.length/.test(homeS));
check("Home never navigates by itself: no location / hash writes on the screens (the rooms are links)", !/location\.|\.hash\s*=|history\.pushState|history\.replaceState|window\./.test(screenCode));

// --- 3. The lifecycle. -----------------------------------------------------------------------
check("the recent index: schema alloy.projects/1 under alloy.projects, capped at 12, newest first, malformed and duplicate entries dropped; project copies under alloy.project.<id>", /export const RECENT_SCHEMA = "alloy\.projects\/1";/.test(L) && /export const RECENT_KEY = "alloy\.projects";/.test(L) && /export const RECENT_LIMIT = 12;/.test(L) && /return `alloy\.project\.\$\{id\}`;/.test(L) && /if \(seen\.has\(e\.id\)\) continue;/.test(L) && /!isProjectTemplateId\(e\.template\)\) continue;/.test(L) && /writeIndex\(\[entry, \.\.\.rest\]\.slice\(0, RECENT_LIMIT\)\);/.test(L));
check("an entry is judged against its stored copy: current · ready · unavailable with one of the documented reasons, each with its sentence", /export type UnavailableReason = "no-storage" \| "missing" \| "damaged" \| "mismatch" \| "unknown-template" \| "invalid";/.test(L) && /\| \{ readonly kind: "current" \}/.test(L) && /\| \{ readonly kind: "ready"; readonly template: ProjectTemplateId; readonly manifest: ProjectManifest; readonly text: string \}/.test(L) && /\| \{ readonly kind: "unavailable"; readonly reason: UnavailableReason; readonly detail: string \}/.test(L) && /if \(manifest\.project\.id !== entry\.id\) return \{ kind: "unavailable", reason: "mismatch"/.test(L) && count(L.slice(L.indexOf("export const UNAVAILABLE_DETAIL"), L.indexOf("};", L.indexOf("export const UNAVAILABLE_DETAIL"))), /: "/g) === 6);
check("reopen = the template under the saved identity (+ its imported tracks, Task 5.1) + the saved values, each validated by type, references checked against the rebuilt project, then the routing graph; invalid values are skipped and reported, an invalid graph refused", /const built = createTemplateProject\(template, manifest\.project\.id, manifest\.project\.name\);/.test(L) && /const withImports = manifest\.tracks && manifest\.tracks\.length > 0 \? withImportedTracks\(built, manifest\.tracks\) : built;\s*if \("ok" in withImports\) return \{ reason: "damaged"/.test(L) && /let valid = isValidValue\(f\.type, value\);/.test(L) && /if \(valid && f\.rel === "output"\) valid = value === "master" \|\| next\.buses\.some\(\(b\) => b\.id === value\);/.test(L) && /f\.rel\.endsWith\("\/to"\)\) valid = value === null \|\| next\.returns\.some\(\(r\) => r\.id === value\);/.test(L) && /isValidSource\(track\.familyId, value as string \| null\)/.test(L) && /skipped\.push\(f\.path\);/.test(L) && /const verdict = validateGraph\(next\);\s*if \(!verdict\.ok\) return \{ reason: "invalid"/.test(L));
check("open(): never the open project over itself, never an unlisted id, never an entry that is not ready; the switch = store the outgoing project, loadProject, retarget autosave, record, then read the imported stems back (Task 5.1) and their analysis results (Task 5.2)", /if \(id === project\.id\) return \{ ok: false, reason: "current"/.test(L) && /if \(!entry\) return \{ ok: false, reason: "unknown"/.test(L) && /if \(status\.kind !== "ready"\) \{/.test(L) && /function install\(next: Project, storedText: string \| null\): void \{\s*loadProject\(next\);\s*autosave\.retarget\(projectKey\(next\.id\), storedText\);\s*touch\(next\);\s*void assets\.hydrate\(\);\s*(?:\/\/[^\n]*\n\s*)?void analysis\.hydrate\(\);\s*\}/.test(L) && /function ensureStored\(\): void \{\s*void autosave\.save\(\);/.test(L));
check("startEmpty(): a fresh id from the injected source until it is unique, an unused Untitled name, createEmptyProject, the copy written at creation (or the failure said), then the switch", /let id = options\.newId\(\);\s*while \(entries\.some\(\(e\) => e\.id === id\) \|\| id === project\.id\) id = options\.newId\(\);/.test(L) && /const next = createEmptyProject\(id, untitledName\(entries\)\);/.test(L) && /const text = serializeManifest\(buildManifest\(next, projectFields\(next\)\)\);/.test(L) && /install\(next, stored \? text : null\);\s*return \{ ok: true, id, name: next\.name, stored, error \};/.test(L) && /export const EMPTY_PROJECT_NAME = "Untitled project";/.test(T));
check("restoreLast(): the newest listed project when its copy is valid, otherwise whatever the store booted with (an EMPTY project since Task 9.1.2) and the reason; the open project is always recorded", /restoreLast\(\): RestoreResult \{/.test(L) && /const booted = bootOutcome\(\);/.test(L) && /return \{ outcome: booted, id: project\.id, because: "no-storage" \};/.test(L) && /return \{ outcome: booted, id: project\.id, because: "no-entries" \};/.test(L) && /if \(result\.ok\) return \{ outcome: "restored", id: result\.id, skipped: result\.skipped \};/.test(L) && /return \{ outcome: booted, id: project\.id, because \};/.test(L));
check("the lifecycle is pure of the browser: storage, the wall clock and ids are injected (the shell gives localStorage, Date and crypto.randomUUID); no Svelte, no timers, no globals", /readonly storage: StorageAdapter \| null;\s*readonly now: \(\) => string;\s*readonly newId: \(\) => string;/.test(L.replace(/\n\s*\n/g, "\n")) && !/localStorage|sessionStorage|indexedDB|window|document|navigator|new Date|Date\.|Math\.random|crypto|setTimeout|setInterval|requestAnimationFrame|from "svelte|\$state|\$derived|\$effect/.test(L) && /const now = \(\): string => new Date\(\)\.toISOString\(\);/.test(SH) && /lifecycle\.attach\(\{\s*storage: adapter,\s*now,\s*newId: \(\) => newProjectId\(win\),/.test(SH) && /return `project-\$\{c\.randomUUID\(\)\}`;/.test(SH));
check("the store: loadProject replaces the whole project in the one tree — observer stopped, identity + lists + arrangement moved, the views forgotten, the registry rebuilt in place, history rebound, the observer re-armed; isEmpty is derived from the lists", /export function loadProject\(next: Project\): void \{\s*stopObserver\(\);/.test(ST) && /target\.id = next\.id;\s*target\.name = next\.name;\s*target\.template = next\.template;\s*target\.tracks = next\.tracks;\s*target\.returns = next\.returns;\s*target\.buses = next\.buses;\s*target\.arrangement = next\.arrangement;/.test(ST) && /fieldRegistry\.splice\(0, fieldRegistry\.length, \.\.\.projectFields\(state\)\);\s*history\.rebind\(fieldRegistry\);\s*stopObserver = startObserver\(\);/.test(ST) && /get isEmpty\(\): boolean \{\s*return state\.tracks\.length === 0 && state\.returns\.length === 0 && state\.buses\.length === 0;\s*\}/.test(ST));

// --- 4. The empty project and the rooms' empty states. -------------------------------------
check("the empty project is Master only: no tracks, Returns or buses (the plan's default Returns are not invented), an empty arrangement, template `empty`; the fixture template exists under its one id only", /template: "empty",\s*tracks: \[\],\s*returns: \[\],\s*buses: \[\],\s*arrangement: \{\s*barCount: 0,\s*timeSignature: EMPTY_TIME_SIGNATURE,\s*sections: \[\],\s*tempoMarkers: \[\],\s*clips: \{\},\s*\},/.test(T) && /if \(id !== SESSION_PROJECT_ID\) return null;/.test(T) && /export const PROJECT_TEMPLATES: readonly ProjectTemplateId\[\] = \["session-fixture", "empty"\];/.test(T) && /export type ProjectTemplateId = "session-fixture" \| "empty";/.test(C.model));
check("the empty-project notice: the room's heading id, what is missing in that room, where tracks come from (import in Arrange, Task 5.1), a link Home; nothing drawn that is not there", /<div class="empty" data-empty-project=\{room\}>/.test(S.notice) && /<EngravedLabel as="h2" id=\{headingId\} text="Empty project" size="sm" \/>/.test(S.notice) && /\{WHAT\[room\]\.toLowerCase\(\)\}\. \{HOW\[room\]\}<\/p>/.test(S.notice) && /arrange: "Import stems above to add tracks\.",/.test(S.notice) && /console: "Import stems in Arrange to add tracks\.",/.test(S.notice) && /<a href=\{HOME_HREF\} data-empty-project-home>/.test(S.notice) && /room: "console" \| "arrange" \| "mixer";/.test(S.notice));
check("Console: the channel-bank zone shows the notice instead of the bank for an empty project; the bridge and transport zones are untouched", /\{#if project\.isEmpty\}\s*<EmptyProjectNotice headingId="console-channels-title" room="console" \/>\s*\{:else\}\s*<ChannelBank \/>\s*\{\/if\}/.test(S.consoleRoom) && count(S.consoleRoom, /project\.isEmpty/g) === 1 && /data-console-zone="meter-bridge"/.test(S.consoleRoom) && /data-console-zone="transport"/.test(S.consoleRoom));
check("Arrange: the notice replaces the scroller and grid for an empty project (the fixture timeline header is never drawn for it)", /\{#if project\.isEmpty\}\s*<div class="arrange-empty">\s*<EmptyProjectNotice headingId="arrange-empty-title" room="arrange" \/>\s*<\/div>\s*\{:else\}/.test(S.arrangeRoom) && count(S.arrangeRoom, /project\.isEmpty/g) === 1 && S.arrangeRoom.indexOf("{:else}") < S.arrangeRoom.indexOf("<ArrangeTimelineHeader"));
check("Mixer: the layout holds the notice alone for an empty project, the compact column + detail otherwise", /\{#if project\.isEmpty\}\s*<section\s*class="mixer-zone mixer-zone--channels"\s*data-mixer-region="channel-column"\s*aria-labelledby="mixer-channels-title"\s*>\s*<EmptyProjectNotice headingId="mixer-channels-title" room="mixer" \/>/.test(S.mixerRoom) && count(S.mixerRoom, /project\.isEmpty/g) === 2 && /<MixerChannelStrip/.test(S.mixerRoom) && /<MixerDetailPanel/.test(S.mixerRoom));

// --- 5. The first-run guide. ------------------------------------------------------------------
check("the guide is one Home panel shown while pending (settings.showGuide), with exactly four steps of the essential workflow", /^\s*\{#if settings\.showGuide\}/m.test(guideT) && /<ScreenPanel title="First time here" id="home-guide-title"/.test(guideT) && /<ol class="guide" data-guide-steps>/.test(guideT) && count(guideS, /\{ word: "/g) === 4 && /word: "Start"/.test(guideS) && /word: "Import"/.test(guideS) && /word: "Mix"/.test(guideS) && /word: "Inspect"/.test(guideS) && /<FirstRunGuide \/>/.test(homeT));
check("Skip and Done are momentary keys straight to the settings ops (remembered); Settings brings the guide back; the states are pending · skipped · done", /<ActionKey label="Skip" name="Skip the first-run guide" hook="guide-skip" onpress=\{\(\) => settingsOps\.skipGuide\(\)\} \/>/.test(guideT) && /<ActionKey label="Done" name="Finish the first-run guide" hook="guide-done" onpress=\{\(\) => settingsOps\.finishGuide\(\)\} \/>/.test(guideT) && /get showGuide\(\): boolean \{\s*return state\.onboarding === "pending";\s*\}/.test(SET) && /skipGuide\(\): void \{[\s\S]*?state\.onboarding = "skipped";/.test(SET) && /finishGuide\(\): void \{[\s\S]*?state\.onboarding = "done";/.test(SET) && /showGuideAgain\(\): void \{[\s\S]*?state\.onboarding = "pending";/.test(SET) && /<ActionKey label="Show again" name="Show the first-run guide again on Home" hook="guide-again" onpress=\{\(\) => settingsOps\.showGuideAgain\(\)\} \/>/.test(setT) && /data-settings-guide=\{settings\.onboarding\}/.test(setT));
check("the guide never blocks: no dialog, modal, inert, focus trap, overlay or timer anywhere on the screens", !/role="dialog"|aria-modal|<dialog|inert|focus-trap|position:\s*fixed|z-index|setTimeout|setInterval|requestAnimationFrame|autofocus/.test(screenCode + "\n" + screenStyles));

// --- 6. Settings. ------------------------------------------------------------------------------
check("the settings document: schema alloy.settings/1 under alloy.settings; the defaults (auto · mix on / stems off / buses off · system · pending); lenient per field; one write per change, same value no write", /export const SETTINGS_SCHEMA = "alloy\.settings\/1";/.test(SET) && /export const SETTINGS_KEY = "alloy\.settings";/.test(SET) && /hardwareProfile: "auto",\s*export: \{ fullMix: true, stems: false, buses: false \},\s*motion: "system",\s*onboarding: "pending",/.test(SET) && /if \(doc\.schema !== SETTINGS_SCHEMA\) return null;/.test(SET) && /hardwareProfile: oneOf\(HARDWARE_PROFILES, doc\.hardwareProfile, DEFAULT_SETTINGS\.hardwareProfile\),/.test(SET) && /fullMix: bool\(exp\.fullMix, DEFAULT_SETTINGS\.export\.fullMix\),/.test(SET) && /if \(state\.hardwareProfile === profile\) return;/.test(SET) && /if \(state\.export\[output\] === on\) return;/.test(SET) && /if \(state\.motion === motion\) return;/.test(SET) && /function changed\(\): void \{\s*persist\(\);/.test(SET) && count(SET, /\$state\(/g) === 1);
check("the settings module is pure of the browser (storage injected by the shell; no localStorage, timers, DOM, Date); settings and the lifecycle share the shell's one Web Storage adapter", !/localStorage|sessionStorage|indexedDB|window|document|navigator|setTimeout|setInterval|new Date|Date\./.test(SET) && /if \(adapter\) attachSettings\(adapter\);/.test(SH) && /lifecycle\.attach\(\{\s*storage: adapter,/.test(SH));
check("hardware profile: Automatic (the benchmark's pick, measured in Task 5.2) + Lite · Standard · Performance with the plan's §11 intents and no invented numbers; read only by the hardware module; the screen says so", /export const HARDWARE_PROFILES: readonly HardwareProfile\[\] = \["auto", "lite", "standard", "performance"\];/.test(SET) && /lite: \{ name: "Lite", intent: "Lowest RAM use and conservative concurrency; a longer render time is acceptable\." \}/.test(SET) && /standard: \{ name: "Standard", intent: "Balanced concurrency, buffering, memory use and render time\." \}/.test(SET) && /performance: \{ name: "Performance", intent: "Higher concurrency and buffering for capable machines, to reduce render time\." \}/.test(SET) && !/\d+\s*(GB|MB|cores?|threads?|ms\b|%)/.test(SET) && /note="Used by the analysis engine: Automatic follows the benchmark measured on this computer before its first analysis; choosing a profile overrides that measurement\."/.test(setT) && /intent: "The profile the hardware benchmark selects, measured on this computer before its first analysis\."/.test(SET) && /hook="hardware-profile"/.test(setT) && /bind:value=\{\(\) => settings\.hardwareProfile, \(id\) => settingsOps\.setHardwareProfile\(id as HardwareProfile\)\}/.test(setT) && !/hardwareProfile/.test(walk("src").filter((rel) => !/settings\.svelte\.ts|SettingsScreen\.svelte|shell\.ts|hardware\.svelte\.ts/.test(rel)).map((rel) => read(rel)).join("\n")));
check("export: WAV is the one format (a constant, not a preference); three output types (full mix · processed individual stems · processed buses) as tactile toggles; nothing exported, no sample rate or bit depth invented", /export const EXPORT_FORMAT = "WAV";/.test(SET) && /export const EXPORT_OUTPUTS: readonly ExportOutput\[\] = \["fullMix", "stems", "buses"\];/.test(SET) && /fullMix: "Full mix",\s*stems: "Processed individual stems",\s*buses: "Processed buses",/.test(SET) && /\{#each EXPORT_OUTPUTS as output \(output\)\}\s*<div class="output" data-settings-output=\{output\} data-settings-output-on=\{settings\.export\[output\]\}>\s*<TactileSwitch/.test(setT) && /bind:engaged=\{\(\) => settings\.export\[output\], \(on\) => settingsOps\.setExportOutput\(output, on\)\}/.test(setT) && /Format: \$\{EXPORT_FORMAT\}/.test(setT) && !/kHz|sample rate|bit depth|dither|mp3|flac|aac|ogg|showDirectoryPicker|webkitdirectory/i.test(setS + setT + SET) && !/AudioContext|OfflineAudioContext|decodeAudioData|AudioBuffer|MediaRecorder|showSaveFilePicker|Blob\(|createObjectURL/.test(screenCode + SET + L + SH));
check("motion: Follow system · Reduced through the scribble window; the shell mirrors it onto <html data-motion> now and on every change and clears it at uninstall; preferences.css stops animation and transition under data-motion=reduced with !important and nothing else", /\{ id: "system", name: "Follow system" \},\s*\{ id: "reduced", name: "Reduced" \},/.test(setS) && /hook="motion"/.test(setT) && /bind:value=\{\(\) => settings\.motion, \(id\) => settingsOps\.setMotion\(id as MotionPreference\)\}/.test(setT) && /root\?\.setAttribute\("data-motion", motionAttribute\(s\)\);/.test(SH) && /applyMotion\(settings\);\s*const unsubscribeSettings = settings\.subscribe\(applyMotion\);/.test(SH) && /root\?\.removeAttribute\("data-motion"\);/.test(SH) && /:root\[data-motion="reduced"\] \*,\s*:root\[data-motion="reduced"\] \*::before,\s*:root\[data-motion="reduced"\] \*::after \{\s*animation-duration: 0\.01ms !important;\s*animation-iteration-count: 1 !important;\s*animation-delay: 0ms !important;\s*transition-duration: 0\.01ms !important;\s*transition-delay: 0ms !important;\s*scroll-behavior: auto !important;\s*\}/.test(C.prefs) && !/color|background|font|border|opacity|transform|display/.test(C.prefs));
check("Settings carries the plan's items only: profile · export · accessibility (motion) · the guide, and the storage line; no theme, language, audio-device, folder or account preference", count(setT, /<ScreenPanel /g) === 4 && /hook="profile"/.test(setT) && /hook="export"/.test(setT) && /hook="accessibility"/.test(setT) && /hook="guide"/.test(setT) && /data-settings-storage=\{settings\.storage\.attached \? "attached" : "none"\}/.test(setT) && !/theme|language|locale|device|default folder|folder preference|account|sign in|login|cloud|sync/i.test(setT + setS));

// --- 7. The visual system and the boundaries. -------------------------------------------------
check("the screens are built from the approved controls only: no raw button, input, select or textarea; the momentary key is the panel-labelled tactile switch; the selectors are scribble windows", !/<(button|input|select|textarea)\b/.test(screenCode) && /<TactileSwitch variant="panel" \{label\} \{name\} lamp="amber" bind:engaged=\{on\} \{onToggle\} \/>/.test(S.actionKey) && /on = false;\s*onpress\(\);/.test(stripComments(scriptOf(S.actionKey))) && count(setT, /<ScribbleSelect/g) === 2 && !/<(button|input|select|textarea)\b/.test(stripComments(templateOf(S.notice))));
/*
  Task 9.3 (owner): the screens are now on the same material as everything else,
  so the old "no tokens on the screens, one hard-coded exception" rule has been
  reversed by instruction. What this still protects is the reason the rule
  existed — the screens must not invent a visual language of their own:

    - no raw hex colour that is not already defined in app.css;
    - no glow, filter, gradient text or animation.
*/
check(
  "the screens use the shared material — no invented hex, no glow, no filter, no animation",
  (() => {
    const hexes = [...new Set(screenStyles.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [])];
    return (
      hexes.every((h) => S.appCss.includes(h)) &&
      !/text-shadow:[^;]*(rgba?\([^)]*\)\s*,?\s*)?[^;]*\d+px\s+\d+px\s+[1-9]\d*px/.test(screenStyles) &&
      !/filter:|@keyframes|animation:|background-clip: text/.test(screenStyles)
    );
  })(),
);
check("the screens reach the project only through the store, the lifecycle, the templates' labels, the settings and the routes — never fields, history, persistence, clipboard or the shell; no storage or network of their own", screenFiles.every((rel) => !/project\/(fields|history|persistence|clipboard|shell)"/.test(read(rel))) && !/localStorage|sessionStorage|indexedDB|fetch\(|WebSocket|XMLHttpRequest|navigator\./.test(screenCode) && /from "\.\.\/lib\/project\/lifecycle"/.test(S.home) && /from "\.\.\/lib\/settings\.svelte"/.test(S.settingsScreen) && !/project\/(fields|history|persistence|clipboard|shell|lifecycle)"/.test(S.notice));
check("no multi-project management beyond recent + start empty: no delete, rename, forget, duplicate, import or export of projects on the screens", !/\b(delete|remove|rename|forget|duplicate|clear list|import project|export project)\b/i.test(homeT + setT) && !/lifecycle\.(delete|remove|rename|forget)/.test(screenCode) && !/delete\(|rename\(|forget\(/.test(L.slice(L.indexOf("export const lifecycle"))));
check("the approved rooms gain nothing but the empty branch: no new controls, selectors or routing UI in the rooms' diffs (no new hooks beyond the notice)", count(S.consoleRoom, /<EmptyProjectNotice/g) === 1 && count(S.arrangeRoom, /<EmptyProjectNotice/g) === 1 && count(S.mixerRoom, /<EmptyProjectNotice/g) === 1 && [S.consoleRoom, S.arrangeRoom, S.mixerRoom].every((s) => !/<(button|input|select)\b|ScribbleSelect|ActionKey|lifecycle|settings/.test(stripComments(templateOf(s)))));
check("NO SCREWS, EVER (owner, D2.1.9): nothing renders a screw", walk("src").every((rel) => !/(class=["'{][^"'}]*screw|\.[\w-]*screw[\w-]*\s*[{,:]|data-[\w-]*screw|__screw)/i.test(read(rel))));
check("no new dependency (package.json dependencies: none); no audio, analysis or playback API anywhere in the new modules", Object.keys(pkg.dependencies ?? {}).length === 0 && !/AudioContext|AudioWorklet|decodeAudioData|MediaStream|<audio|<video/.test(screenCode + SET + L + T + SH));

// --- 8. Tests and documentation. ------------------------------------------------------------------
check("npm test runs the three 4.1 files; they cover the list from stored data, the empty list, start-empty identity + validity, cross-room views, invalid entries, the fixture workflow, restore at start, the guide's states, every preference stored and restored, the motion attribute", /tests\/templates\.test\.mjs tests\/lifecycle\.test\.mjs tests\/settings\.test\.mjs/.test(pkg.scripts.test) && count(S.templatesTests, /^test\(/gm) >= 5 && count(S.lifecycleTests, /^test\(/gm) >= 9 && count(S.settingsTests, /^test\(/gm) >= 6 && /lifecycle\.recent\(\)/.test(S.lifecycleTests) && /startEmpty\(\)/.test(S.lifecycleTests) && /restoreLast\(\)/.test(S.lifecycleTests) && /"damaged"|damaged/.test(S.lifecycleTests) && /trackStrip\(|arrangeTrackOf\(/.test(S.lifecycleTests) && /createSessionProject\(\)/.test(S.lifecycleTests) && /skipGuide\(\)/.test(S.settingsTests) && /finishGuide\(\)/.test(S.settingsTests) && /showGuideAgain\(\)/.test(S.settingsTests) && /setHardwareProfile\(/.test(S.settingsTests) && /setExportOutput\(/.test(S.settingsTests) && /setMotion\(/.test(S.settingsTests) && /data-motion/.test(S.shellTests) && /restored/.test(S.shellTests));
check("data-model.md §11 documents the lifecycle and settings: the recent index, the project keys, the templates, the statuses, the settings document and what is operational", /## 11\./.test(S.dataModel) && /alloy\.projects\/1/.test(S.dataModel) && /alloy\.settings\/1/.test(S.dataModel) && /alloy\.project\.<id>|alloy\.project\.\$\{id\}|`alloy\.project\.`/.test(S.dataModel) && /unknown-template/.test(S.dataModel) && /not yet operational/i.test(S.dataModel) && /data-motion/.test(S.dataModel));
check("decisions-log.md carries the Task 4.1 decisions (D4.1.x) and the report exists", /## Task 4\.1/.test(S.decisions) && count(S.decisions, /D4\.1\.\d+/g) >= 6 && /Task 4\.1/.test(S.report));

// --- 9. Pins. -----------------------------------------------------------------------------------
// The approved hardware components and the shell stylesheet are unchanged by this task; the 4.1
// files are pinned so the next task reopens them knowingly.
const pinned = {
    // Task 9.2 re-pinned (owner's top-bar overhaul). The change to this file is
  // part of the approved removals/additions — see decisions-log D9.2.1 — and the
  // checks around this pin still assert the file's real contract.

    // Task 9.3 re-pinned (owner's review: hardware chrome, tactile keys, thin bar).
  // The change to this file is the approved restyle — see decisions-log D9.3.1 —
  // and the checks around this pin still assert the file's real contract.


  // Task 9.5 re-pinned (owner's one-window Console redesign, decisions-log
  // D9.5.x): this file changed with the approved layout — the compact strip,
  // its meter, the three-rail bank, the bottom transport bar. The checks
  // around this pin still assert the file's real contract.
// Task 9.6 re-pinned (the 0.8x Console, decisions-log D9.6.x): this file
  // changed with the owner's density pass — the room's 0.8x scope, the bare
  // height-driven bridge, the halved transport bar, the walnut divider and
  // the snapping rails. The checks around this pin still assert the file's
  // real contract.
  "src/app.css": "fcefcc5cae66ff67ea3d87cb11f31a6a90e561e248912bad0a97e59a061bb027",
  "src/lib/tokens.css": "10ae166bc9e73c265523fbf95f4ba39f7b9f8277573a81e36953295cf51345be",
  "src/components/hardware/TactileSwitch.svelte": "9f8a61ff521988aff708ba7e860854c441343525c0eb43b11e92a534ce1a2ba9",
  "src/components/hardware/ScribbleSelect.svelte": "f0803769f208bca9bd18ff7b1982f9e918b8dde9597aae300879272657f4628a",
  "src/components/hardware/EngravedLabel.svelte": "230ebcd7cf810d3096953e5131cb9cb3a89dd83f9f0e9cc0bcd934d2ca74fc29",
  "src/components/hardware/Lamp.svelte": "024d907589c1ab33b2b3c5cc8840347b9779450b61a60f67c34b045d4ac8010a",
    // Task 9.2 re-pinned (owner's top-bar overhaul). The change to this file is
  // part of the approved removals/additions — see decisions-log D9.2.1 — and the
  // checks around this pin still assert the file's real contract.

    // Task 9.3 re-pinned (owner's review: hardware chrome, tactile keys, thin bar).
  // The change to this file is the approved restyle — see decisions-log D9.3.1 —
  // and the checks around this pin still assert the file's real contract.


  "src/components/RoomNav.svelte": "3f2c33e7ad94a5b4904acb6b5b97220d3bee550ebe21b870c5a970cf03772efa",
  "src/components/RoomShell.svelte": "815bcb79e940433591c632d7ae98c4a5e918394b14d97726ae33c6002d808a71",
  // Task 9.1.1 re-pinned the strip (owner decision D9.1.2 option a): it now mounts the
  // listening-source selector beside the keys, in its own component. The strip's layout,
  // the four Phase 0 keys and their functions are unchanged; what moved the hash is one
  // additional child. check-transport-structure guards the new control in detail.
    // Task 9.2 re-pinned (owner's top-bar overhaul). The change to this file is
  // part of the approved removals/additions — see decisions-log D9.2.1 — and the
  // checks around this pin still assert the file's real contract.

    // Task 9.3 re-pinned (owner's review: hardware chrome, tactile keys, thin bar).
  // The change to this file is the approved restyle — see decisions-log D9.3.1 —
  // and the checks around this pin still assert the file's real contract.


  "src/components/MiniTransport.svelte": "442869b2337bc90b1172aeb9e35cc3fb3bcbcbff5eab48f42af02ac138335891",
  "src/lib/rooms.ts": "bd7b0044ed91505baea1e4f3573eebddb20145c1a65a2d662d3a2a6fb7ceb792",
    // Task 9.2 re-pinned (owner's top-bar overhaul). The change to this file is
  // part of the approved removals/additions — see decisions-log D9.2.1 — and the
  // checks around this pin still assert the file's real contract.

    // Task 9.3 re-pinned (owner's review: hardware chrome, tactile keys, thin bar).
  // The change to this file is the approved restyle — see decisions-log D9.3.1 —
  // and the checks around this pin still assert the file's real contract.


  "src/App.svelte": "c82681587787d678287f9d9d50bac7242424c9a2983db05992d68711176b569b",
  "src/main.ts": "8942e47f95fabfcabc09534ff86d0b4abff1cf946c94c32a466631f535cc3e70",
  "src/lib/project/shell.ts": "90cee1809c81cea24049717ce2329b3c2ef29eced0bfb6740606d98b62218f86",
    // Task 9.1.2 re-pinned this file: the store boots an EMPTY project instead of the
  // development session. Nothing was deleted from it; see the decision log (D9.1.2).
  "src/lib/project/lifecycle.ts": "d83451e5b9f224bda2e4dccbaafeec64e413314ed977e5cb3d6334d85444fbbd",
  "src/lib/project/templates.ts": "215db3b6f609b8a622e285204d5973d8ca2fac4db0bd508f7104b47865184aee",
  "src/lib/settings.svelte.ts": "8a6af022fdeb4a62079e4e285e4fe5b73af6ba00adf08012db018e7afe70c5b0",
  "src/lib/preferences.css": "fd383463fb065a7fa879b36740f8b5e168c03accc0eb7809a8e87a8126f90189",
    // Task 9.3 re-pinned (owner's review: hardware chrome, tactile keys, thin bar).
  // The change to this file is the approved restyle — see decisions-log D9.3.1 —
  // and the checks around this pin still assert the file's real contract.

    // Task 9.3 re-pinned (owner's review: the last #a3a3a3 web-grey border on the
  // screens became the shared bevel token; see D9.3.1). The checks around this
  // pin still assert the screen's real contract.


  "src/screens/ScreenShell.svelte": "fe5d9c75d7260120a61164429b58454da00748507633582b10c43a30660fb645",
  "src/screens/ScreenPanel.svelte": "af27d5d73e70d68f02e069361d830587986a3e625ec60802331faac00a59f17f",
  "src/screens/Print.svelte": "0d1b9d68f4da31a265c7fce2f4dc0e7a6c15506caab4864c1bca1a82164d55a6",
  "src/screens/ActionKey.svelte": "dd7965139d575ffc7c9e30be0b048459b0c4af01a49e1f3b45e2710870e1718e",
  "src/screens/FirstRunGuide.svelte": "51f5e8db520d933a7c3a6a0a1083895b8ac0711e8a21c5be5c728746c87beecf",
    // Task 9.3 re-pinned (owner's review: hardware chrome, tactile keys, thin bar).
  // The change to this file is the approved restyle — see decisions-log D9.3.1 —
  // and the checks around this pin still assert the file's real contract.

    // Task 9.3 re-pinned (owner's review: the last #a3a3a3 web-grey border on the
  // screens became the shared bevel token; see D9.3.1). The checks around this
  // pin still assert the screen's real contract.


  "src/screens/HomeScreen.svelte": "36ed1dc4c2ea46463df757df0cef9ceea5e0e7ca9a1d28f1d89128d08aedf7e1",
  "src/screens/SettingsScreen.svelte": "6a6d5500db0a90f1d523bb2916fbc323cfd72a8928d87353fa6976ebd52fe3e3",
  "src/components/EmptyProjectNotice.svelte": "031f3c98a303ff01ac11b7e50c949f6684fd1de4970215c083eacb2ec760d152",
    // Task 9.2 re-pinned (owner's top-bar overhaul). The change to this file is
  // part of the approved removals/additions — see decisions-log D9.2.1 — and the
  // checks around this pin still assert the file's real contract.

    // Task 9.3 re-pinned (owner's review: hardware chrome, tactile keys, thin bar).
  // The change to this file is the approved restyle — see decisions-log D9.3.1 —
  // and the checks around this pin still assert the file's real contract.


  // Task 9.5 re-pinned (owner's one-window Console redesign, decisions-log
  // D9.5.x): this file changed with the approved layout — the compact strip,
  // its meter, the three-rail bank, the bottom transport bar. The checks
  // around this pin still assert the file's real contract.
// Task 9.6 re-pinned (the 0.8x Console, decisions-log D9.6.x): this file
  // changed with the owner's density pass — the room's 0.8x scope, the bare
  // height-driven bridge, the halved transport bar, the walnut divider and
  // the snapping rails. The checks around this pin still assert the file's
  // real contract.
  "src/rooms/ConsoleRoom.svelte": "b9bb7d57ab1f90503798e8fbd2a4c753e43b86eac08e56e6fa591dedd4a6ecde",
    // Task 9.2 re-pinned (owner's top-bar overhaul). The change to this file is
  // part of the approved removals/additions — see decisions-log D9.2.1 — and the
  // checks around this pin still assert the file's real contract.

    // Task 9.3 re-pinned (owner's review: hardware chrome, tactile keys, thin bar).
  // The change to this file is the approved restyle — see decisions-log D9.3.1 —
  // and the checks around this pin still assert the file's real contract.


  "src/rooms/ArrangeRoom.svelte": "6e276cdccbbc9273228a224ecbbd3e4c39c7938aecfdaf6f2cddb09b9ce2949c",
    // Task 9.2 re-pinned (owner's top-bar overhaul). The change to this file is
  // part of the approved removals/additions — see decisions-log D9.2.1 — and the
  // checks around this pin still assert the file's real contract.

    // Task 9.3 re-pinned (owner's review: hardware chrome, tactile keys, thin bar).
  // The change to this file is the approved restyle — see decisions-log D9.3.1 —
  // and the checks around this pin still assert the file's real contract.


  "src/rooms/MixerRoom.svelte": "b6a73be6e10e2c5c63308477342f8cf3b312a971790c3251ac78fa73233f2c6b",
};
for (const [rel, hash] of Object.entries(pinned)) {
  check(`approved file untouched: ${rel}`, exists(rel) && sha256(read(rel)) === hash, exists(rel) ? `sha256 ${sha256(read(rel)).slice(0, 16)}…` : "missing");
}

// --- Report. ---------------------------------------------------------------------------------
for (const name of passes) console.log(`  PASS  ${name}`);
for (const name of failures) console.error(`  FAIL  ${name}`);
console.log(`\nHome · onboarding · Settings · project lifecycle structural contract check — ${passes.length}/${passes.length + failures.length} passed`);
process.exit(failures.length ? 1 : 0);
