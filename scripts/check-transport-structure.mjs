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
 *   5. Task 8.1: the controls drive the one shared transport facade; the
 *      component itself still creates no audio context, timer or persistence.
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
const sourceSelector = read("src/components/MiniTransportSource.svelte");
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
  // Task 0.3's placeholder was a `console-transport` zone revealed by window
  // scroll; Task 2.3's real deck (`console-zone--transport`, always present)
  // is not it.
  !/transportVisible|data-transport-visible|is-visible|class="console-zone console-transport"/.test(consoleRoom),
);
check(
  "no room listens to window scroll to reveal content",
  !/transportVisible|addEventListener\("scroll"/.test(consoleRoom + arrangeRoom + mixerRoom),
);
check(
  "Console has exactly its three zones, bridge over transport over bank (Task 2.3)",
  (consoleRoom.match(/data-console-zone="([a-z-]+)"/g) ?? []).join(",") ===
    'data-console-zone="meter-bridge",data-console-zone="transport",data-console-zone="channel-bank"',
);
check(
  "all three rooms are bounded to the viewport (no page-level scroll)",
  ["console", "arrange", "mixer"].every((room) =>
    new RegExp(`\\.app-shell\\[data-active-room="${room}"\\]\\s*{[^}]*overflow:\\s*hidden`, "s").test(appCss),
  ),
);

// --- 5. Task 8.1 live shared transport. ------------------------------------
check(
  "transport controls are real buttons (one template button per control)",
  /<button[\s\S]*?data-transport-control/.test(transport) &&
    /#each CONTROLS as control/.test(transport) &&
    ["Previous", "Play", "Stop", "Next"].every((c) => transport.includes(`"${c}"`)),
);
check("Play, Stop, Previous and Next are present", ["Previous", "Play", "Stop", "Next"].every((c) => transport.includes(`"${c}"`)));
check("the controls drive the shared transport facade", /import \{ formatTransportPosition, transport, transportStatusText \} from "\.\.\/lib\/playback\/store\.svelte"/.test(transport) && /onclick=\{\(\) => onControl\(control\)\}/.test(transport));
check("Play toggles play/pause, Stop returns to start, Previous/Next locate", /transport\.togglePlay\(\)/.test(transport) && /transport\.stop\(\)/.test(transport) && /transport\.seek\(transport\.startFrame\)/.test(transport) && /transport\.seek\(transport\.durationFrames\)/.test(transport));
check("a live position/time readout exists", /data-transport-position/.test(transport) && /\{position\}/.test(transport));
check("a live status readout exists", /data-transport-status/.test(transport) && /\{status\}/.test(transport));
check("the strip says it is the shared transport in visible text", /Shared transport/.test(transport));
check(
  "controls are described by the transport note",
  /aria-describedby="mini-transport-note"/.test(transport),
);
check(
  "the component itself creates no audio context, timer or clock",
  !/AudioContext|AudioBuffer|requestAnimationFrame|setInterval|setTimeout|currentTime|\.play\(|\.pause\(/.test(transport),
);
check(
  "the component reads reactive transport state, not persistence",
  /\$derived/.test(transport) && !/localStorage|sessionStorage|writable\(/.test(transport),
);
check(
  "no keyboard-shortcut handling was added",
  !/addEventListener\("keydown"|onkeydown/.test(transport + app),
);
check(
  "no dependencies were added for the transport",
  !/from "(?!\.)/.test(transport),
);

// --- 7. Task 9.1.1: the listening-source selector (owner decision D9.1.2 option a). ---
// One small visible three-position control for plan §6's modes. Added BESIDE the keys:
// the four Phase 0 keys and their functions are untouched, so the checks above still hold
// unchanged, and nothing was repurposed to carry the mode.
check(
  "the strip mounts one source selector, in its own component",
  (transport.match(/<MiniTransportSource \/>/g) ?? []).length === 1 &&
    /import MiniTransportSource from "\.\/MiniTransportSource\.svelte"/.test(transport),
);
check(
  "the selector offers exactly the plan's three modes, in order, as real buttons",
  /const SOURCES: readonly ListeningSource\[\] = \["raw", "preview", "render"\]/.test(sourceSelector) &&
    /#each SOURCES as source \(source\)/.test(sourceSelector) &&
    /<button/.test(sourceSelector) &&
    /data-transport-source={source}/.test(sourceSelector),
);
check(
  "selecting drives the shared facade's setSource and nothing else",
  /transport\.setSource\(source\)/.test(sourceSelector) &&
    !/transport\.(play|pause|stop|togglePlay|seek|render)\(/.test(sourceSelector),
);
check(
  "the active mode is identifiable three ways: engaged styling, aria-pressed and the status readout",
  /class:is-active={active === source}/.test(sourceSelector) &&
    /aria-pressed={active === source}/.test(sourceSelector) &&
    /const active = \$derived\(transport\.source\)/.test(sourceSelector) &&
    /source\.toUpperCase\(\)/.test(read("src/lib/playback/store.svelte.ts")),
);
check(
  "each position is named for assistive technology and explains itself",
  ["raw", "preview", "render"].every((mode) => new RegExp(`\\b${mode}:`).test(sourceSelector)) &&
    /aria-label=\{`\$\{SOURCE_NAMES\[source\]\} — \$\{SOURCE_HINTS\[source\]\}`\}/.test(sourceSelector) &&
    /aria-describedby="mini-transport-source-note"/.test(sourceSelector),
);
check(
  "the selector adds no height: the strip's shared token is still the only height and nothing re-measures it",
  !/height:\s*var\(--mini-transport-height\)/.test(sourceSelector) &&
    !/AudioContext|AudioBuffer|requestAnimationFrame|setInterval|setTimeout|currentTime/.test(sourceSelector) &&
    !/localStorage|sessionStorage|writable\(/.test(sourceSelector) &&
    !/from "(?!\.)/.test(sourceSelector),
);
check(
  "the selector brings no keyboard-shortcut handling and no new dependency",
  !/addEventListener\("keydown"|onkeydown/.test(sourceSelector),
);
check(
  "the four approved keys keep their exact functions: PLAY toggles, STOP stops, PREVIOUS/NEXT locate — the selector did not take one over",
  /transport\.togglePlay\(\)/.test(transport) &&
    /transport\.stop\(\)/.test(transport) &&
    /transport\.seek\(transport\.startFrame\)/.test(transport) &&
    /transport\.seek\(transport\.durationFrames\)/.test(transport) &&
    !/setSource/.test(transport),
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
