#!/usr/bin/env node
/**
 * Mixer + shared-detail structural contract check.
 *
 * Dependency-free guard (Node built-ins only). It does NOT test geometry:
 * pixel layout and selection behaviour were verified in a real browser at
 * 1920x1080, 1024x768 and 768x900. What it tests is the source-level contract:
 *
 *   1. The Mixer is details-on-top + channel bank at the bottom. The old
 *      vertical stacked channel column must not come back.
 *   2. The channel bank and the detail panel are shared components, used by
 *      both Console and Mixer, so the two tabs cannot drift apart.
 *   3. Selection is local UI state in each room — no store, no cross-room sync.
 *   4. Strips are real buttons exposing aria-pressed.
 *   5. The channel count stays a parameter, not a literal in markup.
 *   6. The detail panel does NOT branch by channel type (Task 2.9).
 *   7. The Mixer is bounded so it scrolls internally instead of pushing the page.
 *
 * Run: npm run check:mixer
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
  if (condition) {
    passes.push(name);
  } else {
    failures.push(detail ? `${name} — ${detail}` : name);
  }
}

const mixer = read("src/rooms/MixerRoom.svelte");
const consoleRoom = read("src/rooms/ConsoleRoom.svelte");
const detail = read("src/components/ChannelDetailPanel.svelte");
const bank = read("src/components/ChannelBank.svelte");
const strip = read("src/components/ChannelStrip.svelte");
const channels = read("src/lib/channels.ts");
const appCss = read("src/app.css");

// --- 1. Mixer structure: detail on top, bank below, no vertical column.
check(
  "Mixer renders the shared detail panel",
  /<ChannelDetailPanel\b/.test(mixer),
);
check(
  "Mixer renders the shared channel bank",
  /<ChannelBank\b/.test(mixer),
);
check(
  'Mixer exposes a "detail-panel" region',
  mixer.includes('data-mixer-region="detail-panel"'),
);
check(
  'Mixer exposes a "channel-bank" region',
  mixer.includes('data-mixer-region="channel-bank"'),
);
check(
  "the vertical stacked channel column has not been reintroduced",
  !exists("src/components/MixerChannelStrip.svelte") &&
    !exists("src/lib/mixer.ts") &&
    !/data-mixer-region="channel-column"/.test(mixer),
);

// --- 2. Shared components, used by both rooms.
check(
  "Console renders the same detail panel",
  /<ChannelDetailPanel\b/.test(consoleRoom),
);
check(
  "Console renders the same channel bank",
  /<ChannelBank\b/.test(consoleRoom),
);
check(
  "Console keeps its meter bridge, channel bank and transport zones",
  ["meter-bridge", "channel-bank", "transport"].every((z) =>
    consoleRoom.includes(`data-console-zone="${z}"`),
  ),
);
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
  check(
    `shared detail region "${region}" is present`,
    detail.includes(`data-detail-region="${region}"`),
  );
}

// --- 3. Selection is local per room, never shared.
for (const [name, src] of [
  ["MixerRoom", mixer],
  ["ConsoleRoom", consoleRoom],
]) {
  check(
    `${name} holds selection in local $state`,
    /let\s+selectedId\s*=\s*\$state/.test(src),
  );
  check(
    `${name} imports no store or persistence`,
    !/localStorage|sessionStorage|\$store|writable\(/.test(src),
  );
}
check(
  "rooms do not import each other's selection",
  !/rooms\/(ConsoleRoom|ArrangeRoom|MixerRoom)/.test(mixer + consoleRoom),
);

// --- 4. Strips are accessible buttons.
check(
  "channel strips are real <button> elements",
  /<button/.test(strip) && /type="button"/.test(strip),
);
check(
  "selected strip exposes aria-pressed",
  /aria-pressed=\{selected/.test(strip),
);
check(
  "channel bank forwards the selection id into each strip",
  /selected=\{channel\.id === selectedId\}/.test(bank),
);

// --- 5. Count stays a parameter.
check(
  "track channels are built by a factory, not a markup literal",
  /export function createTrackChannels\(/.test(channels) &&
    /createTrackChannels\(PLACEHOLDER_TRACK_COUNT\)/.test(channels),
);
check(
  "placeholder count declared as PLACEHOLDER_TRACK_COUNT",
  /export const PLACEHOLDER_TRACK_COUNT = \d+;/.test(channels),
);
check(
  "rooms and bank do not hard-code a track count",
  !/length:\s*\d+/.test(mixer + consoleRoom + bank),
);
check(
  "pinned Return buses and bus master are kept from plan 8a",
  /return-reverb/.test(channels) &&
    /return-delay/.test(channels) &&
    /bus-master/.test(channels),
);

// --- 6. Chain-type branching stays deferred to Task 2.9.
check(
  "detail panel does not branch by channel type (deferred to Task 2.9)",
  !/channel\.kind\s*===/.test(detail) && !/#if\s+channel\.kind/.test(detail),
);

// --- 7. Mixer is bounded and scrolls internally.
check(
  "Mixer shell is pinned to one viewport",
  /\[data-active-room="mixer"\]\.app-shell\s*\{[^}]*height:\s*100dvh/.test(appCss),
);
check(
  "Mixer room fills its canvas rather than growing the page",
  /\[data-active-room="mixer"\]\s+\.room\s*\{[^}]*height:\s*100%/.test(appCss),
);
check(
  "Mixer detail area scrolls internally",
  /\.mixer-room__detail\s*\{[^}]*overflow-y:\s*auto/.test(mixer),
);

// --- 8. No audio/DSP crept in.
check(
  "no audio/DSP APIs referenced",
  !/AudioContext|WebAudio|createGain|BiquadFilter|DynamicsCompressorNode/.test(
    mixer + consoleRoom + detail + bank + strip + channels,
  ),
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
