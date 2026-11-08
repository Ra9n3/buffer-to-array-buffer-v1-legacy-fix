#!/usr/bin/env node
/**
 * Console channel strip structural contract check — Task 2.2.
 *
 * Dependency-free guard (Node built-ins only). It does NOT test geometry: the
 * strip's fixed width, the bank's scrolling, the pinned area and the room's
 * vertical scroll were measured in a real browser at 1920×1080, 1280×900,
 * 1024×768, 768×1024 and 360×780 (see task-reports/2.2-report.md). What it
 * tests is the source-level contract:
 *
 *   1. One reusable TrackStrip, rendered once per fixture track by the
 *      ChannelBank; twenty tracks; the pinned Bus / Returns area renders the
 *      Task 2.4 strips (one ReturnStrip per fixture return, then the
 *      BusMasterStrip) — never a TrackStrip and no longer the Phase 0
 *      ChannelStrip placeholder, which stays in the tree untouched and
 *      unused (check:bus-return pins the pinned strips themselves).
 *   2. The strip is COMPOSED of the approved Phase 1 components — Knob for
 *      trim, pan and each send slot, Fader for the level, TactileSwitch for
 *      mute and solo, Lamp for peak, EngravedLabel for every legend — and
 *      draws no control of its own. Family and colour choices are the ones
 *      the spec and the owner fixed (D2.2.3 / D2.2.4). The send slots
 *      (D2.2.9) are two fixed positions, each a scribble-window menu button
 *      over a green Knob; assignment and level are strip-local UI state
 *      seeded from the fixture, never shared or persisted.
 *   3. The owner's geometry rules (D2.2.1) are in the source: a fixed strip
 *      width inside 150–165 px that never shrinks; the approved component
 *      sizes (40 px knobs, 1× fader at 160 px travel, 1× switches); no
 *      down-scaling of any approved component for narrow viewports.
 *   4. Fixture honesty: every value is a typed-in number from one fixture
 *      file that says so; the DOM is marked `data-simulated`; nothing
 *      references audio, metering, timers, randomness or shared state; the
 *      fixtures vary (off and non-zero sends, lit and unlit lamps, every
 *      organisational swatch in use).
 *   5. Materials are tokens: no hex colour literal in any strip file; the
 *      organisational colour is the small tab, never a strip-wide fill.
 *   6. The bank: a bridge-matching housing, the tracks region is the only
 *      horizontal scroller in row mode, the pinned aside sits outside it in
 *      the deck grid's second column, and under 68.75rem (1100 px) the deck
 *      stacks — the pinned rail under the tracks, scrolling on its own
 *      (Task 2.4, D2.4.2: Phase 0's column mode with its threshold raised).
 *   7. Scope: no screw heads (D2.1.9); no instrument combobox or Prominence
 *      Tier control in the Console; the approved bridge and the Phase 0
 *      ChannelStrip are untouched; no dependency added or changed.
 *
 * Run: npm run check:channel-strip
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
const templateOf = (svelte) => svelte.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style>[\s\S]*<\/style>/, "");
const styleOf = (svelte) => svelte.match(/<style>([\s\S]*)<\/style>/)?.[1] ?? "";
const rule = (css, selector) => {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) return "";
  return css.slice(start, css.indexOf("}", start));
};

const strip = read("src/components/channel-strip/TrackStrip.svelte");
const sendSlot = read("src/components/channel-strip/SendSlot.svelte");
const bank = read("src/components/ChannelBank.svelte");
const fixtures = read("src/components/channel-strip/track-strip-fixtures.ts");
const session = read("src/lib/project/session.ts"); // Task 3.1: seeds the project from the fixtures
const consoleRoom = read("src/rooms/ConsoleRoom.svelte");
const placeholder = read("src/components/ChannelStrip.svelte");
const pkg = JSON.parse(read("package.json"));

const stripTemplate = templateOf(strip);
const stripStyle = styleOf(strip);
const slotTemplate = templateOf(sendSlot);
const slotStyle = styleOf(sendSlot);
const bankTemplate = templateOf(bank);
const bankStyle = styleOf(bank);
const allStripSource = [strip, sendSlot, bank, fixtures].join("\n");

// --- 1. One strip, twenty tracks, pinned placeholders untouched. -------------
check("TrackStrip.svelte exists under components/channel-strip", exists("src/components/channel-strip/TrackStrip.svelte"));
// Task 3.1: the bank reads the one project store (tracks, Returns, buses) and binds
// each strip to the store's view of its entity; the fixture arrays seed the store
// (lib/project/session.ts) and are no longer read by the bank.
check("the bank imports the TrackStrip and the project store's views (Task 3.1)", /import TrackStrip from "\.\/channel-strip\/TrackStrip\.svelte"/.test(bank) && /import \{ busLive, busStripOf, project, returnLive, returnStripOf, trackStrip \} from "\.\.\/lib\/project\/store\.svelte"/.test(bank) && !/TRACK_STRIPS|RETURN_STRIPS|BUS_MASTERS/.test(bank));
check("the bank renders one TrackStrip per project track, keyed by the track's stable id, bound to the store's strip view", /\{#each tracks as track \(track\.id\)\}\s*<TrackStrip track=\{trackStrip\(track\.id\)\} \/>/.test(bankTemplate) && /const tracks = \$derived\(project\.tracks\);/.test(bank));
check("the TrackStrip is rendered exactly once in the bank's template", count(bankTemplate, /<TrackStrip\b/g) === 1);
{
  const rows = fixtures.match(/^\s*\{ id: "\d\d", name: "[^"]+", type: "TRK"/gm) ?? [];
  check("the fixture file holds exactly twenty regular tracks, 01…20", rows.length === 20 && rows[0].includes('"01"') && rows[19].includes('"20"'), `${rows.length} rows`);
  const ids = (fixtures.match(/\{ id: "(\d\d)"/g) ?? []).map((m) => m.slice(7, 9));
  check("track ids are unique and sequential", ids.join(",") === Array.from({ length: 20 }, (_, i) => String(i + 1).padStart(2, "0")).join(","));
}
check("the strip is a list item that names itself by its track name (role=group, aria-labelledby)", /<li\s+class="strip"\s+role="group"\s+aria-labelledby=\{`\$\{uid\}-name`\}/.test(stripTemplate) && /id=\{`\$\{uid\}-name`\} text=\{track\.name\}/.test(stripTemplate));
/* Task 9.4 (owner): trim and pan share one row, so the strip has 8 hooks —
   the added one is the row that holds the pair. Each control keeps its own
   hook, which is what the count is really protecting. */
check("the strip carries its hooks: data-track-strip, data-track-org, data-simulated, data-strip-section", /data-track-strip=\{track\.code\}/.test(stripTemplate) && /data-track-org=/.test(stripTemplate) && /data-simulated=\{SIMULATED\}/.test(stripTemplate) && count(stripTemplate, /data-strip-section="/g) === 8);
// Task 2.7: one OPTIONAL section, `identity`, sits between the head and TRIM —
// rendered only when a room passes the `identity` snippet (the Mixer does, the
// Console does not), so the Console strip is still the six approved sections.
/* Task 9.4: trim and pan sit on one shared row, so the sequence reads
   head, identity, dials, trim, pan, sends, fader, switches. The assertion is
   the same intent — trim before pan, both before the sends, the level, the
   switches — expressed over the one row that now contains the pair. */
check("the sections are head, dials (trim then pan), sends, fader, switches — in that order, with the optional Task 2.7 identity section between head and trim", (stripTemplate.match(/data-strip-section="([a-z]+)"/g) ?? []).map((m) => m.slice(20, -1)).join(",") === "head,identity,dials,trim,pan,sends,fader,switches" && stripTemplate.indexOf('data-strip-section="trim"') < stripTemplate.indexOf('data-strip-section="pan"') && stripTemplate.indexOf('data-strip-section="pan"') < stripTemplate.indexOf('data-strip-section="sends"'));
check("the identity section is optional: guarded by {#if identity}, rendering the snippet and nothing else; the Console bank passes none", /\{#if identity\}\s*(<!--[\s\S]*?-->\s*)?<div class="strip__section strip__section--identity" data-strip-section="identity">\s*\{@render identity\(\)\}\s*<\/div>\s*\{\/if\}/.test(stripTemplate) && /<TrackStrip track=\{trackStrip\(track\.id\)\} \/>/.test(bankTemplate) && !/identity/.test(bank));
check("the pinned area renders the Task 2.4 strips: one ReturnStrip per fixture return, then the BusMasterStrip (the bus master farthest right, 0.3)", /<aside[\s\S]*\{#each returns as ret \(ret\.id\)\}\s*<ReturnStrip ret=\{returnStripOf\(ret\.id\)\} live=\{returnLive\(ret\.id\)\} \/>\s*\{\/each\}\s*\{#each buses as bus \(bus\.id\)\}\s*<BusMasterStrip bus=\{busStripOf\(bus\.id\)\} live=\{busLive\(bus\.id\)\} \/>\s*\{\/each\}/.test(bankTemplate) && count(bankTemplate, /<ReturnStrip\b/g) === 1 && count(bankTemplate, /<BusMasterStrip\b/g) === 1);
check("the bank no longer renders or imports the Phase 0 ChannelStrip placeholder", !/ChannelStrip\b/.test(bank));
check("ChannelStrip.svelte (the placeholder) is untouched: no tokens, no hardware imports, Phase 0 width", !/var\(--al-|hardware\//.test(placeholder) && /flex: 0 0 6rem/.test(placeholder));
check("no TrackStrip is rendered in the pinned area (the <aside>)", !/<aside[\s\S]*<TrackStrip/.test(bankTemplate));

// --- 2. Composed of the approved components. ---------------------------------
for (const name of ["EngravedLabel", "Fader", "Knob", "Lamp", "TactileSwitch"]) {
  check(`the strip imports the approved ${name}`, new RegExp(`import ${name} from "\\.\\./hardware/${name}\\.svelte"`).test(strip));
}
check("the strip draws no control of its own: no <svg>, <canvas>, <input> or <button>", !/<svg|<canvas|<input|<button/.test(stripTemplate));
check("the bank draws nothing of its own either", !/<svg|<canvas|<input|<button/.test(bankTemplate));
check("two knobs in the strip itself: trim and pan", count(stripTemplate, /<Knob\b/g) === 2 && /label="Trim"/.test(stripTemplate) && /label="Pan"/.test(stripTemplate));
check("TRIM is the cream family (spec §5: trim and gain staging)", /label="Trim"\s+family="cream"/.test(stripTemplate));
check("PAN is the blue-grey family (spec §5: pan and placement) with L / R extremes", /label="Pan"\s+family="bluegrey"/.test(stripTemplate) && /extremes=\{\["L", "R"\]\}/.test(stripTemplate));
check("the trim and pan knobs use the fixture ranges and formatters, not literals", /min=\{TRIM_RANGE\.min\}/.test(stripTemplate) && /min=\{PAN_RANGE\.min\}/.test(stripTemplate) && /format=\{formatPan\}/.test(stripTemplate) && /format=\{trimFormat\}/.test(stripTemplate));

// --- 2b. Configurable send slots (D2.2.9). ------------------------------------
check("SendSlot.svelte exists and the strip imports it; the strip's live type (strip-live.ts) carries the slots", exists("src/components/channel-strip/SendSlot.svelte") && /import SendSlot from "\.\/SendSlot\.svelte"/.test(strip) && /import type \{ TrackStripLive \} from "\.\/strip-live";/.test(strip) && /export interface SendSlotLive \{/.test(read("src/components/channel-strip/strip-live.ts")));
check("the fixture fixes two slot positions per strip (owner: two, side by side)", /export const SEND_SLOT_COUNT = 2;/.test(fixtures));
// Task 3.1: the slots are seeded once into the project (session.ts) from the fixture's
// sends — SEND_SLOT_COUNT per track, the rest unassigned at OFF — and the strip renders
// its model's slots (`track.sends`), each handed to a SendSlot that writes it.
// Task 3.2: every slot also carries its Auto / Manual ownership (plan §5), seeded Auto.
check("the session seeds SEND_SLOT_COUNT slots per track from the fixture's sends, the rest unassigned at OFF (Task 3.1); every slot starts Auto (Task 3.2)", /Array\.from\(\{ length: SEND_SLOT_COUNT \}/.test(session) && /send \? \{ to: returnBusId\(send\.to\), level: send\.level, mode: "auto" \} : \{ to: null, level: SEND_RANGE\.min, mode: "auto" \}/.test(session) && !/Array\.from\(\{ length: SEND_SLOT_COUNT \}/.test(strip));
check("the slots are the strip's model's (`track.sends`), one SendSlot each, written in place — the strip holds no slot state of its own", /\{#each track\.sends as slot, i \(i\)\}\s*<SendSlot/.test(stripTemplate) && /\{slot\}/.test(stripTemplate) && !/let slots/.test(strip) && !/\$state/.test(strip));
check("the slots sit together in the one labelled bay and nowhere else", /<div class="strip__bay" role="group" aria-label=\{`Sends, \$\{track\.name\}`\}>\s*\{#each track\.sends/.test(stripTemplate) && count(stripTemplate, /<SendSlot\b/g) === 1);
check("each slot tells the other which return it feeds (no double assignment)", /taken=\{takenBy\(i\)\}/.test(stripTemplate) && /track\.sends\.find\(\(_, j\) => j !== i\)\?\.to \?\? null/.test(strip));
check("the slot's knob is the approved Knob, green family, legend Send n, OFF / +6 extremes, fixture range", /import Knob from "\.\.\/hardware\/Knob\.svelte"/.test(sendSlot) && /<Knob\s+label=\{legend\}\s+family="green"/.test(slotTemplate) && /min=\{SEND_RANGE\.min\}/.test(slotTemplate) && /extremes=\{\["OFF", "\+6"\]\}/.test(slotTemplate) && /format=\{formatSend\}/.test(slotTemplate) && /const legend = \$derived\(`Send \$\{index\}`\)/.test(sendSlot));
check("the knob is bound to the slot's level and disabled while the slot is unassigned", /bind:value=\{slot\.level\}/.test(slotTemplate) && /disabled=\{assigned === null\}/.test(slotTemplate));
check("an unassigned slot prints SEND; an assigned one prints the return's short name", /assigned \? assigned\.short : "SEND"/.test(sendSlot));
check("the send label is a menu button (aria-haspopup, aria-expanded, data-send-label)", /<button\s+type="button"\s+class="slot__window"[\s\S]*?aria-haspopup="menu"[\s\S]*?aria-expanded=\{open\}[\s\S]*?data-send-label/.test(slotTemplate));
check("the menu lists every Return it is given (the project's; the fixture list by default) as a menuitemradio and offers Remove only when assigned", /\{#each returns as ret \(ret\.id\)\}/.test(slotTemplate) && /returns = EFFECT_RETURNS,/.test(sendSlot) && /returns=\{track\.returns\}/.test(stripTemplate) && /role="menuitemradio"\s+aria-checked=\{current\}/.test(slotTemplate) && /\{#if assigned\}\s*<button[^>]*data-send-remove/.test(slotTemplate) && /role="menu"/.test(slotTemplate));
check("a return already fed by the other slot is offered disabled", /disabled=\{unavailable\}/.test(slotTemplate) && /const unavailable = ret\.id === taken/.test(slotTemplate));
check("assigning takes the fixture's level for that return or the default; removing returns the slot to OFF", /fixtureLevels\[returnId\] \?\? DEFAULT_SEND_LEVEL/.test(sendSlot) && /slot\.to = null;\s*slot\.level = SEND_RANGE\.min;/.test(sendSlot));
check("the menu closes on Escape (focus back to the label), on Tab and on a press outside", /event\.key === "Escape"/.test(sendSlot) && /windowEl\?\.focus\(\)/.test(sendSlot) && /event\.key === "Tab"/.test(sendSlot) && /<svelte:document onpointerdown=\{onDocumentPointerDown\} \/>/.test(slotTemplate) && /!rootEl\.contains\(event\.target as Node\)/.test(sendSlot));
check("the menu is absolutely positioned above later content and spans the bay (never outside the strip)", /\.slot__menu \{[^}]*position:\s*absolute/s.test(slotStyle) && /\.slot__menu \{[^}]*z-index:\s*[1-9]/s.test(slotStyle) && /style:left=\{menuLeft\}/.test(slotTemplate) && /style:width=\{menuWidth\}/.test(slotTemplate) && /\$\{count\} \* 100%/.test(sendSlot));
check("the slot draws no control of its own (no svg, canvas or input)", !/<svg|<canvas|<input/.test(slotTemplate));
check("the slot carries its hooks: data-send-slot, data-send-state, data-send-to, data-send-menu, data-send-option", /data-send-slot=\{index\}/.test(slotTemplate) && /data-send-state=\{slotState\}/.test(slotTemplate) && /data-send-to=\{slot\.to \?\? ""\}/.test(slotTemplate) && /data-send-menu/.test(slotTemplate) && /data-send-option=\{ret\.id\}/.test(slotTemplate));
check("the slot's state type is two fields only: the Return's id (or null) and a level — id-agnostic since Task 3.1 (the project's kind-prefixed Return ids)", /export interface SlotState \{\s*(\/\*\*[^*]*\*\/\s*)?to: string \| null;\s*level: number;\s*\}/.test(sendSlot) && !/ReturnId/.test(sendSlot));
check("the slot does not override the approved Knob's internals", !/:global|\.knob/.test(slotStyle));

/* Task 9.4: the throw is passed explicitly. The Fader's own 1× default is
   still 160 px (check-fader pins it); the strip asks for the shorter 110 px
   throw so a whole module fits a 1080p window's channel area (D9.4.1). */
check("one fader, labelled Level, at its approved defaults (console taper, 110 travel, −60…+10 dB)", count(stripTemplate, /<Fader\b/g) === 1 && /<Fader label="Level" travel=\{110\} bind:value=\{\(\) => track\.level, \(v\) => \(track\.level = v\)\} \/>/.test(stripTemplate));
check("two panel-labelled switches: Mute (red lamp) and Solo (amber lamp), named per track", /<TactileSwitch variant="panel" label="Mute" lamp="red" bind:engaged=\{\(\) => track\.mute, \(on\) => \(track\.mute = on\)\} name=\{`Mute \$\{track\.name\}`\} \/>/.test(stripTemplate) && /<TactileSwitch variant="panel" label="Solo" lamp="amber" bind:engaged=\{\(\) => track\.solo, \(on\) => \(track\.solo = on\)\} name=\{`Solo \$\{track\.name\}`\} \/>/.test(stripTemplate) && count(stripTemplate, /<TactileSwitch\b/g) === 2);
check("one red peak lamp, named per track", count(stripTemplate, /<Lamp\b/g) === 1 && /<Lamp lit=\{track\.peak\} color="red" name=\{`Peak, \$\{track\.name\}`\} \/>/.test(stripTemplate));
check("the footer order is mute, solo, peak", /label="Mute"[\s\S]*label="Solo"[\s\S]*data-strip-peak/.test(stripTemplate));
check("every legend is an EngravedLabel: number, type, name, peak", count(stripTemplate, /<EngravedLabel\b/g) === 4 && /text=\{track\.code\}/.test(stripTemplate) && /text=\{track\.type\}/.test(stripTemplate) && /text="Peak"/.test(stripTemplate));
check("the strip has no raw text print of its own (every word goes through EngravedLabel or a component label)", !/>\s*[A-Za-z][A-Za-z ]+\s*</.test(stripTemplate.replace(/<!--[\s\S]*?-->/g, "")));
check("the track name is engraved (kind=value) and truncates rather than wraps", /text=\{track\.name\} size="sm" kind="value" truncate/.test(stripTemplate));

// --- 3. The owner's geometry rules (D2.2.1). ---------------------------------
{
  const host = rule(stripStyle, ".strip");
  const width = host.match(/--strip-width:\s*([\d.]+)rem/)?.[1];
  const px = width ? Number(width) * 16 : 0;
  check("the strip declares one fixed width inside the owner's 150–165 px band", px >= 150 && px <= 165, `${px}px`);
  check("the strip never shrinks: flex 0 0, min- and max-width all the same variable", /flex:\s*0 0 var\(--strip-width\)/.test(host) && /min-width:\s*var\(--strip-width\)/.test(host) && /max-width:\s*var\(--strip-width\)/.test(host) && /\swidth:\s*var\(--strip-width\)/.test(host));
  check("knobs are placed at 2.5rem (40 px) through the owner-approved --knob-size", /--knob-size:\s*2\.5rem/.test(host));
  check("the fader keeps its approved 1x width (4.5rem) and the switch its 1x size (1.75rem)", /--fader-width:\s*4\.5rem/.test(host) && /--switch-size:\s*1\.75rem/.test(host));
  check("the peak lamp is 0.75rem glass", /--lamp-size:\s*0\.75rem/.test(host));
}
check("nothing in the strip or bank scales a component down for narrow viewports", !/@media[^{]*\{[^@]*(--knob-size|--fader-width|--switch-size|--strip-width|transform:\s*scale|zoom:)/s.test(stripStyle + bankStyle));
check("the strip uses no @container or @media query at all (a physical module has one size)", !/@container|@media/.test(stripStyle));
check("the strip does not override the approved components' internals (no :global, no .knob/.fader/.switch/.lamp selectors)", !/:global|\.knob|\.fader|\.switch|\.lamp\b|\.label\b/.test(stripStyle));
check("the bank does not override the approved components' internals either", !/:global|\.knob|\.fader|\.switch|\.lamp\b|\.label\b|\.strip\b/.test(bankStyle));

// --- 4. Fixture honesty; nothing wired. --------------------------------------
check("the fixture file declares itself SIMULATED in its header", /SIMULATED fixture data/.test(fixtures.slice(0, 600)));
check('the fixture file exports SIMULATED = "simulated"', /export const SIMULATED = "simulated" as const/.test(fixtures));
check("bank and strip roots carry data-simulated", /data-channel-bank data-simulated=\{SIMULATED\}/.test(bankTemplate) && /data-simulated=\{SIMULATED\}/.test(stripTemplate));
check("the strip's props are its live model (TrackStripLive — the store's view, or a plain seeded object) and the optional identity snippet only (Tasks 2.7, 3.1)", /let \{ track, identity \}: \{ track: TrackStripLive; identity\?: Snippet \} = \$props\(\);/.test(strip));
check(
  "no audio, metering, timers, randomness, stores or shared state in any strip file (local UI state only)",
  !/AudioContext|Analyser|AudioBuffer|requestAnimationFrame|setInterval|setTimeout|Math\.random|performance\.now|Date\.now|lib\/mixer|lib\/arrange|lib\/rooms|localStorage|sessionStorage|fetch\(|svelte\/store|writable\(|readable\(|getContext|setContext|onToggle|\$effect/.test(allStripSource),
);
check("the only $state in the strip files is the slot's own menu/element refs — the strip holds none (its model owns every value; Task 3.1)", count(strip, /\$state\(/g) === 0 && count(sendSlot, /\$state\(/g) === 4 && !/\$state/.test(fixtures + bank));
check("the fixtures vary: tracks with no send, one send and two sends, to every return", count(fixtures, /sends: \[\]/g) >= 3 && count(fixtures, /sends: \[\{ to: "[a-z0-9]+", level: -\d+ \}\]/g) >= 3 && count(fixtures, /sends: \[\{ to: "[a-z0-9]+", level: -\d+ \}, \{ to: "[a-z0-9]+", level: -\d+ \}\]/g) >= 3 && /to: "room"/.test(fixtures) && /to: "plate"/.test(fixtures) && /to: "delay1"/.test(fixtures));
check("no fixture track exceeds the slot count or names an unknown return", (fixtures.match(/sends: \[[^\]]*\]/g) ?? []).every((m) => count(m, /\{ to:/g) <= 2 && !/to: "(?!room|plate|delay1)/.test(m)));
check("the effect returns are a typed fixture list: Room Reverb, Plate Reverb, Delay 1, with short prints", /export type ReturnId = "room" \| "plate" \| "delay1";/.test(fixtures) && /\{ id: "room", name: "Room Reverb", short: "ROOM" \}/.test(fixtures) && /\{ id: "plate", name: "Plate Reverb", short: "PLATE" \}/.test(fixtures) && /\{ id: "delay1", name: "Delay 1", short: "DELAY 1" \}/.test(fixtures));
check("a default level exists for a return assigned in the UI without a fixture level", /export const DEFAULT_SEND_LEVEL = -\d+;/.test(fixtures));
check("the fixtures vary: mute, solo and peak each lit on at least one track and unlit on others", /mute: true/.test(fixtures) && /mute: false/.test(fixtures) && /solo: true/.test(fixtures) && /solo: false/.test(fixtures) && /peak: true/.test(fixtures) && /peak: false/.test(fixtures));
check("the fixtures vary: pans left, centre and right; trims above and below unity", /pan: -\d+/.test(fixtures) && /pan: 0,/.test(fixtures) && /pan: [1-9]\d*/.test(fixtures) && /trim: -\d/.test(fixtures) && /trim: [1-9]/.test(fixtures));
check("the fixtures use several organisational swatches and the neutral one", new Set(fixtures.match(/org: (\d|"neutral")/g) ?? []).size >= 5 && /org: "neutral"/.test(fixtures));
check("the send range's minimum reads OFF", /SEND_RANGE = \{ min: -60/.test(fixtures) && /value <= SEND_RANGE\.min[\s\S]*?"OFF"/.test(fixtures));
{
  const formatPan = fixtures.slice(fixtures.indexOf("export function formatPan"), fixtures.indexOf("export function formatSend"));
  check("pan formats as L n / C / R n", /return "C"/.test(formatPan) && /"L"/.test(formatPan) && /"R"/.test(formatPan) && /Math\.abs\(value\)/.test(formatPan));
}

// --- 5. Materials are tokens; the org colour is a tab. -----------------------
check("no hex colour literal in the strip, slot, bank or fixtures", !/#[0-9a-f]{3,8}\b/i.test(stripStyle + slotStyle + bankStyle + fixtures.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")));
check("the strip's face is the panel token", /\.strip__face \{[^}]*background-color:\s*var\(--al-material-panel\)/s.test(stripStyle));
check("the org colour is applied only to the tab, via the --org variable", /style:--org=\{orgToken\(track\.org\)\}/.test(stripTemplate) && count(stripStyle, /var\(--org\)/g) === 1 && /\.strip__tab \{[^}]*background-color:\s*var\(--org\)/s.test(stripStyle));
check("the org tab is small (under 0.5rem wide, 1rem tall) and sits beside the name", /\.strip__tab \{[^}]*width:\s*0\.(25|3125|375|4375)rem/s.test(stripStyle) && /\.strip__tab \{[^}]*height:\s*1rem/s.test(stripStyle) && /<span\s+class="strip__tab"[\s\S]*?<\/span>\s*<EngravedLabel id=\{`\$\{uid\}-name`\}/.test(stripTemplate));
check("the org tab is decorative (aria-hidden) — the name carries the identity", /class="strip__tab"[\s\S]*?aria-hidden="true"/.test(stripTemplate));
check("orgToken maps swatch n to --al-org-n and neutral to --al-org-neutral", /`var\(--al-org-\$\{swatch\}\)`/.test(fixtures) && /export type OrgSwatch = 1 \| 2 \| 3 \| 4 \| 5 \| 6 \| 7 \| 8 \| "neutral"/.test(fixtures));
check("spacing comes from the spacing tokens", count(stripStyle + slotStyle + bankStyle, /var\(--al-space-/g) >= 20);
check("the slot's greens are the green function tokens", /var\(--al-function-green-hi\)/.test(slotStyle) && !/--al-function-(amber|red|orange|cream|bluegrey)/.test(slotStyle));

// --- 6. The bank. --------------------------------------------------------------
check("the bank renders the zone's h2 legend with the id ConsoleRoom points at", /<EngravedLabel as="h2" id="console-channels-title" text="Channel bank" size="sm" \/>/.test(bankTemplate) && /aria-labelledby="console-channels-title"/.test(consoleRoom));
check("the bank is a bridge-matching housing: two walnut cheeks round a deck", count(bankTemplate, /class="bank__cheek bank__cheek--(left|right)" aria-hidden="true"/g) === 2 && /grid-template-columns:\s*var\(--b-cheek\) minmax\(0, 1fr\) var\(--b-cheek\)/.test(bankStyle) && /--b-wood:\s*var\(--al-material-wood\)/.test(bankStyle));
check("the bank's deck is the panel token with the bridge's trim line", /\.bank__deck \{[^}]*background-color:\s*var\(--al-material-panel\)/s.test(bankStyle) && /var\(--b-trim\) 1px, var\(--b-trim\) 2px/.test(bankStyle));
{
  const tracks = rule(bankStyle, ".bank__tracks");
  check("the tracks region is the only horizontal scroller in the bank's row layout", /overflow-x:\s*auto/.test(tracks) && /overflow-y:\s*hidden/.test(tracks) && /overscroll-behavior-x:\s*contain/.test(tracks) && count(bankStyle.replace(/@media[\s\S]*$/, ""), /overflow-x:\s*auto/g) === 1);
  check("the rail is a flex row sized by its content (max-content), never shrinking its strips", /\.bank__rail \{[^}]*display:\s*flex/s.test(bankStyle) && /\.bank__rail \{[^}]*width:\s*max-content/s.test(bankStyle));
  check("the tracks region is keyboard reachable and named", /data-channel-bank-tracks\s+role="region"\s+tabindex="0"\s+aria-label=/.test(bankTemplate) && /\.bank__tracks:focus-visible/.test(bankStyle));
}
check("the pinned aside sits outside the scroller, after it, in the deck grid's own column (grid-area pinned, sized by its content)", /<\/div>\s*(<!--[\s\S]*?-->\s*)?<aside\s+class="bank__pinned"\s+data-channel-bank-pinned/.test(bankTemplate) && /\.bank__pinned \{[^}]*grid-area:\s*pinned/s.test(bankStyle) && /\.bank__deck \{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto/s.test(bankStyle) && /"legend pinned-legend"\s*"tracks pinned"/.test(bankStyle));
check("the pinned aside keeps its hook, name and an engraved Bus / Returns legend over it", /aria-label="Pinned bus and Return channels"/.test(bankTemplate) && /<EngravedLabel as="p" text="Bus \/ Returns" size="xs" \/>/.test(bankTemplate) && /\.bank__pinned-legend \{[^}]*grid-area:\s*pinned-legend/s.test(bankStyle));
check("the pinned row is the track rail's row: flex, the rail's gap, content-sized, modules stretching to one another", /\.bank__pinned-row \{[^}]*display:\s*flex/s.test(bankStyle) && /\.bank__pinned-row \{[^}]*gap:\s*var\(--al-space-2xs\)/s.test(bankStyle) && /\.bank__pinned-row \{[^}]*width:\s*max-content/s.test(bankStyle) && /\.bank__pinned-row \{[^}]*align-items:\s*stretch/s.test(bankStyle) && /\.bank__rail \{[^}]*gap:\s*var\(--al-space-2xs\)/s.test(bankStyle));
check("the pinned rail and the track rail are one recess recipe, and the track strips did not move: the pinned legend shares the header row", /\.bank__tracks,\s*\.bank__pinned \{/.test(bankStyle) && /<header class="bank__legend">\s*<EngravedLabel as="h2" id="console-channels-title" text="Channel bank" size="sm" \/>\s*<EngravedLabel text=\{`Tracks \$\{first\}\\u2013\$\{last\}`\} size="xs" tone="muted" \/>\s*<\/header>/.test(bankTemplate));
check("column mode under 68.75rem (1100 px, D2.4.2): the deck stacks legend / tracks / pinned legend / pinned, and only then the pinned rail scrolls on its own", /@media \(width < 68\.75rem\) \{[\s\S]*\.bank__deck \{[^}]*"legend"\s*"tracks"\s*"pinned-legend"\s*"pinned"/s.test(bankStyle) && /@media \(width < 68\.75rem\) \{[\s\S]*\.bank__pinned \{[^}]*overflow-x:\s*auto/s.test(bankStyle) && !/40rem/.test(bankStyle));
check("the bank keeps its Phase 0 hooks", /data-channel-bank\b/.test(bankTemplate) && /data-channel-bank-tracks/.test(bankTemplate) && /data-channel-bank-pinned/.test(bankTemplate));
check("the Phase 0 fluid grid (--visible-track-count) is gone", !/visible-track-count|grid-auto-columns/.test(bankStyle));
check("the bank sets no height of its own: the room's grid row and the strips size it", !/\sheight:\s*100%/.test(bankStyle) && !/max-height/.test(bankStyle));

// --- 7. Scope. -----------------------------------------------------------------
check("no screw heads in any strip file (owner's standing rule, D2.1.9)", !/(class=["'{][^"'}]*screw|\.[\w-]*screw[\w-]*\s*[{,:]|data-[\w-]*screw|__screw)/i.test(allStripSource));
check("no instrument combobox or Prominence Tier control in the Console (plan §3)", !/combobox|<select|Prominence|prominence|tier/i.test(allStripSource + consoleRoom));
check("the strip and bank do not import the bridge or its fixtures", !/meter-bridge\//.test(strip + bank));
check("the strip and slot do not import the Phase 0 placeholder or the mixer/arrange fixtures", !/ChannelStrip\.svelte|MixerChannelStrip|lib\/mixer|lib\/arrange/.test(strip + sendSlot));
check("the bank imports the pinned strips from the channel-strip folder (Task 2.4) and reads their entities from the store (Task 3.1)", /import BusMasterStrip from "\.\/channel-strip\/BusMasterStrip\.svelte"/.test(bank) && /import ReturnStrip from "\.\/channel-strip\/ReturnStrip\.svelte"/.test(bank) && /const returns = \$derived\(project\.returns\);/.test(bank) && /const buses = \$derived\(project\.buses\);/.test(bank));
check("no instrument combobox: the send menu is a menu, not a combobox or select", !/combobox|<select|<datalist/.test(sendSlot));
/* Task 9.4 (owner, D9.4.1) reverses D2.3.1: the Console's own transport zone
   is gone, because the persistent shared strip already carries every transport
   control in every room and the deck's 210 px were being paid for out of the
   bank's height. The zone order that remains is bridge over bank, which is what
   this assertion has always been protecting — now with the absence of a
   transport zone asserted explicitly rather than merely implied. */
check("ConsoleRoom keeps the bridge over the bank with no transport zone between them (Task 9.4), and no Phase 0 bank frame", (consoleRoom.match(/data-console-zone="([a-z-]+)"/g) ?? []).join(",") === 'data-console-zone="meter-bridge",data-console-zone="channel-bank"' && !/console-zone--transport|data-console-zone="transport"/.test(consoleRoom) && !/console-bank\b|console-zone__header/.test(consoleRoom));
check("the approved bridge is byte-identical to Task 2.1's approved file", sha256(read("src/components/meter-bridge/ConsoleMeterBridge.svelte")) === "1c96844f79fd0e0a6ba630d6f6b6ba436e3a1cf42eda65ff935f20f779213002");
check("the Phase 0 ChannelStrip placeholder is byte-identical to its Phase 0 file", sha256(placeholder) === "13a202f891a9de776d16936d837685ebea757cda244678c9d0e1c10ebb398b58");
check(
  "no dependency added or changed",
  !("dependencies" in pkg) &&
    JSON.stringify(Object.keys(pkg.devDependencies).sort()) ===
      JSON.stringify(["@sveltejs/vite-plugin-svelte", "@types/node", "svelte", "svelte-check", "typescript", "vite", "vite-plugin-singlefile"]),
);
check("the check is wired into package.json", pkg.scripts["check:channel-strip"] === "node scripts/check-channel-strip-structure.mjs");

// --- report -----------------------------------------------------------------
for (const name of passes) console.log(`  PASS  ${name}`);
if (failures.length > 0) {
  console.error("");
  for (const failure of failures) console.error(`  FAIL  ${failure}`);
  console.error("");
  console.error(`Console channel strip structural contract check — ${passes.length}/${passes.length + failures.length} passed`);
  process.exit(1);
}
console.log("");
console.log(`Console channel strip structural contract check — ${passes.length}/${passes.length} passed`);
