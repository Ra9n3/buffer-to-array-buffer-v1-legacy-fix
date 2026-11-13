#!/usr/bin/env node
/**
 * Mixer processing-chain detail structural contract check — Task 2.8.
 *
 * Dependency-free guard (Node built-ins only). It does NOT test geometry —
 * that was measured in a real browser (see task-reports/2.8-report.md and
 * evidence/mixer/2.8/) — it tests the source-level contract:
 *
 *   1. The panel: the room hands over the selected channel exactly as before
 *      (MixerRoom.svelte untouched); the panel branches ONCE, on the existing
 *      channel kind, between a standard track's chain, the Return chain and
 *      the bus chain (Task 2.9, checked in check:mixer-chain-types) and an
 *      EXPLICIT empty state for anything else — never a blank bay, never one
 *      universal layout; the identity header is read from the shared session
 *      (Arrange role / tier / family / source, the strip's org tab); the
 *      housing is the Mixer bank's, value for value.
 *   2. State: one chain per standard track, seeded from its fixture and
 *      edited locally; nothing stored, shared or persisted.
 *   3. The chain model (plan §8): the eight blocks in the plan's order; every
 *      parameter Auto or Manual; module ownership AUTO / MIXED / MANUAL; a
 *      turn makes only that parameter Manual; returning to Auto changes
 *      ownership only — no value is reset or suggested; bypass is a separate
 *      state (plan §3: every module bypassable).
 *   4. EQ (plan §3, §8, §10): four bands (LF shelf, LMF/HMF bells, HF shelf)
 *      on the approved Knob in the strips' 40 px size, amber family; a
 *      frequency-response graph — solid = current, dotted = original, a
 *      hatched illustrative range for a dynamic band; log 20 Hz–20 kHz,
 *      ±15 dB; never a spectrum, nothing animated.
 *   5. Compressor (plan §8): VCA / Opto / FET / Vari-Mu character on the
 *      approved ScribbleSelect; threshold, ratio, attack, release, make-up
 *      on red knobs; gain reduction on the approved VU meter housing with a
 *      DEDICATED GR face (0 at the right, reduction increasing leftward),
 *      a fixed fixture reading, 0 while bypassed.
 *   6. Ghost / diff (plan §10): a dashed ghost pointer at the loaded value
 *      outside the knob's artwork (the Knob itself untouched); "was <X>" for
 *      the character; the dotted original curve.
 *   7. Explanation (plan §3): "What changed and why" as a cream card of
 *      authored fixture sentences, stamped as fixture text; nothing implies
 *      audio was analysed.
 *   8. Shared-component change: VUMeter gains an OPTIONAL `face` prop
 *      ("vu" default | "gr"); the VU face, its law, marks and exports are
 *      unchanged; no Console file passes it.
 *   9. Scope: no screws, no audio / DSP / analysis / playback / routing /
 *      persistence, no dependency change; approved files untouched (pins).
 *
 * Run: npm run check:mixer-detail
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
const rule = (css, selector) => {
  const i = css.indexOf(`${selector} {`);
  return i < 0 ? "" : css.slice(i, css.indexOf("}", i));
};

const files = {
  panel: "src/components/MixerDetailPanel.svelte",
  model: "src/lib/mixer-chain.ts",
  knob: "src/components/mixer/ChainKnob.svelte",
  am: "src/components/mixer/AutoManualControls.svelte",
  rail: "src/components/mixer/ProcessingChain.svelte",
  graph: "src/components/mixer/EqGraph.svelte",
  eq: "src/components/mixer/EqSection.svelte",
  comp: "src/components/mixer/CompressorSection.svelte",
  wc: "src/components/mixer/WhatChanged.svelte",
  vu: "src/components/hardware/VUMeter.svelte",
};
for (const [key, rel] of Object.entries(files)) check(`${key} source exists: ${rel}`, exists(rel));
if (failures.length > 0) {
  for (const failure of failures) console.error(`  FAIL  ${failure}`);
  process.exit(1);
}

const panel = read(files.panel);
const model = read(files.model);
const knob = read(files.knob);
const am = read(files.am);
const rail = read(files.rail);
const graph = read(files.graph);
const eq = read(files.eq);
const comp = read(files.comp);
const wc = read(files.wc);
const vu = read(files.vu);
const room = read("src/rooms/MixerRoom.svelte");
const mixerData = read("src/lib/mixer.ts");
const pkg = JSON.parse(read("package.json"));

const T = Object.fromEntries(Object.entries({ panel, knob, am, rail, graph, eq, comp, wc, vu }).map(([k, v]) => [k, templateOf(v)]));
const S = Object.fromEntries(Object.entries({ panel, knob, am, rail, graph, eq, comp, wc, vu }).map(([k, v]) => [k, styleOf(v)]));
const J = Object.fromEntries(Object.entries({ panel, knob, am, rail, graph, eq, comp, wc, vu }).map(([k, v]) => [k, scriptOf(v)]));
const everything = [panel, model, knob, am, rail, graph, eq, comp, wc].join("\n");
const everythingCode = stripComments(everything);

// --- 1. The panel. -------------------------------------------------------------
check("the room is untouched: it still renders the panel once, after the bank, with the selected channel", count(templateOf(room), /<MixerDetailPanel\b/g) === 1 && /<MixerDetailPanel channel=\{selectedChannel\} \/>/.test(room));
check("the panel receives the room's selected channel (since Task 3.1 the project entity — the Channel union) and nothing else", /let \{ channel \}: \{ channel: Channel \| undefined \} = \$props\(\);/.test(J.panel) && /import type \{ Channel \} from "\.\.\/lib\/project\/model";/.test(J.panel));
check("the panel branches once, on the existing channel kind: supportsChainDetail = kind === \"track\"", /export function supportsChainDetail\(channel: Channel \| undefined\): channel is Track \{\s*return channel\?\.kind === "track";/.test(model) && /const track = \$derived\(supportsChainDetail\(channel\) \? channel : undefined\);/.test(J.panel));
check("a standard track gets the chain: the rail, the EQ bay, the compressor bay and What changed, each rendered once", ["ProcessingChain", "EqSection", "CompressorSection", "WhatChanged"].every((c) => count(T.panel, new RegExp(`<${c}\\b`, "g")) === 1) && /\{#if track && chain\}/.test(T.panel));
check("a Return gets the Return chain and a bus the bus chain (Task 2.9); any other kind gets an EXPLICIT empty state (role=status) naming it — never a blank bay, never a standard-track chain", /\{:else if theReturn\}\s*(?:<!--[\s\S]*?-->\s*)?<ReturnDetail ret=\{theReturn\} \/>/.test(T.panel) && /\{:else if bus\}\s*(?:<!--[\s\S]*?-->\s*)?<BusDetail \{bus\} \/>/.test(T.panel) && /\{:else if channel\}\s*(?:<!--[\s\S]*?-->\s*)?<div class="detail__empty" role="status" data-detail-empty>/.test(T.panel) && /Processing detail for \$\{channelKindLabel\(channel\.kind\)\.toLowerCase\(\)\} channels is not available in this build/.test(T.panel) && !/ReturnStrip|BusMasterStrip/.test(panel));
check("no selection gets its own empty state", /\{:else\}\s*<div class="detail__empty" role="status" data-detail-empty>/.test(T.panel) && /Select a channel in the bank to inspect it/.test(T.panel));
check("the panel's hooks tell the measurement which channel, kind and support state it shows", /data-detail-channel=\{channel\?\.id \?\? ""\}/.test(T.panel) && /data-detail-kind=\{channel\?\.kind \?\? ""\}/.test(T.panel) && /data-detail-supported=\{supported\}/.test(T.panel) && /const supported = \$derived\(track !== undefined \|\| theReturn !== undefined \|\| bus !== undefined\);/.test(panel));
check("the detail regions are tagged: detail-panel, selection, processing-chain, eq-graph, compressor, what-changed", ["detail-panel", "selection", "processing-chain", "eq-graph", "compressor", "what-changed"].every((r) => T.panel.includes(`data-mixer-region="${r}"`)));
check("the identity header is read from the shared project: code and name from the channel; role, family and source from the track entity, the tier from its priority (project.tierOf); the org tab from the entity (Task 3.1)", /import \{ PROMINENCE_TIERS, familyLabel, role, sourceType \} from "\.\.\/lib\/arrange";/.test(J.panel) && /familyLabel\(track\.familyId\)/.test(J.panel) && /sourceType\(track\.sourceTypeId\)/.test(J.panel) && /role\(track\.role\)/.test(J.panel) && /const tier = \$derived\(track \? project\.tierOf\(track\) : null\);/.test(J.panel) && /PROMINENCE_TIERS\.find\(\(t\) => t\.id === tier\)/.test(J.panel) && /const org = \$derived\(channel\?\.org \?\? null\);/.test(J.panel) && /<EngravedLabel text=\{channel\.code\}/.test(T.panel) && /<EngravedLabel text=\{channel\.name\}[^>]*id="mixer-detail-title"/.test(T.panel));
check("the org tab is the flat tab of D2.2.13: background-color: var(--org) only, from orgToken", /import \{ orgToken \} from "\.\/channel-strip\/track-strip-fixtures";/.test(J.panel) && /style:--org=\{orgToken\(org\)\} data-org-tab/.test(T.panel) && /\.detail__tab \{[^}]*background-color: var\(--org\);/.test(S.panel) && !/\.detail__tab \{[^}]*(?:background-image|box-shadow|border:|border-color|outline)/.test(S.panel));
check("the header prints a kind (Standard track / the shared kind label) — no channel-type copy is invented", /channel\.kind === "track" \? "Standard track" : channelKindLabel\(channel\.kind\)/.test(J.panel));
{
  const bankStyle = styleOf(read("src/components/mixer/MixerBank.svelte"));
  const val = (css, name) => css.match(new RegExp(`${name}: ([^;]+);`))?.[1];
  check(
    "the housing is the Mixer bank's, value for value: cheek width, radius, the three wood tones and the trim",
    ["cheek", "radius", "wood-light", "wood", "wood-dark", "trim"].every((n) => val(S.panel, `--dt-${n}`) !== undefined && val(S.panel, `--dt-${n}`) === val(bankStyle, `--mb-${n}`)),
  );
  check("the deck is the charcoal panel material, the cheeks walnut", /\.detail__deck \{[^}]*background-color: var\(--al-material-panel\);/.test(S.panel) && /\.detail__cheek \{[^}]*background-color: var\(--dt-wood\);/.test(S.panel));
}
check("the panel keeps the 2.7 layout contract: it starts at the top of its row and may grow past it (the room scrolls); it never scrolls sideways", /\.detail \{[^}]*align-self: flex-start;/.test(S.panel) && /\.detail \{[^}]*min-height: 100%;/.test(S.panel) && /\.detail__deck \{[^}]*min-width: 0;/.test(S.panel) && !/overflow-x: auto|overflow-x: scroll/.test(S.panel));
check("the two bays sit side by side where there is room and stack below it; each plate is its module's height", /\.detail__bays \{[^}]*display: flex;[^}]*flex-wrap: wrap;[^}]*align-items: flex-start;/s.test(S.panel) && /\.detail__bay--eq \{[^}]*flex: 1 1 36rem;/.test(S.panel) && /\.detail__bay--comp \{[^}]*flex: 0 1 auto;/.test(S.panel));

// --- 2. State. -------------------------------------------------------------------
// Task 3.1: the chain is the track entity's (`Track.chain`), seeded once into the
// project by the session (createChainState) — the panel holds no chain state of its own.
check("one chain per standard track, seeded once into the project from its fixture (session.ts) and edited in place by the panel — no panel-local chain state (Task 3.1)", /chain: createChainState\(strip\.id\),/.test(read("src/lib/project/session.ts")) && /const chain = \$derived\(track\?\.chain\);/.test(J.panel) && !/\$state/.test(J.panel) && /readonly chain: ChainState;/.test(read("src/lib/project/model.ts")));
check("nothing is stored, shared across rooms or persisted: no store, storage, fetch or cross-room import", !/writable\(|readable\(|localStorage|sessionStorage|indexedDB|fetch\(|BroadcastChannel|rooms\/|ConsoleRoom|ArrangeRoom/.test(everythingCode));
check("createChainState builds fresh objects from the fixture: a parameter is Auto with original = value unless the fixture lists it as Manual, then original = the value it was set from", /export function createChainState\(code: string\): ChainState/.test(model) && /function param\(spec: ParamSpec, value: number, manualFrom: number \| undefined\): ChainParam \{\s*return manualFrom === undefined\s*\? \{ spec, value, original: value, mode: "auto" \}\s*: \{ spec, value, original: manualFrom, mode: "manual" \};/.test(model) && /typeof characterFrom === "string"\s*\? \{ value: fx\.character, original: characterFrom, mode: "manual" \}\s*: \{ value: fx\.character, original: fx\.character, mode: "auto" \}/.test(model));

// --- 3. The chain model. ---------------------------------------------------------
check("the eight blocks are the plan's (§8), taken from the existing PROCESSING_CHAIN_STEPS in their order", /import \{ PROCESSING_CHAIN_STEPS \} from "\.\/mixer";/.test(model) && /import type \{ Channel, Track \} from "\.\/project\/model";/.test(model) && /export const CHAIN_BLOCKS: readonly ChainBlock\[\] = PROCESSING_CHAIN_STEPS\.map\(/.test(model) && count(mixerData.slice(mixerData.indexOf("PROCESSING_CHAIN_STEPS")), /\{ step: "0\d"/g) === 8 && /export type BlockId = "trim" \| "cleanup" \| "eq" \| "dyneq" \| "comp" \| "pan" \| "fader" \| "sends";/.test(model));
check("every parameter is Auto or Manual; module ownership is AUTO / MIXED / MANUAL — never a binary lamp", /export type Mode = "auto" \| "manual";/.test(model) && /export type ModuleMode = "auto" \| "mixed" \| "manual";/.test(model) && /export function moduleMode\(modes: readonly Mode\[\]\): ModuleMode/.test(model) && /auto: "AUTO",\s*mixed: "MIXED",\s*manual: "MANUAL"/.test(model.replace(/\s+/g, " ")));
check("a turn sets the value AND makes only that parameter Manual (snapped and clamped to its spec)", /export function setParamValue\(param: ChainParam, value: number\): void \{\s*const r = knobRange\(param\.spec\);\s*const next = param\.spec\.taper === "linear" \? Math\.min\(r\.max, Math\.max\(r\.min, value\)\) : value;\s*param\.value = next;\s*param\.mode = "manual";\s*\}/.test(model));
check("returning to Auto changes ownership only: setMode touches the mode and nothing else — no value is reset, nothing is suggested", /export function setMode\(param: ChainParam \| CharacterParam, mode: Mode\): void \{\s*param\.mode = mode;\s*\}/.test(model));
check("ALL AUTO / ALL MANUAL set every mode in the module, values untouched", /export function setAllModes\(params: readonly \(ChainParam \| CharacterParam\)\[\], mode: Mode\): void \{\s*for \(const p of params\) p\.mode = mode;\s*\}/.test(model));
check("choosing a character sets the selection Manual and never touches the knobs", /export function setCharacter\(comp: CompState, id: CharacterId\): void \{\s*comp\.character\.value = id;\s*comp\.character\.mode = "manual";\s*\}/.test(model));
check("bypass is a separate state per module (EQ, compressor), independent of ownership", /readonly bypassed: boolean;|bypassed: boolean;/.test(model) && /bind:engaged=\{\(\) => eq\.bypassed, \(on\) => \(eq\.bypassed = on\)\}/.test(T.eq) && /bind:engaged=\{\(\) => comp\.bypassed, \(on\) => \(comp\.bypassed = on\)\}/.test(T.comp));
check("the rail's lamps follow the fixture chain state only: in circuit or bypassed, nothing routed or reordered", /export function blockEngaged\(chain: ChainState, id: BlockId\): boolean/.test(model) && /export function trackRailBlocks\(chain: ChainState\): RailBlock\[\] \{\s*return CHAIN_BLOCKS\.map\(\(block\) => \(\{ \.\.\.block, engaged: blockEngaged\(chain, block\.id\) \}\)\);\s*\}/.test(model) && /\{@const engaged = block\.engaged\}/.test(T.rail) && /<ProcessingChain blocks=\{trackRailBlocks\(chain\)\} \/>/.test(T.panel) && !/<button|draggable|onpointer|onkeydown|ondrag/.test(T.rail));
check("the rail is an ordered list of the eight blocks, each with an amber Lamp and engraved step and label", /<ol class="chain" aria-label="Processing chain" data-chain-rail>/.test(T.rail) && /\{#each blocks as block \(block\.id\)\}/.test(T.rail) && /CHAIN_BLOCKS: readonly ChainBlock\[\] = PROCESSING_CHAIN_STEPS\.map/.test(model) && /<Lamp lit=\{engaged\} color="amber"/.test(T.rail) && count(T.rail, /<EngravedLabel\b/g) === 2);
check("the parameter specs are the controls the plan names and nothing more: EQ frequency / gain / Q; compressor threshold / ratio / attack / release / make-up", ["EQ_FREQ", "EQ_GAIN", "EQ_Q", "COMP_THRESHOLD", "COMP_RATIO", "COMP_ATTACK", "COMP_RELEASE", "COMP_MAKEUP"].every((n) => new RegExp(`export const ${n}: ParamSpec = spec\\(`).test(model)) && count(model, /: ParamSpec = spec\(/g) === 8);
check("the four compressor characters are the plan's: VCA, Opto, FET, Vari-Mu — a fixture selection, nothing emulated", /export type CharacterId = "vca" \| "opto" \| "fet" \| "varimu";/.test(model) && /\{ id: "vca", name: "VCA" \},\s*\{ id: "opto", name: "Opto" \},\s*\{ id: "fet", name: "FET" \},\s*\{ id: "varimu", name: "Vari-Mu" \}/.test(model.replace(/\s+/g, " ")) && !/emulat|model(?:led|s) the|circuit model/i.test(stripComments(comp + model)));
check("the fixtures cover every standard track in the bank (20 codes) with a fallback for any new one", count(model.slice(model.indexOf("export const FIXTURES")), /^\s{2}"\d\d": \{/gm) === 20 && /export function chainFixtureFor\(code: string\): ChainFixture/.test(model));
{
  const fx = model.slice(model.indexOf("export const FIXTURES"), model.indexOf("export function chainFixtureFor"));
  check("the fixture states are representative: a bypassed EQ, a bypassed compressor, tracks with and without the cleanup block, dynamic bands, Manual parameters with the value they were set from (to ghost), a changed character", /eqBypassed: true/.test(fx) && /compBypassed: true/.test(fx) && count(fx, /cleanup: true/g) >= 3 && count(fx, /cleanup: true/g) < 20 && count(fx, /dynamic: \["\w+", \d/g) >= 5 && count(fx, /"eq\.\w+\.\w+": -?[\d.]+|"comp\.\w+": -?[\d.]+/g) >= 4 && /"comp\.character": "\w+"/.test(fx));
  check("every fixture carries two to four authored notes", (() => { const blocks = fx.split(/^\s{2}"\d\d": \{/m).slice(1); return blocks.length === 20 && blocks.every((b) => { const n = count(b, /note\("/g); return n >= 2 && n <= 4; }); })());
  check("the notes are the plan's kind of sentence (plain language, a frequency / amount / reason) and never claim an analysis, a detection or a listening pass", /Reduced energy around 3 kHz, up to 3 dB, to make room for the lead vocal/.test(fx) && !/analys|detect|measured|listened|heard|the engine (?:found|chose|decided|recommends)/i.test(fx));
}

// --- 4. EQ. ----------------------------------------------------------------------
check("four bands: LF low shelf, LMF and HMF bells, HF high shelf; shelves have frequency and gain, bells add Q", /\{ id: "lf", label: "LF", name: "Low shelf", kind: "shelf-low" \}/.test(model) && /\{ id: "lmf", label: "LMF", name: "Low-mid bell", kind: "bell" \}/.test(model) && /\{ id: "hmf", label: "HMF", name: "High-mid bell", kind: "bell" \}/.test(model) && /\{ id: "hf", label: "HF", name: "High shelf", kind: "shelf-high" \}/.test(model) && /q: band\.kind === "bell" \? param\(EQ_Q/.test(model.replace(/\s+/g, " ")));
check("the EQ bay's knobs are ChainKnobs in the amber family, one per parameter, in frequency / gain / Q order", /<ChainKnob param=\{band\.freq\} family="amber"/.test(T.eq) && /<ChainKnob param=\{band\.gain\} family="amber"/.test(T.eq) && /\{#if band\.q\}\s*<ChainKnob param=\{band\.q\} family="amber"/.test(T.eq) && count(T.eq, /<ChainKnob\b/g) === 3);
check("the EQ bay has its own BYPASS (panel-labelled switch, amber lamp) and AUTO / MANUAL controls", /data-module-bypass/.test(T.eq) && /<TactileSwitch\s+variant="panel"\s+label="Bypass"\s+lamp="amber"/.test(T.eq.replace(/\s+/g, " ")) && count(T.eq, /<AutoManualControls\b/g) === 1);
check("a dynamic band is marked DYN beside its legend, from the fixture's illustrative depth only", /data-eq-dyn-mark/.test(T.eq) && /band\.dynamicDepthDb !== null/.test(T.eq) && /<EngravedLabel text="Dyn" size="xs" tone="muted" \/>/.test(T.eq));
check("the bands fold under a narrow bay by container query (five columns), never by shrinking the knobs", /container-type: inline-size;/.test(S.eq) && /grid-template-columns: repeat\(10, minmax\(0, 1fr\)\);/.test(S.eq) && /@container \(max-width: 39\.5rem\)/.test(S.eq) && /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\);/.test(S.eq) && !/--knob-size/.test(S.eq));
check("the graph is an accessible image of the response: solid current curve, dotted original (only once something changed), hatched dynamic range (only for a dynamic band)", /role="img"/.test(T.graph) && /aria-label=\{description\}/.test(T.graph) && /<path class="eqg__current" d=\{currentPath\} data-part="current" \/>/.test(T.graph) && /\{#if changed\}\s*<path class="eqg__original" d=\{originalPath\} data-part="original" \/>/.test(T.graph) && /\{#if hasDynamic\}\s*<g class="eqg__dynamic" data-part="dynamic">/.test(T.graph) && /\.eqg__original \{[^}]*stroke-dasharray:/.test(S.graph) && /<pattern id=\{`\$\{uid\}-hatch`\}/.test(T.graph));
check("the graph's axes: log frequency 20 Hz – 20 kHz, ±15 dB (the gain knobs' whole range)", /const DB_RANGE = 15;/.test(J.graph) && /const F_LO = 20;/.test(J.graph) && /const F_HI = 20000;/.test(J.graph) && /Math\.log\(f \/ F_LO\) \/ Math\.log\(F_HI \/ F_LO\)/.test(J.graph));
check("the curves come from the control values through the shared response model (shelf + bell maths); nothing is measured, animated or analysed", /const current = \$derived\(currentSettings\(eq\)\);/.test(J.graph) && /const original = \$derived\(originalSettings\(eq\)\);/.test(J.graph) && /eqResponseDb\(/.test(J.graph) && /export function bandResponseDb\(setting: BandSetting, frequency: number\): number/.test(model) && !/requestAnimationFrame|setInterval|AnalyserNode|getFloatFrequencyData|fft/i.test(stripComments(graph + model)));
check("the graph's traces are the EQ family's amber on the lamp glow; the original is a thin dotted cream line", /--eqg-trace-core: var\(--al-function-amber-hi\);/.test(S.graph) && /--eqg-trace: var\(--al-material-lamp\);/.test(S.graph) && /\.eqg__current \{[^}]*stroke: var\(--eqg-trace-core\)/.test(S.graph) && /\.eqg__original \{[^}]*stroke: var\(--eqg-original\)/.test(S.graph) && /\.eqg__original \{[^}]*stroke-dasharray:/.test(S.graph));
check("bypass dims the traces (the response is not in circuit) and says so", /\.is-bypassed \.eqg__traces,\s*\.is-bypassed \.eqg__markers \{\s*opacity: 0\.4;/.test(S.graph) && /class:is-bypassed=\{eq\.bypassed\}/.test(T.graph) && /bypassed/.test(J.graph));
check("the graph has no spectrum, meter or live signal path", !/spectrum|analyser|AudioContext|MediaStream|input signal/i.test(stripComments(graph)));

// --- 5. Compressor. --------------------------------------------------------------
check("the character is the approved ScribbleSelect over the four characters, hook \"character\", function-bound to setCharacter", /<ScribbleSelect\s+label="Character"\s+context=\{trackName\}\s+options=\{COMP_CHARACTERS\}/.test(T.comp.replace(/\s+/g, " ")) && /hook="character"/.test(T.comp) && /bind:value=\{\(\) => comp\.character\.value, \(id\) => setCharacter\(comp, id as CharacterId\)\}/.test(T.comp));
check("the five compressor knobs are ChainKnobs in the red family — threshold, ratio, attack, release, make-up", ["threshold", "ratio", "attack", "release", "makeup"].every((p) => new RegExp(`<ChainKnob param=\\{comp\\.${p}\\} family="red"`).test(T.comp)) && count(T.comp, /<ChainKnob\b/g) === 5);
check("the compressor bay has its own BYPASS and AUTO / MANUAL controls, and the character has a MODE switch of its own", /data-module-bypass/.test(T.comp) && /<TactileSwitch\s+variant="panel"\s+label="Bypass"\s+lamp="amber"/.test(T.comp.replace(/\s+/g, " ")) && count(T.comp, /<AutoManualControls\b/g) === 1 && /bind:engaged=\{\(\) => charManual, \(on\) => setMode\(comp\.character, on \? "manual" : "auto"\)\}/.test(T.comp) && /const charManual = \$derived\(comp\.character\.mode === "manual"\);/.test(J.comp));
check("gain reduction is shown on the approved VU meter housing with the GR face; the reading is a fixed fixture value, 0 while bypassed, and says so", /<VUMeter face="gr" level=\{grDb\} label="Gain reduction"/.test(T.comp) && /const grDb = \$derived\(comp\.bypassed \? 0 : comp\.gainReductionDb\);/.test(J.comp) && /a fixed, illustrative reading/.test(T.comp));
check("the character ghost: \"was <loaded character>\" printed only when it changed", /data-chain-ghost-text=\{charChanged \? characterName\(comp\.character\.original\) : null\}/.test(T.comp) && /<EngravedLabel text=\{`was \$\{characterName\(comp\.character\.original\)\}`\}/.test(T.comp));
check("the colour code is carried by the approved Knob's families (hardware ref §5): every EQ knob amber, every compressor knob red, no other family in the panel", count(T.eq, /family="amber"/g) === 3 && count(T.comp, /family="red"/g) === 5 && !/family="(?:cream|blue|green|orange|grey)/.test(T.eq + T.comp + T.panel));

// --- 6. Ghost / diff and the knob wrapper. ----------------------------------------
check("ChainKnob renders the approved Knob once, in the strips' 40 px size, with a function binding to the chain parameter — Knob.svelte itself is untouched", count(T.knob, /<Knob\b/g) === 1 && /--knob-size: 2\.5rem;/.test(S.knob) && /bind:value=\{\(\) => position, turn\}/.test(T.knob) && /setParamValue\(param, fromPosition\(param\.spec, next\)\)/.test(J.knob));
check("the ghost is a dashed pointer at the loaded value, drawn OUTSIDE the knob's artwork in a separate overlay, only once the value changed, inert", /\{#if changed\}\s*<svg class="ck__ghost" viewBox="0 0 400 400" aria-hidden="true" data-chain-ghost>/.test(T.knob) && /\.ck__ghost \{[^}]*pointer-events: none;/.test(S.knob) && /\.ck__ghost line \{[^}]*stroke-dasharray:/.test(S.knob));
check("the ghost angle is the Knob's own law: −135° + 270° × sweep fraction of the loaded value", /const START_ANGLE = -135;/.test(J.knob) && /const SWEEP = 270;/.test(J.knob) && /START_ANGLE \+ SWEEP \* sweepFraction\(param\.spec, param\.original\)/.test(J.knob));
check("the knob's MODE switch is the approved panel-labelled TactileSwitch, value Auto / Manual, lamp lit for Manual, function-bound to setMode", /<TactileSwitch\s+variant="panel"\s+label="Mode"\s+value=\{manual \? "Manual" : "Auto"\}\s+bind:engaged=\{\(\) => manual, \(on\) => setMode\(param, on \? "manual" : "auto"\)\}/.test(T.knob.replace(/\s+/g, " ")));
check("the knob's tooltip carries the parameter, its value, the loaded value when changed and the ownership — the one place that text lives", /`\$\{param\.spec\.name\}, \$\{context\}: \$\{printed\}`/.test(J.knob) && /loaded as \$\{param\.spec\.format\(param\.original\)\}/.test(J.knob) && /Manual: protected from recalculation/.test(J.knob) && /Auto: open to recalculation/.test(J.knob));
check("the module's AUTO / MANUAL controls: an engraved status window printing AUTO / MIXED / MANUAL and two panel-labelled switches, ALL Auto and ALL Manual, lit only when the whole module is theirs", /data-module-mode-print=\{MODE_PRINT\[mode\]\}/.test(T.am) && /data-module-all="auto"/.test(T.am) && /data-module-all="manual"/.test(T.am) && count(T.am, /<TactileSwitch\b/g) === 2 && /bind:engaged=\{\(\) => mode === "auto", \(\) => setAllModes\(params, "auto"\)\}/.test(T.am) && /bind:engaged=\{\(\) => mode === "manual", \(\) => setAllModes\(params, "manual"\)\}/.test(T.am));
check("labels follow the ReturnStrip precedent: sentence-case label props, upper-cased by EngravedLabel / TactileSwitch CSS (no shouting in source)", /label="Bypass"/.test(T.eq) && /label="Bypass"/.test(T.comp) && /label="Mode"/.test(T.knob) && /label="All"/.test(T.am) && !/label="BYPASS"|label="MODE"|label="ALL"/.test(everything));

// --- 7. Explanation. --------------------------------------------------------------
check("What changed and why is an ordered list of the fixture's notes on a cream card, each note tagged with its module", /<ol class="wc__card"/.test(T.wc) && /\{#each notes as n/.test(T.wc) && /<li class="wc__note" data-note-module=\{n\.module\}>/.test(T.wc) && /\.wc__card \{[^}]*background-color: var\(--al-material-cream\)/.test(S.wc));
check("the card is stamped as fixture text and marked simulated; its tooltip says no audio was analysed and no engine has run", /data-simulated="true"/.test(T.wc) && /data-fixture-stamp/.test(T.wc) && /<EngravedLabel text="Fixture text"/.test(T.wc) && /No audio has been analysed and no engine has run/.test(T.wc));
check("the explanation is the plan's name for it", /<EngravedLabel text="What changed and why"/.test(T.wc));
check("the module tags are the plan's modules: EQ, DYN EQ, COMP, CLEANUP", /eq: "EQ",\s*dyn: "DYN EQ",\s*comp: "COMP",\s*cleanup: "CLEANUP"/.test(model.replace(/\s+/g, " ")));

// --- 8. The shared-component change (VUMeter face). --------------------------------
check("VUMeter: `face` is an OPTIONAL prop defaulting to the VU face — every existing use is unchanged", /export type MeterFace = "vu" \| "gr";/.test(vu) && /face\?: MeterFace;/.test(J.vu) && /face = "vu" as MeterFace,/.test(J.vu));
check("the VU face is intact: law, range, red band, marks and exports", /export const VU_MIN = -20;/.test(vu) && /export const VU_MAX = 3;/.test(vu) && /export const VU_RED_FROM = 0;/.test(vu) && /export const VU_MARKS: readonly VUMark\[\]/.test(vu) && /100 \* Math\.pow\(10, db \/ 20\)/.test(vu));
check("the GR face is a DEDICATED gain-reduction scale: 0 at the right, 20 dB at the left, numerals 0 1 3 5 10 20, no red band, \"GR\" legend", /export const GR_MIN = 0;/.test(vu) && /export const GR_MAX = 20;/.test(vu) && [0, 1, 3, 5, 10, 20].every((db) => new RegExp(`\\{ db: ${db}, weight: "major", numeral: true \\}`).test(vu.slice(vu.indexOf("GR_MARKS")))) && /\{#if !isGr\}/.test(T.vu) && /\{isGr \? "GR" : "VU"\}/.test(T.vu) && /const overload = \$derived\(!isGr && /.test(J.vu));
check("the GR needle rests at the right (0 dB) and swings left as reduction grows", /export function grPosition\(db: number\): number \{\s*const clamped = Math\.min\(GR_MAX, Math\.max\(GR_MIN, db\)\);\s*return \(modulation\(-clamped\) - modulation\(-GR_MAX\)\) \/ \(modulation\(0\) - modulation\(-GR_MAX\)\);/.test(vu) && /export function grAngle\(db: number\): number \{\s*return -VU_SWEEP \/ 2 \+ VU_SWEEP \* grPosition\(db\);/.test(vu));
check("the GR face reads as a meter to assistive tech: 0–20 dB, \"<n> dB gain reduction\"", /aria-valuemin=\{faceMin\}/.test(T.vu) && /aria-valuemax=\{faceMax\}/.test(T.vu) && /dB gain reduction/.test(J.vu));
check("no Console or dev file passes `face` — the Console's meters are the VU face as approved", ["src/rooms/ConsoleRoom.svelte", "src/components/ChannelBank.svelte", "src/components/console/MeterBridge.svelte", "src/components/channel-strip/TrackStrip.svelte", "src/components/channel-strip/ReturnStrip.svelte", "src/components/channel-strip/BusMasterStrip.svelte", "src/dev/ComponentsPage.svelte"].filter(exists).every((rel) => !/face=/.test(read(rel))));

// --- 9. Scope. --------------------------------------------------------------------
check("no screws anywhere in the new files (D2.1.9)", !/screw/i.test(everything));
check("no audio, DSP, analysis, playback, routing or inference: no AudioContext / Worklet / Analyser / timers / fetch / workers", !/AudioContext|AudioWorklet|Analyser|OfflineAudio|MediaStream|requestAnimationFrame|setInterval|setTimeout|fetch\(|new Worker|WebSocket/.test(everythingCode));
check("no routing or reordering controls: nothing draggable, no send or bus editing in the panel", !/draggable|ondrop|ondragstart|SendSlot|routeTo|assignBus/.test(everythingCode));
check("no literal \\uXXXX escapes in markup attributes or text (Svelte prints them verbatim)", ![T.panel, T.knob, T.am, T.rail, T.graph, T.eq, T.comp, T.wc].some((t) => /(?:title|text|value|label|name)="[^"]*\\u[0-9a-fA-F]{4}/.test(t) || />[^<{]*\\u[0-9a-fA-F]{4}[^<{]*</.test(t)));
check("no dependency was added", !pkg.dependencies && Object.keys(pkg.devDependencies).sort().join(",") === "@sveltejs/vite-plugin-svelte,@types/node,svelte,svelte-check,typescript,vite,vite-plugin-singlefile");
check("check:mixer-detail is wired into package.json", pkg.scripts?.["check:mixer-detail"] === "node scripts/check-mixer-detail-structure.mjs");

// Approved files this task builds on and must not have changed, plus the two
// files it changed, pinned at their Task 2.8 state.
const pinned = {
    // Task 9.2 re-pinned (owner's top-bar overhaul). The change to this file is
  // part of the approved removals/additions — see decisions-log D9.2.1 — and the
  // checks around this pin still assert the file's real contract.

    // Task 9.3 re-pinned (owner's review: hardware chrome, tactile keys, thin bar).
  // The change to this file is the approved restyle — see decisions-log D9.3.1 —
  // and the checks around this pin still assert the file's real contract.


  "src/rooms/MixerRoom.svelte": "b6a73be6e10e2c5c63308477342f8cf3b312a971790c3251ac78fa73233f2c6b",
  "src/lib/mixer.ts": "0ceea310a923f03ec526e842807220e75667b247facdc3ae7804a5495c1359a0",
  "src/lib/arrange.ts": "f7c85d6385270ef6c066403c18ceb351da51fc701378b49d913d213597995ff0",
    // Task 9.2 re-pinned (owner's top-bar overhaul). The change to this file is
  // part of the approved removals/additions — see decisions-log D9.2.1 — and the
  // checks around this pin still assert the file's real contract.

    // Task 9.3 re-pinned (owner's review: hardware chrome, tactile keys, thin bar).
  // The change to this file is the approved restyle — see decisions-log D9.3.1 —
  // and the checks around this pin still assert the file's real contract.


  // Task 9.5 re-pinned (owner's one-window Console redesign, decisions-log
  // D9.5.x): this file changed with the approved layout — the compact strip,
  // its meter, the three-rail bank, the bottom transport bar. The checks
  // around this pin still assert the file's real contract.
// Task 9.6 re-pinned (the 0.8x Console, decisions-log D9.6.x): this file
  // changed with the owner's density pass — the room's 0.8x scope, the bare
  // height-driven bridge, the halved transport bar, the walnut divider and
  // the snapping rails. The checks around this pin still assert the file's
  // real contract.
  // Task 10.2 re-pinned (the shared transport deck, decisions-log D10.2.1/D10.2.2):
  // the shell gained the deck's row. The checks around this pin still assert the file's real contract.
  "src/app.css": "8f05c89c3569e7eb58bde6fe6116610b85a5b576d85dbc8dc3a4d2a140208d6a",
  "src/components/mixer/MixerBank.svelte": "4f81961d110de391d5eed77ac3b033bcb0894b306975cef7e3137d22b81359d5",
  "src/components/mixer/MixerIdentity.svelte": "d6165febdfb805db7b067f6dc01bb89f34195a2035fa916984dec401e5a9b781",
  "src/components/mixer/MixerTrackStrip.svelte": "b5107fb09a39d9516ae57ca4254465d45cca2c4c6aaa4868fbb87917f1a36122",
  "src/components/mixer/MixerReturnStrip.svelte": "b9041f86f91553ecc9afe61dc5daa596eb28c81be2f2892c2c2e320254809109",
  "src/components/mixer/MixerBusStrip.svelte": "99da173205061bb936eb0053ec5bd94f8ad51ec2b96cf289f042e7e9351dabaf",
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
  "src/components/MixerDetailPanel.svelte": "5139693f9b7df182e4a65b62fc7138fb6d1eaaeb295fa25f67446f440e94b299",
};
for (const [rel, hash] of Object.entries(pinned)) {
  check(`approved file untouched: ${rel}`, exists(rel) && sha256(read(rel)) === hash, exists(rel) ? `sha256 ${sha256(read(rel)).slice(0, 16)}…` : "missing");
}

// --- Report. ------------------------------------------------------------------------
for (const name of passes) console.log(`  PASS  ${name}`);

if (failures.length > 0) {
  console.error("");
  for (const failure of failures) console.error(`  FAIL  ${failure}`);
  console.error("");
  console.error(`Mixer processing-chain detail structural contract check — ${passes.length}/${passes.length + failures.length} passed`);
  process.exit(1);
}
console.log(`Mixer processing-chain detail structural contract check — ${passes.length}/${passes.length} passed`);
