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
 *   7. Task 10.2 (owner, D10.2.1): the full transport deck is the shell's now,
 *      rendered once under Console, Mixer and Arrange; the mini strip serves
 *      only the routes the deck does not (Home, Settings, the private
 *      playground) — displayed there, hidden in the three rooms, never
 *      unmounted.
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

/* --- 1b. Task 10.2 (owner, D10.2.1): the full deck is the shell's too. ------
   One ConsoleTransport, live, outside the room switch, below the room row:
   Console, Mixer and Arrange all display it, so the three tabs share one deck
   — the same keys, windows and state, never remounted by a tab switch. The
   mini strip keeps the routes the deck does not serve. */
check(
  "the shell renders the shared deck exactly once, live, outside the room switch, with MIX only on Console (Task 10.2)",
  (app.match(/<ConsoleTransport live showMix=\{room === "console"\} \/>/g) ?? []).length === 1 &&
    app.indexOf("<ConsoleTransport") > app.indexOf("{/if}"),
);
check(
  "the shell's grid is three rows — the bar, the room, the deck — with the room row free to scroll its own content (Task 10.2)",
  /\.app-shell\s*{[^}]*grid-template-rows:\s*auto\s+minmax\(0,\s*1fr\)\s+auto/s.test(appCss),
);
check(
  "the deck row is hidden by default and displayed only for Console, Mixer and Arrange",
  /\.app-deck\s*{[^}]*display:\s*none/s.test(appCss) &&
    /\.app-shell\[data-active-room="console"\] \.app-deck,\s*\.app-shell\[data-active-room="mixer"\] \.app-deck,\s*\.app-shell\[data-active-room="arrange"\] \.app-deck\s*{\s*display:\s*block;\s*}/s.test(appCss),
);
check(
  "the mini strip is not displayed in the three deck rooms, and each gives the reservation back",
  ["console", "arrange", "mixer"].every(
    (room) =>
      new RegExp(`\\.app-shell\\[data-active-room="${room}"\\]\\s*{[^}]*padding-bottom:\\s*0`, "s").test(appCss) &&
      new RegExp(`\\.app-shell\\[data-active-room="${room}"\\] \.mini-transport\\s*{[^}]*display:\\s*none`, "s").test(appCss),
  ),
);
check(
  "the deck row carries the Console's 0.8x density (D9.6.1) so the deck's face is unchanged at the shell",
  /\.app-deck\s*{[^}]*--al-space-3xs:\s*1\.6px/s.test(appCss) && /\.app-deck\s*{[^}]*--al-text-size-base:\s*0\.7rem/s.test(appCss),
);

// --- 2. No room implements its own transport. ------------------------------
for (const [name, src] of [
  ["ConsoleRoom", consoleRoom],
  ["ArrangeRoom", arrangeRoom],
  ["MixerRoom", mixerRoom],
]) {
  check(`${name} does not render a transport of its own`, !/<MiniTransport/.test(src) && !/data-mini-transport/.test(src) && !/ConsoleTransport|data-console-transport/.test(src));
  check(`${name} has no transport control buttons`, !/data-transport-control/.test(src));
}
check(
  "no duplicate transport UI remains in the three rooms (Task 10.2): neither the deck nor the mini strip appears in a room file",
  ![consoleRoom, arrangeRoom, mixerRoom].some((src) => /ConsoleTransport|MiniTransport|data-mini-transport|data-console-transport|data-app-deck/.test(src)),
);

// --- 3. Positioned fixed, height reserved by the shell. --------------------
check(
  "transport is fixed to the viewport bottom",
  /\.mini-transport\s*{[^}]*position:\s*fixed/s.test(transport),
);
check(
  "transport is pinned to the bottom edge",
  /\.mini-transport\s*{[^}]*bottom:\s*0/s.test(transport),
);
/*
  Task 9.3 (owner): the strip became a ChromeBand inside a fixed footer, so the
  height is no longer set on `.mini-transport` itself. The invariant that matters
  is unchanged and is what this now asserts: the app reserves exactly one shared
  token's worth of space for the strip, and the strip's own content does not
  re-measure it.
*/
check(
  "the app still reserves exactly the shared transport height for the strip",
  /\.app-shell\s*{[^}]*padding-bottom:\s*var\(--mini-transport-height\)/s.test(appCss) &&
    /--mini-transport-height:\s*[0-9.]+rem/.test(appCss),
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
  "Console has exactly its two zones — bridge, then bank (Task 10.2, D10.2.1: the deck left the room for the shell)",
  (consoleRoom.match(/data-console-zone="([a-z-]+)"/g) ?? []).join(",") ===
    'data-console-zone="meter-bridge",data-console-zone="channel-bank"',
);
check(
  "all three rooms are bounded to the viewport (no page-level scroll)",
  ["console", "arrange", "mixer"].every((room) =>
    new RegExp(`\\.app-shell\\[data-active-room="${room}"\\]\\s*{[^}]*overflow:\\s*hidden`, "s").test(appCss),
  ),
);

// --- 5. Task 8.1 live shared transport. ------------------------------------
check(
  "transport controls are real buttons (one tactile key per control)",
  /<ToolbarKey[\s\S]*?hook=\{`transport-\$\{control\.toLowerCase\(\)\}`\}/.test(transport) &&
    /#each CONTROLS as control/.test(transport) &&
    ["Previous", "Play", "Stop", "Next"].every((c) => transport.includes(`"${c}"`)) &&
    // and the key really is a platform button underneath, not a div
    /<button[\s\S]*?type="button"[\s\S]*?data-part="cap"/.test(read("src/components/hardware/ToolbarKey.svelte")),
);
check("Play, Stop, Previous and Next are present", ["Previous", "Play", "Stop", "Next"].every((c) => transport.includes(`"${c}"`)));
check("the controls drive the shared transport facade", /import \{ formatTransportPosition, transport, transportStatusText \} from "\.\.\/lib\/playback\/store\.svelte"/.test(transport) && /onpress=\{\(\) => onControl\(control\)\}/.test(transport));
check("Play toggles play/pause, Stop returns to start, Previous/Next locate", /transport\.togglePlay\(\)/.test(transport) && /transport\.stop\(\)/.test(transport) && /transport\.seek\(transport\.startFrame\)/.test(transport) && /transport\.seek\(transport\.durationFrames\)/.test(transport));
check("a live position/time readout exists", /data-transport-position/.test(transport) && /\{position\}/.test(transport));
check("a live status readout exists", /data-transport-status/.test(transport) && /\{status\}/.test(transport));
/*
  Task 9.2 (owner): the explanatory paragraph ("Shared transport. Play/pause,
  stop to start, and locate across Console, Arrange and Mixer.") was ordered
  removed from the bar, so the two checks that pinned it are retired and
  replaced by the stronger invariant they existed to protect: the bar must
  still be *named* for assistive technology without that visible sentence, and
  the controls must not describe themselves with a removed id.
*/
check(
  "the strip is still named for assistive technology without the visible sentence",
  /aria-label="Mini transport"/.test(transport) && !/Shared transport\.\s*Play/.test(transport),
);
check(
  "no control points at the removed note",
  !/mini-transport-note/.test(transport),
);
check(
  "the component itself creates no audio context, timer or clock",
  !/AudioContext|AudioBuffer|requestAnimationFrame|setInterval|setTimeout|currentTime|\.play\(|\.pause\(/.test(transport),
);
check(
  "the component reads reactive transport state, not persistence",
  /\$derived/.test(transport) && !/localStorage|sessionStorage|writable\(/.test(transport),
);
/*
  Task 9.2 (owner) asked for File > Import stems… with Ctrl/Cmd+I and a Save
  action, which the shell must wire, so the original blanket ban ("no keyboard
  handling anywhere near the transport") cannot hold. The invariant it protected
  — the transport component itself is a dumb view, never a key handler — is kept
  and tightened: the ban now covers MiniTransport exactly as before, and the
  shell's handler is required to be there for the accelerators the menus promise.
*/
check(
  "the transport component still adds no keyboard handling of its own",
  !/addEventListener\("keydown"|onkeydown/.test(transport),
);
check(
  "the shell owns the accelerators the menus promise (Ctrl/Cmd+I, Ctrl/Cmd+S)",
  /addEventListener\("keydown", onShortcut\)/.test(app) && /key === "i"/.test(app) && /key === "s"/.test(app),
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
    // Task 9.3: each position is a ToolbarKey, which renders a real <button>.
    /<ToolbarKey[\s\S]*?hook=\{`source-\$\{source\}`\}/.test(sourceSelector) &&
    /active=\{active === source\}/.test(sourceSelector),
);
check(
  "selecting drives the shared facade's setSource and nothing else",
  /transport\.setSource\(source\)/.test(sourceSelector) &&
    !/transport\.(play|pause|stop|togglePlay|seek|render)\(/.test(sourceSelector),
);
check(
  "the active mode is identifiable three ways: the key's active state, aria-pressed and the status readout",
  /active=\{active === source\}/.test(sourceSelector) &&
    /aria-pressed=\{active \? "true"/.test(read("src/components/hardware/ToolbarKey.svelte")) &&
    /const active = \$derived\(transport\.source\)/.test(sourceSelector) &&
    /source\.toUpperCase\(\)/.test(read("src/lib/playback/store.svelte.ts")),
);
/*
  Task 9.3: the printed note ("Listening source: raw stems, lightweight preview,
  or the full rendered mix") went with the other decorative text in 9.2, so the
  old aria-describedby cannot hold. The requirement it served — each position is
  named for assistive technology AND explains what it does — is kept, moved onto
  the key's own accessible name, which carries the hint.
*/
check(
  "each position is named for assistive technology and explains itself",
  ["raw", "preview", "render"].every((mode) => new RegExp(`\\b${mode}:`).test(sourceSelector)) &&
    /name=\{`\$\{SOURCE_NAMES\[source\]\} — \$\{SOURCE_HINTS\[source\]\}`\}/.test(sourceSelector) &&
    /title=\{`Listen to \$\{SOURCE_HINTS\[source\]\}`\}/.test(sourceSelector),
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
/*
  Task 9.2 (owner): the ALLOY wordmark was removed from the top-left, and Home
  became the fourth tab (owner's answer) — the wordmark was the only route home.
  The pin inverts: there must be no wordmark rule left behind, and the
  navigation must actually offer Home.
*/
check(
  "the wordmark is gone, and nothing is left orphaned in the stylesheet",
  !/\.app-brand\s*\{/.test(appCss),
);
check(
  "Home is reachable from the navigation (the wordmark is no longer the way home)",
  /data-app-link="home"/.test(read("src/components/RoomNav.svelte")) && /HOME_HREF/.test(read("src/components/RoomNav.svelte")),
);
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
