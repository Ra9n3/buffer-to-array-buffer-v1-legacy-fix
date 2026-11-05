#!/usr/bin/env node
/**
 * Arrange timeline structural contract check — Task 2.6.
 *
 * Dependency-free guard (Node built-ins only). It does not measure pixels —
 * the Playwright measurement does that — it pins the source-level contract
 * that makes the ruler, the lanes, the clips and the tempo markers agree:
 *
 *   1. ONE BAR WIDTH. The room defines `--arrange-bar-width` once and derives
 *      the timeline width from it and the bar count; the ruler's marks, the
 *      numerals, the tempo markers, the structure grid, the lane grid and the
 *      clip plates are all positioned from that one property in bar units
 *      (D2.6.2). The list column recipe and the 80 px row height are the
 *      approved Task 2.5 values, untouched.
 *   2. THE HEAD. ArrangeTimelineHeader keeps the Task 0.4 band order (ruler →
 *      tempo → structure), prints the ruler from the approved label fixture
 *      with metal-grey major/minor marks, is sticky, and prints no glow.
 *   3. THE LANES. ArrangeTimelineLane takes its height from the shared row
 *      height, scrolls nothing itself, draws every clip from fixture data in
 *      bar units, draws the waveform placeholder in the cream token (two
 *      paths for a stereo clip), and carries the Console strip's flat org tab
 *      value for value — `--org` touches nothing else (D2.2.13).
 *   4. THE TEMPO TRACK. Markers come from the fixture (ascending bars inside
 *      the song, the one time signature on the first), are printed as
 *      "NNN BPM", and the held-tempo trace is the fixture's step path. No
 *      control edits them.
 *   5. THE FIXTURES. arrange-timeline.ts covers every approved track once,
 *      with sorted, non-overlapping clips inside the 56 bars, mono and
 *      stereo both present, deterministic generation (no randomness, no
 *      clock), nothing read from audio, nothing stored.
 *   6. SCOPE. No handlers, drag, inputs or buttons in the timeline (nothing
 *      selects, moves or plays); no screw heads (D2.1.9); the approved Task
 *      2.5 row, fixtures and shared components are byte-identical; no
 *      dependency added or changed; the playground section exists.
 *
 * Run: npm run check:arrange-timeline
 */

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(resolve(root, rel), "utf8");
const sha = (rel) => createHash("sha256").update(readFileSync(resolve(root, rel))).digest("hex");

const passes = [];
const failures = [];
function check(name, ok, detail = "") {
  if (ok) passes.push(name);
  else failures.push(detail ? `${name} — ${detail}` : name);
}

const room = read("src/rooms/ArrangeRoom.svelte");
const head = read("src/components/ArrangeTimelineHeader.svelte");
const lane = read("src/components/ArrangeTimelineLane.svelte");
const lib = read("src/lib/arrange-timeline.ts");
const data = read("src/lib/arrange.ts");
const strip = read("src/components/channel-strip/TrackStrip.svelte");
const stripFixtures = read("src/components/channel-strip/track-strip-fixtures.ts");
const devPage = read("src/dev/DevComponentsPage.svelte");
const devFixture = read("src/dev/ArrangeTimelineFixture.svelte");
const pkg = JSON.parse(read("package.json"));

const styleOf = (src) => src.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";
const markupOf = (src) => src.replace(/<script[\s\S]*?<\/script>/, "").replace(/<style>[\s\S]*<\/style>/, "");
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/^\s*\/\/.*$/gm, "");
const block = (css, selector) => {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) return "";
  return css.slice(start, css.indexOf("}", start));
};
const roomStyle = styleOf(room);
const headStyle = styleOf(head);
const laneStyle = styleOf(lane);

// --- 1. One bar width; the approved column and row geometry. -------------------------
check("the room defines --arrange-bar-width once (2.75rem — 44 px, whole beats of 11 px; D2.6.2)", (roomStyle.match(/--arrange-bar-width\s*:/g) ?? []).length === 1 && /--arrange-bar-width:\s*2\.75rem;/.test(roomStyle));
check("the timeline width is the bar count times the bar width, nothing hand-typed", /--arrange-timeline-width:\s*calc\(var\(--arrange-bar-count\) \* var\(--arrange-bar-width\)\);/.test(roomStyle) && !/--arrange-timeline-width:\s*\d/.test(roomStyle));
// Task 3.1: the bar count is the project's arrangement (seeded from the one
// ARRANGE_BAR_COUNT constant in lib/project/session.ts), read from the store.
check("the bar count reaches CSS from the project's arrangement (inline on the room root; Task 3.1)", /style:--arrange-bar-count=\{arrangement\.barCount\}/.test(room) && /const arrangement = \$derived\(project\.arrangement\);/.test(room) && /barCount: ARRANGE_BAR_COUNT,/.test(read("src/lib/project/session.ts")));
check("the room defines the head band heights (ruler/structure 1.375rem, tempo 2.25rem) — the head is 82 px with its 2 px baseline", /--arrange-band-height:\s*1\.375rem;/.test(roomStyle) && /--arrange-tempo-height:\s*2\.25rem;/.test(roomStyle));
check("the list column recipe is untouched: clamp(12rem, 16vw, 15rem), 12rem under 40rem (D2.5.3)", /--arrange-track-list-width:\s*clamp\(12rem, 16vw, 15rem\);/.test(roomStyle) && /@media \(max-width: 40rem\) \{[\s\S]*--arrange-track-list-width:\s*12rem;/.test(roomStyle));
check("the row height is untouched: 5rem (4.25rem under 40rem)", /--arrange-row-height:\s*5rem;/.test(roomStyle) && /@media \(max-width: 40rem\) \{[\s\S]*--arrange-row-height:\s*4\.25rem;/.test(roomStyle));
check("the grid still lays out list column × timeline width, rows and lanes in one loop", /grid-template-columns:\s*var\(--arrange-track-list-width\)\s+var\(--arrange-timeline-width\)/.test(roomStyle) && (room.match(/\{#each tracks as track \(track\.id\)\}/g) ?? []).length === 1);
check("the room renders the head component once, after the corner, fed the project's bars, tempo and sections (Task 5.1), and gives each lane its track's name, org and the project's clips — the fixture's placeholders or an imported stem's peaks (Task 3.1 / 5.1)", (room.match(/<ArrangeTimelineHeader barCount=\{arrangement\.barCount\} tempoMarkers=\{arrangement\.tempoMarkers\} sections=\{arrangement\.sections\} \/>/g) ?? []).length === 1 && room.indexOf('data-arrange-region="track-list-header"') < room.indexOf("<ArrangeTimelineHeader") && /<ArrangeTimelineLane code=\{track\.code\} laneId=\{`lane-\$\{track\.code\}`\} name=\{track\.name\} org=\{track\.org\} clips=\{arrangement\.clips\[track\.id\] \?\? \[\]\} \/>/.test(room) && /import \{ arrangeTrackOf, project, trackMeta \} from "\.\.\/lib\/project\/store\.svelte"/.test(room) && /clips\[track\.id\] = clipsOf\(track\.code\)/.test(read("src/lib/project/session.ts")));
check("the scroller is the work surface in a 1 px dark frame with the dark scrollbar scheme; the Phase 0 placeholder frame and head styles are gone", /\.arrange-scroll \{[^}]*border:\s*1px solid var\(--al-bevel-shadow\);/s.test(roomStyle) && /\.arrange-scroll \{[^}]*color-scheme:\s*dark;/s.test(roomStyle) && /\.arrange-scroll \{[^}]*background-color:\s*var\(--al-material-surface\);/s.test(roomStyle) && !/#e4e4e4|dashed|\.arrange-timeline-head|\.arrange-band\b|isLabelledBar/.test(stripComments(room)));

// Every horizontal position in the head and the lanes is a multiple of the one bar width.
const positioned = [
  ["ruler numeral", /\.ruler__numeral \{[^}]*left:\s*calc\(var\(--bar\) \* var\(--arrange-bar-width\) \+ 4px\);/s, headStyle],
  ["tempo marker", /\.tempo__marker \{[^}]*left:\s*calc\(var\(--bar\) \* var\(--arrange-bar-width\)\);/s, headStyle],
  ["structure grid", /\.structure \{[^}]*grid-template-columns:\s*repeat\(var\(--arrange-bar-count\), var\(--arrange-bar-width\)\);/s, headStyle],
  ["clip plate left", /\.clip \{[^}]*left:\s*calc\(var\(--clip-start\) \* var\(--arrange-bar-width\)\);/s, laneStyle],
  ["clip plate width", /\.clip \{[^}]*width:\s*calc\(var\(--clip-bars\) \* var\(--arrange-bar-width\) - 1px\);/s, laneStyle],
];
for (const [what, re, css] of positioned) check(`${what} is positioned in bar units from --arrange-bar-width`, re.test(css));
check("the ruler, the tempo band and the lanes draw their bar grids from the same bar width (bar lines, four-bar lines; the ruler adds beat ticks at bar width ÷ beats per bar)", /\.ruler \{[^}]*background-size:\s*calc\(var\(--arrange-bar-width\) \* 4\) 100%,\s*var\(--arrange-bar-width\) 9px,\s*var\(--ruler-beat-width\) 4px;/s.test(headStyle) && /--ruler-beat-width:\s*calc\(var\(--arrange-bar-width\) \/ var\(--arrange-beats-per-bar\)\);/.test(headStyle) && /\.tempo \{[^}]*background-size:\s*calc\(var\(--arrange-bar-width\) \* 4\) 100%,\s*var\(--arrange-bar-width\) 100%;/s.test(headStyle) && /\.arrange-lane \{[^}]*background-size:\s*calc\(var\(--arrange-bar-width\) \* 4\) 100%,\s*var\(--arrange-bar-width\) 100%;/s.test(laneStyle));
check("no timeline position is hand-typed in pixels: the numeral, tempo marker, structure marker and clip blocks carry no px left/width", [".ruler__numeral", ".tempo__marker", ".structure__marker"].every((sel) => !/(?<![-\w])(?:left|width):\s*\d+(?:\.\d+)?px;/.test(block(headStyle, sel))) && !/(?<![-\w])(?:left|width):\s*\d+(?:\.\d+)?px;/.test(block(laneStyle, ".clip")));

// --- 2. The head. -----------------------------------------------------------------------
const order = ["timeline-header", "timeline-ruler", "tempo-track", "structure-markers"].map((r) => head.indexOf(`data-arrange-region="${r}"`));
check("the head keeps the Task 0.4 band order: ruler → tempo → structure, inside the timeline-header region", order.every((i) => i >= 0) && order[0] < order[1] && order[1] < order[2] && order[2] < order[3]);
check("the head is sticky at the top of the room's one scroller, on the list corner's panel material", /\.timeline-head \{[^}]*position:\s*sticky;[^}]*top:\s*0;/s.test(headStyle) && /\.timeline-head \{[^}]*background-color:\s*var\(--al-material-panel\);/s.test(headStyle) && /\.timeline-head \{[^}]*border-bottom:\s*2px solid/s.test(headStyle));
check("the ruler's numerals follow the bar count by the approved rule (every four bars — for 56 bars the label fixture itself, Task 5.1), printed as engraved values with their bar on a data attribute", /\{#each numerals as mark \(mark\.bar\)\}/.test(head) && /const numerals = \$derived\(rulerLabels\(barCount\)\);/.test(head) && /import \{ rulerLabels \} from "\.\.\/lib\/arrange-audio";/.test(head) && /return Array\.from\(\{ length: Math\.ceil\(Math\.max\(0, barCount\) \/ ARRANGE_RULER_LABEL_INTERVAL\) \}, \(_, index\) => \{\s*const bar = index \* ARRANGE_RULER_LABEL_INTERVAL \+ 1;/.test(read("src/lib/arrange-audio.ts")) && /data-ruler-bar=\{mark\.bar\}/.test(head) && /<EngravedLabel text=\{mark\.label\} size="xs" kind="value" tone="muted" \/>/.test(head) && /ARRANGE_RULER_LABEL_INTERVAL = 4/.test(data));
check("the ruler's marks are the metal print — majors from 90 % metal, minors from 45 % — and nothing in the head is a hex colour of its own", /--ruler-major:\s*color-mix\(in srgb, var\(--al-material-metal\) 90%, transparent\);/.test(headStyle) && /--ruler-minor:\s*color-mix\(in srgb, var\(--al-material-metal\) 45%, transparent\);/.test(headStyle) && !/#[0-9a-f]{3,8}\b/i.test(headStyle));
check("the seam between the ruler and the tempo track is the cut groove — bevel shadow over bevel light (Task 0.4's heavier line)", /\.ruler \{[^}]*border-bottom:\s*1px solid var\(--al-bevel-shadow\);[^}]*box-shadow:\s*inset 0 -1px 0 var\(--al-bevel-light\);/s.test(headStyle));
check("the structure band is the Task 0.4 grid: one span per section (the project's; the approved section fixture by default — Task 5.1), an engraved label at its first bar, its start bar on a data attribute", /\{#each sections as section, index \(index\)\}/.test(head) && /style:grid-column=\{markerSpan\(section\)\}/.test(head) && /return `span \$\{section\.barCount\}`;/.test(head) && /data-structure-bar=\{section\.startBar\}/.test(head) && /sections = ARRANGE_SECTIONS,/.test(head) && /\.structure__marker \{[^}]*border-left:\s*1px solid var\(--ruler-major\);/s.test(headStyle));
check("no glow on any print or trace in the head (D2.3): no text-shadow, no filter", !/text-shadow:(?!\s*none;)/.test(headStyle) && !/filter:/.test(headStyle));

// --- 3. The lanes. ------------------------------------------------------------------------
check("the lane keeps its Task 0.4 contract: height from --arrange-row-height, no scrolling axis, the timeline-lane region and laneId/code props", /\.arrange-lane \{[^}]*height:\s*var\(--arrange-row-height\);/s.test(laneStyle) && ![...laneStyle.matchAll(/overflow(?:-[xy])?\s*:\s*([^;]+);/g)].some((m) => /auto|scroll/.test(m[1])) && /data-arrange-region="timeline-lane"/.test(lane) && /data-lane=\{laneId\}/.test(lane) && /data-track-code=\{code\}/.test(lane));
check("the new lane props are optional with safe defaults (backward compatible with the Task 0.4 call shape)", /name = "",/.test(lane) && /org = "neutral",/.test(lane) && /clips = \[\],/.test(lane));
check("the lane is the work surface with the restrained boundary (one dark hair line below, no lighter rule, no outline)", /\.arrange-lane \{[^}]*background-color:\s*var\(--al-material-surface\);/s.test(laneStyle) && /\.arrange-lane \{[^}]*border-bottom:\s*1px solid rgba\(0, 0, 0, 0\.42\);/s.test(laneStyle) && !/outline:/.test(laneStyle) && !/#[0-9a-f]{3,8}\b/i.test(laneStyle));
check("every clip is drawn from the fixture: keyed on clipId, start and bar count as bar-unit custom properties, its position/size/channels/kind on data attributes, the lane's clip count on the root", /\{#each clips as clip \(clip\.clipId\)\}/.test(lane) && /style:--clip-start=\{clip\.startBar - 1\}/.test(lane) && /style:--clip-bars=\{clip\.barCount\}/.test(lane) && ["data-arrange-clip={clip.clipId}", "data-clip-start={clip.startBar}", "data-clip-bars={clip.barCount}", "data-clip-channels={clip.channels}", "data-clip-kind={clip.kind}", "data-clip-count={clips.length}"].every((a) => lane.includes(a)));
check("the clip is a raised plate on the surface (surface-raised, 1 px dark edge, 2 px radius) and the only element that clips its drawing", /\.clip \{[^}]*background-color:\s*var\(--al-material-surface-raised\);/s.test(laneStyle) && /\.clip \{[^}]*border:\s*1px solid rgba\(0, 0, 0, 0\.6\);/s.test(laneStyle) && /\.clip \{[^}]*border-radius:\s*2px;/s.test(laneStyle) && (laneStyle.match(/overflow:\s*hidden;/g) ?? []).length === 1 && /\.clip \{[^}]*overflow:\s*hidden;/s.test(laneStyle));
check("the waveform placeholder is the cream token, flat (peaks .42, body .78 — no glow, no gradient, no pure white), stretched to the plate", /\.clip__peaks \{[^}]*fill:\s*var\(--al-material-cream\);[^}]*fill-opacity:\s*0\.42;/s.test(laneStyle) && /\.clip__body \{[^}]*fill:\s*var\(--al-material-cream\);[^}]*fill-opacity:\s*0\.78;/s.test(laneStyle) && /preserveAspectRatio="none"/.test(lane) && !/#fff\b|white|filter:|text-shadow|gradient\([^)]*cream/.test(laneStyle));
check("a stereo clip draws two paths (one per channel wave), a mono clip one — the body is a <use> of the same path, not a second drawing", /\{#each clip\.waves as wave, channel \(channel\)\}/.test(lane) && /<path id=\{`\$\{laneId\}-\$\{clip\.clipId\}-\$\{channel\}`\} class="clip__peaks" d=\{wave\.d\} \/>/.test(lane) && /<use href=\{`#\$\{laneId\}-\$\{clip\.clipId\}-\$\{channel\}`\} class="clip__body"/.test(lane) && /class:is-stereo=\{clip\.channels === 2\}/.test(lane));

// The org tab at the clip head is the Console strip's tab, value for value.
const stripTab = block(styleOf(strip), ".strip__tab");
const clipTab = block(laneStyle, ".clip__tab");
const tabValue = (css, prop) => css.match(new RegExp(`(?<![-\\w])${prop}:\\s*([^;]+);`))?.[1]?.trim();
check("the clip's org tab is the TrackStrip tab value for value: width .375rem, height 1rem, radius 1px, background-color var(--org) (D2.2.13)", ["width", "height", "border-radius", "background-color"].every((p) => tabValue(stripTab, p) !== undefined && tabValue(stripTab, p) === tabValue(clipTab, p)) && tabValue(clipTab, "background-color") === "var(--org)", ["width", "height", "border-radius", "background-color"].map((p) => `${p}: strip=${tabValue(stripTab, p)} clip=${tabValue(clipTab, p)}`).join(", "));
check("the org colour touches nothing but the tab: --org is set from orgToken() on the clip and read exactly once, by the tab", /style:--org=\{orgToken\(org\)\}/.test(lane) && (laneStyle.match(/var\(--org\)/g) ?? []).length === 1 && /import \{ SIMULATED, orgToken, type OrgSwatch \} from "\.\/channel-strip\/track-strip-fixtures"/.test(lane));
check("the lane prints no permanent text — no label component, no text nodes; the one tooltip is the clip's position (name · bars · mono/stereo; an imported stem's adds its length — Task 5.1)", !/EngravedLabel/.test(lane) && /title=\{clipTitle\(clip\)\}/.test(lane) && /return `\$\{name \|\| `Track \$\{code\}`\} · \$\{range\} · \$\{sides\}`;/.test(lane) && /if \(clip\.source === "audio" && clip\.seconds !== undefined\) return `\$\{name \|\| `Track \$\{code\}`\} · \$\{range\} · \$\{printSeconds\(clip\.seconds\)\} · \$\{sides\}`;/.test(lane) && stripComments(markupOf(lane)).replace(/<[^>]*>/g, "").replace(/\{[#:/][^}]*\}/g, "").trim() === "");

// --- 4. The tempo track. ------------------------------------------------------------------
const tempoEntries = [...lib.matchAll(/\{ bar: (\d+), bpm: (\d+)(, signature: TIME_SIGNATURE)? \}/g)].map((m) => ({ bar: +m[1], bpm: +m[2], signature: Boolean(m[3]) }));
const tempoRange = lib.match(/ARRANGE_TEMPO_RANGE = \{ min: (\d+), max: (\d+) \}/);
check("the tempo fixture has a few changes (3+ markers), bars ascending inside the 56-bar song, the first at bar 1 carrying the one time signature", tempoEntries.length >= 3 && tempoEntries[0].bar === 1 && tempoEntries[0].signature && tempoEntries.slice(1).every((e) => !e.signature) && tempoEntries.every((e, i) => e.bar <= 56 && (i === 0 || e.bar > tempoEntries[i - 1].bar)), JSON.stringify(tempoEntries));
check("every fixture tempo sits inside the trace range, with room above and below", tempoRange !== null && tempoEntries.every((e) => e.bpm > +tempoRange[1] && e.bpm < +tempoRange[2]), tempoRange ? `${tempoRange[1]}–${tempoRange[2]}` : "no range");
check("the tempo markers land on section starts of the approved structure fixture (a change begins a section)", (() => { const starts = []; let bar = 1; for (const m of data.matchAll(/barCount: (\d+)/g)) { starts.push(bar); bar += +m[1]; } return tempoEntries.every((e) => starts.includes(e.bar)); })());
check("the time signature is 4/4 with four beats per bar, exported once and printed once (beside the first marker only)", /export const BEATS_PER_BAR = 4;/.test(lib) && /export const TIME_SIGNATURE = "4\/4";/.test(lib) && /\{#if marker\.signature\}/.test(head) && (head.match(/marker\.signature/g) ?? []).length >= 2 && !/4\/4/.test(markupOf(head)));
check("the head prints each marker from the fixture — a flag line at its bar, 'NNN BPM' as engraved value print, bar and bpm on data attributes, a tooltip with the held tempo", /\{#each tempoMarkers as marker \(marker\.bar\)\}/.test(head) && /data-tempo-marker=\{marker\.bar\}/.test(head) && /data-tempo-bpm=\{marker\.bpm\}/.test(head) && /<EngravedLabel text=\{`\$\{marker\.bpm\} BPM`\} size="xs" kind="value" tone="normal" \/>/.test(head) && /\.tempo__flag \{[^}]*width:\s*1px;[^}]*height:\s*100%;[^}]*background-color:\s*var\(--al-material-cream\);/s.test(headStyle) && /title=\{tempoTitle\(marker\)\}/.test(head));
check("the held-tempo trace is the fixture's step path (held to the next marker, stepping at it), stroked in cream at constant width", /export function tempoTracePath\(/.test(lib) && /parts\.push\(index === 0 \? `M\$\{x\} \$\{y\(marker\.bpm\)\}` : `V\$\{y\(marker\.bpm\)\}`\);\s*parts\.push\(`H\$\{xEnd\}`\);/.test(lib) && /const trace = \$derived\(tempoTracePath\(tempoMarkers, barCount\)\);/.test(head) && /<path class="tempo__trace-path" d=\{trace\} vector-effect="non-scaling-stroke" \/>/.test(head) && /\.tempo__trace-path \{[^}]*stroke:\s*var\(--al-material-cream\);/s.test(headStyle));
check("the tempo track is a track like the lanes — the same work surface and bar grid — so markers read against the lines the clips sit on", /\.tempo \{[^}]*background-color:\s*var\(--al-material-surface\);/s.test(headStyle));
check("nothing edits, detects or analyses tempo: no input, button, handler, contenteditable or drag in the head; no tap-tempo/analysis code in the fixture lib", !/<input|<button|on[a-z]+=\{|on:[a-z]+|contenteditable|draggable|tabindex/.test(markupOf(head)) && !/tap|detect|analy[sz]|onset|autocorrel|AudioContext|AnalyserNode/i.test(stripComments(lib)));

// --- 5. The fixtures. ----------------------------------------------------------------------
// The approved track list derives its codes from the Console's TRACK_STRIPS ids (Task 2.5).
const trackCodes = [...stripFixtures.matchAll(/^\s*\{ id: "(\d\d)", name: /gm)].map((m) => m[1]);
const fixtures = [...lib.matchAll(/\{ trackCode: "(\d\d)", kind: "([a-z_]+)", channels: ([12]), level: ([\d.]+), clips: \[([^\]]*)\] \}/g)].map((m) => ({
  code: m[1],
  kind: m[2],
  channels: +m[3],
  level: +m[4],
  clips: [...m[5].matchAll(/\{ startBar: (\d+), barCount: (\d+) \}/g)].map((c) => ({ start: +c[1], bars: +c[2] })),
}));
const barCount = +(data.match(/ARRANGE_BAR_COUNT = (\d+)/)?.[1] ?? 0);
check("the approved track fixture is 20 tracks (the Console strip ids) of 56 bars, and arrange.ts is at its Task 2.7 state plus the Task 5.1 nullable role (NO_ROLE), nothing else", trackCodes.length === 20 && barCount === 56 && /code: strip\.id/.test(data) && sha("src/lib/arrange.ts") === "f7c85d6385270ef6c066403c18ceb351da51fc701378b49d913d213597995ff0" && /export const NO_ROLE: Role = \{ id: null, name: "\\u2014", long: "Not assigned yet" \};/.test(data) && /export function role\(id: RoleId \| null\): Role \{\s*if \(id === null\) return NO_ROLE;/.test(data), `${trackCodes.length} codes, ${barCount} bars`);
check("the timeline fixture covers every approved track exactly once, in order, with at least one clip each", fixtures.length === 20 && fixtures.map((f) => f.code).join() === trackCodes.join() && fixtures.every((f) => f.clips.length >= 1), `${fixtures.length} fixtures`);
check("every clip sits inside the song (bar 1 … 56) with a positive length; a track's clips are sorted and never overlap", fixtures.every((f) => f.clips.every((c, i) => c.start >= 1 && c.bars >= 1 && c.start + c.bars - 1 <= barCount && (i === 0 || c.start >= f.clips[i - 1].start + f.clips[i - 1].bars))));
check("the fixture is 53 clips in all — the count the Task 2.6 report documents", fixtures.reduce((n, f) => n + f.clips.length, 0) === 53, `${fixtures.reduce((n, f) => n + f.clips.length, 0)} clips`);
check("stereo halves only for stereo sources (owner, 2026-11-01): the keys, pad and riser are 2-channel, the close mics mono — both drawn", fixtures.filter((f) => f.channels === 2).map((f) => f.code).join() === "13,14,20" && fixtures.filter((f) => f.channels === 1).length === 17);
check("every drawing level is in (0, 1] and every kind is a known recipe of the generator", fixtures.every((f) => f.level > 0 && f.level <= 1) && fixtures.every((f) => new RegExp(`case "${f.kind}"`).test(lib)));
check("the generator is deterministic and local: a seeded hash, no Math.random, no clock, no fetch, no audio API, no storage", /function seeded\(seed: number\)/.test(lib) && /const rand = seeded\(seed\);/.test(lib) && !/Math\.random|Date\.now|performance\.now|fetch\(|XMLHttpRequest|AudioContext|AudioBuffer|decodeAudioData|getUserMedia|MediaRecorder|localStorage|sessionStorage|indexedDB/.test(lib));
check("clips are built once from the fixture (ARRANGE_CLIPS) and looked up per track by code; the room never computes a waveform itself", /export const ARRANGE_CLIPS: readonly ArrangeClip\[\] = ARRANGE_TIMELINE_FIXTURES\.flatMap\(buildClips\);/.test(lib) && /export function clipsOf\(trackCode: string\)/.test(lib) && !/wavePath|peakAt|clipPeaks/.test(room));
check("the wave geometry is one layout constant — a mono stem on the midline (centre 50, half 44), stereo halves at 26 and 74 (half 21, a seam between), peaks per beat 4", /PEAKS_PER_BEAT = 4;/.test(lib) && /mono: \[\{ centre: 50, half: 44 \}\]/.test(lib) && /stereo: \[\s*\{ centre: 26, half: 21 \},\s*\{ centre: 74, half: 21 \},?\s*\]/.test(lib));
check("the section fixture is derived from the approved structure markers (bars resolved from their spans), not retyped as a second list", /import \{ ARRANGE_BAR_COUNT, ARRANGE_STRUCTURE_MARKERS \} from "\.\/arrange";/.test(lib) && /return ARRANGE_STRUCTURE_MARKERS\.map\(\(marker\) => \{/.test(lib) && !/startBar:\s*\d+,\s*endBar:/.test(lib) && !/label:\s*"(Intro|Verse|Chorus)"/.test(lib));

// --- 6. Scope. -----------------------------------------------------------------------------
check("nothing in the timeline is interactive: no handlers, buttons, inputs, drag or focus in the lane or the head", !/<input|<button|<a |on[a-z]+=\{|on:[a-z]+|contenteditable|draggable|tabindex/.test(markupOf(lane) + markupOf(head)) && /aria-hidden="true"/.test(lane));
check("no screw heads in the timeline files (D2.1.9)", !/screw/i.test(room + head + lane + lib + devFixture));
check("no audio, playback, recording or persistence API anywhere in the timeline files", !/AudioContext|AudioBuffer|decodeAudioData|getUserMedia|MediaRecorder|HTMLAudioElement|<audio|localStorage|sessionStorage|indexedDB|requestAnimationFrame|setInterval/.test(room + head + lane + lib + devFixture));
const pinned = {
  "src/components/ArrangeTrackRow.svelte": "bf5a41e9459048695f05a6b56c4e5d271e5ddd0b1ab83696d3ac6025ddd21fd3",
  "src/dev/ArrangeRowFixture.svelte": "facc39b60df21345ee4671e5bbbaa8d961bb2fb94501ad4d6e265e1843b6c642",
  // (Task 2.7: ScribbleSelect gained the optional `onchoose` callback, TrackStrip the optional `identity` snippet, MixerRoom its strips, app.css two comments — re-pinned at that state.)
  "src/components/hardware/ScribbleSelect.svelte": "f0803769f208bca9bd18ff7b1982f9e918b8dde9597aae300879272657f4628a",
  "src/components/channel-strip/TrackStrip.svelte": "fbf545bd6b4039a4212bfbeb07eee0c91c69205d0754c4389b8acfd66fcb6ec5",
  "src/components/channel-strip/track-strip-fixtures.ts": "12620cb066dab631e521cf73bfedfef4ae7c2a72bb1b6fb84989742b89a68d46",
  "src/components/hardware/EngravedLabel.svelte": "230ebcd7cf810d3096953e5131cb9cb3a89dd83f9f0e9cc0bcd934d2ca74fc29",
  "src/lib/tokens.css": "10ae166bc9e73c265523fbf95f4ba39f7b9f8277573a81e36953295cf51345be",
  "src/app.css": "71bc0966dbdbad08d8fe32dab138024dd8da84fad4397fa5db850ef6140f46cc",
  "src/rooms/MixerRoom.svelte": "837061893411c069d3546f7f7ef7f9d0a837673d47249e28ecbe43108f058b61",
  "src/rooms/ConsoleRoom.svelte": "c937b69e2d4c6c2af5a0dba55e94f2fc7a2fd0ab439ca3d09337b9ad2fcde324",
};
for (const [rel, hash] of Object.entries(pinned)) {
  const actual = sha(rel);
  check(`approved file untouched: ${rel} — sha256 ${hash.slice(0, 16)}…`, actual === hash, `now ${actual.slice(0, 16)}…`);
}
check("the timeline components reach no shared component but EngravedLabel and the strip's org helper (no shared component modified); Task 5.1 adds two pure helpers (the lane's seconds print, the head's ruler numerals)", !/import .* from "\.\/hardware\/(?!EngravedLabel\.svelte)/.test(head + lane) && (lane.match(/^\s*import /gm) ?? []).length === 3 && /import \{ printSeconds \} from "\.\.\/lib\/audio\/import-rules";/.test(lane) && (head.match(/^\s*import /gm) ?? []).length === 4);
check("no dependency added or changed", !("dependencies" in pkg) && JSON.stringify(Object.keys(pkg.devDependencies).sort()) === JSON.stringify(["@sveltejs/vite-plugin-svelte", "@types/node", "svelte", "svelte-check", "typescript", "vite", "vite-plugin-singlefile"]));
check("the check is wired into package.json", pkg.scripts["check:arrange-timeline"] === "node scripts/check-arrange-timeline-structure.mjs");
check("the playground renders the timeline through ArrangeTimelineFixture in its own section — session, changes (scrolled to the tempo steps), narrow and compact blocks", /import ArrangeTimelineFixture, \{ type ArrangeTimelineFixtureConfig \} from "\.\/ArrangeTimelineFixture\.svelte"/.test(devPage) && /data-dev-component="arrange-timeline"/.test(devPage) && /<ArrangeTimelineFixture \{config\} \/>/.test(devPage) && ["session", "changes", "narrow", "compact"].every((id) => new RegExp(`id: "${id}"`).test(devPage)) && /scrollToBar: 36/.test(devPage) && /ArrangeTimelineHeader/.test(devFixture) && /ArrangeTimelineLane/.test(devFixture) && /ArrangeTrackRow/.test(devFixture));

// --- report -----------------------------------------------------------------
for (const name of passes) console.log(`  PASS  ${name}`);
if (failures.length > 0) {
  console.error("");
  for (const failure of failures) console.error(`  FAIL  ${failure}`);
  console.error("");
  console.error(`Arrange timeline structural contract check — ${passes.length}/${passes.length + failures.length} passed`);
  process.exit(1);
}
console.log(`Arrange timeline structural contract check — ${passes.length}/${passes.length} passed`);
console.log("Structural contract intact. This check does not measure pixels; the Playwright measurement confirms the ruler, lanes and clips line up in a real browser.");
