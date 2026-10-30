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

// --- 3. The lamp: a vintage pilot lamp, seven layers lit from the top-left (D1.6.7). ---
const knob = read("src/components/hardware/Knob.svelte");
const knobNickel = ["hi", "base", "mid", "lo", "deep"].map((k) => (new RegExp(`--kn-nickel-${k}:\\s*(#[0-9a-f]{6})`, "i").exec(knob) ?? [])[1]);
const lampNickel = ["hi", "base", "mid", "lo", "deep"].map((k) => (new RegExp(`--lp-nickel-${k}:\\s*(#[0-9a-f]{6})`, "i").exec(rule(lampCss, ".lamp {")) ?? [])[1]);
const lampHexes = [...new Set(lampCss.match(/#[0-9a-f]{3,8}\b/gi) ?? [])].map((h) => h.toLowerCase());
check("the lamp's colours are amber and red and nothing else (spec §5); white only warms a core inside color-mix", /export type LampColor = "amber" \| "red"/.test(lamp) && !/green|blue|white|cyan|magenta|purple/.test(lamp.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").replace(/color-mix\(in srgb, var\([^)]*\) \d+%, (?:white|black|transparent)\)/g, "")));
check("the lamp's props: lit, color, name", /lit = false/.test(lamp) && /color = "amber"/.test(lamp) && /name = null/.test(lamp));
check("the lamp's four elements in order: bloom behind, then housing (bezel) > recess (wall) > lens (glass); filament, core and specular are painted on the lens", /<span class="lamp__bloom" data-part="bloom"><\/span>\s*<span class="lamp__housing" data-part="housing">\s*<span class="lamp__recess" data-part="recess">\s*<span class="lamp__lens" data-part="lens"><\/span>/.test(lamp));
check("the lamp is sized from one length, --lamp-size, 0.625rem (10 px) by default — the switch's lamp", /--lp-size: var\(--lamp-size, 0\.625rem\)/.test(lampCss));
check("the ring is a proportion of the glass, never under a pixel; the recess wall is one pixel at every size", /--lp-ring: max\(1px, calc\(var\(--lp-size\) \* 0\.\d+\)\)/.test(lampCss) && /--lp-recess: 1px;/.test(rule(lampCss, ".lamp {")));
check("the layout box is the whole housing, so the painted lamp sits exactly where the box is", /--lp-outer: calc\(var\(--lp-size\) \+ 2 \* \(var\(--lp-recess\) \+ var\(--lp-ring\)\)\)/.test(lampCss) && /width: var\(--lp-outer\);\s*height: var\(--lp-outer\)/.test(rule(lampCss, ".lamp {")));
check(
  "2 the bezel is the knob's nickel, value for value: the five --lp-nickel-* hexes equal Knob.svelte's --kn-nickel-hi/base/mid/lo/deep, and they are the only hex literals in the lamp",
  knobNickel.every(Boolean) && lampNickel.every(Boolean) && knobNickel.every((v, i) => v.toLowerCase() === lampNickel[i].toLowerCase()) && lampHexes.every((h) => lampNickel.map((v) => v.toLowerCase()).includes(h)),
  `knob ${knobNickel.join(",")} lamp ${lampNickel.join(",")} hexes ${lampHexes.join(",")}`,
);
check("2 the bezel is a 135° nickel ramp lit at the top-left (hi) and dark at the bottom-right (deep), as padding (not a snapped border); no drop shadow, no hairline", /padding: var\(--lp-ring\)/.test(rule(lampCss, ".lamp__housing {")) && /linear-gradient\(\s*135deg,\s*var\(--lp-nickel-hi\) 0%,\s*var\(--lp-nickel-base\) \d+%,\s*var\(--lp-nickel-mid\) \d+%,\s*var\(--lp-nickel-lo\) \d+%,\s*var\(--lp-nickel-deep\) 100%/.test(rule(lampCss, ".lamp__housing {")) && !/box-shadow/.test(rule(lampCss, ".lamp__housing {")) && !/border:\s*var\(--lp-ring\)/.test(lampCss));
check("3 the recess wall is a 1px dark ring inside the bezel — the glass sits below the panel surface — darkest at the top-left under the bezel's lip; no inset shadow", /padding: var\(--lp-recess\)/.test(rule(lampCss, ".lamp__recess {")) && /linear-gradient\(\s*135deg,\s*color-mix\(in srgb, var\(--al-material-recess\) \d+%, black\) 0%,\s*var\(--al-material-recess\) \d+%,/.test(rule(lampCss, ".lamp__recess {")) && !/box-shadow/.test(rule(lampCss, ".lamp__recess {")));
check("4 the glass, off, is dull dark glass in the lamp's own tint — the body colour sunk into the recess tone, red more so (maroon) — a radial dome from the top-left, clipped, no shadow or line on its edge; never a flat grey or black disc", /--lp-off-hi: color-mix\(in srgb, var\(--lp-body\) (\d+)%, var\(--al-material-recess\)\)/.test(rule(lampCss, ".lamp {")) && Number(/--lp-off-hi: color-mix\(in srgb, var\(--lp-body\) (\d+)%/.exec(rule(lampCss, ".lamp--red {"))?.[1]) > Number(/--lp-off-hi: color-mix\(in srgb, var\(--lp-body\) (\d+)%/.exec(rule(lampCss, ".lamp {"))?.[1]) && /radial-gradient\(\s*circle at 36% 32%,\s*var\(--lp-off-hi\) 0%,\s*var\(--lp-off-lo\) \d+%,\s*var\(--lp-off-rim\) 100%/.test(rule(lampCss, ".lamp__lens {")) && /overflow: hidden/.test(rule(lampCss, ".lamp__lens {")) && !/box-shadow/.test(rule(lampCss, ".lamp__lens {")) && !/background:\s*var\(--/.test(rule(lampCss, ".lamp__lens {")));
check("5 the filament is a tiny zigzag stroke masked into the glass (an inline SVG path, non-scaling 1px stroke), dull tinted metal at half opacity when off, gone (opacity 0) when lit", /mask: var\(--lp-filament-mask\) center \/ 100% 100% no-repeat/.test(rule(lampCss, ".lamp__lens::before {")) && /--lp-filament-mask: url\("data:image\/svg\+xml,[^"]*path d='M6\.5 13\.4 9 10\.2 11\.5 13\.4 14 10\.2 16\.5 13\.4[^"]*vector-effect='non-scaling-stroke'/.test(rule(lampCss, ".lamp {")) && /--lp-filament: color-mix\(in srgb, var\(--lp-body\) \d+%, var\(--al-material-metal\)\)/.test(rule(lampCss, ".lamp {")) && /opacity: 0\.5;/.test(rule(lampCss, ".lamp__lens::before {")) && /opacity: 0;/.test(rule(lampCss, ".lamp.is-lit .lamp__lens::before {")));
check("6 the hot core is a small white-warm radial blob offset to the top-left, on top of the lit glass: the lit lens's first background layer, core to transparent within 26%, over the dome (core → body → edge → dark rim)", /background:\s*radial-gradient\(\s*circle at 36% 32%,\s*var\(--lp-core\) 0%,\s*color-mix\(in srgb, var\(--lp-core\) \d+%, transparent\) \d+%,\s*transparent 26%\s*\),\s*radial-gradient\(\s*circle at 36% 32%,\s*color-mix\(in srgb, var\(--lp-core\) \d+%, var\(--lp-body\)\) 0%,\s*var\(--lp-body\) \d+%,\s*var\(--lp-edge\) \d+%,\s*color-mix\(in srgb, var\(--lp-edge\) \d+%, black\) 100%/.test(rule(lampCss, ".lamp.is-lit .lamp__lens {")) && !/box-shadow|rgba\(255, 255, 255/.test(rule(lampCss, ".lamp.is-lit .lamp__lens {")));
check("7 the specular is one small soft white ellipse at the top-left of the glass, sized from the lens, present in both states and dimmer when off (--lp-specular 0.28 off, 0.55 lit)", /top: 12%;\s*left: 18%;\s*width: 30%;\s*height: 19%;/.test(rule(lampCss, ".lamp__lens::after {")) && /radial-gradient\(closest-side, rgba\(255, 255, 255, 0\.\d+\), rgba\(255, 255, 255, 0\)\)/.test(rule(lampCss, ".lamp__lens::after {")) && /filter: blur\(calc\(var\(--lp-size\) \* 0\.0\d\)\)/.test(rule(lampCss, ".lamp__lens::after {")) && /opacity: var\(--lp-specular\)/.test(rule(lampCss, ".lamp__lens::after {")) && /--lp-specular: 0\.28;/.test(rule(lampCss, ".lamp {")) && /--lp-specular: 0\.55;/.test(rule(lampCss, ".lamp.is-lit .lamp__lens {")));
check("the amber lamp is the incandescent token: body --al-material-lamp, core from the amber HI tone warmed to white, edge the amber LO tone", /--lp-body: var\(--al-material-lamp\)/.test(rule(lampCss, ".lamp {")) && /--lp-core: color-mix\(in srgb, var\(--al-function-amber-hi\) 7\d%, white\)/.test(rule(lampCss, ".lamp {")) && /--lp-edge: var\(--al-function-amber-lo\)/.test(rule(lampCss, ".lamp {")) && /--lp-glow: var\(--al-material-lamp\)/.test(rule(lampCss, ".lamp {")));
check("the red lamp is the red family", /--lp-core: color-mix\(in srgb, var\(--al-function-red-hi\) 7\d%, white\)/.test(rule(lampCss, ".lamp--red {")) && /--lp-body: var\(--al-function-red-base\)/.test(rule(lampCss, ".lamp--red {")) && /--lp-edge: var\(--al-function-red-lo\)/.test(rule(lampCss, ".lamp--red {")) && /--lp-glow: var\(--al-function-red-base\)/.test(rule(lampCss, ".lamp--red {")));
check(
  "red is a step stronger than amber in the one glow there is, the bloom; there is no near glow, no spill and no --lp-near (D1.6.4 as narrowed by D1.6.6/D1.6.7)",
  (() => {
    const n = (css, name) => Number((new RegExp(`${name}: ([\\d.]+)`).exec(css) ?? [])[1]);
    return n(rule(lampCss, ".lamp--red {"), "--lp-bloom-opacity") > n(rule(lampCss, ".lamp {"), "--lp-bloom-opacity") && !/--lp-near|--lp-spill|lamp__spill/.test(lampCss);
  })(),
);
check("1 the bloom is a radial halo 2.5× the bezel's radius (a box 250% of the housing), in the lamp's own colour, screen-blended onto the panel, fading to fully transparent, behind the bezel, off until lit", /inset: -75%;/.test(rule(lampCss, ".lamp__bloom {")) && /radial-gradient\(\s*circle closest-side,\s*color-mix\(in srgb, var\(--lp-glow\) \d+%, transparent\) 0%,[\s\S]*transparent 100%\s*\)/.test(rule(lampCss, ".lamp__bloom {")) && /mix-blend-mode: screen;/.test(rule(lampCss, ".lamp__bloom {")) && /opacity: 0;/.test(rule(lampCss, ".lamp__bloom {")) && /z-index: 0/.test(rule(lampCss, ".lamp__bloom {")) && /z-index: 1/.test(rule(lampCss, ".lamp__housing {")) && /opacity: var\(--lp-bloom-opacity\)/.test(rule(lampCss, ".lamp.is-lit .lamp__bloom {")) && !/filter|box-shadow/.test(rule(lampCss, ".lamp__bloom {")));
check("the bloom breathes: 3.5% of opacity over 4 s, alternate, composed onto the bloom's own opacity (so the 90 ms rise is kept), only where animation-composition is supported", /@supports \(animation-composition: add\) \{\s*\.lamp\.is-lit \.lamp__bloom \{\s*animation: lamp-breathe 4s ease-in-out infinite alternate;\s*animation-composition: add;/.test(lampCss) && /@keyframes lamp-breathe \{\s*from \{\s*opacity: 0;\s*\}\s*to \{\s*opacity: 0\.03\d?;\s*\}/.test(lampCss));
check("the lamp is not a flat disc and carries no box-shadow and no pure white: no plain fill on the lens, five radial layers (bloom, dead glass, specular, hot core, lit dome), no #fff, no opaque white", !/background:\s*var\(--lp-body\);/.test(lampCss) && (lampCss.match(/radial-gradient\(/g) ?? []).length >= 5 && !/box-shadow/.test(lampCss) && !/#fff\b|#ffffff\b|white 100%|rgba\(255, 255, 255, 1\)|\bwhite;/i.test(lampCss));
check("the lamp comes on in 90 ms, goes off in 160 ms (glass background, filament and specular opacity), and under prefers-reduced-motion neither transitions nor breathes — lit or unlit", /transition:\s*background 90ms ease-out;/.test(rule(lampCss, ".lamp.is-lit .lamp__lens {")) && /transition:\s*background 160ms ease-out;/.test(rule(lampCss, ".lamp__lens {")) && /transition:\s*opacity 160ms ease-out;/.test(rule(lampCss, ".lamp__lens::before {")) && /transition:\s*opacity 160ms ease-out;/.test(rule(lampCss, ".lamp__lens::after {")) && /@media \(prefers-reduced-motion: reduce\) \{\s*\.lamp \.lamp__lens,\s*\.lamp \.lamp__lens::before,\s*\.lamp \.lamp__lens::after,\s*\.lamp \.lamp__bloom,\s*\.lamp\.is-lit \.lamp__lens,\s*\.lamp\.is-lit \.lamp__lens::before,\s*\.lamp\.is-lit \.lamp__lens::after,\s*\.lamp\.is-lit \.lamp__bloom \{\s*transition: none;\s*animation: none;/.test(lampCss));
check("the state is in the accessible name, never in hue alone: role=img + \"<name> lamp, lit|unlit\" when named, presentation when not", /role=\{name \? "img" : undefined\}/.test(lamp) && /aria-label=\{name \? `\$\{name\} lamp, \$\{stateText\}` : undefined\}/.test(lamp) && /aria-hidden=\{name \? undefined : "true"\}/.test(lamp) && /const stateText = \$derived\(lit \? "lit" : "unlit"\)/.test(lamp));
check("the lamp has its review hooks: data-lamp, data-lamp-lit, data-lamp-color, data-part on every element", /data-lamp\b/.test(lamp) && /data-lamp-lit=\{lit\}/.test(lamp) && /data-lamp-color=\{color\}/.test(lamp) && (lamp.match(/data-part="/g) ?? []).length === 4);

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
