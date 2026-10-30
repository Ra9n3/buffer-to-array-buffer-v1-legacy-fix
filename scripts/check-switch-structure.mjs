#!/usr/bin/env node
/**
 * Tactile switch structural contract check — Task 1.4.
 *
 * Dependency-free guard (Node built-ins only), matching check:knob,
 * check:fader and the other check:* scripts. No test framework is added; the
 * project has none and this task must not introduce one.
 *
 * It does NOT test behaviour or rendering: press, toggle, keyboard, focus,
 * the accessible names and the visual result were exercised in a real
 * browser and are reported in task-reports/1.4-report.md. What it tests is
 * the source contract:
 *
 *   1. ONE reusable component with a `variant` prop for the two labelling
 *      conventions of hardware spec §2, coloured only through the Task 1.1
 *      tokens (cream family for the cap — the owner's choice; material, text
 *      and lamp/function tokens for the rest). No colour of its own beyond
 *      neutral black/white alphas.
 *   2. The cap is a square with corners at 15–20% of its width, rendered as
 *      layered gradients and shadows — a diagonal highlight lit from the
 *      top-left, a side wall, a drop shadow — not a flat fill. Variant A is
 *      glossy (a specular bloom layer); variant B is matte (a weaker sheen),
 *      sits in a recessed well with a dark inset border, and prints its
 *      function above and its value below on the panel.
 *   3. Pressed and engaged are separate state: pressed is transient (pointer
 *      or key down → up) and moves the cap; engaged is the button's
 *      aria-pressed, toggled by activation, and lights the lamp. Neither
 *      derives from the other.
 *   4. The lamp is amber or red only (spec §5), drawn as layered gradients
 *      with a glow and a spill — never a flat disc — and is unlit by default.
 *   5. The control is a real <button type="button"> with a name, focus
 *      indication for keyboard focus, and the playground's static demo
 *      states never leak into product code paths.
 *   6. The playground shows both variants in default, pressed, focused and
 *      engaged states, both lamp colours, live examples and a cluster; nothing
 *      outside the stated scope references the switch; no token was added.
 *
 * Run: npm run check:switch
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

const switchPath = "src/components/hardware/TactileSwitch.svelte";
check("the switch lives beside the knob and fader in src/components/hardware/", exists(switchPath));
if (!exists(switchPath)) {
  console.error("  FAIL  src/components/hardware/TactileSwitch.svelte is missing");
  process.exit(1);
}

const sw = read(switchPath);
const script = sw.slice(0, sw.indexOf("</script>", sw.indexOf('<script lang="ts">')));
const markup = sw.slice(sw.indexOf("<div"), sw.indexOf("<style>"));
const style = sw.slice(sw.indexOf("<style>"));
const page = read("src/dev/DevComponentsPage.svelte");
const fixture = exists("src/dev/SwitchFixture.svelte") ? read("src/dev/SwitchFixture.svelte") : "";
const knob = read("src/components/hardware/Knob.svelte");
const fader = read("src/components/hardware/Fader.svelte");
const css = read("src/lib/tokens.css");
const pkg = JSON.parse(read("package.json"));

/** The declarations of one CSS rule (first match of the selector). */
const rule = (selector) => {
  const i = style.indexOf(`${selector} {`);
  if (i < 0) return "";
  return style.slice(i, style.indexOf("}", i));
};

// --- 1. One component, two variants, tokens only. ----------------------------
check(
  "one variant prop, typed to the two conventions of spec §2",
  /export type SwitchVariant = "cap" \| "panel"/.test(sw) && /variant: SwitchVariant;/.test(script),
);
check(
  "no per-variant component files exist",
  !["CapSwitch", "PanelSwitch", "TactileSwitchCap", "TactileSwitchPanel", "Switch"].some((n) =>
    exists(`src/components/hardware/${n}.svelte`),
  ),
);
check(
  "the cap takes its three cream roles through functionToken()",
  ["hi", "base", "lo"].every((role) => sw.includes(`functionToken("cream", "${role}")`)),
);
const knobNickel = ["hi", "base", "mid", "lo", "deep"].map((k) => ((new RegExp(`--kn-nickel-${k}:\\s*(#[0-9a-f]{6})`, "i").exec(knob) ?? [])[1] ?? "").toLowerCase());
const switchNickel = ["hi", "base", "mid", "lo", "deep"].map((k) => ((new RegExp(`--f-nickel-${k}:\\s*(#[0-9a-f]{6})`, "i").exec(style) ?? [])[1] ?? "").toLowerCase());
check(
  "no colour of its own: every hex literal is neutral black or white, or one of the lamp bezel's five nickel values — which are the knob's, value for value (D1.6.7)",
  knobNickel.every(Boolean) &&
    switchNickel.every((v, i) => v && v === knobNickel[i]) &&
    (sw.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).every((h) => ["#000", "#000000", "#fff", "#ffffff", ...knobNickel].includes(h.toLowerCase())),
  `a non-neutral hex value would be a colour the token system does not own (knob ${knobNickel.join(",")} switch ${switchNickel.join(",")})`,
);
check(
  "the well and seat come from the material and border tokens; the lamp's dead glass and filament take the recess and metal tokens",
  style.includes("var(--al-material-recess)") &&
    style.includes("var(--al-border-strong)") &&
    /--f-lamp-off-hi: color-mix\(in srgb, var\(--f-lamp-body\) \d+%, var\(--al-material-recess\)\)/.test(style) &&
    /--f-lamp-filament: color-mix\(in srgb, var\(--f-lamp-body\) \d+%, var\(--al-material-metal\)\)/.test(style),
);
check(
  "the print comes from the text and type tokens",
  style.includes("var(--al-text-secondary)") &&
    style.includes("var(--al-text-muted)") &&
    style.includes("var(--al-text-on-cream)") &&
    style.includes("var(--al-font-label)") &&
    style.includes("var(--al-letter-spacing-engraved)"),
);
check(
  "no new design token was declared for the switch",
  !/--al-switch/.test(css) && !/--al-lamp-/.test(css) && !/--al-cap-/.test(css),
  "Task 1.4 identified no missing token; one here would need a justification in the report",
);
check(
  "the component imports only the token module",
  [...script.matchAll(/from\s+"([^"]+)"/g)].every((m) => m[1] === "../../lib/tokens"),
);
check(
  "the whole switch scales from one host-settable length, read not declared",
  /--sw-size: var\(--switch-size, 1\.75rem\)/.test(style) && !/^\s*--switch-size:/m.test(style),
);

// --- 2. The cap, the well, the print. -----------------------------------------
check(
  "corners are 15–20% of the width (spec §2), the same on both variants",
  (() => {
    const m = /--sw-radius: calc\(var\(--sw-size\) \* ([0-9.]+)\)/.exec(style);
    const f = m ? Number(m[1]) : NaN;
    return f >= 0.15 && f <= 0.2 && (style.match(/--sw-radius:/g) ?? []).length === 1;
  })(),
);
check(
  "the cap is square: one length for width and height",
  /\.switch__cap \{[^}]*width: var\(--sw-size\);[^}]*height: var\(--sw-size\);/s.test(style),
);
check(
  "variant A's top is a diagonal gradient, HI at the top-left to shade at the bottom-right — not a flat fill",
  /\.switch__cap \{[^}]*background: linear-gradient\(135deg, var\(--cap-hi\) 0%,[^;]*var\(--f-cap-dim\) 100%\)/s.test(style) &&
    /--f-cap-dim: color-mix\(in srgb, var\(--cap-base\) \d+%, var\(--cap-lo\)\)/.test(style),
);
check(
  "variant A is glossy: a specular bloom on its own layer, bright in the upper-left",
  /\.switch__cap::before \{[^}]*radial-gradient\(\s*62% 46% at 30% 20%,\s*rgba\(255, 255, 255, 0\.7\d\)/s.test(style),
);
check(
  "the cap is raised: a lit top edge, a shaded bottom edge, a side wall standing it off its base, a drop shadow",
  (() => {
    const r = rule(".switch__cap");
    return (
      /inset 0 1px 0 rgba\(255, 255, 255, 0\.8\d\)/.test(r) &&
      /inset 0 -1px 0 rgba\(0, 0, 0, 0\.2\d\)/.test(r) &&
      /0 var\(--sw-lift\) 0 0 var\(--f-wall\)/.test(r) &&
      /calc\(var\(--sw-lift\) \+ 2px\) 3px rgba\(0, 0, 0, 0\.5\d\)/.test(r) &&
      /transform: translateY\(calc\(-1 \* var\(--sw-lift\)\)\)/.test(r)
    );
  })(),
);
check(
  "the wall is the cream LO tone in shadow",
  /--f-wall: color-mix\(in srgb, var\(--cap-lo\) \d+%, black\)/.test(style) &&
    /--f-wall-foot: color-mix\(in srgb, var\(--cap-lo\) \d+%, black\)/.test(style),
);
check(
  "variant B's cap is the same shape, matte: a restrained gradient between near-BASE tones, a weaker sheen, a lower wall",
  /\.switch--panel \.switch__cap \{[^}]*linear-gradient\(135deg, var\(--f-cap-matte-hi\) 0%, var\(--cap-base\) 5\d%, var\(--f-cap-matte-lo\) 100%\)/s.test(style) &&
    /--f-cap-matte-hi: color-mix\(in srgb, var\(--cap-base\) 7\d%, var\(--cap-hi\)\)/.test(style) &&
    /\.switch--panel \.switch__cap::before \{[^}]*rgba\(255, 255, 255, 0\.[12]\d?\) 0%/s.test(style) &&
    /\.switch--panel \{[^}]*--sw-lift: 2px/s.test(style),
);
check(
  "variant B's cap sits in a recessed well: recess floor, dark lip shadow, lit lower edge, hairline dark border",
  (() => {
    const r = rule(".switch--panel .switch__button");
    return (
      /padding: var\(--sw-gap\)/.test(r) &&
      /inset 0 2px 3px rgba\(0, 0, 0, 0\.9\)/.test(r) &&
      /inset 0 -1px 0 rgba\(255, 255, 255, 0\.0\d\)/.test(r) &&
      /0 0 0 1px var\(--al-border-strong\)/.test(r) &&
      /\.switch__button \{[^}]*background: var\(--al-material-recess\)/s.test(style)
    );
  })(),
);
check(
  "variant A's label is printed on the cap, inside the button, and only there",
  /\{#if variant === "cap"\}\s*<span class="switch__cap-label" data-part="cap-label">\{label\}<\/span>/.test(markup) &&
    /class="switch__cap"[\s\S]*?switch__cap-label/.test(markup),
);
check(
  "variant B prints the function above and the value below, on the panel, outside the button",
  /\{#if variant === "panel"\}\s*<span class="switch__print switch__print--function"/.test(markup) &&
    /\{#if showValue\}\s*<span class="switch__print switch__print--value"/.test(markup) &&
    markup.indexOf('switch__print--function') < markup.indexOf("<button") &&
    markup.indexOf('switch__print--value') > markup.indexOf("</button>") &&
    /"function \."\s*"button lamp"\s*"value \."/.test(style),
);
check(
  "the panel print is engraved like the knob's label: label face, uppercase function, dark edge shadow",
  /\.switch__print \{[^}]*text-shadow:\s*0 1px 0 rgba\(0, 0, 0, 0\.9\)/s.test(style) &&
    /\.switch__print--function \{[^}]*text-transform: uppercase/s.test(style),
);
check(
  "the print scales with the switch (ink on the cap, engraving on the panel are physical)",
  /--sw-type-cap: calc\(var\(--sw-size\)/.test(style) &&
    /--sw-type-function: calc\(var\(--sw-size\)/.test(style) &&
    /\.switch__cap-label \{[^}]*font-size: var\(--sw-type-cap\)/s.test(style),
);
check(
  "the print cannot push the lamp away from the cap",
  /\.switch__print \{[^}]*width: 0;\s*min-width: 100%;/s.test(style),
);

// --- 3. Pressed and engaged are separate. -------------------------------------
check(
  "pressed is transient local state; engaged is the bindable prop",
  /let pressed = \$state\(false\)/.test(script) && /engaged = \$bindable\(false\)/.test(script),
);
check(
  "pressed follows pointer down → up (with capture) and key down → up, and releases on blur",
  /onpointerdown=\{onPointerDown\}/.test(markup) &&
    /onpointerup=\{release\}/.test(markup) &&
    /onpointercancel=\{release\}/.test(markup) &&
    /onlostpointercapture=\{release\}/.test(markup) &&
    /onkeydown=\{onKeyDown\}/.test(markup) &&
    /onkeyup=\{onKeyUp\}/.test(markup) &&
    /onblur=\{release\}/.test(markup) &&
    /setPointerCapture\(event\.pointerId\)/.test(script),
);
check(
  "engaged toggles on activation only (click), never on press",
  /onclick=\{toggle\}/.test(markup) &&
    /function toggle\(\) \{\s*engaged = !engaged;/.test(script) &&
    !/pressed[^;]*engaged\s*=/.test(script.replace(/\/\*[\s\S]*?\*\//g, "")) &&
    !/function onPointerDown[\s\S]*?engaged/.test(script.slice(0, script.indexOf("function release"))),
);
check(
  "neither state is derived from the other",
  /const isPressed = \$derived\(pressed \|\| demoState === "pressed"\)/.test(script) &&
    !/isPressed[\s\S]*engaged[\s\S]*\)/.test(/const isPressed = [^;]*;/.exec(script)?.[0] ?? "") &&
    !/engaged[^;]*pressed/.test(/class:is-engaged=\{[^}]*\}/.exec(markup)?.[0] ?? ""),
);
check(
  "both states are exposed as data attributes for hosts and tests",
  /data-switch-pressed=\{isPressed\}/.test(markup) && /data-switch-engaged=\{engaged\}/.test(markup),
);
check(
  "pressed sinks the cap (spec §2): lower lift, dimmed bloom, inward shadow, tighter drop shadow, 1 px smaller",
  (() => {
    const r = rule(".switch.is-pressed .switch__cap");
    return (
      /transform: translateY\(-1px\) scale\(0\.9[5-8]\d?\)/.test(r) &&
      /inset 0 2px 3px rgba\(0, 0, 0, 0\.2\d\)/.test(r) &&
      /0 1px 0 0 var\(--f-wall\)/.test(r) &&
      /0 2px 2px rgba\(0, 0, 0, 0\.4\d\)/.test(r) &&
      /\.switch\.is-pressed \.switch__cap::before \{[^}]*opacity: 0\.3\d?/s.test(style)
    );
  })(),
);
check(
  "pressed does not touch the lamp, and engaged does not touch the cap",
  !/\.switch\.is-pressed[^{]*switch__(lamp|lens)/.test(style) && !/\.switch\.is-engaged[^{]*switch__cap/.test(style),
);

// --- 4. The lamp: a vintage pilot lamp, the shared Lamp's seven layers in place (D1.6.7). ---
check(
  "the lamp colour is typed to amber or red only (spec §5)",
  /export type LampColour = "amber" \| "red"/.test(sw) && /lamp = "amber"/.test(script),
);
check(
  "amber is the incandescent lamp token with the amber family round it; red is the red family; red's bloom is a step stronger and its dead glass more tinted (maroon)",
  /--f-lamp-body: var\(--al-material-lamp\)/.test(style) &&
    /--f-lamp-core: color-mix\(in srgb, var\(--al-function-amber-hi\)/.test(style) &&
    /--f-lamp-edge: var\(--al-function-amber-lo\)/.test(style) &&
    /\.switch--lamp-red \{[^}]*--f-lamp-body: var\(--al-function-red-base\)/s.test(style) &&
    /\.switch--lamp-red \{[^}]*--f-lamp-edge: var\(--al-function-red-lo\)/s.test(style) &&
    Number(/\.switch--lamp-red \{[^}]*--f-lamp-bloom: ([\d.]+)/s.exec(style)?.[1]) > Number(/--f-lamp-bloom: ([\d.]+)/.exec(style)?.[1]) &&
    Number(/\.switch--lamp-red \{[^}]*--f-lamp-off-hi: color-mix\(in srgb, var\(--f-lamp-body\) (\d+)%/s.exec(style)?.[1]) > Number(/--f-lamp-off-hi: color-mix\(in srgb, var\(--f-lamp-body\) (\d+)%/.exec(style)?.[1]),
);
check(
  "no other lamp colour can be produced: only --lamp-amber / --lamp-red class hooks exist",
  (style.match(/\.switch--lamp-[a-z]+/g) ?? []).every((c) => c === ".switch--lamp-red" || c === ".switch--lamp-amber"),
);
check(
  "the lamp is a lens in a nickel bezel beside the cap, part of the switch, presentation only; the lamp element itself paints nothing (no background, no shadow) and forms no stacking context (no transform), so its bloom can blend with the panel",
  /<span class="switch__lamp" data-part="lamp" aria-hidden="true">\s*<span class="switch__lens" data-part="lamp-lens"><\/span>/.test(markup) &&
    /\.switch__lamp \{[^}]*border-radius: 50%;/s.test(style) &&
    !/\.switch__lamp \{[^}]*(background|box-shadow|transform|isolation|filter):/s.test(style),
);
check(
  "2+3 the bezel and the recess wall are the lamp's ::before: a 1px transparent border round the padding box carrying the 135° nickel ramp (hi top-left → deep bottom-right, border-box), the 1px gap a dark recess wall (padding-box); above the bloom, below the glass",
  /\.switch__lamp::before \{[^}]*z-index: 1;[^}]*inset: -1px;[^}]*border: 1px solid transparent;[^}]*border-radius: 50%;/s.test(style) &&
    /\.switch__lamp::before \{[^}]*linear-gradient\(\s*135deg,\s*color-mix\(in srgb, var\(--al-material-recess\) \d+%, black\) 0%,\s*var\(--al-material-recess\) \d+%,[^;]*\)\s*padding-box/s.test(style) &&
    /\.switch__lamp::before \{[^}]*linear-gradient\(\s*135deg,\s*var\(--f-nickel-hi\) 0%,\s*var\(--f-nickel-base\) \d+%,\s*var\(--f-nickel-mid\) \d+%,\s*var\(--f-nickel-lo\) \d+%,\s*var\(--f-nickel-deep\) 100%\s*\)\s*border-box/s.test(style) &&
    !/\.switch__lamp::before \{[^}]*box-shadow/s.test(style),
);
check(
  "4 off: dull dark glass in the lamp's own tint — a radial dome from the top-left in the off tones, clipped, no shadow or line on its edge, above the bezel — never a grey or black dot, never off-by-opacity",
  /\.switch__lens \{[^}]*z-index: 2;[^}]*overflow: hidden;[^}]*radial-gradient\(\s*circle at 36% 32%,\s*var\(--f-lamp-off-hi\) 0%,\s*var\(--f-lamp-off-lo\) \d+%,\s*var\(--f-lamp-off-rim\) 100%/s.test(style) &&
    !/\.switch__lens \{[^}]*(box-shadow|rgba\(255, 255, 255)/s.test(style),
);
check(
  "5 the filament is a tiny zigzag stroke masked into the glass (inline SVG path, non-scaling 1px stroke), dull tinted metal at half opacity off, gone when engaged",
  /\.switch__lens::before \{[^}]*background: var\(--f-lamp-filament\);[^}]*mask: url\("data:image\/svg\+xml,[^"]*path d='M6\.5 13\.4 9 10\.2 11\.5 13\.4 14 10\.2 16\.5 13\.4[^"]*vector-effect='non-scaling-stroke'[^"]*"\) center \/ 100% 100% no-repeat;[^}]*opacity: 0\.5;/s.test(style) &&
    /\.switch\.is-engaged \.switch__lens::before \{[^}]*opacity: 0;/s.test(style),
);
check(
  "7 the specular is one small soft white ellipse at the top-left of the glass, sized from the lens, blurred from --sw-lamp, in both states: 0.28 off, 0.55 engaged",
  /\.switch__lens::after \{[^}]*top: 12%;\s*left: 18%;\s*width: 30%;\s*height: 19%;[^}]*radial-gradient\(closest-side, rgba\(255, 255, 255, 0\.\d+\), rgba\(255, 255, 255, 0\)\);[^}]*filter: blur\(calc\(var\(--sw-lamp\) \* 0\.0\d\)\);[^}]*opacity: var\(--f-lamp-specular\);/s.test(style) &&
    /--f-lamp-specular: 0\.28;/.test(style) &&
    /\.switch\.is-engaged \.switch__lens \{[^}]*--f-lamp-specular: 0\.55;/s.test(style),
);
check(
  "4+6 lit: the glass alight — core warmed into the body at the top-left, through the saturated body and edge to a dark rim — with the hot core, a small white-warm blob to transparent within 26%, as the top layer; never a flat disc, no specular layer in the background, no shadow",
  /\.switch\.is-engaged \.switch__lens \{[^}]*background:\s*radial-gradient\(\s*circle at 36% 32%,\s*var\(--f-lamp-core\) 0%,\s*color-mix\(in srgb, var\(--f-lamp-core\) \d+%, transparent\) \d+%,\s*transparent 26%\s*\),\s*radial-gradient\(\s*circle at 36% 32%,\s*color-mix\(in srgb, var\(--f-lamp-core\) \d+%, var\(--f-lamp-body\)\) 0%,\s*var\(--f-lamp-body\) \d+%,\s*var\(--f-lamp-edge\) \d+%,\s*color-mix\(in srgb, var\(--f-lamp-edge\) \d+%, black\) 100%/s.test(style) &&
    !/\.switch\.is-engaged \.switch__lens \{[^}]*(background:\s*var\(--f-lamp-body\);|box-shadow|rgba\(255, 255, 255)/s.test(style),
);
check(
  "1 the bloom is the lamp's ::after: a radial halo 2.5× the bezel's radius (a box 250% of the lamp) in the lamp's own colour, screen-blended onto the panel, fading to transparent, under the bezel (z-index 0), off until engaged; no near glow, no spill",
  /\.switch__lamp::after \{[^}]*z-index: 0;[^}]*inset: -75%;[^}]*radial-gradient\(\s*circle closest-side,\s*color-mix\(in srgb, var\(--f-lamp-glow\) \d+%, transparent\) 0%,[^;]*transparent 100%\s*\);[^}]*mix-blend-mode: screen;[^}]*opacity: 0;/s.test(style) &&
    /\.switch\.is-engaged \.switch__lamp::after \{[^}]*opacity: var\(--f-lamp-bloom\);/s.test(style) &&
    !/0 0 6px 2px|filter: blur\(2\.5px\)|-70% -80% -90% -60%/.test(style),
);
check(
  "the bloom breathes: 3.5% of opacity over 4 s, alternate, composed onto its own opacity (the 90 ms rise kept), only where animation-composition is supported",
  /@supports \(animation-composition: add\) \{\s*\.switch\.is-engaged \.switch__lamp::after \{\s*animation: switch-lamp-breathe 4s ease-in-out infinite alternate;\s*animation-composition: add;/.test(style) &&
    /@keyframes switch-lamp-breathe \{\s*from \{\s*opacity: 0;\s*\}\s*to \{\s*opacity: 0\.03\d?;\s*\}/.test(style),
);
check(
  "the lamp sits level with the resting cap's face by a relative offset and does not move when the cap does",
  /\.switch__lamp \{[^}]*position: relative;[^}]*top: calc\(-1 \* var\(--sw-lift\)\);/s.test(style) && !/is-pressed[^{]*switch__lamp/.test(style),
);
check(
  "the lamp's glow comes on faster than it goes off (thermal lag), and under reduced motion neither transitions nor breathes — engaged or not",
  /\.switch__lens \{[^}]*transition:\s*background 160ms[^}]*\}/s.test(style) &&
    /\.switch\.is-engaged \.switch__lens \{[^}]*background 90ms/s.test(style) &&
    /prefers-reduced-motion: reduce\)\s*\{[^}]*\.switch__lens,\s*\.switch__lens::before,\s*\.switch__lens::after,\s*\.switch__lamp::after,\s*\.switch\.is-engaged \.switch__lens,\s*\.switch\.is-engaged \.switch__lens::before,\s*\.switch\.is-engaged \.switch__lens::after,\s*\.switch\.is-engaged \.switch__lamp::after\s*\{\s*transition: none;\s*animation: none;/s.test(style),
);
check(
  "no pure white and no box-shadow anywhere in the lamp: the lamp rules carry no #fff, no opaque white, no shadow",
  (() => {
    const lampRules = style.slice(style.indexOf("/* --- the lamp ----"), style.indexOf("/* --- the panel print"));
    return lampRules.length > 500 && !/#fff\b|#ffffff\b|white 100%|rgba\(255, 255, 255, 1\)|\bwhite;|box-shadow/i.test(lampRules);
  })(),
);

// --- 5. A real button. -----------------------------------------------------------
check(
  "the control is a native button of type=button, so Space, Enter and focus are the platform's",
  /<button\s+type="button"\s+class="switch__button"/.test(markup),
);
check(
  "engaged is the button's aria-pressed",
  /aria-pressed=\{engaged\}/.test(markup),
);
check(
  "variant B's name is the panel print, through aria-labelledby; variant A's is the cap text; a name override exists",
  /aria-labelledby=\{name === null && variant === "panel"/.test(markup) &&
    /`\$\{uid\}-function\$\{showValue \? ` \$\{uid\}-value` : ""\}`/.test(markup) &&
    /id=\{`\$\{uid\}-function`\}/.test(markup) &&
    /id=\{`\$\{uid\}-value`\}/.test(markup) &&
    /aria-label=\{name \?\? undefined\}/.test(markup) &&
    /name = null/.test(script),
);
check(
  "the print and the cap label are not hidden from assistive tech (they ARE the name)",
  !/switch__print[^>]*aria-hidden/.test(markup) && !/switch__cap-label[^>]*aria-hidden/.test(markup),
);
check(
  "keyboard focus draws a ring; pointer focus does not (focus-visible); the demo state draws the same ring",
  /\.switch__button:focus-visible,\s*\.switch\.is-demo-focus \.switch__button \{[^}]*outline: 2px solid var\(--al-text-primary\);\s*outline-offset: 2px;/s.test(style) &&
    /\.switch__button \{[^}]*outline: none;/s.test(style),
);
check(
  "the native button chrome is removed, the hit target is the whole base",
  /\.switch__button \{[^}]*appearance: none;/s.test(style) && /\.switch__button \{[^}]*border: 0;/s.test(style) && /cursor: pointer/.test(style),
);
check(
  "demo states are typed, default null, and only ever add a class",
  /type DemoState = "pressed" \| "focused" \| null/.test(script) &&
    /demoState = null/.test(script) &&
    (markup.match(/demoState/g) ?? []).length === 1 &&
    /class:is-demo-focus=\{demoState === "focused"\}/.test(markup),
);
check(
  "the optional onToggle callback reports the new engaged value and nothing else",
  /onToggle\?\.\(engaged\)/.test(script) && /onToggle\?: \(\(engaged: boolean\) => void\) \| null/.test(script),
);
check(
  "no project, audio or routing state is imported or touched",
  !/lib\/mixer|lib\/arrange|lib\/rooms|rooms\/|audio|AudioContext|fetch\(/.test(sw) && !/lib\/mixer|lib\/arrange|rooms\//.test(fixture),
);

// --- 6. The playground. -----------------------------------------------------------
check("the playground has a switch fixture component with local state", exists("src/dev/SwitchFixture.svelte") && /let engaged = \$state\(config\.engaged \?\? false\)/.test(fixture));
check(
  "the playground uses one component through one fixture",
  (fixture.match(/<TactileSwitch\b/g) ?? []).length === 1 && (page.match(/<TactileSwitch\b/g) ?? []).length === 0 && /<SwitchFixture \{config\} \/>/.test(page),
);
check("the fixture sizes the switch from outside, through --switch-size", /style:--switch-size=/.test(fixture));
check(
  "the fixture binds engaged and reports it, so the readout proves the toggle",
  /bind:engaged/.test(fixture) && /data-switch-fixture-engaged=\{engaged\}/.test(fixture),
);
check(
  "the page shows variant A in default, pressed, focused and engaged states, with both lamp colours",
  /data-dev-switch-cap-states/.test(page) &&
    ["switch-cap-default", "switch-cap-pressed", "switch-cap-focused", "switch-cap-engaged-amber", "switch-cap-engaged-red"].every((id) => page.includes(`id: "${id}"`)),
);
check(
  "the page shows variant B in default, pressed, focused and engaged states, with both lamp colours",
  /data-dev-switch-panel-states/.test(page) &&
    ["switch-panel-default", "switch-panel-pressed", "switch-panel-focused", "switch-panel-engaged-amber", "switch-panel-engaged-red"].every((id) => page.includes(`id: "${id}"`)),
);
check(
  "the page has live examples of each variant, one of them starting engaged to show the states are independent",
  /data-dev-switch-live/.test(page) &&
    /id: "switch-live-cap",\s*variant: "cap"/.test(page) &&
    /id: "switch-live-panel",\s*variant: "panel"/.test(page) &&
    /id: "switch-live-independent",[\s\S]*?engaged: true/.test(page),
);
check("the page shows a cluster of instances and an enlarged pair", /data-dev-switch-cluster/.test(page) && /data-dev-switch-detail/.test(page) && /scale: 2\.5/.test(page));
check(
  "the page says plainly that the state is local and the labels are examples",
  /not connected to any audio or\s+project state/.test(page) && /NOT agreed\s+controls or parameters/.test(page),
);
check("the knob and fader sections are still there, unchanged in structure", /data-dev-component="knob"/.test(page) && /data-dev-component="fader"/.test(page) && /data-dev-knob-states/.test(page) && /data-dev-fader-states/.test(page));
check("the route is still the private hash route", /dev\/components/.test(read("src/lib/rooms.ts")));
check(
  "no room, strip or shared-state module references the switch",
  ["src/rooms/ConsoleRoom.svelte", "src/rooms/ArrangeRoom.svelte", "src/rooms/MixerRoom.svelte", "src/components/ChannelStrip.svelte", "src/components/MixerChannelStrip.svelte", "src/components/MixerDetailPanel.svelte", "src/components/MiniTransport.svelte", "src/lib/mixer.ts", "src/lib/arrange.ts"]
    .filter(exists)
    .every((rel) => !/hardware\/TactileSwitch|TactileSwitch\.svelte|<TactileSwitch\b/.test(read(rel))),
);
check("the knob and the fader do not know the switch exists", !/TactileSwitch/.test(knob) && !/TactileSwitch/.test(fader));
check("check:switch is wired into package.json", pkg.scripts?.["check:switch"] === "node scripts/check-switch-structure.mjs");
// Task 1.5 delivered the two meters and Task 1.6 the shared Lamp and
// EngravedLabel, so no Phase 1 component is a later-task file any more; the
// check is kept with an empty list for the next phase.
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
  console.error(`Switch contract check — ${passes.length}/${passes.length + failures.length} passed`);
  process.exit(1);
}

console.log(`\nSwitch contract check — ${passes.length}/${passes.length} passed`);
