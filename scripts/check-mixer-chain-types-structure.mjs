#!/usr/bin/env node
/**
 * Mixer chain-type-aware detail structural contract check — Task 2.9.
 *
 * Dependency-free guard (Node built-ins only). It does NOT test geometry —
 * that was measured in a real browser (see task-reports/2.9-report.md and
 * evidence/mixer/2.9/) — it tests the source-level contract:
 *
 *   1. The panel branches by channel kind (plan §3: the detail "renders
 *      differently depending on whether the selected channel is a track, a
 *      regular bus, or a Return bus — never one universal layout"): the
 *      Task 2.8 track chain, a Return chain (ReturnDetail), a bus chain
 *      (BusDetail), and an explicit empty state for no selection. No strip
 *      is rendered in the panel; the 2.8 track branch is intact.
 *   2. The Return (plan §8a): ONE chain state per Return, shared between the
 *      Mixer's Return strip and the panel through `ReturnStrip`'s optional
 *      `live` binding (the Console passes nothing); the controls are the
 *      plan's — character / algorithm (Room · Hall · Plate; Tape · Analogue
 *      · Digital, fixture selections), decay or delay time, pre-delay or
 *      feedback, tone / damping, bypass — on green chain knobs with the
 *      Task 2.8 ownership rules; the Return's output level stays on the
 *      strip fader; the Return's input is a read-only list of the tracks
 *      sending to it, from the track fixtures.
 *   3. The bus (plan §8 bus and master path): the same EQ and compressor
 *      modules as a track (reused components, gentle bus fixtures, no
 *      dynamic band, no cleanup, no sends) and a final output stage shown as
 *      a status only — transparent peak protection, not engaged — with no
 *      limiter, loudness or mastering control anywhere.
 *   4. The rail is generalised to blocks each chain model provides, in
 *      signal order, lamps from state only; nothing reorders or routes.
 *   5. Scope: fixtures only — no DSP, audio, analysis, persistence,
 *      timers, randomness or dependency change; no screws; Task 2.8 files
 *      and the approved hardware untouched (pins).
 *
 * Run: npm run check:mixer-chain-types
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

const FILES = {
  panel: "src/components/MixerDetailPanel.svelte",
  rail: "src/components/mixer/ProcessingChain.svelte",
  returnDetail: "src/components/mixer/ReturnDetail.svelte",
  busDetail: "src/components/mixer/BusDetail.svelte",
  effect: "src/components/mixer/EffectSection.svelte",
  sendsIn: "src/components/mixer/SendsIn.svelte",
  returnCh: "src/components/mixer/MixerReturnStrip.svelte",
  returnStrip: "src/components/channel-strip/ReturnStrip.svelte",
  live: "src/components/channel-strip/return-live.ts",
  returnChain: "src/lib/return-chain.ts",
  busChain: "src/lib/bus-chain.ts",
  store: "src/lib/project/store.svelte.ts", // Task 3.1: the one project store (the Returns' shared state lives here now)
  model: "src/lib/mixer-chain.ts",
  knob: "src/components/mixer/ChainKnob.svelte",
};
for (const rel of Object.values(FILES)) check(`file exists: ${rel}`, exists(rel));
if (failures.length) {
  for (const f of failures) console.error(`  FAIL  ${f}`);
  process.exit(1);
}

const S = Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, read(rel)]));
const T = Object.fromEntries(Object.entries(S).map(([k, src]) => [k, rel(k) ? templateOf(src) : src]));
function rel(k) {
  return FILES[k].endsWith(".svelte");
}
const code = Object.fromEntries(Object.entries(S).map(([k, src]) => [k, stripComments(rel(k) ? scriptOf(src) : src)]));
const newFiles = [S.returnDetail, S.busDetail, S.effect, S.sendsIn, S.live, S.returnChain, S.busChain].join("\n");
const newCode = [code.returnDetail, code.busDetail, code.effect, code.sendsIn, code.live, code.returnChain, code.busChain].join("\n");
const everything = newFiles + "\n" + S.panel + "\n" + S.rail + "\n" + S.returnCh + "\n" + S.returnStrip + "\n" + S.model;
const everythingCode = newCode + "\n" + [code.panel, code.rail, code.returnCh, code.returnStrip, code.model].join("\n") + "\n" + [T.panel, T.rail, T.returnDetail, T.busDetail, T.effect, T.sendsIn, T.returnCh, T.returnStrip].map(stripComments).join("\n");

// --- 1. The panel branches by channel kind (plan §3). -------------------------------
check("the panel keeps the 2.8 track branch: per-track chains, EQ + compressor bays, what-changed", /\{#if track && chain\}/.test(T.panel) && /<EqSection eq=\{chain\.eq\} trackName=\{track\.name\} \/>/.test(T.panel) && /<CompressorSection comp=\{chain\.comp\} trackName=\{track\.name\} \/>/.test(T.panel) && /<WhatChanged notes=\{chain\.notes\} trackName=\{track\.name\} \/>/.test(T.panel));
// Task 3.1: the Return's and the bus's chains are parts of their entities in the
// project store (`ReturnBus.chain`, `Bus.chain`); the panel renders the selected
// entity and holds no chain state of its own.
check("a Return renders ReturnDetail with the Return entity (its SHARED chain, now in the project store), a bus renders BusDetail with the bus entity (Task 3.1)", /import \{ returnCharacter \} from "\.\.\/lib\/return-chain";/.test(S.panel) && /import \{ project \} from "\.\.\/lib\/project\/store\.svelte";/.test(S.panel) && /const theReturn = \$derived\(channel\?\.kind === "return" \? channel : undefined\);/.test(S.panel) && /const bus = \$derived\(channel\?\.kind === "bus" \? channel : undefined\);/.test(S.panel) && /\{:else if theReturn\}\s*(?:<!--[\s\S]*?-->\s*)?<ReturnDetail ret=\{theReturn\} \/>/.test(T.panel) && /\{:else if bus\}\s*(?:<!--[\s\S]*?-->\s*)?<BusDetail \{bus\} \/>/.test(T.panel));
check("bus chains are created once per bus into the project (session.ts: createBusChainState), like the track and Return chains — the panel holds no chain state (Task 3.1)", /chain: createBusChainState\(bus\.id\),/.test(read("src/lib/project/session.ts")) && /chain: createReturnChainState\(ret\),/.test(read("src/lib/project/session.ts")) && !/\$state/.test(S.panel) && /export function createBusChainState\(code: string\): BusChainState/.test(code.busChain));
check("the empty state remains for no selection, and for any kind without a chain — never a blank bay", /\{:else if channel\}\s*(?:<!--[\s\S]*?-->\s*)?<div class="detail__empty" role="status" data-detail-empty>/.test(T.panel) && /\{:else\}\s*<div class="detail__empty" role="status" data-detail-empty>/.test(T.panel) && /Select a channel in the bank to inspect it/.test(T.panel));
check("the panel's support hook covers all three kinds", /data-detail-supported=\{supported\}/.test(T.panel) && /const supported = \$derived\(track !== undefined \|\| theReturn !== undefined \|\| bus !== undefined\);/.test(S.panel));
check("the shared identity header carries kind-specific facts: Return = effect · live character, input send count, chain state; bus = output and peak-protection status", /data-detail-return-effect=\{theReturn\.effect\} data-detail-return-character=\{theReturn\.chain\.character\.value\}/.test(T.panel) && /text=\{`\$\{returnEffect\} \\u00b7 \$\{returnCharacterName\}`\}/.test(T.panel) && /data-detail-return-sends=\{returnSendCount\}/.test(T.panel) && /const returnSendCount = \$derived\(theReturn \? project\.sendsInto\(theReturn\.id\)\.length : 0\);/.test(S.panel) && /text=\{theReturn\.chain\.bypassed \? "Bypassed" : "In circuit"\}/.test(T.panel) && /data-detail-bus-output=\{busOutput\}/.test(T.panel) && /const busOutput = \$derived\(bus \? project\.outputLabel\(bus\.output\) : null\);/.test(S.panel) && /text=\{`Output \\u2192 \$\{busOutput\}`\}/.test(T.panel) && /data-detail-bus-peak=\{bus\.chain\.peakProtection\.engaged\}/.test(T.panel) && /text=\{bus\.chain\.peakProtection\.engaged \? "Engaged" : "Not engaged"\}/.test(T.panel));
check("the panel renders no channel strip and no track-only control for a Return or a bus", !/ReturnStrip|BusMasterStrip|TrackStrip|SendSlot/.test(S.panel) && count(T.panel, /<EqSection\b/g) === 1 && count(T.panel, /<CompressorSection\b/g) === 1 && !/<ReturnDetail[^>]*eq=|<BusDetail[^>]*effect=/.test(T.panel));
check("the panel's housing, header hooks and 2.8 regions are unchanged", /data-mixer-region="detail-panel"/.test(T.panel) && /data-mixer-region="selection"/.test(T.panel) && /id="mixer-detail-title"/.test(T.panel) && /data-mixer-region="eq-graph"/.test(T.panel) && /data-mixer-region="compressor"/.test(T.panel) && /data-mixer-region="what-changed"/.test(T.panel) && /--dt-cheek: 0\.875rem;/.test(styleOf(S.panel)) && /align-self: flex-start;/.test(styleOf(S.panel)));
check("the panel still takes the room's selected channel — since Task 3.1 the project entity the room looks up in the store (selection stays the room's local UI state)", /let \{ channel \}: \{ channel: Channel \| undefined \} = \$props\(\);/.test(S.panel) && /const selectedChannel = \$derived\(project\.channel\(selectedId\)\);/.test(read("src/rooms/MixerRoom.svelte")) && /<MixerDetailPanel channel=\{selectedChannel\} \/>/.test(read("src/rooms/MixerRoom.svelte")));

// --- 2. The Return (plan §8a). --------------------------------------------------------
const R = code.returnChain;
// Task 3.1: the one chain per Return is the Return entity's, created once from its
// fixture when the session seeds the project (`$state` in the store's .svelte.ts module);
// return-chain.ts is pure (types, fixtures, rail, character ops) and holds no state.
check("one chain state per Return, created from its fixture once into the project (ReturnBus.chain in the `$state` project of store.svelte.ts) and kept for the life of the app; return-chain.ts holds no state", /export function createReturnChainState\(ret: ReturnStripFixture\): ReturnChainState/.test(R) && !/\$state|new Map/.test(R) && /readonly chain: ReturnChainState;/.test(read("src/lib/project/model.ts")) && // Task 9.1.2: the store boots EMPTY; the Return fixtures still build the chain when the
  // session is loaded into the store (tests/fixture-session.mjs), which is what this guards.
  /const state: Project = \$state\(createEmptyProject\([^)]*\)\);/ .test(code.store) && FILES.returnChain.endsWith("return-chain.ts") && FILES.store.endsWith(".svelte.ts"));
const ST = code.store;
check("the strip-side view (`returnLive`, now in the store) reads the chain and writes through the ownership rule — a turned knob is Manual, a same-value write is not a turn, bypass is plain state (clamped to the control's range, Task 3.1)", /export function returnLive\(id: ReturnBusId\): ReturnLive/.test(ST) && /get time\(\) \{\s*return chain\.time\.value;\s*\}/.test(ST) && /set time\(v: number\) \{\s*const next = clamp\(v, params\.time\);\s*if \(next !== chain\.time\.value\) setParamValue\(chain\.time, next\);\s*\}/.test(ST) && /set second\(v: number\) \{\s*const next = clamp\(v, params\.second\);\s*if \(next !== chain\.second\.value\) setParamValue\(chain\.second, next\);\s*\}/.test(ST) && /set tone\(v: number\) \{\s*const next = clamp\(v, TONE_PARAM\);\s*if \(next !== chain\.tone\.value\) setParamValue\(chain\.tone, next\);\s*\}/.test(ST) && /get bypass\(\) \{\s*return chain\.bypassed;\s*\},\s*set bypass\(on: boolean\) \{\s*ops\.setReturnBypass\(id, on\);\s*\},/.test(ST) && /setReturnBypass\(id: ReturnBusId, on: boolean\): void \{\s*const r = mustReturn\(id\);\s*if \(r\.chain\.bypassed !== on\) r\.chain\.bypassed = on;\s*\}/.test(ST) && /get character\(\) \{\s*const c = returnCharacter\(chain\.effect, chain\.character\.value\);\s*return \{ print: c\.print, name: c\.name \};\s*\}/.test(ST));
check("the live view is memoised per Return so the strip's prop identity is stable", /const returnLives = new Map<ReturnBusId, ReturnLive>\(\);/.test(ST) && /let view = returnLives\.get\(id\);\s*if \(view\) return view;/.test(ST) && /returnLives\.set\(id, view\);/.test(ST));
check("the Return's parameter specs are the strip's own ranges (bus-return-fixtures.ts), so strip and panel knobs agree step for step", /import \{\s*DECAY_PARAM,\s*DELAY_TIME_PARAM,\s*FEEDBACK_PARAM,\s*PREDELAY_PARAM,\s*TONE_PARAM,/.test(R) && /function specOf\(p: ReturnParam, name: string\): ParamSpec \{\s*return \{\s*id: p\.id,\s*label: p\.legend,\s*name,\s*taper: "linear",\s*min: p\.min,\s*max: p\.max,\s*step: p\.step,\s*detents: 0,\s*values: \[\],\s*extremes: p\.extremes,\s*format: p\.format,\s*\};\s*\}/.test(R) && /decay: specOf\(DECAY_PARAM, "Decay"\),\s*predelay: specOf\(PREDELAY_PARAM, "Pre-delay"\),\s*time: specOf\(DELAY_TIME_PARAM, "Delay time"\),\s*feedback: specOf\(FEEDBACK_PARAM, "Feedback"\),\s*tone: specOf\(TONE_PARAM, "Tone \/ damping"\),/.test(R));
check("characters are the owner's lists — Reverb: Room · Hall · Plate; Delay: Tape · Analogue · Digital — fixture selections, no algorithm claimed", /reverb: \[\s*\{ id: "room", name: "Room", print: "ROOM" \},\s*\{ id: "hall", name: "Hall", print: "HALL" \},\s*\{ id: "plate", name: "Plate", print: "PLATE" \},\s*\],/.test(R) && /delay: \[\s*\{ id: "tape", name: "Tape echo", print: "TAPE" \},\s*\{ id: "analog", name: "Analogue", print: "ANALOG" \},\s*\{ id: "digital", name: "Digital", print: "DIGITAL" \},\s*\],/.test(R) && !/convolution|impulse|algorithm model|emulat/i.test(R));
check("choosing a character makes the character Manual and touches nothing else", /export function setReturnCharacter\(chain: ReturnChainState, id: ReturnCharacterId\): void \{\s*chain\.character\.value = id;\s*chain\.character\.mode = "manual";\s*\}/.test(R));
check("the Return's ownership is the 2.8 model: character + three ChainParams, module mode via moduleMode", /export function returnOwned\(chain: ReturnChainState\): \(ChainParam \| CharacterParam\)\[\] \{\s*return \[chain\.character, \.\.\.returnParams\(chain\)\];\s*\}/.test(R) && /export function returnMode\(chain: ReturnChainState\): ModuleMode \{\s*return moduleMode\(returnOwned\(chain\)\.map\(\(p\) => p\.mode\)\);\s*\}/.test(R) && /return \[chain\.time, chain\.second, chain\.tone\];/.test(R));
check("the Return's input is read from the project's tracks' send slots (plan §8a: incoming sends) — a live selector in the store, nothing else (Task 3.1)", /sendsInto\(returnId: ReturnBusId\): SendInto\[\] \{\s*const out: SendInto\[\] = \[\];\s*for \(const track of state\.tracks\) \{\s*const send = track\.channel\.sends\.find\(\(s\) => s\.to === returnId\);\s*if \(send\) out\.push\(\{ code: track\.code, name: track\.name, level: send\.level \}\);\s*\}\s*return out;\s*\}/.test(ST) && !/sendsInto|TRACK_STRIPS/.test(R));
check("the Return rail: sends in → reverb / delay → tone / damping → Return level (strip) → output → Master; effect and tone dark while bypassed", /id: "sends-in",\s*step: "01",\s*label: "Sends in",/.test(R) && /\{ id: "effect", step: "02", label: effectLabel, engaged: !chain\.bypassed, home: "panel" \},\s*\{ id: "tone", step: "03", label: "Tone \/ damping", engaged: !chain\.bypassed, home: "panel" \},\s*\{ id: "level", step: "04", label: "Return level", engaged: true, home: "strip" \},\s*\{ id: "output", step: "05", label: "Output \\u2192 Master", engaged: true, home: "fixture", status: "routed to Master" \},/.test(R));
check("Return fixtures: R1 all Auto; R2 tone Manual (loaded +2); R3 time Manual (loaded 350 ms); authored notes for each; bypass from the strip fixture", /room: \{\s*notes: \[/.test(R) && /plate: \{\s*manual: \{ tone: 2 \},/.test(R) && /delay1: \{\s*manual: \{ time: 350 \},/.test(R) && count(R, /note\("effect",/g) === 3 && count(R, /note\("tone",/g) === 3 && count(R, /note\("output",/g) === 3 && /bypassed: ret\.bypass,/.test(R));
check("the loaded character comes from the strip fixture's print; time / second / tone from the fixture values through the 2.8 constructor", /const loaded = RETURN_CHARACTERS\[ret\.effect\]\.find\(\(c\) => c\.print === ret\.character\.print\)\?\.id \?\? RETURN_CHARACTERS\[ret\.effect\]\[0\]\.id;/.test(R) && /time: chainParam\(specs\.time, ret\.time, manual\.time\),\s*second: chainParam\(specs\.second, ret\.second, manual\.second\),\s*tone: chainParam\(RETURN_SPECS\.tone, ret\.tone, manual\.tone\),/.test(R));

// ReturnStrip's optional binding and the Mixer's use of it.
check("ReturnStrip gains ONE optional prop, `live` (default null), typed by the shape in return-live.ts; the approved template binds its knobs, window and BYPASS to `model = live ?? own`", /live = null,/.test(S.returnStrip) && /live\?: ReturnLive \| null/.test(S.returnStrip) && /const model = \$derived\(live \?\? own\);/.test(S.returnStrip) && count(T.returnStrip, /bind:value=\{\(\) => model\.(time|second|tone), \(v\) => \(model\.\1 = v\)\}/g) === 3 && /bind:engaged=\{\(\) => model\.bypass, \(on\) => \(model\.bypass = on\)\}/.test(T.returnStrip) && /data-return-character=\{model\.character\.print\}/.test(T.returnStrip));
check("without `live` the strip's settings are its own, seeded once from the fixture (the playground); since Task 3.1 the Console binds `live` too, so both rooms turn one value", /const own = \$state<ReturnLive>\(\{\s*time: ret\.time,\s*second: ret\.second,\s*tone: ret\.tone,\s*bypass: ret\.bypass,\s*character: \{ print: ret\.character\.print, name: ret\.character\.name \},\s*level: ret\.level,\s*mute: ret\.mute,\s*solo: ret\.solo,\s*\}\);/.test(S.returnStrip) && /<ReturnStrip ret=\{returnStripOf\(ret\.id\)\} live=\{returnLive\(ret\.id\)\} \/>/.test(read("src/components/ChannelBank.svelte")) && !/live=/.test(read("src/rooms/ConsoleRoom.svelte")) && !/live=/.test(read("src/dev/PinnedStripFixture.svelte")));
check("return-live.ts is a shape only (time, second, tone, bypass, character; level, mute, solo since Task 3.1) — no state, no fixture, no model", /export interface ReturnLive \{\s*time: number;\s*second: number;\s*tone: number;\s*bypass: boolean;\s*readonly character: \{ readonly print: string; readonly name: string \};\s*level: number;\s*mute: boolean;\s*solo: boolean;\s*\}/.test(stripComments(S.live).replace(/\n\s*\n/g, "\n")) && !/import|function|\$state/.test(code.live));
check("the Mixer's Return channel binds its strip to the Return's shared state (the store's `returnLive`) and speaks the live character in its identity", /import \{ returnLive, returnStripOf \} from "\.\.\/\.\.\/lib\/project\/store\.svelte";/.test(S.returnCh) && /const live = \$derived\(returnLive\(channel\.id\)\);/.test(S.returnCh) && /const ret = \$derived\(returnStripOf\(channel\.id\)\);/.test(S.returnCh) && /<ReturnStrip \{ret\} \{live\}>/.test(T.returnCh) && /sourceTitle=\{`Effect: \$\{effectName\} \\u00b7 \$\{live\.character\.name\}`\}/.test(T.returnCh));
check("the Mixer's Return channel is otherwise the approved 2.7 wrapper (identity snippet, SEL, one ReturnStrip)", count(T.returnCh, /<ReturnStrip\b/g) === 1 && /\{#snippet identity\(\)\}/.test(T.returnCh) && /kindPrint="Return"/.test(T.returnCh) && /onselect=\{\(\) => onselect\(channel\.id\)\}/.test(T.returnCh));

// The effect module.
const E = T.effect;
check("EffectSection is a chain module with the 2.8 hooks: data-chain-module=effect, bypassed and mode state, the effect kind", /<section\s+class="fx"\s+data-chain-module="effect"\s+data-return-effect=\{chain\.effect\}\s+data-module-bypassed=\{chain\.bypassed\}\s+data-module-mode=\{mode\}\s+aria-labelledby="mixer-effect-title"\s*>/.test(E));
check("the module's header: Reverb / Delay title, Auto / Manual status with ALL switches over the owned set, and BYPASS bound to the shared state", /<EngravedLabel text=\{effectTitle\} size="md" tone="bright" as="h3" id="mixer-effect-title" \/>/.test(E) && /<AutoManualControls \{params\} module=\{effectTitle\} \{mode\} \/>/.test(E) && /const params = \$derived\(returnOwned\(chain\)\);/.test(S.effect) && /const mode = \$derived\(returnMode\(chain\)\);/.test(S.effect) && /<div class="fx__bypass" data-module-bypass>\s*<TactileSwitch\s+variant="panel"\s+label="Bypass"\s+lamp="amber"\s+bind:engaged=\{\(\) => chain\.bypassed, \(on\) => \(chain\.bypassed = on\)\}/.test(E));
check("CHARACTER is the approved ScribbleSelect over the effect's own list, choosing through setReturnCharacter, with MODE and a \"was …\" ghost", /<ScribbleSelect\s+label="Character"\s+context=\{returnName\}\s+options=\{RETURN_CHARACTERS\[chain\.effect\]\}\s+bind:value=\{\(\) => chain\.character\.value, \(id\) => setReturnCharacter\(chain, id as ReturnCharacterId\)\}\s+size="sm"\s+hook="character"/.test(E) && /data-effect-character=\{chain\.character\.value\}/.test(E) && /data-chain-ghost-text=\{charChanged \? name\(chain\.character\.original\) : null\}/.test(E) && /text=\{`was \$\{name\(chain\.character\.original\)\}`\}/.test(E) && /bind:engaged=\{\(\) => charManual, \(on\) => setMode\(chain\.character, on \? "manual" : "auto"\)\}/.test(E));
check("the Return's three parameters are green chain knobs (spec §5: sends, auxiliary paths, reverb / delay) — decay or time, pre-delay or feedback, tone — and nothing more", /<ChainKnob param=\{chain\.time\} family="green" context=\{effectTitle\} \/>\s*<ChainKnob param=\{chain\.second\} family="green" context=\{effectTitle\} \/>\s*<ChainKnob param=\{chain\.tone\} family="green" context=\{effectTitle\} \/>/.test(E) && count(E, /<ChainKnob\b/g) === 3 && count(E, /<Knob\b/g) === 0);
check("the Return's output level is NOT duplicated in the panel (it is the strip's fader) and no track-only control appears in the module", !/Fader|level|EqGraph|EqSection|CompressorSection|VUMeter|SendSlot/.test(code.effect + stripComments(T.effect)));
check("the character tooltip says it is a fixture selection with no algorithm modelled", /\(a fixture selection; no algorithm is modelled\)/.test(S.effect));
check("the module's plate layout is the compressor bay's (header, character column, knob tray)", /\.fx__character \{[^}]*width: 6\.5rem;/s.test(styleOf(S.effect)) && /\.fx__knobs \{[^}]*display: flex;/s.test(styleOf(S.effect)) && /\.fx__body \{[^}]*flex-wrap: wrap;/s.test(styleOf(S.effect)));

// The Return's input.
const SI = T.sendsIn;
check("SendsIn is a read-only readout: an ordered list of tracks sending to the Return, code · name · level, no control of any kind", /<section class="si" data-sends-in data-send-count=\{sends\.length\} aria-labelledby="mixer-sends-in-title">/.test(SI) && /<ol class="si__list" aria-label=\{`Tracks sending to \$\{returnName\}`\}>/.test(SI) && /\{#each sends as s \(s\.code\)\}/.test(SI) && /<li class="si__row" data-send-from=\{s\.code\}/.test(SI) && /<span class="si__level">\{formatSend\(s\.level\)\}<\/span>/.test(SI) && !/<button|<input|<select|bind:|Knob|SendSlot|onclick|onpointer|onkeydown/.test(code.sendsIn + stripComments(T.sendsIn)));
check("the send levels print with the strips' own send formatter (OFF at the bottom, signed whole dB) in the green send ink, mono, in a recess — nothing glows", /import \{ formatSend \} from "\.\.\/channel-strip\/track-strip-fixtures";/.test(S.sendsIn) && /\.si__level \{[^}]*color: var\(--al-function-green-hi\);/s.test(styleOf(S.sendsIn)) && /\.si__level \{[^}]*font-family: var\(--al-font-mono\);/s.test(styleOf(S.sendsIn)) && /\.si__level \{[^}]*background: var\(--al-material-recess\);/s.test(styleOf(S.sendsIn)) && !/text-shadow|filter:\s*drop-shadow|glow/.test(stripComments(styleOf(S.sendsIn))));
check("the list says where a send is edited (the track strip) and has an explicit empty row", /set on the track strip/.test(SI) && /No track sends to this Return\./.test(SI));

// ReturnDetail composition.
const RD = T.returnDetail;
check("ReturnDetail = rail (returnRailBlocks) + Sends in plate + Effect plate + What changed; no EQ / compressor / pan / sends bay", /<ProcessingChain \{blocks\} \/>/.test(RD) && /const chain = \$derived\(ret\.chain\);/.test(S.returnDetail) && /const sends = \$derived\(project\.sendsInto\(ret\.id\)\);/.test(S.returnDetail) && /const blocks = \$derived\(returnRailBlocks\(chain, sends\.length\)\);/.test(S.returnDetail) && /data-mixer-region="processing-chain"/.test(RD) && /data-mixer-region="sends-in"/.test(RD) && /data-mixer-region="effect"/.test(RD) && /data-mixer-region="what-changed"/.test(RD) && /<SendsIn \{sends\} returnName=\{ret\.name\} \/>/.test(RD) && /<EffectSection \{chain\} returnName=\{ret\.name\} \/>/.test(RD) && /<WhatChanged notes=\{chain\.notes\} trackName=\{ret\.name\} \/>/.test(RD) && !/EqSection|CompressorSection|eq-graph|compressor/.test(code.returnDetail + stripComments(T.returnDetail)));
check("ReturnDetail's plates are the panel's bays value for value (plate recipe, flex-wrap, flex-start), each its content's width", /\.rd__bays \{[^}]*flex-wrap: wrap;[^}]*align-items: flex-start;/s.test(styleOf(S.returnDetail)) && /\.rd__bay \{[^}]*background-color: color-mix\(in srgb, var\(--al-material-surface-raised\) 60%, var\(--al-material-panel\)\);/s.test(styleOf(S.returnDetail)) && /\.rd__bay--sends \{\s*flex: 0 1 17rem;\s*\}/.test(styleOf(S.returnDetail)) && /\.rd__bay--effect \{\s*flex: 0 1 auto;\s*\}/.test(styleOf(S.returnDetail)));

// --- 3. The bus (plan §8). ------------------------------------------------------------
const BC = code.busChain;
check("the bus chain reuses the 2.8 EQ and compressor state (EqState / CompState, the same specs, the same constructor) — no new parameter kinds", /import \{\s*COMP_ATTACK,\s*COMP_MAKEUP,\s*COMP_RATIO,\s*COMP_RELEASE,\s*COMP_THRESHOLD,\s*EQ_BANDS,\s*EQ_FREQ,\s*EQ_GAIN,\s*EQ_Q,\s*chainParam,/.test(BC) && /readonly eq: EqState;\s*readonly comp: CompState;/.test(BC) && /freq: chainParam\(EQ_FREQ, freq, undefined\),\s*gain: chainParam\(EQ_GAIN, gain, undefined\),\s*q: band\.kind === "bell" \? chainParam\(EQ_Q, q \?\? 1, undefined\) : null,/.test(BC));
check("no dynamic band, no cleanup, no sends on a bus (none is in the plan for a bus)", /dynamicDepthDb: null,/.test(BC) && !/dynamicDepthDb: [^n]/.test(BC) && !/cleanup|sends|SendSlot/.test(BC));
check("the bus rail (plan §8): bus trim (strip) → static multiband EQ → compressor → balance (strip) → bus fader (strip) → output → peak protection, in that order", /\{ id: "trim", step: "01", label: "Bus trim", engaged: true, home: "strip" \},\s*\{ id: "eq", step: "02", label: "Static multiband EQ", engaged: !chain\.eq\.bypassed, home: "panel" \},\s*\{ id: "comp", step: "03", label: "Compressor", engaged: !chain\.comp\.bypassed, home: "panel" \},\s*\{ id: "balance", step: "04", label: "Balance", engaged: true, home: "strip" \},\s*\{ id: "fader", step: "05", label: "Bus fader", engaged: true, home: "strip" \},\s*\{ id: "output", step: "06", label: `Output \\u2192 \$\{output\}`, engaged: true, home: "fixture", status: `routed to \$\{output\}` \},/.test(BC) && /export function busRailBlocks\(chain: BusChainState, output: string\): RailBlock\[\]/.test(BC) && /id: "peak",\s*step: "07",\s*label: "Peak protection",\s*engaged: chain\.peakProtection\.engaged,\s*home: "fixture",\s*status: chain\.peakProtection\.text,/.test(BC));
check("the final output stage is a STATUS only — transparent peak protection, not engaged in the fixture — with no control, no limiter, no loudness target, no mastering", /readonly peakProtection: \{ readonly engaged: boolean; readonly text: string \};/.test(BC) && /peakEngaged: false,/.test(BC) && /peakText: "not engaged \(the mix leaves headroom\)",/.test(BC) && !/limiter|ceiling|LUFS|loudness(?!\s+maximi)|maximizer|maximiser|masteringChain|threshold: -1\b/i.test(everythingCode.replace(/no loudness maximisation|loudness maximization|nothing is maximised/gi, "")));
check("B1 Mix Bus: gentle glue fixtures — LF 80 Hz +0.5, LMF 300 Hz −1 Q 1, HMF 3 kHz 0, HF 12 kHz +1; Vari-Mu 1.5:1, −20 dB, 30 ms, 300 ms, +0.5 make-up, 1 dB GR; output Master; all Auto", /B1: \{\s*bands: \{ lf: \[80, 0\.5\], lmf: \[300, -1, 1\], hmf: \[3000, 0, 1\], hf: \[12000, 1\] \},\s*character: "varimu",\s*comp: \[-20, 1\.5, 30, 300, 0\.5\],\s*gainReductionDb: 1,\s*peakEngaged: false,/.test(BC) && /output: MASTER_OUTPUT,/.test(read("src/lib/project/session.ts")) && /character: \{ value: fx\.character, original: fx\.character, mode: "auto" \},/.test(BC));
check("the bus notes are authored fixture text, including the peak-protection / no-mastering note; an unknown bus starts flat (plan §5)", count(BC, /note\("eq",/g) === 3 && count(BC, /note\("comp",/g) === 1 && count(BC, /note\("peak",/g) === 1 && /A new bus starts flat; it receives bus processing only when MIX is run\./.test(BC));

const BD = T.busDetail;
check("BusDetail = rail (busRailBlocks) + the reused EqSection and CompressorSection + What changed; no Return module, no sends", /<ProcessingChain \{blocks\} \/>/.test(BD) && /const chain = \$derived\(bus\.chain\);/.test(S.busDetail) && /const blocks = \$derived\(busRailBlocks\(chain, project\.outputLabel\(bus\.output\)\)\);/.test(S.busDetail) && /<EqSection eq=\{chain\.eq\} trackName=\{bus\.name\} \/>/.test(BD) && /<CompressorSection comp=\{chain\.comp\} trackName=\{bus\.name\} \/>/.test(BD) && /<WhatChanged notes=\{chain\.notes\} trackName=\{bus\.name\} \/>/.test(BD) && /data-mixer-region="eq-graph"/.test(BD) && /data-mixer-region="compressor"/.test(BD) && !/EffectSection|SendsIn|sends-in/.test(S.busDetail));
check("BusDetail's bays are the track panel's, value for value (EQ grows from 36rem, the compressor is its content's width)", /\.bd__bay--eq \{\s*flex: 1 1 36rem;\s*\}/.test(styleOf(S.busDetail)) && /\.bd__bay--comp \{\s*flex: 0 1 auto;\s*\}/.test(styleOf(S.busDetail)) && /\.bd__bays \{[^}]*flex-wrap: wrap;[^}]*align-items: flex-start;/s.test(styleOf(S.busDetail)));

// --- 4. The rail, generalised. ----------------------------------------------------------
check("ProcessingChain takes the blocks its chain model provides (RailBlock: id, step, label, engaged, home, status?) — lamps from state only", /let \{ blocks \}: \{ blocks: readonly RailBlock\[\] \} = \$props\(\);/.test(S.rail) && /export interface RailBlock \{\s*readonly id: string;\s*readonly step: string;\s*readonly label: string;\s*readonly engaged: boolean;\s*readonly home: BlockHome;\s*readonly status\?: string;\s*\}/.test(S.model) && /\{#each blocks as block \(block\.id\)\}\s*\{@const engaged = block\.engaged\}/.test(T.rail) && /<Lamp lit=\{engaged\} color="amber" name=\{`\$\{block\.label\}: \$\{stateText\(block\)\}`\} \/>/.test(T.rail));
check("a status block speaks its status instead of in circuit / bypassed; the home text is unchanged", /function stateText\(block: RailBlock\): string \{\s*return block\.status \?\? \(block\.engaged \? "in circuit" : "bypassed"\);\s*\}/.test(S.rail) && /data-chain-status=\{block\.status \? "" : undefined\}/.test(T.rail) && /strip: "controls on the channel strip",\s*panel: "controls in this panel",\s*fixture: "no controls in this build",/.test(S.rail));
check("the track rail is the plan §8 blocks through the same adapter (2.8 behaviour intact)", /export function trackRailBlocks\(chain: ChainState\): RailBlock\[\] \{\s*return CHAIN_BLOCKS\.map\(\(block\) => \(\{ \.\.\.block, engaged: blockEngaged\(chain, block\.id\) \}\)\);\s*\}/.test(S.model) && /<ProcessingChain blocks=\{trackRailBlocks\(chain\)\} \/>/.test(T.panel));
check("nothing in the rail reorders or routes", !/<button|draggable|onpointer|onkeydown|ondrag|ondrop/.test(T.rail));

// The shared model's small, backward-compatible extensions.
check("CharacterParam is generic over its id set (default string) so the compressor and the Return share one ownership shape; CompState keeps CharacterId", /export interface CharacterParam<Id extends string = string> \{\s*value: Id;\s*readonly original: Id;\s*mode: Mode;\s*\}/.test(S.model) && /readonly character: CharacterParam<CharacterId>;/.test(S.model) && /const character: CharacterParam<CharacterId> =/.test(S.model));
check("setMode / setAllModes / setParamValue / setCharacter are unchanged", /export function setMode\(param: ChainParam \| CharacterParam, mode: Mode\): void \{\s*param\.mode = mode;\s*\}/.test(S.model) && /export function setAllModes\(params: readonly \(ChainParam \| CharacterParam\)\[\], mode: Mode\): void/.test(S.model) && /export function setCharacter\(comp: CompState, id: CharacterId\): void \{\s*comp\.character\.value = id;\s*comp\.character\.mode = "manual";\s*\}/.test(S.model));
check("the explanation card's module tags grow by the Return's and the bus output stage's (EFFECT, TONE, OUTPUT, PEAK); the 2.8 tags are unchanged", /export type NoteModule = "eq" \| "dyn" \| "comp" \| "cleanup" \| "effect" \| "tone" \| "output" \| "peak";/.test(S.model) && /eq: "EQ",\s*dyn: "DYN EQ",\s*comp: "COMP",\s*cleanup: "CLEANUP",\s*effect: "EFFECT",\s*tone: "TONE",\s*output: "OUTPUT",\s*peak: "PEAK",/.test(S.model));
check("the 2.8 parameter constructor is exported for the other chains, unchanged", /function param\(spec: ParamSpec, value: number, manualFrom: number \| undefined\): ChainParam \{\s*return manualFrom === undefined\s*\? \{ spec, value, original: value, mode: "auto" \}\s*: \{ spec, value, original: manualFrom, mode: "manual" \};\s*\}\s*(?:\/\*\*[^*]*\*\/\s*)?export const chainParam = param;/.test(S.model));
check("ChainKnob's green cap takes the dark-cap ghost ink (green is not in the light-cap list) — the component itself is unchanged", /class:ck--light=\{family === "amber" \|\| family === "cream" \|\| family === "orange"\}/.test(S.knob));

// --- 5. Scope. ---------------------------------------------------------------------------
check("no audio, DSP, analysis, playback, persistence, timers or randomness anywhere in the new or touched code", !/AudioContext|AudioWorklet|Analyser|AudioBuffer|createMediaStream|WebAudio|requestAnimationFrame|setInterval|setTimeout|Math\.random|performance\.now|Date\.now|localStorage|sessionStorage|indexedDB|fetch\(|XMLHttpRequest|WebSocket|svelte\/store|writable\(|readable\(|onMount|\$effect/.test(everythingCode));
check("no routing or reordering controls: nothing draggable, no send or bus editing in the panel", !/draggable|ondrop|ondragstart|SendSlot|routeTo|assignBus/.test(everythingCode));
check("no screws, ever", !/screw/i.test(everything));
check("no spectrum, no analysis claim, no engine claim in the new files", !/spectrum|analys|FFT|measured from audio|engine has run and/i.test(newCode + [T.returnDetail, T.busDetail, T.effect, T.sendsIn].join("\n")));
check("no `\\uXXXX` escapes in Svelte attribute literals (they are not interpreted) — Unicode goes through JS template strings", ![T.panel, T.rail, T.returnDetail, T.busDetail, T.effect, T.sendsIn, T.returnCh, T.returnStrip].some((t) => /="[^"{]*\\u[0-9a-fA-F]{4}/.test(t)));
check("colours and sizes are tokens / rem only in the new components (no hex, no px except hairlines)", ![styleOf(S.returnDetail), styleOf(S.busDetail), styleOf(S.effect), styleOf(S.sendsIn)].some((css) => /#[0-9a-fA-F]{3,8}\b/.test(stripComments(css)) || /\b(?!1px|2px|3px)\d+px\b/.test(stripComments(css).replace(/rgba?\([^)]*\)/g, ""))));
check("no dependency change", (() => { const pkg = JSON.parse(read("package.json")); return Object.keys(pkg.dependencies ?? {}).length === 0 && Object.keys(pkg.devDependencies).sort().join(",") === "@sveltejs/vite-plugin-svelte,@types/node,svelte,svelte-check,typescript,vite,vite-plugin-singlefile"; })());
check("npm exposes the check", /"check:mixer-chain-types": "node scripts\/check-mixer-chain-types-structure\.mjs"/.test(read("package.json")));

// --- Pins: the Task 2.8 modules and approved hardware this task composes but must not change;
//     the files this task touched or added, as reviewed.
const pinned = {
  "src/components/hardware/Knob.svelte": "df6c51572f28d00ca07b98551914f8f11837df147d557c9113e94cd29732fdf6",
  "src/components/hardware/TactileSwitch.svelte": "9f8a61ff521988aff708ba7e860854c441343525c0eb43b11e92a534ce1a2ba9",
  "src/components/hardware/Lamp.svelte": "024d907589c1ab33b2b3c5cc8840347b9779450b61a60f67c34b045d4ac8010a",
  "src/components/hardware/EngravedLabel.svelte": "230ebcd7cf810d3096953e5131cb9cb3a89dd83f9f0e9cc0bcd934d2ca74fc29",
  "src/components/hardware/ScribbleSelect.svelte": "f0803769f208bca9bd18ff7b1982f9e918b8dde9597aae300879272657f4628a",
  "src/components/hardware/Fader.svelte": "b46e55ec95f4ddbe544175f7e0a340e7378a8cff3af674e431aad2a08d5be372",
  // Task 9.8 re-pinned (the owner's correction pass, decisions-log D9.8.1-D9.8.4: the
  // white phase meter off the row, the correlation strip restored and stretched,
  // the VU cards extended horizontally with their content).
  // Task 10.1 re-pinned: 9.9's re-pin missed this guard; the file is 9.9's.
  "src/components/hardware/VUMeter.svelte": "08bb01a2cc7b173d1c7cfa37182b516afd40dc8fc4071b2e539bbb974e8d6bd0",
  "src/components/mixer/ChainKnob.svelte": "251284ad9c971058d317ce1fb24a51c15572abd971e341faea1edbeea07f7085",
  "src/components/mixer/AutoManualControls.svelte": "a66b99885b9a4594836ac509b23b335919f865b11a5fa4d7ffae0b5619a8b6e4",
  "src/components/mixer/EqGraph.svelte": "66f5a008df82bd276158a5141288a4d82ee2ecacea7ce94ee482edb42de81888",
  "src/components/mixer/EqSection.svelte": "1618e2fcf2f2f32a4385bf2836b46b6f7c1edec36d9f8e60a4fe00f053a03162",
  "src/components/mixer/CompressorSection.svelte": "00d46e4e9990e6e1eff93e9f3d06a30a4def499e07a5491278c2e0b7227769cc",
  "src/components/mixer/WhatChanged.svelte": "07ae383c56611fdf69080a0878e38b02c20afe0b2f8860a78aba883148b1eda7",
  "src/components/mixer/MixerBank.svelte": "4f81961d110de391d5eed77ac3b033bcb0894b306975cef7e3137d22b81359d5",
  "src/components/mixer/MixerIdentity.svelte": "d6165febdfb805db7b067f6dc01bb89f34195a2035fa916984dec401e5a9b781",
  "src/components/mixer/MixerTrackStrip.svelte": "b5107fb09a39d9516ae57ca4254465d45cca2c4c6aaa4868fbb87917f1a36122",
  "src/components/mixer/MixerBusStrip.svelte": "99da173205061bb936eb0053ec5bd94f8ad51ec2b96cf289f042e7e9351dabaf",
  // Task 9.5 re-pinned (owner's one-window Console redesign, decisions-log
  // D9.5.x): this file changed with the approved layout — the compact strip,
  // its meter, the three-rail bank, the bottom transport bar. The checks
  // around this pin still assert the file's real contract.
  "src/components/channel-strip/bus-return-fixtures.ts": "a72eb75ff0f929dcc78fea7714b6bbcaf0e998d0e2850d43d83a8fe85e0c8101",
  // Task 9.5 re-pinned (owner's one-window Console redesign, decisions-log
  // D9.5.x): this file changed with the approved layout — the compact strip,
  // its meter, the three-rail bank, the bottom transport bar. The checks
  // around this pin still assert the file's real contract.
  "src/components/channel-strip/BusMasterStrip.svelte": "09c7673329ce60d3b86859845fb3592527e9a1bae5c50e5e78b41a374e9f9826",
  // Task 9.5 re-pinned (owner's one-window Console redesign, decisions-log
  // D9.5.x): this file changed with the approved layout — the compact strip,
  // its meter, the three-rail bank, the bottom transport bar. The checks
  // around this pin still assert the file's real contract.
// Task 9.6 re-pinned (the 0.8x Console, decisions-log D9.6.x): this file
  // changed with the owner's density pass — the room's 0.8x scope, the bare
  // height-driven bridge, the halved transport bar, the walnut divider and
  // the snapping rails. The checks around this pin still assert the file's
  // real contract.
  // Task 9.7 re-pinned (the owner's third Console pass, decisions-log D9.7.1-D9.7.4:
  // the paging rails, the bare scope, the re-spread bridge, the contained windows).
  "src/components/channel-strip/StripModule.svelte": "09a89e4c37683fafcf1c2d3d17d9a7f8e759f632a19360263404529b213e712e",
  "src/lib/mixer.ts": "0ceea310a923f03ec526e842807220e75667b247facdc3ae7804a5495c1359a0",
    // Task 9.2 re-pinned (owner's top-bar overhaul). The change to this file is
  // part of the approved removals/additions — see decisions-log D9.2.1 — and the
  // checks around this pin still assert the file's real contract.

    // Task 9.3 re-pinned (owner's review: hardware chrome, tactile keys, thin bar).
  // The change to this file is the approved restyle — see decisions-log D9.3.1 —
  // and the checks around this pin still assert the file's real contract.


  "src/rooms/MixerRoom.svelte": "b6a73be6e10e2c5c63308477342f8cf3b312a971790c3251ac78fa73233f2c6b",
  // touched / added in Task 2.9, as reviewed
  "src/components/MixerDetailPanel.svelte": "5139693f9b7df182e4a65b62fc7138fb6d1eaaeb295fa25f67446f440e94b299",
  "src/components/mixer/ProcessingChain.svelte": "ac74ed271a024c5f8f0ba3fae3460f346cdfa484696b1197fe4d44ea39a9f559",
  "src/components/mixer/MixerReturnStrip.svelte": "b9041f86f91553ecc9afe61dc5daa596eb28c81be2f2892c2c2e320254809109",
  // Task 9.5 re-pinned (owner's one-window Console redesign, decisions-log
  // D9.5.x): this file changed with the approved layout — the compact strip,
  // its meter, the three-rail bank, the bottom transport bar. The checks
  // around this pin still assert the file's real contract.
  "src/components/channel-strip/ReturnStrip.svelte": "d5240fa41c0a0057fcf4ed8de7c0239a6cb4f9633aa127d9eb8187c2950dcb0c",
  "src/components/channel-strip/return-live.ts": "837066bc8807932864997db3853d94c70eb6f3f23ec15c15efdb5526f46dfdab",
  "src/components/mixer/ReturnDetail.svelte": "93780c268e6c428110acc0595186e0871d062ba5a4653584da4eba87500ab628",
  "src/components/mixer/BusDetail.svelte": "71c5ca0d04290da8b23f919fd1af00818adaf3617e34589524d4fb222ea5e77f",
  "src/components/mixer/EffectSection.svelte": "9c35887eaeb7c52ac88154a4ec832c6ea949e34d01c4ef40f860980daf4a4ef2",
  "src/components/mixer/SendsIn.svelte": "49e0892f09b0351a1f0099c089dbfb92863ddac2df5862bc8429c206d92a85e0",
  "src/lib/return-chain.ts": "8d955c33261d9bbb98d8444e67284779ef694a7d03b1643b79e57d18ee5a9f2c",
  "src/lib/bus-chain.ts": "52ef0107246646e89b008196545510a34f2ca9cf97ee5ad4508577ea1b0093e5",
  "src/lib/mixer-chain.ts": "95499fda3f1e5093bf58f0844136c052e38078ed488238ca340931af8f35531c",
};
  // Task 11.1 re-pin (rates, conversion, the export dialog): every changed
  // file re-pinned; the unchanged ones keep their hash.
for (const [rel, hash] of Object.entries(pinned)) {
  check(`approved file untouched: ${rel}`, exists(rel) && sha256(read(rel)) === hash, exists(rel) ? `sha256 ${sha256(read(rel)).slice(0, 16)}…` : "missing");
}

// --- Report. ------------------------------------------------------------------------
for (const name of passes) console.log(`  PASS  ${name}`);

if (failures.length > 0) {
  console.error("");
  for (const failure of failures) console.error(`  FAIL  ${failure}`);
  console.error("");
  console.error(`Mixer chain-type-aware detail structural contract check — ${passes.length}/${passes.length + failures.length} passed`);
  process.exit(1);
}
console.log(`Mixer chain-type-aware detail structural contract check — ${passes.length}/${passes.length} passed`);
