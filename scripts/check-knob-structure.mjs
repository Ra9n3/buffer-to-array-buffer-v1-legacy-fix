#!/usr/bin/env node
/**
 * Knob component structural contract check — Task 1.2.
 *
 * Dependency-free guard (Node built-ins only), matching check:arrange /
 * check:mixer / check:transport / check:tokens. No test framework is added,
 * because the project has none and this task must not introduce one.
 *
 * It does NOT test behaviour or rendering: drag, keyboard, numeric entry,
 * disabled behaviour and the visual result were exercised in a real browser at
 * four viewport widths. What it tests is the source contract:
 *
 *   1. ONE reusable component serves all six functional families. There is no
 *      per-family implementation and no per-family component file.
 *   2. The component takes its colours from the Task 1.1 tokens, through
 *      functionToken() — it contains no hex literal of its own.
 *   3. The hardware-spec §1 construction details are present: knurled base with
 *      a ridge count in the 16–20 range, a separate cap, radial cap lighting, a
 *      rotating pointer, a generated 270° tick ring, extreme numerals only, and
 *      a fixed reference triangle.
 *   4. The five required states exist and are reachable.
 *   5. The playground shows five states and six families, all through fixtures.
 *   6. The route is still the private one, still not a room.
 *   7. No later-task component was built and no room was restyled.
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
const tokensTs = read("src/lib/tokens.ts");
const page = read("src/dev/DevComponentsPage.svelte");
const fixture = read("src/dev/KnobFixture.svelte");
const css = read("src/lib/tokens.css");

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
  /family\?:\s*FunctionFamily/.test(knob),
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
  /functionToken\(family, "hi"\)/.test(knob) &&
    /functionToken\(family, "base"\)/.test(knob) &&
    /functionToken\(family, "lo"\)/.test(knob) &&
    /functionToken\(family, "ink"\)/.test(knob),
);
check(
  "functionToken maps to the --al-function-* tokens",
  /`var\(--al-function-\$\{family\}-\$\{role\}\)`/.test(tokensTs),
);
const knobStyleSource = knob.slice(knob.indexOf("<style>"));
check(
  "the component's styles contain no hex colour literals",
  !/#[0-9a-fA-F]{3,8}\b/.test(knobStyleSource),
  "a hex colour was hard-coded instead of using a token",
);
check(
  "the component references tokens for its surfaces and text",
  /var\(--al-material-panel\)/.test(knob) &&
    /var\(--al-material-recess\)/.test(knob) &&
    /var\(--al-text-secondary\)/.test(knob) &&
    /var\(--al-font-label\)/.test(knob),
);
check(
  "all six families are declared in tokens.css",
  ["cream", "amber", "red", "bluegrey", "green", "orange"].every((f) =>
    css.includes(`--al-function-${f}-base`),
  ),
);

// --- 3. Hardware spec §1 construction. ------------------------------------
check(
  "the knurl is generated, not hand-written",
  /const FLUTES = (\d+)/.test(knob) &&
    /Array\.from\(\{ length: FLUTES \}/.test(knob),
);
const fluteCount = Number((/const FLUTES = (\d+)/.exec(knob) ?? [])[1] ?? 0);
check(
  "flute count is inside the spec's 16–20 range",
  fluteCount >= 16 && fluteCount <= 20,
  `16–20 flutes expected; found ${fluteCount}`,
);
check(
  "each flute is a lit face and a cut face, not a flat stripe",
  /\.knob__flute-lead/.test(knobStyleSource) &&
    /\.knob__flute-trail/.test(knobStyleSource) &&
    /leadOpacity/.test(knob) &&
    /trailOpacity/.test(knob),
);
check(
  "facet brightness is modulated by the light azimuth",
  /LIGHT_AZIMUTH = 315/.test(knob) && /Math\.cos\(\(\(mid - LIGHT_AZIMUTH\)/.test(knob),
);
check("a separate cap element exists", /knob__cap/.test(knobStyleSource));
check(
  "the cap is lit by a radial dome gradient from the upper-left",
  /id=\{`\$\{uid\}-dome`\} cx="3[0-9]%" cy="[23][0-9]%"/.test(knob),
);
check(
  "the dome ramp runs hi → base → lo",
  /var\(--cap-hi\)[\s\S]{0,120}var\(--cap-base\)[\s\S]{0,120}var\(--cap-lo\)/.test(knob),
);
check(
  "the cap is smaller than the skirt (constants agree)",
  (() => {
    const num = (name) => Number((new RegExp(`const ${name} = ([\\d.]+)`).exec(knob) ?? [])[1] ?? 0);
    return num("CAP_R") < num("SKIRT_R") && num("CAP_R") > 0 && num("RIM_R") > num("CAP_R");
  })(),
  "CAP_R must be positive and smaller than SKIRT_R",
);
check(
  "there is a groove/ambient occlusion between cap and face",
  /knob__groove/.test(knob),
);
check(
  "a pointer rotates with the value",
  /class="knob__pointer" transform=\{`rotate\(\$\{angle\} \$\{CX\} \$\{CY\}\)`\}/.test(knob),
);
check(
  "the pointer is drawn as an inlay (channel, ink, lit edge)",
  /knob__pointer-bed/.test(knob) &&
    /knob__pointer-ink/.test(knob) &&
    /knob__pointer-edge/.test(knob),
);
check(
  "the pointer is clipped to the cap and cannot overhang it",
  /clip-path=\{`url\(#\$\{uid\}-cap-clip\)`\}/.test(knob),
);
check(
  "the pointer ink resolves to the family's ink token",
  /\.knob__pointer-ink\s*{[^}]*stroke:\s*var\(--cap-ink\)/s.test(knobStyleSource),
);
check(
  "the tick ring is generated, not hand-written",
  /Array\.from\(\{ length: TICK_COUNT \}/.test(knob),
);
check(
  "the tick sweep is 270 degrees",
  /const SWEEP = 270/.test(knob) && /const START_ANGLE = -135/.test(knob),
);
check(
  "numerals appear at the two extremes only",
  (knob.match(/class="knob__extreme"/g) ?? []).length === 2,
);
check(
  "a fixed reference triangle is drawn on the panel",
  /class="knob__reference"/.test(knob) &&
    !/knob__reference[\s\S]{0,80}rotate/.test(knob),
);
check(
  "layered gradients and SVG are used, not a flat fill",
  (knob.match(/<(radial|linear)Gradient/g) ?? []).length >= 4 && /<svg/.test(knob),
);

// --- 4. Five states are implemented. --------------------------------------
check("default state", /is-dragging/.test(knob) && /knob__dial:focus-visible/.test(knob));
check("dragging state", /dragging = \$state\(true\)|dragging = true/.test(knob));
check(
  "dragging state has its own visual treatment",
  /\.knob\.is-dragging \.knob__cap/.test(knobStyleSource),
);
check(
  "keyboard focus has a visible focus treatment",
  /\.knob__dial:focus-visible \.knob__focus/.test(knobStyleSource) &&
    /\.knob__focus-ring/.test(knob),
);
check(
  "the focus ring sits clear of the printed scale",
  (() => {
    const num = (name) => Number((new RegExp(`const ${name} = ([\\d.]+)`).exec(knob) ?? [])[1] ?? 0);
    return num("FOCUS_R") > num("SKIRT_R") && num("FOCUS_R") < num("TICK_IN");
  })(),
  "FOCUS_R must sit between the skirt and the first tick",
);
check(
  "disabled is a material state, not a grey filter",
  /\.knob\.is-disabled/.test(knobStyleSource) &&
    !/grayscale\(/.test(knobStyleSource) &&
    /\.knob\.is-disabled \.knob__spec/.test(knobStyleSource),
);
check(
  "disabled removes the control from the tab order",
  /role="slider"[\s\S]{0,400}tabindex=\{disabled \? -1 : 0\}/.test(knob),
);
check(
  "numeric-entry state exists and is reachable by double-click",
  /ondblclick=\{openEditor\}/.test(knob) && /data-knob-input/.test(knob),
);

// --- 5. Interactions implemented. -----------------------------------------
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
  /case "Home"/.test(knob) && /case "End"/.test(knob) && /case "PageUp"/.test(knob),
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
check(
  "invalid entry is announced",
  /role="alert"/.test(knob) && /aria-invalid=\{invalid\}/.test(knob),
);
check(
  "Escape cancels numeric entry",
  /event\.key === "Escape"/.test(knob),
);
check(
  "the slider exposes its value to assistive tech",
  /aria-valuenow=\{value\}/.test(knob) && /aria-valuetext=\{display\}/.test(knob),
);
check(
  "reduced-motion preferences are respected",
  /prefers-reduced-motion: reduce/.test(knobStyleSource),
);

// --- 6. Playground requirements. -----------------------------------------
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
  ["Cream / off-white — input trim", "Amber / gold — EQ", "Red — compression", "Blue-grey — pan", "Green — sends", "Orange — bus/group"].every(
    (text) => page.includes(text),
  ),
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

// --- 7. Scope boundaries. -------------------------------------------------
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
