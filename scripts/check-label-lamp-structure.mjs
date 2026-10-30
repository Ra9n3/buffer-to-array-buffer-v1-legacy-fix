#!/usr/bin/env node
/**
 * Engraved label + lamp structural contract check — Task 1.6.
 *
 * Dependency-free guard (Node built-ins only), matching the other check:*
 * scripts. No test framework is added; the project has none and this task
 * must not introduce one.
 *
 * It does NOT test rendering: the depth of the cut, the lamp's glow and the
 * spill on the panel were measured in a real browser and are reported in
 * task-reports/1.6-report.md. What it tests is the source contract of plan
 * §4 and hardware spec §2 / §5 / §6:
 *
 *   1. TWO shared components — EngravedLabel.svelte and Lamp.svelte — in
 *      src/components/hardware/, importing nothing from each other, from the
 *      approved components, from the rooms or from any shared state.
 *   2. The label: the label face, the Task 1.1 text-size tokens for its five
 *      sizes (no px), the two tracking tokens, uppercase legends and
 *      case-keeping tabular values, the paint from the text tokens only, and
 *      the three layers of the cut — a dark wall shifted UP, a lit wall
 *      shifted DOWN (the `--al-text-engraved-highlight` token), and a floor
 *      copy of the text with a gradient clipped to the glyphs, hidden from
 *      assistive technology.
 *   3. The lamp: amber and red and nothing else; the glass sized from one
 *      length with the recess, ring, glow and spill in proportion; the four
 *      layers (spill, housing, recess, lens); the incandescent token for the
 *      amber body; the red family a step stronger; a specular pin on the
 *      unlit glass; a blurred spill; no flat disc, no hex colour, no cold
 *      white; short transitions and none under prefers-reduced-motion; the
 *      state in the accessible name, never in hue alone.
 *   4. Neither component adds a token; every `--al-*` they use exists.
 *   5. The playground shows the brief's specimens on the three materials at
 *      every size, ordinary text beside the engraving, amber and red lamps
 *      lit and unlit, a live toggle, the label+lamp clusters and the
 *      consistency check beside the approved switch; every state labelled
 *      simulated; the earlier sections intact.
 *   6. Scope: the approved components, rooms, strips and shared modules do
 *      not reference either new component; no audio; the switch is used in
 *      exactly one place in the playground besides its own fixture; no
 *      dependency added.
 *
 * Run: npm run check:label-lamp
 */

import { readFileSync, existsSync } from "node:fs";
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

const labelPath = "src/components/hardware/EngravedLabel.svelte";
const lampPath = "src/components/hardware/Lamp.svelte";
const labelFixturePath = "src/dev/EngravedLabelFixture.svelte";
const lampFixturePath = "src/dev/LampFixture.svelte";
const pagePath = "src/dev/DevComponentsPage.svelte";

for (const rel of [labelPath, lampPath, labelFixturePath, lampFixturePath, pagePath, "src/lib/tokens.css", "package.json"]) {
  if (!exists(rel)) {
    console.error(`  FAIL  required file missing: ${rel}`);
    process.exit(1);
  }
}

const label = read(labelPath);
const lamp = read(lampPath);
const labelFixture = read(labelFixturePath);
const lampFixture = read(lampFixturePath);
// the page writes non-ASCII specimen text as \uXXXX escapes; compare the characters
const page = read(pagePath).replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
const tokens = read("src/lib/tokens.css");
const pkg = JSON.parse(read("package.json"));

const style = (src) => (src.match(/<style>([\s\S]*?)<\/style>/) ?? ["", ""])[1];
const labelCss = style(label);
const lampCss = style(lamp);
const imports = (src) => [...src.matchAll(/import\s[^;]*?from\s+"([^"]+)"/g)].map((m) => m[1]);
const rule = (css, selector) => {
  const start = css.indexOf(selector);
  if (start < 0) return "";
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return css.slice(open + 1, i);
  }
  return "";
};
const definedTokens = new Set([...tokens.matchAll(/--al-[\w-]+(?=\s*:)/g)].map((m) => m[0]));
const usedTokens = (css) => [...new Set([...css.matchAll(/var\((--al-[\w-]+)/g)].map((m) => m[1]))];
const hexColour = /#[0-9a-f]{3,8}\b/i;

// --- 1. Two shared components, dependent on nothing. ---------------------------
check("EngravedLabel.svelte exists in src/components/hardware/", exists(labelPath));
check("Lamp.svelte exists in src/components/hardware/", exists(lampPath));
check("the label imports nothing (no component, no room, no state module)", imports(label).length === 0);
check("the lamp imports nothing (no component, no room, no state module)", imports(lamp).length === 0);
check("neither component knows the other or an approved component exists", !/Lamp\b|TactileSwitch|Knob|Fader|VUMeter|LedLadder/.test(label.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").replace(/`[^`]*`/g, "")) && !/EngravedLabel|Knob\b|Fader\b|VUMeter|LedLadder/.test(lamp.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")));
check("neither component touches audio, playback or project state", !/AudioContext|Analyser|AudioBuffer|requestAnimationFrame|lib\/mixer|lib\/arrange|lib\/rooms|rooms\/|fetch\(/.test(label + lamp));

// --- 2. The engraved label. --------------------------------------------------------
check("the label is typed: size xs|sm|md|lg|xl, kind label|value, tone normal|muted|bright, finish filled|cut", /export type LabelSize = "xs" \| "sm" \| "md" \| "lg" \| "xl"/.test(label) && /export type LabelKind = "label" \| "value"/.test(label) && /export type LabelTone = "normal" \| "muted" \| "bright"/.test(label) && /export type LabelFinish = "filled" \| "cut"/.test(label));
check("the label renders the element it is asked for (svelte:element) so headings can be engraved", /<svelte:element\s+this=\{as\}/.test(label) && /export type LabelElement = "span" \| "p" \| "div" \| "h2" \| "h3" \| "figcaption"/.test(label));
check("the label prints the text it is given and never rewrites it", /\{text\}/.test(label) && !/toUpperCase|toLowerCase/.test(label));
check("the label face: the label font token, bold weight token, tight line-height token", /font-family: var\(--al-font-label\)/.test(rule(labelCss, ".label {")) && /font-weight: var\(--al-font-weight-bold\)/.test(rule(labelCss, ".label {")) && /line-height: var\(--al-line-height-tight\)/.test(rule(labelCss, ".label {")));
check("legends are uppercase with the engraved tracking token; md and up relax to the label tracking token", /text-transform: uppercase/.test(rule(labelCss, ".label {")) && /letter-spacing: var\(--al-letter-spacing-engraved\)/.test(rule(labelCss, ".label {")) && ["md", "lg", "xl"].every((s) => /letter-spacing: var\(--al-letter-spacing-label\)/.test(rule(labelCss, `.label--${s} {`))));
check(
  "the five sizes are the five text-size tokens 2xs / xs / md / lg / xl, nothing in px",
  /font-size: var\(--al-text-size-2xs\)/.test(rule(labelCss, ".label--xs {")) && /font-size: var\(--al-text-size-xs\)/.test(rule(labelCss, ".label--sm {")) && /font-size: var\(--al-text-size-md\)/.test(rule(labelCss, ".label--md {")) && /font-size: var\(--al-text-size-lg\)/.test(rule(labelCss, ".label--lg {")) && /font-size: var\(--al-text-size-xl\)/.test(rule(labelCss, ".label--xl {")) && !/font-size:[^;]*px/.test(labelCss),
);
check("a value keeps its unit's case, is semibold, tracked less, with tabular digits", /text-transform: none/.test(rule(labelCss, ".label--value {")) && /font-weight: var\(--al-font-weight-semibold\)/.test(rule(labelCss, ".label--value {")) && /letter-spacing: var\(--al-letter-spacing-label\)/.test(rule(labelCss, ".label--value {")) && /font-variant-numeric: tabular-nums/.test(rule(labelCss, ".label--value {")));
check("the paint is the text tokens only: secondary (normal), muted, primary (bright)", /--lb-fill: var\(--al-text-secondary\)/.test(rule(labelCss, ".label {")) && /--lb-fill: var\(--al-text-muted\)/.test(rule(labelCss, ".label--muted {")) && /--lb-fill: var\(--al-text-primary\)/.test(rule(labelCss, ".label--bright {")) && /color: var\(--lb-fill\)/.test(rule(labelCss, ".label {")));
check("the cut depth is proportional to the type and never under a pixel", /--lb-depth: max\(1px, 0\.0?\d+em\)/.test(labelCss));
check(
  "the two walls: a dark copy shifted UP and the engraved-highlight token shifted DOWN, as hard 1-step text-shadows",
  /--lb-wall-light: var\(--al-text-engraved-highlight\)/.test(labelCss) && /--lb-wall-dark: rgba\(0, 0, 0, 0\.\d+\)/.test(labelCss) && /text-shadow:\s*0 calc\(-1 \* var\(--lb-depth\)\) 0 var\(--lb-wall-dark\),\s*0 var\(--lb-depth\) 0 var\(--lb-wall-light\)/.test(rule(labelCss, ".label {")),
);
check(
  "the floor: a second copy of the text, aria-hidden, laid over the first with a vertical gradient clipped to the glyphs, darker at the top of each stroke",
  /<span class="label__floor" aria-hidden="true">\{text\}<\/span>/.test(label) && /position: absolute;\s*inset: 0;/.test(rule(labelCss, ".label__floor {")) && /color: transparent/.test(rule(labelCss, ".label__floor {")) && /background-clip: text/.test(rule(labelCss, ".label__floor {")) && /linear-gradient\(\s*to bottom,\s*color-mix\(in srgb, var\(--lb-fill\) 7\d%, black\) 0%/.test(rule(labelCss, ".label__floor {")) && /text-shadow: none/.test(rule(labelCss, ".label__floor {")) && /pointer-events: none/.test(rule(labelCss, ".label__floor {")),
);
check("the floor copy is only rendered for the filled finish", /\{#if finish === "filled"\}<span class="label__floor"/.test(label));
check("the unpainted cut is the Task 1.1 engraved pair: the engraved fill with the lit lower wall", /--lb-fill: var\(--al-text-engraved\)/.test(rule(labelCss, ".label--cut {")) && /0 var\(--lb-depth\) 0 var\(--lb-wall-light\)/.test(rule(labelCss, ".label--cut {")));
check("the label never wraps; a truncated label clips with an ellipsis and carries its full text as a tooltip", /white-space: nowrap/.test(rule(labelCss, ".label {")) && /text-overflow: ellipsis/.test(rule(labelCss, ".label.is-truncated {")) && /const hint = \$derived\(title \?\? \(truncate \? text : null\)\)/.test(label) && /title=\{hint\}/.test(label));
check("the walls are not clipped by the label's own box", /overflow: visible/.test(rule(labelCss, ".label {")));
check("the label has its review hooks: data-engraved-label, data-label-size / -kind / -finish", /data-engraved-label\b/.test(label) && /data-label-size=\{size\}/.test(label) && /data-label-kind=\{kind\}/.test(label) && /data-label-finish=\{finish\}/.test(label));
check("the label's colours are tokens and neutral alphas only: no hex literal", !hexColour.test(labelCss));

// --- 3. The lamp. ------------------------------------------------------------------
check("the lamp's colours are amber and red and nothing else (spec §5); white only warms a core inside color-mix", /export type LampColor = "amber" \| "red"/.test(lamp) && !/green|blue|white|cyan|magenta|purple/.test(lamp.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").replace(/color-mix\(in srgb, var\([^)]*\) \d+%, (?:white|black|transparent)\)/g, "")));
check("the lamp's props: lit, color, name", /lit = false/.test(lamp) && /color = "amber"/.test(lamp) && /name = null/.test(lamp));
check("the lamp's four layers in order: spill behind, then housing > recess > lens", /<span class="lamp__spill" data-part="spill"><\/span>\s*<span class="lamp__housing" data-part="housing">\s*<span class="lamp__recess" data-part="recess">\s*<span class="lamp__lens" data-part="lens"><\/span>/.test(lamp));
check("the lamp is sized from one length, --lamp-size, 0.625rem (10 px) by default — the switch's lamp", /--lp-size: var\(--lamp-size, 0\.625rem\)/.test(lampCss));
check("the recess and the ring are proportions of the glass, never under a pixel", /--lp-recess: max\(1px, calc\(var\(--lp-size\) \* 0\.\d+\)\)/.test(lampCss) && /--lp-ring: max\(1px, calc\(var\(--lp-size\) \* 0\.\d+\)\)/.test(lampCss));
check("the layout box is the whole housing, so the painted lamp sits exactly where the box is", /--lp-outer: calc\(var\(--lp-size\) \+ 2 \* \(var\(--lp-recess\) \+ var\(--lp-ring\)\)\)/.test(lampCss) && /width: var\(--lp-outer\);\s*height: var\(--lp-outer\)/.test(rule(lampCss, ".lamp {")));
check("the housing is a machined ring: a 135° gradient from the metal token to the metal-shadow token, as padding (not a snapped border), on a drop shadow with the family's hairline of light under it", /padding: var\(--lp-ring\)/.test(rule(lampCss, ".lamp__housing {")) && /linear-gradient\(\s*135deg,[\s\S]*var\(--al-material-metal\) 38%,\s*var\(--al-material-metal-shadow\) 72%/.test(rule(lampCss, ".lamp__housing {")) && /0 var\(--lp-recess\) calc\(var\(--lp-recess\) \* 1\.5\) rgba\(0, 0, 0, 0\.6\)/.test(rule(lampCss, ".lamp__housing {")) && /0 calc\(var\(--lp-recess\) \+ 1px\) 0 rgba\(255, 255, 255, 0\.07\)/.test(rule(lampCss, ".lamp__housing {")) && !/border:\s*var\(--lp-ring\)/.test(lampCss));
check("the recess is the recess token with an inset shadow from the top", /background: var\(--al-material-recess\)/.test(rule(lampCss, ".lamp__recess {")) && /inset 0 var\(--lp-recess\)/.test(rule(lampCss, ".lamp__recess {")) && /padding: var\(--lp-recess\)/.test(rule(lampCss, ".lamp__recess {")));
check("the unlit lens is dark glass with a trace of its own colour and a pin of room light at the upper left — a visible lens, clearly off", /radial-gradient\(circle at 36% 30%, rgba\(255, 255, 255, 0\.16\) 0%/.test(rule(lampCss, ".lamp__lens {")) && /color-mix\(in srgb, var\(--lp-body\) 22%, var\(--al-material-recess\)\)/.test(rule(lampCss, ".lamp__lens {")));
check("the amber lamp is the incandescent token: body --al-material-lamp, core from the amber HI tone warmed to white, edge the amber LO tone", /--lp-body: var\(--al-material-lamp\)/.test(rule(lampCss, ".lamp {")) && /--lp-core: color-mix\(in srgb, var\(--al-function-amber-hi\) 7\d%, white\)/.test(rule(lampCss, ".lamp {")) && /--lp-edge: var\(--al-function-amber-lo\)/.test(rule(lampCss, ".lamp {")) && /--lp-glow: var\(--al-material-lamp\)/.test(rule(lampCss, ".lamp {")));
check("the red lamp is the red family", /--lp-core: color-mix\(in srgb, var\(--al-function-red-hi\) 7\d%, white\)/.test(rule(lampCss, ".lamp--red {")) && /--lp-body: var\(--al-function-red-base\)/.test(rule(lampCss, ".lamp--red {")) && /--lp-edge: var\(--al-function-red-lo\)/.test(rule(lampCss, ".lamp--red {")) && /--lp-glow: var\(--al-function-red-base\)/.test(rule(lampCss, ".lamp--red {")));
check(
  "red is a step stronger than amber: wider spill, heavier near glow",
  (() => {
    const n = (css, name) => Number((new RegExp(`${name}: ([\\d.]+)`).exec(css) ?? [])[1]);
    return n(rule(lampCss, ".lamp--red {"), "--lp-spill-opacity") > n(rule(lampCss, ".lamp {"), "--lp-spill-opacity") && n(rule(lampCss, ".lamp--red {"), "--lp-near") > n(rule(lampCss, ".lamp {"), "--lp-near");
  })(),
);
check("the lit lens: a hot core a little above centre falling through the body to a darker edge, the specular over it, a near glow in proportion to the glass", /radial-gradient\(circle at 48% 44%, var\(--lp-core\) 0%, var\(--lp-body\) 42%, var\(--lp-edge\) 92%\)/.test(rule(lampCss, ".lamp.is-lit .lamp__lens {")) && /rgba\(255, 255, 255, 0\.55\) 0%/.test(rule(lampCss, ".lamp.is-lit .lamp__lens {")) && /0 0 calc\(var\(--lp-size\) \* 0\.6 \* var\(--lp-near\)\)/.test(rule(lampCss, ".lamp.is-lit .lamp__lens {")));
check("the spill is a blurred radial behind the housing, hung below and to the right, off until lit", /filter: blur\(calc\(var\(--lp-size\) \* 0\.\d+\)\)/.test(rule(lampCss, ".lamp__spill {")) && /inset: -70% -80% -90% -60%/.test(rule(lampCss, ".lamp__spill {")) && /radial-gradient\(ellipse at 50% 50%, var\(--lp-glow\) 0%, transparent 68%\)/.test(rule(lampCss, ".lamp__spill {")) && /opacity: 0;/.test(rule(lampCss, ".lamp__spill {")) && /z-index: 0/.test(rule(lampCss, ".lamp__spill {")) && /z-index: 1/.test(rule(lampCss, ".lamp__housing {")) && /opacity: var\(--lp-spill-opacity\)/.test(rule(lampCss, ".lamp.is-lit .lamp__spill {")));
check("the lamp is not a flat disc: no plain fill on the lens, every layer a gradient", !/background:\s*var\(--lp-body\);/.test(lampCss) && (lampCss.match(/radial-gradient\(/g) ?? []).length >= 5);
check("the lamp comes on in 90 ms, goes off in 160 ms, and does not animate under prefers-reduced-motion", /transition:\s*background 90ms ease-out,\s*box-shadow 90ms ease-out/.test(rule(lampCss, ".lamp.is-lit .lamp__lens {")) && /transition:\s*background 160ms ease-out,\s*box-shadow 160ms ease-out/.test(rule(lampCss, ".lamp__lens {")) && /@media \(prefers-reduced-motion: reduce\) \{\s*\.lamp__lens,\s*\.lamp__spill \{\s*transition: none;/.test(lampCss));
check("the state is in the accessible name, never in hue alone: role=img + \"<name> lamp, lit|unlit\" when named, presentation when not", /role=\{name \? "img" : undefined\}/.test(lamp) && /aria-label=\{name \? `\$\{name\} lamp, \$\{stateText\}` : undefined\}/.test(lamp) && /aria-hidden=\{name \? undefined : "true"\}/.test(lamp) && /const stateText = \$derived\(lit \? "lit" : "unlit"\)/.test(lamp));
check("the lamp has its review hooks: data-lamp, data-lamp-lit, data-lamp-color, data-part on every layer", /data-lamp\b/.test(lamp) && /data-lamp-lit=\{lit\}/.test(lamp) && /data-lamp-color=\{color\}/.test(lamp) && (lamp.match(/data-part="/g) ?? []).length === 4);
check("the lamp's colours are tokens and neutral alphas only: no hex literal, no cold white fill", !hexColour.test(lampCss) && !/white 100%|#fff/i.test(lampCss));

// --- 4. No token added; every token used exists. ---------------------------------
const unknownLabel = usedTokens(labelCss).filter((t) => !definedTokens.has(t));
const unknownLamp = usedTokens(lampCss).filter((t) => !definedTokens.has(t));
check("every token the label uses is defined in tokens.css", unknownLabel.length === 0, unknownLabel.join(", "));
check("every token the lamp uses is defined in tokens.css", unknownLamp.length === 0, unknownLamp.join(", "));
check("the label uses the engraving pair the Task 1.1 tokens reserved for it", usedTokens(labelCss).includes("--al-text-engraved") && usedTokens(labelCss).includes("--al-text-engraved-highlight"));
check("the lamp uses the incandescent token", usedTokens(lampCss).includes("--al-material-lamp"));
check("no new --al- token was declared outside tokens.css by either component", !/^\s*--al-[\w-]+\s*:/m.test(labelCss + lampCss));

// --- 5. The playground. ------------------------------------------------------------
check("the playground has a label fixture and a lamp fixture, each used through the page", /<EngravedLabel\b/.test(labelFixture) && /<Lamp\b/.test(lampFixture) && /<EngravedLabelFixture \{config\} \/>/.test(page) && /<LampFixture \{config\} \/>/.test(page));
check("the page uses the components only through the fixtures", (page.match(/<EngravedLabel\b/g) ?? []).length === 0 && (page.match(/<Lamp\b/g) ?? []).length === 0);
check("the page has an engraved-label section and a lamp section, each with its rows", /data-dev-component="engraved-label"/.test(page) && /data-dev-component="lamp"/.test(page) && ["controls", "switches", "values", "long", "surfaces", "body"].every((r) => page.includes(`data-dev-label-${r}`)) && ["states", "detail", "live", "clusters"].every((r) => page.includes(`data-dev-lamp-${r}`)));
check("the brief's specimens are shown: INPUT OUTPUT PAN GAIN · PAD HPF PHANTOM · 26 dB +4 −12 · a long track and section label", ["INPUT", "OUTPUT", "PAN", "GAIN", "PAD", "HPF", "PHANTOM", "26 dB", "+4", "−12", "LEAD VOCAL — TRACK 07", "MASTER SECTION"].every((t) => page.includes(`text: "${t}"`)));
check("every size is shown, xs through xl, and both kinds", ["xs", "sm", "md", "lg", "xl"].every((s) => page.includes(`size: "${s}"`)) && /kind: "value"/.test(page));
check("the labels are shown on the three materials", ["panel", "surface", "raised"].every((m) => page.includes(`surface: "${m}"`)) && /fixture__panel--surface \{/.test(labelFixture) && /fixture__panel--raised \{/.test(labelFixture) && /var\(--al-material-surface-raised\)/.test(labelFixture));
check("ordinary text is shown beside the engraving, in the UI face, and the page says it is not engraved", /withBodyText: true/.test(page) && /font-family: var\(--al-font-ui\)/.test(rule(style(labelFixture), ".fixture__body {")) && /Ordinary application text/.test(page));
check("the unpainted cut is shown only at a title size", (() => { const m = /id: "label-long-cut",[\s\S]*?specimens: \[([\s\S]*?)\]/.exec(page); return Boolean(m) && /finish: "cut"/.test(m[1]) && !/finish: "cut"[^}]*size: "(xs|sm|md)"/.test(m[1]) && !/size: "(xs|sm|md)"[^}]*finish: "cut"/.test(m[1]); })());
check("a truncated long label is shown", /truncate: true/.test(page));
check("a review magnification of the small cut is shown", /id: "label-controls-zoom",[\s\S]*?zoom: 3/.test(page));
check("amber and red lamps are shown unlit and lit", ["lamp-amber-unlit", "lamp-amber-lit", "lamp-red-unlit", "lamp-red-lit"].every((id) => page.includes(`id: "${id}"`)) && /id: "lamp-amber-unlit"[^}]*lit: false/.test(page) && /id: "lamp-amber-lit"[^}]*lit: true/.test(page) && /id: "lamp-red-unlit"[^}]*lit: false/.test(page) && /id: "lamp-red-lit"[^}]*lit: true/.test(page));
check("the lens is shown enlarged for review, lit amber, lit red and unlit", ["lamp-detail-amber", "lamp-detail-red", "lamp-detail-unlit"].every((id) => new RegExp(`id: "${id}"[^}]*scale: 3`).test(page)));
check("a live lamp can be toggled from a demo-only checkbox the fixture owns", /let lit = \$state\(config\.lit \?\? false\)/.test(lampFixture) && /data-lamp-fixture-toggle/.test(lampFixture) && /bind:checked=\{lit\}/.test(lampFixture) && /simulated state, demo only/.test(lampFixture) && /id: "lamp-live-amber"[^}]*interactive: true/.test(page) && /id: "lamp-live-red"[^}]*interactive: true/.test(page));
check("the label+lamp clusters: an engraved legend over a lamp over its value — PHANTOM, HPF, a red PEAK", /id: "cluster-phantom"[^}]*label: "PHANTOM"[^}]*value: "48 V"/.test(page) && /id: "cluster-hpf"[^}]*lit: false/.test(page) && /id: "cluster-peak", color: "red"/.test(page) && /data-lamp-fixture-cluster/.test(lampFixture) && /<EngravedLabel text=\{config\.label\}/.test(lampFixture) && /kind="value"/.test(lampFixture));
check("the consistency check puts the approved switch beside the cluster at the same scale, both driven by one flag", /id: "cluster-switch"[^}]*withSwitch: true/.test(page) && !/id: "cluster-switch"[^}]*scale: /.test(page) && /<TactileSwitch variant="panel" label=\{config\.label \?\? "PAD"\} value=\{config\.value \?\? null\} lamp=\{color\} bind:engaged=\{lit\} \/>/.test(lampFixture));
check("the page says every lamp state is simulated and nothing is connected", /Every state on this page is <strong>simulated<\/strong>/.test(page) && /Nothing is connected to a\s+switch function, a\s+meter, playback or project state/.test(page));
check("the lamp fixtures' panels are the warm charcoal panel so the spill is judged on the real material", /background-color: var\(--al-material-panel\)/.test(style(lampFixture)) && /background-color: var\(--al-material-panel\)/.test(style(labelFixture)));
check("the knob, fader, switch, VU meter and ladder sections are still there, unchanged in structure", ["knob", "fader", "switch", "vu-meter", "led-ladder"].every((c) => page.includes(`data-dev-component="${c}"`)) && /data-dev-knob-states/.test(page) && /data-dev-fader-states/.test(page) && /data-dev-switch-cap-states/.test(page) && /data-dev-vu-positions/.test(page) && /data-dev-led-levels/.test(page));
check("the token page no longer says the label and lamp arrive later", !/engraved-label and lamp components arrive in later tasks/.test(page));
check("the route is still the private hash route", /dev\/components/.test(read("src/lib/rooms.ts")));

// --- 6. Scope. ---------------------------------------------------------------------
const approved = ["src/components/hardware/Knob.svelte", "src/components/hardware/Fader.svelte", "src/components/hardware/TactileSwitch.svelte", "src/components/hardware/VUMeter.svelte", "src/components/hardware/LedLadder.svelte"];
check("the approved components do not import either new component", approved.filter(exists).every((rel) => !/EngravedLabel|hardware\/Lamp|Lamp\.svelte|<Lamp\b/.test(read(rel))));
check(
  "no room, strip or shared-state module references either new component",
  ["src/rooms/ConsoleRoom.svelte", "src/rooms/ArrangeRoom.svelte", "src/rooms/MixerRoom.svelte", "src/components/ChannelStrip.svelte", "src/components/ChannelBank.svelte", "src/components/MixerChannelStrip.svelte", "src/components/MixerDetailPanel.svelte", "src/components/MiniTransport.svelte", "src/lib/mixer.ts", "src/lib/arrange.ts", "src/lib/rooms.ts"]
    .filter(exists)
    .every((rel) => !/EngravedLabel|hardware\/Lamp|<Lamp\b/.test(read(rel))),
);
check("the switch appears once in its own fixture, once in the lamp fixture, never in the page", (read("src/dev/SwitchFixture.svelte").match(/<TactileSwitch\b/g) ?? []).length === 1 && (lampFixture.match(/<TactileSwitch\b/g) ?? []).length === 1 && (page.match(/<TactileSwitch\b/g) ?? []).length === 0);
check("the fixtures touch no audio, playback or project state", !/AudioContext|Analyser|AudioBuffer|requestAnimationFrame|lib\/mixer|lib\/arrange|lib\/rooms|rooms\//.test(labelFixture + lampFixture));
check("no dependency was added", !pkg.dependencies && Object.keys(pkg.devDependencies).sort().join(",") === "@sveltejs/vite-plugin-svelte,@types/node,svelte,svelte-check,typescript,vite,vite-plugin-singlefile");
check("check:label-lamp is wired into package.json", pkg.scripts?.["check:label-lamp"] === "node scripts/check-label-lamp-structure.mjs");

// --- Report. -------------------------------------------------------------------
for (const name of passes) console.log(`  PASS  ${name}`);

if (failures.length > 0) {
  console.error("");
  for (const failure of failures) console.error(`  FAIL  ${failure}`);
  console.error("");
  console.error(`Label + lamp contract check — ${passes.length}/${passes.length + failures.length} passed`);
  process.exit(1);
}

console.log(`\nLabel + lamp contract check — ${passes.length}/${passes.length} passed`);
