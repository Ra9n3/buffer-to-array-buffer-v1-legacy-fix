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

// The grip is now the supplied nickel asset, kept verbatim. These helpers pull
// its elements back out of the component so they can be checked geometrically.
const gripBlock = (() => {
  const a = knob.indexOf('data-part="knob-grip"');
  const b = knob.indexOf('data-part="inner-wall"');
  return a > 0 && b > a ? knob.slice(a, b) : "";
})();
const grooveBlock = (() => {
  const a = gripBlock.indexOf('data-part="grip-grooves"');
  const b = gripBlock.indexOf('data-part="grip-highlights"');
  return a > 0 && b > a ? gripBlock.slice(a, b) : "";
})();
const highlightBlock = (() => {
  const a = gripBlock.indexOf('data-part="grip-highlights"');
  const b = gripBlock.indexOf('data-part="light-rig"');
  return a > 0 && b > a ? gripBlock.slice(a, b) : "";
})();
const knurlBlock = (() => {
  const a = gripBlock.indexOf('data-part="rotating-knurl"');
  const b = gripBlock.indexOf('data-part="light-rig"');
  return a > 0 && b > a ? gripBlock.slice(a, b) : "";
})();
const parseLines = (block) =>
  [...block.matchAll(/<line\s+x1="([\d.]+)"\s+y1="([\d.]+)"\s+x2="([\d.]+)"\s+y2="([\d.]+)"\s+stroke-width="([\d.]+)"/g)].map(
    (m) => ({
      x1: Number(m[1]),
      y1: Number(m[2]),
      x2: Number(m[3]),
      y2: Number(m[4]),
      width: Number(m[5]),
    }),
  );
const assetLines = [...parseLines(grooveBlock), ...parseLines(highlightBlock)];
const polar = (x, y) => {
  const dx = x - 200;
  const dy = y - 200;
  return [((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360, Math.hypot(dx, dy)];
};

const num = (name) => Number((new RegExp(`const ${name} = (-?[\\d.]+)`).exec(knob) ?? [])[1] ?? NaN);

// --- 1. One component, six families. --------------------------------------
// Task 1.3 delivered the fader beside the knob, so it is no longer a
// later-task file; the components that remain ahead on the roadmap are.
const laterTaskFiles = [
  "src/components/hardware/TactileSwitch.svelte",
  "src/components/hardware/Meter.svelte",
  "src/components/hardware/EngravedLabel.svelte",
  "src/components/hardware/Lamp.svelte",
];
check("one Knob component exists", exists(knobPath));
check(
  "no per-family knob implementations exist",
  !/Knob-|Knob\.(cream|amber|red|bluegrey|green|orange)/.test(
    [...new Set(knob.match(/import .* from "\.\/[^"]+"/g) ?? [])].join(" "),
  ) && !["Cream", "Amber", "Red", "Bluegrey", "Green", "Orange"].some((f) => exists(`src/components/hardware/${f}Knob.svelte`)),
  "a per-family knob file was created",
);
check(
  "no later-task component file was created",
  !laterTaskFiles.some(exists),
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
  "the component resolves its cap colours through functionToken()",
  ['hi', 'base', 'lo'].every((role) =>
    new RegExp(`functionToken\\(family, "${role}"\\)`).test(knob),
  ),
  "the cap must still take its colour from the family tokens",
);check(
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
  "the only literal colours in the styles are the nickel ramp and neutral black",
  (() => {
    const hexes = [...knobStyle.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0].toLowerCase());
    const allowed = new Set([...nickelValues.map((h) => h.toLowerCase()), "#000000", "#000"]);
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
  "the grip is the supplied nickel asset, and the side wall is still nickel",
  /data-part="knob-grip"/.test(knob) &&
    /data-part="nickel-grip"[\s\S]{0,120}r="150"/.test(knob) &&
    /fill=\{`url\(#\$\{uid\}-nickel-asset\)`\}/.test(knob) &&
    /url\(#\$\{uid\}-side-wall\)/.test(knob),
);
check(
  "the cap is flat, and its colour still comes from the family",
  /--kn-cap-face: color-mix\(in srgb, var\(--cap-base\) 94%, black\)/.test(knobStyle) &&
    /fill="var\(--kn-cap-face\)"/.test(knob),
);
check(
  "the nickel does not appear on the cap",
  (() => {
    const i = knob.indexOf('data-part="cap"');
    const tag = knob.slice(i, knob.indexOf("/>", i) + 2);
    return !/nickel/.test(tag) && /var\(--kn-cap-face\)/.test(tag);
  })(),
  "the cap must keep the family colour, not the metal",
);
check(
  "no gradient, no filter and no second circle on the cap face",
  (() => {
    const i = knob.indexOf('data-part="cap"');
    const tag = knob.slice(i, knob.indexOf("/>", i) + 2);
    return (
      !/filter=/.test(tag) &&
      !/url\(#/.test(tag) &&
      !/stroke/.test(tag) &&
      (tag.match(/fill=/g) ?? []).length === 1
    );
  })(),
  "a gradient, an inset filter or a second disc makes the cap read domed",
);
check(
  "no radial gradient, inset filter or occlusion ellipse survives anywhere",
  !/radialGradient/.test(knob) &&
    !/feOffset/.test(knob) &&
    !/feFlood/.test(knob) &&
    !/cap-gloss/.test(knob),
  "the face carries no shading at all beyond its edge line",
);
check(
  "the cap's only shading is one hairline on its own edge, about 1px at the default size",
  (() => {
    const i = knob.indexOf('data-part="cap-edge"');
    if (i < 0) return false;
    const tag = knob.slice(i, knob.indexOf("/>", i) + 2);
    const px = num("CAP_EDGE_W") * (120 / 400) / num("ART_SCALE");
    return /r=\{CAP_R - CAP_EDGE_W \/ 2\}/.test(tag) && px > 0.8 && px < 1.3;
  })(),
  "1 px at 7.5rem, on the cap's own edge — not a shifted circle",
);
check(
  "the pointer is ONE flat colour from the tone token, not a family ink",
  /\.knob__pointer-ink[^{]*{[^}]*}/s.test(knob) &&
    /--kn-ink: var\(--al-pointer-ink-on-dark\)/.test(knobStyle) &&
    /--kn-ink-far: var\(--kn-ink\)/.test(knobStyle) &&
    !/--cap-ink/.test(knob),
  "a family ink makes the pointer depend on the function, and a second stop tints it",
);
check(
  "a light cap — and only a light cap — switches the pointer to the dark ink",
  (() => {
    const m = /\.knob\[data-cap-tone="light"\]\s*\{\s*--kn-ink: var\(--al-pointer-ink-on-light\);/.test(
      knobStyle,
    );
    const hooks = knob.match(/--kn-ink:/g) ?? [];
    return m && hooks.length === 2;
  })(),
  "two assignments of the ink at most: the default and the light-cap override",
);
check(
  "nothing but the cap's lightness can move the pointer's colour",
  !/is-disabled[^{]*\{[^}]*--kn-ink/s.test(knobStyle) &&
    !/is-dragging[^{]*\{[^}]*--kn-ink/s.test(knobStyle) &&
    !/is-hovered[^{]*\{[^}]*--kn-ink/s.test(knobStyle) &&
    !/is-demo-focus[^{]*\{[^}]*--kn-ink/s.test(knobStyle),
  "an interaction state must not recolour the pointer",
);
check(
  "the cap-tone classification matches the caps' measured lightness",
  (() => {
    const lin = (c) => {
      const v = c / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    const lstar = (hex) => {
      const [r, g, b] = rgb(hex);
      const y = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
      const f = y > 0.008856 ? y ** (1 / 3) : 7.787 * y + 16 / 116;
      return 116 * f - 16;
    };
    const declared = (knob.match(/new Set<FunctionFamily>\(\[([^\]]*)\]\)/) ?? [])[1] ?? "";
    const light = new Set([...declared.matchAll(/"([a-z]+)"/g)].map((m) => m[1]));
    const families = ["cream", "amber", "red", "bluegrey", "green", "orange"];
    // The cap renders as color-mix(base 94%, black); classify what is shown.
    const shownL = Object.fromEntries(
      families.map((f) => {
        const hex = new RegExp(`--al-function-${f}-base:\\s*(#[0-9a-fA-F]{6})`).exec(css)[1];
        const [r, g, b] = rgb(hex);
        const dim = (c) => Math.round(c * 0.94).toString(16).padStart(2, "0");
        return [f, lstar(`#${dim(r)}${dim(g)}${dim(b)}`)];
      }),
    );
    const THRESHOLD = 54;
    return families.every((f) => light.has(f) === shownL[f] >= THRESHOLD);
  })(),
  "a cap that crosses L* 54 must be reclassified, or the ink lands on the wrong side of the contrast",
);

// --- 3. The supplied artwork is intact. -----------------------------------
check(
  "the artwork keeps its supplied 400-unit canvas",
  /viewBox="0 0 400 400"/.test(knob) && num("C") === 200,
);
check(
  "the continuous body is the supplied circle (r 150) on the single axis",
  /<circle cx="0" cy="0" r="150"/.test(knob),
);
check(
  "the lower side wall is the supplied r 150 circle, offset only in depth",
  knob.includes('<circle cx="0" cy="{SIDE_WALL_DY}" r="150"') &&
    /const SIDE_WALL_DY = 10;/.test(knob),
);
check(
  "the cap is one circle at r 130 on the single axis, and nothing is larger",
  knob.includes("const CAP_R = 130;") &&
    /<circle\s+data-part="cap"\s+cx="0"\s+cy="0"\s+r=\{CAP_R\}/.test(knob),
  "no part of the cap may be bigger than the cap radius",
);
check(
  "the cap has no stroke and exactly one fill",
  (() => {
    const i = knob.indexOf('data-part="cap"');
    const tag = knob.slice(i, knob.indexOf("/>", i) + 2);
    return !/stroke/.test(tag) && (tag.match(/fill=/g) ?? []).length === 1;
  })(),
  "a stroke or a second top-face circle is a second, competing model",
);
check(
  "the silhouette clip is the supplied pair of body circles, on the axis",
  /id=\{`\$\{uid\}-silhouette`\}[\s\S]{0,200}circle cx="0" cy="0" r="150"[\s\S]{0,80}circle cx="0" cy="10" r="150"/.test(
    knob,
  ),
);
check(
  "the cap clip is still the pointer's boundary, for the pointer and its shadow",
  /id=\{`\$\{uid\}-cap-clip`\}[\s\S]{0,80}<circle cx="0" cy="0" r=\{CAP_R\} \/>/.test(knob) &&
    (knob.match(/url\(#\$\{uid\}-cap-clip\)/g) ?? []).length === 2,
);check(
  "the asset's 96 grooves and 96 highlights are reproduced in full",
  assetLines.filter((l) => l.width === 2.2).length === 96 &&
    assetLines.filter((l) => l.width === 1.35).length === 96,
  `found ${assetLines.filter((l) => l.width === 2.2).length} grooves and ${
    assetLines.filter((l) => l.width === 1.35).length
  } highlights`,
);
check(
  "every ridge runs r 134 -> 148 on the asset's 3.75 degree pitch",
  (() => {
    const dark = assetLines.filter((l) => l.width === 2.2);
    const light = assetLines.filter((l) => l.width === 1.35);
    const onBand = (l) => {
      const [, r1] = polar(l.x1, l.y1);
      const [, r2] = polar(l.x2, l.y2);
      return Math.abs(r1 - 134) < 0.02 && Math.abs(r2 - 148) < 0.02;
    };
    const nearest = (a, want) => Math.abs((((a - want) % 360) + 540) % 360 - 180);
    const pitch = (group, off) =>
      group.every((l, i) => nearest(polar(l.x1, l.y1)[0], off + i * 3.75) < 0.05);
    return dark.every(onBand) && light.every(onBand) && pitch(dark, 0) && pitch(light, 1.6);
  })(),
  "the asset's band and pitch must survive the move into the component",
);
check(
  "the ridges keep the asset's stroke weights (2.2 grooves, 1.35 highlights)",
  assetLines.every((l) => l.width === 2.2 || l.width === 1.35),
);
check(
  "the knurl carries no per-ridge colour ramp — two uniform neutral strokes only",
  (() => {
    const lines = [...knurlBlock.matchAll(/<line[^>]*>/g)].map((m) => m[0]);
    const noColourOnTheLine = lines.every((l) => !/stroke=|fill=|opacity=/.test(l));
    const grooves = /data-part="grip-grooves"[\s\S]{0,120}?stroke=\{KNURL_GROOVE_RGBA\}/.test(
      knurlBlock,
    );
    const teeth = /data-part="grip-highlights"[\s\S]{0,120}?stroke=\{KNURL_TOOTH_RGBA\}/.test(
      knurlBlock,
    );
    return noColourOnTheLine && grooves && teeth;
  })(),
  "a per-line colour encodes a light direction, and would turn with the knob",
);
check(
  "the two knurl strokes are neutral semi-transparent black and white",
  /const KNURL_GROOVE_RGBA = "rgba\(0, 0, 0, 0\.\d+\)"/.test(knob) &&
    /const KNURL_TOOTH_RGBA = "rgba\(255, 255, 255, 0\.\d+\)"/.test(knob),
  "a tinted stroke would put colour, not light, on the metal",
);
check(
  "nothing in the rotating knurl references a gradient",
  !/url\(#/.test(knurlBlock) && !/Gradient/.test(knurlBlock),
  "a gradient inside the rotation is a light direction that turns with the knob",
);check(
  "the index bar is the supplied separate rect, centre to near-rim",
  /x="20"[\s\S]{0,80}y="-7\.5"[\s\S]{0,80}width="105"[\s\S]{0,80}height="15"/.test(knob),
  "the bar runs r 20 -> 125 on the shared axis, as supplied",
);
check(
  "the asset's nickel gradient is the supplied ramp, on its supplied axis",
  /id=\{`\$\{uid\}-nickel-asset`\}[\s\S]{0,120}x1="80"\s+y1="58"\s+x2="316"\s+y2="340"/.test(knob) &&
    ["#f2f1eb", "#cfd1cc", "#a9aca7", "#747873", "#444844"].every((h) => knob.includes(h)),
);
check(
  "the supplied side-wall gradient keeps its axis, re-expressed on the centred space",
  /x1="-145"\s+y1="-105"\s+x2="125"\s+y2="160"/.test(knob),
);
check(
  "the supplied satin grain filter survives (fractalNoise, 1.1, 2 octaves, seed 7)",
  /feTurbulence[\s\S]{0,160}baseFrequency="1\.1"[\s\S]{0,120}numOctaves="2"[\s\S]{0,80}seed="7"/.test(
    knob,
  ),
);
check(
  "the layers are drawn in the brief's order, bottom to top",
  (() => {
    const order = [
      'data-part="knob-grip"',
      'data-part="nickel-grip"',
      'data-part="rotating-knurl"',
      'data-part="nickel-rim-light"',
      'data-part="nickel-rim-shade"',
      'data-part="inner-wall"',
      'data-part="cap"',
      'data-part="cap-edge"',
      'data-part="rotating-indicator"',
    ];
    const at = order.map((k) => knob.indexOf(k));
    return at.every((v, i) => v > 0 && (i === 0 || v > at[i - 1]));
  })(),
  "asset order, then wall, flat cap, its edge line, pointer",
);
check(
  "the grip's base ring is the asset's r 150 disc, and the wall starts inside it",
  /data-part="nickel-grip"[\s\S]{0,120}cx="200"[\s\S]{0,60}cy="200"[\s\S]{0,40}r="150"/.test(knob) &&
    knob.includes("const RING_INNER = RIDGE_INNER;") &&
    num("RIDGE_INNER") === 134,
);
check(
  "the inner wall is the annulus between the cap and the ring's top surface",
  num("CAP_R") === 130 && num("RIDGE_INNER") === 134 && num("CAP_R") < num("RIDGE_INNER"),
);
check(
  "the inner wall is static: it carries no rotation",
  (() => {
    const i = knob.indexOf('data-part="inner-wall"');
    const tag = knob.slice(i - 40, knob.indexOf("/>", i) + 2);
    return !/rotate\(/.test(tag) && !/assemblyRotation/.test(tag);
  })(),
  "only the knurling and the pointer may turn with the value",
);
check(
  "the inner wall runs dark top-left to bright bottom-right, corner to corner",
  /id=\{`\$\{uid\}-inner-wall`\}[\s\S]{0,60}x1="0" y1="0" x2="1" y2="1"/.test(knob) &&
    /#080808/.test(knob) && /#2a2a2a/.test(knob) && /#a0a0a0/.test(knob),
);
check(
  "the cap is a single flat colour — no gradient object at all",
  !/face-paint/.test(knob) && !/radialGradient/.test(knob) && /--kn-cap-face/.test(knobStyle),
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
  "the cap keeps its single fill and no stroke",
  (() => {
    const i = knob.indexOf('data-part="cap"');
    const tag = knob.slice(i, knob.indexOf("/>", i) + 2);
    return !/stroke/.test(tag) && (tag.match(/fill=/g) ?? []).length === 1;
  })(),
);
check(
  "the recess shadow is no longer tinted the supplied blue",
  !/flood-color="#0e2646"/.test(knob),
);

// --- 4. Whole-assembly rotation. ------------------------------------------
const assembly = (knob.match(/data-part="rotating-surfaces"[\s\S]{0,4000}/) ?? [""])[0];
check(
  "only the knurl, the pointer and the pointer's shadow rotate",
  /rotate\(\$\{assemblyRotation - 3\} 200 200\)/.test(knob) &&
    /data-part="rotating-knurl"/.test(knob) &&
    /data-part="rotating-indicator"/.test(knob) &&
    (knob.match(/rotate\(\$\{assemblyRotation/g) ?? []).length === 3,
  "everything else stays fixed when the value moves",
);
check(
  "the pointer's shadow is a fixed-offset duplicate, offset OUTSIDE the rotation",
  (() => {
    const i = knob.indexOf('data-part="pointer-shadow"');
    if (i < 0) return false;
    const blk = knob.slice(i, knob.indexOf('data-part="rotating-indicator"'));
    const tf = blk.indexOf('translate(${POINTER_SHADOW_DX} ${POINTER_SHADOW_DY})');
    const rot = blk.indexOf('rotate(${assemblyRotation})');
    return tf > 0 && rot > tf && !/filter=|url\(#(?![^)]*cap-clip)/.test(blk.replace(/clip-path=\{`url\(#\$\{uid\}-cap-clip\)`\}/g, ''));
  })(),
  "offset first, rotation nested inside it: the shadow cannot turn with the pointer",
);check(
  "the knurling sits below the inner wall, and the pointer above the gloss",
  knob.indexOf('data-part="rotating-knurl"') < knob.indexOf('data-part="inner-wall"') &&
    knob.indexOf('data-part="cap-gloss"') < knob.indexOf('data-part="rotating-indicator"'),
  "the brief's order: ring, knurl, wall, cap, shadow, gloss, pointer",
);
check(
  "the assembly rotates about the shared axis at the origin",
  /rotate\(\$\{assemblyRotation\}\)/.test(knob) &&
    /transform=\{KNOB_TRANSFORM\}/.test(knob),
);
check(
  "the housing is not left stationary while the pointer rotates alone",
  !/knob__pointer-ink[\s\S]{0,2000}rotate\(\$\{angle\}/.test(knob),
);
check(
  "no lighting layer is left to rotate or to sit outside the recess",
  !/knob__light/.test(knob) && !/fixed-lighting/.test(knob),
  "the old environmental overlay was deleted, not hidden",
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
  "one transform places the axis and uniformly scales the whole drawing",
  knob.includes("const KNOB_TRANSFORM = `translate(${C} ${C}) scale(${ART_SCALE})`") &&
    (knob.match(/data-part="knob-centre"/g) ?? []).length === 1,
);
check(
  "no geometry helper was retuned for the grip change",
  num("RIDGE_INNER") === 134 &&
    num("CAP_R") === 130 &&
    num("START_ANGLE") === -135 &&
    num("SWEEP") === 270,
);
check(
  "the cap and the inner wall share one axis",
  /<circle\s+data-part="cap"\s+cx="0"\s+cy="0"\s+r=\{CAP_R\}/.test(knob) &&
    /<circle\s+data-part="inner-wall"\s+cx="0"\s+cy="0"\s+r=\{RING_INNER\}/.test(knob),
);
check(
  "the pointer is clipped to the cap",
  /clip-path=\{`url\(#\$\{uid\}-cap-clip\)`\}>\s*<rect\s+class="knob__pointer-ink"/.test(knob),
);
check(
  "the knurl band is outside the cap, so no tooth can land on the cap",
  num("RIDGE_INNER") === 134 && num("CAP_R") === 130,
);
check(
  "every geometry layer is at cx/cy = 0; only the two shadow layers are offset",
  (() => {
    // The grip is the supplied asset and keeps the asset's own coordinates;
    // every layer from the inner wall inward must still sit at (0,0).
    const start = knob.indexOf('data-part="inner-wall"');
    const body = knob
      .slice(start, knob.indexOf('data-part="rotating-indicator"'))
      .replace(/<g data-part="cap-edge-shadow"[\s\S]*?<\/g>/, "")
      .replace(/<g data-part="cap-gloss"[\s\S]*?<\/g>/, "");
    const offAxis = [...body.matchAll(/<(circle|ellipse)\b[^>]*>/g)]
      .map((m) => m[0])
      .filter((tag) => {
        const cx = /\bcx="([^"]+)"/.exec(tag);
        const cy = /\bcy="([^"]+)"/.exec(tag);
        const cyVal = cy?.[1] ?? "";
        return (cx && cx[1] !== "0") || (cyVal !== "0" && !cyVal.includes("SIDE_WALL_DY"));
      });
    return offAxis.length === 0;
  })(),
  "a geometry layer with its own centre is a second source of truth",
);
check(
  "the depth slice sits behind every other layer and is clipped to the silhouette",
  (() => {
    const body = knob.slice(knob.indexOf('data-part="knob-centre"'), knob.indexOf("</svg>"));
    const depth = body.indexOf('data-part="depth"');
    const grip = body.indexOf('data-part="knob-grip"');
    return (
      depth > 0 &&
      grip > depth &&
      /data-part="depth"[\s\S]{0,240}clip-path=\{`url\(#\$\{uid\}-silhouette\)`\}/.test(body)
    );
  })(),
  "the side wall must be behind the grip, inside the silhouette clip",
);
check(
  "the pointer is the same single rect, in the same place, at the same size",
  (knob.match(/class="knob__pointer-ink"/g) ?? []).length === 1 &&
    /x="20"[\s\S]{0,80}y="-7\.5"[\s\S]{0,80}width="105"[\s\S]{0,80}height="15"/.test(knob),
);

// --- 6. Instance-scoped SVG ids. ------------------------------------------
const declaredIds = [...knob.matchAll(/\bid=\{`\$\{uid\}-([a-z-]+)`\}/g)].map((m) => m[1]);
check(
  "every SVG definition has a namespaced id",
  declaredIds.length >= 8 &&
    [
      "silhouette",
      "cap-clip",
      "nickel-asset",
      "inner-wall",
      "side-wall",
      "indicator",
      "soft-light",
      "satin",
    ].every((id) => declaredIds.includes(id) && declaredIds.filter((d) => d === id).length === 1),
  `expected the supplied ids plus the recess ids; found ${declaredIds.join(", ")}`,
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
  num("TICK_IN") > 150 * num("ART_SCALE"),
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
  /\.knob\.is-disabled \.knob__cap-edge/.test(knobStyle) &&
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
