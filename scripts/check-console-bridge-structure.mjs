#!/usr/bin/env node
/**
 * Console meter bridge structural contract check — Task 2.1.
 *
 * Dependency-free guard (Node built-ins only). It does NOT test geometry: the
 * bridge's layout, scrolling and non-overlap were measured in a real browser
 * at 1920×1080, 1440×900, 1280×900, 1024×768, 768×1024 and 360×740 (see
 * task-reports/2.1-report.md). What it tests is the source-level contract:
 *
 *   1. The Console room renders the bridge in its meter-bridge zone, the
 *      Phase 0 placeholder is gone, and the channel-bank zone is untouched.
 *   2. The bridge is COMPOSED of the approved Phase 1 components — the VU
 *      meter for master and channel meters, the LED ladder for the spectrum
 *      columns, the engraved label for every legend — and draws no meter of
 *      its own.
 *   3. The approved Phase 1 components and the tokens are byte-for-byte the
 *      files the owner approved (SHA-256, line endings normalised). A change
 *      to any of them is a deliberate act: it must come with an owner
 *      decision and an update of the list below.
 *   4. Fixture honesty: every reading is a typed-in number from one fixture
 *      file that says so; the DOM is marked `data-simulated`; nothing
 *      references audio, analysis, timers, randomness or shared state.
 *   5. Materials are tokens: no hex colour literal in any bridge file.
 *   6. The responsive contract: the deck is a size container, the desktop
 *      arrangement is a named-area grid, and every wide row scrolls inside
 *      its own module — never the page.
 *   7. Scope: nothing outside the Console room and the bridge files refers
 *      to the bridge; no dependency was added or changed.
 *
 * Run: npm run check:console-bridge
 */

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(resolve(root, rel), "utf8");
const sha256 = (text) => createHash("sha256").update(text.replace(/\r\n/g, "\n")).digest("hex");
const exists = (rel) => existsSync(resolve(root, rel));

const failures = [];
const passes = [];

function check(name, condition, detail = "") {
  if (condition) passes.push(name);
  else failures.push(detail ? `${name} — ${detail}` : name);
}

const consoleRoom = read("src/rooms/ConsoleRoom.svelte");
const bridge = read("src/components/meter-bridge/ConsoleMeterBridge.svelte");
const spectrum = read("src/components/meter-bridge/SpectrumLadder.svelte");
const gonio = read("src/components/meter-bridge/Goniometer.svelte");
const fixtures = read("src/components/meter-bridge/bridge-fixtures.ts");
const appCss = read("src/app.css");
const pkg = JSON.parse(read("package.json"));

const bridgeFiles = { bridge, spectrum, gonio, fixtures }; // Task 9.8: the needle meter's file left with its module
const allBridgeSource = Object.values(bridgeFiles).join("\n");

/** The CSS of a Svelte component (the single <style> block). */
const styleOf = (src) => src.slice(src.indexOf("<style>"), src.lastIndexOf("</style>"));
/** The template of a Svelte component (between the last </script> and <style>). */
const templateOf = (src) => src.slice(src.lastIndexOf("</script>") + "</script>".length, src.indexOf("<style>"));

// --- 1. The Console room renders the bridge in its zone. ---------------------
check(
  "ConsoleRoom imports the bridge from the meter-bridge folder",
  /import ConsoleMeterBridge from "\.\.\/components\/meter-bridge\/ConsoleMeterBridge\.svelte"/.test(consoleRoom),
);
check("ConsoleRoom renders the bridge exactly once", (consoleRoom.match(/<ConsoleMeterBridge \/>/g) ?? []).length === 1);
{
  const zoneStart = consoleRoom.indexOf('data-console-zone="meter-bridge"');
  const zoneEnd = consoleRoom.indexOf("</section>", zoneStart);
  const zone = zoneStart >= 0 && zoneEnd > zoneStart ? consoleRoom.slice(zoneStart, zoneEnd) : "";
  check("the bridge is rendered inside the meter-bridge zone", zone.includes("<ConsoleMeterBridge />"));
  check(
    "the meter-bridge zone is still labelled by #console-meter-title",
    /aria-labelledby="console-meter-title"/.test(zone),
  );
  check("the zone contains nothing but the bridge", !/console-zone__header|console-zone__body|placeholder/i.test(zone));
}
check(
  "the Phase 0 meter-bridge placeholder is gone",
  !/Meter bridge placeholder|console-zone__body/.test(consoleRoom),
);
check(
  "the bridge renders the zone's h2 with the id the zone points at",
  /<EngravedLabel as="h2" id="console-meter-title" text="Meter bridge"/.test(bridge),
);
check(
  "Console keeps the bridge as its first zone, over the bank, with the transport deck as the room's bottom bar (Task 9.5, D9.5.1)",
  (consoleRoom.match(/data-console-zone="([a-z-]+)"/g) ?? []).join(",") ===
    'data-console-zone="meter-bridge",data-console-zone="channel-bank",data-console-zone="transport"',
);

// The channel-bank zone: Task 2.2 replaced its Phase 0 header and frame with
// the ChannelBank's own housing (the bank renders the zone's h2 legend, as the
// bridge does for its zone). The zone is a bare, labelled wrapper round it.
// Task 4.1: an empty project (Master only) shows the explicit empty-project notice in the zone
// instead of the bank; a project with channels renders the bank exactly as before.
const CHANNEL_BANK_ZONE = `      <section
        class="console-zone console-zone--channels"
        data-console-zone="channel-bank"
        aria-labelledby="console-channels-title"
      >
        {#if project.isEmpty}
          <EmptyProjectNotice headingId="console-channels-title" room="console" />
        {:else}
          <ChannelBank />
        {/if}
      </section>`;
check("the channel-bank zone is a bare labelled wrapper round the ChannelBank (Task 2.2), or the empty-project notice when the project has no channels (Task 4.1)", consoleRoom.includes(CHANNEL_BANK_ZONE));
check("ConsoleRoom renders the ChannelBank once", (consoleRoom.match(/<ChannelBank \/>/g) ?? []).length === 1);
check("the Phase 0 zone header, eyebrow, detail and bank frame are gone from ConsoleRoom", !/console-zone__header|console-zone__eyebrow|console-zone__detail|console-bank\b|Zone 02/.test(consoleRoom));
check(
  "the bank renders the zone's h2 with the id the zone points at",
  /<EngravedLabel as="h2" id="console-channels-title" text="Channel bank"/.test(read("src/components/ChannelBank.svelte")),
);

// The room's grid: bridge row sized by the bridge, bank never below its content,
// vertical scroll inside the room on short windows, never sideways.
{
  const layout = consoleRoom.match(/\.console-layout\s*{([^}]*)}/s)?.[1] ?? "";
  check(
    "console layout rows: max-content bridge over the minmax(max-content, 1fr) bank over a max-content transport bar at the foot (Task 9.5, D9.5.1)",
    /grid-template-rows:\s*max-content\s+minmax\(max-content,\s*1fr\)\s+max-content/.test(layout),
    layout.trim().slice(0, 200),
  );
  check("console layout scrolls vertically inside the room only", /overflow-y:\s*auto/.test(layout) && /overflow-x:\s*hidden/.test(layout));
  // Since Task 2.2 the skinned zones share one reset rule; Task 2.3 added the
  // transport deck to it.
  const meterZone = consoleRoom.match(/\.console-zone--meter,\s*\.console-zone--transport,\s*\.console-zone--channels\s*{([^}]*)}/s)?.[1] ?? "";
  check(
    "the meter and channel zones drop the placeholder frame (no padding, border or background)",
    /padding:\s*0/.test(meterZone) && /border:\s*0/.test(meterZone) && /background:\s*none/.test(meterZone),
  );
  check("the generic zone rule carries no placeholder frame any more", !/dashed|#f1f1f1|#e8e8e8/.test(consoleRoom));
}

// The Console hosts the mixer, it does not edit it. The plan's Console is the
// one-screen overview — the bridge, the transport and the bank (plan §3:
// "the lower section contains channel strips", the upper section the bridge).
// Processing detail belongs to the Mixer room alone. A selected-channel
// processing panel stacked into the Console was briefly added and squeezed the
// bank to a 33 px sliver at 1366×768, so the separation is pinned here: no
// detail zone, no detail panel, no selection state, and the bank keeps a floor
// it cannot be crushed below.
check(
  "the Console has no processing-detail zone and imports no detail panel: detail editing is the Mixer's (plan §3)",
  !/data-console-zone="channel-detail"|MixerDetailPanel/.test(consoleRoom),
);
check(
  "the Console keeps no selection state of its own (selection would exist only to feed a detail panel)",
  !/\$state|selectedId|selectedChannel|onclick|onfocusin/.test(consoleRoom),
);
check(
  "the bank's row keeps a content floor, so nothing above it can crush the strips",
  /grid-template-rows:\s*max-content\s+minmax\(max-content,\s*1fr\)\s+max-content/.test(
    consoleRoom.match(/\.console-layout\s*{([^}]*)}/s)?.[1] ?? "",
  ),
);

// --- 2. Composed of the approved components; no meter drawn here. ------------
check(
  "the bridge imports VUMeter and EngravedLabel from the approved library",
  /import VUMeter from "\.\.\/hardware\/VUMeter\.svelte"/.test(bridge) &&
    /import EngravedLabel from "\.\.\/hardware\/EngravedLabel\.svelte"/.test(bridge),
);
check(
  "the spectrum imports LedLadder and EngravedLabel from the approved library",
  /import LedLadder from "\.\.\/hardware\/LedLadder\.svelte"/.test(spectrum) &&
    /import EngravedLabel from "\.\.\/hardware\/EngravedLabel\.svelte"/.test(spectrum),
);
check("the goniometer imports EngravedLabel from the approved library and the bridge fixtures — the correlation strip is BACK on its plate (Task 9.8, D9.8.2: the owner's 'return the correlation meter'; the 9.7 reading had the owner's 'phase meter' backwards — the white needle meter was the one to go)", /import EngravedLabel from "\.\.\/hardware\/EngravedLabel\.svelte"/.test(gonio) && /CORRELATION_FIXTURE/.test(gonio) && /GONIOMETER_TRACE/.test(gonio));
check(
  "the fixture file takes its ladder scale from the approved ladder",
  /import { LED_LADDER_SCALE, type LedSegment } from "\.\.\/hardware\/LedLadder\.svelte"/.test(fixtures),
);
check(
  "bridge files import nothing but the approved library, each other and svelte types",
  [...allBridgeSource.matchAll(/from "([^"]+)"/g)].every(([, spec]) => /^(\.\.\/hardware\/|\.\/)/.test(spec)),
);

{
  const tpl = templateOf(bridge);
  const masterBlock = tpl.slice(tpl.indexOf('data-master-meters'), tpl.lastIndexOf("</section>"));
  check("master: exactly two VUMeters, bare — no LEFT/RIGHT print on the row (D9.6.3, the owner: people know a VU when they see one), named as simulated", (masterBlock.match(/<VUMeter /g) ?? []).length === 2 && (masterBlock.match(/<VUMeter label=\{null\}/g) ?? []).length === 2 && /name=\{`Master left, \$\{SIMULATED\}`\}/.test(masterBlock) && /name=\{`Master right, \$\{SIMULATED\}`\}/.test(masterBlock));
  check(
    "master: independent fixture values",
    /level={MASTER_FIXTURE\.left}/.test(masterBlock) && /level={MASTER_FIXTURE\.right}/.test(masterBlock),
  );
  check(
    "the white needle PHASE meter is off the row and its component deleted (Task 9.8, D9.8.1, the owner: 'you should remove the phase meter not the correlation meter' — the needle meter that sat between the goniometer and the VUs since 9.5; the 9.7 pass had it backwards)",
    !exists("src/components/meter-bridge/CorrelationMeter.svelte") && !/CorrelationMeter/.test(bridge) && !/data-bridge-module="correlation"/.test(bridge),
  );
  check("the per-channel VU row is gone (Task 9.5): every channel strip carries its own LED meter beside its fader", !/BANK_FIXTURE/.test(bridge) && !/data-bridge-module="channels"/.test(bridge));
  check("the bridge renders the two sub-displays, the spectrum SPREAD across the width it is allowed (Task 9.7, D9.7.3: capped under half the deck, still the biggest — the owner's boxes)", /<SpectrumLadder spread \/>/.test(tpl) && /<Goniometer \/>/.test(tpl));
  check("every module heading is an engraved h3 (three modules since Task 9.8: spectrum, goniometer, master)", (tpl.match(/<EngravedLabel as="h3"/g) ?? []).length === 3);
}
{
  const tpl = templateOf(spectrum);
  check(
    "spectrum: one LedLadder per band, on the shared (unprinted) scale",
    /{#each bands as band \(band\.hz\)}/.test(tpl) && /<LedLadder level={band\.level} {segments}/.test(tpl),
  );
  check("spectrum: frequency print is the engraved label", /<EngravedLabel text={band\.label} size="xs" kind="value" \/>/.test(tpl));
  check("spectrum: the bay is a focusable scroll region", /role="region"[\s\S]*?tabindex="0"/.test(tpl));
}
check(
  "the spectrum scale is the approved ladder scale with the numerals stripped",
  /SPECTRUM_SEGMENTS[^=]*=\s*LED_LADDER_SCALE\.map\(\(\{ db, band \}\) => \(\{\s*db,\s*band,?\s*\}\)\)/s.test(fixtures),
);
check("no bridge file draws a VU meter or a ladder of its own (the instruments are the approved components; the needle meter left with its file, Task 9.8)", !/vu__|data-vu|led__|data-led|VU_MARKS/i.test(bridge + spectrum + gonio.replace(/goniometer/gi, "")));
check("only the goniometer contains SVG", !/<svg/.test(bridge) && !/<svg/.test(spectrum) && /<svg/.test(gonio));

// --- the goniometer's own contract (provisional treatment, D2.1.4) ----------
{
  const tpl = templateOf(gonio);
  const css = styleOf(gonio);
  check("goniometer: the scope is a described image, not a meter", /class="gonio__scope" role="img" aria-label=/.test(tpl));
  check("goniometer: a graticule group and a three-pass trace (bloom, body, core)", /data-part="graticule"/.test(tpl) && /gonio__trace-bloom/.test(tpl) && /gonio__trace-body/.test(tpl) && /gonio__trace-core/.test(tpl));
  check("goniometer: the trace is the fixture's point list", /trace\.map\(\(\[x, y\]\)/.test(gonio) && /GONIOMETER_TRACE/.test(gonio));
  check(
    "goniometer: the correlation strip is BACK and is the row's one correlation reading (Task 9.8, D9.8.2) — a −1 … +1 meter with the standard print, reading the fixture the needle meter used to read",
    /data-goniometer-correlation/.test(tpl) && /role="meter"[\s\S]*?aria-valuemin="-1"[\s\S]*?aria-valuemax="1"/.test(tpl) && /text="−1"/.test(tpl) && /text="0"/.test(tpl) && /text="\+1"/.test(tpl) && /CORRELATION_FIXTURE/.test(gonio),
  );
  check(
    "goniometer: the strip takes the plate's leftover width (Task 9.8, D9.8.4, the owner: 'extend them horizontally') — flex-grow, floored at its 1× width — and its legend stays clipped out of the face, in the accessibility tree (D9.6.3)",
    /\.gonio__correlation\s*{[\s\S]*?flex:\s*1 1 auto;[\s\S]*?min-width:\s*var\(--gonio-strip-width, 6rem\);/.test(css) && /gonio__legend--hidden/.test(css) && /text="Correlation"/.test(tpl),
  );
  check(
    "goniometer: the correlation line rides the plate's vertical MIDDLE (Task 9.9, D9.9.3, the owner: 'the line must be in the middle, not at the top') — the plate centres its children (align-items: center), the strip carries no top padding, the 8px slot and the −1·0·+1 print one centred block with the centre mark at the slot's midpoint",
    (() => {
      const plate = css.match(/\.gonio\s*\{([^}]*)\}/)?.[1] ?? "";
      const stripRule = css.match(/\.gonio__correlation\s*\{([^}]*)\}/)?.[1] ?? "";
      const slot = css.match(/\.corr__slot\s*\{([^}]*)\}/)?.[1] ?? "";
      return (
        /align-items:\s*center/.test(plate) &&
        !/padding-top/.test(stripRule) &&
        /height:\s*8px/.test(slot)
      );
    })(),
  );
  check("goniometer: the trace is the lamp / amber family, never green", /--g-trace:\s*var\(--al-material-lamp\)/.test(css) && /--g-trace-core:\s*var\(--al-function-amber-hi\)/.test(css) && !/green/i.test(css));
  check("goniometer: the window floor is the recess token", /--g-floor-centre:\s*color-mix\(in srgb, var\(--al-material-recess\)/.test(css));
  check("goniometer: SVG defs are namespaced per instance", /const uid = `gonio\$\{\+\+nextId\}`/.test(gonio) && !/id="gonio-/.test(tpl));
}

// --- 3. The approved components and tokens are frozen. ----------------------
// SHA-256 of the files as approved at commit 1ba67c1 (Phase 1 approved
// 2026-10-30). Changing one of these is an owner decision; record it in
// decisions-log.md and update the hash here in the same change.
const FROZEN = {
  "src/components/hardware/EngravedLabel.svelte": "230ebcd7cf810d3096953e5131cb9cb3a89dd83f9f0e9cc0bcd934d2ca74fc29",
  "src/components/hardware/Fader.svelte": "b46e55ec95f4ddbe544175f7e0a340e7378a8cff3af674e431aad2a08d5be372", // 2026-10-31: owner-directed unsigned scale print (D2.2.8)
  "src/components/hardware/Knob.svelte": "df6c51572f28d00ca07b98551914f8f11837df147d557c9113e94cd29732fdf6", // Task 2.2: owner-approved `--knob-size` host variable (D2.2.2)
  "src/components/hardware/Lamp.svelte": "024d907589c1ab33b2b3c5cc8840347b9779450b61a60f67c34b045d4ac8010a",
  "src/components/hardware/LedLadder.svelte": "d09d6f36455731128c7f32189b8e641686f603c293968b5629f55fb61f1628b7",
  "src/components/hardware/TactileSwitch.svelte": "9f8a61ff521988aff708ba7e860854c441343525c0eb43b11e92a534ce1a2ba9",
  // Task 9.9 re-pinned (the owner's content pass, decisions-log D9.9.2: the fill-mode
  // print grows with the card — the numerals, the legend and the radii bounded by
  // the card's fixed height, the needle at its 1× size; the 9.8 fill geometry, the
  // sweep cap and the lamp centring unchanged beneath it).
  "src/components/hardware/VUMeter.svelte": "08bb01a2cc7b173d1c7cfa37182b516afd40dc8fc4071b2e539bbb974e8d6bd0",
  "src/lib/tokens.css": "10ae166bc9e73c265523fbf95f4ba39f7b9f8277573a81e36953295cf51345be",
  "src/lib/tokens.ts": "c61debb8c942111395dccc9e67d2111239b9afb80a80cba9402efecb4787bd71",
};
for (const [rel, expected] of Object.entries(FROZEN)) {
  const actual = sha256(read(rel));
  check(`approved file unchanged: ${rel}`, actual === expected, `sha256 ${actual.slice(0, 12)}… ≠ approved ${expected.slice(0, 12)}…`);
}

// --- 4. Fixture honesty; nothing wired. ------------------------------------
check("the fixture file declares itself SIMULATED in its header", /SIMULATED fixture data/.test(fixtures.slice(0, 400)));
check('the fixture file exports SIMULATED = "simulated"', /export const SIMULATED = "simulated" as const/.test(fixtures));
check(
  "bridge, spectrum and goniometer roots carry data-simulated",
  /data-meter-bridge data-simulated={SIMULATED}/.test(bridge) && /data-simulated={SIMULATED}/.test(spectrum) && /data-simulated={SIMULATED}/.test(gonio),
);
check(
  "no audio, analysis, timers, randomness, network or storage in any bridge file",
  !/AudioContext|AnalyserNode|MediaStream|getUserMedia|fetch\(|WebSocket|localStorage|sessionStorage|setInterval|setTimeout|requestAnimationFrame|Math\.random|onMount|\$effect|writable\(|readable\(/.test(allBridgeSource),
);
check("no FFT or correlation algorithm (no such call anywhere in the bridge)", !/\bfft\s*\(|new\s+FFT|correlat(e|ion)\s*\(|analy[sz]e\s*\(|getFloat(Frequency|TimeDomain)Data/i.test(allBridgeSource));

// Fixture variety: the review must see varied needles, a red channel, a quiet one.
{
  check("the per-channel bank fixture is gone with the channel VU row (Task 9.5): the strips' own meters carry the per-channel readings now", !/BANK_FIXTURE/.test(fixtures));
  check("the goniometer's strip reads the one correlation fixture (D2.1.4's value, unchanged — the row's one correlation reading since the needle left, D9.8.1/D9.8.2)", /CORRELATION_FIXTURE = 0\.62/.test(fixtures));
  check("master fixture: left and right differ", /left: (-?[\d.]+),\s*right: (-?[\d.]+)/.test(fixtures) && RegExp.$1 !== RegExp.$2);
  const bands = [...fixtures.matchAll(/{ hz: (\d+), label: "([^"]+)", level: (-?[\d.]+) }/g)].map(([, hz, label, level]) => ({ hz: Number(hz), label, level: Number(level) }));
  check("spectrum fixture: fifteen bands, 25 Hz to 16 kHz, ascending", bands.length === 15 && bands[0].hz === 25 && bands[14].hz === 16000 && bands.every((b, i) => i === 0 || b.hz > bands[i - 1].hz));
  check("spectrum fixture: reaches red and spans the ladder (≥ 20 dB)", bands.some((b) => b.level >= 0) && Math.max(...bands.map((b) => b.level)) - Math.min(...bands.map((b) => b.level)) >= 20);
  check("spectrum fixture: hardware-style three-character print (1k6, 2k5, 6k3)", ["1k6", "2k5", "6k3"].every((l) => bands.some((b) => b.label === l)) && bands.every((b) => b.label.length <= 3));
  check("correlation fixture is within −1 … +1", /CORRELATION_FIXTURE = (-?[\d.]+)/.test(fixtures) && Math.abs(Number(RegExp.$1)) <= 1);
}

// --- 5. Tokens only: no hex colour literal. ----------------------------------
for (const [name, src] of Object.entries(bridgeFiles)) {
  check(`no hex colour literal in ${name}`, !/#[0-9a-fA-F]{3,8}\b/.test(src.replace(/url\(#[^)]*\)/g, "").replace(/`\$\{uid\}[^`]*`/g, "")));
}
check(
  "bridge materials come from the panel / bevel / recess / metal / wood / border tokens",
  ["--al-material-panel", "--al-bevel-light", "--al-bevel-shadow", "--al-material-recess", "--al-material-metal", "--al-material-wood"].every((t) => styleOf(bridge).includes(t)) &&
    ["--al-material-recess", "--al-border-strong"].every((t) => styleOf(spectrum).includes(t) && styleOf(gonio).includes(t)),
);

// --- 6. The responsive contract. ------------------------------------------
{
  const css = styleOf(bridge);
  check("the deck is a named inline-size container", /container-type:\s*inline-size/.test(css) && /container-name:\s*bridge/.test(css));
  check(
    "desktop arrangement: one row of instruments spread edge to edge — the reference console's strip uses its whole width (Task 9.5, D9.5.5; since Task 9.9, D9.9.4, the goniometer plate's share is 1.4 against the master's 2 — the owner's 'a little bigger, not as much as the VUs' — the VU pair remains the biggest extender)",
    /\.module--spectrum\s*{[^}]*flex:\s*3 1 auto/s.test(css) && /\.module--stereo\s*{[^}]*flex:\s*1\.4 1 auto/s.test(css) && /\.module--master\s*{[^}]*flex:\s*2 1 auto/s.test(css),
  );
  check("below desktop the modules wrap in the owner's order: spectrum, goniometer, master (D9.6.3; the needle module left the row, Task 9.8)", /flex-wrap:\s*wrap/.test(css) && /\.module--spectrum\s*{\s*order:\s*1;/.test(css) && /\.module--stereo\s*{\s*order:\s*2;/.test(css) && /\.module--master\s*{\s*order:\s*3;/.test(css) && !/module--phase|module--correlation/.test(css));
  {
    const rule = css.match(new RegExp(`\\n  ${".master".replace(".", "\\.")}\\s*{([^}]*)}`))?.[1] ?? "";
    check("master row scrolls inside its own module (overflow-x auto, max-width 100%)", /overflow-x:\s*auto/.test(rule) && /max-width:\s*100%/.test(rule), rule.trim().slice(0, 120));
  }
  const spectrumRoot = styleOf(spectrum).match(/\n  \.spectrum\s*{([^}]*)}/)?.[1] ?? "";
  check("spectrum bay scrolls inside its own module", /overflow-x:\s*auto/.test(spectrumRoot) && /max-width:\s*100%/.test(spectrumRoot));
  check("modules can never exceed the deck (max-width 100%, min-width 0)", /\.module\s*{[^}]*max-width:\s*100%/s.test(css) && /\.module\s*{[^}]*min-width:\s*0/s.test(css));
  check("master pair is centred with auto margins (no unreachable overflow)", /\.master__pair\s*{[^}]*margin-inline:\s*auto/s.test(css));
check(
    "the spread is the owner's instruction (Tasks 9.8/9.9): the spectrum stays capped at the reference's 2k5 line — 43% of the row, one written-down number, spread row only (D9.9.1; everything right of that line is the goniometer's and the VUs') — the VU cards are EXTENDED WITH THEIR CONTENT, the print growing with the card (D9.9.2: the meters run the `fill` mode at the row's one height, the 1× card's width the floor) — and the pair fills the module so the two meters share its width",
    (() => {
      const at = css.indexOf("@container bridge (min-width: 900px)");
      const cap = css.indexOf("max-width: 43%");
      return (
        at >= 0 && cap > at && (css.match(/max-width:\s*43%/g) ?? []).length === 1 &&
        (templateOf(bridge).match(/<VUMeter label=\{null\} fill /g) ?? []).length === 2 &&
        /--vu-fill-height:\s*var\(--b-inst-height\)/.test(css) &&
        /--vu-fill-min:\s*calc\(var\(--b-inst-height\) \* 10 \/ 7\)/.test(css) &&
        /\.master__pair\s*{[^}]*flex:\s*1 1 auto/s.test(css)
      );
    })(),
  );
  check("every instrument is drawn from the row's ONE height (D9.6.3; re-cut in D9.8.3; a step taller since Task 9.9, D9.9.4 — the owner's 'a little bigger'): --b-inst-height (5rem) drives the scope (--gonio-size) and the VUs' FILL height (--vu-fill-height, their width flexing with the row at the 1× card's width as the floor), nothing else sizes an instrument, and no size steps remain", /--b-inst-height:\s*5rem/.test(css) && /--gonio-size:\s*var\(--b-inst-height\)/.test(css) && /--vu-fill-height:\s*var\(--b-inst-height\)/.test(css) && !/--vu-width:|--phase-width:/.test(css) && (css.match(/@container bridge \(min-width: \d+px\)\s*{\s*\.master\s*{\s*--vu-width:/g) ?? []).length === 0);
  check("no legends print on the row (D9.6.3): the module headings are clipped out of the face and stay in the accessibility tree", /\.module__title\s*{[^}]*clip-path:\s*inset\(50%\)/s.test(css) && /aria-labelledby=\{`\$\{uid\}-master`\}/.test(templateOf(bridge)));
  check("the spectrum spreads by a prop, its 1x bay unchanged (D9.6.3)", /spread = false/.test(spectrum) && /spectrum--spread/.test(styleOf(spectrum)) && /justify-content:\s*space-between/.test(styleOf(spectrum)));
  check("the goniometer is host-sized the VU's way: fallbacks at the use site, never declared at the root (D9.6.3)", /width: var\(--gonio-size, 6\.25rem\)/.test(styleOf(gonio)) && !/--gonio-size:\s*[0-9.]/.test(styleOf(gonio)));
  check("no bridge file animates anything of its own", !/@keyframes|animation:/.test(css + styleOf(spectrum) + styleOf(gonio)));
}

// --- 6b. Owner's standing rule (D2.1.9): no screw heads, anywhere, ever. ----
// The rule is about rendered screws, so this looks for screw classes, selectors
// and data hooks in every file under src/ — not at the word in prose comments
// (the approved token files mention "screw heads" in a comment; they are frozen
// above and do not render anything).
{
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = resolve(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(svelte|css|ts|js|html)$/.test(entry)) files.push(full);
    }
  };
  walk(resolve(root, "src"));
  const offenders = files.filter((f) => /(class=["'{][^"'}]*screw|\.[\w-]*screw[\w-]*\s*[{,:]|data-[\w-]*screw|__screw)/i.test(readFileSync(f, "utf8")));
  check("no screw heads rendered anywhere in src/ (owner's standing rule, D2.1.9)", offenders.length === 0, offenders.map((f) => f.slice(root.length + 1)).join(", "));
  check("the bridge deck markup carries no decorative spans", !/<span class="bridge__[^"]*" aria-hidden="true"><\/span>/.test(templateOf(bridge)));
}

// --- 7. Scope. -------------------------------------------------------------
check("app.css knows nothing about the bridge", !/bridge|meter-bridge|spectrum|gonio/i.test(appCss));
for (const rel of [
  "src/App.svelte",
  "src/components/RoomShell.svelte",
  "src/components/RoomNav.svelte",
  "src/components/MiniTransport.svelte",
  "src/components/ChannelBank.svelte",
  "src/components/ChannelStrip.svelte",
  "src/rooms/ArrangeRoom.svelte",
  "src/rooms/MixerRoom.svelte",
  "src/dev/DevComponentsPage.svelte",
]) {
  check(`${rel} does not reference the bridge`, !/meter-bridge|ConsoleMeterBridge|SpectrumLadder|Goniometer/.test(read(rel)));
}
check(
  "no dependency added or changed",
  !("dependencies" in pkg) &&
    JSON.stringify(Object.keys(pkg.devDependencies).sort()) ===
      JSON.stringify(["@sveltejs/vite-plugin-svelte", "@types/node", "svelte", "svelte-check", "typescript", "vite", "vite-plugin-singlefile"]),
);
check("the check is wired into package.json", pkg.scripts["check:console-bridge"] === "node scripts/check-console-bridge-structure.mjs");

// --- report -----------------------------------------------------------------
for (const name of passes) console.log(`  PASS  ${name}`);
if (failures.length > 0) {
  console.error("");
  for (const failure of failures) console.error(`  FAIL  ${failure}`);
  console.error("");
  console.error(`Console meter bridge structural contract check — ${passes.length}/${passes.length + failures.length} passed`);
  process.exit(1);
}
console.log("");
console.log(`Console meter bridge structural contract check — ${passes.length}/${passes.length} passed`);
