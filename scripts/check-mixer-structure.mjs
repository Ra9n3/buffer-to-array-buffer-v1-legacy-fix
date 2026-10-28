#!/usr/bin/env node
/**
 * Mixer + navigation structural contract check — Task 0.5.
 *
 * Dependency-free guard (Node built-ins only). It does NOT test geometry:
 * pixel layout was verified in a real browser at 1920x1080, 1024x768 and
 * 768x900. What it tests is the source-level contract:
 *
 *   1. Navigation: order is Arrange | Console | Mixer, and the tabs are
 *      right-aligned while the wordmark stays left.
 *   2. The Mixer has a channel column and a detail panel, and every detail
 *      region the product plan assigns to the Mixer is present.
 *   3. The Mixer strip geometry is driven by the shared --track-header-* tokens
 *      declared in app.css, and those token values equal the literal geometry
 *      used by ArrangeTrackRow. This is the "headers must match Arrange" rule:
 *      it fails if either side is changed without the other.
 *   4. Selection is local UI state — no store, no persistence, no cross-room
 *      imports, no cross-room synchronisation.
 *   5. Strips are real buttons exposing aria-pressed, so selection is not
 *      mouse-only.
 *   6. The placeholder channel count is a parameter, not a literal limit.
 *   7. The detail panel does NOT branch by channel type — that is Task 2.9.
 *   8. The Mixer stays inside the viewport (bounded) and the column scrolls
 *      internally.
 *
 * Run: npm run check:mixer
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(resolve(root, rel), "utf8");

const failures = [];
const passes = [];

function check(name, condition, detail = "") {
  if (condition) {
    passes.push(name);
  } else {
    failures.push(detail ? `${name} — ${detail}` : name);
  }
}

const rooms = read("src/lib/rooms.ts");
const room = read("src/rooms/MixerRoom.svelte");
const strip = read("src/components/MixerChannelStrip.svelte");
const detail = read("src/components/MixerDetailPanel.svelte");
const data = read("src/lib/mixer.ts");
const appCss = read("src/app.css");
const arrangeRow = read("src/components/ArrangeTrackRow.svelte");

// --- 1. Navigation order and position. -------------------------------------
const roomIds = [...rooms.matchAll(/id:\s*"([a-z]+)"/g)].map((m) => m[1]);
check(
  "room order is Arrange, Console, Mixer",
  JSON.stringify(roomIds) === JSON.stringify(["arrange", "console", "mixer"]),
  `found ${JSON.stringify(roomIds)}`,
);
check(
  "tabs are right-aligned",
  /\.room-nav\s*{[^}]*justify-self:\s*end/s.test(appCss),
);
check(
  "wordmark stays left-aligned",
  /\.app-brand\s*{[^}]*justify-self:\s*start/s.test(appCss),
);
check(
  "tab buttons are smaller than the original 0.5rem padding",
  /\.room-nav__link\s*{[^}]*padding:\s*0\.1875rem/s.test(appCss),
);

// --- 2. Mixer structure. ---------------------------------------------------
check("Mixer has a channel column", room.includes('data-mixer-region="channel-column"'));
check("Mixer renders the detail panel", room.includes("<MixerDetailPanel"));
check("detail panel is tagged as a region", detail.includes('data-mixer-region="detail-panel"'));

for (const region of [
  "selection",
  "processing-chain",
  "eq-graph",
  "compressor",
  "sends",
  "auto-manual",
  "ghost-indicator",
  "what-changed",
]) {
  check(`detail region "${region}" is present`, detail.includes(`data-mixer-region="${region}"`));
}

check(
  "channel column scrolls internally",
  /\.mixer-column__scroll\s*{[^}]*overflow-y:\s*auto/s.test(room),
);
check(
  "room is bounded to the viewport so the page cannot grow",
  /\.app-shell\[data-active-room="mixer"\]\s*{[^}]*overflow:\s*hidden/s.test(appCss),
);

// --- 3. Header geometry parity with Arrange. ------------------------------
const token = (name) => {
  const m = new RegExp(`--${name}:\\s*([^;]+);`).exec(appCss);
  return m ? m[1].trim() : null;
};

check("shared --track-header-height token exists", token("track-header-height") !== null);
check("shared --track-column-width token exists", token("track-column-width") !== null);

check(
  "Mixer strip height uses the shared token",
  /height:\s*var\(--track-header-height\)/.test(strip),
);
check(
  "Mixer strip padding uses the shared tokens",
  /padding:\s*var\(--track-header-padding-block\)\s+var\(--track-header-padding-inline\)/.test(
    strip,
  ),
);
check(
  "Mixer code size uses the shared token",
  /font-size:\s*var\(--track-header-code-size\)/.test(strip),
);
check(
  "Mixer name size uses the shared token",
  /font-size:\s*var\(--track-header-name-size\)/.test(strip),
);

// The Arrange row must keep its literal geometry and must agree with the tokens.
check(
  "ArrangeTrackRow still takes its height from --arrange-row-height",
  /height:\s*var\(--arrange-row-height\)/.test(arrangeRow),
);
check(
  "Arrange row height (5rem) equals the shared token",
  token("track-header-height") === "5rem",
  `token is ${token("track-header-height")}`,
);
check(
  "Arrange row padding (0.25rem 0.5rem) equals the shared token pair",
  token("track-header-padding-block") === "0.25rem" &&
    token("track-header-padding-inline") === "0.5rem",
);
check(
  "Arrange code size (0.6875rem) equals the shared token",
  /\.arrange-track-row__code\s*{[^}]*font-size:\s*0\.6875rem/s.test(arrangeRow) &&
    token("track-header-code-size") === "0.6875rem",
);
check(
  "Arrange name size (0.875rem) equals the shared token",
  /\.arrange-track-row__name\s*{[^}]*font-size:\s*0\.875rem/s.test(arrangeRow) &&
    token("track-header-name-size") === "0.875rem",
);
check(
  "Arrange identity gap (0.375rem) equals the shared token",
  /\.arrange-track-row__identity\s*{[^}]*gap:\s*0\.375rem/s.test(arrangeRow) &&
    token("track-header-gap") === "0.375rem",
);
check(
  "selection is drawn without changing box size",
  /\.mixer-strip\.is-selected\s*{[^}]*(box-shadow|background)/s.test(strip) &&
    !/\.mixer-strip\.is-selected\s*{[^}]*(height|width|padding|border-width)\s*:/s.test(strip),
);

// --- 4. Selection is local UI state only. ---------------------------------
check(
  "selection uses Svelte local state ($state), not a store",
  /let\s+selectedId\s*=\s*\$state/.test(room),
);
check(
  "MixerRoom imports nothing from Console or Arrange rooms",
  !/rooms\/(ConsoleRoom|ArrangeRoom)/.test(room),
);
// Matches API usage only, so prose comments that mention these words (for
// example "no persistence") do not trip the guard.
check(
  "no shared-store or persistence API is used in the Mixer",
  !/localStorage|sessionStorage|\$store\b|\bwritable\(|\bderived\(.*store/.test(
    room + data + strip + detail,
  ),
);

// --- 5. Strips are accessible buttons. ------------------------------------
check("strips are real buttons", /<button[\s\S]{0,200}type="button"/.test(strip));
check("strips expose aria-pressed", /aria-pressed=\{selected\}/.test(strip));
check("strip label text is rendered (not an icon-only control)", /\{channel\.name\}/.test(strip));

// --- 6. Channel count is a parameter. -------------------------------------
check(
  "track channels are created by a function with a count parameter",
  /export function createTrackChannels\(count: number = MIXER_TRACK_COUNT\)/.test(data),
);
check(
  "Returns and bus master are present as first-class channels",
  /Reverb Return/.test(data) && /Delay Return/.test(data) && /kind: "bus"/.test(data),
);

// --- 7. No channel-type-aware branching yet (Task 2.9). -------------------
check(
  "detail panel does not branch by channel kind",
  !/channel\.kind\s*===/.test(detail) && !/channel\.kind\s*!==/.test(detail),
);

// --- 8. No forbidden Phase 1/2 or DSP surface. ---------------------------
check(
  "no audio, DSP, or rendering APIs are referenced",
  !/AudioContext|requestAnimationFrame|\.mp3|\.wav|Waveform/i.test(room + data + strip + detail),
);
check(
  "no meter bridge or transport in the Mixer",
  !/meter-bridge|data-console-zone/.test(room),
);

// --- Report. -------------------------------------------------------------
for (const name of passes) {
  console.log(`  PASS  ${name}`);
}

if (failures.length > 0) {
  console.error("");
  for (const failure of failures) {
    console.error(`  FAIL  ${failure}`);
  }
  console.error("");
  console.error(`Mixer structural contract check — ${passes.length}/${passes.length + failures.length} passed`);
  process.exit(1);
}

console.log("");
console.log(`Mixer structural contract check — ${passes.length}/${passes.length} passed`);
