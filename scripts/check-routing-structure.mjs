#!/usr/bin/env node
/**
 * Routing graph and Auto / Manual plumbing structural contract check — Task 3.2.
 *
 * Dependency-free guard (Node built-ins only). It does NOT run the graph —
 * `npm test` does that (tests/routing.test.mjs, tests/store.test.mjs on the
 * real store) — it tests the source-level contract:
 *
 *   1. The RULES live in one pure module, lib/project/routing.ts: no Svelte,
 *      no state, no DOM, imports nothing but the model; it never writes;
 *      every verdict is a value with a plain-language message. Tracks and
 *      buses route to a bus or Master; a Return's output is fixed at Master
 *      and a Return is never a destination (owner, Task 3.2); dangling
 *      references, wrong-kind destinations, self-routes and loops (direct
 *      and indirect) are rejected; the graph's edges are outputs AND sends;
 *      sidechains are a documented future edge kind, not an implemented one.
 *   2. The STORE validates FIRST and writes only an accepted verdict, so a
 *      rejected route leaves the project unchanged by construction; there
 *      is no Return output operation; the reads delegate to the module.
 *   3. AUTO / MANUAL: the Task 2.8 ownership rules stand on the shared
 *      state — a turned knob makes only that parameter Manual, a same-value
 *      write is not a turn, return-to-Auto changes the mode only (D2.8,
 *      kept by the owner for Task 3.2); sends carry their own mode (plan
 *      §5), seeded Auto, Manual when the knob moves on an assigned slot.
 *   4. NO UI: no component imports the routing module, no output control
 *      exists, the strips bind nothing new; the 3.1 UI files are pinned.
 *   5. TESTS: node:test over the project's own TypeScript via the
 *      typescript + svelte/compiler already in devDependencies — no new
 *      dependency; the required cases exist by name; `npm test` is wired.
 *
 * Run: npm run check:routing
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
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
  routing: "src/lib/project/routing.ts",
  model: "src/lib/project/model.ts",
  session: "src/lib/project/session.ts",
  store: "src/lib/project/store.svelte.ts",
  mixerChain: "src/lib/mixer-chain.ts",
  stripLive: "src/components/channel-strip/strip-live.ts",
  returnLive: "src/components/channel-strip/return-live.ts",
  sendSlot: "src/components/channel-strip/SendSlot.svelte",
  trackStrip: "src/components/channel-strip/TrackStrip.svelte",
  panel: "src/components/MixerDetailPanel.svelte",
  busDetail: "src/components/mixer/BusDetail.svelte",
  loader: "tests/loader.mjs",
  register: "tests/register.mjs",
  routingTests: "tests/routing.test.mjs",
  storeTests: "tests/store.test.mjs",
  pkg: "package.json",
};
for (const rel of Object.values(FILES)) check(`file exists: ${rel}`, exists(rel));
if (failures.length) {
  for (const f of failures) console.error(`  FAIL  ${f}`);
  process.exit(1);
}

const S = Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, read(rel)]));
const isSvelte = (k) => FILES[k].endsWith(".svelte");
const J = Object.fromEntries(Object.entries(S).map(([k, src]) => [k, isSvelte(k) ? scriptOf(src) : src]));
const T = Object.fromEntries(Object.entries(S).map(([k, src]) => [k, isSvelte(k) ? templateOf(src) : ""]));
const C = Object.fromEntries(Object.entries(J).map(([k, src]) => [k, stripComments(src)]));
const R = C.routing;
const ST = C.store;
const M = C.model;
const MC = C.mixerChain;
const pkg = JSON.parse(S.pkg);

// --- 1. The rules, pure. ------------------------------------------------------------------
check("routing.ts is pure: no Svelte, no state, no DOM, no timers; its only import is the model", !/\$state|\$derived|\$effect|svelte|document|window|setTimeout|setInterval|Math\.random|Date\.now/.test(R) && count(R, /^import /gm) === 1 && /^import \{[\s\S]*?\} from "\.\/model";/m.test(R));
check("routing.ts never writes: no assignment to an output or a send, no mutation helpers, no throw — verdicts are values", !/\.output\s*=[^=]|\.to\s*=[^=]|\.push\(\s*\)|structuredClone|Object\.assign|throw /.test(R.replace(/const out = new Map|list\.push\(e\.to\)|edges\.push\(|path\.push\(|walk\.push\(|stack\.push\(/g, "")));
check("the graph's input is structural (RoutingProject: tracks with sends, returns, buses) so a Project and a three-line test fixture both fit", /export interface RoutingProject \{\s*readonly tracks: readonly RoutingTrackNode\[\];\s*readonly returns: readonly RoutingReturnNode\[\];\s*readonly buses: readonly RoutingBusNode\[\];\s*\}/.test(R.replace(/\n\s*\n/g, "\n")) && /export interface RoutingTrackNode extends RoutingNode \{\s*readonly id: TrackId;\s*readonly channel: \{ readonly sends: readonly \{ readonly to: ReturnBusId \| null \}\[\] \};\s*\}/.test(R.replace(/\n\s*\n/g, "\n")) && /export interface RoutingNode \{\s*readonly id: ChannelId;\s*readonly name: string;\s*readonly output: OutputRef;\s*\}/.test(R.replace(/\n\s*\n/g, "\n")));
check("edges are outputs and sends — and nothing else yet: RoutingEdgeKind is exactly \"output\" | \"send\"; sidechains are not modelled (the word appears only in comments)", /export type RoutingEdgeKind = "output" \| "send";/.test(R) && !/sidechain/i.test(R) && /sidechain/i.test(S.routing) && /export interface RoutingEdge \{\s*readonly from: ChannelId;\s*readonly to: RoutingNodeId;\s*readonly kind: RoutingEdgeKind;\s*\}/.test(R.replace(/\n\s*\n/g, "\n")) && /export function routingEdges\(project: RoutingProject\): RoutingEdge\[\]/.test(R) && /if \(slot\.to !== null\) edges\.push\(\{ from: t\.id, to: slot\.to, kind: "send" \}\);/.test(R));
check("the verdict is a discriminated value with a reason, a ready-to-print message and a path; the reasons are exactly the six", /export type RoutingRejectionReason =\s*\| "unknown-source"\s*\| "unknown-destination"\s*\| "destination-not-a-bus"\s*\| "self-route"\s*\| "return-output-fixed"\s*\| "cycle";/.test(R) && /export interface RoutingAccepted \{\s*readonly ok: true;\s*readonly reason: null;\s*readonly message: string;\s*readonly path: readonly RoutingNodeId\[\];\s*\}/.test(R.replace(/\n\s*\n/g, "\n")) && /export interface RoutingRejected \{\s*readonly ok: false;\s*readonly reason: RoutingRejectionReason;\s*readonly message: string;\s*readonly path: readonly RoutingNodeId\[\];\s*\}/.test(R.replace(/\n\s*\n/g, "\n")) && /export type RoutingVerdict = RoutingAccepted \| RoutingRejected;/.test(R));
check("validateRoute(project, source, to) applies the rules in order: source exists → destination is Master or an existing bus → not itself → a Return stays on Master → no loop", (() => {
  const body = R.slice(R.indexOf("export function validateRoute("), R.indexOf("export function destinationsFor("));
  const at = (re) => body.search(re);
  const i1 = at(/rejected\("unknown-source"/), i2 = at(/rejected\("destination-not-a-bus"/), i3 = at(/rejected\("unknown-destination"/), i4 = at(/rejected\("self-route"/), i5 = at(/rejected\("return-output-fixed"/), i6 = at(/rejected\("cycle"/);
  return /export function validateRoute\(project: RoutingProject, source: ChannelId, to: OutputRef\): RoutingVerdict \{/.test(body) && i1 >= 0 && i1 < i2 && i2 < i3 && i3 < i4 && i4 < i5 && i5 < i6 && /if \(!isBusId\(to\)\) \{/.test(body) && /if \(!project\.buses\.some\(\(b\) => b\.id === to\)\) return rejected\("unknown-destination"/.test(body) && /if \(to === source\) return rejected\("self-route"/.test(body) && /if \(isReturnBusId\(source\) && to !== MASTER_OUTPUT\) \{/.test(body);
})());
check("the loop rule walks the destination's output chain and rejects when it meets the source (direct or indirect), and reports a graph that already loops instead of walking forever", (() => {
  const body = R.slice(R.indexOf("export function validateRoute("), R.indexOf("export function destinationsFor("));
  return /let cursor: RoutingNodeId = to;\s*while \(cursor !== MASTER_OUTPUT\) \{/.test(body) && /if \(cursor === source\) return rejected\("cycle", `\$\{arrow\(project, walk\)\} would loop`, walk\);/.test(body) && /if \(seen\.has\(cursor\)\) return rejected\("cycle", `\$\{arrow\(project, walk\)\} already loops`, walk\);/.test(body) && /seen\.add\(cursor\);/.test(body);
})());
check("validateGraph checks the whole project: duplicate ids, self-routes, wrong-kind and dangling outputs, Returns off Master, dangling sends, then a depth-first search over every edge for a loop", /export function validateGraph\(project: RoutingProject\): RoutingVerdict \{/.test(R) && /duplicate channel id/.test(R) && /routes to a bus that does not exist/.test(R) && /sends to a Return that does not exist/.test(R) && /if \(isReturnBusId\(node\.id\)\) return rejected\("return-output-fixed"/.test(R) && /const state = new Map<string, "open" \| "done">\(\);/.test(R) && /if \(s === "open"\) \{\s*const loop = \[\.\.\.stack\.slice\(stack\.indexOf\(id\)\), id\];\s*return rejected\("cycle", `\$\{arrow\(project, loop\)\} loops`, loop\);/.test(R) && /for \(const e of routingEdges\(project\)\)/.test(R));
check("routeOf reads a channel's chain to Master, itself first, and stops at Master, a dangling reference or a repeat", /export function routeOf\(project: RoutingProject, id: ChannelId\): RoutingNodeId\[\] \{\s*const path: RoutingNodeId\[\] = \[id\];\s*const seen = new Set<string>\(\[id\]\);/.test(R) && /if \(next === MASTER_OUTPUT \|\| seen\.has\(next\)\) break;/.test(R));
check("destinationsFor offers Master and every bus, each with its verdict — valid ones to offer, the rest explained (owner: both)", /export function destinationsFor\(project: RoutingProject, source: ChannelId\): RoutingDestination\[\] \{\s*const candidates: OutputRef\[\] = \[MASTER_OUTPUT, \.\.\.project\.buses\.map\(\(b\) => b\.id\)\];\s*return candidates\.map\(\(id\) => \(\{ id, name: routingName\(project, id\), verdict: validateRoute\(project, source, id\) \}\)\);/.test(R) && /export interface RoutingDestination \{\s*readonly id: OutputRef;\s*readonly name: string;\s*readonly verdict: RoutingVerdict;\s*\}/.test(R.replace(/\n\s*\n/g, "\n")));
check("the messages are plain language, ready to print: \"Rejected: …\", \"Routed: …\", names by printed name with → arrows, the Return rule cites plan §8a", /message: `Rejected: \$\{message\}`/.test(R) && /const text = unchanged \? "Unchanged" : "Routed";/.test(R) && /path\.map\(\(id\) => routingName\(project, id\)\)\.join\(" \\u2192 "\)/.test(R) && /a Return always routes to Master \(plan \\u00a78a\)/.test(R) && /cannot route into itself/.test(R) && /export const MASTER_NAME = "Master";/.test(R));
check("only tracks and buses are routable (isRoutable); the Master sink is the model's MASTER_OUTPUT, never a second constant", /export function isRoutable\(id: string\): id is TrackId \| BusId \{\s*return isTrackId\(id\) \|\| isBusId\(id\);\s*\}/.test(R) && !/"master"/.test(R.replace(/typeof MASTER_OUTPUT/g, "")));

// --- 2. The store: validate first, write only an accepted route. ---------------------------
check("the store imports the rules and nothing re-implements them (no walk, no set in the store)", /import \{\s*destinationsFor,\s*routeOf,\s*validateGraph,\s*validateRoute,\s*type RoutingDestination,\s*type RoutingNodeId,\s*type RoutingVerdict,\s*\} from "\.\/routing";/.test(ST) && !/while \(|new Set</.test(ST));
check("setTrackOutput: known track (throws otherwise), validateRoute first, the reference written only for `ok` and only if it changes, the verdict returned", /setTrackOutput\(id: TrackId, to: OutputRef\): RoutingVerdict \{\s*const t = mustTrack\(id\);\s*const verdict = validateRoute\(state, id, to\);\s*if \(verdict\.ok && t\.output !== to\) t\.output = to;\s*return verdict;\s*\},/.test(ST));
check("setBusOutput: the same shape for bus-to-bus chaining", /setBusOutput\(id: BusId, to: OutputRef\): RoutingVerdict \{\s*const b = mustBus\(id\);\s*const verdict = validateRoute\(state, id, to\);\s*if \(verdict\.ok && b\.output !== to\) b\.output = to;\s*return verdict;\s*\},/.test(ST));
check("those are the only two writes of an output reference anywhere in the store, and no Return output operation exists", count(ST, /\.output = /g) === 2 && count(ST, /if \(verdict\.ok && [tb]\.output !== to\) [tb]\.output = to;/g) === 2 && !/setReturnOutput|r\.output =|ret\.output =/.test(ST));
check("the routing reads delegate: routeOf, destinationsFor, validateRouting", /routeOf\(id: ChannelId\): RoutingNodeId\[\] \{\s*return routeOf\(state, id\);/.test(ST) && /destinationsFor\(id: ChannelId\): RoutingDestination\[\] \{\s*return destinationsFor\(state, id\);/.test(ST) && /validateRouting\(\): RoutingVerdict \{\s*return validateGraph\(state\);/.test(ST));
check("the model holds references only: OutputRef on tracks, Returns and buses, no graph words, no rule", /export type OutputRef = BusId \| "master";/.test(M) && count(M, /output: OutputRef;/g) === 3 && !/graph|cycle|validate|loop/i.test(M));
check("the Return's live binding and its strip shape expose no output; the Return keeps id, kind, sends and chain (nothing in 3.2 touches ReturnBus)", !/output/.test(C.returnLive) && !/output/.test(ST.slice(ST.indexOf("export function returnLive("), ST.indexOf("export function returnStripOf("))) && /export interface ReturnBus \{\s*readonly kind: "return";\s*readonly id: ReturnBusId;/.test(M.replace(/\n\s*\n/g, "\n")));

// --- 3. Auto / Manual on the shared state. -----------------------------------------------
check("the Task 2.8 write rules stand: setParamValue moves the value and makes THAT parameter Manual; setMode / setAllModes write modes only (return-to-Auto keeps the value — D2.8, owner for 3.2); setCharacter the same", /export function setParamValue\(param: ChainParam, value: number\): void \{\s*const r = knobRange\(param\.spec\);\s*const next = param\.spec\.taper === "linear" \? Math\.min\(r\.max, Math\.max\(r\.min, value\)\) : value;\s*param\.value = next;\s*param\.mode = "manual";\s*\}/.test(MC) && /export function setMode\(param: ChainParam \| CharacterParam, mode: Mode\): void \{\s*param\.mode = mode;\s*\}/.test(MC) && /export function setAllModes\(params: readonly \(ChainParam \| CharacterParam\)\[\], mode: Mode\): void \{\s*for \(const p of params\) p\.mode = mode;\s*\}/.test(MC) && /export function setCharacter\(comp: CompState, id: CharacterId\): void \{\s*comp\.character\.value = id;\s*comp\.character\.mode = "manual";\s*\}/.test(MC) && !/\.value = [a-z.]*original/.test(MC));
check("every parameter keeps value, original and mode (ChainParam / CharacterParam); nothing writes `original`", /export interface ChainParam \{\s*readonly spec: ParamSpec;\s*value: number;\s*readonly original: number;\s*mode: Mode;\s*\}/.test(MC.replace(/\n\s*\n/g, "\n")) && !/\.original\s*=[^=]/.test(MC + ST + R));
check("the Return strip's binding treats a same-value write as no turn (Task 2.9 rule on the shared chain)", /if \(next !== chain\.time\.value\) setParamValue\(chain\.time, next\);/.test(ST) && /if \(next !== chain\.second\.value\) setParamValue\(chain\.second, next\);/.test(ST) && /if \(next !== chain\.tone\.value\) setParamValue\(chain\.tone, next\);/.test(ST));
check("sends carry their own Auto / Manual mode (plan §5): SendSlot { to, level, mode }, seeded Auto by the session", /export interface SendSlot \{\s*to: ReturnBusId \| null;\s*level: number;\s*mode: Mode;\s*\}/.test(M.replace(/\n\s*\n/g, "\n")) && /import type \{ ChainState, Mode \} from "\.\.\/mixer-chain";/.test(M) && count(C.session, /mode: "auto"/g) === 2);
check("the send knob makes an assigned send Manual (a same-value write is not a turn; an unassigned slot owns nothing); setSendMode writes the mode only", /setSendLevel\(id: TrackId, slot: number, value: number\): void \{\s*const t = mustTrack\(id\);\s*const s = t\.channel\.sends\[mustSlot\(t, slot\)\];\s*const next = clamp\(value, SEND_RANGE\);\s*if \(next === s\.level\) return;\s*s\.level = next;\s*if \(s\.to !== null && s\.mode !== "manual"\) s\.mode = "manual";\s*\},/.test(ST) && /setSendMode\(id: TrackId, slot: number, mode: Mode\): void \{\s*const t = mustTrack\(id\);\s*const s = t\.channel\.sends\[mustSlot\(t, slot\)\];\s*if \(s\.mode !== mode\) s\.mode = mode;\s*\},/.test(ST));
check("assigning a Return (the strip writes the level first): at the Return's loaded level the send is Auto, at a carried level Manual, a cleared slot Auto", /if \(s\.to === to\) return;\s*s\.to = to;\s*const loaded = to === null \? SEND_RANGE\.min : \(t\.loadedSendLevels\[to\] \?\? DEFAULT_SEND_LEVEL\);\s*const mode: Mode = to === null \|\| s\.level === loaded \? "auto" : "manual";\s*if \(s\.mode !== mode\) s\.mode = mode;/.test(ST) && /DEFAULT_SEND_LEVEL,/.test(ST));

// --- 4. No UI. ------------------------------------------------------------------------------
{
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = resolve(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.svelte$/.test(entry)) files.push(full);
    }
  };
  walk(resolve(root, "src"));
  const importers = files.filter((f) => /project\/routing/.test(readFileSync(f, "utf8")));
  check("no component or room imports the routing module — no output field, no rejection line, no new control in this build (owner)", importers.length === 0, importers.map((f) => f.slice(root.length + 1)).join(", "));
  const outputControls = files.filter((f) => /data-select="output"|label="Output"|setTrackOutput|setBusOutput|destinationsFor/.test(readFileSync(f, "utf8")));
  check("no output control anywhere in the markup", outputControls.length === 0, outputControls.map((f) => f.slice(root.length + 1)).join(", "));
}
check("the strips bind nothing new: SendSlotLive stays { to, level }; the send slot's markup knows no mode; the bus detail still prints the output it is given", /export interface SendSlotLive \{\s*to: string \| null;\s*level: number;\s*\}/.test(C.stripLive.replace(/\n\s*\n/g, "\n")) && !/mode/.test(T.sendSlot) && /project\.outputLabel\(bus\.output\)/.test(J.busDetail) && /busOutput/.test(J.panel));

// --- 5. Tests, wired without a new dependency. ------------------------------------------------
check("the test hooks use only what is already installed: typescript's transpileModule and svelte/compiler's compileModule, registered through node:module", /import ts from "typescript";/.test(S.loader) && /import \{ compileModule \} from "svelte\/compiler";/.test(S.loader) && /ts\.transpileModule\(source,/.test(S.loader) && /compileModule\(outputText, \{ filename: [^}]*generate: "client" \}\)/.test(S.loader) && /import \{ register \} from "node:module";\s*register\("\.\/loader\.mjs", import\.meta\.url\);/.test(S.register) && !/vitest|jest|mocha|tsx|ts-node|esbuild/.test(S.loader + S.register + S.routingTests + S.storeTests));
check("npm test runs both files with node:test; the tests import the real routing module and the real store", /^node --import \.\/tests\/register\.mjs --test tests\/routing\.test\.mjs tests\/store\.test\.mjs( tests\/[a-z-]+\.test\.mjs)*$/.test(pkg.scripts.test) && /import \{ test \} from "node:test";/.test(S.routingTests) && /await import\("\.\.\/src\/lib\/project\/routing\.ts"\)/.test(S.routingTests) && /await import\("\.\.\/src\/lib\/project\/store\.svelte\.ts"\)/.test(S.storeTests));
const required = [
  ["valid Track → Bus → Master", S.routingTests],
  ["valid Bus → Bus → Master", S.routingTests],
  ["a missing bus id is a dangling reference", S.routingTests],
  ["a track or a Return is not a destination", S.routingTests],
  ["a bus cannot route into itself", S.routingTests],
  ["a direct cycle", S.routingTests],
  ["an indirect cycle", S.routingTests],
  ["a Return's output is fixed at Master", S.routingTests],
  ["validation never writes", S.routingTests],
  ["a rejected route leaves the project exactly as it was", S.storeTests],
  ["read by every face of the store", S.storeTests],
  ["Return ids, kinds, sends-in lists and chains are untouched", S.storeTests],
  ["makes only that parameter Manual", S.storeTests],
  ["changes ownership only — the value stays", S.storeTests],
  ["Manual values survive unrelated edits", S.storeTests],
  ["the knob makes the send Manual", S.storeTests],
  ["one store: the Console view, the Arrange row and the Mixer lookup", S.storeTests],
];
for (const [title, src] of required) check(`a test exists: ${title}`, src.includes(title));
check("the tests assert, they do not log: every test has at least one assertion and no console output", count(S.routingTests + S.storeTests, /\btest\(/g) >= 30 && !/console\.log/.test(S.routingTests + S.storeTests));

// --- Scope. -------------------------------------------------------------------------------------
const routingCode = [R, M, C.session, S.loader, S.register].join("\n");
check("no undo / redo, autosave, persistence, copy-paste, sidechain or audio anywhere in the 3.2 routing code (Task 7.2 added the sidechain FIELD to the model only, with its own validator — the routing module and the store still have none); the store names history and the clipboard only by delegation to the Task 3.3 modules (check:editing) and touches no storage, timers or clocks itself", !/undo|redo|autosave|localStorage|sessionStorage|indexedDB|clipboard|copyTo|paste|AudioContext|AudioWorklet|requestAnimationFrame|setInterval|setTimeout|Math\.random|performance\.now|Date\.now/i.test(routingCode) && !/localStorage|sessionStorage|indexedDB|AudioContext|AudioWorklet|requestAnimationFrame|setInterval|setTimeout|Math\.random|performance\.now|Date\.now/i.test(ST) && !/sidechain/i.test(R + ST + C.session) && /readonly sidechains\?: readonly SidechainEdge\[\];/.test(M));
check("no screws, ever", !/screw/i.test(S.routing + S.routingTests + S.storeTests + S.loader));
check("no dependency change", Object.keys(pkg.dependencies ?? {}).length === 0 && Object.keys(pkg.devDependencies).sort().join(",") === "@sveltejs/vite-plugin-svelte,@types/node,svelte,svelte-check,typescript,vite,vite-plugin-singlefile");
check("npm exposes the check", pkg.scripts["check:routing"] === "node scripts/check-routing-structure.mjs");

// --- Pins: the approved hardware; the Task 3.1 UI this task must not touch; the 3.2 files as reviewed.
const pinned = {
  "src/components/hardware/Knob.svelte": "df6c51572f28d00ca07b98551914f8f11837df147d557c9113e94cd29732fdf6",
  "src/components/hardware/TactileSwitch.svelte": "9f8a61ff521988aff708ba7e860854c441343525c0eb43b11e92a534ce1a2ba9",
  "src/components/hardware/Lamp.svelte": "024d907589c1ab33b2b3c5cc8840347b9779450b61a60f67c34b045d4ac8010a",
  "src/components/hardware/EngravedLabel.svelte": "230ebcd7cf810d3096953e5131cb9cb3a89dd83f9f0e9cc0bcd934d2ca74fc29",
  "src/components/hardware/ScribbleSelect.svelte": "f0803769f208bca9bd18ff7b1982f9e918b8dde9597aae300879272657f4628a",
  "src/components/hardware/Fader.svelte": "b46e55ec95f4ddbe544175f7e0a340e7378a8cff3af674e431aad2a08d5be372",
  "src/components/hardware/VUMeter.svelte": "c3d850c80d9d53c70ed31c603fe23c011402f813e56bce963494086466347394",
  // Task 3.1 UI and shapes this task leaves alone (no UI in 3.2)
  "src/components/channel-strip/strip-live.ts": "99603dc16c898e0887c24b5f821b8547ee747342138e8a8b0ebc63e48fa66c7b",
  "src/components/channel-strip/return-live.ts": "837066bc8807932864997db3853d94c70eb6f3f23ec15c15efdb5526f46dfdab",
  "src/components/channel-strip/SendSlot.svelte": "67dbb6647329fc2354fae93b8e822c6df03e82e8674169a6a2e8ca3f2f009a60",
  "src/components/channel-strip/TrackStrip.svelte": "fbf545bd6b4039a4212bfbeb07eee0c91c69205d0754c4389b8acfd66fcb6ec5",
  "src/components/MixerDetailPanel.svelte": "5139693f9b7df182e4a65b62fc7138fb6d1eaaeb295fa25f67446f440e94b299",
  "src/components/mixer/BusDetail.svelte": "71c5ca0d04290da8b23f919fd1af00818adaf3617e34589524d4fb222ea5e77f",
  "src/lib/mixer-chain.ts": "818fb94f4560f173819dacb76bf42726db67b28a18eb7288dacdba74f67919d2",
  // added / touched in Task 3.2, as reviewed
  "src/lib/project/routing.ts": "f5479a9e7013514fdfbc09ba1914cc88f78fdfa6f146c3773d1d5eb7a0740588",
  "src/lib/project/model.ts": "7df7e5b93e21573d82f022ad46ab46245db01d9ba9e00ce780cb8ab27f4bc541",
  "src/lib/project/session.ts": "079a77226200f30858f9588aafa0cb50b30b5c182b8e15a63f0fe9231a4736d5",
  "src/lib/project/store.svelte.ts": "350d510d6d43fe679680731f1b5b11668fa5bbc065c51f781b624873fb2aaec2",
  "tests/loader.mjs": "51a401d95b0f35584ca7bce2dd564346ba6c1c2c066eeffa51ebd1ad5da15451",
  "tests/register.mjs": "80ef952e463fa5bf7eb9bf1b0a11dcbe5fe32e3a86391c2d596f6f41a8de7b56",
  "tests/routing.test.mjs": "bc389e8869b20fb0dc98ffa77e88d67c7c4c959622669fc7db7b7be96b37676d",
  "tests/store.test.mjs": "fa8e95472b1bdd2af0d7094093cf4ed970a032d07c6d68ea971824bb65b61103",
};
for (const [rel, hash] of Object.entries(pinned)) {
  check(`approved file untouched: ${rel}`, exists(rel) && sha256(read(rel)) === hash, exists(rel) ? `sha256 ${sha256(read(rel)).slice(0, 16)}…` : "missing");
}

// --- Report. ------------------------------------------------------------------------
for (const name of passes) console.log(`  PASS  ${name}`);
for (const name of failures) console.error(`  FAIL  ${name}`);
console.log(`\nRouting graph and Auto / Manual plumbing structural contract check — ${passes.length}/${passes.length + failures.length} passed`);
process.exit(failures.length ? 1 : 0);
