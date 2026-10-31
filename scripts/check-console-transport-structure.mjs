#!/usr/bin/env node
/**
 * Console transport deck structural contract check — Task 2.3.
 *
 * Dependency-free guard (Node built-ins only). It does NOT test geometry: the
 * deck's height, its single row at 1920 / 1280 / 1024 and its two rows at
 * 768, the 40 px key caps, the window and MIX sizes, the key behaviour and
 * the reduced-motion stillness were measured in a real browser (see
 * task-reports/2.3-report.md). What it tests is the source-level contract:
 *
 *   1. The Console has three zones — meter bridge, transport, channel bank —
 *      in that order, the transport deck a full-width housing of its own
 *      between the other two (owner, D2.3.1); the room prints the READY
 *      default (D2.3.4) and passes no state.
 *   2. The deck is COMPOSED of the approved Phase 1 components: four
 *      TactileSwitches as the transport keys PREVIOUS · PLAY · STOP · NEXT
 *      (owner's set, nothing else), EngravedLabel for every legend, the
 *      Task 2.3 LampDisplay for the two windows and the Task 2.3 MixButton;
 *      the deck draws no control of its own.
 *   3. The keys keep Phase 0's conventions: PLAY and STOP are one exclusive
 *      latching pair, PREVIOUS and NEXT are momentary; the caps are the
 *      approved switch at 40 px, never shrunk.
 *   4. The time display prints H:MM:SS with no leading hour zero plus
 *      bar · beat (owner, D2.3.3); the status display prints the state word,
 *      the details — listening source as TEXT (owner, D2.3.2), hardware
 *      profile, estimate; stage / progress / time left while processing;
 *      warnings in the red family — all from one fixture file.
 *   5. MIX is its own illuminated button, larger than a key, not a switch,
 *      with its three fixture states (ready / processing / complete), press
 *      feedback, a pulse only while processing and only when motion is
 *      allowed, and no handler: it starts nothing.
 *   6. Materials are tokens; the warm lamp family only (plan §4: no cold
 *      VFD blue / green); layered gradients, no flat fills; no hex literal.
 *   7. Fixture honesty: nothing references audio, clocks, timers, randomness,
 *      storage, the network or shared state; the DOM is marked
 *      `data-simulated`; the deck says so in visible text.
 *   8. The playground shows every state through one fixture component.
 *   9. Scope: no screw heads (D2.1.9); every approved file this task touches
 *      nothing of is byte-identical; no dependency added or changed; the
 *      other rooms and the shell do not know the deck exists.
 *
 * Run: npm run check:console-transport
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(resolve(root, rel), "utf8");
const exists = (rel) => existsSync(resolve(root, rel));
const sha256 = (text) => createHash("sha256").update(text.replace(/\r\n/g, "\n")).digest("hex");

const failures = [];
const passes = [];

function check(name, condition, detail = "") {
  if (condition) passes.push(name);
  else failures.push(detail ? `${name} — ${detail}` : name);
}

const count = (text, re) => (text.match(re) ?? []).length;
const templateOf = (svelte) => svelte.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style>[\s\S]*<\/style>/, "");
const styleOf = (svelte) => svelte.match(/<style>([\s\S]*)<\/style>/)?.[1] ?? "";
const rule = (css, selector) => {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) return "";
  return css.slice(start, css.indexOf("}", start));
};

const dir = "src/components/console-transport";
const deck = read(`${dir}/ConsoleTransport.svelte`);
const mix = read(`${dir}/MixButton.svelte`);
const display = read(`${dir}/LampDisplay.svelte`);
const fixtures = read(`${dir}/transport-fixtures.ts`);
const consoleRoom = read("src/rooms/ConsoleRoom.svelte");
const devPage = read("src/dev/DevComponentsPage.svelte");
const devFixture = read("src/dev/TransportFixture.svelte");
const pkg = JSON.parse(read("package.json"));

const deckTemplate = templateOf(deck);
const deckStyle = styleOf(deck);
const mixTemplate = templateOf(mix);
const mixStyle = styleOf(mix);
const displayTemplate = templateOf(display);
const displayStyle = styleOf(display);
const allTransportSource = [deck, mix, display, fixtures].join("\n");

// --- 1. Three zones; the deck between bridge and bank; READY by default. ------
check(
  "ConsoleRoom has exactly three zones, in order: meter-bridge, transport, channel-bank (D2.3.1)",
  (consoleRoom.match(/data-console-zone="([a-z-]+)"/g) ?? []).join(",") ===
    'data-console-zone="meter-bridge",data-console-zone="transport",data-console-zone="channel-bank"',
);
check("the transport zone is a section labelled by the deck's own engraved heading", /<section[^>]*class="console-zone console-zone--transport"[^>]*aria-labelledby="console-transport-title"/.test(consoleRoom) && /headingId = "console-transport-title"/.test(deck));
check("ConsoleRoom imports the deck from its own folder", /import ConsoleTransport from "\.\.\/components\/console-transport\/ConsoleTransport\.svelte"/.test(consoleRoom));
check("ConsoleRoom renders the deck once, with no fixture and no state: the READY default (D2.3.4)", count(consoleRoom, /<ConsoleTransport\b/g) === 1 && /<ConsoleTransport \/>/.test(consoleRoom));
check("the bridge and the bank are still rendered, once each, around it", count(consoleRoom, /<ConsoleMeterBridge\b/g) === 1 && count(consoleRoom, /<ChannelBank\b/g) === 1 && consoleRoom.indexOf("<ConsoleMeterBridge") < consoleRoom.indexOf("<ConsoleTransport") && consoleRoom.indexOf("<ConsoleTransport") < consoleRoom.indexOf("<ChannelBank"));
check("the room's grid gives the deck a content-sized row between the bridge and the bank (never compressed)", /grid-template-rows:\s*max-content\s+max-content\s+minmax\(max-content, 1fr\)/.test(consoleRoom));
check("the transport zone, like the bridge and bank, wears no Phase 0 frame (the deck is its own housing)", /\.console-zone--meter,\s*\.console-zone--transport,\s*\.console-zone--channels\s*{/.test(consoleRoom) || /\.console-zone--transport[^{]*{[^}]*border:\s*0/.test(consoleRoom));
check("the deck is a full-width housing: the bridge recipe (cheeks + deck), width 100%", /\.transport\s*{[^}]*grid-template-columns:\s*var\(--b-cheek\) minmax\(0, 1fr\) var\(--b-cheek\)/s.test(deckStyle) && /\.transport\s*{[^}]*width:\s*100%/s.test(deckStyle) && count(deckTemplate, /transport__cheek--(left|right)/g) === 2);
check("the deck does not change shape by viewport: no media or container query in it (the body wraps instead)", !/@media|@container/.test(deckStyle) && /\.transport__body\s*{[^}]*flex-wrap:\s*wrap/s.test(deckStyle));

// --- 2. Composed of the approved components. ---------------------------------
check("the deck imports TactileSwitch and EngravedLabel from the approved hardware set", /import TactileSwitch from "\.\.\/hardware\/TactileSwitch\.svelte"/.test(deck) && /import EngravedLabel from "\.\.\/hardware\/EngravedLabel\.svelte"/.test(deck));
check("the deck imports its own LampDisplay and MixButton", /import LampDisplay from "\.\/LampDisplay\.svelte"/.test(deck) && /import MixButton from "\.\/MixButton\.svelte"/.test(deck));
check("exactly four transport keys, each an approved cap-labelled TactileSwitch", count(deckTemplate, /<TactileSwitch\b/g) === 4 && count(deckTemplate, /<TactileSwitch variant="cap"/g) === 4);
check("the keys are PREVIOUS · PLAY · STOP · NEXT, in that order, and nothing else (owner)", (deckTemplate.match(/data-transport-key="([a-z]+)"/g) ?? []).join(",") === 'data-transport-key="previous",data-transport-key="play",data-transport-key="stop",data-transport-key="next"');
check("the keys carry their Phase 0 accessible names", ['name="Previous marker"', 'name="Play"', 'name="Stop"', 'name="Next marker"'].every((n) => deckTemplate.includes(n)));
check("each key prints a symbol on its cap and its word engraved beneath", ["\\u25C0", "\\u25B6", "\\u25A0"].every((g) => deck.includes(g)) && ['text="Prev"', 'text="Play"', 'text="Stop"', 'text="Next"'].every((t) => deckTemplate.includes(t)) && count(deckTemplate, /class="key__word"/g) === 4);
check("the two windows are LampDisplays: one clock, one status", count(deckTemplate, /<LampDisplay\b/g) === 2 && /<LampDisplay kind="clock"/.test(deckTemplate) && /<LampDisplay\s+kind="status"/.test(deckTemplate));
check("one MixButton, at the right end, with its engraved function legend", count(deckTemplate, /<MixButton\b/g) === 1 && /data-transport-mix[\s\S]*<MixButton[\s\S]*text="Automatic mix"/.test(deckTemplate) && deckTemplate.indexOf("data-transport-mix") > deckTemplate.indexOf("data-transport-status-display"));
check("the deck draws no control of its own: no button, input, select or svg in its template", !/<button|<input|<select|<svg|<canvas/.test(deckTemplate));
check("every legend on the deck is an EngravedLabel; the heading is one too", count(deckTemplate, /<EngravedLabel\b/g) >= 7 && /<EngravedLabel as="h2" id={headingId} text="Transport"/.test(deckTemplate));
check("the deck exposes its parts for inspection", ["data-console-transport", "data-transport-keys", "data-transport-time", "data-transport-status-display", "data-transport-mix"].every((h) => deckTemplate.includes(h)));

// --- 3. Key behaviour; approved size, never shrunk. --------------------------
check("PLAY and STOP are an exclusive latching pair: engaging one releases the other", /function onPlay\(\)\s*{\s*playOn = true;\s*stopOn = false;\s*}/.test(deck) && /function onStop\(\)\s*{\s*stopOn = true;\s*playOn = false;\s*}/.test(deck));
check("PREVIOUS and NEXT are momentary: they release themselves on toggle", /function onPrev\(\)\s*{\s*prevOn = false;\s*}/.test(deck) && /function onNext\(\)\s*{\s*nextOn = false;\s*}/.test(deck));
check("the keys' state is seeded once from the fixture (playing lights PLAY, otherwise STOP) and lives in the deck only", /playOn = \$state\(fixture\.transport === "playing"\)/.test(deck) && /stopOn = \$state\(fixture\.transport !== "playing"\)/.test(deck) && !/export let|\$store|writable|readable/.test(deck));
check("the engaged lamp is the switch's own: the deck binds engaged and adds no lamp of its own", count(deckTemplate, /bind:engaged={(prevOn|playOn|stopOn|nextOn)}/g) === 4 && !/<Lamp\b/.test(deckTemplate));
check("the key caps are the approved switch at 40 px (--switch-size: 2.5rem), set once, never scaled down", /\.transport__keys\s*{[^}]*--switch-size:\s*2\.5rem/s.test(deckStyle) && count(deckStyle, /--switch-size:/g) === 1 && !/transform:\s*scale|zoom:/.test(deckStyle));
check("no part of the deck shrinks: keys, time and MIX are flex 0 0 auto; only the status window flexes, from a floor", /\.transport__keys\s*{[^}]*flex:\s*0 0 auto/s.test(deckStyle) && /\.transport__time\s*{[^}]*flex:\s*0 0 auto/s.test(deckStyle) && /\.transport__mix\s*{[^}]*flex:\s*0 0 auto/s.test(deckStyle) && /\.transport__status\s*{[^}]*flex:\s*1 1 16rem;[^}]*min-width:\s*16rem/s.test(deckStyle));

// --- 4. Time and status: the owner's formats; one fixture file. --------------
check("the clock prints H:MM:SS with no leading hour zero (D2.3.3)", /return `\$\{h\}:\$\{String\(m\)\.padStart\(2, "0"\)\}:\$\{String\(s\)\.padStart\(2, "0"\)\}`/.test(fixtures));
check("the clock's small line is bar · beat (D2.3.3)", /\[`Bar \$\{fixture\.position\.bar\}`, `Beat \$\{fixture\.position\.beat\}`\]/.test(deck));
check("the clock window is monospaced, tabular, in the lamp colour", /\.display--clock \.display__primary\s*{[^}]*font-family:\s*var\(--al-font-mono\)/s.test(displayStyle) && /\.display--clock \.display__primary\s*{[^}]*font-variant-numeric:\s*tabular-nums/s.test(displayStyle));
check("the status word comes first, then the details, from the fixture functions", /primary={word}/.test(deckTemplate) && /secondary={details}/.test(deckTemplate) && /const word = \$derived\(stageWord\(fixture\.mix\)\)/.test(deck) && /const details = \$derived\(statusDetails\(fixture\)\)/.test(deck));
check("the listening source is printed as text in the status details and selected nowhere (D2.3.2)", /parts\.push\(`Source \$\{SOURCE_PRINT\[source\]\}`\)/.test(fixtures) && /SOURCE_PRINT: Record<ListeningSource, string> = {\s*raw: "RAW",\s*preview: "PREVIEW",\s*render: "RENDER"/.test(fixtures) && !/ListeningSource|source/.test(deckTemplate.replace(/<!--[\s\S]*?-->/g, "")));
check("the three listening modes and three hardware profiles are the plan's (§6, §11)", /type ListeningSource = "raw" \| "preview" \| "render"/.test(fixtures) && /type HardwareProfile = "lite" \| "balanced" \| "performance"/.test(fixtures));
check("the processing status names its stage, progress, time left and profile (plan §10)", /parts\.push\(`Stage \$\{\(mix\.stageIndex \?\? 0\) \+ 1\} of \$\{STAGES\.length\}`\)/.test(fixtures) && /formatPercent\(mix\.progress/.test(fixtures) && /left`\)/.test(fixtures) && /parts\.push\(PROFILE_PRINT\[profile\]\)/.test(fixtures));
check("seven named processing stages, no generic spinner word", count(fixtures.slice(fixtures.indexOf("export const STAGES"), fixtures.indexOf("] as const", fixtures.indexOf("export const STAGES"))), /\n\s+"[^"]+",/g) === 7 && !/spinner|loading\.\.\./i.test(deckTemplate + mixTemplate + displayTemplate + fixtures));
check("the progress slot is shown only while processing and hidden otherwise", /const progress = \$derived\(fixture\.mix\.state === "processing" \? \(fixture\.mix\.progress \?\? 0\) : null\)/.test(deck) && /{#if progress !== null}/.test(displayTemplate));
check("warnings print in the red family on the last detail (Task 1.6: red = warning)", /warning={fixture\.mix\.warnings > 0}/.test(deckTemplate) && /class:is-warning={warning && i === secondary\.length - 1}/.test(displayTemplate) && /\.display__part\.is-warning\s*{[^}]*--dp-warn/s.test(displayStyle) && /--dp-warn(-lamp)?:[^;]*--al-function-red/.test(displayStyle));
check("the status word hierarchy is in the source: the primary is larger and brighter than the details", /\.display__primary\s*{[^}]*font-size/s.test(displayStyle) && /\.display__secondary\s*{[^}]*font-size:\s*var\(--al-text-size-xs\)/s.test(displayStyle));
check("both windows are named for assistive tech, with the simulated flag in the name", /aria-label={name}/.test(displayTemplate) && /const timeName = \$derived\(`Time \$\{clock\}, bar \$\{fixture\.position\.bar\} beat \$\{fixture\.position\.beat\}, \$\{SIMULATED\}`\)/.test(deck) && /const statusName = \$derived\(`Status: \$\{word\}, \$\{details\.join\(", "\)\}, \$\{SIMULATED\}`\)/.test(deck));
check("the fixture default is READY and the playground states are playing / processing / complete", /export const TRANSPORT_FIXTURE: TransportFixture = {\s*transport: "stopped"/.test(fixtures) && /mix: { state: "ready"/.test(fixtures) && /export const TRANSPORT_STATE_FIXTURES: Record<"playing" \| "processing" \| "complete", TransportFixture>/.test(fixtures) && /transport: "playing"/.test(fixtures) && /state: "processing", stageIndex: 2, progress: 0\.42/.test(fixtures) && /state: "complete"/.test(fixtures));

// --- 5. MIX: dominant, illuminated, unmistakably not Play. -------------------
check("MixButton is one real button with the MIX print, typed by MixState", count(mixTemplate, /<button\b/g) === 1 && /type="button"/.test(mixTemplate) && /<span class="mix__legend" data-part="legend">MIX<\/span>/.test(mixTemplate) && /state\?: MixState/.test(mix));
check("MixButton exposes its state and lit flag on the root", /data-mix-button\s+data-mix-state={state}\s+data-mix-lit={lit}/.test(mixTemplate) && /data-mix-key/.test(mixTemplate));
check("MIX is not a TactileSwitch and is not shaped like one: a wide rectangular illuminated cap", !/TactileSwitch|Knob|Fader/.test(mix) && /--mix-width,\s*8rem/.test(mixStyle) && /--mix-height,\s*4\.5rem/.test(mixStyle));
check("in the deck MIX is far larger than a key: 7.5rem × 3.5rem cap against the 2.5rem switch", /\.transport__mix\s*{[^}]*--mix-width:\s*7\.5rem;[^}]*--mix-height:\s*3\.5rem/s.test(deckStyle));
check("MIX is illuminated: the cap is a lit translucent lens over a bulb, with spill on the panel", /\.mix__spill/.test(mixStyle) && /--al-material-lamp/.test(mixStyle) && count(mixStyle, /radial-gradient\(/g) >= 3);
check("MIX presses: the cap stands proud and sinks under the finger; no motion where motion is refused", /\.mix__button:active:not\(\[aria-disabled="true"\]\) \.mix__cap\s*{[^}]*transform:\s*translateY\(-1px\)/s.test(mixStyle) && /--mx-lift/.test(mixStyle));
check("the processing pulse is inside prefers-reduced-motion: no-preference only, slow (1.8 s)", /@media \(prefers-reduced-motion: no-preference\)\s*{[^@]*animation:\s*mix-pulse 1\.8s/s.test(mixStyle) && count(mixStyle, /animation:/g) === 2 && mixStyle.indexOf("animation:") > mixStyle.indexOf("@media (prefers-reduced-motion: no-preference)"));
check("while processing MIX ignores presses (aria-disabled), and is never a disabled attribute that drops it from the tab order", /aria-disabled={busy \? "true" : undefined}/.test(mixTemplate) && !/\sdisabled=/.test(mixTemplate));
check("MIX starts nothing: no click handler, no navigation, no event dispatch", !/onclick|on:click|dispatch|createEventDispatcher|location\.|href=/.test(mix));
check("MIX is described by the status window and the simulated note", /describedBy={`\$\{uid\}-status \$\{uid\}-note`}/.test(deckTemplate) && /aria-describedby={describedBy \?\? undefined}/.test(mixTemplate));
check("MIX has an accessible name that says what it is for", /name = "MIX \\u2014 start the full mix"|name = "MIX — start the full mix"/.test(mix));

// --- 6. Materials: tokens, the warm lamp family, layered. --------------------
check("no hex colour literal in any transport file", !/#[0-9a-fA-F]{3,8}\b/.test(allTransportSource.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")));
check("the lamp colour is the incandescent token; warnings are the red family", /--al-material-lamp/.test(displayStyle) && /--al-function-amber/.test(displayStyle) && /--al-function-red/.test(displayStyle));
check("no cold VFD / LED colouring anywhere in the deck (plan §4)", !/\b(blue|cyan|teal|green|lime|vfd|led)\b/i.test(mixStyle + displayStyle + deckStyle));
check("the glass is layered, never flat: gradients and inset shadows on the window", count(displayStyle, /gradient\(/g) >= 3 && /\.display__glass\s*{[^}]*box-shadow:[^}]*inset/s.test(displayStyle));
check("the displays breathe like the family's lamps: slow, slight, and still under reduced motion", /@media \(prefers-reduced-motion: no-preference\)\s*{[^@]*animation:\s*display-breathe 4s/s.test(displayStyle) && count(displayStyle, /animation:/g) === 1);
check("the deck's housing is the bridge recipe: the shared material tokens, no new material", /--al-material-wood/.test(deckStyle) && /--al-material-metal/.test(deckStyle) && /--al-material-panel/.test(deckStyle) && !/--al-material-[a-z]+:\s/.test(deckStyle));

// --- 7. Fixture honesty; nothing wired. --------------------------------------
check("one fixture file; the deck, the windows and the button take their values from props only", /from "\.\/transport-fixtures"/.test(deck) && !/import (?!type)[^;]*transport-fixtures/.test(mix) && !/transport-fixtures/.test(display));
check("the fixture file says it is simulated and owns its own flag (never the bridge's)", /SIMULATED fixture data/.test(fixtures) && /export const SIMULATED = "simulated" as const/.test(fixtures) && !/meter-bridge/.test(allTransportSource));
check("the deck is marked data-simulated and says so in visible text", /data-simulated={SIMULATED}/.test(deckTemplate) && /Simulated \\u2014 no engine connected|Simulated — no engine connected/.test(deck));
check("no audio, clock, timer, randomness, storage, network or shared-state API anywhere", !/AudioContext|AudioBuffer|AudioWorklet|MediaElement|HTMLAudio|requestAnimationFrame|setInterval|setTimeout|Date\.now|new Date|performance\.now|Math\.random|localStorage|sessionStorage|indexedDB|fetch\(|WebSocket|Worker|\.play\(|\.pause\(|currentTime|svelte\/store|\$lib|\.\.\/\.\.\/lib\//.test(allTransportSource));
check("no transport file imports the strips, the bank, the mixer / arrange fixtures or the Phase 0 transport", !/channel-strip|ChannelBank|MixerChannelStrip|lib\/mixer|lib\/arrange|MiniTransport/.test(allTransportSource));
check("no project state: nothing is exported from the deck or button besides the component", !/export (let|const|function)/.test(deck.replace(/<script module[\s\S]*?<\/script>/, "")) && !/export (let|const|function)/.test(mix) && !/export (let|const|function)/.test(display));

// --- 8. The playground shows every state through one fixture component. ------
check("the playground has a Console transport section with the Task 2.3 heading id", /data-dev-component="console-transport"/.test(devPage) && /<h2 class="dev-section__title" id="dev-component-console-transport">/.test(devPage));
check("the page reaches the deck only through TransportFixture (no direct import of the deck, the button or the window)", /import TransportFixture, \{ type TransportFixtureConfig \} from "\.\/TransportFixture\.svelte"/.test(devPage) && !/console-transport\//.test(devPage));
check("the fixture component renders the deck and the MIX button alone, from the fixture file only", /<ConsoleTransport \{fixture\} headingId=/.test(devFixture) && /<MixButton state={config\.mixOnly} lit={!config\.unlit}/.test(devFixture) && /TRANSPORT_STATE_FIXTURES/.test(devFixture) && !/AudioContext|setInterval|setTimeout|Math\.random/.test(devFixture));
check("every deck state is on the page: the READY default, playing, processing, complete", /id: "ready", stateNote/.test(devPage) && ['snapshot: "playing"', 'snapshot: "processing"', 'snapshot: "complete"'].every((s) => devPage.includes(s)));
check("every MIX state is on the page, including the unlit cap", ['mixOnly: "ready", stateNote', 'mixOnly: "processing"', 'mixOnly: "complete"', 'mixOnly: "ready", unlit: true'].every((s) => devPage.includes(s)));
check("the page's decks get distinct heading ids (no duplicate ids on the page)", /headingId={`dev-transport-\$\{config\.id\}`}/.test(devFixture));

// --- 9. Scope. -----------------------------------------------------------------
check("no screw heads in any transport or playground file (owner's standing rule, D2.1.9)", !/(class=["'{][^"'}]*screw|\.[\w-]*screw[\w-]*\s*[{,:]|data-[\w-]*screw|__screw)/i.test(allTransportSource + devFixture) && !/screw/i.test(deckTemplate.replace(/<!--[\s\S]*?-->/g, "") + mixTemplate + displayTemplate));
check("no source selector, combobox or select in the Console (D2.3.2; plan §3)", !/combobox|<select|<datalist|Prominence|prominence/i.test(allTransportSource + consoleRoom));
const pinned = {
  "src/components/hardware/TactileSwitch.svelte": "9f8a61ff521988aff708ba7e860854c441343525c0eb43b11e92a534ce1a2ba9",
  "src/components/hardware/Lamp.svelte": "024d907589c1ab33b2b3c5cc8840347b9779450b61a60f67c34b045d4ac8010a",
  "src/components/hardware/EngravedLabel.svelte": "230ebcd7cf810d3096953e5131cb9cb3a89dd83f9f0e9cc0bcd934d2ca74fc29",
  "src/components/hardware/Knob.svelte": "df6c51572f28d00ca07b98551914f8f11837df147d557c9113e94cd29732fdf6",
  "src/components/hardware/Fader.svelte": "b46e55ec95f4ddbe544175f7e0a340e7378a8cff3af674e431aad2a08d5be372",
  "src/components/hardware/LedLadder.svelte": "d09d6f36455731128c7f32189b8e641686f603c293968b5629f55fb61f1628b7",
  "src/components/hardware/VUMeter.svelte": "350d8169a1e4aa9f0a816349aa88be0757078813370f21c01b62987fd0b0fa9b",
  "src/lib/tokens.css": "10ae166bc9e73c265523fbf95f4ba39f7b9f8277573a81e36953295cf51345be",
  "src/lib/tokens.ts": "c61debb8c942111395dccc9e67d2111239b9afb80a80cba9402efecb4787bd71",
  "src/components/meter-bridge/ConsoleMeterBridge.svelte": "1c96844f79fd0e0a6ba630d6f6b6ba436e3a1cf42eda65ff935f20f779213002",
  "src/components/ChannelBank.svelte": "a6031e29ac2f8d223276f9219190153453d2fa9d990a5d52cc170dc129798b69",
  "src/components/channel-strip/TrackStrip.svelte": "17059869a037d575beb0623a10989b2f9335fe35a1d34a889b737f409913ba35",
  "src/components/channel-strip/SendSlot.svelte": "8009eaf5ba0335099deb62a315116e67450750c118370d974596ead37b468b31",
  "src/components/channel-strip/track-strip-fixtures.ts": "c76e8c14b7c9794b14747a83a51926870a24c6a587405259f05ac6a415e151c5",
  "src/components/ChannelStrip.svelte": "13a202f891a9de776d16936d837685ebea757cda244678c9d0e1c10ebb398b58",
  "src/components/MiniTransport.svelte": "00cc37bcfb214aa8374efa8f222b98f77d427685063c40fddc18d0f32dd8e36d",
};
for (const [rel, hash] of Object.entries(pinned)) {
  check(`approved file untouched: ${rel}`, exists(rel) && sha256(read(rel)) === hash, exists(rel) ? `sha256 ${sha256(read(rel)).slice(0, 16)}…` : "missing");
}
const shellFiles = ["src/App.svelte", "src/components/RoomShell.svelte", "src/components/RoomNav.svelte", "src/components/MiniTransport.svelte", "src/rooms/ArrangeRoom.svelte", "src/rooms/MixerRoom.svelte", "src/components/ChannelBank.svelte", "src/components/meter-bridge/ConsoleMeterBridge.svelte"].map(read).join("\n");
check("the shell, the other rooms, the bridge and the bank do not know the deck exists", !/console-transport|ConsoleTransport|MixButton|LampDisplay/.test(shellFiles));
check(
  "no dependency added or changed",
  !("dependencies" in pkg) &&
    JSON.stringify(Object.keys(pkg.devDependencies).sort()) ===
      JSON.stringify(["@sveltejs/vite-plugin-svelte", "@types/node", "svelte", "svelte-check", "typescript", "vite", "vite-plugin-singlefile"]),
);
check("the check is wired into package.json", pkg.scripts["check:console-transport"] === "node scripts/check-console-transport-structure.mjs");

// --- report -----------------------------------------------------------------
for (const name of passes) console.log(`  PASS  ${name}`);
if (failures.length > 0) {
  console.error("");
  for (const failure of failures) console.error(`  FAIL  ${failure}`);
  console.error("");
  console.error(`Console transport structural contract check — ${passes.length}/${passes.length + failures.length} passed`);
  process.exit(1);
}
console.log("");
console.log(`Console transport structural contract check — ${passes.length}/${passes.length} passed`);
