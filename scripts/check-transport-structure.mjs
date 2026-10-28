#!/usr/bin/env node
/**
 * Mini transport structural contract check — Task 0.6.
 *
 * Dependency-free guard (Node built-ins only). It does NOT test geometry: the
 * strip's position, height and non-overlap were verified in a real browser at
 * 1920x1080, 1024x768 and 768x900. What it tests is the source-level contract:
 *
 *   1. The transport is rendered once, by the shared shell, outside the room
 *      switch — so switching rooms cannot remount or reposition it.
 *   2. No room renders its own transport any more (no duplicated
 *      implementations).
 *   3. The strip is fixed to the viewport bottom and the shell reserves exactly
 *      its height, so it cannot scroll away and cannot cover room content.
 *   4. The Console's old scroll-revealed transport placeholder is gone, and no
 *      room still depends on page scrolling to reveal anything.
 *   5. Placeholder honesty: the controls are inert, labelled as placeholders,
 *      and no audio/playback API or shared state is referenced.
 *   6. The nav order and tab layout from Task 0.5 are unchanged.
 *
 * Run: npm run check:transport
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(resolve(root, rel), "utf8");

const failures = [];
const passes = [];

function check(name, condition, detail = "") {
  if (condition) passes.push(name);
  else failures.push(detail ? `${name} — ${detail}` : name);
}

const app = read("src/App.svelte");
const transport = read("src/components/MiniTransport.svelte");
const appCss = read("src/app.css");
const consoleRoom = read("src/rooms/ConsoleRoom.svelte");
const arrangeRoom = read("src/rooms/ArrangeRoom.svelte");
const mixerRoom = read("src/rooms/MixerRoom.svelte");

// --- 1. One transport, rendered by the shell, outside the room switch. -----
check("shell imports the transport", /import MiniTransport from "\.\/components\/MiniTransport\.svelte"/.test(app));
check("shell renders the transport exactly once", (app.match(/<MiniTransport \/>/g) ?? []).length === 1);
check(
  "transport is rendered outside the room {#if} switch",
  app.indexOf("<MiniTransport />") > app.indexOf("{/if}"),
);

// --- 2. No room implements its own transport. ------------------------------
for (const [name, src] of [
  ["ConsoleRoom", consoleRoom],
  ["ArrangeRoom", arrangeRoom],
  ["MixerRoom", mixerRoom],
]) {
  check(`${name} does not render a transport of its own`, !/<MiniTransport/.test(src) && !/data-mini-transport/.test(src));
  check(`${name} has no transport control buttons`, !/data-transport-control/.test(src));
}

// --- 3. Positioned fixed, height reserved by the shell. --------------------
check(
  "transport is fixed to the viewport bottom",
  /\.mini-transport\s*{[^}]*position:\s*fixed/s.test(transport),
);
check(
  "transport is pinned to the bottom edge",
  /\.mini-transport\s*{[^}]*bottom:\s*0/s.test(transport),
);
check(
  "transport height comes from the shared token",
  /\.mini-transport\s*{[^}]*height:\s*var\(--mini-transport-height\)/s.test(transport),
);
check(
  "shared --mini-transport-height token is declared",
  /--mini-transport-height:\s*2\.75rem;/.test(appCss),
);
check(
  "shell reserves exactly the transport height",
  /\.app-shell\s*{[^}]*padding-bottom:\s*var\(--mini-transport-height\)/s.test(appCss),
);

// --- 4. No page-scroll-revealed regions remain. ----------------------------
check(
  "Console's scroll-reveal transport placeholder is gone",
  !/transportVisible|console-transport/.test(consoleRoom),
);
check(
  "no room listens to window scroll to reveal content",
  !/transportVisible|addEventListener\("scroll"/.test(consoleRoom + arrangeRoom + mixerRoom),
);
check(
  "Console still has exactly its two zones",
  (consoleRoom.match(/data-console-zone="([a-z-]+)"/g) ?? []).join(",") ===
    'data-console-zone="meter-bridge",data-console-zone="channel-bank"',
);
check(
  "all three rooms are bounded to the viewport (no page-level scroll)",
  ["console", "arrange", "mixer"].every((room) =>
    new RegExp(`\\.app-shell\\[data-active-room="${room}"\\]\\s*{[^}]*overflow:\\s*hidden`, "s").test(appCss),
  ),
);

// --- 5. Placeholder honesty. ----------------------------------------------
check(
  "transport controls are real buttons (one template button per control)",
  /<button[\s\S]*?data-transport-control/.test(transport) &&
    /#each CONTROLS as control/.test(transport) &&
    ["Previous", "Play", "Stop", "Next"].every((c) => transport.includes(`"${c}"`)),
);
check("Play, Stop, Previous and Next are present", ["Previous", "Play", "Stop", "Next"].every((c) => transport.includes(`"${c}"`)));
check("a position/time readout placeholder exists", /data-transport-position/.test(transport));
check("a status placeholder exists", /data-transport-status/.test(transport));
check("the strip says it is a placeholder in visible text", /Placeholder controls/.test(transport));
check(
  "controls are described by the placeholder note",
  /aria-describedby="mini-transport-note"/.test(transport),
);
check(
  "no audio, playback, or clock API is referenced",
  !/AudioContext|AudioBuffer|requestAnimationFrame|setInterval|currentTime|\.play\(|\.pause\(/.test(transport),
);
check(
  "no shared project state, store, or persistence",
  !/\$state|\$derived|localStorage|sessionStorage|\$store|writable\(/.test(transport),
);
check(
  "no keyboard-shortcut handling was added",
  !/addEventListener\("keydown"|onkeydown/.test(transport + app),
);
check(
  "no dependencies were added for the transport",
  !/from "(?!\.)/.test(transport),
);

// --- 6. Task 0.5 results preserved. ---------------------------------------
check(
  "nav order is still Arrange, Console, Mixer",
  /ROOMS = \[\s*{\s*id: "arrange"[\s\S]*?id: "console"[\s\S]*?id: "mixer"/.test(read("src/lib/rooms.ts")),
);
check("tabs are still right-aligned", /\.room-nav\s*{[^}]*justify-self:\s*end/s.test(appCss));
check("wordmark is still left-aligned", /\.app-brand\s*{[^}]*justify-self:\s*start/s.test(appCss));
check("tab buttons keep their reduced padding", /\.room-nav__link\s*{[^}]*padding:\s*0\.1875rem/s.test(appCss));

// --- Report. ---------------------------------------------------------------
for (const name of passes) console.log(`  PASS  ${name}`);

if (failures.length > 0) {
  console.error("");
  for (const failure of failures) console.error(`  FAIL  ${failure}`);
  console.error("");
  console.error(`Mini transport structural contract check — ${passes.length}/${passes.length + failures.length} passed`);
  process.exit(1);
}

console.log("");
console.log(`Mini transport structural contract check — ${passes.length}/${passes.length} passed`);
