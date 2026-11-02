#!/usr/bin/env node
/**
 * Mixer structural contract check — Task 0.5 (navigation, detail panel,
 * bounding) and Task 2.7 (the channel strips).
 *
 * Dependency-free guard (Node built-ins only). It does NOT test geometry —
 * that was measured in a real browser (see task-reports/2.7-report.md) — it
 * tests the source-level contract:
 *
 *   1. Navigation: order is Arrange | Console | Mixer; tabs right, wordmark
 *      left (Task 0.5, unchanged).
 *   2. The room: the strip bank over the Task 0.5 detail panel (owner,
 *      D2.7.1), the layout scrolling vertically inside the bounded room, every
 *      detail region present, the panel untouched and still not kind-aware
 *      (that is Task 2.9).
 *   3. Reuse: the Mixer channels ARE the approved strips — TrackStrip (2.2),
 *      ReturnStrip and BusMasterStrip (2.4) — rendered once each by thin Mixer
 *      wrappers; no control is recreated (no Knob, Fader or meter is imported
 *      by any Mixer file); the Mixer bank's housing is the Console bank's,
 *      value for value.
 *   4. The one shared-strip change is backward-compatible: an OPTIONAL
 *      `identity` snippet rendered between the head and the first section,
 *      guarded by {#if}; the Console passes nothing and its files are
 *      byte-identical to their approved state.
 *   5. One session: the channels are derived from the shared fixtures
 *      (TRACK_STRIPS, RETURN_STRIPS, BUS_MASTERS, ARRANGE_TRACKS by code); the
 *      Phase 0 "Track NN" placeholders are gone; three channel kinds in the
 *      Console bank's order; every fixture Return is a channel.
 *   6. Identity (owner, D2.7.2): family and source type are engraved PRINTS of
 *      the Arrange data (editing stays in Arrange); SEL is the approved
 *      cap-labelled TactileSwitch with radio behaviour (D2.7.3).
 *   7. Prominence Tier (plan §5a): the approved ScribbleSelect with the three
 *      tiers, local $state seeded from the fixture; the amber Lamp lit while
 *      the tier needs confirmation; confirming = choosing any tier through the
 *      select's new optional `onchoose` (D2.7.4); the fixture starts 09 and 16
 *      unconfirmed; `onchange` is unchanged.
 *   8. Selection is local UI state — $state in the room, no store, no
 *      persistence, no cross-room import or synchronisation.
 *   9. Layout rules (D2.2.1 / D2.4.2): fixed modules never compressed, the
 *      tracks' rail the only horizontal scroller, the pinned block outside it,
 *      column mode under 68.75rem.
 *  10. Scope: no screws, no audio / DSP / routing / persistence, no automatic
 *      classification, no numeric priority control (follow-up), no dependency
 *      change; approved Console and Arrange files untouched.
 *
 * Run: npm run check:mixer
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
const scriptOf = (svelte) => (svelte.match(/<script lang="ts">([\s\S]*?)<\/script>/) ?? [])[1] ?? "";
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/^\s*\/\/.*$/gm, "");

const rooms = read("src/lib/rooms.ts");
const room = read("src/rooms/MixerRoom.svelte");
const detail = read("src/components/MixerDetailPanel.svelte");
const data = read("src/lib/mixer.ts");
const model = read("src/lib/project/model.ts"); // Task 3.1: the shared project model
const store = read("src/lib/project/store.svelte.ts"); // Task 3.1: the one project store
const session = read("src/lib/project/session.ts"); // Task 3.1: the fixture session that seeds it
const appCss = read("src/app.css");
const pkg = JSON.parse(read("package.json"));

const bank = read("src/components/mixer/MixerBank.svelte");
const trackCh = read("src/components/mixer/MixerTrackStrip.svelte");
const returnCh = read("src/components/mixer/MixerReturnStrip.svelte");
const busCh = read("src/components/mixer/MixerBusStrip.svelte");
const identity = read("src/components/mixer/MixerIdentity.svelte");
const mixerSources = [room, bank, trackCh, returnCh, busCh, identity].join("\n");
const mixerAndData = mixerSources + "\n" + data;

const trackStrip = read("src/components/channel-strip/TrackStrip.svelte");
const stripModule = read("src/components/channel-strip/StripModule.svelte");
const returnStrip = read("src/components/channel-strip/ReturnStrip.svelte");
const busStrip = read("src/components/channel-strip/BusMasterStrip.svelte");
const consoleBank = read("src/components/ChannelBank.svelte");
const select = read("src/components/hardware/ScribbleSelect.svelte");
const arrange = read("src/lib/arrange.ts");
const trackFixtures = read("src/components/channel-strip/track-strip-fixtures.ts");

// --- 1. Navigation order and position (Task 0.5). -----------------------------
const roomIds = [...rooms.matchAll(/id:\s*"([a-z]+)"/g)].map((m) => m[1]);
check("room order is Arrange, Console, Mixer", JSON.stringify(roomIds) === JSON.stringify(["arrange", "console", "mixer"]), `found ${JSON.stringify(roomIds)}`);
check("tabs are right-aligned", /\.room-nav\s*{[^}]*justify-self:\s*end/s.test(appCss));
check("wordmark stays left-aligned", /\.app-brand\s*{[^}]*justify-self:\s*start/s.test(appCss));
check("tab buttons are smaller than the original 0.5rem padding", /\.room-nav__link\s*{[^}]*padding:\s*0\.1875rem/s.test(appCss));

// --- 2. The room: bank over detail, bounded, scrolling inside. ----------------
const roomTemplate = templateOf(room);
check("the room renders the Mixer bank once, in its channels section, labelled by the bank's legend", count(roomTemplate, /<MixerBank\b/g) === 1 && /<section[^>]*data-mixer-region="channel-bank"[^>]*aria-labelledby="mixer-channels-title"[^>]*>\s*<MixerBank \{selectedId\} onselect=\{selectChannel\} \/>/.test(roomTemplate) && /id="mixer-channels-title"/.test(bank));
check("the room renders the Task 0.5 detail panel once, after the bank (stacked, owner D2.7.1)", count(roomTemplate, /<MixerDetailPanel\b/g) === 1 && roomTemplate.indexOf("<MixerBank") < roomTemplate.indexOf("<MixerDetailPanel") && /data-mixer-region="detail"[^>]*>\s*<MixerDetailPanel channel=\{selectedChannel\} \/>/.test(roomTemplate));
check("the layout is one column — bank row sized by its content, detail row with a floor — and scrolls vertically inside the room, never sideways", /\.mixer-layout\s*{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s.test(room) && /\.mixer-layout\s*{[^}]*grid-template-rows:\s*max-content\s+minmax\(24rem, 1fr\)/s.test(room) && /\.mixer-layout\s*{[^}]*overflow-y:\s*auto/s.test(room) && /\.mixer-layout\s*{[^}]*overflow-x:\s*hidden/s.test(room));
check("the room is bounded to the viewport so the page cannot grow (app.css, Task 0.5 rule kept)", /\.app-shell\[data-active-room="mixer"\]\s*{[^}]*overflow:\s*hidden/s.test(appCss) && /\[data-active-room="mixer"\] \.room\s*{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\)/s.test(appCss));
check("the room carries its hooks: data-mixer-room with the selected channel, data-mixer-layout", /data-mixer-room data-selected-channel=\{selectedId\}/.test(roomTemplate) && /data-mixer-layout/.test(roomTemplate));
check("the Phase 0 column strip is gone (MixerChannelStrip.svelte deleted, nothing imports it)", !exists("src/components/MixerChannelStrip.svelte") && !/MixerChannelStrip/.test(mixerAndData));
check("detail panel is tagged as a region", detail.includes('data-mixer-region="detail-panel"'));
// Task 2.8 replaced the Task 0.5 placeholder with the processing-chain panel:
// the "sends" placeholder region has no detail counterpart (sends live on the
// strips), "auto-manual" is the per-module AutoManualControls and
// "ghost-indicator" the per-knob ghost pointer (both checked by check:mixer-detail).
for (const region of ["selection", "processing-chain", "eq-graph", "compressor", "what-changed"]) {
  check(`detail region "${region}" is present`, detail.includes(`data-mixer-region="${region}"`));
}
check("detail panel branches by channel kind (Task 2.9): the track chain, the Return chain (ReturnDetail), the bus chain (BusDetail), and an explicit empty state only for no selection — never a strip, never one universal layout", /channel\.kind === "track"/.test(detail) && /\{:else if theReturn\}\s*(?:<!--[\s\S]*?-->\s*)?<ReturnDetail ret=\{theReturn\} \/>/.test(detail) && /\{:else if bus\}\s*(?:<!--[\s\S]*?-->\s*)?<BusDetail \{bus\} \/>/.test(detail) && /\{:else\}\s*<div class="detail__empty" role="status" data-detail-empty>/.test(detail) && !/ReturnStrip|BusMasterStrip/.test(detail));
// Task 3.1: the selected channel is a project entity (Track | ReturnBus | Bus — the
// `Channel` union of lib/project/model.ts), each carrying kind, id, code and name.
check("the detail panel still receives the room's selected channel {id, code, name, kind} — since Task 3.1 the project entity itself (the Channel union), looked up in the store", /export type Channel = Track \| ReturnBus \| Bus;/.test(model) && /readonly kind: "track";\s*readonly id: TrackId;\s*(\/\*\*[^*]*\*\/\s*)?readonly code: string;\s*readonly type: "TRK";\s*name: string;/.test(model) && /import type \{ Channel \} from "\.\.\/lib\/project\/model"/.test(detail) && /channel \}: \{ channel: Channel \| undefined \} = \$props\(\)/.test(detail));

// --- 3. Reuse of the approved strips. -----------------------------------------
check("the track channel is the approved TrackStrip (Task 2.2), rendered once with the fixture strip", /import TrackStrip from "\.\.\/channel-strip\/TrackStrip\.svelte"/.test(trackCh) && count(templateOf(trackCh), /<TrackStrip\b/g) === 1 && /<TrackStrip track=\{strip\}>/.test(trackCh) && /const strip = \$derived\(trackStrip\(channel\.id\)\);/.test(trackCh));
check("the Return channel is the approved ReturnStrip (Task 2.4), rendered once with the fixture Return", /import ReturnStrip from "\.\.\/channel-strip\/ReturnStrip\.svelte"/.test(returnCh) && count(templateOf(returnCh), /<ReturnStrip\b/g) === 1 && /<ReturnStrip \{ret\} \{live\}>/.test(returnCh) && /const live = \$derived\(returnLive\(channel\.id\)\);/.test(returnCh) && /const ret = \$derived\(returnStripOf\(channel\.id\)\);/.test(returnCh));
check("the bus channel is the approved BusMasterStrip (Task 2.4), rendered once with the fixture bus", /import BusMasterStrip from "\.\.\/channel-strip\/BusMasterStrip\.svelte"/.test(busCh) && count(templateOf(busCh), /<BusMasterStrip\b/g) === 1 && /<BusMasterStrip \{bus\} \{live\}>/.test(busCh) && /const bus = \$derived\(busStripOf\(channel\.id\)\);/.test(busCh) && /const live = \$derived\(busLive\(channel\.id\)\);/.test(busCh));
check("no Mixer file recreates a control: no Knob, Fader, meter or send slot is imported or drawn by the Mixer", !/hardware\/(Knob|Fader|VUMeter|LedLadder)|SendSlot|<Knob\b|<Fader\b|data-knob|data-fader/.test(mixerSources));
check("the Mixer files draw only through approved components: EngravedLabel, TactileSwitch, Lamp, ScribbleSelect", /import EngravedLabel from "\.\.\/hardware\/EngravedLabel\.svelte"/.test(identity) && /import TactileSwitch from "\.\.\/hardware\/TactileSwitch\.svelte"/.test(identity) && /import Lamp from "\.\.\/hardware\/Lamp\.svelte"/.test(trackCh) && /import ScribbleSelect from "\.\.\/hardware\/ScribbleSelect\.svelte"/.test(trackCh));
check("the Mixer does not override the strips' own CSS (no :global reach into .strip / .module / .switch / .knob / .fader)", !/:global\(\s*\.(strip|module|switch|knob|fader|lamp)\b/.test(mixerSources));
check("the Mixer bank's housing is the Console bank's, value for value (the style blocks are identical but for the class names and the heading comment)", (() => {
  const norm = (css) => stripComments(css).replace(/\s+/g, " ").trim();
  return norm(styleOf(bank).replace(/\.mbank/g, ".bank").replace(/--mb-/g, "--b-")) === norm(styleOf(consoleBank));
})());
check("the Console bank is neither imported nor changed by the Mixer", !/import [^;]*ChannelBank/.test(mixerSources));

// --- 4. The optional identity extension is backward-compatible. --------------
const extensionOk = (src, cls) =>
  new RegExp(`\\{#if identity\\}\\s*(<!--[\\s\\S]*?-->\\s*)?<div class="${cls}__section ${cls}__section--identity" data-strip-section="identity">\\s*\\{@render identity\\(\\)\\}\\s*<\\/div>\\s*\\{\\/if\\}`).test(src);
check("TrackStrip takes an OPTIONAL identity snippet (no default needed; absent = the approved strip)", /let \{ track, identity \}: \{ track: TrackStripLive; identity\?: Snippet \} = \$props\(\);/.test(trackStrip) && /import type \{ Snippet \} from "svelte"/.test(trackStrip));
check("TrackStrip renders it only when given, as one more section between the head and TRIM, divided by the same rule", extensionOk(trackStrip, "strip") && (() => { const t = templateOf(trackStrip); return t.indexOf("</header>") < t.indexOf("{#if identity}") && t.indexOf("{/if}") < t.indexOf('data-strip-section="trim"'); })() && /\.strip__head \+ \.strip__section \{/.test(trackStrip));
check("StripModule takes the same optional snippet (default null) and renders it the same way, before the first knob", /identity = null,/.test(stripModule) && /identity\?: Snippet \| null;/.test(stripModule) && extensionOk(stripModule, "module") && (() => { const t = templateOf(stripModule); return t.indexOf("</header>") < t.indexOf("{#if identity}") && t.indexOf("{/if}") < t.indexOf("{@render knobA()}"); })());
check("ReturnStrip and BusMasterStrip only forward it (optional, default null) to the module", /let \{\s*ret,\s*identity = null,\s*live = null,\s*\}: \{ ret: ReturnStripFixture; identity\?: Snippet \| null; live\?: ReturnLive \| null \} = \$props\(\);/.test(returnStrip) && /\n  \{identity\}\n/.test(returnStrip) && /let \{\s*bus,\s*identity = null,\s*live = null,\s*\}: \{ bus: BusMasterFixture; identity\?: Snippet \| null; live\?: BusLive \| null \} = \$props\(\);/.test(busStrip) && /\n  \{identity\}\n/.test(busStrip));
check("the extension's own CSS is one rule in each strip (column, stretched, the head's paddings) and nothing else about the strips changed", /\.strip__section--identity \{\s*flex-direction: column;\s*align-items: stretch;\s*padding: var\(--al-space-2xs\) var\(--al-space-3xs\);\s*\}/.test(trackStrip) && /\.module__section--identity \{\s*flex-direction: column;\s*align-items: stretch;\s*padding: var\(--al-space-2xs\) var\(--al-space-3xs\);\s*\}/.test(stripModule));
check("the Console passes no identity: its bank renders the strips exactly as before, bound to the store (Task 3.1) with no identity snippet", /<TrackStrip track=\{trackStrip\(track\.id\)\} \/>/.test(consoleBank) && /<ReturnStrip ret=\{returnStripOf\(ret\.id\)\} live=\{returnLive\(ret\.id\)\} \/>/.test(consoleBank) && /<BusMasterStrip bus=\{busStripOf\(bus\.id\)\} live=\{busLive\(bus\.id\)\} \/>/.test(consoleBank) && !/identity/.test(consoleBank));
check("the strips still know nothing of the Mixer, Arrange or any tier (plan §3)", !/lib\/mixer|lib\/arrange|ScribbleSelect|combobox|<select|Prominence|prominence|tier/i.test(trackStrip + stripModule + returnStrip + busStrip));

// --- 5. One session: channels derived from the shared fixtures. ---------------
// Task 3.1: the session (lib/project/session.ts) seeds the ONE project from the
// Console's strip fixtures joined to the Arrange classification by code; the Mixer
// no longer derives a channel list of its own (lib/mixer.ts keeps only its vocabulary).
check("the project's tracks are seeded from the Console's TRACK_STRIPS joined to the Arrange classification by code (session.ts, Task 3.1)", /import \{[^}]*\bTRACK_STRIPS\b[^}]*\} from "\.\.\/\.\.\/components\/channel-strip\/track-strip-fixtures"/.test(session) && /import \{ ARRANGE_BAR_COUNT, ARRANGE_TRACKS, type ArrangeTrack \} from "\.\.\/arrange"/.test(session) && /ARRANGE_TRACKS\.find\(\(t\) => t\.code === strip\.id\)/.test(session) && /id: trackId\(strip\.id\),\s*code: strip\.id,/.test(session) && !/TRACK_STRIPS|ARRANGE_TRACKS|MIXER_TRACKS/.test(data));
check("the project's Returns are seeded from the Console's pinned RETURN_STRIPS, the bus from BUS_MASTERS (session.ts, Task 3.1)", /RETURN_STRIPS\.map\(/.test(session) && /id: returnBusId\(ret\.returnId\),\s*code: ret\.id,/.test(session) && /BUS_MASTERS\.map\(/.test(session) && /id: busId\(bus\.id\),\s*code: bus\.id,/.test(session) && !/RETURN_STRIPS|BUS_MASTERS|MIXER_RETURNS|MIXER_BUSES/.test(data));
check("the Phase 0 'Track NN' placeholders and the hand-written Return / bus list are gone", !/`Track \$\{code\}`|createTrackChannels|MIXER_BUS_AND_RETURN_CHANNELS|Reverb Return|Delay Return|"bus-master"/.test(data));
check("three channel kinds, in the Console bank's order: tracks, Returns, bus master (the store's `channels`); the first channel selected by default", /export type ChannelKind = "track" \| "return" \| "bus";/.test(model) && /export \{ channelKindLabel, type ChannelKind \} from "\.\/project\/model";/.test(data) && /get channels\(\): readonly Channel\[\] \{\s*return \[\.\.\.state\.tracks, \.\.\.state\.returns, \.\.\.state\.buses\];/.test(store) && /let selectedId = \$state<string>\(project\.channels\[0\]\?\.id \?\? ""\);/.test(room));
const returnCount = count(trackFixtures.match(/EFFECT_RETURNS: readonly EffectReturn\[\] = \[([\s\S]*?)\];/)?.[1] ?? "", /\{ id: "/g);
check("the shared return list holds several Returns and the bank renders one Return channel per entry, then the bus master (plan §8a)", returnCount >= 2 && /<aside[\s\S]*\{#each returns as channel \(channel\.id\)\}\s*<MixerReturnStrip \{channel\} selected=\{channel\.id === selectedId\} \{onselect\} \/>\s*\{\/each\}\s*\{#each buses as channel \(channel\.id\)\}\s*<MixerBusStrip \{channel\} selected=\{channel\.id === selectedId\} \{onselect\} \/>\s*\{\/each\}/.test(templateOf(bank)) && /const returns = \$derived\(project\.returns\);/.test(bank) && /const buses = \$derived\(project\.buses\);/.test(bank), `${returnCount} returns`);
check("the track rail renders one track channel per shared track, keyed by channel id", /<ol class="mbank__rail"[^>]*>\s*\{#each tracks as channel \(channel\.id\)\}\s*<MixerTrackStrip \{channel\} selected=\{channel\.id === selectedId\} \{onselect\} \/>\s*\{\/each\}\s*<\/ol>/.test(templateOf(bank)) && /const tracks = \$derived\(project\.tracks\);/.test(bank));
check("no name, colour, control value or classification is re-declared in the Mixer (nothing but the fixtures' own fields is read)", !/\bname: "|\borg: \d|\btrim: \d|\bpan: \d|\blevel: \d|familyId: "|sourceTypeId: "|\btier: "/.test(stripComments(mixerSources)) && !/\bname: "/.test(stripComments(data)));

// --- 6. Identity: prints, and SEL. -------------------------------------------
check("the track channel prints the family and the source type from the Arrange data (familyLabel, sourceType) — the role in the tooltip", /familyLabel\(channel\.familyId\)/.test(trackCh) && /sourceType\(channel\.sourceTypeId\)/.test(trackCh) && /kindPrint=\{family \?\? "No family"\}/.test(trackCh) && /sourcePrint=\{source\?\.label \?\? "Unspecified"\}/.test(trackCh) && /Role: \$\{theRole\.long\}/.test(trackCh));
check("family and source are engraved prints, not controls: the identity has no family or source select, no combobox, no input", count(templateOf(identity), /<EngravedLabel\b/g) === 2 && !/<ScribbleSelect|combobox|<select|<input|contenteditable/.test(stripComments(identity)) && count(mixerSources, /<ScribbleSelect\b/g) === 1);
check("SEL is the approved cap-labelled TactileSwitch with an amber lamp, named for the channel", /<TactileSwitch\s+variant="cap"\s+label="Sel"\s+lamp="amber"\s+bind:engaged=\{sel\}\s+onToggle=\{onSel\}\s+name=\{`Select \$\{channelName\}`\}\s*\/>/.test(identity) && count(templateOf(identity), /<TactileSwitch\b/g) === 1);
check("SEL is radio behaviour: the bound lamp state follows the room's selection and a press on the lit SEL keeps it lit", /let sel = \$state\(false\);\s*\$effect\(\(\) => \{\s*sel = selected;\s*\}\);/.test(identity) && /function onSel\(engaged: boolean\): void \{\s*if \(engaged\) onselect\(\);\s*else sel = true;\s*\}/.test(identity));
check("every channel kind gets the identity section — SEL on tracks, Returns and the bus master alike", [trackCh, returnCh, busCh].every((src) => /\{#snippet identity\(\)\}/.test(src) && count(templateOf(src), /<MixerIdentity\b/g) === 1));
check("Returns and the bus print their kind where a track prints its family, and keep blank lines where a track has its source / tier, for alignment (D2.4.4)", /kindPrint="Return"/.test(returnCh) && /sourcePrint=\{effectName\}/.test(returnCh) && /kindPrint="Bus master"/.test(busCh) && !/sourcePrint/.test(busCh) && !/control/.test(templateOf(returnCh) + templateOf(busCh)) && /\{:else\}\s*<span class="identity__blank" data-blank-line aria-hidden="true"><\/span>/.test(identity) && /\.identity__row--control \{\s*min-height: 1\.125rem;/.test(identity));
check("the identity rows carry their hooks (identity, kind print, source print, control, select) and the selected state", ["data-mixer-identity data-selected={selected}", "data-mixer-kind-print", "data-mixer-source-print", "data-mixer-identity-control", "data-mixer-select"].every((h) => identity.includes(h)) && /data-mixer-channel=\{channel\.id\}/.test(trackCh + returnCh + busCh) && /data-mixer-channel-kind="track"/.test(trackCh) && /data-mixer-channel-kind="return"/.test(returnCh) && /data-mixer-channel-kind="bus"/.test(busCh));

// --- 7. Prominence Tier and "needs confirmation". ----------------------------
check("the tier control is the approved ScribbleSelect with the three PROMINENCE_TIERS, the Arrange row's label, context and hook", /<ScribbleSelect\s+label="Prominence tier"\s+context=\{channel\.name\}\s+options=\{PROMINENCE_TIERS\}\s+value=\{tier\}\s+size="xs"\s+hook="tier"\s+title=\{tierTitle\}\s+onchoose=\{\(id\) => \(meta\.tier = id as ProminenceTier\)\}\s*\/>/.test(trackCh) && count(arrange.match(/PROMINENCE_TIERS: readonly TierOption\[\] = \[([\s\S]*?)\];/)?.[1] ?? "", /\{ id: "/g) === 3 && /DEFAULT_TIER: ProminenceTier = "supporting"/.test(arrange));
// Task 3.1: the tier and its confirmation are the track's in the project store, read
// and written through the store's `trackMeta` view (the Arrange row's binding).
check("the tier and its confirmation are the track's in the project store (trackMeta), the same the Arrange row binds — no strip-local copy (Task 3.1)", /const meta = \$derived\(trackMeta\(channel\.id\)\);/.test(trackCh) && /const tier = \$derived\(meta\.tier\);/.test(trackCh) && /const confirmed = \$derived\(meta\.tierConfirmed\);/.test(trackCh) && !/\$state/.test(trackCh) && /import \{ trackMeta, trackStrip \} from "\.\.\/\.\.\/lib\/project\/store\.svelte"/.test(trackCh));
check("the 'needs confirmation' state is the approved amber Lamp, lit until confirmed, with the state in its name and tooltip", /<Lamp lit=\{!confirmed\} color="amber" name=\{`Needs confirmation, \$\{channel\.name\}`\} \/>/.test(trackCh) && /data-tier-confirm-lamp/.test(trackCh) && /title=\{confirmed \? "Tier confirmed" : "Tier needs confirmation"\}/.test(trackCh) && /needs confirmation: choose a tier to confirm it/.test(trackCh));
check("the tier state is on the DOM for tests: data-track-tier and data-tier-confirmed", /data-track-tier=\{tier\}/.test(trackCh) && /data-tier-confirmed=\{confirmed\}/.test(trackCh));
check("arrange.ts: ArrangeTrack has the OPTIONAL tierConfirmed flag (absent = confirmed) and the fixture starts exactly 09 Bass Amp and 16 Vocal Double unconfirmed", /readonly tierConfirmed\?: boolean;/.test(arrange) && /"familyId" \| "sourceTypeId" \| "role" \| "tier" \| "tierConfirmed"/.test(arrange) && count(stripComments(arrange), /tierConfirmed: false/g) === 2 && /"09": \{[^}]*tier: "supporting", tierConfirmed: false \}/.test(arrange) && /"16": \{[^}]*tier: "supporting", tierConfirmed: false \}/.test(arrange) && !/tierConfirmed: true/.test(arrange));
check("the Arrange row does not draw the flag (D2.5.1 stands): it only seeds its own model with it (Task 3.1) and prints no lamp or attribute; the room never reads it", count(read("src/components/ArrangeTrackRow.svelte"), /tierConfirmed/g) === 2 && /tierConfirmed: track\.tierConfirmed !== false,/.test(read("src/components/ArrangeTrackRow.svelte")) && !/tierConfirmed/.test(templateOf(read("src/components/ArrangeTrackRow.svelte"))) && !/tierConfirmed/.test(read("src/rooms/ArrangeRoom.svelte")));
check("ScribbleSelect gained only the optional onchoose (default null) that fires on EVERY choice, after an unchanged onchange", /onchoose = null,/.test(select) && /onchoose\?: \(\(id: string\) => void\) \| null;/.test(select) && /function choose\(id: string\): void \{\s*if \(id !== value\) \{\s*value = id;\s*onchange\?\.\(id\);\s*\}\s*onchoose\?\.\(id\);\s*close\(\);\s*\}/.test(select) && count(stripComments(select), /onchoose/g) === 3);
check("no automatic classification: nothing in the Mixer derives a family, source, role or tier from a name or an analysis", !/classify|detect|infer|analy[sz]e|suggest\(|match\(/i.test(stripComments(mixerAndData)) && !/tier\s*=\s*(channel|track)\.name|sourceTypeId\s*=\s*/.test(mixerSources) && !/\.tier = (?!id as ProminenceTier\))/.test(mixerSources));
check("no numeric Priority override is drawn (plan §5a; the model stores the priority since Task 3.1 — the Mixer prints only its tier)", !/priority/i.test(stripComments(mixerSources)) && !/priority/i.test(templateOf(trackCh) + templateOf(bank) + templateOf(room)));

// --- 8. Selection is local UI state only. ------------------------------------
check("selection uses Svelte local state ($state) in the room — transient UI state outside the project store — derived into the store entity the panel receives (Task 3.1)", /let selectedId = \$state<string>\(project\.channels\[0\]\?\.id \?\? ""\);/.test(room) && /const selectedChannel = \$derived\(project\.channel\(selectedId\)\);/.test(room) && /function selectChannel\(id: string\): void \{\s*selectedId = id;\s*\}/.test(room) && !/selectedId|selection/.test(store));
check("the bank only passes the selection down and a SEL press up (no state of its own)", /let \{\s*selectedId,\s*onselect,\s*\}: \{\s*selectedId: string;\s*onselect: \(id: string\) => void;\s*\} = \$props\(\);/.test(bank) && !/\$state/.test(bank) && count(templateOf(bank), /selected=\{channel\.id === selectedId\} \{onselect\}/g) === 3);
check("no shared-store or persistence API is used by the Mixer", !/localStorage|sessionStorage|\$store\b|\bwritable\(|\breadable\(|\bderived\(.*store|setContext|getContext|fetch\(/.test(mixerAndData + detail));
check("the Mixer imports nothing from the Console or Arrange rooms or their row / lane components", !/import [^;]*(rooms\/(ConsoleRoom|ArrangeRoom)|ArrangeTrackRow|ArrangeTimeline|ChannelBank|meter-bridge|console-transport)/.test(mixerAndData));

// --- 9. Layout rules (D2.2.1 / D2.4.2). ----------------------------------------
const bankStyle = styleOf(bank);
const bankTemplate = templateOf(bank);
check("the tracks' rail is the ONLY horizontal scroller (outside column mode) and a focusable, labelled region", /\.mbank__tracks \{[^}]*overflow-x: auto;/s.test(stripComments(bankStyle).split("@media")[0]) && count(stripComments(bankStyle).split("@media")[0], /overflow-x: auto/g) === 1 && /data-mixer-bank-tracks\s+role="region"\s+tabindex="0"/.test(bankTemplate) && !/overflow-x:\s*auto|overflow:\s*auto/.test(stripComments(styleOf(room) + styleOf(trackCh) + styleOf(returnCh) + styleOf(busCh) + styleOf(identity)).replace(/\.mixer-layout \{[^}]*\}/s, "")));
check("the rail is a max-content row — strips are never compressed to fit", /\.mbank__rail \{[^}]*width: max-content;/s.test(bankStyle) && /\.mbank__pinned-row \{[^}]*width: max-content;/s.test(bankStyle) && !/\.(strip|module)\b|--strip-width|transform:\s*scale|zoom:/.test(stripComments([room, bank, trackCh, returnCh, busCh, identity].map(styleOf).join("\n"))));
check("the pinned block sits outside the scroller, after it, in the deck's own column (grid-area pinned)", /<\/div>\s*(<!--[\s\S]*?-->\s*)?<aside\s+class="mbank__pinned"\s+data-mixer-bank-pinned/.test(bankTemplate) && /\.mbank__pinned \{[^}]*grid-area:\s*pinned/s.test(bankStyle) && /"legend pinned-legend"\s*"tracks pinned"/.test(bankStyle));
check("column mode under 68.75rem (1100 px, D2.4.2): the pinned block moves under the rail and scrolls on its own only then", /@media \(width < 68\.75rem\) \{[\s\S]*"legend"\s*"tracks"\s*"pinned-legend"\s*"pinned"[\s\S]*\.mbank__pinned \{[^}]*overflow-x: auto/.test(bankStyle));
check("the identity extension keeps one height on every kind (fixed row minimums; the switch row is the cap's) so the controls line up across the bank", /\.identity__row--source \{\s*min-height: 1rem;/.test(identity) && /\.identity__row--control \{\s*min-height: 1\.125rem;/.test(identity) && !/(?<!min-)height:\s*\d/.test(stripComments(styleOf(identity))));
check("the bank's legends are engraved prints with the shared codes (Tracks first–last, Bus / Returns first–last)", /<EngravedLabel as="h2" id="mixer-channels-title" text="Channels" size="sm" \/>/.test(bankTemplate) && /text=\{`Tracks \$\{first\}\\u2013\$\{last\}`\}/.test(bankTemplate) && /<EngravedLabel as="p" text="Bus \/ Returns" size="xs" \/>/.test(bankTemplate) && /text=\{`\$\{firstPinned\}\\u2013\$\{lastPinned\}`\}/.test(bankTemplate));
check("no permanent explanatory text in the Mixer room or bank (tooltips only)", !/placeholder|Phase 0|No audio/.test(stripComments(templateOf(room) + bankTemplate)) && !/<p\b(?![^>]*aria-hidden)[^>]*>[^<{]*[a-z]{4,}\s+[a-z]{4,}/.test(bankTemplate + templateOf(room)));

// --- 10. Scope. -------------------------------------------------------------------
check("no screw heads in the Mixer (owner's standing rule, D2.1.9)", !/(class=["'{][^"'}]*screw|\.[\w-]*screw[\w-]*\s*[{,:]|data-[\w-]*screw|__screw)/i.test(mixerAndData));
check("no audio, DSP, routing or timing API in the Mixer", !/AudioContext|AudioParam|Analyser|AudioBuffer|requestAnimationFrame|setInterval|setTimeout|Math\.random|performance\.now|Date\.now|\.mp3|\.wav|Waveform/i.test(mixerAndData));
check("no meter bridge or transport in the Mixer", !/meter-bridge|data-console-zone|MiniTransport|data-mini-transport/.test(room));
check("the detail panel is skinned with the design tokens (Task 2.8 replaced the Task 0.5 placeholder)", /var\(--al-/.test(detail));
check("no dependency added or changed", !("dependencies" in pkg) && JSON.stringify(Object.keys(pkg.devDependencies).sort()) === JSON.stringify(["@sveltejs/vite-plugin-svelte", "@types/node", "svelte", "svelte-check", "typescript", "vite", "vite-plugin-singlefile"]));
check("check:mixer is wired into package.json", pkg.scripts?.["check:mixer"] === "node scripts/check-mixer-structure.mjs");
// Approved files the Mixer builds on and must not have changed (Console and
// Arrange untouched; the detail panel untouched until 2.9). The four strips
// and the select changed by exactly the additions above and are pinned at
// their Task 2.7 state by this and the other guards.
const pinned = {
  "src/components/ChannelBank.svelte": "92ef29ee45bd7aa99e9d45138aa1e6001e8c441d3c5d1dc0d7ab798029277c8e",
  "src/rooms/ConsoleRoom.svelte": "ab8450a981b9ef4a8fbf4382e225994340f7be2936dbdafb3ddd402b16af6645",
  "src/components/MixerDetailPanel.svelte": "5139693f9b7df182e4a65b62fc7138fb6d1eaaeb295fa25f67446f440e94b299",
  "src/components/ArrangeTrackRow.svelte": "fecd6b7f94e833759d6ac4ebbb155995c771ec0bf75bbfe971913a9dab4e7fde",
  "src/rooms/ArrangeRoom.svelte": "0cb5ef123eac14d9124f3d26aa0bb33f7d2f01d923fa0888a437e31d93f8a2df",
  "src/components/channel-strip/SendSlot.svelte": "67dbb6647329fc2354fae93b8e822c6df03e82e8674169a6a2e8ca3f2f009a60",
  "src/components/channel-strip/track-strip-fixtures.ts": "12620cb066dab631e521cf73bfedfef4ae7c2a72bb1b6fb84989742b89a68d46",
  "src/components/channel-strip/bus-return-fixtures.ts": "551fa3fc978362f3f7e48cb1a81110fa2b2ba09d4a3886630a02dc3594df1b1e",
  "src/components/hardware/TactileSwitch.svelte": "9f8a61ff521988aff708ba7e860854c441343525c0eb43b11e92a534ce1a2ba9",
  "src/components/hardware/Lamp.svelte": "024d907589c1ab33b2b3c5cc8840347b9779450b61a60f67c34b045d4ac8010a",
  "src/components/hardware/EngravedLabel.svelte": "230ebcd7cf810d3096953e5131cb9cb3a89dd83f9f0e9cc0bcd934d2ca74fc29",
};
for (const [rel, hash] of Object.entries(pinned)) {
  check(`approved file untouched: ${rel}`, exists(rel) && sha256(read(rel)) === hash, exists(rel) ? `sha256 ${sha256(read(rel)).slice(0, 16)}…` : "missing");
}

// --- Report. -------------------------------------------------------------
for (const name of passes) console.log(`  PASS  ${name}`);

if (failures.length > 0) {
  console.error("");
  for (const failure of failures) console.error(`  FAIL  ${failure}`);
  console.error("");
  console.error(`Mixer structural contract check — ${passes.length}/${passes.length + failures.length} passed`);
  process.exit(1);
}

console.log("");
console.log(`Mixer structural contract check — ${passes.length}/${passes.length} passed`);
