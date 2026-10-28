#!/usr/bin/env node
/**
 * Mixer room structural contract check — Task 0.5.
 *
 * Dependency-free guard (Node built-ins only). It does NOT test geometry:
 * pixel layout and selection behaviour were verified in a real browser at
 * 1920x1080, 1024x768 and 768x900. What it tests is the source-level contract
 * that keeps the layout and the selection wiring sound:
 *
 *   1. Every Mixer detail region the product plan assigns to this room exists.
 *   2. Selection is local UI state — no imports from Console or Arrange, no
 *      shared store, no persistence.
 *   3. The strips are real buttons exposing aria-pressed, so selection is not
 *      mouse-only.
 *   4. The channel count stays a parameter, not a literal in markup.
 *   5. The detail panel does NOT branch by channel type yet — that is Task 2.9,
 *      and doing it early would be scope creep.
 *   6. The room is bounded so it scrolls internally instead of pushing the page.
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

const room = read("src/rooms/MixerRoom.svelte");
const strip = read("src/components/MixerChannelStrip.svelte");
const data = read("src/lib/mixer.ts");
const appCss = read("src/app.css");

// --- 1. All plan-assigned detail regions present.
for (const region of [
  "channel-column",
  "detail-panel",
  "selection",
  "processing-chain",
  "eq-graph",
  "compressor",
  "sends",
  "auto-manual",
  "ghost-indicator",
  "what-changed",
]) {
  check(`region "${region}" is present`, room.includes(`data-mixer-region="${region}"`));
}

// --- 2. Selection is local UI state only.
check(
  "selection uses Svelte local state ($state), not a store",
  /let\s+selectedId\s*=\s*\$state/.test(room),
);
check(
  "MixerRoom imports nothing from Console or Arrange rooms",
  !/rooms\/(ConsoleRoom|ArrangeRoom)/.test(room),
);
check(
  "no shared-store or persistence imports",
  !/from\s+["'].*(store|persist|localStorage|sessionStorage)/.test(room) &&
    !/localStorage|sessionStorage/.test(room + data + strip),
);

// --- 3. Selection is not mouse-only.
check(
  "channel strips are real <button> elements",
  /<button/.test(strip) && /type="button"/.test(strip),
);
check(
  "selected strip exposes aria-pressed",
  /aria-pressed=\{selected/.test(strip),
);
check(
  "selected strip is marked for visual identification",
  /class:is-selected=\{selected\}/.test(strip) && /is-selected/.test(strip),
);
check(
  "detail panel identification is driven by the selection",
  /data-mixer-selected-name/.test(room) && /selected\.name/.test(room),
);

// --- 4. Count stays a parameter.
check(
  "track channels are built by a factory, not a markup literal",
  /export function createMixerTracks\(/.test(data) &&
    /createMixerTracks\(PLACEHOLDER_TRACK_COUNT\)/.test(data),
);
check(
  "placeholder count declared as PLACEHOLDER_TRACK_COUNT",
  /export const PLACEHOLDER_TRACK_COUNT = \d+;/.test(data),
);
check(
  "MixerRoom does not hard-code a channel count",
  !/length:\s*\d+/.test(room) && !/from\(\{\s*length/.test(room),
);

// --- 5. Chain-type branching is deferred to Task 2.9.
check(
  "detail panel does not branch by channel type yet (deferred to Task 2.9)",
  !/#if\s+selected\.kind/.test(room) &&
    !/#if\s+selected\?\.kind/.test(room),
);

// --- 6. Room is bounded and scrolls internally.
check(
  "Mixer shell is pinned to one viewport",
  /\[data-active-room="mixer"\]\.app-shell\s*\{[^}]*height:\s*100dvh/.test(appCss),
);
check(
  "Mixer room fills its canvas rather than growing the page",
  /\[data-active-room="mixer"\]\s+\.room\s*\{[^}]*height:\s*100%/.test(appCss),
);
check(
  "channel column scrolls internally",
  /\.mixer-channels__list\s*\{[^}]*overflow-y:\s*auto/.test(room),
);

// --- 7. No Phase 1 styling or DSP crept in.
check(
  "no audio/DSP imports in the Mixer",
  !/AudioContext|WebAudio|createGain|BiquadFilter|DynamicsCompressorNode/.test(room + strip + data),
);

// --- Report.
const total = passes.length + failures.length;
console.log(`\nMixer structural contract check — ${passes.length}/${total} passed\n`);
for (const p of passes) console.log(`  PASS  ${p}`);
for (const f of failures) console.log(`  FAIL  ${f}`);

if (failures.length > 0) {
  console.log(
    `\n${failures.length} failure(s). Layout and selection behaviour are NOT covered ` +
      `by this check — verify in a real browser at 1920, 1024 and 768 widths.\n`,
  );
  process.exit(1);
}

console.log(
  `\nStructural contract intact. This check does not exercise selection or measure ` +
    `layout; confirm both in a real browser.\n`,
);
