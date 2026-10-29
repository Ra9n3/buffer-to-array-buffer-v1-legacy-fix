#!/usr/bin/env node
/**
 * Knob component structural contract check — Task 1.2 (artwork integration).
 *
 * Dependency-free guard (Node built-ins only), matching check:arrange /
 * check:mixer / check:transport / check:tokens. No test framework is added,
 * because the project has none and this task must not introduce one.
 *
 * It does NOT test behaviour or rendering: drag, keyboard, numeric entry,
 * disabled behaviour and the visual result were exercised in a real browser at
 * three viewport widths. What it tests is the source contract:
 *
 *   1. ONE reusable component serves all six functional families, and all six
 *      families are driven by the Task 1.1 function tokens.
 *   2. The supplied artwork is present and intact: continuous body, lower side
 *      wall, recessed cap, BOTH ridge rings, separate index bar, the supplied
 *      gradients and the supplied filters. No flattened CSS substitute.
 *   3. The whole assembly rotates: ridges and index bar live in the same
 *      rotating group; the environmental lighting does not.
 *   4. The existing value → angle mapping is authoritative: START_ANGLE -135,
 *      SWEEP 270, and the artwork's own -88 pose rides on top of it.
 *   5. Every SVG definition id is namespaced per instance.
 *   6. The five required states and the existing interactions are intact.
 *   7. The playground shows five states and six families; the route is still
 *      the private one; no later-task component and no room was touched.
 *
 * Run: npm run check:knob
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

const knobPath = "src/components/hardware/Knob.svelte";
const knob = read(knobPath);
const knobStyle = knob.slice(knob.indexOf("<style>"));
const tokensTs = read("src/lib/tokens.ts");
const page = read("src/dev/DevComponentsPage.svelte");
const fixture = read("src/dev/KnobFixture.svelte");
const css = read("src/lib/tokens.css");

const num = (name) => Number((new RegExp(`const ${name} = (-?[\\d.]+)`).exec(knob) ?? [])[1] ?? NaN);

// --- 1. One component, six families. --------------------------------------
const hardwareFiles = [
  "src/components/hardware/Knob.svelte",
  "src/components/hardware/Fader.svelte",
  "src/components/hardware/TactileSwitch.svelte",
  "src/components/hardware/Meter.svelte",
  "src/components/hardware/EngravedLabel.svelte",
  "src/components/hardware/Lamp.svelte",
];
check("one Knob component exists", exists(knobPath));
check(
  "no per-family knob implementations exist",
  hardwareFiles.filter(exists).length === 1,
  "a later-task component file was created",
);
check(
  "the playground uses one component through one fixture",
  (fixture.match(/<Knob\b/g) ?? []).length === 1 &&
    (page.match(/<Knob\b/g) ?? []).length === 0,
);
check(
  "the Knob takes a `family` prop rather than being duplicated per colour",
  /family\?: FunctionFamily/.test(knob),
);
check(
  "all six plan families are exercised in the playground",
  ["cream", "amber", "red", "bluegrey", "green", "orange"].every((f) =>
    new RegExp(`family: "${f}"`).test(page),
  ),
);

// --- 2. Tokens, not copied values. ----------------------------------------
check(
  "the component resolves colours through functionToken()",
  ['hi', 'base', 'lo', 'ink'].every((role) =>
    new RegExp(`functionToken\\(family, "${role}"\\)`).test(knob),
  ),
);
check(
  "functionToken maps to the --al-function-* tokens",
  /`var\(--al-function-\$\{family\}-\$\{role\}\)`/.test(tokensTs),
);
// The grip is a material, not a family colour: the nickel ramp is the one
// place where literal colours are allowed, and it must stay neutral.
const nickelValues = [...knobStyle.matchAll(/--kn-nickel-[a-z]+:\s*(#[0-9a-fA-F]{6})/g)].map(
  (m) => m[1],
);
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
check(
  "the brushed-nickel ramp is declared once, as one neutral grey family",
  nickelValues.length >= 5 &&
    nickelValues.every((hex) => {
      const [r, g, b] = rgb(hex);
      return Math.max(r, g, b) - Math.min(r, g, b) <= 10;
    }),
  `expected >= 5 neutral nickel tones; found ${nickelValues.join(", ")}`,
);
check(
  "the nickel ramp spans a metal range, not one flat grey",
  (() => {
    const lum = nickelValues.map((hex) => {
      const [r, g, b] = rgb(hex);
      return 0.299 * r + 0.587 * g + 0.114 * b;
    });
    return Math.max(...lum) - Math.min(...lum) >= 90;
  })(),
  "a single flat grey fill is explicitly not allowed",
);
check(
  "the component copies no hex colour from the family palette",
  ["cream", "amber", "red", "bluegrey", "green", "orange"].every((family) => {
    const base = new RegExp(`--al-function-${family}-base:\\s*(#[0-9a-fA-F]{6})`).exec(css);
    return !base || !knob.toLowerCase().includes(base[1].toLowerCase());
  }),
  "a family colour value was hard-coded instead of read through functionToken()",
);
check(
  "the only literal colours in the styles are the nickel ramp",
  (() => {
    const hexes = [...knobStyle.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0].toLowerCase());
    const allowed = new Set(nickelValues.map((h) => h.toLowerCase()));
    return hexes.every((hex) => allowed.has(hex));
  })(),
  "a non-material hex colour was hard-coded",
);
check(
  "no blue paint value survives in the component",
  !/#(4a7ec4|2563b8|1d4e91|2157a2|184078|133360|1d5094|5382c2|7ca1d4)/i.test(knob),
  "a supplied blue is still hard-coded; the family must drive every painted surface",
);
check(
  "the grip, side wall and both ridge rings are brushed nickel",
  /url\(#\$\{uid\}-side-wall\)/.test(knob) &&
    /fill=\{`url\(#\$\{uid\}-paint\)`\}/.test(knob) &&
    /stroke="var\(--kn-nickel-groove\)"/.test(knob) &&
    /stroke="var\(--kn-nickel-crest\)"/.test(knob) &&
    /stop-color: var\(--kn-nickel-hi\)/.test(knob) &&
    /stop-color: var\(--kn-nickel-base\)/.test(knob),
);
check(
  "the central cap is the only colour-variable part and still reads the family",
  /--kn-face-hi: color-mix\(in srgb, var\(--cap-hi\)/.test(knobStyle) &&
    /--kn-face-base: color-mix\(in srgb, var\(--cap-base\)/.test(knobStyle) &&
    /--kn-ink: var\(--cap-ink\)/.test(knobStyle) &&
    /id=\{`\$\{uid\}-face-paint`\}/.test(knob),
);
check(
  "the nickel does not appear on the cap",
  (() => {
    const faceGradient = (/id=\{`\$\{uid\}-face-paint`\}[\s\S]*?<\/linearGradient>/.exec(knob) ?? [""])[0];
    return faceGradient.length > 0 && !/nickel/.test(faceGradient);
  })(),
  "the cap must keep the family colour, not the metal",
);
check(
  "the index bar uses the family ink, so it stays legible in all six",
  /\.knob__pointer-ink[^{]*{[^}]*}/s.test(knob) &&
    /--kn-ink: var\(--cap-ink\)/.test(knobStyle),
);
check(
  "all six families are declared in tokens.css",
  ["cream", "amber", "red", "bluegrey", "green", "orange"].every((f) =>
    css.includes(`--al-function-${f}-base`),
  ),
);

// --- 3. The supplied artwork is intact. -----------------------------------
check(
  "the artwork keeps its supplied 400-unit canvas",
  /viewBox="0 0 400 400"/.test(knob) && num("C") === 200,
);
check(
  "the continuous body is the supplied circle (r 150 at 200,200)",
  /<circle cx="200" cy="200" r="150"/.test(knob),
);
check(
  "the lower side wall is the supplied offset circle (r 150 at 200,210)",
  /<circle cx="200" cy="210" r="150"/.test(knob),
);
check(
  "the recessed cap is the supplied circle (r 131)",
  /<circle\s+cx="200"\s+cy="200"\s+r="131"/.test(knob),
);
check(
  "the silhouette clip is the supplied pair of body circles",
  /id=\{`\$\{uid\}-silhouette`\}[\s\S]{0,160}circle cx="200" cy="200" r="150"[\s\S]{0,80}circle cx="200" cy="210" r="150"/.test(
    knob,
  ),
);
check(
  "the face clip is the supplied r 131 circle",
  /id=\{`\$\{uid\}-face-clip`\}[\s\S]{0,80}r="131"/.test(knob),
);
check(
  "BOTH ridge rings are generated at the supplied 96 ridges per ring",
  num("RIDGE_COUNT") === 96 &&
    /const ridgesDark = ridgeRing\(0\)/.test(knob) &&
    /const ridgesLight = ridgeRing\(RIDGE_LIGHT_OFFSET\)/.test(knob) &&
    (knob.match(/ridgesDark as ridge/g) ?? []).length === 1 &&
    (knob.match(/ridgesLight as ridge/g) ?? []).length === 1,
);
check(
  "the ridge band runs r 134 → 148 as supplied",
  num("RIDGE_INNER") === 134 && num("RIDGE_OUTER") === 148,
);
check(
  "the ridges keep their supplied stroke weights (2.2 dark, 1.4 light)",
  /stroke-width="2\.2"/.test(knob) && /stroke-width="1\.4"/.test(knob),
);
check(
  "each ridge still carries its own colour variation, not a flat ring",
  /stroke-opacity=\{[^}]*ridge\.lit[^}]*\}/.test(knob),
);
check(
  "the index bar is the supplied separate rect, centre to near-rim",
  /x="220"[\s\S]{0,80}y="192\.5"[\s\S]{0,80}width="105"[\s\S]{0,80}height="15"/.test(knob),
);
check(
  "the supplied paint gradient geometry is unchanged",
  /x1="85"\s+y1="65"\s+x2="310"\s+y2="335"/.test(knob),
);
check(
  "the supplied side-wall gradient geometry is unchanged",
  /x1="55"\s+y1="95"\s+x2="325"\s+y2="360"/.test(knob),
);
check(
  "the supplied satin grain filter survives (fractalNoise, 1.1, 2 octaves, seed 7)",
  /feTurbulence[\s\S]{0,160}baseFrequency="1\.1"[\s\S]{0,120}numOctaves="2"[\s\S]{0,80}seed="7"/.test(
    knob,
  ),
);
check(
  "the recess shadow hugs the cap's whole circumference (no offset, so no drop shadow)",
  /feOffset dx="0" dy="0"/.test(knob) && /stdDeviation="4\.2"/.test(knob),
  "an offset shadow makes the cap read as lying on the grip on one side and sunk on the other",
);
check(
  "the cap falls into the recess all round, and its far wall shades the face",
  /id=\{`\$\{uid\}-cap-inset`\}/.test(knob) &&
    /id=\{`\$\{uid\}-cap-wall-shade`\}/.test(knob) &&
    /class="knob__cap-seat"/.test(knob) &&
    knob.includes("`url(#${uid}-face-clip)`"),
);
check(
  "the recess shadow keeps its supplied structure (offset → blur → composite out → flood → merge)",
  /feOffset[\s\S]{0,140}feGaussianBlur[\s\S]{0,140}feComposite in="SourceAlpha" in2="blur" operator="out"[\s\S]{0,200}feFlood[\s\S]{0,200}feMerge/.test(
    knob,
  ),
);
check(
  "the cap still sits a step below the rim (nickel supplies the step now)",
  /id=\{`\$\{uid\}-face-paint`\}/.test(knob) &&
    /--kn-face-base: color-mix\(in srgb, var\(--cap-base\) 94%, black\)/.test(knob) &&
    /class="knob__cap-seat"/.test(knob),
);
check(
  "the recess has an inner lip so the step reads at 7.5rem",
  /class="knob__face-lip"/.test(knob) &&
    /\.knob__face-lip\s*{[^}]*stroke-width: 3\.5/s.test(knobStyle),
);
check(
  "ridge groves stay darker than ridge crests (depth, not a flat band)",
  (() => {
    const lum = (name) => {
      const hex = (new RegExp(`--kn-nickel-${name}: (#[0-9a-fA-F]{6})`).exec(knobStyle) ?? [])[1];
      if (!hex) return NaN;
      const [r, g, b] = rgb(hex);
      return 0.299 * r + 0.587 * g + 0.114 * b;
    };
    return lum("crest") - lum("groove") >= 90;
  })(),
  "grooves must read as recesses, crests as machined highlights",
);
check(
  "the supplied highlight blurs survive (7 and 1.8)",
  /stdDeviation="7"/.test(knob) && /stdDeviation="1\.8"/.test(knob),
);
check(
  "a fixed-lighting overlay is still drawn",
  /data-part="fixed-lighting"/.test(knob),
);
check(
  "the recess shadow is no longer tinted the supplied blue",
  !/flood-color="#0e2646"/.test(knob),
);

// --- 4. Whole-assembly rotation. ------------------------------------------
const assembly = (knob.match(/data-part="rotating-surfaces"[\s\S]{0,4000}/) ?? [""])[0];
check(
  "the rotating group still carries the supplied part name",
  /class="knob__assembly"[\s\S]{0,120}data-part="rotating-surfaces"/.test(knob),
);
check(
  "the ridges and the index bar rotate together, in one group",
  /data-part="rotating-surfaces"[\s\S]*?ridgesDark as ridge[\s\S]*?ridgesLight as ridge[\s\S]*?knob__pointer-ink/.test(
    assembly,
  ),
);
check(
  "the assembly rotates about the artwork's centre (200,200)",
  /rotate\(\$\{assemblyRotation\} 200 200\)/.test(knob),
);
check(
  "the housing is not left stationary while the pointer rotates alone",
  !/knob__pointer-ink[\s\S]{0,2000}rotate\(\$\{angle\}/.test(knob),
);
check(
  "the environmental lighting does not rotate with the assembly",
  (() => {
    const lightIndex = knob.indexOf('data-part="fixed-lighting"');
    const assemblyIndex = knob.indexOf('data-part="rotating-surfaces"');
    return lightIndex > assemblyIndex && !/rotate\(\$\{assemblyRotation\}/.test(
      knob.slice(lightIndex, lightIndex + 1200),
    );
  })(),
  "the fixed lighting must sit outside the rotating group",
);

// --- 5. The existing mapping stays authoritative. -------------------------
check(
  "the value sweep is still 270 degrees from -135 degrees",
  /const SWEEP = 270/.test(knob) && /const START_ANGLE = -135/.test(knob),
);
check(
  "the value angle is still START_ANGLE + SWEEP * fraction",
  /const angle = \$derived\(START_ANGLE \+ SWEEP \* fraction\)/.test(knob),
);
check(
  "the supplied -88 pose is kept as an orientation offset",
  /const ARTWORK_ORIENTATION = -88/.test(knob),
);
check(
  "the value angle rides on top of the artwork pose",
  /const assemblyRotation = \$derived\(angle \+ ARTWORK_ORIENTATION - ORIENTATION_TRIM\)/.test(
    knob,
  ),
);
check(
  "the pointer lands exactly on 12 o'clock at half travel",
  num("ARTWORK_ORIENTATION") - num("ORIENTATION_TRIM") === -90,
  "orientation + trim must equal -90 so the index agrees with the graduations",
);
check(
  "the rotation offset is documented as an orientation, not a remapping",
  /artwork orientation|ORIENTATION_TRIM/.test(knob.slice(0, knob.indexOf("<style>"))),
);

// --- 5b. Geometry lock: the material change must not have moved anything. --
check(
  "the rendered size and layout footprint are unchanged (7.5rem, art scale 0.88)",
  /--knob-size: 7\.5rem/.test(knobStyle) && num("ART_SCALE") === 0.88,
);
check(
  "the drawing transform is still a uniform, centred scale",
  knob.includes("const ART_TRANSFORM = `translate(${C} ${C}) scale(${ART_SCALE}) translate(${-C} ${-C})`"),
);
check(
  "no geometry helper was retuned for the material change",
  num("RIDGE_COUNT") === 96 &&
    num("RIDGE_INNER") === 134 &&
    num("RIDGE_OUTER") === 148 &&
    num("RIDGE_LIGHT_OFFSET") === 1.6 &&
    num("START_ANGLE") === -135 &&
    num("SWEEP") === 270,
);
check(
  "the cap disc is still r 131 at the artwork centre",
  (knob.match(/cx="200"\s+cy="200"\s+r="131"/g) ?? []).length >= 1,
);
check(
  "the pointer is the same single rect, in the same place, at the same size",
  (knob.match(/class="knob__pointer-ink"/g) ?? []).length === 1 &&
    /x="220"[\s\S]{0,80}y="192\.5"[\s\S]{0,80}width="105"[\s\S]{0,80}height="15"/.test(knob),
);

// --- 6. Instance-scoped SVG ids. ------------------------------------------
const declaredIds = [...knob.matchAll(/\bid=\{`\$\{uid\}-([a-z-]+)`\}/g)].map((m) => m[1]);
check(
  "every SVG definition has a namespaced id",
  declaredIds.length >= 9 &&
    [
      "silhouette",
      "face-clip",
      "paint",
      "side-wall",
      "indicator",
      "inset",
      "soft-light",
      "wall-light",
      "satin",
    ].every((id) => declaredIds.includes(id)),
  `expected the nine supplied ids; found ${declaredIds.join(", ")}`,
);
check(
  "no id is a bare literal",
  !/\bid="(?!\{)/.test(knob),
);
check(
  "every url(#…) reference is namespaced",
  [...knob.matchAll(/url\(#([^)]*)\)/g)].every((m) => m[1].startsWith("${uid}-")),
);
check(
  "the uid is generated per instance from a module-level counter",
  /let nextId = 0;/.test(knob) && /const uid = `kn\$\{\+\+nextId\}`/.test(knob),
);

// --- 7. Panel print. ------------------------------------------------------
check(
  "the tick ring is generated, not hand-written",
  /Array\.from\(\{ length: TICK_COUNT \}/.test(knob),
);
check(
  "numerals appear at the two extremes only",
  (knob.match(/class="knob__extreme"/g) ?? []).length === 2,
);
check(
  "a fixed reference triangle is drawn on the panel",
  /class="knob__reference"/.test(knob),
);
check(
  "the scale sits outside the housing, not under it",
  num("TICK_IN") > num("RIDGE_OUTER") * num("ART_SCALE"),
  "the first tick must clear the body's drawn radius",
);
check(
  "the focus ring sits in the clear band between housing and scale",
  num("FOCUS_R") > 150 * num("ART_SCALE") && num("FOCUS_R") < num("TICK_IN"),
  "FOCUS_R must sit between the body edge and the first tick",
);

// --- 8. Five states are implemented. --------------------------------------
check("default state", /is-dragging/.test(knob) && /knob__dial:focus-visible/.test(knob));
check("dragging state", /dragging = true/.test(knob));
check(
  "dragging state has its own visual treatment",
  /\.knob\.is-dragging \.knob__press/.test(knobStyle),
);
check(
  "keyboard focus has a visible focus treatment",
  /\.knob__dial:focus-visible \.knob__focus/.test(knobStyle) &&
    /\.knob__focus-ring/.test(knobStyle),
);
check(
  "the focus ring is drawn in a light token, visible on the dark panel",
  /\.knob__focus-ring\s*{[^}]*stroke:\s*var\(--al-text-primary\)/s.test(knobStyle),
);
check(
  "disabled is a material state, not a grey filter",
  /\.knob\.is-disabled \.knob__light/.test(knobStyle) &&
    /\.knob\.is-disabled \.knob__pointer-ink/.test(knobStyle) &&
    !/grayscale\(/.test(knobStyle),
);
check(
  "disabled removes the control from the tab order",
  /role="slider"[\s\S]{0,400}tabindex=\{disabled \? -1 : 0\}/.test(knob),
);
check(
  "numeric-entry state exists and is reachable by double-click",
  /ondblclick=\{openEditor\}/.test(knob) && /data-knob-input/.test(knob),
);

// --- 9. Interactions implemented. -----------------------------------------
check(
  "drag adjusts the value on pointermove",
  /onpointermove=\{onPointerMove\}/.test(knob) && /setValue\(startValue/.test(knob),
);
check(
  "pointer capture is used so the drag survives leaving the knob",
  /setPointerCapture/.test(knob) && /releasePointerCapture/.test(knob),
);
check(
  "keyboard adjusts the value with arrow keys",
  /case "ArrowUp"/.test(knob) && /case "ArrowDown"/.test(knob),
);
check(
  "keyboard supports Home/End/PageUp/PageDown",
  /case "Home"/.test(knob) &&
    /case "End"/.test(knob) &&
    /case "PageUp"/.test(knob) &&
    /case "PageDown"/.test(knob),
);
check(
  "shift-step fine adjustment is still available",
  /const fineStep = \$derived/.test(knob) && /event\.shiftKey \? fineStep : step/.test(knob),
);
check(
  "the value is always clamped and snapped in one place",
  /function setValue\(next: number\)/.test(knob) &&
    /Math\.min\(max, Math\.max\(min, /.test(knob),
);
check(
  "invalid numeric entry is rejected rather than applied",
  /if \(parsed === null\) \{\s*invalid = true;\s*return;/.test(knob),
);
check("invalid entry is announced", /role="alert"/.test(knob) && /aria-invalid=\{invalid\}/.test(knob));
check("Escape cancels numeric entry", /event\.key === "Escape"/.test(knob));
check(
  "the slider exposes its value to assistive tech",
  /aria-valuenow=\{value\}/.test(knob) && /aria-valuetext=\{display\}/.test(knob),
);
check(
  "hover has a reachable rest → hover range (no clamped no-op)",
  /\.knob__light\s*{[^}]*opacity: 0\.9/s.test(knobStyle) &&
    !/opacity: 1\.25/.test(knobStyle),
);
check(
  "the panel print is scaled for the 400-unit canvas (≈8px numerals, ≈0.7px ticks)",
  (() => {
    const font = Number((/font-size: (\d+)px/.exec(knobStyle) ?? [])[1] ?? 0);
    const minor = Number(
      (/\.knob__ticks line\s*{[^}]*stroke-width: ([\d.]+)/s.exec(knobStyle) ?? [])[1] ?? 0,
    );
    const px = 120 / 400; // 7.5rem at a 16px root, over the artwork canvas
    return (
      font * px >= 7 &&
      font * px <= 9 &&
      minor * px >= 0.6 &&
      minor * px <= 1.1
    );
  })(),
  "print must render at roughly the approved Task 1.1 size, not half of it",
);
check("reduced-motion preferences are respected", /prefers-reduced-motion: reduce/.test(knobStyle));

// --- 10. Playground requirements. -----------------------------------------
check(
  "the playground adds a knob section, not a second route",
  /data-dev-component="knob"/.test(page) &&
    !/DEV_COMPONENTS_HREF\s*=.*knob/.test(read("src/lib/rooms.ts")),
);
check(
  "the playground labels all five states",
  ["state-default", "state-dragging", "state-focused", "state-disabled", "state-editing"].every(
    (id) => page.includes(`id: "${id}"`),
  ),
);
check(
  "the playground shows exactly six family fixtures",
  (page.match(/id: "family-[a-z]+"/g) ?? []).length === 6,
);
check(
  "each family fixture states its plan meaning",
  [
    "Cream / off-white — input trim",
    "Amber / gold — EQ",
    "Red — compression",
    "Blue-grey — pan",
    "Green — sends",
    "Orange — bus/group",
  ].every((text) => page.includes(text)),
);
check(
  "the fixtures hold local state only",
  /\$state\(config\.value\)/.test(fixture) &&
    !/localStorage|sessionStorage|\$store|writable\(/.test(fixture + knob),
);
check(
  "nothing is connected to audio or project state",
  !/AudioContext|AudioParam|requestAnimationFrame|currentTime/.test(knob + fixture + page),
);

// --- 11. Scope boundaries. ------------------------------------------------
for (const rel of [
  "src/rooms/ConsoleRoom.svelte",
  "src/rooms/ArrangeRoom.svelte",
  "src/rooms/MixerRoom.svelte",
  "src/components/MiniTransport.svelte",
  "src/components/RoomNav.svelte",
]) {
  check(
    `no knob is skinned into ${rel.split("/").pop()}`,
    !/hardware\/Knob|data-knob/.test(read(rel)),
  );
}
check(
  "no token was added or changed for this task",
  /--al-function-cream-base:/.test(css) && !/--al-knob/.test(css),
);
check(
  "no external image or package was introduced",
  !/<image\b|\.png|\.jpg|\.webp/.test(knob) && !/framer-motion|d3-|svg\.js/.test(knob),
);

// --- Report. ---------------------------------------------------------------
for (const name of passes) console.log(`  PASS  ${name}`);

if (failures.length > 0) {
  console.error("");
  for (const failure of failures) console.error(`  FAIL  ${failure}`);
  console.error("");
  console.error(`Knob contract check — ${passes.length}/${passes.length + failures.length} passed`);
  process.exit(1);
}

console.log("");
console.log(`Knob contract check — ${passes.length}/${passes.length} passed`);
