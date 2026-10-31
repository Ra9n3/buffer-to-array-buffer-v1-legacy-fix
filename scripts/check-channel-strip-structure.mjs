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
 *      ChannelBank; twenty tracks; the pinned Bus / Returns strips are still
 *      the untouched Phase 0 ChannelStrip placeholders (Task 2.4's subject).
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
 *      horizontal scroller, the pinned aside sits outside it, the Phase 0
 *      ≤40rem column mode is kept.
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
check("the bank imports the TrackStrip and the fixtures", /import TrackStrip from "\.\/channel-strip\/TrackStrip\.svelte"/.test(bank) && /TRACK_STRIPS/.test(bank));
check("the bank renders one TrackStrip per fixture track, keyed by id", /\{#each TRACK_STRIPS as track \(track\.id\)\}\s*<TrackStrip \{track\} \/>/.test(bankTemplate));
check("the TrackStrip is rendered exactly once in the bank's template", count(bankTemplate, /<TrackStrip\b/g) === 1);
{
  const rows = fixtures.match(/^\s*\{ id: "\d\d", name: "[^"]+", type: "TRK"/gm) ?? [];
  check("the fixture file holds exactly twenty regular tracks, 01…20", rows.length === 20 && rows[0].includes('"01"') && rows[19].includes('"20"'), `${rows.length} rows`);
  const ids = (fixtures.match(/\{ id: "(\d\d)"/g) ?? []).map((m) => m.slice(7, 9));
  check("track ids are unique and sequential", ids.join(",") === Array.from({ length: 20 }, (_, i) => String(i + 1).padStart(2, "0")).join(","));
}
check("the strip is a list item that names itself by its track name (role=group, aria-labelledby)", /<li\s+class="strip"\s+role="group"\s+aria-labelledby=\{`\$\{uid\}-name`\}/.test(stripTemplate) && /id=\{`\$\{uid\}-name`\} text=\{track\.name\}/.test(stripTemplate));
check("the strip carries its hooks: data-track-strip, data-track-org, data-simulated, data-strip-section", /data-track-strip=\{track\.id\}/.test(stripTemplate) && /data-track-org=/.test(stripTemplate) && /data-simulated=\{SIMULATED\}/.test(stripTemplate) && count(stripTemplate, /data-strip-section="/g) === 6);
check("the six sections are head, trim, pan, sends, fader, switches — in that order", (stripTemplate.match(/data-strip-section="([a-z]+)"/g) ?? []).map((m) => m.slice(20, -1)).join(",") === "head,trim,pan,sends,fader,switches");
check("the pinned Bus / Returns strips are still the Phase 0 ChannelStrip placeholders", /<ChannelStrip\s+code=\{strip\.code\}\s+name=\{strip\.name\}\s+kind=\{strip\.kind\}\s+pinned\s*\/>/.test(bankTemplate) && count(bankTemplate, /<ChannelStrip\b/g) === 1);
check("the three pinned strips are unchanged: R1 Reverb Return, R2 Delay Return, BUS Bus master", /\{ code: "R1", name: "Reverb Return", kind: "return" \},\s*\{ code: "R2", name: "Delay Return", kind: "return" \},\s*\{ code: "BUS", name: "Bus master", kind: "bus" \}/.test(bank));
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
check("SendSlot.svelte exists and the strip imports it with its SlotState type", exists("src/components/channel-strip/SendSlot.svelte") && /import SendSlot, \{ type SlotState \} from "\.\/SendSlot\.svelte"/.test(strip));
check("the fixture fixes two slot positions per strip (owner: two, side by side)", /export const SEND_SLOT_COUNT = 2;/.test(fixtures));
check("the strip seeds SEND_SLOT_COUNT slots from the fixture's sends, the rest unassigned at OFF", /Array\.from\(\{ length: SEND_SLOT_COUNT \}/.test(strip) && /send \? \{ to: send\.to, level: send\.level \} : \{ to: null, level: SEND_RANGE\.min \}/.test(strip));
check("the slots are the strip's own UI state ($state), bound into each SendSlot", /let slots: SlotState\[\] = \$state\(/.test(strip) && /bind:slot=\{slots\[i\]\}/.test(stripTemplate) && /\{#each slots as _, i \(i\)\}\s*<SendSlot/.test(stripTemplate));
check("the slots sit together in the one labelled bay and nowhere else", /<div class="strip__bay" role="group" aria-label=\{`Sends, \$\{track\.name\}`\}>\s*\{#each slots/.test(stripTemplate) && count(stripTemplate, /<SendSlot\b/g) === 1);
check("each slot tells the other which return it feeds (no double assignment)", /taken=\{takenBy\(i\)\}/.test(stripTemplate) && /slots\.find\(\(_, j\) => j !== i\)\?\.to \?\? null/.test(strip));
check("the slot's knob is the approved Knob, green family, legend Send n, OFF / +6 extremes, fixture range", /import Knob from "\.\.\/hardware\/Knob\.svelte"/.test(sendSlot) && /<Knob\s+label=\{legend\}\s+family="green"/.test(slotTemplate) && /min=\{SEND_RANGE\.min\}/.test(slotTemplate) && /extremes=\{\["OFF", "\+6"\]\}/.test(slotTemplate) && /format=\{formatSend\}/.test(slotTemplate) && /const legend = \$derived\(`Send \$\{index\}`\)/.test(sendSlot));
check("the knob is bound to the slot's level and disabled while the slot is unassigned", /bind:value=\{slot\.level\}/.test(slotTemplate) && /disabled=\{assigned === null\}/.test(slotTemplate));
check("an unassigned slot prints SEND; an assigned one prints the return's short name", /assigned \? assigned\.short : "SEND"/.test(sendSlot));
check("the send label is a menu button (aria-haspopup, aria-expanded, data-send-label)", /<button\s+type="button"\s+class="slot__window"[\s\S]*?aria-haspopup="menu"[\s\S]*?aria-expanded=\{open\}[\s\S]*?data-send-label/.test(slotTemplate));
check("the menu lists every fixture return as a menuitemradio and offers Remove only when assigned", /\{#each EFFECT_RETURNS as ret \(ret\.id\)\}/.test(slotTemplate) && /role="menuitemradio"\s+aria-checked=\{current\}/.test(slotTemplate) && /\{#if assigned\}\s*<button[^>]*data-send-remove/.test(slotTemplate) && /role="menu"/.test(slotTemplate));
check("a return already fed by the other slot is offered disabled", /disabled=\{unavailable\}/.test(slotTemplate) && /const unavailable = ret\.id === taken/.test(slotTemplate));
check("assigning takes the fixture's level for that return or the default; removing returns the slot to OFF", /fixtureLevels\[returnId\] \?\? DEFAULT_SEND_LEVEL/.test(sendSlot) && /slot\.to = null;\s*slot\.level = SEND_RANGE\.min;/.test(sendSlot));
check("the menu closes on Escape (focus back to the label), on Tab and on a press outside", /event\.key === "Escape"/.test(sendSlot) && /windowEl\?\.focus\(\)/.test(sendSlot) && /event\.key === "Tab"/.test(sendSlot) && /<svelte:document onpointerdown=\{onDocumentPointerDown\} \/>/.test(slotTemplate) && /!rootEl\.contains\(event\.target as Node\)/.test(sendSlot));
check("the menu is absolutely positioned above later content and spans the bay (never outside the strip)", /\.slot__menu \{[^}]*position:\s*absolute/s.test(slotStyle) && /\.slot__menu \{[^}]*z-index:\s*[1-9]/s.test(slotStyle) && /style:left=\{menuLeft\}/.test(slotTemplate) && /style:width=\{menuWidth\}/.test(slotTemplate) && /\$\{count\} \* 100%/.test(sendSlot));
check("the slot draws no control of its own (no svg, canvas or input)", !/<svg|<canvas|<input/.test(slotTemplate));
check("the slot carries its hooks: data-send-slot, data-send-state, data-send-to, data-send-menu, data-send-option", /data-send-slot=\{index\}/.test(slotTemplate) && /data-send-state=\{slotState\}/.test(slotTemplate) && /data-send-to=\{slot\.to \?\? ""\}/.test(slotTemplate) && /data-send-menu/.test(slotTemplate) && /data-send-option=\{ret\.id\}/.test(slotTemplate));
check("the slot's state type is two fields only: the return (or null) and a level", /export interface SlotState \{\s*to: ReturnId \| null;\s*level: number;\s*\}/.test(sendSlot));
check("the slot does not override the approved Knob's internals", !/:global|\.knob/.test(slotStyle));

check("one fader, labelled Level, at its approved defaults (console taper, 160 travel, −60…+10 dB)", count(stripTemplate, /<Fader\b/g) === 1 && /<Fader label="Level" value=\{track\.level\} \/>/.test(stripTemplate));
check("two panel-labelled switches: Mute (red lamp) and Solo (amber lamp), named per track", /<TactileSwitch variant="panel" label="Mute" lamp="red" engaged=\{track\.mute\} name=\{`Mute \$\{track\.name\}`\} \/>/.test(stripTemplate) && /<TactileSwitch variant="panel" label="Solo" lamp="amber" engaged=\{track\.solo\} name=\{`Solo \$\{track\.name\}`\} \/>/.test(stripTemplate) && count(stripTemplate, /<TactileSwitch\b/g) === 2);
check("one red peak lamp, named per track", count(stripTemplate, /<Lamp\b/g) === 1 && /<Lamp lit=\{track\.peak\} color="red" name=\{`Peak, \$\{track\.name\}`\} \/>/.test(stripTemplate));
check("the footer order is mute, solo, peak", /label="Mute"[\s\S]*label="Solo"[\s\S]*data-strip-peak/.test(stripTemplate));
check("every legend is an EngravedLabel: number, type, name, peak", count(stripTemplate, /<EngravedLabel\b/g) === 4 && /text=\{track\.id\}/.test(stripTemplate) && /text=\{track\.type\}/.test(stripTemplate) && /text="Peak"/.test(stripTemplate));
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
check("the strip's props are the fixture type only", /let \{ track \}: \{ track: TrackStripFixture \} = \$props\(\);/.test(strip));
check(
  "no audio, metering, timers, randomness, stores or shared state in any strip file (local UI state only)",
  !/AudioContext|Analyser|AudioBuffer|requestAnimationFrame|setInterval|setTimeout|Math\.random|performance\.now|Date\.now|lib\/mixer|lib\/arrange|lib\/rooms|localStorage|sessionStorage|fetch\(|svelte\/store|writable\(|readable\(|getContext|setContext|onToggle|\$effect/.test(allStripSource),
);
check("the only $state in the strip files is the slot list and the slot's own menu/element refs", count(strip, /\$state\(/g) === 1 && count(sendSlot, /\$state\(/g) === 4 && !/\$state/.test(fixtures + bank));
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
  check("the tracks region is the only horizontal scroller in the bank's desktop layout", /overflow-x:\s*auto/.test(tracks) && /overflow-y:\s*hidden/.test(tracks) && /overscroll-behavior-x:\s*contain/.test(tracks) && count(bankStyle.replace(/@media[\s\S]*$/, ""), /overflow-x:\s*auto/g) === 1);
  check("the rail is a flex row sized by its content (max-content), never shrinking its strips", /\.bank__rail \{[^}]*display:\s*flex/s.test(bankStyle) && /\.bank__rail \{[^}]*width:\s*max-content/s.test(bankStyle));
  check("the tracks region is keyboard reachable and named", /data-channel-bank-tracks\s+role="region"\s+tabindex="0"\s+aria-label=/.test(bankTemplate) && /\.bank__tracks:focus-visible/.test(bankStyle));
}
check("the pinned aside sits outside the scroller, after it, fixed width (flex 0 0 auto)", /<\/div>\s*<aside\s+class="bank__pinned"\s+data-channel-bank-pinned/.test(bankTemplate) && /\.bank__pinned \{[^}]*flex:\s*0 0 auto/s.test(bankStyle));
check("the pinned aside keeps its hook, name and an engraved Bus / Returns legend", /aria-label="Pinned bus and Return channels"/.test(bankTemplate) && /<EngravedLabel as="p" text="Bus \/ Returns" size="xs" \/>/.test(bankTemplate));
check("the pinned row keeps the Phase 0 placeholder geometry (flex row, 0.5rem gap)", /\.bank__pinned-row \{[^}]*gap:\s*0\.5rem/s.test(bankStyle));
check("the Phase 0 ≤40rem column mode is kept (pinned below, scrolling on its own)", /@media \(max-width: 40rem\) \{[\s\S]*\.bank__body \{[^}]*flex-direction:\s*column/s.test(bankStyle) && /@media \(max-width: 40rem\) \{[\s\S]*\.bank__pinned-row \{[^}]*overflow-x:\s*auto/s.test(bankStyle));
check("the bank keeps its Phase 0 hooks", /data-channel-bank\b/.test(bankTemplate) && /data-channel-bank-tracks/.test(bankTemplate) && /data-channel-bank-pinned/.test(bankTemplate));
check("the Phase 0 fluid grid (--visible-track-count) is gone", !/visible-track-count|grid-auto-columns/.test(bankStyle));
check("the bank sets no height of its own: the room's grid row and the strips size it", !/\sheight:\s*100%/.test(bankStyle) && !/max-height/.test(bankStyle));

// --- 7. Scope. -----------------------------------------------------------------
check("no screw heads in any strip file (owner's standing rule, D2.1.9)", !/(class=["'{][^"'}]*screw|\.[\w-]*screw[\w-]*\s*[{,:]|data-[\w-]*screw|__screw)/i.test(allStripSource));
check("no instrument combobox or Prominence Tier control in the Console (plan §3)", !/combobox|<select|Prominence|prominence|tier/i.test(allStripSource + consoleRoom));
check("the strip and bank do not import the bridge or its fixtures", !/meter-bridge\//.test(strip + bank));
check("the strip and slot do not import the Phase 0 placeholder or the mixer/arrange fixtures", !/ChannelStrip\.svelte|MixerChannelStrip|lib\/mixer|lib\/arrange/.test(strip + sendSlot));
check("no instrument combobox: the send menu is a menu, not a combobox or select", !/combobox|<select|<datalist/.test(sendSlot));
check("ConsoleRoom still has exactly its two zones, in order, and no Phase 0 bank frame", (consoleRoom.match(/data-console-zone="([a-z-]+)"/g) ?? []).join(",") === 'data-console-zone="meter-bridge",data-console-zone="channel-bank"' && !/console-bank\b|console-zone__header/.test(consoleRoom));
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
