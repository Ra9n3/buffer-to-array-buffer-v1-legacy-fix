/**
 * ALLOY — PROJECT LIFECYCLE — Task 4.1: recent projects, start empty,
 * reopen, restore on start.
 *
 * Builds on the Task 3.3 persistence as approved: autosave writes the
 * manifest of the current project under `alloy.project.<id>` (identity and
 * field values, no channel structure); this module is the READ side the
 * plan's "reopen a recent project" needs (owner, D4.1.1), plus the small
 * index that knows which projects exist and when each was last opened.
 *
 *   alloy.projects            the recent index: { schema, entries[] } with
 *                             { id, name, template, openedAt } newest first
 *   alloy.project.<id>        the project's manifest (Task 3.3, unchanged
 *                             schema; `project.template` added)
 *
 * REOPENING a project = rebuild its template (templates.ts) under the saved
 * identity and apply the saved values through the field registry's
 * validated setters (fields.ts `isValidValue`, plus the two rules only the
 * project knows: a reference must point at a channel the project has, a
 * source type must belong to its family), then let the routing rules judge
 * the whole graph. Only then does the store take it (`loadProject`). What
 * cannot be rebuilt is never opened and never shown as openable: Home
 * prints the reason. A value that fails validation keeps the template's
 * value and is reported as skipped; the next save writes the corrected
 * manifest.
 *
 * STARTING EMPTY creates a new identity (ids come from the shell —
 * `crypto.randomUUID`), the empty project (Master only), writes its
 * manifest at once so the entry is reopenable, and switches to it.
 *
 * ON START (owner, D4.1.1) the newest index entry is reopened when its
 * saved copy is valid; otherwise the store keeps the fixture session it
 * booted with. Either way the open project is recorded in the index.
 *
 * IMPORTED TRACKS (Task 5.1): a manifest with a `tracks` block has stems
 * the template cannot rebuild; they are appended (templates.ts
 * `withImportedTracks`) before the saved values apply. Their audio copies
 * live in the asset store and are read after the switch (assets.svelte.ts
 * `hydrate`): a project opens with or without them, and a track whose copy
 * is gone says so instead of drawing anything.
 *
 * Pure with respect to the browser: storage, clock and id source are
 * injected by the shell (lib/project/shell.ts), exactly as autosave's are.
 * Reads are synchronous — the one adapter in this build (localStorage) is;
 * an asynchronous adapter is reported, not awaited.
 */

import { isValidSource } from "../arrange";
import { isValidValue, projectFields } from "./fields";
import type { Project, ProjectTemplateId } from "./model";
import { buildManifest, parseManifest, serializeManifest, type ProjectManifest, type StorageAdapter } from "./persistence";
import { validateGraph } from "./routing";
import { SESSION_PROJECT_ID } from "./session";
import { analysis } from "./analysis.svelte";
import { assets } from "./assets.svelte";
import { autosave, fieldRegistry, loadProject, project } from "./store.svelte";
import { EMPTY_PROJECT_NAME, createEmptyProject, createTemplateProject, isProjectTemplateId, withImportedTracks } from "./templates";

/* =========================================================================
   THE INDEX
   ========================================================================= */

export const RECENT_SCHEMA = "alloy.projects/1";
export const RECENT_KEY = "alloy.projects";
export const RECENT_LIMIT = 12;

export function projectKey(id: string): string {
  return `alloy.project.${id}`;
}

export interface RecentEntry {
  readonly id: string;
  readonly name: string;
  readonly template: ProjectTemplateId;
  /** ISO 8601, from the injected clock — when the project was last opened or created here. */
  readonly openedAt: string;
}

export interface RecentIndex {
  readonly schema: typeof RECENT_SCHEMA;
  readonly entries: readonly RecentEntry[];
}

/** Parse the index text; entries that are not well-formed are dropped, never shown. Null when the text is not an index. */
export function parseRecentIndex(text: string): RecentEntry[] | null {
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object") return null;
    const index = value as Partial<RecentIndex>;
    if (index.schema !== RECENT_SCHEMA || !Array.isArray(index.entries)) return null;
    const seen = new Set<string>();
    const entries: RecentEntry[] = [];
    for (const raw of index.entries as unknown[]) {
      if (!raw || typeof raw !== "object") continue;
      const e = raw as Partial<RecentEntry>;
      if (typeof e.id !== "string" || e.id === "" || typeof e.name !== "string" || typeof e.openedAt !== "string" || !isProjectTemplateId(e.template)) continue;
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      entries.push({ id: e.id, name: e.name, template: e.template, openedAt: e.openedAt });
    }
    return entries.sort((a, b) => (a.openedAt < b.openedAt ? 1 : a.openedAt > b.openedAt ? -1 : 0));
  } catch {
    return null;
  }
}

export function serializeRecentIndex(entries: readonly RecentEntry[]): string {
  const index: RecentIndex = { schema: RECENT_SCHEMA, entries };
  return JSON.stringify(index);
}

/* =========================================================================
   WHAT AN ENTRY CAN DO
   ========================================================================= */

export type UnavailableReason = "no-storage" | "missing" | "damaged" | "mismatch" | "unknown-template" | "invalid";

export type RecentStatus =
  /** The project that is open right now. */
  | { readonly kind: "current" }
  /** A saved copy this build can rebuild. */
  | { readonly kind: "ready"; readonly template: ProjectTemplateId; readonly manifest: ProjectManifest; readonly text: string }
  /** Listed, but not openable — and said so. */
  | { readonly kind: "unavailable"; readonly reason: UnavailableReason; readonly detail: string };

export interface RecentView {
  readonly entry: RecentEntry;
  readonly status: RecentStatus;
}

export const UNAVAILABLE_DETAIL: Readonly<Record<UnavailableReason, string>> = {
  "no-storage": "Storage is not available in this browser",
  missing: "No saved copy in this browser",
  damaged: "The saved copy is not a readable project",
  mismatch: "The saved copy belongs to a different project",
  "unknown-template": "The saved copy's structure is not one this build can rebuild",
  invalid: "The saved routing is not valid",
};

/* =========================================================================
   RESULTS
   ========================================================================= */

export interface OpenOk {
  readonly ok: true;
  readonly id: string;
  /** Values applied from the saved copy / paths kept at their template value because the saved value was not valid. */
  readonly applied: number;
  readonly skipped: readonly string[];
}

export interface OpenRefused {
  readonly ok: false;
  readonly reason: UnavailableReason | "current" | "unknown";
  readonly detail: string;
}

export type OpenResult = OpenOk | OpenRefused;

export interface StartResult {
  readonly ok: true;
  readonly id: string;
  readonly name: string;
  /** The manifest was written at creation (the entry is reopenable now); false with the storage error when it was not. */
  readonly stored: boolean;
  readonly error: string | null;
}

export type RestoreResult =
  | { readonly outcome: "restored"; readonly id: string; readonly skipped: readonly string[] }
  /**
   * Nothing was restored, so the store keeps the project it booted with. That project is
   * now an EMPTY one (Task 9.1.2), so the outcome name is `empty`; `fixture` is kept in
   * the union for saved manifests that still name the development session.
   */
  | { readonly outcome: "empty"; readonly id: string; readonly because: "no-storage" | "no-entries" | UnavailableReason }
  | { readonly outcome: "fixture"; readonly id: string; readonly because: "no-storage" | "no-entries" | UnavailableReason };

export interface LifecycleOptions {
  readonly storage: StorageAdapter | null;
  /** ISO 8601 timestamp of now (the shell: `new Date().toISOString()`; tests: a counter). */
  readonly now: () => string;
  /** A fresh unique id (the shell: `crypto.randomUUID`). */
  readonly newId: () => string;
}

/* =========================================================================
   THE LIFECYCLE
   ========================================================================= */

let options: LifecycleOptions | null = null;
let lastIndexError: string | null = null;

function readSync(key: string): string | null | undefined {
  const storage = options?.storage;
  if (!storage) return undefined;
  try {
    const value = storage.read(key);
    if (value && typeof (value as Promise<unknown>).then === "function") return undefined; // asynchronous adapter: not supported here
    return value as string | null;
  } catch {
    return undefined;
  }
}

function readIndex(): RecentEntry[] {
  const text = readSync(RECENT_KEY);
  if (text === undefined || text === null) return [];
  return parseRecentIndex(text) ?? [];
}

function writeIndex(entries: readonly RecentEntry[]): void {
  const storage = options?.storage;
  if (!storage) return;
  try {
    const outcome = storage.write(RECENT_KEY, serializeRecentIndex(entries));
    if (outcome && typeof (outcome as Promise<void>).then === "function") {
      (outcome as Promise<void>).then(
        () => {
          lastIndexError = null;
        },
        (e: unknown) => {
          lastIndexError = e instanceof Error ? e.message : String(e);
        },
      );
      return;
    }
    lastIndexError = null;
  } catch (e) {
    lastIndexError = e instanceof Error ? e.message : String(e);
  }
}

/** Record `p` as opened now: first in the index, the list capped at RECENT_LIMIT. */
function touch(p: Pick<Project, "id" | "name" | "template">): void {
  if (!options) return;
  const rest = readIndex().filter((e) => e.id !== p.id);
  const entry: RecentEntry = { id: p.id, name: p.name, template: p.template, openedAt: options.now() };
  writeIndex([entry, ...rest].slice(0, RECENT_LIMIT));
}

/** Read and judge the saved copy of an entry, whatever is open now. */
function inspectStored(entry: RecentEntry): RecentStatus {
  if (!options?.storage) return { kind: "unavailable", reason: "no-storage", detail: UNAVAILABLE_DETAIL["no-storage"] };
  const text = readSync(projectKey(entry.id));
  if (text === undefined) return { kind: "unavailable", reason: "no-storage", detail: UNAVAILABLE_DETAIL["no-storage"] };
  if (text === null) return { kind: "unavailable", reason: "missing", detail: UNAVAILABLE_DETAIL.missing };
  const manifest = parseManifest(text);
  if (!manifest) return { kind: "unavailable", reason: "damaged", detail: UNAVAILABLE_DETAIL.damaged };
  if (manifest.project.id !== entry.id) return { kind: "unavailable", reason: "mismatch", detail: UNAVAILABLE_DETAIL.mismatch };
  const template = manifest.project.template ?? (entry.id === SESSION_PROJECT_ID ? "session-fixture" : undefined);
  if (!isProjectTemplateId(template)) return { kind: "unavailable", reason: "unknown-template", detail: UNAVAILABLE_DETAIL["unknown-template"] };
  return { kind: "ready", template, manifest, text };
}

interface Rebuilt {
  readonly project: Project;
  readonly applied: number;
  readonly skipped: string[];
}

/**
 * The template under the saved identity with the saved values applied —
 * validated field by field, then as a routing graph. Null when the
 * identity cannot belong to the template or the result is not a valid
 * project (the caller reports why).
 */
function rebuild(status: Extract<RecentStatus, { kind: "ready" }>): Rebuilt | { readonly reason: UnavailableReason; readonly detail: string } {
  const { manifest, template } = status;
  const built = createTemplateProject(template, manifest.project.id, manifest.project.name);
  if (!built) return { reason: "mismatch", detail: UNAVAILABLE_DETAIL.mismatch };
  // Task 5.1: the imported tracks the manifest carries, appended before the values apply (theirs are in `channels` too)
  const withImports = manifest.tracks && manifest.tracks.length > 0 ? withImportedTracks(built, manifest.tracks) : built;
  if ("ok" in withImports) return { reason: "damaged", detail: `${UNAVAILABLE_DETAIL.damaged}: ${withImports.detail}` };
  const next = withImports;
  const skipped: string[] = [];
  let applied = 0;
  for (const f of projectFields(next)) {
    const saved = manifest.channels[f.channel];
    if (!saved || !Object.prototype.hasOwnProperty.call(saved, f.rel)) continue;
    const value = saved[f.rel];
    let valid = isValidValue(f.type, value);
    if (valid && f.rel === "output") valid = value === "master" || next.buses.some((b) => b.id === value);
    if (valid && f.group === "send" && f.rel.endsWith("/to")) valid = value === null || next.returns.some((r) => r.id === value);
    if (valid && f.rel === "sourceTypeId") {
      const track = next.tracks.find((t) => t.id === f.channel);
      valid = !!track && isValidSource(track.familyId, value as string | null);
    }
    if (!valid) {
      skipped.push(f.path);
      continue;
    }
    f.set(value);
    applied++;
  }
  const verdict = validateGraph(next);
  if (!verdict.ok) return { reason: "invalid", detail: `${UNAVAILABLE_DETAIL.invalid}: ${verdict.message}` };
  return { project: next, applied, skipped };
}

/**
 * The open project's copy, made sure of: whatever autosave has pending is
 * written now, and a project that was never edited (autosave has nothing
 * to say about it) gets its first copy — the template's values under its
 * identity — so that the entry Home lists for it is one that can be
 * reopened. Autosave's own bookkeeping is not touched by that first write:
 * the next save compares against what it last wrote, which is the same text.
 */
function ensureStored(): void {
  void autosave.save();
  const storage = options?.storage;
  if (!storage) return;
  const key = projectKey(project.id);
  if (readSync(key) !== null) return;
  try {
    void storage.write(key, serializeManifest(buildManifest(project, fieldRegistry)));
  } catch {
    // nothing to do here: the entry will say "no saved copy", which is the truth
  }
}

/** The switch itself: load, retarget autosave to the new key, record the opening. */
function install(next: Project, storedText: string | null): void {
  loadProject(next);
  autosave.retarget(projectKey(next.id), storedText);
  touch(next);
  // Task 5.1: the imported tracks' waveforms, from the asset store — asynchronous; the project is open already
  void assets.hydrate();
  // Task 5.2: their stored analysis results, and the queue for what is missing or stale — likewise asynchronous
  void analysis.hydrate();
}

function openStored(entry: RecentEntry): OpenResult {
  const status = inspectStored(entry);
  if (status.kind !== "ready") {
    return status.kind === "unavailable" ? { ok: false, reason: status.reason, detail: status.detail } : { ok: false, reason: "current", detail: "This project is open now" };
  }
  const built = rebuild(status);
  if ("reason" in built) return { ok: false, reason: built.reason, detail: built.detail };
  ensureStored();
  install(built.project, built.skipped.length === 0 ? status.text : null);
  return { ok: true, id: built.project.id, applied: built.applied, skipped: built.skipped };
}

/**
 * What the store is holding when nothing is restored. Since Task 9.1.2 the store boots an
 * EMPTY project, so the honest outcome is `empty`; a build that booted the development
 * session would report `fixture`. Reading the template keeps this true rather than assumed.
 */
function bootOutcome(): "empty" | "fixture" {
  return project.template === "session-fixture" ? "fixture" : "empty";
}

function untitledName(entries: readonly RecentEntry[]): string {
  const taken = new Set(entries.map((e) => e.name));
  if (!taken.has(EMPTY_PROJECT_NAME)) return EMPTY_PROJECT_NAME;
  for (let n = 2; ; n++) {
    const candidate = `${EMPTY_PROJECT_NAME} ${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export const lifecycle = {
  /** Give the lifecycle its storage, clock and id source (the shell). Replaces any previous wiring. */
  attach(next: LifecycleOptions): void {
    options = next;
    lastIndexError = null;
  },
  detach(): void {
    options = null;
  },
  get attached(): boolean {
    return options !== null;
  },
  get storage(): string | null {
    return options?.storage?.name ?? null;
  },
  /** The last index write failure, or null (the index is a convenience; a failure here never loses a project). */
  get indexError(): string | null {
    return lastIndexError;
  },

  /** The recent projects, newest first, each judged against what is actually stored. Empty without storage or entries. */
  recent(): RecentView[] {
    return readIndex().map((entry) => ({
      entry,
      status: entry.id === project.id ? { kind: "current" as const } : inspectStored(entry),
    }));
  },

  /** The judgement for one entry (what Home prints). */
  inspect(entry: RecentEntry): RecentStatus {
    return entry.id === project.id ? { kind: "current" } : inspectStored(entry);
  },

  /** Reopen a listed project. The open project is never reopened over itself from here. */
  open(id: string): OpenResult {
    if (id === project.id) return { ok: false, reason: "current", detail: "This project is open now" };
    const entry = readIndex().find((e) => e.id === id);
    if (!entry) return { ok: false, reason: "unknown", detail: "Not in the recent projects" };
    return openStored(entry);
  },

  /** A new empty project under a fresh identity, written and opened. */
  startEmpty(): StartResult {
    if (!options) throw new Error("lifecycle: not attached");
    const entries = readIndex();
    let id = options.newId();
    while (entries.some((e) => e.id === id) || id === project.id) id = options.newId();
    const next = createEmptyProject(id, untitledName(entries));
    const text = serializeManifest(buildManifest(next, projectFields(next)));
    ensureStored();
    let stored = false;
    let error: string | null = null;
    if (options.storage) {
      try {
        const outcome = options.storage.write(projectKey(id), text);
        if (outcome && typeof (outcome as Promise<void>).then === "function") {
          error = "asynchronous storage is not supported";
        } else {
          stored = true;
        }
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
    } else {
      error = UNAVAILABLE_DETAIL["no-storage"];
    }
    install(next, stored ? text : null);
    return { ok: true, id, name: next.name, stored, error };
  },

  /**
   * At start: reopen the newest listed project when its saved copy is
   * valid; otherwise keep what the store booted with (an empty project since
   * Task 9.1.2) and say why. The open project is recorded either way.
   */
  restoreLast(): RestoreResult {
    const booted = bootOutcome();
    if (!options?.storage) {
      return { outcome: booted, id: project.id, because: "no-storage" };
    }
    const [newest] = readIndex();
    if (!newest) {
      ensureStored();
      touch(project);
      return { outcome: booted, id: project.id, because: "no-entries" };
    }
    const result = openStored(newest);
    if (result.ok) return { outcome: "restored", id: result.id, skipped: result.skipped };
    ensureStored();
    touch(project);
    const because = result.reason === "current" || result.reason === "unknown" ? "missing" : result.reason;
    return { outcome: booted, id: project.id, because };
  },
} as const;
