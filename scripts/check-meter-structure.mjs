#!/usr/bin/env node
/**
 * Meter structural contract check — Task 1.5.
 *
 * Dependency-free guard (Node built-ins only), matching check:knob,
 * check:fader, check:switch and the other check:* scripts. No test framework
 * is added; the project has none and this task must not introduce one.
 *
 * It does NOT test behaviour or rendering: the needle's swing, the lamp's
 * glow, the segments' colours, the slider and the accessible values were
 * exercised in a real browser and are reported in task-reports/1.5-report.md.
 * What it tests is the source contract of hardware spec §4:
 *
 *   1. TWO separate components — VUMeter.svelte and LedLadder.svelte — in
 *      src/components/hardware/, neither importing the other, neither a
 *      "mode" of the other, both coloured only through the Task 1.1 tokens
 *      plus neutral black/white alphas.
 *   2. The analog meter (§4a): a dark walnut housing with a brass trim bead
 *      and a near-black bezel; a cream card that is never pure white; an
 *      arc-shaped scale whose ticks radiate from a pivot BELOW the card's
 *      centre; numerals at key points only; a red band from 0 to +3; "VU" at
 *      the bottom centre; a thin black needle with a blurred drop shadow,
 *      rotating about the pivot with a smooth transition and never past the
 *      end stops; the standard VU law (linear in modulation percentage).
 *   3. The illumination (§4a, critical): the lamp token, inside the spec's
 *      amber/gold range; drawn as blurred irregular shapes with LARGE blur
 *      radii and different centres — never a flat fill, never one uniform
 *      radial gradient; a grain; an off-centre vignette; a drift that is
 *      small, slow and disabled under prefers-reduced-motion.
 *   4. The ladder (§4b): discrete segments, bottom-to-top green → amber → red,
 *      lit cumulatively from the bottom by one counting function; crisp
 *      edges (a hard seam, only a tight bloom); unlit segments still drawn
 *      and tinted; no cream, no wide blur — it must not borrow the VU look.
 *   5. Both are outputs: role="meter" with aria-valuenow/min/max/text, SVG
 *      hidden from the tree.
 *   6. The playground shows the VU meter at low/normal/high/overload with an
 *      interactive instance and a lamp comparison; the ladder at
 *      low/medium/high/peak with an interactive instance and a detail; the
 *      two in separate sections; every value labelled simulated; nothing
 *      outside the stated scope references either component; no token added.
 *
 * Run: npm run check:meter
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

const vuPath = "src/components/hardware/VUMeter.svelte";
const ledPath = "src/components/hardware/LedLadder.svelte";
check("the analog VU meter lives beside the knob, fader and switch", exists(vuPath));
check("the LED ladder is its own file beside it", exists(ledPath));
if (!exists(vuPath) || !exists(ledPath)) {
  console.error("  FAIL  a meter component file is missing");
  process.exit(1);
}

const vu = read(vuPath);
const led = read(ledPath);
const split = (src) => {
  const moduleScript = src.slice(0, src.indexOf("</script>"));
  const scriptStart = src.indexOf('<script lang="ts">');
  const script = src.slice(scriptStart, src.indexOf("</script>", scriptStart));
  const markup = src.slice(src.indexOf("<div", scriptStart), src.indexOf("<style>"));
  const style = src.slice(src.indexOf("<style>"));
  return { moduleScript, script, markup, style };
};
const V = split(vu);
const L = split(led);
const page = read("src/dev/DevComponentsPage.svelte");
const vuFixture = exists("src/dev/VUMeterFixture.svelte") ? read("src/dev/VUMeterFixture.svelte") : "";
const ledFixture = exists("src/dev/LedLadderFixture.svelte") ? read("src/dev/LedLadderFixture.svelte") : "";
const knob = read("src/components/hardware/Knob.svelte");
const fader = read("src/components/hardware/Fader.svelte");
const sw = read("src/components/hardware/TactileSwitch.svelte");
const css = read("src/lib/tokens.css");
const pkg = JSON.parse(read("package.json"));

/** The declarations of one CSS rule (first match of the selector). */
const rule = (style, selector) => {
  const i = style.indexOf(`${selector} {`);
  if (i < 0) return "";
  return style.slice(i, style.indexOf("}", i));
};
const num = (src, name) => Number((new RegExp(`const ${name} = (-?[\\d.]+)`).exec(src) ?? [])[1] ?? NaN);
/** Hex colours in a source, ignoring neutral black/white (light modelling alphas). */
const foreignHex = (src) =>
  [...new Set((src.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).map((h) => h.toLowerCase()))].filter(
    (h) => !["#000", "#000000", "#fff", "#ffffff"].includes(h),
  );

// --- 1. Two components, separate. ------------------------------------------------
check("the VU meter does not import, mention or render the ladder", !/LedLadder|ledLitCount|segment/i.test(vu));
check("the ladder does not import, mention or render the VU meter", !/VUMeter|vuAngle|needle|incandescent/i.test(led));
check("neither component has a mode or variant prop that would make it the other", !/variant|mode\s*[=:]/.test(V.script) && !/variant|mode\s*[=:]/.test(L.script));
check("no third 'Meter' component merges them", !exists("src/components/hardware/Meter.svelte") && !/import .*Meter\.svelte/.test(page));
check("the VU meter carries no colour of its own: tokens and neutral alphas only", foreignHex(vu).length === 0, foreignHex(vu).join(" "));
check("the ladder carries no colour of its own: tokens and neutral alphas only", foreignHex(led).length === 0, foreignHex(led).join(" "));
check("no new design token was added for either meter", !/--al-(vu|meter|led|ladder|needle)/.test(css) && !/--al-(vu|meter|led|ladder|needle)/.test(vu) && !/--al-(vu|meter|led|ladder|needle)/.test(led));
check(
  "each scales as a whole from one host-settable width, like the fader",
  /width: var\(--vu-width, 7\.5rem\)/.test(V.style) && /width: var\(--ladder-width, 3rem\)/.test(L.style) && !/--vu-width:/.test(V.style) && !/--ladder-width:/.test(L.style),
);
check("both draw one SVG at 1 px = 1 unit", /viewBox=\{`0 0 \$\{W\} \$\{H\}`\}/.test(V.markup) && /viewBox=\{`0 0 \$\{W\} \$\{H\}`\}/.test(L.markup));

// --- 2. The analog meter: housing, card, scale, needle. -------------------------------
check(
  "the housing is dark walnut from the wood and recess tokens, lit top to foot",
  /--v-housing-top: color-mix\(in srgb, var\(--al-material-wood\) \d+%, var\(--al-material-recess\)\)/.test(V.style) &&
    /--v-housing-bottom: color-mix\(in srgb, var\(--al-material-wood\) \d+%, var\(--al-material-recess\)\)/.test(V.style) &&
    /id=\{`\$\{uid\}-housing`\}/.test(V.markup),
);
check("the housing has a bevel: a light top-left edge turning to a shadowed bottom-right", /id=\{`\$\{uid\}-bevel`\} x1="0" y1="0" x2="1" y2="1"/.test(V.markup) && /class="vu__housing-bevel"/.test(V.markup));
check(
  "a thin brass trim bead separates the frame from the face, with its own shadow line",
  /--v-trim: color-mix\(in srgb, var\(--al-function-amber-base\) \d+%, var\(--al-material-metal\)\)/.test(V.style) &&
    /data-part="trim"/.test(V.markup) &&
    /class="vu__trim-shadow"/.test(V.markup) &&
    /\.vu__trim \{[^}]*stroke-width: 0\.9/.test(V.style),
);
check("a near-black inner bezel sits between the bead and the card", /--v-bezel: var\(--al-material-recess\)/.test(V.style) && /data-part="bezel"/.test(V.markup));
check(
  "the window is recessed: the bezel's lip casts onto the card along the top, left and right, and the glass has a dark seam",
  /id=\{`\$\{uid\}-lip-top`\}/.test(V.markup) && /id=\{`\$\{uid\}-lip-left`\}/.test(V.markup) && /id=\{`\$\{uid\}-lip-right`\}/.test(V.markup) && (V.markup.match(/class="vu__lip"/g) ?? []).length === 3 && /class="vu__seam"/.test(V.markup),
);
check(
  "the card is the cream token, never white: lit it is cream slightly yellowed by the lamp, unlit it is cream in shadow",
  /--v-card-lit: color-mix\(in srgb, var\(--al-material-cream\) \d+%, var\(--al-material-lamp\)\)/.test(V.style) &&
    /--v-card-unlit: color-mix\(in srgb, var\(--al-material-cream\) \d+%, black\)/.test(V.style) &&
    !/fill: #fff;?\s*\n\s*\}/.test(rule(V.style, ".vu__card")) &&
    !/white/.test(rule(V.style, ".vu__wash")),
);
const FACE_Y = num(V.script, "FACE_Y");
const FACE_H = num(V.script, "FACE_H");
const PIVOT_Y = num(V.script, "PIVOT_Y");
const PIVOT_X = num(V.script, "PIVOT_X");
const W = num(V.script, "W");
check(
  "the needle's pivot is below the centre of the card and on its axis",
  PIVOT_Y > FACE_Y + FACE_H / 2 && PIVOT_Y < FACE_Y + FACE_H && PIVOT_X === W / 2,
  `pivot y ${PIVOT_Y}, card centre ${FACE_Y + FACE_H / 2}`,
);
check("the scale is an arc about that pivot, with ticks radiating from it", /const arc = \(r: number, fromDb: number, toDb: number\)/.test(V.script) && /polar\(ARC_R, a\)/.test(V.script) && /polar\(ARC_R \+ TICK\[mark\.weight\], a\)/.test(V.script) && /class="vu__arc"/.test(V.markup));
check(
  "the scale is the standard VU law: linear in modulation percentage, −20 to +3, red from 0",
  /export const VU_MIN = -20;/.test(V.moduleScript) && /export const VU_MAX = 3;/.test(V.moduleScript) && /export const VU_RED_FROM = 0;/.test(V.moduleScript) && /100 \* Math\.pow\(10, db \/ 20\)/.test(V.moduleScript),
);
check(
  "numerals are printed at key points only: a subset of the marks, with −20, 0 and +3 among them",
  (() => {
    const marks = [...V.moduleScript.matchAll(/\{ db: (-?\d+), weight: "(\w+)"(, numeral: true)? \}/g)];
    const numerals = marks.filter((m) => m[3]).map((m) => Number(m[1]));
    return marks.length >= 12 && numerals.length < marks.length && numerals.length <= 8 && [-20, 0, 3].every((v) => numerals.includes(v));
  })(),
);
check(
  "the overload band is red (the red family) from 0 to +3 and the numerals past 0 are red; the rest of the print is dark ink on cream",
  /d=\{arc\(ARC_R \+ 0\.35 \+ RED_BAND_W \/ 2, VU_RED_FROM, VU_MAX\)\}/.test(V.markup) &&
    /--v-red: color-mix\(in srgb, var\(--al-function-red-base\)/.test(V.style) &&
    /red: mark\.db > VU_RED_FROM/.test(V.script) &&
    /--v-ink: var\(--al-text-on-cream\)/.test(V.style) &&
    /\.vu__numeral\.is-red \{[^}]*fill: var\(--v-red\)/.test(V.style),
);
check('"VU" is printed at the bottom centre of the arc, above the hub', /data-part="legend" x=\{PIVOT_X\} y=\{PIVOT_Y - 15\.5\}>VU</.test(V.markup));
check(
  "the needle is a thin tapered black blade pivoting on a small circular hub",
  /const NEEDLE_TIP_W = 0\.5;/.test(V.script) && /const NEEDLE_BASE_W = 1\.7;/.test(V.script) && /--v-needle: color-mix\(in srgb, var\(--al-text-on-cream\) \d+%, black\)/.test(V.style) && /class="vu__hub" data-part="hub" cx=\{PIVOT_X\} cy=\{PIVOT_Y\} r=\{HUB_R\}/.test(V.markup) && num(V.script, "HUB_R") <= 4,
);
check(
  "the needle has a soft drop shadow on the card: the same blade, blurred, offset down and right, under the needle in paint order",
  /data-part="needle-shadow"/.test(V.markup) &&
    /id=\{`\$\{uid\}-needle-shadow`\}[\s\S]*?<feGaussianBlur stdDeviation="0\.9"/.test(V.markup) &&
    /translate\(var\(--vu-shadow-dx\), var\(--vu-shadow-dy\)\) rotate\(var\(--vu-angle\)\)/.test(V.style) &&
    V.markup.indexOf('data-part="needle-shadow"') < V.markup.indexOf('data-part="needle"') &&
    num(V.script, "SHADOW_DX") > 0 && num(V.script, "SHADOW_DY") > 0,
);
check(
  "the needle rotates about the pivot — origin given as fractions of the drawing against the viewBox — with a smooth, slightly overshooting transition",
  /transform-box: view-box;/.test(V.style) && /transform-origin: var\(--vu-pivot\);/.test(V.style) && /style:--vu-pivot=\{pivotOrigin\}/.test(V.markup) && /transition: transform 360ms cubic-bezier\(0\.22, 1\.16, 0\.4, 1\);/.test(V.style),
);
check("the needle never leaves the scale: the position function clamps to the end stops", /const clamped = Math\.min\(VU_MAX, Math\.max\(VU_MIN, db\)\);/.test(V.moduleScript) && /vuAngle\(level\)/.test(V.script));
check("the needle's tip stays inside the card at both stops", (() => {
  const tip = num(V.script, "NEEDLE_TIP_R");
  const half = Math.SQRT1_2;
  const x = PIVOT_X + tip * half;
  const y = PIVOT_Y - tip * half;
  return x < num(V.script, "FACE_X") + num(V.script, "FACE_W") && y > FACE_Y && PIVOT_Y - tip > FACE_Y;
})());

// --- 3. The illumination. ---------------------------------------------------------------
const lampHex = (css.match(/--al-material-lamp: (#[0-9a-f]{6})/i) ?? [])[1] ?? "";
const inRange = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return r >= 0xe8 && r <= 0xf0 && g >= 0xa4 && g <= 0xc2 && b >= 0x54 && b <= 0x7a;
};
check("the bulb is the incandescent lamp token, which sits inside spec §4a's #e8a454–#f0c27a", /--v-lamp: var\(--al-material-lamp\)/.test(V.style) && inRange(lampHex), lampHex);
check("the hot core is the amber family warmed toward white — never a cool white", /--v-lamp-core: color-mix\(in srgb, var\(--al-function-amber-hi\) \d+%, white\)/.test(V.style) && !/bluegrey|#[0-9a-f]{0,2}(cc|dd|ee|ff)ff/i.test(V.style));
const blurs = [...V.markup.matchAll(/<filter id=\{`\$\{uid\}-blur-(\w+)`\}[^>]*>\s*<feGaussianBlur stdDeviation="([\d.]+)"/g)].map((m) => [m[1], Number(m[2])]);
check(
  "the glow is drawn as three Gaussian-blurred shapes with large radii (≥ 8 units on a 68-unit card), not a gradient",
  blurs.length === 3 && blurs.every(([, sd]) => sd >= 8) && blurs.some(([, sd]) => sd >= 13),
  blurs.map((b) => b.join(":")).join(" "),
);
const blobs = [...V.markup.matchAll(/data-part="glow-(\w+)"\s+d="([^"]+)"/g)].map((m) => {
  const nums = m[2].match(/-?[\d.]+/g).map(Number);
  const xs = nums.filter((_, i) => i % 2 === 0);
  const ys = nums.filter((_, i) => i % 2 === 1);
  return { part: m[1], cx: (Math.min(...xs) + Math.max(...xs)) / 2, cy: (Math.min(...ys) + Math.max(...ys)) / 2, w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), curves: (m[2].match(/C/g) ?? []).length };
});
const pool = blobs.find((b) => b.part === "pool");
const core = blobs.find((b) => b.part === "core");
const far = blobs.find((b) => b.part === "far");
check("the glow shapes are irregular paths (Bézier blobs), each a different size, not circles", blobs.length === 3 && blobs.every((b) => b.curves >= 3) && new Set(blobs.map((b) => Math.round(b.w))).size === 3 && !blobs.every((b) => Math.abs(b.w - b.h) < 1));
check(
  "the brightest region is a lower-centre point: the pool and the core sit low on the card, the core a little off the axis",
  !!pool && !!core && pool.cy > FACE_Y + FACE_H / 2 && core.cy > FACE_Y + FACE_H / 2 && Math.abs(pool.cx - PIVOT_X) < 8 && core.cx !== PIVOT_X && Math.abs(core.cx - PIVOT_X) < 10,
  blobs.map((b) => `${b.part}@${b.cx},${b.cy}`).join(" "),
);
check("the falloff is asymmetric: a third, fainter pool is off in the upper right, not mirrored", !!far && far.cx > PIVOT_X + 10 && far.cy < FACE_Y + FACE_H / 2 && /\.vu__glow-far \{[^}]*fill-opacity: 0\.[1-3]\d*/.test(V.style));
check("the vignette is off-centre and transparent across the middle, darkening only toward the corners", /id=\{`\$\{uid\}-vignette`\} cx="0\.5" cy="0\.7" r="0\.78" fx="0\.46" fy="0\.76"/.test(V.markup) && /<stop offset="46%" stop-color="#000000" stop-opacity="0" \/>/.test(V.markup));
check("the card has a frosted grain over the light (feTurbulence, monochrome, faint)", /<feTurbulence type="fractalNoise"/.test(V.markup) && /<feColorMatrix type="saturate" values="0" \/>/.test(V.markup) && /\.vu__grain \{[^}]*opacity: 0\.0\d+/.test(V.style));
check(
  "nothing in the illumination is a flat fill or a single uniform radial: the wash is translucent and the pools are blurred",
  /\.vu__wash \{[^}]*fill-opacity: 0\.[5-8]\d*/.test(V.style) && /class="vu__glow-pool"[\s\S]*?filter=\{`url\(#\$\{uid\}-blur-pool\)`\}/.test(V.markup) && !/radialGradient id=\{`\$\{uid\}-glow/.test(V.markup),
);
check(
  "the lamp can be off: the pools fade over a few hundred ms (warm-up and cool-down), the card stays and the print stays",
  /lamp = true,/.test(V.script) && /class:is-unlit=\{!lamp\}/.test(V.markup) && /\.vu\.is-unlit \.vu__lamp \{[^}]*opacity: 0;/.test(V.style) && /\.vu__lamp \{[^}]*transition: opacity 480ms/.test(V.style) && V.markup.indexOf('data-part="lamp"') < V.markup.indexOf('data-part="scale"'),
);
const driftStops = [...V.style.matchAll(/@keyframes vu-\w+-drift \{([\s\S]*?)\n  \}/g)].map((m) => (m[1].match(/opacity: ([\d.]+)/g) ?? []).map((s) => Number(s.slice(9))));
check(
  "the brightness drift is barely perceptible (within 5%), slow (periods ≥ 6 s), on two unrelated periods",
  driftStops.length === 2 && driftStops.every((stops) => stops.every((o) => o >= 0.95 && o <= 1)) && /animation: vu-bulb-drift 9\.7s/.test(V.style) && /animation: vu-core-drift 6\.3s/.test(V.style),
  JSON.stringify(driftStops),
);
check(
  "the drift is a prop (lampDrift), off with the lamp, and off under prefers-reduced-motion, where the needle also shortens its swing",
  /lampDrift = true,/.test(V.script) && /class:is-drifting=\{lamp && lampDrift\}/.test(V.markup) && /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*animation: none;[\s\S]*transition: transform 120ms ease-out;/.test(V.style),
);
check("there is no LED language in the VU meter: no segments, no crisp edges, no cool colours", !/crispEdges|segment|--al-function-(green|bluegrey)/.test(vu));

// --- 4. The ladder. -----------------------------------------------------------------------
const scale = [...L.moduleScript.matchAll(/\{ db: (-?\d+), band: "(\w+)"(, numeral: true)? \}/g)].map((m) => ({ db: Number(m[1]), band: m[2], numeral: !!m[3] }));
check("the default scale has at least twelve discrete segments, thresholds ascending bottom to top", scale.length >= 12 && scale.every((s, i) => i === 0 || s.db > scale[i - 1].db), `${scale.length} segments`);
check(
  "the bands run green → amber → red from the bottom up, each band contiguous, red at the top",
  scale.length > 0 && scale[0].band === "green" && scale[scale.length - 1].band === "red" && scale.map((s) => s.band).join(",").replace(/(green,)+/, "G").replace(/(amber,)+/, "A").replace(/(red,?)+/, "R") === "GAR",
);
check('the band type admits only "green" | "amber" | "red"', /export type LedBand = "green" \| "amber" \| "red";/.test(L.moduleScript));
check(
  "segments light cumulatively from the bottom: one counting function, contiguous by construction, used for both the drawing and the readout",
  /export function ledLitCount\(/.test(L.moduleScript) && /while \(lit < sorted\.length && level >= sorted\[lit\]\.db\) lit \+= 1;/.test(L.moduleScript) && /lit: i < lit,/.test(L.script) && /const lit = \$derived\(ledLitCount\(ordered, level\)\);/.test(L.script),
);
check("the three bands take their tones from the functional families — green, amber, red — and nothing else", ["green", "amber", "red"].every((b) => new RegExp(`--l-${b}-top: color-mix\\(in srgb, var\\(--al-function-${b}-hi\\)`).test(L.style) && new RegExp(`--l-${b}-bottom: color-mix\\(in srgb, var\\(--al-function-${b}-base\\) \\d+%, var\\(--al-function-${b}-lo\\)\\)`).test(L.style)) && !/--al-function-(cream|bluegrey|orange)/.test(led));
check(
  "a lit segment is a lens over a die: a HI-to-BASE gradient, a hairline highlight on its top edge, a hard dark seam round it",
  /id=\{`\$\{uid\}-lit-\$\{band\}`\} x1="0" y1="0" x2="0" y2="1"/.test(L.markup) && /class="led__lens"/.test(L.markup) && /\.led__die \{[^}]*stroke: #000;[^}]*stroke-width: 0\.5;/.test(L.style),
);
check(
  "unlit segments are still drawn, in the band's own tint deep in the recess, with the same seam — visible but not lit",
  ["green", "amber", "red"].every((b) => new RegExp(`--l-${b}-off: color-mix\\(in srgb, var\\(--al-function-${b}-lo\\) \\d+%, var\\(--al-material-recess\\)\\)`).test(L.style)) && /fill=\{row\.lit \? `url\(#\$\{uid\}-lit-\$\{row\.band\}\)` : `var\(--l-\$\{row\.band\}-off\)`\}/.test(L.markup),
);
const ladderBlurs = [...L.markup.matchAll(/<feGaussianBlur stdDeviation="([\d.]+)"/g)].map((m) => Number(m[1]));
check("the only blur in the ladder is the tight bloom behind a lit block (≤ 2 units): edges stay crisp", ladderBlurs.length === 1 && ladderBlurs[0] <= 2 && /\.led__segment\.is-lit \.led__bloom \{[^}]*opacity: 0\.\d+/.test(L.style) && /\.led__bloom \{[^}]*opacity: 0;/.test(L.style), ladderBlurs.join(" "));
check("an LED is instant: no ballistics, transitions of 60 ms or none", /transition: opacity 60ms linear;/.test(L.style) && !/transition: transform/.test(L.style) && !/cubic-bezier/.test(L.style));
check("the ladder borrows nothing from the VU look: no cream, no lamp token, no wash, no vignette, no turbulence", !/--al-material-cream|--al-material-lamp|vignette|feTurbulence|wash/.test(L.markup + L.style));
check("the ladder sits in a recessed well built like the fader's slot", /data-part="well"/.test(L.markup) && /class="led__well-lip-dark"/.test(L.markup) && /class="led__well-inner"/.test(L.markup) && /--l-floor: var\(--al-material-recess\)/.test(L.style));
check("dB numerals are printed beside the key segments, the fader's convention, clear of their ticks", /data-part="print"/.test(L.markup) && /const NUMERAL_X = TICK_X2 \+ 3;/.test(L.script) && /\.led__numeral \{[^}]*font-family: var\(--al-font-mono\)/.test(L.style) && scale.filter((s) => s.numeral).length < scale.length);
check("the printed numerals are unsigned — tick, number — by owner direction; the sign stays in the spoken value", /const printed = \(db: number\): string => String\(Math\.abs\(db\)\);/.test(L.script) && /\{printed\(row\.db\)\}<\/text>/.test(L.markup) && /numeral\(Math\.round\(level\)\)/.test(L.script));
check("the lit count and the band of the top lit segment are exposed as data attributes", /data-led-lit=\{lit\}/.test(L.markup) && /data-led-top-band=\{topBand\}/.test(L.markup) && /data-led-segment-lit=\{row\.lit\}/.test(L.markup));

// --- 5. Both are outputs: a meter role with a value. ------------------------------------------
for (const [name, M, dataAttr] of [["VU meter", V, "data-vu-meter"], ["ladder", L, "data-led-meter"]]) {
  check(
    `the ${name} is role="meter" with min, max, now and a spoken value, and its SVG is hidden from the tree`,
    new RegExp(`role="meter"[\\s\\S]*?aria-valuemin=[\\s\\S]*?aria-valuemax=[\\s\\S]*?aria-valuenow=[\\s\\S]*?aria-valuetext=\\{valueText\\}[\\s\\S]*?${dataAttr}`).test(M.markup) && /<svg[^>]*aria-hidden="true"/.test(M.markup),
  );
  check(`the ${name} takes a name: label or an explicit accessible name`, /aria-label=\{name \?\? label \?\? "/.test(M.markup));
  check(`the ${name} has no interaction: no pointer or key handlers, no tabindex, no button`, !/onpointer|onkeydown|tabindex|<button|<input/.test(M.markup));
  check(`the ${name} has an engraved label under it in the knob's and fader's style`, /font-family: var\(--al-font-label\);[\s\S]*?letter-spacing: var\(--al-letter-spacing-engraved\);/.test(rule(M.style, name === "VU meter" ? ".vu__label" : ".led__label")));
}
check("the VU meter's spoken value says when it is in the red and when the lamp is off", /in the red/.test(V.script) && /lamp off/.test(V.script));
check("the ladder's spoken value gives the lit count out of the total", /\$\{lit\} of \$\{count\} segments lit/.test(L.script));

// --- 6. The playground. -------------------------------------------------------------------------
check("the page uses each component through its own fixture, once", (vuFixture.match(/<VUMeter\b/g) ?? []).length === 1 && (ledFixture.match(/<LedLadder\b/g) ?? []).length === 1 && !/<VUMeter\b|<LedLadder\b/.test(page));
check("the two meters are in two separate sections, the ladder's set apart by a rule", /data-dev-component="vu-meter"/.test(page) && /data-dev-component="led-ladder"/.test(page) && /\.dev-section--ladder \{[^}]*border-top/.test(page));
check(
  "the VU meter is shown at low, normal, high and overload, with an interactive instance and a lit/unlit comparison",
  /data-dev-vu-positions/.test(page) && ["vu-low", "vu-normal", "vu-high", "vu-overload"].every((id) => page.includes(`id: "${id}"`)) && /id: "vu-live",[\s\S]*?interactive: true/.test(page) && /id: "vu-lamp-unlit",[\s\S]*?lamp: false/.test(page) && /data-dev-vu-lamp/.test(page),
);
check(
  "the VU positions are low, normal, high and overload in dB VU, the overload inside the red band",
  (() => {
    const lv = (id) => Number((new RegExp(`id: "${id}",[\\s\\S]*?level: (-?[\\d.]+)`).exec(page) ?? [])[1]);
    return lv("vu-low") <= -20 && lv("vu-normal") < 0 && lv("vu-normal") > -20 && lv("vu-high") >= -1 && lv("vu-high") <= 0 && lv("vu-overload") > 0 && lv("vu-overload") <= 3;
  })(),
);
check(
  "the ladder is shown at low, medium, high and peak, with an interactive instance and an enlarged detail",
  /data-dev-led-levels/.test(page) && ["led-low", "led-medium", "led-high", "led-peak"].every((id) => page.includes(`id: "${id}"`)) && /id: "led-live",[\s\S]*?interactive: true/.test(page) && /data-dev-led-detail/.test(page) && /id: "led-detail",[\s\S]*?scale: 2\.5/.test(page),
);
check(
  "the ladder levels cross the bands: low green only, medium into amber, high at the top of amber, peak into red",
  (() => {
    const lv = (id) => Number((new RegExp(`id: "${id}",[\\s\\S]*?level: (-?[\\d.]+)`).exec(page) ?? [])[1]);
    const band = (db) => { let b = "none"; for (const s of scale) if (db >= s.db) b = s.band; return b; };
    return band(lv("led-low")) === "green" && band(lv("led-medium")) === "amber" && band(lv("led-high")) === "amber" && lv("led-high") > lv("led-medium") && band(lv("led-peak")) === "red";
  })(),
);
check("the interactive fixtures have a range control, presets and (for the VU meter) a lamp switch, each labelled simulated", /data-vu-fixture-range/.test(vuFixture) && /data-vu-fixture-preset/.test(vuFixture) && /data-vu-fixture-lamp\b/.test(vuFixture) && /data-led-fixture-range/.test(ledFixture) && /data-led-fixture-preset/.test(ledFixture) && /Simulated level \(demo only\)/.test(vuFixture) && /Simulated level \(demo only\)/.test(ledFixture) && /Lamp \(simulated power\)/.test(vuFixture));
check("every caption says the value is simulated and the ladder's caption counts the lit segments", /simulated \{numeral\(level\)\} VU/.test(vuFixture) && /simulated \{numeral\(level\)\} dB → \{lit\} of \{count\} lit/.test(ledFixture));
check("the page says plainly that nothing is measured and nothing is connected", /Every level on this page is <strong>simulated<\/strong>/.test(page) && /not connected to any audio, analysis or project state/.test(page) && /Every level below is SIMULATED/.test(page));
check("the page says the LED look is for a secondary ladder only, never the master VU meters", /never for the master VU meters/.test(page));
check("the knob, fader and switch sections are still there, unchanged in structure", /data-dev-component="knob"/.test(page) && /data-dev-component="fader"/.test(page) && /data-dev-component="switch"/.test(page) && /data-dev-knob-states/.test(page) && /data-dev-fader-states/.test(page) && /data-dev-switch-cap-states/.test(page));
check("the route is still the private hash route", /dev\/components/.test(read("src/lib/rooms.ts")));
check(
  "no room, strip or shared-state module references either meter",
  ["src/rooms/ConsoleRoom.svelte", "src/rooms/ArrangeRoom.svelte", "src/rooms/MixerRoom.svelte", "src/components/ChannelStrip.svelte", "src/components/ChannelBank.svelte", "src/components/MixerChannelStrip.svelte", "src/components/MixerDetailPanel.svelte", "src/components/MiniTransport.svelte", "src/lib/mixer.ts", "src/lib/arrange.ts"]
    .filter(exists)
    .every((rel) => !/VUMeter|LedLadder/.test(read(rel))),
);
check("the knob, the fader and the switch do not know the meters exist", !/VUMeter|LedLadder/.test(knob) && !/VUMeter|LedLadder/.test(fader) && !/VUMeter|LedLadder/.test(sw));
check("neither meter touches audio: no AudioContext, no AnalyserNode, no buffers", !/AudioContext|Analyser|AudioBuffer|getByteFrequencyData|requestAnimationFrame/.test(vu + led + vuFixture + ledFixture));
check("check:meter is wired into package.json", pkg.scripts?.["check:meter"] === "node scripts/check-meter-structure.mjs");
// Task 1.6 delivered the shared Lamp and EngravedLabel, so no Phase 1 component is a later-task file any more; kept with an empty list for the next phase.
check("no later-task component was built", ![].some(exists));

// --- Report. -------------------------------------------------------------------
for (const name of passes) console.log(`  PASS  ${name}`);

if (failures.length > 0) {
  console.error("");
  for (const failure of failures) console.error(`  FAIL  ${failure}`);
  console.error("");
  console.error(`Meter contract check — ${passes.length}/${passes.length + failures.length} passed`);
  process.exit(1);
}

console.log(`\nMeter contract check — ${passes.length}/${passes.length} passed`);
