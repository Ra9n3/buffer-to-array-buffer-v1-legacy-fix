#!/usr/bin/env node
/**
 * Shared project model and store structural contract check — Task 3.1.
 *
 * Dependency-free guard (Node built-ins only). It does NOT test geometry or
 * behaviour — those were measured in a real browser (task-reports/3.1-report.md,
 * evidence/mixer/3.1/, evidence/arrange/3.1/) — it tests the source-level
 * contract of the state foundation:
 *
 *   1. The MODEL (lib/project/model.ts) is a plain typed shape: stable
 *      kind-prefixed ids, typed references (a send's destination, an output)
 *      — never array positions or display names; tracks carry identity,
 *      instrument (family + source type), Role, Priority 1–10 (the Prominence
 *      Tier is a reading of it), a routing destination reference, the
 *      Console strip's channel settings and the Mixer's chain; Returns and
 *      buses carry theirs; the arrangement is fixture-backed display data.
 *      No Svelte, no state, no fixture values, no DSP / audio / routing graph.
 *   2. ONE authoritative store (lib/project/store.svelte.ts): one `$state`
 *      tree opened with the approved fixture session; typed, narrow write
 *      operations (one per editable control) that validate and skip
 *      same-value writes; memoised live views (getter objects over the
 *      entities, never copies) for the approved strips and rows; no
 *      persistence, undo, routing graph or selection state.
 *   3. The SESSION (lib/project/session.ts) is built from the approved
 *      fixtures only — nothing invented, nothing measured.
 *   4. The three rooms read the store and no fixture arrays; the components
 *      bind to the store's views through optional props (the playground's
 *      plain fixtures still work); transient UI state (selection) stays out
 *      of the project; no second mutable copy of project data anywhere.
 *   5. Scope: no undo / redo, autosave, persistence, audio, new dependency,
 *      new UI; no screws; the approved hardware is untouched (pins); the
 *      files this task touched are pinned as reviewed. (Task 3.2 added the
 *      routing rules — lib/project/routing.ts, guarded by check:routing —
 *      and the sends' Auto / Manual ownership; the 3.1 statements below
 *      that said "no routing" were amended to that truth.)
 *
 * Run: npm run check:project
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
const scriptOf = (svelte) => (svelte.match(/<script lang="ts">([\s\S]*?)<\/script>/) ?? [])[1] ?? "";
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/^\s*\/\/.*$/gm, "");

// --- Files. ------------------------------------------------------------------------------
const FILES = {
  model: "src/lib/project/model.ts",
  session: "src/lib/project/session.ts",
  store: "src/lib/project/store.svelte.ts",
  stripLive: "src/components/channel-strip/strip-live.ts",
  returnLive: "src/components/channel-strip/return-live.ts",
  rowLive: "src/components/arrange-row-live.ts",
  consoleBank: "src/components/ChannelBank.svelte",
  arrangeRoom: "src/rooms/ArrangeRoom.svelte",
  arrangeRow: "src/components/ArrangeTrackRow.svelte",
  mixerRoom: "src/rooms/MixerRoom.svelte",
  mixerBank: "src/components/mixer/MixerBank.svelte",
  mixerTrack: "src/components/mixer/MixerTrackStrip.svelte",
  mixerReturn: "src/components/mixer/MixerReturnStrip.svelte",
  mixerBus: "src/components/mixer/MixerBusStrip.svelte",
  panel: "src/components/MixerDetailPanel.svelte",
  returnDetail: "src/components/mixer/ReturnDetail.svelte",
  busDetail: "src/components/mixer/BusDetail.svelte",
  effect: "src/components/mixer/EffectSection.svelte",
  sendsIn: "src/components/mixer/SendsIn.svelte",
  trackStrip: "src/components/channel-strip/TrackStrip.svelte",
  sendSlot: "src/components/channel-strip/SendSlot.svelte",
  module: "src/components/channel-strip/StripModule.svelte",
  returnStrip: "src/components/channel-strip/ReturnStrip.svelte",
  busStrip: "src/components/channel-strip/BusMasterStrip.svelte",
  trackFixtures: "src/components/channel-strip/track-strip-fixtures.ts",
  busReturnFixtures: "src/components/channel-strip/bus-return-fixtures.ts",
  arrange: "src/lib/arrange.ts",
  mixer: "src/lib/mixer.ts",
  mixerChain: "src/lib/mixer-chain.ts",
  returnChain: "src/lib/return-chain.ts",
  busChain: "src/lib/bus-chain.ts",
  devPinned: "src/dev/PinnedStripFixture.svelte",
  devRows: "src/dev/ArrangeRowFixture.svelte",
};
for (const rel of Object.values(FILES)) check(`file exists: ${rel}`, exists(rel));
check("the Task 2.9 module-level Return state file is gone (its state moved into the store)", !exists("src/lib/return-chain.svelte.ts"));
if (failures.length) {
  for (const f of failures) console.error(`  FAIL  ${f}`);
  process.exit(1);
}

const S = Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, read(rel)]));
const isSvelte = (k) => FILES[k].endsWith(".svelte");
const J = Object.fromEntries(Object.entries(S).map(([k, src]) => [k, isSvelte(k) ? scriptOf(src) : src]));
const T = Object.fromEntries(Object.entries(S).map(([k, src]) => [k, isSvelte(k) ? templateOf(src) : ""]));
const C = Object.fromEntries(Object.entries(J).map(([k, src]) => [k, stripComments(src)]));
const M = C.model;
const ST = C.store;
const SE = C.session;

// --- 1. The model. ------------------------------------------------------------------------
check("the model is a plain shape: no Svelte runes, no state, no fixture arrays, no component imports", !/\$state|\$derived|\$effect|svelte|TRACK_STRIPS|RETURN_STRIPS|BUS_MASTERS|ARRANGE_TRACKS|\.svelte"/.test(M) && /^import type /m.test(M) && !/^import \{/m.test(M));
check("stable kind-prefixed ids: TrackId `track-…`, ReturnBusId `return-…`, BusId `bus-…`, ChannelId their union, with constructors and type guards", /export type TrackId = `track-\$\{string\}`;/.test(M) && /export type ReturnBusId = `return-\$\{string\}`;/.test(M) && /export type BusId = `bus-\$\{string\}`;/.test(M) && /export type ChannelId = TrackId \| ReturnBusId \| BusId;/.test(M) && /export const trackId = \(code: string\): TrackId => `track-\$\{code\}`;/.test(M) && /export const returnBusId = \(key: string\): ReturnBusId => `return-\$\{key\}`;/.test(M) && /export const busId = \(code: string\): BusId => `bus-\$\{code\}`;/.test(M) && /export function isTrackId\(id: string\): id is TrackId/.test(M) && /export function isReturnBusId\(id: string\): id is ReturnBusId/.test(M) && /export function isBusId\(id: string\): id is BusId/.test(M));
check("references are typed ids, never positions or names: a send points at a ReturnBusId (or null), an output is a BusId or the Master", /export interface SendSlot \{\s*to: ReturnBusId \| null;\s*level: number;\s*mode: Mode;\s*\}/.test(M) && /export type OutputRef = BusId \| "master";/.test(M) && /export const MASTER_OUTPUT: OutputRef = "master";/.test(M) && /output: OutputRef;/.test(M) && !/to: number|to: string;|output: string;|index: number/.test(M));
check("Priority 1–10 is the stored value; the Prominence Tier is a reading of it (Primary 8–10 · Supporting 4–7 · Background 1–3; a chosen tier lands on 9 · 5 · 2 — D3.1.2)", /export const PRIORITY_RANGE = \{ min: 1, max: 10 \} as const;/.test(M) && /export const TIER_FLOOR: Readonly<Record<ProminenceTier, number>> = \{\s*primary: 8,\s*supporting: 4,\s*background: 1,\s*\};/.test(M) && /export const TIER_ANCHOR: Readonly<Record<ProminenceTier, number>> = \{\s*primary: 9,\s*supporting: 5,\s*background: 2,\s*\};/.test(M) && /export function tierOfPriority\(priority: number\): ProminenceTier \{\s*if \(priority >= TIER_FLOOR\.primary\) return "primary";\s*if \(priority >= TIER_FLOOR\.supporting\) return "supporting";\s*return "background";\s*\}/.test(M) && /export function clampPriority\(priority: number\): number/.test(M));
check("a Track: kind, id, printed code, TRK type, name, org swatch, family, source type, role (nullable since Task 5.1), priority, tierConfirmed, output reference, channel settings, loaded send levels, chain, display, and the imported stem reference `audio` (Task 5.1; null for a fixture track)", /export interface Track \{\s*readonly kind: "track";\s*readonly id: TrackId;\s*readonly code: string;\s*readonly type: "TRK";\s*name: string;\s*org: OrgSwatch;\s*familyId: FamilyId \| null;\s*sourceTypeId: string \| null;\s*role: RoleId \| null;\s*priority: number;\s*tierConfirmed: boolean;\s*output: OutputRef;\s*readonly channel: TrackChannel;\s*readonly loadedSendLevels: Readonly<Partial<Record<ReturnBusId, number>>>;\s*readonly chain: ChainState;\s*readonly display: ChannelDisplay;\s*readonly audio: TrackAudio \| null;\s*\}/.test(M.replace(/\n\s*\n/g, "\n")) && /export interface TrackAudio \{\s*readonly assetId: string;\s*readonly fileName: string;\s*readonly sha256: string;\s*readonly bytes: number;\s*readonly encoding: "pcm" \| "float";\s*readonly bitDepth: number;\s*readonly sampleRate: number;\s*readonly channels: number;\s*readonly frames: number;\s*readonly peakDbfs: number \| null;\s*readonly silent: boolean;\s*readonly importedAt: string;\s*\}/.test(M.replace(/\n\s*\n/g, "\n")));
check("the track channel settings are the Console strip's (plan §5 channel-strip state): trim, pan, level, mute, solo, the fixed send slots", /export interface TrackChannel \{\s*trim: number;\s*pan: number;\s*level: number;\s*mute: boolean;\s*solo: boolean;\s*readonly sends: SendSlot\[\];\s*\}/.test(M.replace(/\n\s*\n/g, "\n")));
check("a Return bus (plan §8a): kind, id, code, RET type, name, short print, org, effect, strip channel (level · mute · solo), the effect chain, output, display", /export interface ReturnChannel \{\s*level: number;\s*mute: boolean;\s*solo: boolean;\s*\}/.test(M.replace(/\n\s*\n/g, "\n")) && /export interface ReturnBus \{\s*readonly kind: "return";\s*readonly id: ReturnBusId;\s*readonly code: string;\s*readonly type: "RET";\s*name: string;\s*readonly short: string;\s*org: OrgSwatch;\s*readonly effect: ReturnEffect;\s*readonly channel: ReturnChannel;\s*readonly chain: ReturnChainState;\s*output: OutputRef;\s*readonly display: ChannelDisplay;\s*\}/.test(M.replace(/\n\s*\n/g, "\n")));
check("a regular bus (plan §5, §8): kind, id, code, BUS type, name, org, strip channel (trim · balance · level · mute · solo), the bus chain, output, display", /export interface BusChannel \{\s*trim: number;\s*balance: number;\s*level: number;\s*mute: boolean;\s*solo: boolean;\s*\}/.test(M.replace(/\n\s*\n/g, "\n")) && /export interface Bus \{\s*readonly kind: "bus";\s*readonly id: BusId;\s*readonly code: string;\s*readonly type: "BUS";\s*name: string;\s*org: OrgSwatch;\s*readonly channel: BusChannel;\s*readonly chain: BusChainState;\s*output: OutputRef;\s*readonly display: ChannelDisplay;\s*\}/.test(M.replace(/\n\s*\n/g, "\n")));
// Task 4.1: a project also says which template it was built from (the fixture session or the empty
// project) — reopening = template + saved values, so the template travels with the identity.
check("the Channel union and the Project: identity + template (Task 4.1), tracks, Returns, buses, the arrangement (bars, time signature, sections, tempo markers, placeholder clips by track id)", /export type Channel = Track \| ReturnBus \| Bus;/.test(M) && /export type ProjectTemplateId = "session-fixture" \| "empty";/.test(M) && /export interface Project \{\s*readonly id: string;\s*name: string;\s*readonly template: ProjectTemplateId;\s*readonly tracks: Track\[\];\s*readonly returns: ReturnBus\[\];\s*readonly buses: Bus\[\];\s*readonly arrangement: Arrangement;\s*(readonly sidechains\?: readonly SidechainEdge\[\];\s*)?\}/.test(M.replace(/\n\s*\n/g, "\n")) && /export interface Arrangement \{\s*readonly barCount: number;\s*readonly timeSignature: string;\s*readonly sections: readonly ArrangeSection\[\];\s*readonly tempoMarkers: readonly TempoMarker\[\];\s*readonly clips: Readonly<Partial<Record<TrackId, readonly ArrangeClip\[\]>>>;\s*\}/.test(M.replace(/\n\s*\n/g, "\n")));
check("the chain shapes are the approved Task 2.8 / 2.9 ones, reused (ChainState, ReturnChainState, BusChainState) — Auto / Manual ownership and current / original stay per parameter", /import type \{ ChainState, Mode \} from "\.\.\/mixer-chain";/.test(M) && /import type \{ ReturnChainState \} from "\.\.\/return-chain";/.test(M) && /import type \{ BusChainState \} from "\.\.\/bus-chain";/.test(M) && /export interface ChainParam \{\s*readonly spec: ParamSpec;\s*value: number;\s*readonly original: number;\s*mode: Mode;\s*\}/.test(C.mixerChain.replace(/\n\s*\n/g, "\n")));
check("the Return chain carries no identity any more (id, code, name live on the Return); the bus chain no output (a reference on the bus)", /export interface ReturnChainState \{\s*readonly effect: ReturnEffect;\s*readonly character: CharacterParam<ReturnCharacterId>;\s*readonly time: ChainParam;\s*readonly second: ChainParam;\s*readonly tone: ChainParam;\s*bypassed: boolean;\s*readonly notes: readonly ExplanationNote\[\];\s*\}/.test(C.returnChain.replace(/\n\s*\n/g, "\n")) && !/returnId|busId|readonly name: string;|output: string/.test(C.returnChain.match(/export interface ReturnChainState \{[\s\S]*?\n\}/)[0] + C.busChain.match(/export interface BusChainState \{[\s\S]*?\n\}/)[0]));
check("the kind label and the output label are model helpers (Master, or the bus's name by its id)", /export function channelKindLabel\(kind: ChannelKind\): string/.test(M) && /export function outputLabel\(ref: OutputRef, buses: readonly Bus\[\]\): string \{\s*if \(ref === "master"\) return "Master";\s*return buses\.find\(\(b\) => b\.id === ref\)\?\.name \?\? ref;/.test(M) && /export \{ channelKindLabel, type ChannelKind \} from "\.\/project\/model";/.test(C.mixer));
check("no routing graph, cycle detection, undo, persistence, decoding or final DSP in the model (Task 5.1 adds the stem's facts — `TrackAudio` — not its samples: no buffers, no Web Audio)", !/graph|cycle|undo|redo|history|snapshot|localStorage|JSON\.|fetch|AudioContext|gainNode|latency|Float32Array|ArrayBuffer|Blob|decode/i.test(M) && (M.match(/sampleRate/g) ?? []).length === 1);

// --- 2. The store. ------------------------------------------------------------------------
check("ONE authoritative store: a single module-level `$state` tree, booted as an EMPTY project (Task 9.1.2: a new user importing stems must not lose them to a fixture solo); nothing else in src creates project state", /const state: Project = \$state\(createEmptyProject\([^)]*\)\);/ .test(ST) && count(ST, /\$state\(/g) === 1 && /import \{ createEmptyProject \} from "\.\/templates";/.test(ST) && FILES.store.endsWith(".svelte.ts"));
check("unknown ids are programming errors, never silent no-ops (mustTrack / mustReturn / mustBus / mustSlot throw)", /function mustTrack\(id: TrackId\): Track \{[\s\S]*?throw new Error\(`unknown track: \$\{id\}`\);/.test(ST) && /function mustReturn\(id: ReturnBusId\): ReturnBus \{[\s\S]*?throw new Error\(`unknown Return bus: \$\{id\}`\);/.test(ST) && /function mustBus\(id: BusId\): Bus \{[\s\S]*?throw new Error\(`unknown bus: \$\{id\}`\);/.test(ST) && /function mustSlot\(track: Track, slot: number\): number/.test(ST));
check("reads: tracks · returns · buses · arrangement · channels (Mixer order) · lookups by id · tierOf · sendsInto (live selector) · sendReturns · outputLabel", /export const project = \{/.test(ST) && /get tracks\(\): readonly Track\[\] \{\s*return state\.tracks;/.test(ST) && /get returns\(\): readonly ReturnBus\[\]/.test(ST) && /get buses\(\): readonly Bus\[\]/.test(ST) && /get arrangement\(\) \{\s*return state\.arrangement;/.test(ST) && /get channels\(\): readonly Channel\[\] \{\s*return \[\.\.\.state\.tracks, \.\.\.state\.returns, \.\.\.state\.buses\];/.test(ST) && /channel\(id: string\): Channel \| undefined \{\s*if \(isTrackId\(id\)\) return project\.track\(id\);\s*if \(isReturnBusId\(id\)\) return project\.returnBus\(id\);\s*if \(isBusId\(id\)\) return project\.bus\(id\);\s*return undefined;/.test(ST) && /tierOf\(track: Track\): ProminenceTier \{\s*return tierOfPriority\(track\.priority\);/.test(ST) && /sendsInto\(returnId: ReturnBusId\): SendInto\[\]/.test(ST) && /get sendReturns\(\): readonly SendReturnOption\[\] \{\s*return state\.returns\.map\(\(r\) => \(\{ id: r\.id, name: r\.name, short: r\.short \}\)\);/.test(ST) && /outputLabel\(ref: OutputRef\): string \{\s*return outputLabel\(ref, state\.buses\);/.test(ST));
// Task 3.2 added setSendMode (send ownership, plan §5) and the two routing writes (no control binds them yet).
const OPS = ["setTrackTrim", "setTrackPan", "setTrackLevel", "setTrackMute", "setTrackSolo", "setSendTo", "setSendLevel", "setSendMode", "setTrackFamily", "setTrackSourceType", "chooseTrackTier", "setTrackPriority", "setReturnLevel", "setReturnMute", "setReturnSolo", "setReturnBypass", "setBusTrim", "setBusBalance", "setBusLevel", "setBusMute", "setBusSolo", "setTrackOutput", "setBusOutput"];
const opsBody = ST.slice(ST.indexOf("export const ops = {"), ST.indexOf("\n} as const;", ST.indexOf("export const ops = {")));
check("writes: one narrow typed operation per editable control the approved UI has, plus the Task 3.2 send-ownership and routing operations — and no other", /export const ops = \{/.test(ST) && OPS.every((op) => new RegExp(`^  ${op}\\(`, "m").test(opsBody)) && count(opsBody, /^  [a-zA-Z]+\(/gm) === OPS.length, `${count(opsBody, /^  [a-zA-Z]+\(/gm)} ops`);
check("numeric writes clamp to the control's approved range and skip a same-value write (a Knob assigns on every interaction)", /setTrackTrim\(id: TrackId, value: number\): void \{\s*const t = mustTrack\(id\);\s*const next = clamp\(value, TRIM_RANGE\);\s*if \(next !== t\.channel\.trim\) t\.channel\.trim = next;/.test(ST) && /const next = clamp\(value, PAN_RANGE\);/.test(ST) && /const next = clamp\(value, FADER_RANGE\);/.test(ST) && /const next = clamp\(value, SEND_RANGE\);/.test(ST) && /setBusTrim\(id: BusId, value: number\): void \{\s*const b = mustBus\(id\);\s*const next = clamp\(value, TRIM_RANGE\);/.test(ST) && /setBusBalance\(id: BusId, value: number\): void \{\s*const b = mustBus\(id\);\s*const next = clamp\(value, PAN_RANGE\);/.test(ST) && /export \{ PAN_RANGE as BALANCE_RANGE, TRIM_RANGE as BUS_TRIM_RANGE/.test(C.busReturnFixtures) && /function clamp\(value: number, range: \{ readonly min: number; readonly max: number \}\): number \{\s*if \(!Number\.isFinite\(value\)\) throw new Error/.test(ST));
check("a send points only at a Return the project has (typed reference, validated); the slot index is range-checked", /setSendTo\(id: TrackId, slot: number, to: ReturnBusId \| null\): void \{\s*const t = mustTrack\(id\);\s*const s = t\.channel\.sends\[mustSlot\(t, slot\)\];\s*if \(to !== null\) mustReturn\(to\);\s*if \(s\.to === to\) return;\s*s\.to = to;/.test(ST));
check("the Task 2.5 classification invariant lives in the store: a family change clears a source that does not belong; a source must belong to the family", /setTrackFamily\(id: TrackId, family: FamilyId \| null\): void \{\s*const t = mustTrack\(id\);\s*if \(t\.familyId === family\) return;\s*t\.familyId = family;\s*if \(!isValidSource\(family, t\.sourceTypeId\)\) t\.sourceTypeId = null;/.test(ST) && /setTrackSourceType\(id: TrackId, sourceTypeId: string \| null\): void \{\s*const t = mustTrack\(id\);\s*if \(!isValidSource\(t\.familyId, sourceTypeId\)\) \{\s*throw new Error/.test(ST));
check("choosing a tier moves the priority to the tier's anchor only when the tier changes, and confirms (owner: any tier choice confirms); the numeric override confirms too", /chooseTrackTier\(id: TrackId, tier: ProminenceTier\): void \{\s*const t = mustTrack\(id\);\s*if \(tierOfPriority\(t\.priority\) !== tier\) t\.priority = TIER_ANCHOR\[tier\];\s*if \(!t\.tierConfirmed\) t\.tierConfirmed = true;/.test(ST) && /setTrackPriority\(id: TrackId, priority: number\): void \{\s*const t = mustTrack\(id\);\s*const next = clampPriority\(priority\);\s*if \(next !== t\.priority\) t\.priority = next;\s*if \(!t\.tierConfirmed\) t\.tierConfirmed = true;/.test(ST));
check("the live views are memoised getter objects over the entities (Maps keyed by id) — derived display data, never a second mutable copy", /const trackStrips = new Map<TrackId, TrackStripLive>\(\);/.test(ST) && /const trackMetas = new Map<TrackId, TrackMetaLive>\(\);/.test(ST) && /const arrangeTracks = new Map<TrackId, ArrangeTrack>\(\);/.test(ST) && /const returnLives = new Map<ReturnBusId, ReturnLive>\(\);/.test(ST) && /const returnStrips = new Map<ReturnBusId, ReturnStripFixture>\(\);/.test(ST) && /const busLives = new Map<BusId, BusLive>\(\);/.test(ST) && /const busStrips = new Map<BusId, BusMasterFixture>\(\);/.test(ST) && ["trackStrip(id: TrackId): TrackStripLive", "trackMeta(id: TrackId): TrackMetaLive", "arrangeTrackOf(id: TrackId): ArrangeTrack", "returnLive(id: ReturnBusId): ReturnLive", "returnStripOf(id: ReturnBusId): ReturnStripFixture", "busStripOf(id: BusId): BusMasterFixture", "busLive(id: BusId): BusLive"].every((sig) => ST.includes(`export function ${sig}`)) && !/structuredClone|JSON\.parse\(JSON\.stringify|\{ \.\.\.t \}|\{ \.\.\.r \}|\{ \.\.\.b \}/.test(ST));
check("the strip view writes through the operations (never into the entity directly) and the send slots are views too, refusing a non-Return id", /set trim\(v: number\) \{\s*ops\.setTrackTrim\(id, v\);/.test(ST) && /set level\(v: number\) \{\s*ops\.setTrackLevel\(id, v\);/.test(ST) && /set mute\(on: boolean\) \{\s*ops\.setTrackMute\(id, on\);/.test(ST) && /set to\(v: string \| null\) \{\s*if \(v !== null && !isReturnBusId\(v\)\) throw new Error\(`not a Return bus id: \$\{v\}`\);\s*ops\.setSendTo\(id, i, v\);/.test(ST) && /set level\(v: number\) \{\s*ops\.setSendLevel\(id, i, v\);/.test(ST) && /get returns\(\) \{\s*return project\.sendReturns;/.test(ST));
check("the Arrange row's binding reads the tier from the priority and writes a choice through chooseTrackTier; tierConfirmed is read-only there", /set tier\(v: ProminenceTier\) \{\s*ops\.chooseTrackTier\(id, v\);/.test(ST) && /get tierConfirmed\(\) \{\s*return t\.tierConfirmed;/.test(ST) && /readonly tierConfirmed: boolean;/.test(C.rowLive) && /export interface TrackMetaLive \{\s*familyId: FamilyId \| null;\s*sourceTypeId: string \| null;\s*tier: ProminenceTier;\s*readonly tierConfirmed: boolean;\s*\}/.test(C.rowLive.replace(/\n\s*\n/g, "\n")));
check("the Return's strip view keeps the Task 2.9 ownership rule (a turned knob is Manual, a same-value write is not a turn) and adds level · mute · solo through the operations", /if \(next !== chain\.time\.value\) setParamValue\(chain\.time, next\);/.test(ST) && /set level\(v: number\) \{\s*ops\.setReturnLevel\(id, v\);/.test(ST) && /set mute\(on: boolean\) \{\s*ops\.setReturnMute\(id, on\);/.test(ST) && /set solo\(on: boolean\) \{\s*ops\.setReturnSolo\(id, on\);/.test(ST));
check("the store holds no transient UI state (selection, scroll, open panels) and no persistence of its own; its routing reads / writes only delegate to lib/project/routing.ts (Task 3.2); its history, autosave and clipboard only delegate to the Task 3.3 modules (check:editing)", !/selected|selection|scroll|open|localStorage|sessionStorage|indexedDB|JSON\.|fetch\(/i.test(ST.replace(/\/\*[\s\S]*?\*\//g, "")) && /import \{[^}]*validateRoute[^}]*\} from "\.\/routing";/s.test(ST) && !/while \(|new Set</.test(ST) && /import \{ createHistory \} from "\.\/history";/.test(ST) && /import \{ buildManifest, createAutosave, serializeManifest \} from "\.\/persistence";/.test(ST) && /import \{ applyPaste, copyChannelSettings, pasteVerdict, type ChannelSettings, type PasteVerdict \} from "\.\/clipboard";/.test(ST) && !/function (undo|redo|save|paste)\b|patches|\.push\(\{ ?path/.test(ST));

// --- 3. The session. ----------------------------------------------------------------------
check("the session is built from the approved fixtures only: TRACK_STRIPS joined to ARRANGE_TRACKS by code, RETURN_STRIPS, BUS_MASTERS, the three chain constructors, the Arrange timeline data", /TRACK_STRIPS\.map\(\(strip\) => trackOf\(strip, trackOutput\)\)/.test(SE) && /ARRANGE_TRACKS\.find\(\(t\) => t\.code === strip\.id\)/.test(SE) && /RETURN_STRIPS\.map\(returnOf\)/.test(SE) && /BUS_MASTERS\.map\(busOf\)/.test(SE) && /chain: createChainState\(strip\.id\),/.test(SE) && /chain: createReturnChainState\(ret\),/.test(SE) && /chain: createBusChainState\(bus\.id\),/.test(SE) && /barCount: ARRANGE_BAR_COUNT,/.test(SE) && /timeSignature: TIME_SIGNATURE,/.test(SE) && /sections: ARRANGE_SECTIONS,/.test(SE) && /tempoMarkers: ARRANGE_TEMPO_MARKERS,/.test(SE) && /clips\[track\.id\] = clipsOf\(track\.code\)/.test(SE));
check("the fixture tier becomes the tier's anchor priority; tierConfirmed defaults to confirmed; the routing references are the Task 2.4 reading (tracks → the bus master, buses and Returns → Master)", /priority: TIER_ANCHOR\[meta\.tier\],/.test(SE) && /tierConfirmed: meta\.tierConfirmed !== false,/.test(SE) && /const trackOutput: OutputRef = buses\[0\]\?\.id \?\? MASTER_OUTPUT;/.test(SE) && count(SE, /output: MASTER_OUTPUT,/g) === 2);
check("the loaded send levels (the ghost print) and the fixed send slots come from the strip fixture; a fresh project every call", /for \(const send of strip\.sends\) loadedSendLevels\[returnBusId\(send\.to\)\] = send\.level;/.test(SE) && /return send \? \{ to: returnBusId\(send\.to\), level: send\.level, mode: "auto" \} : \{ to: null, level: SEND_RANGE\.min, mode: "auto" \};/.test(SE) && /export function createSessionProject\(\): Project \{/.test(SE));
check("nothing invented, nothing measured: no numbers that are not the fixtures' (no literal priorities, levels or times in the session), SIMULATED stays the strips' print", !/priority: \d|level: -?\d|trim: -?\d|time: \d/.test(SE) && /SIMULATED/.test(C.trackFixtures) && /data-simulated=\{SIMULATED\}/.test(T.trackStrip));

// --- 4. The rooms read the store; nothing keeps a fixture copy. ----------------------------
const roomsAndWrappers = ["consoleBank", "arrangeRoom", "mixerRoom", "mixerBank", "mixerTrack", "mixerReturn", "mixerBus", "panel", "returnDetail", "busDetail"];
check("Console bank, Arrange room, Mixer room / bank / channels, the detail panel and the detail modules import the one store", roomsAndWrappers.every((k) => /from "(\.\.\/)+lib\/project\/store\.svelte"/.test(J[k])), roomsAndWrappers.filter((k) => !/lib\/project\/store\.svelte/.test(J[k])).join(", "));
check("no room or Mixer component reads a fixture array or the retired Mixer channel list any more", roomsAndWrappers.every((k) => !/TRACK_STRIPS|RETURN_STRIPS|BUS_MASTERS|ARRANGE_TRACKS|MIXER_TRACKS|MIXER_RETURNS|MIXER_BUSES|MIXER_CHANNELS|findChannel|DEFAULT_MIXER_SELECTION|clipsOf\(/.test(C[k])), roomsAndWrappers.filter((k) => /TRACK_STRIPS|RETURN_STRIPS|BUS_MASTERS|ARRANGE_TRACKS|MIXER_/.test(C[k])).join(", "));
check("the Console bank binds every strip to the store's view: tracks (trackStrip), Returns (returnStripOf + returnLive), the bus master (busStripOf + busLive)", /<TrackStrip track=\{trackStrip\(track\.id\)\} \/>/.test(T.consoleBank) && /<ReturnStrip ret=\{returnStripOf\(ret\.id\)\} live=\{returnLive\(ret\.id\)\} \/>/.test(T.consoleBank) && /<BusMasterStrip bus=\{busStripOf\(bus\.id\)\} live=\{busLive\(bus\.id\)\} \/>/.test(T.consoleBank));
check("the Arrange room binds every row to the store (arrangeTrackOf + trackMeta; Task 5.1: plus the track's stem facts) and feeds the head and lanes the project's arrangement", /<ArrangeTrackRow\s+track=\{arrangeTrackOf\(track\.id\)\}\s+live=\{trackMeta\(track\.id\)\}\s+laneId=\{`lane-\$\{track\.code\}`\}\s+audio=\{track\.audio\}\s+padded=\{isPadded\(track\.audio\)\}\s+audioStatus=\{assets\.statusOf\(track\.id\)\}\s*\/>/.test(T.arrangeRoom) && /<ArrangeTimelineHeader barCount=\{arrangement\.barCount\} tempoMarkers=\{arrangement\.tempoMarkers\} sections=\{arrangement\.sections\} \/>/.test(T.arrangeRoom) && /clips=\{arrangement\.clips\[track\.id\] \?\? \[\]\}/.test(T.arrangeRoom) && /style:--arrange-bar-count=\{arrangement\.barCount\}/.test(T.arrangeRoom));
check("the Mixer bank iterates the store's tracks, Returns and buses; each channel component binds its strip to the same views the Console uses", /\{#each tracks as channel \(channel\.id\)\}/.test(T.mixerBank) && /\{#each returns as channel \(channel\.id\)\}/.test(T.mixerBank) && /\{#each buses as channel \(channel\.id\)\}/.test(T.mixerBank) && /const strip = \$derived\(trackStrip\(channel\.id\)\);/.test(J.mixerTrack) && /<TrackStrip track=\{strip\}>/.test(T.mixerTrack) && /const live = \$derived\(returnLive\(channel\.id\)\);/.test(J.mixerReturn) && /const ret = \$derived\(returnStripOf\(channel\.id\)\);/.test(J.mixerReturn) && /const bus = \$derived\(busStripOf\(channel\.id\)\);/.test(J.mixerBus) && /const live = \$derived\(busLive\(channel\.id\)\);/.test(J.mixerBus));
check("the Mixer identity reads family, source and role from the track entity and binds the tier through trackMeta (a choice confirms); the detail panel reads the entity and its chain", /familyLabel\(channel\.familyId\)/.test(J.mixerTrack) && /const meta = \$derived\(trackMeta\(channel\.id\)\);/.test(J.mixerTrack) && /onchoose=\{\(id\) => \(meta\.tier = id as ProminenceTier\)\}/.test(T.mixerTrack) && /const chain = \$derived\(track\?\.chain\);/.test(J.panel) && /const tier = \$derived\(track \? project\.tierOf\(track\) : null\);/.test(J.panel) && /<ReturnDetail ret=\{theReturn\} \/>/.test(T.panel) && /<BusDetail \{bus\} \/>/.test(T.panel));
check("the detail modules derive from the entity: the Return's sends are the store's live selector, the bus output its resolved reference", /const sends = \$derived\(project\.sendsInto\(ret\.id\)\);/.test(J.returnDetail) && /const blocks = \$derived\(returnRailBlocks\(chain, sends\.length\)\);/.test(J.returnDetail) && /const blocks = \$derived\(busRailBlocks\(chain, project\.outputLabel\(bus\.output\)\)\);/.test(J.busDetail) && /<EffectSection \{chain\} returnName=\{ret\.name\} \/>/.test(T.returnDetail));
check("transient UI state stays out of the project: the Mixer's selection is the room's own $state (an id into the store); no store import keeps a selection", /let selectedId = \$state<string>\(project\.channels\[0\]\?\.id \?\? ""\);/.test(J.mixerRoom) && /const selectedChannel = \$derived\(project\.channel\(selectedId\)\);/.test(J.mixerRoom) && !/selected/i.test(ST));
check("no second mutable copy of project data: the rooms, the bank, the Mixer channels, the panel and the detail modules hold no $state", ["consoleBank", "arrangeRoom", "mixerBank", "mixerTrack", "mixerReturn", "mixerBus", "panel", "returnDetail", "busDetail", "trackStrip"].every((k) => !/\$state/.test(J[k])), ["consoleBank", "arrangeRoom", "mixerBank", "mixerTrack", "mixerReturn", "mixerBus", "panel", "returnDetail", "busDetail", "trackStrip"].filter((k) => /\$state/.test(J[k])).join(", "));
check("the only strip-side $state is the approved fallback of a strip rendered without a binding (`own`, behind `live ?? own`): ReturnStrip, BusMasterStrip, ArrangeTrackRow — one each; TrackStrip none", count(J.returnStrip, /\$state/g) === 1 && /const model = \$derived\(live \?\? own\);/.test(J.returnStrip) && count(J.busStrip, /\$state/g) === 1 && /const model = \$derived\(live \?\? own\);/.test(J.busStrip) && count(J.arrangeRow, /\$state/g) === 1 && /const model = \$derived\(live \?\? own\);/.test(J.arrangeRow) && count(J.trackStrip, /\$state/g) === 0);
check("the live shapes are shapes only (strip-live.ts, return-live.ts, arrange-row-live.ts): no state, no fixture, no import of the store", [C.stripLive, C.returnLive, C.rowLive].every((src) => !/\$state|store|TRACK_STRIPS|function /.test(src)) && /export interface TrackStripLive \{/.test(C.stripLive) && /export interface SendSlotLive \{\s*to: string \| null;\s*level: number;\s*\}/.test(C.stripLive.replace(/\n\s*\n/g, "\n")) && /export interface BusLive \{\s*trim: number;\s*balance: number;\s*level: number;\s*mute: boolean;\s*solo: boolean;\s*\}/.test(C.stripLive.replace(/\n\s*\n/g, "\n")));
check("the strips bind their editable controls to the model with function bindings (every editable control writes to the store when bound)", /<Fader label="Level" bind:value=\{\(\) => track\.level, \(v\) => \(track\.level = v\)\} \/>/.test(T.trackStrip) && /bind:engaged=\{\(\) => track\.mute, \(on\) => \(track\.mute = on\)\}/.test(T.trackStrip) && /bind:value=\{\(\) => track\.trim, \(v\) => \(track\.trim = v\)\}/.test(T.trackStrip) && /bind:value=\{\(\) => track\.pan, \(v\) => \(track\.pan = v\)\}/.test(T.trackStrip) && /bind:faderValue=\{\(\) => model\.level, \(v\) => \(model\.level = v\)\}/.test(T.returnStrip) && /bind:faderValue=\{\(\) => model\.level, \(v\) => \(model\.level = v\)\}/.test(T.busStrip) && /bind:value=\{\(\) => model\.trim, \(v\) => \(model\.trim = v\)\}/.test(T.busStrip) && /bind:value=\{\(\) => model\.balance, \(v\) => \(model\.balance = v\)\}/.test(T.busStrip));
check("the send slot is id-agnostic and writes the slot it is given (the store's view when bound): the menu lists the Returns it is handed, defaulting to the fixture list", /export interface SlotState \{\s*to: string \| null;\s*level: number;\s*\}/.test(C.sendSlot.replace(/\n\s*\n/g, "\n")) && /returns = EFFECT_RETURNS,/.test(J.sendSlot) && /\{#each returns as ret \(ret\.id\)\}/.test(T.sendSlot) && /returns=\{track\.returns\}/.test(T.trackStrip) && /fixtureLevels=\{track\.loadedSendLevels\}/.test(T.trackStrip));
check("the module's fader / MUTE / SOLO are bindable with defaults, so the approved call sites and the playground are unchanged", count(J.module, /\$bindable\(/g) === 3 && /<Fader label=\{faderLabel\} bind:value=\{faderValue\} \/>/.test(T.module) && /bind:engaged=\{mute\}/.test(T.module) && /bind:engaged=\{solo\}/.test(T.module));
check("the playground still passes plain fixtures (no store, no `live`): the components fall back to their own seeded settings", !/live=|lib\/project/.test(S.devPinned + S.devRows) && /let \{\s*track,\s*laneId,\s*sources = SOURCE_TYPES,\s*live = null,\s*audio = null,\s*padded = false,\s*audioStatus = null,\s*\}/.test(J.arrangeRow));
check("the Arrange row keeps its approved contract (ScribbleSelect untouched; family / source / tier windows; the invariant) and only gains the optional binding", /live\?: TrackMetaLive \| null;/.test(J.arrangeRow) && /if \(!isValidSource\(family, model\.sourceTypeId, sources\)\) model\.sourceTypeId = null;/.test(J.arrangeRow) && /onchoose=\{chooseTier\}/.test(T.arrangeRow) && /import type \{ TrackMetaLive \} from "\.\/arrange-row-live";/.test(J.arrangeRow));

// --- 5. Scope. ----------------------------------------------------------------------------
const newCode = [C.model, C.session, C.store, C.stripLive, C.rowLive].join("\n");
const touchedCode = roomsAndWrappers.concat(["arrangeRow", "trackStrip", "sendSlot", "module", "returnStrip", "busStrip", "effect", "sendsIn", "mixer", "mixerChain", "returnChain", "busChain"]).map((k) => C[k]).join("\n");
const everythingCode = newCode + "\n" + touchedCode;
const everythingButStore = [C.model, C.session, C.stripLive, C.rowLive].join("\n") + "\n" + touchedCode;
check("no undo / redo, no autosave / persistence, no copy-paste outside the store's Task 3.3 delegation (lib/project/{history,persistence,clipboard,shell}.ts, guarded by check:editing); the store itself touches no storage", !/undo|redo|autosave|history\.push|snapshot|clipboard|copyTo|paste|localStorage|sessionStorage|indexedDB|fetch\(|XMLHttpRequest|WebSocket/i.test(everythingButStore.replace(/history\.replaceState/g, "")) && !/snapshot|localStorage|sessionStorage|indexedDB|fetch\(|XMLHttpRequest|WebSocket|structuredClone/i.test(ST));
check("no audio, DSP, analysis, playback, timers or randomness in the new or touched code; the store's only effect is the Task 3.3 observer (one $effect.root, reads every field, records untracked)", !/AudioContext|AudioWorklet|Analyser|AudioBuffer|createMediaStream|WebAudio|requestAnimationFrame|setInterval|setTimeout|Math\.random|performance\.now|Date\.now|svelte\/store|writable\(|readable\(|onMount/.test(everythingCode) && !/\$effect/.test(everythingButStore) && count(ST, /\$effect\.root\(/g) === 1 && count(ST, /\$effect\(/g) === 1 && /\$effect\.root\(\(\) => \{\s*\$effect\(\(\) => \{\s*for \(const f of fieldRegistry\) f\.get\(\);\s*untrack\(\(\) => history\.observe\(\)\);\s*\}\);\s*\}\);/.test(ST));
// D2.1.9 — rendered screws (classes, selectors, hooks), not the word in the standing-rule comments.
check("no screws, ever", !Object.values(S).some((src) => /(class=["'{][^"'}]*screw|\.[\w-]*screw[\w-]*\s*[{,:]|data-[\w-]*screw|__screw)/i.test(src)) && !/screw/i.test(newCode));
check("no new UI: no new component files in the Task 3.1 set (the new files are .ts shapes and the store), and the new files carry no markup or CSS", !/<\/[a-z]|<(div|span|section|button|svg|style|script|ol|li|aside)\b|class=|\.css/.test(newCode));
check("no dependency change", (() => { const pkg = JSON.parse(read("package.json")); return Object.keys(pkg.dependencies ?? {}).length === 0 && Object.keys(pkg.devDependencies).sort().join(",") === "@sveltejs/vite-plugin-svelte,@types/node,svelte,svelte-check,typescript,vite,vite-plugin-singlefile"; })());
check("npm exposes the check", /"check:project": "node scripts\/check-project-store-structure\.mjs"/.test(read("package.json")));

// --- Pins: the approved hardware this task must not change; the files this task
//     added or touched, as reviewed.
const pinned = {
  "src/components/hardware/Knob.svelte": "df6c51572f28d00ca07b98551914f8f11837df147d557c9113e94cd29732fdf6",
  "src/components/hardware/TactileSwitch.svelte": "9f8a61ff521988aff708ba7e860854c441343525c0eb43b11e92a534ce1a2ba9",
  "src/components/hardware/Lamp.svelte": "024d907589c1ab33b2b3c5cc8840347b9779450b61a60f67c34b045d4ac8010a",
  "src/components/hardware/EngravedLabel.svelte": "230ebcd7cf810d3096953e5131cb9cb3a89dd83f9f0e9cc0bcd934d2ca74fc29",
  "src/components/hardware/ScribbleSelect.svelte": "f0803769f208bca9bd18ff7b1982f9e918b8dde9597aae300879272657f4628a",
  "src/components/hardware/Fader.svelte": "b46e55ec95f4ddbe544175f7e0a340e7378a8cff3af674e431aad2a08d5be372",
  "src/components/hardware/VUMeter.svelte": "c3d850c80d9d53c70ed31c603fe23c011402f813e56bce963494086466347394",
  // added in Task 3.1, as reviewed
  "src/lib/project/model.ts": "7df7e5b93e21573d82f022ad46ab46245db01d9ba9e00ce780cb8ab27f4bc541",
  "src/lib/project/session.ts": "079a77226200f30858f9588aafa0cb50b30b5c182b8e15a63f0fe9231a4736d5",
    // Task 9.1.2 re-pinned this file: the store boots an EMPTY project instead of the
  // development session. Nothing was deleted from it; see the decision log (D9.1.2).
  "src/lib/project/store.svelte.ts": "034ff8091b56cc350cb396cfdda6ef1926d2ad15a400ad2ede3807189d87f36c",
  "src/components/channel-strip/strip-live.ts": "99603dc16c898e0887c24b5f821b8547ee747342138e8a8b0ebc63e48fa66c7b",
  "src/components/arrange-row-live.ts": "662d88b7d08f9fed17e36296434a48889ca511ac7d608848bd156ca9e63cc1f7",
  // touched in Task 3.1, as reviewed
  "src/components/channel-strip/return-live.ts": "837066bc8807932864997db3853d94c70eb6f3f23ec15c15efdb5526f46dfdab",
  "src/components/channel-strip/track-strip-fixtures.ts": "12620cb066dab631e521cf73bfedfef4ae7c2a72bb1b6fb84989742b89a68d46",
  "src/components/channel-strip/SendSlot.svelte": "67dbb6647329fc2354fae93b8e822c6df03e82e8674169a6a2e8ca3f2f009a60",
  "src/components/channel-strip/TrackStrip.svelte": "fbf545bd6b4039a4212bfbeb07eee0c91c69205d0754c4389b8acfd66fcb6ec5",
  "src/components/channel-strip/StripModule.svelte": "d302bbbcfb2be1538f19bc43284cffafe25a121ab4e0b2759838e5aa76cce75f",
  "src/components/channel-strip/ReturnStrip.svelte": "2ef1efc0f5debe7ccaabf7ee04e7f3ac8b7b2f9eea500f600da798e27c83f2af",
  "src/components/channel-strip/BusMasterStrip.svelte": "0b2187e0ffa445aabd372d5fc65e083016123c7667bc4fb34083d1162e5b1dd4",
  "src/components/ChannelBank.svelte": "92ef29ee45bd7aa99e9d45138aa1e6001e8c441d3c5d1dc0d7ab798029277c8e",
  "src/components/ArrangeTrackRow.svelte": "bf5a41e9459048695f05a6b56c4e5d271e5ddd0b1ab83696d3ac6025ddd21fd3",
  "src/rooms/ArrangeRoom.svelte": "151201bade03fb614483c92b3d0b55d25e8ecea67f25ee9166521858fa0de273",
  "src/rooms/MixerRoom.svelte": "837061893411c069d3546f7f7ef7f9d0a837673d47249e28ecbe43108f058b61",
  "src/components/mixer/MixerBank.svelte": "4f81961d110de391d5eed77ac3b033bcb0894b306975cef7e3137d22b81359d5",
  "src/components/mixer/MixerTrackStrip.svelte": "b5107fb09a39d9516ae57ca4254465d45cca2c4c6aaa4868fbb87917f1a36122",
  "src/components/mixer/MixerReturnStrip.svelte": "b9041f86f91553ecc9afe61dc5daa596eb28c81be2f2892c2c2e320254809109",
  "src/components/mixer/MixerBusStrip.svelte": "99da173205061bb936eb0053ec5bd94f8ad51ec2b96cf289f042e7e9351dabaf",
  "src/components/MixerDetailPanel.svelte": "5139693f9b7df182e4a65b62fc7138fb6d1eaaeb295fa25f67446f440e94b299",
  "src/components/mixer/ReturnDetail.svelte": "93780c268e6c428110acc0595186e0871d062ba5a4653584da4eba87500ab628",
  "src/components/mixer/BusDetail.svelte": "71c5ca0d04290da8b23f919fd1af00818adaf3617e34589524d4fb222ea5e77f",
  "src/components/mixer/EffectSection.svelte": "9c35887eaeb7c52ac88154a4ec832c6ea949e34d01c4ef40f860980daf4a4ef2",
  "src/components/mixer/SendsIn.svelte": "49e0892f09b0351a1f0099c089dbfb92863ddac2df5862bc8429c206d92a85e0",
  "src/lib/mixer.ts": "0ceea310a923f03ec526e842807220e75667b247facdc3ae7804a5495c1359a0",
  "src/lib/mixer-chain.ts": "818fb94f4560f173819dacb76bf42726db67b28a18eb7288dacdba74f67919d2",
  "src/lib/return-chain.ts": "8d955c33261d9bbb98d8444e67284779ef694a7d03b1643b79e57d18ee5a9f2c",
  "src/lib/bus-chain.ts": "52ef0107246646e89b008196545510a34f2ca9cf97ee5ad4508577ea1b0093e5",
};
for (const [rel, hash] of Object.entries(pinned)) {
  check(`approved file untouched: ${rel}`, exists(rel) && sha256(read(rel)) === hash, exists(rel) ? `sha256 ${sha256(read(rel)).slice(0, 16)}…` : "missing");
}

// --- Report. ------------------------------------------------------------------------
for (const name of passes) console.log(`  PASS  ${name}`);
for (const name of failures) console.error(`  FAIL  ${name}`);
console.log(`\nShared project model and store structural contract check — ${passes.length}/${passes.length + failures.length} passed`);
process.exit(failures.length ? 1 : 0);
