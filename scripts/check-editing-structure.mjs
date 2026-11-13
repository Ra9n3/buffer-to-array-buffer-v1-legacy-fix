#!/usr/bin/env node
/**
 * ALLOY — Task 3.3 structural contract: undo / redo, autosave foundations,
 * channel-settings copy / paste.
 *
 * What this guards (plan §4 undo / redo + copy-paste + shortcuts; §11 autosave
 * and the manifest; L565 a separate persistence module; owner answers, Task 3.3):
 *
 *   1. The field registry is the ONE boundary: every editable leaf of the
 *      project by stable path; the copyable subset is exactly the documented
 *      one (channel trim / pan / balance / level + the whole chain, value AND
 *      mode); identity, routing, sends, mute and solo are never copied; no
 *      selection, scroll, fixture or presentation state is a field.
 *   2. History is a pure module (no Svelte, no DOM, no timers — the clock is
 *      injected), diff-based, one entry per synchronous block, coalescing
 *      only with a clock inside 1000 ms, limit 200, restores never recorded,
 *      a new entry clears redo.
 *   3. Persistence is a pure module: a stable manifest (schema'd, no
 *      timestamp), injected storage + scheduler, a save lifecycle that never
 *      says "saved" without a successful write and skips unchanged text.
 *   4. The clipboard is in-app only (no navigator.clipboard), validates the
 *      whole payload before writing anything, and the store wraps a paste in
 *      one history transaction. No copy / paste UI exists.
 *   5. The shell is the only browser wiring: shortcuts (Ctrl / Cmd + Z,
 *      + Shift + Z, Ctrl + Y) with the text-entry exemption, autosave to
 *      localStorage write-only (never a restore on load), `window.alloy` only
 *      behind `?debug`. main.ts installs it once; nothing else imports it.
 *   6. No visible undo / redo / clipboard control anywhere in the UI; the
 *      rooms, components and App are untouched by this task; D2.8
 *      return-to-Auto is unchanged (mixer-chain.ts pinned by check:routing).
 *   7. Tests exist and run under `npm test`; no screws anywhere.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(resolve(root, rel), "utf8");
const exists = (rel) => existsSync(resolve(root, rel));
const sha256 = (text) => createHash("sha256").update(text.replace(/\r\n/g, "\n")).digest("hex");

const failures = [];
const passes = [];
function check(name, condition, detail = "") {
  const line = detail ? `${name} — ${detail}` : name;
  (condition ? passes : failures).push(line);
}
const count = (text, re) => (text.match(re) ?? []).length;
const scriptOf = (svelte) => (svelte.match(/<script lang="ts">([\s\S]*?)<\/script>/) ?? [])[1] ?? "";
const templateOf = (svelte) => svelte.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style>[\s\S]*<\/style>/, "");
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--[\s\S]*?-->/g, "").replace(/^\s*\/\/.*$/gm, "");
const walk = (dir, out = []) => {
  for (const name of readdirSync(resolve(root, dir))) {
    const rel = join(dir, name);
    if (statSync(resolve(root, rel)).isDirectory()) walk(rel, out);
    else out.push(rel);
  }
  return out;
};

// --- Files. ------------------------------------------------------------------------------
const FILES = {
  fields: "src/lib/project/fields.ts",
  history: "src/lib/project/history.ts",
  persistence: "src/lib/project/persistence.ts",
  clipboard: "src/lib/project/clipboard.ts",
  shell: "src/lib/project/shell.ts",
  // Task 10.1: the typing-target predicate moved here from the shell (a pure
  // function the follow control needs in a component; the shell re-exports it).
  textEntry: "src/lib/text-entry.ts",
  store: "src/lib/project/store.svelte.ts",
  main: "src/main.ts",
  mixerChain: "src/lib/mixer-chain.ts",
  historyTests: "tests/history.test.mjs",
  persistenceTests: "tests/persistence.test.mjs",
  clipboardTests: "tests/clipboard.test.mjs",
  editingTests: "tests/editing.test.mjs",
  shellTests: "tests/shell.test.mjs",
  loader: "tests/loader.mjs",
  pkg: "package.json",
  dataModel: "data-model.md",
};
for (const rel of Object.values(FILES)) check(`file exists: ${rel}`, exists(rel));
if (failures.length) {
  for (const f of failures) console.error(`  FAIL  ${f}`);
  process.exit(1);
}
const S = Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, read(rel)]));
const C = Object.fromEntries(Object.entries(S).map(([k, src]) => [k, stripComments(src)]));
const F = C.fields;
const H = C.history;
const P = C.persistence;
const CB = C.clipboard;
const SH = C.shell;
const ST = C.store;
const pkg = JSON.parse(S.pkg);

// --- 1. The field registry. -------------------------------------------------------------
check("a FieldRef: stable path `<channelId>/<rel>`, channel, rel, group, copyable, type, label, get / set", /export interface FieldRef \{\s*readonly path: string;\s*readonly channel: ChannelId;\s*readonly rel: string;\s*readonly group: FieldGroup;\s*readonly copyable: boolean;\s*readonly type: FieldType;\s*readonly label: string;\s*get\(\): FieldValue;\s*set\(value: FieldValue\): void;\s*\}/.test(F.replace(/\n\s*\n/g, "\n")) && /path: `\$\{ctx\.channel\.id\}\/\$\{rel\}`/.test(F));
check("field groups are identity · channel · send · routing · chain; values are number | boolean | string | null with typed validation (number range, boolean, enum, ref, text) and sameValue", /export type FieldGroup = "identity" \| "channel" \| "send" \| "routing" \| "chain";/.test(F) && /export type FieldValue = number \| boolean \| string \| null;/.test(F) && /export function isValidValue\(type: FieldType, value: FieldValue\): boolean/.test(F) && /export function sameValue\(a: FieldValue, b: FieldValue\): boolean/.test(F) && /kind: "number"/.test(F) && /kind: "boolean"/.test(F) && /kind: "enum"/.test(F) && /kind: "ref"/.test(F) && /kind: "text"/.test(F));
check("the registry is built from the live project (channelFields · projectFields · fieldsOf) — tracks, then Returns, then buses; channels are never added or removed", /export function channelFields\(channel: Channel\): FieldRef\[\]/.test(F) && /export function projectFields\(project: Project\): FieldRef\[\]/.test(F) && /export function fieldsOf\(fields: readonly FieldRef\[\], channel: ChannelId\): FieldRef\[\]/.test(F) && /for \(const t of project\.tracks\) trackFields\(t, out\);\s*for \(const r of project\.returns\) returnFields\(r, out\);\s*for \(const b of project\.buses\) busFields\(b, out\);/.test(F));
check("COPYABLE boundary — copied: channel trim · pan · balance · level and every chain field (bypass, parameter value AND mode, character value AND mode)", /field\(ctx, "channel\/trim", "channel", true,/.test(F) && /field\(ctx, "channel\/pan", "channel", true,/.test(F) && /field\(ctx, "channel\/balance", "channel", true,/.test(F) && count(F, /field\(ctx, "channel\/level", "channel", true,/g) === 3 && /field\(ctx, `\$\{rel\}\/value`, "chain", true,[\s\S]*?field\(ctx, `\$\{rel\}\/mode`, "chain", true,/.test(F) && /field\(ctx, "chain\/eq\/bypassed", "chain", true,/.test(F) && /field\(ctx, "chain\/comp\/bypassed", "chain", true,/.test(F) && /field\(ctx, "chain\/bypassed", "chain", true,/.test(F) && !/"chain", false/.test(F));
check("COPYABLE boundary — never copied: identity (family, source type, priority, tier confirmation), output routing, the send slots, mute, solo", /field\(ctx, "familyId", "identity", false,/.test(F) && /field\(ctx, "sourceTypeId", "identity", false,/.test(F) && /field\(ctx, "priority", "identity", false,/.test(F) && /field\(ctx, "tierConfirmed", "identity", false,/.test(F) && count(F, /field\(ctx, "output", "routing", false,/g) === 2 && /field\(ctx, `sends\/\$\{i\}\/to`, "send", false,/.test(F) && /field\(ctx, `sends\/\$\{i\}\/level`, "send", false,/.test(F) && /field\(ctx, `sends\/\$\{i\}\/mode`, "send", false,/.test(F) && count(F, /field\(ctx, "channel\/mute", "channel", false,/g) === 3 && count(F, /field\(ctx, "channel\/solo", "channel", false,/g) === 3 && !/"identity", true|"routing", true|"send", true/.test(F));
check("a Return registers no output (fixed to Master, Task 3.2) and no identity; nothing registers id, code, kind, type, name, org, role, effect, original values, loaded send levels, display or the arrangement", !/"output", "routing", false, \{ kind: "ref", nullable: false \}, "output", \(\) => r\.output/.test(F) && !/field\(ctx, "(id|code|kind|type|name|org|role|effect|original|loadedSendLevels|display|short)"/.test(F) && !/arrangement|sections|tempoMarkers|clips|barCount/.test(F) && !/r\.output|\.original\b.*=>|loadedSendLevels/.test(F.replace(/readonly original/g, "")));
check("no selection, scroll, open-panel or any other room-local state is a field; the registry imports no component or room (only the approved range constants, as the store does)", !/selected|selection|scroll|hover|focus|expanded|openPanel|activeRoom/i.test(F) && !/\.svelte"|rooms\//.test(F) && /from "\.\.\/\.\.\/components\/channel-strip\/track-strip-fixtures";/.test(F) && !/\$state|\$derived|\$effect|from "svelte/.test(F));
check("the registry's set paths go through the store-equivalent writes: the chain setters write value / mode only (no reset to original — D2.8 return-to-Auto is ownership only)", !/\.value = param\.original|= p\.original|\.original;/.test(F) && /\(v\) => \{\s*param\.value = v as number;/.test(F) && /\(v\) => \{\s*param\.mode = v as ChainParam\["mode"\];/.test(F));

// --- 2. History. ----------------------------------------------------------------------------
check("history is a pure module: no Svelte, no DOM, no storage, no timers, no clock of its own (the clock is injected)", !/svelte|window|document|localStorage|sessionStorage|setTimeout|setInterval|requestAnimationFrame|performance\.now|Date\.now|Math\.random|JSON\./.test(H) && /clock: \(\(\) => number\) \| null/.test(H) && /import \{ sameValue, type FieldRef, type FieldValue \} from "\.\/fields";/.test(H));
check("the documented numbers: coalescing window 1000 ms, limit 200 entries; both overridable", /export const DEFAULT_COALESCE_MS = 1000;/.test(H) && /export const DEFAULT_HISTORY_LIMIT = 200;/.test(H) && /this\.coalesceMs = options\.coalesceMs \?\? DEFAULT_COALESCE_MS;/.test(H) && /this\.limit = options\.limit \?\? DEFAULT_HISTORY_LIMIT;/.test(H) && /if \(this\.undoStack\.length > this\.limit\) this\.undoStack\.splice\(0, this\.undoStack\.length - this\.limit\);/.test(H));
check("entries are diffs over the registry: {path, before, after} patches, a label, open / closed; observe() compares every field with its baseline", /export interface HistoryPatch \{\s*readonly path: string;\s*readonly before: FieldValue;\s*after: FieldValue;\s*\}/.test(H.replace(/\n\s*\n/g, "\n")) && /export interface HistoryEntry \{\s*readonly id: number;\s*readonly label: string;\s*readonly patches: HistoryPatch\[\];\s*readonly at: number;\s*updatedAt: number;\s*open: boolean;\s*\}/.test(H.replace(/\n\s*\n/g, "\n")) && /observe\(label\?: string, options: \{ readonly closed\?: boolean \} = \{\}\): HistoryEntry \| null/.test(H) && /for \(let i = 0; i < this\.fields\.length; i\+\+\) \{\s*const value = this\.fields\[i\]\.get\(\);\s*if \(!sameValue\(value, this\.baseline\[i\]\)\) \{\s*patches\.push\(\{ path: this\.fields\[i\]\.path, before: this\.baseline\[i\], after: value \}\);/.test(H));
check("restores are never recorded (applying guard), undo applies patches in reverse, redo forward; a recorded or merged edit clears redo; undo / redo move one entry between the stacks", /if \(this\.applying\) return null;/.test(H) && /this\.applying = true;/.test(H) && /const ordered = side === "before" \? \[\.\.\.entry\.patches\]\.reverse\(\) : entry\.patches;/.test(H) && count(H, /this\.redoStack\.length = 0;/g) >= 2 && /undo\(\): HistoryEntry \| null \{[\s\S]*?this\.observe\(\);[\s\S]*?const entry = this\.undoStack\.pop\(\);[\s\S]*?this\.apply\(entry, "before"\);[\s\S]*?this\.redoStack\.push\(entry\);/.test(H) && /redo\(\): HistoryEntry \| null \{[\s\S]*?const entry = this\.redoStack\.pop\(\);[\s\S]*?this\.apply\(entry, "after"\);[\s\S]*?this\.undoStack\.push\(entry\);/.test(H));
check("coalescing needs a clock, an open last entry, less than coalesceMs since its last change, and a subset of its paths; a merge back to the start drops the entry", /if \(!this\.clock \|\| !last\.open\) return false;/.test(H) && /if \(now - last\.updatedAt > this\.coalesceMs\) return false;/.test(H) && /return patches\.every\(\(p\) => last\.patches\.some\(\(q\) => q\.path === p\.path\)\);/.test(H) && /if \(last\.patches\.every\(\(p\) => sameValue\(p\.before, p\.after\)\)\) \{\s*this\.undoStack\.pop\(\);/.test(H));
check("transaction(label, fn) closes the previous entry and records the block as one closed, labelled entry; subscribe / revision drive autosave", /transaction<T>\(label: string, fn: \(\) => T\): \{ readonly result: T; readonly entry: HistoryEntry \| null \} \{\s*this\.observe\(\);\s*const last = this\.undoStack\.at\(-1\);\s*if \(last\) last\.open = false;\s*const result = fn\(\);\s*const entry = this\.observe\(label, \{ closed: true \}\);/.test(H) && /if \(last\) last\.open = false;/.test(H) && /subscribe\(listener: \(event: HistoryEvent\) => void\): \(\) => void/.test(H) && /export type HistoryEventKind = "record" \| "merge" \| "undo" \| "redo" \| "clear";/.test(H) && /get revision\(\): number/.test(H) && /export function createHistory\(options: HistoryOptions\): History/.test(H));

// --- 3. Persistence. -----------------------------------------------------------------------
check("persistence is a pure module: storage and scheduling are injected; no window / document / localStorage access, no timers, no clock of its own", !/window|document|localStorage\.|sessionStorage|indexedDB|setTimeout|setInterval|performance\.now|Date\.now|Math\.random|svelte/.test(P) && /export type Schedule = \(fn: \(\) => void, ms: number\) => \(\) => void;/.test(P) && /export interface StorageAdapter \{\s*readonly name: string;\s*read\(key: string\): string \| null \| Promise<string \| null>;\s*write\(key: string, text: string\): void \| Promise<void>;\s*\}/.test(P.replace(/\n\s*\n/g, "\n")));
// Task 4.1: the identity in the manifest carries the template the project was built from (optional on
// read: a manifest written before 4.1 has none and is still a manifest). The schema id is unchanged —
// the field is additive and the reader is lenient.
check("the manifest: schema alloy.project-manifest/1, project id + name + template + rate (Tasks 4.1 / 11.1), channels by id → {rel: value} over the registry; stable serialisation, no timestamp", /export const MANIFEST_SCHEMA = "alloy.project-manifest\/1";/.test(P) && /export function buildManifest\(project: Pick<Project, "id" \| "name" \| "template" \| "sampleRate"> & \{ readonly tracks\?: readonly Pick<Track, "id" \| "code" \| "name" \| "org" \| "audio">\[\] \}, fields: readonly FieldRef\[\]\): ProjectManifest/.test(P) && /const manifest: ProjectManifest = \{ schema: MANIFEST_SCHEMA, project: \{ id: project\.id, name: project\.name, template: project\.template, sampleRate: project\.sampleRate \}, channels \};\s*if \(imported\.length === 0\) return manifest;/.test(P) && /readonly project: \{ readonly id: string; readonly name: string; readonly template\?: ProjectTemplateId; readonly sampleRate\?: ProjectRate \};/.test(P) && /if \(m\.project\.template !== undefined && typeof m\.project\.template !== "string"\) return null;/.test(P) && /export function serializeManifest\(manifest: ProjectManifest\): string \{\s*return JSON\.stringify\(manifest\);/.test(P) && !/savedAt|timestamp|new Date|toISOString|Date\./.test(P.slice(0, P.indexOf("export interface StorageAdapter"))) && /export function parseManifest\(text: string\): ProjectManifest \| null/.test(P) && /export function manifestChannel\(manifest: ProjectManifest, id: ChannelId\)/.test(P));
check("storage adapters: memoryStorage (tests; failWrites hook) and webStorageAdapter over getItem / setItem — localStorage named, never imported", /export function memoryStorage\(options: \{ readonly failWrites\?: \(\) => boolean \} = \{\}\)/.test(P) && /export function webStorageAdapter\(storage: Pick<Storage, "getItem" \| "setItem">, name = "localStorage"\): StorageAdapter/.test(P));
check("the save lifecycle: clean | dirty | saving | saved | failed; dirty = revision ≠ savedRevision; save() outcomes written | unchanged | clean | no-storage | failed", /export type SaveState = "clean" \| "dirty" \| "saving" \| "saved" \| "failed";/.test(P) && /readonly outcome: "written" \| "unchanged" \| "clean" \| "no-storage" \| "failed";/.test(P) && /get dirty\(\): boolean \{\s*return this\.revisionOf\(\) !== this\.savedRevision;/.test(P) && /if \(!this\.storage\) return \{ ok: false, outcome: "no-storage", error: null, revision \};/.test(P) && /if \(revision === this\.savedRevision\) return \{ ok: true, outcome: "clean", error: null, revision \};/.test(P));
check("never a false 'saved': savedRevision / savedAt move only after a successful write; a failure keeps the error until a write succeeds or the stored copy matches again; unchanged text skips the write but counts as saved", /if \(text === this\.lastSavedText\) \{\s*this\.savedRevision = revision;\s*this\.skipped\+\+;\s*this\.error = null;\s*this\.lastAttempt = "saved";\s*return \{ ok: true, outcome: "unchanged", error: null, revision \};/.test(P) && /private failed\(e: unknown, revision: number\): SaveResult \{\s*this\.error = e instanceof Error \? e\.message : String\(e\);\s*this\.lastAttempt = "failed";\s*return \{ ok: false, outcome: "failed", error: this\.error, revision \};\s*\}/.test(P) && /private written\(revision: number, text: string\): SaveResult \{\s*this\.savedRevision = revision;\s*this\.lastSavedText = text;\s*this\.savedAt = this\.clock \? this\.clock\(\) : null;\s*this\.error = null;\s*this\.writes\+\+;\s*this\.lastAttempt = "saved";/.test(P) && count(P, /this\.savedRevision = revision;/g) === 2);
check("debounce through the injected scheduler: notifyChange() re-arms the timer; attach() arms a save when already dirty; detach() cancels; an async write re-arms if edits landed meanwhile", /notifyChange\(\): void \{\s*this\.everChanged = true;\s*if \(this\.lastAttempt === "failed" \|\| this\.lastAttempt === "saved"\) this\.lastAttempt = "none";\s*this\.arm\(\);/.test(P) && /private arm\(\): void \{\s*if \(!this\.storage \|\| !this\.schedule\) return;\s*this\.cancel\(\);\s*this\.cancelPending = this\.schedule\(/.test(P) && /attach\(storage: StorageAdapter, options: AttachOptions\): void \{\s*this\.cancel\(\);\s*this\.storage = storage;\s*this\.schedule = options\.schedule;\s*this\.delayMs = options\.delayMs \?\? DEFAULT_AUTOSAVE_DELAY_MS;\s*if \(this\.dirty\) this\.arm\(\);/.test(P) && /detach\(\): void \{\s*this\.cancel\(\);\s*this\.storage = null;\s*this\.schedule = null;/.test(P) && /if \(this\.dirty\) this\.arm\(\);/.test(P.slice(P.indexOf("private written("))) && /export function createAutosave\(options: AutosaveOptions\): Autosave/.test(P));

// --- 4. Clipboard. --------------------------------------------------------------------------
check("the clipboard is the application's own: a schema'd payload (kind, effect, from, settings by rel), no navigator.clipboard, no DOM, no history import (the store wraps the paste)", /export const CLIPBOARD_SCHEMA = "alloy.channel-settings\/1";/.test(CB) && /export interface ChannelSettings \{\s*readonly schema: typeof CLIPBOARD_SCHEMA;\s*readonly kind: Channel\["kind"\];\s*readonly effect: string \| null;\s*readonly from: \{ readonly id: ChannelId; readonly code: string; readonly name: string \};\s*readonly settings: Readonly<Record<string, FieldValue>>;\s*\}/.test(CB.replace(/\n\s*\n/g, "\n")) && !/navigator|window|document|history|svelte|localStorage/.test(CB) && !/JSON\.parse/.test(CB));
check("copy reads only copyable fields of the source; paste is decided first (malformed · unknown-destination · kind-mismatch · effect-mismatch · shape-mismatch · invalid-value) and the plan is written only after the whole payload validated", /export function copyChannelSettings\(project: Project, fields: readonly FieldRef\[\], id: ChannelId\): ChannelSettings/.test(CB) && /\.filter\(\(f\) => f\.copyable\)/.test(CB) && /export type PasteReason =\s*\| "malformed"\s*\| "unknown-destination"\s*\| "kind-mismatch"\s*\| "effect-mismatch"\s*\| "shape-mismatch"\s*\| "invalid-value";/.test(CB) && /export function pasteVerdict\(project: Project, fields: readonly FieldRef\[\], payload: unknown, destination: ChannelId\): PasteVerdict/.test(CB) && /export function applyPaste\(plan: readonly PasteStep\[\]\): number \{\s*for \(const step of plan\) step\.field\.set\(step\.value\);/.test(CB) && !/\.set\(/.test(CB.slice(0, CB.indexOf("export function applyPaste"))));
check("compatibility: same kind, same Return effect, every payload setting must be a copyable field of the destination with a valid value; an unchanged paste is ok with 0 changes", /if \(payload\.kind !== target\.kind\)/.test(CB) && /if \(target\.kind === "return" && payload\.effect !== target\.effect\)/.test(CB) && /if \(!field\) return rejected\("shape-mismatch"/.test(CB) && /if \(!isValidValue\(field\.type, value\)\) return rejected\("invalid-value"/.test(CB) && /message: `Unchanged: \$\{targetName\} already has these \$\{n\} settings`, changes: 0/.test(CB));
check("the store: clipboard { copy · held · clear · canPaste · paste }; held is a plain module variable (not project state, not in history); paste runs inside ONE history transaction and writes nothing when rejected or unchanged", /let held: ChannelSettings \| null = null;/.test(ST) && /export const clipboard = \{/.test(ST) && /copy\(id: ChannelId\): ChannelSettings \{\s*held = copyChannelSettings\(state, fieldRegistry, id\);/.test(ST) && /get held\(\): ChannelSettings \| null/.test(ST) && /canPaste\(id: ChannelId, payload: unknown = held\): PasteVerdict \{\s*return pasteVerdict\(state, fieldRegistry, payload, id\);/.test(ST) && /paste\(id: ChannelId, payload: unknown = held\): PasteVerdict \{\s*const verdict = pasteVerdict\(state, fieldRegistry, payload, id\);\s*if \(!verdict\.ok \|\| verdict\.changes === 0\) return verdict;[\s\S]*?history\.transaction\(`Paste settings → \$\{target \? `\$\{target\.code\} \$\{target\.name\}` : id\}`, \(\) => applyPaste\(verdict\.plan\)\);/.test(ST) && !/\$state\(.*held|held = \$state/.test(ST));

// --- 5. The store's editing wiring. --------------------------------------------------------
check("the store builds the registry once over its one $state tree, creates history over it and autosave over the manifest; history changes notify autosave", /export const fieldRegistry = projectFields\(state\);/.test(ST) && /export const history = createHistory\(\{ fields: fieldRegistry \}\);/.test(ST) && /export const autosave = createAutosave\(\{\s*key: `alloy\.project\.\$\{state\.id\}`,\s*serialize: \(\) => serializeManifest\(buildManifest\(state, fieldRegistry\)\),\s*revision: \(\) => history\.revision,\s*\}\);/.test(ST) && /history\.subscribe\(\(\) => autosave\.notifyChange\(\)\);/.test(ST) && count(ST, /\$state\(/g) === 1);
check("the observer is the store's only effect: $effect.root → one $effect reading every field, recording untracked — so ops, the Task 2.8 helpers, direct component writes and pastes all land in history without touching the writers", count(ST, /\$effect\.root\(/g) === 1 && count(ST, /\$effect\(/g) === 1 && /import \{ untrack \} from "svelte";/.test(ST) && /\$effect\.root\(\(\) => \{\s*\$effect\(\(\) => \{\s*for \(const f of fieldRegistry\) f\.get\(\);\s*untrack\(\(\) => history\.observe\(\)\);\s*\}\);\s*\}\);/.test(ST));
check("the 23 approved ops are unchanged in shape: no op calls history, autosave or the clipboard (recording is the observer's job); the Task 3.2 routing verdicts still gate the routing writes", !/history\.|autosave\.|clipboard\./.test(ST.slice(ST.indexOf("export const ops = {"), ST.indexOf("\n} as const;", ST.indexOf("export const ops = {")))) && /const verdict = validateRoute\(state, id, to\);\s*if \(verdict\.ok && t\.output !== to\) t\.output = to;/.test(ST) && /const verdict = validateRoute\(state, id, to\);\s*if \(verdict\.ok && b\.output !== to\) b\.output = to;/.test(ST));
check("D2.8 return-to-Auto is untouched: setMode changes ownership only, setParamValue makes the one parameter Manual (mixer-chain.ts pinned by check:routing)", /export function setMode\(param: ChainParam \| CharacterParam, mode: Mode\): void \{\s*param\.mode = mode;\s*\}/.test(C.mixerChain.replace(/\n\s*\n/g, "\n")) && /export function setParamValue\(param: ChainParam, value: number\): void \{[\s\S]*?param\.mode = "manual";/.test(C.mixerChain));

// --- 6. The shell. --------------------------------------------------------------------------
// Task 4.1: the shell is installed BEFORE the mount — the stored settings (data-motion on <html>) and
// the last opened project must be in place when the first frame renders; nothing else about the
// shell's exclusivity changes.
check("the shell is the only browser wiring and main.ts installs it once, before the mount (Task 4.1); no component, room or lib module imports it", /import \{ installProjectShell \} from "\.\/lib\/project\/shell";/.test(S.main) && /installProjectShell\(window\);\s*mount\(App, \{ target \}\);/.test(S.main) && (S.main.match(/installProjectShell\(/g) ?? []).length === 1 && walk("src").filter((rel) => /from "[./]*(lib\/)?project\/shell"/.test(read(rel))).map((r) => r.replace(/\\/g, "/")).join() === "src/main.ts");
check("shortcuts: Ctrl / Cmd + Z = undo, + Shift = redo, Ctrl + Y = redo; nothing with Alt, nothing already handled, nothing while typing (text-like inputs, textarea, contenteditable); the handler preventDefaults", /export function shortcutAction\(e: KeyLike\): ShortcutAction \| null \{\s*if \(e\.defaultPrevented \|\| e\.altKey\) return null;\s*if \(!\(e\.ctrlKey \|\| e\.metaKey\)\) return null;\s*if \(isTextEntry\(e\.target\)\) return null;\s*const key = e\.key\.toLowerCase\(\);\s*if \(key === "z"\) return e\.shiftKey \? "redo" : "undo";\s*if \(key === "y" && e\.ctrlKey && !e\.metaKey && !e\.shiftKey\) return "redo";\s*return null;/.test(SH) && /const TEXT_INPUT_TYPES = new Set\(\["text", "number", "search", "email", "url", "tel", "password", ""\]\);/.test(S.textEntry) && /if \(tag === "TEXTAREA"\) return true;/.test(S.textEntry) && /return el\.isContentEditable === true;/.test(S.textEntry) && /e\.preventDefault\(\);\s*if \(action === "undo"\) history\.undo\(\);\s*else history\.redo\(\);/.test(SH) && /win\.addEventListener\("keydown", onKeydown\);/.test(SH));
// Task 4.1 (owner decision D4.1.1): the last opened project is restored at start — by the lifecycle
// (lifecycle.restoreLast), never by the shell's own hands: the shell still never parses or applies a
// manifest itself. One Web Storage adapter is shared by autosave, the settings and the lifecycle.
check("autosave: localStorage behind a try / catch (unavailable → nothing attached, never 'saved'), 1000 ms debounce on the window's setTimeout, the history clock is performance.now; the shell itself never parses or applies a manifest — restoring is the lifecycle's (Task 4.1)", /export const AUTOSAVE_DELAY_MS = 1000;/.test(SH) && /try \{\s*return win\.localStorage \?\? null;\s*\} catch \{\s*return null;\s*\}/.test(SH) && /const adapter = storage \? webStorageAdapter\(storage\) : null;/.test(SH) && /autosave\.attach\(adapter, \{\s*delayMs: AUTOSAVE_DELAY_MS,\s*schedule: \(fn, ms\) => \{\s*const t = win\.setTimeout\(fn, ms\);/.test(SH) && /history\.clock = \(\) => win\.performance\.now\(\);/.test(SH) && /if \(adapter\) attachSettings\(adapter\);/.test(SH) && /const now = \(\): string => new Date\(\)\.toISOString\(\);/.test(SH) && /lifecycle\.attach\(\{\s*storage: adapter,\s*now,\s*newId: \(\) => newProjectId\(win\),\s*\}\);\s*const restored = lifecycle\.restoreLast\(\);/.test(SH) && !/parseManifest|\.getItem\(|manifestChannel|applyManifest/.test(SH));
// Task 4.1: the handle also carries the lifecycle, the settings and what start-up did (`restored`);
// `fields` became a getter because the registry is rebuilt when another project is loaded. Still
// only behind ?debug; uninstall also detaches the lifecycle and the settings and clears data-motion.
check("the debug handle exists only behind ?debug: window.alloy = { project, ops, history, clipboard, autosave, fields, flush, lifecycle, settings, restored, assets (Task 5.1), analysis, hardware (Task 5.2), transport (Task 8.1) }; uninstall removes everything", /export const DEBUG_FLAG = "debug";/.test(SH) && /return new URLSearchParams\(search\)\.has\(DEBUG_FLAG\);/.test(SH) && /if \(wantsDebugHandle\(win\.location\.search\)\) scope\.alloy = debugHandle\(restored\);/.test(SH) && /return \{\s*project,\s*ops,\s*history,\s*clipboard,\s*autosave,\s*get fields\(\) \{\s*return fieldRegistry\.map\(\(f\) => f\.path\);\s*\},\s*flush: \(\) => \{\s*history\.observe\(\);\s*\},\s*lifecycle,\s*settings,\s*restored,\s*assets,\s*analysis,\s*hardware,\s*transport,\s*\};/.test(SH) && /win\.removeEventListener\("keydown", onKeydown\);\s*detachPlayback\(\);\s*unsubscribeSettings\(\);\s*lifecycle\.detach\(\);\s*analysis\.detach\(\);\s*assets\.detach\(\);\s*hardware\.detach\(\);\s*detachSettings\(\);\s*root\?\.removeAttribute\("data-motion"\);\s*autosave\.detach\(\);\s*history\.clock = null;\s*if \(scope\.alloy\) delete scope\.alloy;/.test(SH));
const browserTouch = /\.localStorage|localStorage\.|performance\.now|setTimeout|setInterval|Date\.now/;
const touching = walk("src/lib/project").filter((rel) => browserTouch.test(stripComments(read(rel)))).map((r) => r.replace(/\\/g, "/"));
check("no other project module reaches the browser's storage, clocks or timers: localStorage / performance.now / setTimeout appear in src/lib/project only in shell.ts", touching.join() === "src/lib/project/shell.ts", touching.join(", "));

// --- 7. No new UI; the approved rooms, components and App untouched by this task. ---------
const uiFiles = walk("src").filter((rel) => rel.endsWith(".svelte"));
const uiCode = uiFiles.map((rel) => stripComments(scriptOf(read(rel))) + "\n" + stripComments(templateOf(read(rel)))).join("\n");
/*
  Task 9.2 (owner) supersedes the original rule here. The rule was "shortcuts
  only: no visible undo / redo / autosave control anywhere in the UI". The
  owner then asked for a top toolbar with direct Undo, Redo and Save buttons,
  and for File > Save — an explicit reversal of that instruction, not a silent
  drift, so it is recorded as an owner decision (D9.2.1) rather than quietly
  relaxed.

  What is still forbidden, and is what the old check was really protecting:
  there must be no *second* undo mechanism. The clipboard stays invisible, no
  new settings surface appears, and the toolbar may only call the one history
  and the one autosave — never open a store of its own.
*/
check(
  "undo / redo / save are visible now (owner D9.2.1 supersedes the shortcuts-only rule)",
  /<ToolbarKey[\s\S]*?hook="undo"/.test(read("src/components/AppToolbar.svelte")) &&
    /<ToolbarKey[\s\S]*?hook="redo"/.test(read("src/components/AppToolbar.svelte")) &&
    /<ToolbarKey[\s\S]*?hook="save"/.test(read("src/components/AppToolbar.svelte")),
);
check(
  "the clipboard is still invisible — no copy / paste control or text in the UI",
  !/\b(clipboard|paste)\b/i.test(uiCode.replace(/history\.replaceState/g, "")) &&
    uiFiles.filter((rel) => /clipboard|paste/i.test(stripComments(scriptOf(read(rel))) + stripComments(templateOf(read(rel))))).length === 0,
);
check(
  "the toolbar binds to the ONE project history and the ONE autosave, never its own state",
  /import \{ autosave, history, project \} from "\.\.\/lib\/project\/store\.svelte"/.test(read("src/components/AppToolbar.svelte")) &&
    /history\.undo\(\)/.test(read("src/components/AppToolbar.svelte")) &&
    /history\.redo\(\)/.test(read("src/components/AppToolbar.svelte")) &&
    /autosave\.save\(\)/.test(read("src/components/AppToolbar.svelte")),
);
check("no component or room imports the editing modules: fields, history, persistence, clipboard, shell are reached only through the store and main.ts", uiFiles.every((rel) => !/project\/(fields|history|persistence|clipboard|shell)"/.test(read(rel))));
check("NO SCREWS, EVER (owner, D2.1.9): nothing renders a screw", walk("src").every((rel) => !/(class=["'{][^"'}]*screw|\.[\w-]*screw[\w-]*\s*[{,:]|data-[\w-]*screw|__screw)/i.test(read(rel))));
check("no new dependency, no backend: package.json dependencies unchanged (none) and no fetch / WebSocket / XMLHttpRequest in the editing modules; IndexedDB (Task 5.1 asset copies) is reached in the shell only", Object.keys(pkg.dependencies ?? {}).length === 0 && !/fetch\(|WebSocket|XMLHttpRequest/.test([F, H, P, CB, SH, ST].join("\n")) && !/indexedDB/.test([F, H, P, CB, ST].join("\n")) && /const idb = win\.indexedDB;\s*return idb \? indexedDbAssetStore\(idb\) : null;/.test(SH));

// --- 8. Tests. ------------------------------------------------------------------------------
// Task 4.1 appends its three files (templates, lifecycle, settings); the 3.2 / 3.3 files stay, in order.
/*
 * Task 9.1 widened this check, and made it stronger. It used to compare the whole
 * `npm test` string to one literal, which meant any new suite — the point of a
 * stabilization pass — failed a check whose subject is *the editing layer*, not the
 * test roster. It now asserts what it always meant: the command uses the project
 * loader and node:test, every suite named here is on disk, the Task 3.2–8.2 suites
 * are all still there in their original order, and any suite beyond that list must be
 * a sanctioned addition. Deleting a suite still fails; adding an unnamed one still fails.
 */
const REQUIRED_TEST_FILES = [
  "tests/routing.test.mjs", "tests/store.test.mjs", "tests/history.test.mjs",
  "tests/persistence.test.mjs", "tests/clipboard.test.mjs", "tests/editing.test.mjs",
  "tests/shell.test.mjs", "tests/templates.test.mjs", "tests/lifecycle.test.mjs",
  "tests/settings.test.mjs", "tests/wav.test.mjs", "tests/peaks.test.mjs",
  "tests/import.test.mjs", "tests/analysis-level.test.mjs", "tests/analysis-spectral.test.mjs",
  "tests/analysis-transient.test.mjs", "tests/analysis-stereo.test.mjs",
  "tests/analysis-integrity.test.mjs", "tests/analysis-engine.test.mjs",
  "tests/benchmark.test.mjs", "tests/dsp-eq.test.mjs", "tests/dsp-dynamic-eq.test.mjs",
  "tests/dsp-compressor.test.mjs", "tests/dsp-expander.test.mjs", "tests/dsp-limiter.test.mjs",
  "tests/dsp-reverb.test.mjs", "tests/dsp-delay.test.mjs", "tests/engine-chain.test.mjs",
  "tests/engine-routing.test.mjs", "tests/engine-sidechain.test.mjs", "tests/masking.test.mjs",
  "tests/rendering.test.mjs", "tests/playback.test.mjs", "tests/export.test.mjs",
  "tests/rulebook.test.mjs",
];
/** Suites a later task may append to `npm test`. Task 9.1 added the cross-layer joints. */
// Task 10.1: the playhead suite is sanctioned after the required list.
const SANCTIONED_TEST_FILES = ["tests/integration.test.mjs", "tests/playhead.test.mjs", "tests/resample.test.mjs"];
const testCommand = pkg.scripts.test ?? "";
const namedSuites = testCommand.split(/\s+/).filter((part) => part.startsWith("tests/"));
check(
  "npm test runs the Task 3.2, 3.3, 4.1, 5.1, 5.2, 6.1, 6.2, 6.3, 7.x, 8.1, 8.2 and 9.1 files under node:test with the project loader",
  testCommand.startsWith("node --import ./tests/register.mjs --test ") &&
    REQUIRED_TEST_FILES.every((file) => namedSuites.includes(file)) &&
    // the required suites keep their order; sanctioned additions may only follow them
    namedSuites.filter((file) => REQUIRED_TEST_FILES.includes(file)).join(",") === REQUIRED_TEST_FILES.join(",") &&
    namedSuites.every((file) => REQUIRED_TEST_FILES.includes(file) || SANCTIONED_TEST_FILES.includes(file)) &&
    namedSuites.every((file) => exists(file)) &&
    /"check:editing": "node scripts\/check-editing-structure\.mjs"/.test(S.pkg),
  namedSuites.filter((file) => !REQUIRED_TEST_FILES.includes(file) && !SANCTIONED_TEST_FILES.includes(file)).join(","),
);
check("the history tests cover: one entry per block, undo / redo, redo cleared by a new edit, no-ops, coalescing with a clock, the limit, restores not recorded, transaction, revision", /createHistory/.test(S.historyTests) && /redo/.test(S.historyTests) && /coalesc/i.test(S.historyTests) && /limit/.test(S.historyTests) && /transaction/.test(S.historyTests) && /revision/.test(S.historyTests) && count(S.historyTests, /^test\(/gm) >= 10);
check("the persistence tests cover: the manifest, unchanged skip, failure surfaced, no false saved, debounce, attach while dirty, async writes", /buildManifest/.test(S.persistenceTests) && /unchanged/.test(S.persistenceTests) && /failWrites/.test(S.persistenceTests) && /schedule/.test(S.persistenceTests) && count(S.persistenceTests, /^test\(/gm) >= 7);
check("the clipboard tests pin the copyable boundary list and every rejection reason", /TRACK_COPYABLE/.test(S.clipboardTests) && /kind-mismatch/.test(S.clipboardTests) && /effect-mismatch/.test(S.clipboardTests) && /shape-mismatch/.test(S.clipboardTests) && /invalid-value/.test(S.clipboardTests) && /malformed/.test(S.clipboardTests) && /unknown-destination/.test(S.clipboardTests) && count(S.clipboardTests, /^test\(/gm) >= 6);
check("the editing tests drive the REAL store: the observer via tick(), every op and helper and direct write path, cross-room views, routing validity under undo / redo, paste as one entry, autosave wiring", /from "\.\.\/src\/lib\/project\/store\.svelte\.ts"/.test(S.editingTests) && /await tick\(\)/.test(S.editingTests) && /setParamValue|setAllModes|setCharacter/.test(S.editingTests) && /arrangeTrackOf|trackMeta/.test(S.editingTests) && /validateRouting/.test(S.editingTests) && /clipboard\.paste/.test(S.editingTests) && /autosave\.attach/.test(S.editingTests) && count(S.editingTests, /^test\(/gm) >= 7);
check("the shell tests cover shortcutAction, isTextEntry, wantsDebugHandle and installProjectShell against a fake window", /shortcutAction/.test(S.shellTests) && /isTextEntry/.test(S.shellTests) && /wantsDebugHandle/.test(S.shellTests) && /installProjectShell/.test(S.shellTests) && count(S.shellTests, /^test\(/gm) >= 4);
check("the loader resolves `./store.svelte` to the runes module so shell.ts can be imported by tests", /\(m\?\[jt\]s\|json\|css\)\$/.test(S.loader));

// --- 9. Documentation. ----------------------------------------------------------------------
check("data-model.md documents the editing layer: the registry and copyable boundary, history boundaries / grouping / limit, the autosave lifecycle and failure handling, the clipboard compatibility rules", /## 10\./.test(S.dataModel) && /copyable/i.test(S.dataModel) && /coalesc/i.test(S.dataModel) && /200/.test(S.dataModel) && /alloy\.project-manifest\/1/.test(S.dataModel) && /alloy\.channel-settings\/1/.test(S.dataModel) && /kind-mismatch/.test(S.dataModel) && /failed/.test(S.dataModel));

// --- 10. Pins. -------------------------------------------------------------------------------
const pinned = {
  "src/lib/project/fields.ts": "4d7b03cbed7a3c2f867d1bc0b18204ad9548b210d0f1784cd8b4c1aa64171d32",
  "src/lib/project/history.ts": "1471c5b8b87285b119fdfada38867a646350e2c502df5faa7786ca47a8ed5563",
  "src/lib/project/persistence.ts": "1981174100232c3c05a78e1d5b4754c75a47ad3a5f6b5657fbf60946e51356a6",
  "src/lib/project/clipboard.ts": "2ede55922707193602770c893042f4a84af4f761426ed71a6fc2476279532d25",
  // Task 10.1 re-pinned (isTextEntry moved to lib/text-entry.ts, D10.1.6): a
  // re-export keeps the shell's public surface; the wiring is unchanged.
  "src/lib/project/shell.ts": "f5048e9e29ef12318ce85b6508b6d84381c74fed98099ffa62eef7f43fb0a6d4",
    // Task 9.1.2 re-pinned this file: the store boots an EMPTY project instead of the
  // development session. Nothing was deleted from it; see the decision log (D9.1.2).
  // Task 9.5 re-pinned (owner's one-window Console redesign, decisions-log
  // D9.5.x): this file changed with the approved layout — the compact strip,
  // its meter, the three-rail bank, the bottom transport bar. The checks
  // around this pin still assert the file's real contract.
  "src/lib/project/store.svelte.ts": "9814f3f455e34463f7e54f33d039fe9a152f25b8bf67f41ce6db861f1c0e523d",
  "src/main.ts": "8942e47f95fabfcabc09534ff86d0b4abff1cf946c94c32a466631f535cc3e70",
    // Task 9.2 re-pinned (owner's top-bar overhaul). The change to this file is
  // part of the approved removals/additions — see decisions-log D9.2.1 — and the
  // checks around this pin still assert the file's real contract.

    // Task 9.3 re-pinned (owner's review: hardware chrome, tactile keys, thin bar).
  // The change to this file is the approved restyle — see decisions-log D9.3.1 —
  // and the checks around this pin still assert the file's real contract.


  // Task 10.1 re-pinned (the follow group in the top bar, D10.1.6).
  // Task 10.2 re-pinned (the shared transport deck, decisions-log D10.2.1/D10.2.2):
  // the shell gained the deck's row. The checks around this pin still assert the file's real contract.
  "src/App.svelte": "05b529f1000bdf56440dda2e83eb238f129030f347e6a9f11c9b93875f99e226",
};
  // Task 11.1 re-pin (rates, conversion, the export dialog): every changed
  // file re-pinned; the unchanged ones keep their hash.
for (const [rel, hash] of Object.entries(pinned)) {
  check(`approved file untouched: ${rel}`, exists(rel) && sha256(read(rel)) === hash, exists(rel) ? `sha256 ${sha256(read(rel)).slice(0, 16)}…` : "missing");
}

// --- Report. ---------------------------------------------------------------------------------
for (const name of passes) console.log(`  PASS  ${name}`);
for (const name of failures) console.error(`  FAIL  ${name}`);
console.log(`\nEditing foundations (undo / redo · autosave · copy / paste) structural contract check — ${passes.length}/${passes.length + failures.length} passed`);
process.exit(failures.length ? 1 : 0);
