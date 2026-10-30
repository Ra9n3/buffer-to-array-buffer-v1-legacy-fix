#!/usr/bin/env node
/**
 * Fader component structural contract check — Task 1.3.
 *
 * Dependency-free guard (Node built-ins only), matching check:knob and the
 * other check:* scripts. No test framework is added; the project has none and
 * this task must not introduce one.
 *
 * It does NOT test behaviour or rendering: drag, keyboard, numeric entry,
 * the disabled state, travel limits and the visual result were exercised in a
 * real browser at four viewport widths and are reported in
 * task-reports/1.3-report.md. What it tests is the source contract:
 *
 *   1. ONE reusable component, coloured only through the Task 1.1 tokens:
 *      the cream family for the cap, the material tokens for the nickel and
 *      the recess. No colour of its own beyond neutral black/white alphas.
 *   2. The cap is the ribbed console cap of the owner's round-4 photo at the
 *      owner's chosen 25 x 32 (decisions-log D1.3.6): rounded corners, a
 *      bevelled rim, a concave face that is a vertical gradient shaded above
 *      and lit below, eight grooves and a dark indicator line across the
 *      middle — not a flat fill with one highlight.
 *   3. The slot is a recess (floor, lips, inner shadow), no shaft is drawn
 *      above or below the cap, and the print (ticks, numerals) is drawn
 *      outside the moving group, so it cannot move.
 *   4. The carriage translates only, and the slot outruns the cap at both
 *      limits, so the cap can never leave the track.
 *   5. The console taper is monotonic, puts unity near three quarters of the
 *      travel, and can be switched off (linear law).
 *   6. The five required states, keyboard, pointer and numeric entry exist
 *      and follow the knob's conventions.
 *   7. The playground shows the states and a range of positions; nothing
 *      outside the stated scope references the fader; no token was added.
 *
 * Run: npm run check:fader
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

const faderPath = "src/components/hardware/Fader.svelte";
check("the fader lives beside the knob in src/components/hardware/", exists(faderPath));
if (!exists(faderPath)) {
  console.error("  FAIL  src/components/hardware/Fader.svelte is missing");
  process.exit(1);
}

const fader = read(faderPath);
const script = fader.slice(0, fader.indexOf("</script>", fader.indexOf('<script lang="ts">')));
const markup = fader.slice(fader.indexOf("<div"), fader.indexOf("<style>"));
const style = fader.slice(fader.indexOf("<style>"));
const page = read("src/dev/DevComponentsPage.svelte");
const fixture = exists("src/dev/FaderFixture.svelte") ? read("src/dev/FaderFixture.svelte") : "";
const knob = read("src/components/hardware/Knob.svelte");
const css = read("src/lib/tokens.css");
const pkg = JSON.parse(read("package.json"));

const num = (name) => {
  const m = new RegExp(`const ${name}\\s*=\\s*(-?[0-9.]+)`).exec(fader);
  return m ? Number(m[1]) : NaN;
};

// --- 1. One component, tokens only. ------------------------------------------
check(
  "the cap takes its three cream roles through functionToken()",
  ["hi", "base", "lo"].every((role) => fader.includes(`functionToken("cream", "${role}")`)),
);
check(
  "no colour of its own: every hex literal is neutral black or white",
  (fader.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).every((h) =>
    ["#000", "#000000", "#fff", "#ffffff"].includes(h.toLowerCase()),
  ),
  "a non-neutral hex value would be a colour the token system does not own",
);
check(
  "the recess, its lips and the print come from the material and bevel tokens",
  style.includes("var(--al-material-recess)") &&
    style.includes("var(--al-material-metal)") &&
    style.includes("var(--al-bevel-light)") &&
    style.includes("var(--al-bevel-shadow)"),
);
check(
  "no new design token was declared for the fader",
  !/--al-fader/.test(css) && !/--al-cap-/.test(css),
  "Task 1.3 identified no missing token; one here would need a justification in the report",
);
check(
  "the component imports only svelte and the token module",
  [...script.matchAll(/from\s+"([^"]+)"/g)].every((m) => m[1] === "svelte" || m[1] === "../../lib/tokens"),
);

// --- 2. The ribbed cap. -------------------------------------------------------
const CAP_W = num("CAP_W");
const CAP_H = num("CAP_H");
const CAP_RX = num("CAP_RX");
const CAP_RIM = num("CAP_RIM");
const LINE_H = num("LINE_H");
const RIB_PITCH = num("RIB_PITCH");
const RIBS_PER_HALF = num("RIBS_PER_HALF");
const RIB_CUT = num("RIB_CUT");
const RIB_CREST = num("RIB_CREST");
// Round 4: the owner supplied a photo of the cap they want and chose its
// proportion, 25 x 32 — taller than wide, overriding spec §3's 2.5–3 : 1 (and
// round 3's 25 x 20). The check pins the owner's size so a later task cannot
// silently "correct" it in either direction (decisions-log D1.3.6).
check(
  "the cap is the owner's chosen 25 x 32 (round 4 photo; overrides spec §3's 2.5–3 : 1)",
  CAP_W === 25 && CAP_H === 32,
  `found ${CAP_W} x ${CAP_H}; changing this needs the owner, not a spec re-read`,
);
check(
  "the cap's corners are rounded, not square, and small like the photo's",
  CAP_RX >= 2 && CAP_RX <= 0.2 * CAP_W,
  `rx ${CAP_RX} on ${CAP_W} x ${CAP_H}`,
);
check(
  "a bevelled rim runs round the face, and the face is inset by it",
  CAP_RIM > 0 &&
    /const FACE_W = CAP_W - 2 \* CAP_RIM/.test(script) &&
    /const FACE_H = CAP_H - 2 \* CAP_RIM/.test(script) &&
    /class="fader__cap-rim"[\s\S]*?fill=\{`url\(#\$\{uid\}-rim\)`\}/.test(markup) &&
    /class="fader__cap-face"[\s\S]*?fill=\{`url\(#\$\{uid\}-face\)`\}/.test(markup),
);

const face = (() => {
  const a = fader.indexOf("-face`}");
  const b = fader.indexOf("</linearGradient>", a);
  return a > 0 && b > a ? fader.slice(a, b) : "";
})();
const stops = [...face.matchAll(/offset="(\d+)%"\s+style="stop-color:\s*var\((--f-[a-z-]+)\)"/g)].map(
  (m) => [Number(m[1]), m[2]],
);
check(
  "the face is one vertical gradient with the light model in its stops (six or more)",
  /x1="0" y1="0" x2="0" y2="1"/.test(face) && stops.length >= 6,
  `${stops.length} stops found`,
);
check(
  "the face is concave the way the light says: upper half held in shade, lower half lit to near HI",
  (() => {
    const upper = stops.filter(([, v]) => v === "--f-face-upper").map(([o]) => o);
    const crest = stops.find(([, v]) => v === "--f-face-crest")?.[0];
    return upper.length >= 2 && Math.min(...upper) <= 15 && Math.max(...upper) >= 40 && crest !== undefined && crest >= 85;
  })(),
);
check(
  "the rim's top edge is the cream HI tone, the shaded face is near the cream LO tone, the line is near black",
  /--f-rim-top:\s*var\(--cap-hi\)/.test(style) &&
    /--f-face-upper:\s*color-mix\(in srgb, var\(--cap-base\) [12]\d%, var\(--cap-lo\)\)/.test(style) &&
    /--f-face-crest:\s*color-mix\(in srgb, var\(--cap-hi\) [89]\d%/.test(style) &&
    /--f-line:\s*color-mix\(in srgb, var\(--cap-lo\) [1-3]\d%, black\)/.test(style),
);
check(
  "the face is NOT a flat fill: no cap rect paints with the cream base alone",
  !/fader__cap-(rim|face)[\s\S]{0,400}fill="var\(--cap-base\)"/.test(markup),
);
check(
  "four grooves above the line and four below, 3 px apart, each a cut with a lit lower wall",
  RIBS_PER_HALF === 4 &&
    RIB_PITCH === 3 &&
    RIB_CUT > 0 &&
    RIB_CREST > 0 &&
    RIB_CUT + RIB_CREST < RIB_PITCH &&
    /\[-1, 1\]\.flatMap/.test(script) &&
    /\{#each grooves as groove \(groove\.y\)\}/.test(markup) &&
    /class="fader__cap-groove"/.test(markup) &&
    /class="fader__cap-crest"/.test(markup),
);
check(
  "the grooves are deeper in the shaded half than in the lit half (black/white alphas, no colour of their own)",
  (() => {
    const op = (sel) => Number(style.match(new RegExp(sel.replace(/[.\\]/g, "\\$&") + "\\s*\\{[^}]*fill-opacity:\\s*([\\d.]+)", "s"))?.[1]);
    const groove = op(".fader__cap-groove"), grooveUp = op(".fader__cap-groove.is-upper");
    const crest = op(".fader__cap-crest"), crestUp = op(".fader__cap-crest.is-upper");
    return grooveUp > groove && crest > crestUp && /\.fader__cap-groove\s*\{[^}]*fill:\s*#000/s.test(style) && /\.fader__cap-crest\s*\{[^}]*fill:\s*#fff/s.test(style);
  })(),
);
check(
  "one indicator line across the middle of the face: a deep groove spanning the face, centred on the cap",
  LINE_H >= 1.5 &&
    /class="fader__cap-line"[\s\S]*?x=\{-FACE_W \/ 2\}[\s\S]*?y=\{-LINE_H \/ 2\}[\s\S]*?width=\{FACE_W\}[\s\S]*?height=\{LINE_H\}/.test(markup) &&
    /\.fader__cap-line\s*\{[^}]*fill:\s*var\(--f-line\)/s.test(style),
);
check(
  "the grooves and the line are clipped to the face, inside the rim",
  /clip-path=\{`url\(#\$\{uid\}-face-clip\)`\} data-part="cap-grooves"/.test(markup) &&
    /id=\{`\$\{uid\}-face-clip`\}[\s\S]*?rx=\{FACE_RX\}/.test(fader),
);
check(
  "the cap has a front wall below the rim, and a hairline edge so the corners read",
  /class="fader__cap-wall"/.test(markup) && /-wall`\}/.test(fader) && /class="fader__cap-edge"/.test(markup),
);
check(
  "the cap lights its left end and catches a specular at its top edge; the old finger-hollow pool is gone",
  /class="fader__cap-ends"/.test(markup) && /class="fader__cap-spec"/.test(markup) && !/cap-pool|cap-hollow|-hollow`/.test(fader),
);

// --- 3. Slot, shaft, print. ---------------------------------------------------
check(
  "the slot is a recess: dark floor, dark top-left lip, lit bottom-right lip, inner shadow",
  /class="fader__slot-floor"/.test(markup) &&
    /class="fader__slot-lip-dark"/.test(markup) &&
    /class="fader__slot-lip-light"/.test(markup) &&
    /class="fader__slot-inner"[\s\S]*?filter=\{`url\(#\$\{uid\}-soft\)`\}/.test(markup),
);
check(
  "the inner shadow is clipped to the slot, so it cannot spill onto the panel",
  /clip-path=\{`url\(#\$\{uid\}-slot-clip\)`\}[\s\S]*?class="fader__slot-inner"/.test(markup),
);
// Round 2: the owner asked for the shaft segments above and below the cap to
// go. The cap now rides directly in the slot; nothing metal is drawn on it.
check(
  "no shaft is drawn above or below the cap (owner direction, round 2)",
  !/data-part="shaft"/.test(markup) && !/SHAFT_/.test(script) && !/-shaft`/.test(fader),
);

const scaleBlock = (() => {
  const a = markup.indexOf('data-part="scale"');
  const b = markup.indexOf('data-part="slot"');
  return a > 0 && b > a ? markup.slice(a, b) : "";
})();
const carriageBlock = (() => {
  const a = markup.indexOf('data-part="carriage"');
  const b = markup.indexOf('data-part="focus"');
  return a > 0 && b > a ? markup.slice(a, b) : "";
})();
check(
  "ticks and numerals are drawn in the panel plane, outside the moving group",
  scaleBlock.length > 0 &&
    /class="fader__ticks"/.test(scaleBlock) &&
    /class="fader__numeral"/.test(scaleBlock) &&
    !/capCy/.test(scaleBlock) &&
    !/fader__ticks|fader__numeral/.test(carriageBlock),
);
check(
  "the print follows the knob's convention: metal-grey ticks, faint minors, heavier majors",
  /\.fader__ticks line\s*\{[^}]*stroke:\s*var\(--al-material-metal\)[^}]*stroke-opacity:\s*0\.45/s.test(style) &&
    /\.fader__ticks line\.is-major\s*\{[^}]*stroke-opacity:\s*0\.9/s.test(style) &&
    /\.knob__ticks line\s*\{[^}]*stroke-opacity:\s*0\.45/s.test(knob),
);
check(
  "numerals are tabular mono in the secondary text colour, with a panel-coloured halo",
  /\.fader__numeral\s*\{[^}]*fill:\s*var\(--al-text-secondary\)[^}]*font-family:\s*var\(--al-font-mono\)[^}]*paint-order:\s*stroke/s.test(style),
);
check(
  "unity is printed as a reference mark, like the knob's reference dot",
  /class:is-reference=\{referenceY !== null && mark\.v === 0\}/.test(markup) && /\.is-reference\s*\{/.test(style),
);
check(
  "numerals that would collide with an end label give way to it",
  /NUMERAL_CLEARANCE/.test(script) && /inner\.filter\(clear\)/.test(script),
);

// --- 4. Travel. ----------------------------------------------------------------
const SLOT_OVER = num("SLOT_OVER");
check(
  "the slot outruns the cap at both limits, so the track stays visible and the cap cannot leave it",
  SLOT_OVER > 0 &&
    /const CY_MAX = TOP \+ SLOT_OVER \+ CAP_H \/ 2/.test(script) &&
    /const SLOT_H = \$derived\(travel \+ CAP_H \+ 2 \* SLOT_OVER\)/.test(script),
);
check(
  "the carriage translates only — no rotation, no reshaping",
  /data-part="carriage" transform=\{`translate\(\$\{SLOT_CX\} \$\{capCy\}\)`\}/.test(markup) &&
    !/rotate\(/.test(markup) &&
    !/scale\(/.test(carriageBlock),
);
check(
  "the cap position is the value's fraction of the travel, bottom-up",
  /const capCy = \$derived\(CY_MIN - fraction \* travel\)/.test(script),
);
check(
  "every write clamps into [min, max]",
  /Math\.min\(max, Math\.max\(min, next\)\)/.test(script) && /Math\.min\(max, Math\.max\(min, snapped\)\)/.test(script),
);
check(
  "the drawing scales from one host-settable width, which the component reads but does not declare",
  /width:\s*var\(--fader-width,\s*4\.5rem\)/.test(style) && !/^\s*--fader-width:/m.test(style),
);

// --- 5. The law. ---------------------------------------------------------------
const taper = (() => {
  const a = fader.indexOf("CONSOLE_TAPER: readonly TaperPoint[] = [");
  const b = fader.indexOf("];", a);
  return [...fader.slice(a, b).matchAll(/\[(-?[0-9.]+),\s*(-?[0-9.]+)\]/g)].map((m) => [Number(m[1]), Number(m[2])]);
})();
check(
  "the console taper is exported, spans 0 → 1, and is strictly monotonic in both columns",
  taper.length >= 6 &&
    taper[0][1] === 0 &&
    taper[taper.length - 1][1] === 1 &&
    taper.every((p, i) => i === 0 || (p[0] > taper[i - 1][0] && p[1] > taper[i - 1][1])) &&
    /export const CONSOLE_TAPER/.test(fader),
);
check(
  "unity sits near three quarters of the travel (0.70–0.78)",
  (() => {
    const unity = taper.find(([v]) => v === 0);
    return unity !== undefined && unity[1] >= 0.7 && unity[1] <= 0.78;
  })(),
);
check(
  "the law can be switched off: taper = null is the linear law",
  /if \(!law\) return \(clamped - min\) \/ span;/.test(script) && /if \(!law\) return min \+ clamped \* span;/.test(script),
);
check(
  "value → fraction and fraction → value go through the same table",
  /function tablePosition/.test(script) && /function tableValue/.test(script) && /tableValue\(law, lo \+ clamped \* \(hi - lo\)\)/.test(script),
);

// --- 6. States and interactions. -----------------------------------------------
check(
  "the track is an accessible vertical slider",
  /role="slider"/.test(markup) &&
    /aria-orientation="vertical"/.test(markup) &&
    ["aria-valuemin={min}", "aria-valuemax={max}", "aria-valuenow={value}", "aria-valuetext={display}", "aria-disabled={disabled}", "aria-label={label}"].every((a) => markup.includes(a)),
);
check(
  "disabled leaves the tab order and ignores pointer, keyboard and the editor",
  /tabindex=\{disabled \? -1 : 0\}/.test(markup) &&
    (script.match(/if \(disabled/g) ?? []).length >= 3 &&
    /disabled=\{disabled\}/.test(markup),
);
check(
  "pointer drag uses pointer capture and relative, one-to-one travel",
  /setPointerCapture\(event\.pointerId\)/.test(script) &&
    /releasePointerCapture/.test(script) &&
    /onpointerdown=\{onPointerDown\}/.test(markup) &&
    /onpointercancel=\{endDrag\}/.test(markup) &&
    /\(startY - event\.clientY\) \/ \(travel \* pxPerUnit\)/.test(script) &&
    /touch-action:\s*none/.test(style),
);
check(
  "keyboard: arrows, Page Up/Down, Home/End, Enter/F2 to type, Shift for fine",
  ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End", "Enter", "F2"].every((k) =>
    script.includes(`case "${k}":`),
  ) && /nudge\(stepSize, fine\)/.test(script),
);
check(
  "a fine (Shift) write is limited by precision, not snapped back to the step grid",
  /function setValue\(next: number, fine = false\)/.test(script) && /!fine && step > 0/.test(script),
);
check(
  "numeric entry: a value button opens a decimal input; Enter commits, Escape cancels, blur commits",
  /data-fader-value/.test(markup) &&
    /data-fader-input/.test(markup) &&
    /inputmode="decimal"/.test(markup) &&
    /ondblclick=\{openEditor\}/.test(markup) &&
    /cancelOnBlur = true/.test(script) &&
    /onblur=\{onInputBlur\}/.test(markup) &&
    /role="alert"/.test(markup),
);
check(
  "the five states exist: default, dragging, focused, disabled, editing",
  /"disabled"\s*:\s*editing\s*\?\s*"editing"\s*:\s*dragging\s*\?\s*"dragging"\s*:\s*focused\s*\?\s*"focused"\s*:\s*"default"/s.test(script) &&
    /class:is-dragging=\{dragging \|\| demoState === "dragging"\}/.test(markup) &&
    /class:is-demo-focus=\{demoState === "focused"\}/.test(markup) &&
    /data-fader-state=\{faderState\}/.test(markup),
);
check(
  "dragging reads as a press: the cap eases in, the shadow tightens, the fingertip shades the face",
  /\.fader\.is-dragging \.fader__press\s*\{[^}]*translateY/s.test(style) &&
    /\.fader\.is-dragging \.fader__cap-shadow\s*\{/.test(style) &&
    /\.fader\.is-dragging \.fader__cap-finger\s*\{[^}]*opacity:\s*1/s.test(style),
);
check(
  "focus is a ring on the panel with a panel-coloured break, shown for keyboard focus and the demo",
  /\.fader__track:focus-visible \.fader__focus,\s*\.fader\.is-demo-focus \.fader__focus\s*\{[^}]*opacity:\s*1/s.test(style) &&
    /\.fader__focus-gap\s*\{[^}]*stroke:\s*var\(--al-material-panel\)/s.test(style) &&
    /\.fader__focus-ring\s*\{[^}]*stroke:\s*var\(--al-text-primary\)/s.test(style),
);
check(
  "disabled dims the cap, the shaft, the print and the readout",
  /\.fader\.is-disabled \.fader__cap\s*\{[^}]*filter:\s*saturate/s.test(style) &&
    /\.fader\.is-disabled \.fader__ticks line\s*\{[^}]*stroke-opacity:\s*0\.18/s.test(style) &&
    /\.fader\.is-disabled \.fader__numeral\s*\{/.test(style) &&
    /\.fader__value:disabled\s*\{/.test(style),
);
check(
  "label and readout follow the knob's conventions verbatim",
  /\.fader__label\s*\{[^}]*font-family:\s*var\(--al-font-label\)[^}]*letter-spacing:\s*var\(--al-letter-spacing-engraved\)/s.test(style) &&
    /\.fader__value,\s*\.fader__input\s*\{[^}]*background:\s*var\(--al-material-recess\)/s.test(style) &&
    /\.knob__value,\s*\.knob__input\s*\{[^}]*background:\s*var\(--al-material-recess\)/s.test(knob),
);
check("reduced motion is honoured", /prefers-reduced-motion: reduce/.test(style));
check(
  "every SVG definition id is namespaced per instance",
  (fader.match(/id=\{`\$\{uid\}-[a-z-]+`\}/g) ?? []).length >= 10 && !/id="[a-z-]+"/.test(markup),
);

// --- 7. Playground and scope. --------------------------------------------------
check("the playground has a fader fixture component with local state", fixture.length > 0 && /let value = \$state\(config\.value\)/.test(fixture) && /bind:value/.test(fixture));
check(
  "the fixture wires nothing to project state",
  !/lib\/mixer|lib\/arrange|rooms\//.test(fixture) && !/lib\/mixer|lib\/arrange/.test(fader),
);
check(
  "the fixture sizes the fader from outside, through --fader-width",
  /style:--fader-width=/.test(fixture),
);
check(
  "the page shows the five required states",
  /data-dev-fader-states/.test(page) &&
    ["fader-state-default", "fader-state-dragging", "fader-state-focused", "fader-state-disabled", "fader-state-editing"].every((id) => page.includes(`id: "${id}"`)) &&
    /demoState: "dragging"/.test(page) && /demoState: "focused"/.test(page) && /demoState: "editing"/.test(page) && /disabled: true,\s*stateNote: "Disabled"/.test(page),
);
check(
  "the page shows positions along the track, including both travel limits",
  /data-dev-fader-positions/.test(page) &&
    /id: "fader-pos-top",[\s\S]*?value: 10,/.test(page) &&
    /id: "fader-pos-bottom",[\s\S]*?value: -60,/.test(page) &&
    /id: "fader-pos-unity"/.test(page) &&
    /taper: null/.test(page),
);
check("the page shows the cap profile enlarged, for review", /data-dev-fader-detail/.test(page) && /scale: 2\.5/.test(page));
check("the page says plainly that the law is a demonstration, not an audio decision", /not agreed audio parameters|NOT agreed audio-processing parameters/.test(page));
check("the route is still the private hash route", /#\/dev\/components/.test(read("src/lib/rooms.ts")) || /dev\/components/.test(read("src/lib/rooms.ts")));
check(
  "no room, strip or shared-state module references the fader",
  ["src/rooms/ConsoleRoom.svelte", "src/rooms/ArrangeRoom.svelte", "src/rooms/MixerRoom.svelte", "src/components/ChannelStrip.svelte", "src/components/MixerChannelStrip.svelte", "src/components/MixerDetailPanel.svelte", "src/lib/mixer.ts", "src/lib/arrange.ts"]
    .filter(exists)
    .every((rel) => !/hardware\/Fader|Fader\.svelte|<Fader\b/.test(read(rel))),
  "the Phase 0 strip still shows its 'Fader' placeholder text; what must not appear is the component",
);
check("the knob does not know the fader exists", !/Fader|fader/.test(knob));
check("check:fader is wired into package.json", pkg.scripts?.["check:fader"] === "node scripts/check-fader-structure.mjs");
// Task 1.4 delivered the tactile switch, Task 1.5 the meters and Task 1.6 the
// engraved label and the lamp, so no Phase 1 component is a later-task file
// any more; the check is kept with an empty list for the next phase.
check(
  "no later-task component was built",
  ![].some(exists),
);

// --- Report. -------------------------------------------------------------------
for (const name of passes) console.log(`  PASS  ${name}`);

if (failures.length > 0) {
  console.error("");
  for (const failure of failures) console.error(`  FAIL  ${failure}`);
  console.error("");
  console.error(`Fader contract check — ${passes.length}/${passes.length + failures.length} passed`);
  process.exit(1);
}

console.log("");
console.log(`Fader contract check — ${passes.length}/${passes.length} passed`);
