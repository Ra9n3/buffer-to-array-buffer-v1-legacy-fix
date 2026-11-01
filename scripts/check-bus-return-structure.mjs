#!/usr/bin/env node
/**
 * Console bus-master and Return-bus strips structural contract check —
 * Task 2.4.
 *
 * Dependency-free guard (Node built-ins only). It does NOT test geometry:
 * the pinned strips' alignment with the track strips, the pinned rail's
 * width, the column-mode threshold, the room's vertical scroll and the
 * rail-scroll independence were measured in a real browser at 1920, 1440,
 * 1280, 1100, 1099, 1024 and 768 CSS px (see task-reports/2.4-report.md).
 * What it tests is the source-level contract:
 *
 *   1. The pinned strips are three files under components/channel-strip:
 *      StripModule (the track strip's chassis, shared), ReturnStrip and
 *      BusMasterStrip; the bank renders one ReturnStrip per fixture return
 *      and then the BusMasterStrip (the bus master farthest right, 0.3);
 *      nothing is written for exactly two returns (D2.4.1).
 *   2. The module IS the track strip's chassis: the same width and
 *      component sizes, the same head, the same section rules, bay recess,
 *      fader section and MUTE · SOLO · PEAK footer — its CSS rule bodies are
 *      the TrackStrip's, value for value — so every control lines up across
 *      the bank. A module without a bay renders a blank panel that absorbs
 *      the height (D2.4.4).
 *   3. Composition: approved Phase 1 components only — Knob (green for a
 *      Return, orange BUS TRIM and blue-grey BALANCE for the bus), Fader,
 *      TactileSwitch (BYPASS with an amber lamp; MUTE red, SOLO amber), Lamp
 *      (PEAK red), EngravedLabel — and no control drawn by hand. The
 *      Return's character is a plain print in the send window's recipe and
 *      green ink; the Return's knobs are the plan §8a controls (D2.4.3).
 *   4. Fixture honesty: every value is a typed-in constant in one fixture
 *      file that says so; the Return strips are DERIVED from the shared
 *      return list the send slots use (one per return, names taken from it);
 *      the DOM is marked `data-simulated`; no state, audio, meters, timers,
 *      randomness or shared state anywhere in the new files.
 *   5. Materials are tokens: no hex colour literal; the org colour is the
 *      tab only.
 *   6. Column mode (D2.4.2): under 68.75rem the deck stacks and the pinned
 *      rail scrolls on its own; above it the tracks rail is the only
 *      horizontal scroller.
 *   7. Scope: no screw heads (D2.1.9); the approved components, the track
 *      strip, the send slot, the track fixtures, the Phase 0 placeholder,
 *      the bridge, the transport deck and the Console room are
 *      byte-identical to their approved files; the Mixer and Arrange rooms
 *      do not import the new strips; no dependency added or changed.
 *
 * Run: npm run check:bus-return
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
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
/** The body of the first rule whose selector list is exactly `selector`. */
const ruleBody = (css, selector) => {
  const re = new RegExp(`(^|\\n)\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`);
  const m = stripComments(css).match(re);
  return m ? m[2].replace(/\s+/g, " ").trim() : null;
};

const module_ = read("src/components/channel-strip/StripModule.svelte");
const ret = read("src/components/channel-strip/ReturnStrip.svelte");
const bus = read("src/components/channel-strip/BusMasterStrip.svelte");
const fixtures = read("src/components/channel-strip/bus-return-fixtures.ts");
const trackStrip = read("src/components/channel-strip/TrackStrip.svelte");
const sendSlot = read("src/components/channel-strip/SendSlot.svelte");
const trackFixtures = read("src/components/channel-strip/track-strip-fixtures.ts");
const bank = read("src/components/ChannelBank.svelte");
const devPage = read("src/dev/DevComponentsPage.svelte");
const devFixture = read("src/dev/PinnedStripFixture.svelte");
const pkg = JSON.parse(read("package.json"));

const moduleTemplate = templateOf(module_);
const moduleStyle = styleOf(module_);
const retTemplate = templateOf(ret);
const retStyle = styleOf(ret);
const busTemplate = templateOf(bus);
const busStyle = styleOf(bus);
const bankTemplate = templateOf(bank);
const bankStyle = styleOf(bank);
const trackStyle = styleOf(trackStrip);
const newSource = [module_, ret, bus, fixtures].join("\n");
const newStyles = moduleStyle + retStyle + busStyle;

// --- 1. Three files; the bank renders them; nothing is written for two returns.
for (const rel of ["StripModule.svelte", "ReturnStrip.svelte", "BusMasterStrip.svelte", "bus-return-fixtures.ts"]) {
  check(`${rel} exists under components/channel-strip`, exists(`src/components/channel-strip/${rel}`));
}
check("ReturnStrip and BusMasterStrip are built on the shared StripModule", /import StripModule from "\.\/StripModule\.svelte"/.test(ret) && /import StripModule from "\.\/StripModule\.svelte"/.test(bus) && count(retTemplate, /<StripModule\b/g) === 1 && count(busTemplate, /<StripModule\b/g) === 1);
check("the bank renders one ReturnStrip per fixture return, keyed by the shared return id, then one BusMasterStrip per bus", /\{#each RETURN_STRIPS as ret \(ret\.returnId\)\}\s*<ReturnStrip \{ret\} \/>/.test(bankTemplate) && /\{#each BUS_MASTERS as bus \(bus\.id\)\}\s*<BusMasterStrip \{bus\} \/>/.test(bankTemplate));
check("the Returns come before the bus master in the pinned row (the bus master farthest right, 0.3)", bankTemplate.indexOf("<ReturnStrip") < bankTemplate.indexOf("<BusMasterStrip") && /<ul class="bank__pinned-row"[\s\S]*<ReturnStrip[\s\S]*<BusMasterStrip[\s\S]*<\/ul>/.test(bankTemplate));
check("the pinned legend's range and count are derived from the lists, not typed in", /firstPinned = RETURN_STRIPS\[0\]\?\.id/.test(bank) && /lastPinned = BUS_MASTERS\[BUS_MASTERS\.length - 1\]\?\.id/.test(bank) && /pinnedCount = RETURN_STRIPS\.length \+ BUS_MASTERS\.length/.test(bank) && /data-pinned-count=\{pinnedCount\}/.test(bankTemplate));
check("the Return strips are DERIVED from the shared return list: one per EFFECT_RETURNS entry, numbered in its order, named from it", /export const RETURN_STRIPS: readonly ReturnStripFixture\[\] = EFFECT_RETURNS\.map\(\(ret, i\) => \(\{\s*returnId: ret\.id,\s*id: `R\$\{i \+ 1\}`,\s*type: "RET",\s*name: effectReturn\(ret\.id\)\.name,\s*\.\.\.RETURN_SETTINGS\[ret\.id\],\s*\}\)\);/.test(fixtures));
check("the per-return settings are keyed by the shared ReturnId (every return must have settings; the type checker enforces it)", /const RETURN_SETTINGS: Readonly<Record<ReturnId, Omit<ReturnStripFixture, "returnId" \| "id" \| "type" \| "name">>> = \{/.test(fixtures) && /\n  room: \{/.test(fixtures) && /\n  plate: \{/.test(fixtures) && /\n  delay1: \{/.test(fixtures));
const uncommented = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
check("no 'Reverb Return' / 'Delay Return' pair is hard-coded anywhere in the new files (outside comments)", !/Reverb Return|Delay Return/.test(uncommented(newSource + bank)));
check("the bus master is a list too (BUS_MASTERS), with at least one entry", /export const BUS_MASTERS: readonly BusMasterFixture\[\] = \[\s*\{ id: "B1", type: "BUS", name: "[^"]+"/.test(fixtures));

// --- 2. The module is the track strip's chassis, value for value. -------------
{
  const host = ruleBody(moduleStyle, ".module");
  check("the module declares the track strip's fixed width and component sizes", /--strip-width: 10rem;/.test(host) && /--knob-size: 2\.5rem;/.test(host) && /--fader-width: 4\.5rem;/.test(host) && /--switch-size: 1\.75rem;/.test(host) && /--lamp-size: 0\.75rem;/.test(host));
  check("the module never shrinks: flex 0 0, width, min- and max-width all the same variable", /flex: 0 0 var\(--strip-width\);/.test(host) && /\swidth: var\(--strip-width\);/.test(host) && /min-width: var\(--strip-width\);/.test(host) && /max-width: var\(--strip-width\);/.test(host));
  const pairs = [
    [".strip", ".module"],
    [".strip__face", ".module__face"],
    [".strip__section", ".module__section"],
    [".strip__section + .strip__section,\n  .strip__head + .strip__section", ".module__section + .module__section,\n  .module__head + .module__section"],
    [".strip__head", ".module__head"],
    [".strip__ident", ".module__ident"],
    [".strip__name-row", ".module__name-row"],
    [".strip__tab", ".module__tab"],
    [".strip__section--knob", ".module__section--knob"],
    [".strip__section--sends", ".module__section--bay"],
    [".strip__bay", ".module__bay"],
    [".strip__section--fader", ".module__section--fader"],
    [".strip__section--switches", ".module__section--switches"],
    [".strip__peak", ".module__peak"],
    [".strip__peak-lamp", ".module__peak-lamp"],
  ];
  for (const [trackSel, moduleSel] of pairs) {
    const a = ruleBody(trackStyle, trackSel);
    const b = ruleBody(moduleStyle, moduleSel);
    check(`module rule ${moduleSel.replace(/\s+/g, " ")} is the track strip's ${trackSel.replace(/\s+/g, " ")}, value for value`, a !== null && a === b, a === null ? "track rule not found" : b === null ? "module rule not found" : "bodies differ");
  }
  check("the blank panel absorbs the slack and hands the fader section its own height only", /\.module__section--blank \{[^}]*flex:\s*1 1 auto/s.test(moduleStyle) && /\.module__section--blank ~ \.module__section--fader \{[^}]*flex:\s*0 0 auto/s.test(moduleStyle));
  check("a module without a bay renders the blank panel; with one, the bay recess", /\{#if bay\}[\s\S]*<div class="module__section module__section--bay" data-strip-section=\{baySection\}>\s*<div class="module__bay" role="group" aria-label=\{bayLabel\}>\s*\{@render bay\(\)\}/.test(moduleTemplate) && /\{:else\}\s*<div class="module__section module__section--blank" data-strip-section="blank" data-blank-panel><\/div>/.test(moduleTemplate));
  check("the module's six sections are head, the two knob sections, the bay or blank, fader, switches — in that order", /data-strip-section="head"[\s\S]*data-strip-section=\{sectionA\}[\s\S]*data-strip-section=\{sectionB\}[\s\S]*data-strip-section=\{baySection\}[\s\S]*data-strip-section="blank"[\s\S]*data-strip-section="fader"[\s\S]*data-strip-section="switches"/.test(moduleTemplate));
  check("the module uses no @container or @media query and scales nothing down", !/@container|@media|transform:\s*scale|zoom:/.test(newStyles));
  check("the new styles do not override the approved components' internals", !/:global|\.knob|\.fader|\.switch|\.lamp\b|\.label\b/.test(newStyles));
}

// --- 3. Composition. -----------------------------------------------------------
for (const name of ["EngravedLabel", "Fader", "Lamp", "TactileSwitch"]) {
  check(`the module imports the approved ${name}`, new RegExp(`import ${name} from "\\.\\./hardware/${name}\\.svelte"`).test(module_));
}
check("the Return strip imports the approved Knob and TactileSwitch; the bus strip the Knob", /import Knob from "\.\.\/hardware\/Knob\.svelte"/.test(ret) && /import TactileSwitch from "\.\.\/hardware\/TactileSwitch\.svelte"/.test(ret) && /import Knob from "\.\.\/hardware\/Knob\.svelte"/.test(bus));
check("no new file draws a control of its own: no <svg>, <canvas>, <input> or <button>", !/<svg|<canvas|<input|<button/.test(moduleTemplate + retTemplate + busTemplate));
check("the module's head is the track strip's: number, type (titled), the org tab, the engraved truncating name", /<EngravedLabel text=\{id\} size="sm" kind="value" tone="bright" title=\{`Channel \$\{id\}`\} \/>/.test(moduleTemplate) && /<EngravedLabel text=\{type\} size="xs" tone="muted" title=\{typeTitle\} \/>/.test(moduleTemplate) && /<span class="module__tab" style:--org=\{orgToken\(org\)\} data-org-tab=\{String\(org\)\} aria-hidden="true"><\/span>/.test(moduleTemplate) && /<EngravedLabel id=\{`\$\{uid\}-name`\} text=\{name\} size="sm" kind="value" truncate \/>/.test(moduleTemplate));
check("the module is a list item naming itself by its name label, with its hooks", /<li\s+class="module"\s+role="group"\s+aria-labelledby=\{`\$\{uid\}-name`\}\s+data-pinned-strip=\{hook\}\s+data-pinned-kind=\{kind\}\s+data-simulated=\{SIMULATED\}/.test(moduleTemplate));
check("one approved Fader per module, legend and value from the strip, at its approved defaults", count(moduleTemplate, /<Fader\b/g) === 1 && /<Fader label=\{faderLabel\} value=\{faderValue\} \/>/.test(moduleTemplate) && !/<Fader\b/.test(retTemplate + busTemplate));
check("the footer is the track strip's: Mute (red lamp), Solo (amber lamp), then the red Peak lamp, each named per channel", /<TactileSwitch variant="panel" label="Mute" lamp="red" engaged=\{mute\} name=\{`Mute \$\{name\}`\} \/>\s*<TactileSwitch variant="panel" label="Solo" lamp="amber" engaged=\{solo\} name=\{`Solo \$\{name\}`\} \/>\s*<div class="module__peak" data-strip-peak>\s*<EngravedLabel text="Peak" size="xs" \/>\s*<span class="module__peak-lamp">\s*<Lamp lit=\{peak\} color="red" name=\{`Peak, \$\{name\}`\} \/>/.test(moduleTemplate));
check("the knob sections are snippets rendered by the module (the strips own their knobs)", /\{@render knobA\(\)\}/.test(moduleTemplate) && /\{@render knobB\(\)\}/.test(moduleTemplate) && /\{#snippet knobA\(\)\}/.test(ret) && /\{#snippet knobB\(\)\}/.test(ret) && /\{#snippet knobA\(\)\}/.test(bus) && /\{#snippet knobB\(\)\}/.test(bus));

// Return strip.
check("the Return strip is typed RET, kind return, hooked by its code, with the plan's words in its titles", /type=\{ret\.type\}\s+typeTitle="Return bus"/.test(retTemplate) && /kind="return"/.test(retTemplate) && /hook=\{ret\.id\}/.test(retTemplate));
check("the Return's three knobs are the green family (spec §5: sends, auxiliary paths, reverb / delay)", count(retTemplate, /<Knob\b/g) === 3 && count(retTemplate, /family="green"/g) === 3 && !/family="(cream|amber|red|bluegrey|orange)"/.test(retTemplate));
check("the Return's first knob is the effect's time control (DECAY / TIME) and the second its second control (PRE-DELAY / FEEDBACK), both from the fixture params", /label=\{params\.time\.legend\}/.test(retTemplate) && /value=\{ret\.time\}/.test(retTemplate) && /label=\{params\.second\.legend\}/.test(retTemplate) && /value=\{ret\.second\}/.test(retTemplate) && /sectionA=\{params\.time\.id\}/.test(retTemplate) && /sectionB=\{params\.second\.id\}/.test(retTemplate));
check("the Return's bay is the effect bay: the character window over the TONE knob, then the BYPASS switch", /baySection="effect"/.test(retTemplate) && /bayLabel=\{`Effect, \$\{ret\.name\}`\}/.test(retTemplate) && /\{#snippet bay\(\)\}[\s\S]*<span\s+class="effect__window"\s+data-return-character=\{ret\.character\.print\}[\s\S]*\{ret\.character\.print\}[\s\S]*<\/span>\s*<Knob\s+label=\{TONE_PARAM\.legend\}[\s\S]*value=\{ret\.tone\}[\s\S]*<div class="bypass" data-return-bypass>\s*<TactileSwitch variant="panel" label="Bypass" lamp="amber" engaged=\{ret\.bypass\} name=\{`Bypass \$\{ret\.name\}`\} \/>/.test(retTemplate));
check("the character window is a plain print (no button, no menu) with the character's name in its title and accessible name", !/aria-haspopup|<button/.test(retTemplate) && /title=\{`Character: \$\{ret\.character\.name\}`\}/.test(retTemplate) && /aria-label=\{`Character, \$\{ret\.character\.name\}`\}/.test(retTemplate));
check("the character window is the send window's recipe in the green ink (recess, subtle border, mono, 2xs, uppercase)", /\.effect__window \{[^}]*background:\s*var\(--al-material-recess\)/s.test(retStyle) && /\.effect__window \{[^}]*border:\s*1px solid var\(--al-border-subtle\)/s.test(retStyle) && /\.effect__window \{[^}]*color:\s*var\(--al-function-green-hi\)/s.test(retStyle) && /\.effect__window \{[^}]*font-family:\s*var\(--al-font-mono\)/s.test(retStyle) && /\.effect__window \{[^}]*font-size:\s*var\(--al-text-size-2xs\)/s.test(retStyle) && /\.effect__window \{[^}]*text-transform:\s*uppercase/s.test(retStyle) && /\.effect__window \{[^}]*min-height:\s*1\.125rem/s.test(retStyle));
check("the Return's fader is legended Return and holds the fixture's output level", /faderLabel="Return"\s+faderValue=\{ret\.level\}/.test(retTemplate));
check("the Return's props are the fixture type and the optional identity snippet only (Task 2.7, forwarded to the module)", /let \{ ret, identity = null \}: \{ ret: ReturnStripFixture; identity\?: Snippet \| null \} = \$props\(\);/.test(ret));

// Bus master strip.
check("the bus strip is typed BUS, kind bus, hooked by its code", /type=\{bus\.type\}\s+typeTitle="Bus master"/.test(busTemplate) && /kind="bus"/.test(busTemplate) && /hook=\{bus\.id\}/.test(busTemplate));
check("BUS TRIM is the orange family (spec §5: bus / group masters) on the track strips' TRIM range and readout", /<Knob\s+label="Bus trim"\s+family="orange"\s+min=\{BUS_TRIM_RANGE\.min\}\s+max=\{BUS_TRIM_RANGE\.max\}\s+step=\{BUS_TRIM_RANGE\.step\}\s+value=\{bus\.trim\}\s+unit="dB"\s+decimals=\{1\}\s+extremes=\{\["−20", "\+20"\]\}\s+format=\{trimFormat\}/.test(busTemplate));
check("BALANCE is the blue-grey family on the track strips' PAN range with L / R extremes and the pan readout", /<Knob\s+label="Balance"\s+family="bluegrey"\s+min=\{BALANCE_RANGE\.min\}\s+max=\{BALANCE_RANGE\.max\}\s+step=\{BALANCE_RANGE\.step\}\s+value=\{bus\.balance\}\s+decimals=\{0\}\s+extremes=\{\["L", "R"\]\}\s+format=\{formatBalance\}/.test(busTemplate));
check("the bus strip has exactly those two knobs, no bay (the blank panel) and no switch of its own", count(busTemplate, /<Knob\b/g) === 2 && !/bay\s*=|\{#snippet bay/.test(busTemplate) && !/<TactileSwitch|<Lamp/.test(busTemplate));
check("the bus's fader is legended Master and holds the fixture's level", /faderLabel="Master"\s+faderValue=\{bus\.level\}/.test(busTemplate));
check("the bus strip's props are the fixture type and the optional identity snippet only (Task 2.7, forwarded to the module)", /let \{ bus, identity = null \}: \{ bus: BusMasterFixture; identity\?: Snippet \| null \} = \$props\(\);/.test(bus));
check("the bus reuses the track strips' ranges and formatters by re-export, not by copy", /export \{ PAN_RANGE as BALANCE_RANGE, TRIM_RANGE as BUS_TRIM_RANGE, formatPan as formatBalance, formatSignedDb \};/.test(fixtures) && !/BALANCE_RANGE = \{|BUS_TRIM_RANGE = \{/.test(fixtures));

// --- 4. Fixture honesty; nothing wired. ----------------------------------------
check("the fixture file declares itself SIMULATED in its header and re-exports the shared SIMULATED", /SIMULATED fixture data/.test(fixtures.slice(0, 400)) && /export \{ SIMULATED \};/.test(fixtures) && /import \{[^}]*SIMULATED[^}]*\} from "\.\/track-strip-fixtures"/s.test(fixtures));
check("the module root carries data-simulated", /data-simulated=\{SIMULATED\}/.test(moduleTemplate) && /import \{ SIMULATED, orgToken, type OrgSwatch \} from "\.\/track-strip-fixtures"/.test(module_));
check(
  "no state, audio, metering, timers, randomness, stores or shared state in any new file (pure fixture renderers)",
  !/\$state|\$effect|AudioContext|Analyser|AudioBuffer|requestAnimationFrame|setInterval|setTimeout|Math\.random|performance\.now|Date\.now|lib\/mixer|lib\/arrange|lib\/rooms|localStorage|sessionStorage|fetch\(|svelte\/store|writable\(|readable\(|getContext|setContext|onMount|bind:/.test(newSource + devFixture),
);
check("the Return params are the plan §8a controls with provisional ranges (D2.4.3)", /DECAY_PARAM: ReturnParam = \{\s*id: "decay",\s*legend: "Decay",\s*min: 0\.2,\s*max: 10,/.test(fixtures) && /PREDELAY_PARAM: ReturnParam = \{\s*id: "predelay",\s*legend: "Pre-delay",\s*min: 0,\s*max: 200,/.test(fixtures) && /DELAY_TIME_PARAM: ReturnParam = \{\s*id: "time",\s*legend: "Time",\s*min: 20,\s*max: 2000,/.test(fixtures) && /FEEDBACK_PARAM: ReturnParam = \{\s*id: "feedback",\s*legend: "Feedback",\s*min: 0,\s*max: 90,/.test(fixtures) && /TONE_PARAM: ReturnParam = \{\s*id: "tone",\s*legend: "Tone",\s*min: -10,\s*max: 10,/.test(fixtures));
check("a reverb puts DECAY then PRE-DELAY on its strip; a delay TIME then FEEDBACK", /reverb: \{ time: DECAY_PARAM, second: PREDELAY_PARAM \}/.test(fixtures) && /delay: \{ time: DELAY_TIME_PARAM, second: FEEDBACK_PARAM \}/.test(fixtures));
check("TONE reads FLAT under the mark and signed steps elsewhere", /if \(amount === 0\) return "FLAT";/.test(fixtures) && /extremes: \["(\u2212|\\u2212)10", "\+10"\]/.test(fixtures));
check("readouts carry their unit: s, ms, %", /formatUnit\(v, 1, "s"\)/.test(fixtures) && /formatUnit\(v, 0, "ms"\)/.test(fixtures) && /formatUnit\(v, 0, "%"\)/.test(fixtures));
check("the fixtures vary: both effect families, a bypassed and an un-bypassed Return, a lit and an unlit peak", /effect: "reverb"/.test(fixtures) && /effect: "delay"/.test(fixtures) && /bypass: true/.test(fixtures) && /bypass: false/.test(fixtures) && /peak: true/.test(fixtures) && /peak: false/.test(fixtures));
check("every Return carries a character print and name (plan §8a: Room, Plate; delay-line character)", count(fixtures, /character: \{ print: "[A-Z0-9 ]+", name: "[^"]+" \}/g) === 3);
check("the fixture types are readonly and closed: a Return's effect is reverb or delay, a pinned type RET or BUS", /export type ReturnEffect = "reverb" \| "delay";/.test(fixtures) && /export type PinnedType = "RET" \| "BUS";/.test(fixtures) && /readonly type: "RET";/.test(fixtures) && /readonly type: "BUS";/.test(fixtures));

// --- 5. Materials are tokens; the org colour is a tab. -----------------------
check("no hex colour literal in the module, the strips or the fixtures", !/#[0-9a-f]{3,8}\b/i.test(newStyles + fixtures.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")));
check("the module's face is the panel token and the org colour reaches only the tab", /\.module__face \{[^}]*background-color:\s*var\(--al-material-panel\)/s.test(moduleStyle) && count(moduleStyle, /var\(--org\)/g) === 1 && /\.module__tab \{[^}]*background-color:\s*var\(--org\)/s.test(moduleStyle));
check("the Return's own style uses the green function tokens only (no amber, red, orange, cream or blue-grey)", /var\(--al-function-green-hi\)/.test(retStyle) && !/--al-function-(amber|red|orange|cream|bluegrey)/.test(retStyle) && busStyle.trim() === "");
check("spacing comes from the spacing tokens", count(newStyles, /var\(--al-space-/g) >= 20);

// --- 6. The bank's pinned rail and column mode. ---------------------------------
check("the pinned rail is outside the tracks scroller and shares its recess recipe", /\.bank__tracks,\s*\.bank__pinned \{[^}]*background-color:\s*color-mix\(in srgb, var\(--al-material-recess\) 55%, var\(--al-material-panel\)\)/s.test(bankStyle) && !/<aside[\s\S]*<TrackStrip/.test(bankTemplate) && !/data-channel-bank-tracks[\s\S]*<ReturnStrip/.test(bankTemplate.slice(0, bankTemplate.indexOf("<aside"))));
check("in row mode the tracks rail is the only horizontal scroller", count(bankStyle.replace(/@media[\s\S]*$/, ""), /overflow-x:\s*auto/g) === 1 && /\.bank__tracks \{[^}]*overflow-x:\s*auto/s.test(bankStyle));
check("column mode under 68.75rem = 1100 px (D2.4.2): legend / tracks / pinned legend / pinned, the pinned rail scrolling on its own, contained", /@media \(width < 68\.75rem\) \{[\s\S]*"legend"\s*"tracks"\s*"pinned-legend"\s*"pinned"/s.test(bankStyle) && /@media \(width < 68\.75rem\) \{[\s\S]*\.bank__pinned \{[^}]*overflow-x:\s*auto[^}]*overscroll-behavior-x:\s*contain/s.test(bankStyle));
check("the breakpoint is explained in the source as the sum of the parts", /pinned rail 668 \+ gap 12 \+ two strips and their rail 336 =\s*1016 px of deck, plus the deck's and the cheeks' 84 px = 1100/.test(bankStyle));
check("the pinned row keeps the modules' own height and stretches them to one another", /\.bank__pinned-row \{[^}]*flex:\s*0 0 auto/s.test(bankStyle) && /\.bank__pinned-row \{[^}]*align-items:\s*stretch/s.test(bankStyle) && /\.bank__pinned \{[^}]*align-items:\s*flex-start/s.test(bankStyle));

// --- 7. Scope. -------------------------------------------------------------------
check("no screw heads in any new file (owner's standing rule, D2.1.9)", !/(class=["'{][^"'}]*screw|\.[\w-]*screw[\w-]*\s*[{,:]|data-[\w-]*screw|__screw)/i.test(newSource + devFixture + bank));
check("no instrument combobox or Prominence Tier control in the pinned strips (plan §3)", !/combobox|<select|Prominence|prominence|tier/i.test(newSource));
check("the new strips do not import the track strip, the send slot, the bridge, the transport or the Phase 0 placeholder", !/import [^;]*(TrackStrip|SendSlot|meter-bridge\/|console-transport\/|ChannelStrip\.svelte|MixerChannelStrip)/.test(newSource));
// (The Mixer left this list in Task 2.7: its Return and bus channels ARE the
//  pinned strips, composed through src/components/mixer/*; check:mixer covers it.)
check("the Arrange room and the shell do not import the pinned strips", !/ReturnStrip|BusMasterStrip|StripModule|bus-return-fixtures/.test(["src/rooms/ArrangeRoom.svelte", "src/App.svelte", "src/components/RoomShell.svelte", "src/components/MiniTransport.svelte"].map(read).join("\n")));
check("the playground renders the pinned strips through PinnedStripFixture in its own section", /import PinnedStripFixture, \{ type PinnedStripFixtureConfig \} from "\.\/PinnedStripFixture\.svelte"/.test(devPage) && /data-dev-component="pinned-strips"/.test(devPage) && /<PinnedStripFixture \{config\} \/>/.test(devPage) && /import ReturnStrip from "\.\.\/components\/channel-strip\/ReturnStrip\.svelte"/.test(devFixture) && /import BusMasterStrip from "\.\.\/components\/channel-strip\/BusMasterStrip\.svelte"/.test(devFixture));
const pinned = {
  "src/components/hardware/TactileSwitch.svelte": "9f8a61ff521988aff708ba7e860854c441343525c0eb43b11e92a534ce1a2ba9",
  "src/components/hardware/Lamp.svelte": "024d907589c1ab33b2b3c5cc8840347b9779450b61a60f67c34b045d4ac8010a",
  "src/components/hardware/EngravedLabel.svelte": "230ebcd7cf810d3096953e5131cb9cb3a89dd83f9f0e9cc0bcd934d2ca74fc29",
  "src/components/hardware/Knob.svelte": "df6c51572f28d00ca07b98551914f8f11837df147d557c9113e94cd29732fdf6",
  "src/components/hardware/Fader.svelte": "b46e55ec95f4ddbe544175f7e0a340e7378a8cff3af674e431aad2a08d5be372",
  "src/lib/tokens.css": "10ae166bc9e73c265523fbf95f4ba39f7b9f8277573a81e36953295cf51345be",
  "src/lib/tokens.ts": "c61debb8c942111395dccc9e67d2111239b9afb80a80cba9402efecb4787bd71",
  "src/components/meter-bridge/ConsoleMeterBridge.svelte": "1c96844f79fd0e0a6ba630d6f6b6ba436e3a1cf42eda65ff935f20f779213002",
  // (Task 2.7: TrackStrip gained the optional `identity` snippet — re-pinned at that state.)
  "src/components/channel-strip/TrackStrip.svelte": "1e06056cd61e307e5e20d541e62309167b3c0cdde7a46085cfb436ac3f578cfa",
  "src/components/channel-strip/SendSlot.svelte": "8009eaf5ba0335099deb62a315116e67450750c118370d974596ead37b468b31",
  "src/components/channel-strip/track-strip-fixtures.ts": "c76e8c14b7c9794b14747a83a51926870a24c6a587405259f05ac6a415e151c5",
  "src/components/ChannelStrip.svelte": "13a202f891a9de776d16936d837685ebea757cda244678c9d0e1c10ebb398b58",
  "src/components/console-transport/ConsoleTransport.svelte": "b5bd2efed4f4e19f3272b54ec7c3ea8b91fb52bfc744821c803852b1cd75addb",
  "src/components/console-transport/LampDisplay.svelte": "19634fdde214a7d571ed2a28271064c0d34604a7acf7910cf8f97f3a960dea9d",
  "src/components/console-transport/MixButton.svelte": "5b08e6e8f505c478f5cea5f03465b82c4db3d09b076f0ada032075c71ba163cd",
  "src/components/console-transport/transport-fixtures.ts": "0333ddc273f3cd1eb6576126dc74aa917741f7f15cd35ab18ecd729a6aba9806",
  "src/rooms/ConsoleRoom.svelte": "ab8450a981b9ef4a8fbf4382e225994340f7be2936dbdafb3ddd402b16af6645",
};
for (const [rel, hash] of Object.entries(pinned)) {
  check(`approved file untouched: ${rel}`, exists(rel) && sha256(read(rel)) === hash, exists(rel) ? `sha256 ${sha256(read(rel)).slice(0, 16)}…` : "missing");
}
check(
  "no dependency added or changed",
  !("dependencies" in pkg) &&
    JSON.stringify(Object.keys(pkg.devDependencies).sort()) ===
      JSON.stringify(["@sveltejs/vite-plugin-svelte", "@types/node", "svelte", "svelte-check", "typescript", "vite", "vite-plugin-singlefile"]),
);
check("the check is wired into package.json", pkg.scripts["check:bus-return"] === "node scripts/check-bus-return-structure.mjs");

// --- report -----------------------------------------------------------------
for (const name of passes) console.log(`  PASS  ${name}`);
if (failures.length > 0) {
  console.error("");
  for (const failure of failures) console.error(`  FAIL  ${failure}`);
  console.error("");
  console.error(`Console bus-master and Return-bus strips structural contract check — ${passes.length}/${passes.length + failures.length} passed`);
  process.exit(1);
}
console.log("");
console.log(`Console bus-master and Return-bus strips structural contract check — ${passes.length}/${passes.length} passed`);
