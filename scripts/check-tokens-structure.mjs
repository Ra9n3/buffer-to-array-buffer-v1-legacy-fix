#!/usr/bin/env node
/**
 * Design-token + playground structural contract check — Task 1.1.
 *
 * Dependency-free guard (Node built-ins only), matching the existing
 * check:arrange / check:mixer / check:transport pattern. No test framework was
 * added, because the project has none and this task must not introduce one.
 *
 * It does NOT test rendering: the playground was verified in a real browser at
 * 1920x1080, 1024x768 and 768x900. What it tests is the source contract:
 *
 *   1. tokens.css is the single authoritative source of values.
 *   2. tokens.ts registers exactly the tokens that tokens.css declares — no
 *      token without metadata, no metadata without a token, no duplicates.
 *   3. Every token carries a label, a usage note and a provenance source.
 *   4. The functional palette matches the governing documents: six families,
 *      the right meanings, four cap roles each, and a lamp value inside the
 *      range the hardware spec fixes.
 *   5. The playground renders every category from the registry and shows each
 *      token's name and live value — it does not keep a second copy of values.
 *   6. The dev route is reachable, is NOT a room, and is absent from the room
 *      navigation.
 *   7. No Phase 2 skinning: no token is referenced by a room or room component.
 *
 * Run: npm run check:tokens
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

const css = read("src/lib/tokens.css");
const registry = read("src/lib/tokens.ts");
const rooms = read("src/lib/rooms.ts");
const app = read("src/App.svelte");
const main = read("src/main.ts");
const pagePath = "src/dev/DevComponentsPage.svelte";
const page = read(pagePath);

// --- 1 & 2. Single source, exact parity both directions. -------------------
const cssDecls = [...css.matchAll(/^\s+(--al-[a-z0-9-]+):\s*([^;]+);/gm)].map((m) => ({
  name: m[1],
  value: m[2].trim(),
}));
const cssNames = cssDecls.map((d) => d.name);
const regNames = [...registry.matchAll(/name: "(--al-[a-z0-9-]+)"/g)].map((m) => m[1]);

check("tokens.css declares tokens", cssNames.length > 0, `found ${cssNames.length}`);
check("tokens.ts registers tokens", regNames.length > 0, `found ${regNames.length}`);
check(
  "no duplicate token declarations in tokens.css",
  new Set(cssNames).size === cssNames.length,
);
check(
  "no duplicate token registrations in tokens.ts",
  new Set(regNames).size === regNames.length,
);

const missingMeta = cssNames.filter((n) => !regNames.includes(n));
const orphanMeta = regNames.filter((n) => !cssNames.includes(n));
check(
  "every token in tokens.css is registered in tokens.ts",
  missingMeta.length === 0,
  `unregistered: ${missingMeta.join(", ")}`,
);
check(
  "every token registered in tokens.ts exists in tokens.css",
  orphanMeta.length === 0,
  `orphaned: ${orphanMeta.join(", ")}`,
);

check(
  "every value lives in tokens.css, none in tokens.ts",
  !/:\s*#[0-9a-fA-F]{3,8}\b/.test(registry.replace(/\/\*[\s\S]*?\*\//g, "")),
  "a hex colour literal was found in the registry",
);

// --- 3. Every token is documented. ----------------------------------------
const entryCount = (registry.match(/name: "--al-/g) ?? []).length;
check(
  "every registered token has a label, usage and source",
  (registry.match(/label: "/g) ?? []).length === entryCount &&
    (registry.match(/usage: "/g) ?? []).length === entryCount &&
    (registry.match(/source: "/g) ?? []).length === entryCount,
);
check(
  "every registered token has a category",
  (registry.match(/category: "/g) ?? []).length === entryCount,
);

// --- 4. The palette agrees with the governing documents. ------------------
const specPlan = read("ALLOY-PRODUCT-DESIGN-BUILD-PLAN.txt");
const specHw = read("ALLOY-HARDWARE-REFERENCE-SPEC.md");

const FAMILIES = {
  cream: "Input trim and gain staging",
  amber: "EQ and tonal controls",
  red: "Compression and dynamics",
  bluegrey: "Pan, stereo image, spatial placement",
  green: "Sends, auxiliary paths, reverb/delay",
  orange: "Bus/group masters",
};

check(
  "the plan's six functional colour families are all present",
  Object.keys(FAMILIES).every((key) => cssNames.includes(`--al-function-${key}-base`)),
);
for (const [key, meaning] of Object.entries(FAMILIES)) {
  check(
    `${key} family carries its plan-defined meaning`,
    new RegExp(`family: "${key}"[^}]*applies: "[^"]*${meaning.split(",")[0]}`).test(registry),
  );
  check(
    `${key} family declares all four cap roles`,
    ["base", "hi", "lo", "ink"].every((r) => cssNames.includes(`--al-function-${key}-${r}`)),
  );
}

// Hardware spec §4a: lamp glow "in the approximate range #e8a454–#f0c27a".
const lamp = cssDecls.find((d) => d.name === "--al-material-lamp")?.value ?? "";
const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const within = (v, lo, hi) => {
  const [r, g, b] = hexToRgb(v);
  const [lr, lg, lb] = hexToRgb(lo);
  const [hr, hg, hb] = hexToRgb(hi);
  return r >= lr && r <= hr && g >= lg && g <= hg && b >= lb && b <= hb;
};
check(
  "lamp token sits inside the hardware spec's #e8a454–#f0c27a range",
  /^#[0-9a-f]{6}$/i.test(lamp) && within(lamp, "#e8a454", "#f0c27a"),
  `value is ${lamp}`,
);

check(
  "organisational palette stays within the plan's 24-swatch cap",
  cssNames.filter((n) => /^--al-org-/.test(n)).length <= 25,
  "24 swatches plus neutral is the limit",
);
check(
  "a distinct organisational neutral state exists",
  cssNames.includes("--al-org-neutral"),
);

// Plan §4 material requirements are represented, not merely claimed.
for (const [token, why] of [
  ["--al-material-surface", "dark grey-green control surface"],
  ["--al-material-wood", "walnut/rosewood trim"],
  ["--al-material-cream", "cream meter face"],
  ["--al-material-lamp", "incandescent amber glow"],
  ["--al-material-metal", "subtle metal"],
]) {
  check(`material requirement present: ${why}`, cssNames.includes(token));
}

// Plan §4 typography: engraved/condensed labels vs readable interface text.
check(
  "a condensed label family is tokenised",
  /--al-font-label:/.test(css) && /Condensed|Narrow/.test(css),
);
check(
  "a separate readable interface family is tokenised",
  /--al-font-ui:/.test(css),
);
check(
  "engraved lettering has a fill and a cut-edge highlight",
  cssNames.includes("--al-text-engraved") &&
    cssNames.includes("--al-text-engraved-highlight"),
);

// --- 5. The playground consumes the real registry. ------------------------
check("the dev page exists", exists(pagePath));
check(
  "the page imports the token registry",
  /from "\.\.\/lib\/tokens"/.test(page),
);
check(
  "the page renders the registered categories, not a local list",
  /TOKEN_CATEGORIES as category/.test(page) && !/const CATEGORIES\s*=/.test(page),
);
check(
  "the page reads live values instead of copying them",
  /readTokenValues\(\)/.test(page),
);
check(
  "the page shows every token's name and value",
  page.includes("data-dev-token={token.name}") &&
    page.includes("data-token-value={token.name}"),
);
check(
  "the page renders functional families from the registry",
  /functionFamilies\(\)/.test(page),
);
check(
  "the page has no hard-coded colour or size specimen values",
  !/#[0-9a-fA-F]{6}\b/.test(page.replace(/\/\*[\s\S]*?\*\//g, "").split("<style>")[0]),
);
// The page's own layout dimensions (swatch height, bar height) are page
// geometry, not design tokens. What must not appear is a raw type ramp: every
// font-size on the page resolves through a --al-text-size-* token.
const pageStyles = page.slice(page.indexOf("<style>"));
check(
  "every font-size on the page comes from a token",
  !/font-size:\s*[0-9]/.test(pageStyles),
  "a raw numeric font-size was found",
);
const nav = read("src/components/RoomNav.svelte").replace(/\/\*[\s\S]*?\*\//g, "");
check(
  "the page is not linked from the room navigation",
  !/DevComponentsPage/.test(nav) && !/DEV_COMPONENTS_HREF/.test(nav),
);

// --- 6. Route reachable but not a room. -----------------------------------
check(
  "the dev route constant exists",
  /DEV_COMPONENTS_HREF = `#\$\{DEV_COMPONENTS_PATH\}`/.test(rooms),
);
check(
  "the dev route is parsed by the router",
  /isDevComponentsHash/.test(rooms) && /routeFromHash/.test(rooms),
);
check(
  "the dev route is NOT in the ROOMS navigation list",
  !/dev-components/.test(rooms.slice(rooms.indexOf("export const ROOMS"), rooms.indexOf("DEFAULT_ROOM"))),
);
check("the shell renders the dev page", /<DevComponentsPage \/>/.test(app));
check(
  "the shell does not flag the dev page as a room",
  /data-active-room=\{activeRoom\}/.test(app) && /room \?\? "dev"/.test(app),
);
check("tokens.css is loaded by the app", /import "\.\/lib\/tokens\.css"/.test(main));

// --- 7. No Phase 2 skinning. ----------------------------------------------
const roomSources = [
  "src/rooms/ConsoleRoom.svelte",
  "src/rooms/ArrangeRoom.svelte",
  "src/rooms/MixerRoom.svelte",
  // ChannelBank.svelte left this list in Task 2.2 (the bank is skinned);
  // ChannelStrip.svelte (the pinned placeholders) stays until Task 2.4.
  "src/components/ChannelStrip.svelte",
  "src/components/ArrangeTrackRow.svelte",
  "src/components/ArrangeTimelineLane.svelte",
  "src/components/MixerChannelStrip.svelte",
  "src/components/MixerDetailPanel.svelte",
  "src/components/RoomNav.svelte",
  "src/components/RoomShell.svelte",
  "src/components/MiniTransport.svelte",
];
for (const rel of roomSources) {
  check(
    `tokens are not applied to ${rel.split("/").pop()} (Phase 2 work)`,
    !/var\(--al-/.test(read(rel)),
  );
}
check(
  "no Phase 1 component (knob/fader/switch/meter/lamp) was built",
  !["src/components/Knob.svelte", "src/components/Fader.svelte", "src/components/TactileSwitch.svelte", "src/components/VUMeter.svelte", "src/components/Lamp.svelte"].some(exists),
);

// --- Report. ---------------------------------------------------------------
for (const name of passes) console.log(`  PASS  ${name}`);

if (failures.length > 0) {
  console.error("");
  for (const failure of failures) console.error(`  FAIL  ${failure}`);
  console.error("");
  console.error(`Design token contract check — ${passes.length}/${passes.length + failures.length} passed`);
  process.exit(1);
}

console.log("");
console.log(`Design token contract check — ${passes.length}/${passes.length} passed`);
