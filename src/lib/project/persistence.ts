/**
 * ALLOY — PERSISTENCE: the project manifest and AUTOSAVE — Task 3.3.
 *
 * Pure: no Svelte, no DOM, no timers of its own. Storage and scheduling are
 * injected, so the same code runs against the browser's localStorage (the
 * app shell, D3.3.3) and against an in-memory map (tests), and a later
 * project-folder backend (plan §11) is one more adapter.
 *
 * THE MANIFEST (plan §11: "a JSON manifest for tracks, routing, markers,
 * tempo, parameter values / modes, and settings"). This build's manifest is
 * the editable surface of the fixture session: every field of the registry
 * (fields.ts), grouped by channel id and keyed by the field's relative path
 * — exactly what history can restore and a load path can apply back. It
 * carries no timestamp, so two saves of the same project produce the same
 * text and an unchanged project is never written twice. Identity,
 * arrangement, baselines and fixture facts are not in it because they are
 * not editable in this build; they arrive with import (Phase 5).
 *
 * Task 4.1 adds the project's TEMPLATE to the identity (model.ts) and the
 * loader that reads a manifest back: lifecycle.ts rebuilds the template and
 * applies the saved values through the registry's validated setters. The
 * schema is unchanged — the field is additive, and a Task 3.3 manifest
 * (no template) of the fixture session's id still opens. Autosave follows a
 * project switch through `retarget()`; the manifest still carries no
 * timestamp (the recent-projects index does, lifecycle.ts).
 *
 * THE LIFECYCLE. The store bumps `history.revision` on every project
 * change (record, merge, undo, redo) and tells autosave; autosave marks the
 * project DIRTY and schedules one save `delayMs` later (each change pushes
 * the timer back — a drag is one write, not sixty). A save serialises the
 * project, skips the write when the text equals the last saved text
 * (revision moved, content did not: an edit then its undo), otherwise
 * writes through the adapter. On success the revision captured BEFORE the
 * write becomes `savedRevision` — edits that landed during an asynchronous
 * write keep the project dirty and reschedule. On failure the adapter's
 * error is kept in the status, `savedRevision` does not move, the project
 * stays dirty and the next change (or an explicit `save()`) retries. Nothing
 * is ever reported saved unless the adapter returned without throwing.
 *
 *   dirty  = revision !== savedRevision
 *   state  = "clean" (nothing ever changed) | "dirty" | "saving" | "saved" | "failed"
 *
 * `saved` and `failed` describe the LAST attempt; `dirty` is always derived.
 */

import type { FieldRef, FieldValue } from "./fields";
import type { ChannelId, Project, ProjectTemplateId } from "./model";

/* =========================================================================
   THE MANIFEST
   ========================================================================= */

export const MANIFEST_SCHEMA = "alloy.project-manifest/1";

export interface ProjectManifest {
  readonly schema: typeof MANIFEST_SCHEMA;
  /**
   * Identity. `template` (Task 4.1) names the structure the values apply
   * onto; it is optional on read because Task 3.3 manifests predate it —
   * the loader (lifecycle.ts) treats a template-less manifest of the fixture
   * session's id as the fixture session and anything else as unavailable.
   */
  readonly project: { readonly id: string; readonly name: string; readonly template?: ProjectTemplateId };
  /** channel id → relative field path → value, in registry order. */
  readonly channels: Readonly<Record<string, Readonly<Record<string, FieldValue>>>>;
}

export function buildManifest(project: Pick<Project, "id" | "name" | "template">, fields: readonly FieldRef[]): ProjectManifest {
  const channels: Record<string, Record<string, FieldValue>> = {};
  for (const f of fields) {
    (channels[f.channel] ??= {})[f.rel] = f.get();
  }
  return { schema: MANIFEST_SCHEMA, project: { id: project.id, name: project.name, template: project.template }, channels };
}

export function serializeManifest(manifest: ProjectManifest): string {
  return JSON.stringify(manifest);
}

/** Parse text written by `serializeManifest`; null when it is not a manifest of this schema. */
export function parseManifest(text: string): ProjectManifest | null {
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object") return null;
    const m = value as Partial<ProjectManifest>;
    if (m.schema !== MANIFEST_SCHEMA || !m.project || typeof m.project.id !== "string" || !m.channels || typeof m.channels !== "object") return null;
    if (typeof m.project.name !== "string") return null;
    if (m.project.template !== undefined && typeof m.project.template !== "string") return null;
    return m as ProjectManifest;
  } catch {
    return null;
  }
}

/** The manifest's values for one channel, or null. */
export function manifestChannel(manifest: ProjectManifest, id: ChannelId): Readonly<Record<string, FieldValue>> | null {
  return manifest.channels[id] ?? null;
}

/* =========================================================================
   STORAGE ADAPTERS
   ========================================================================= */

export interface StorageAdapter {
  readonly name: string;
  read(key: string): string | null | Promise<string | null>;
  /** Must throw (or reject) on failure — quota, security, disconnected backend. */
  write(key: string, text: string): void | Promise<void>;
}

/** Tests and the no-storage shell: a map, optionally failing on demand. */
export function memoryStorage(options: { readonly failWrites?: () => boolean } = {}): StorageAdapter & { readonly data: Map<string, string>; writes: number } {
  const data = new Map<string, string>();
  return {
    name: "memory",
    data,
    writes: 0,
    read(key) {
      return data.get(key) ?? null;
    },
    write(key, text) {
      if (options.failWrites?.()) throw new Error("memory storage: write refused");
      this.writes++;
      data.set(key, text);
    },
  };
}

/** The browser's Web Storage (localStorage) — synchronous; quota and privacy errors throw from setItem. */
export function webStorageAdapter(storage: Pick<Storage, "getItem" | "setItem">, name = "localStorage"): StorageAdapter {
  return {
    name,
    read(key) {
      return storage.getItem(key);
    },
    write(key, text) {
      storage.setItem(key, text);
    },
  };
}

/* =========================================================================
   AUTOSAVE
   ========================================================================= */

export type SaveState = "clean" | "dirty" | "saving" | "saved" | "failed";

export interface AutosaveStatus {
  readonly state: SaveState;
  readonly revision: number;
  readonly savedRevision: number;
  /** Clock reading of the last successful write, or null. */
  readonly savedAt: number | null;
  readonly error: string | null;
  /** Successful writes / writes skipped because the text was unchanged. */
  readonly writes: number;
  readonly skipped: number;
  /** A debounced save is scheduled. */
  readonly pending: boolean;
  readonly storage: string | null;
  readonly key: string;
}

export interface SaveResult {
  readonly ok: boolean;
  /** "written" | "unchanged" (text equal to the last save) | "clean" (revision already saved) | "no-storage" | "failed" */
  readonly outcome: "written" | "unchanged" | "clean" | "no-storage" | "failed";
  readonly error: string | null;
  readonly revision: number;
}

export type Schedule = (fn: () => void, ms: number) => () => void;

export interface AutosaveOptions {
  readonly key: string;
  readonly serialize: () => string;
  readonly revision: () => number;
  readonly clock?: (() => number) | null;
}

export interface AttachOptions {
  readonly schedule: Schedule;
  readonly delayMs?: number;
}

export const DEFAULT_AUTOSAVE_DELAY_MS = 1000;

export class Autosave {
  private _key: string;
  private readonly serialize: () => string;
  private readonly revisionOf: () => number;
  private readonly clock: (() => number) | null;

  private storage: StorageAdapter | null = null;
  private schedule: Schedule | null = null;
  private delayMs = DEFAULT_AUTOSAVE_DELAY_MS;
  private cancelPending: (() => void) | null = null;

  private lastAttempt: "none" | "saving" | "saved" | "failed" = "none";
  private savedRevision = 0;
  private lastSavedText: string | null = null;
  private savedAt: number | null = null;
  private error: string | null = null;
  private writes = 0;
  private skipped = 0;
  private everChanged = false;

  constructor(options: AutosaveOptions) {
    this._key = options.key;
    this.serialize = options.serialize;
    this.revisionOf = options.revision;
    this.clock = options.clock ?? null;
  }

  /* --- reads --------------------------------------------------------- */

  /** The storage key the project is written under (`alloy.project.<id>`). */
  get key(): string {
    return this._key;
  }

  get dirty(): boolean {
    return this.revisionOf() !== this.savedRevision;
  }

  get status(): AutosaveStatus {
    const revision = this.revisionOf();
    let state: SaveState;
    if (this.lastAttempt === "saving") state = "saving";
    else if (this.lastAttempt === "failed") state = "failed";
    else if (revision !== this.savedRevision) state = this.everChanged ? "dirty" : "clean";
    else state = this.lastAttempt === "saved" ? "saved" : "clean";
    return {
      state,
      revision,
      savedRevision: this.savedRevision,
      savedAt: this.savedAt,
      error: this.error,
      writes: this.writes,
      skipped: this.skipped,
      pending: this.cancelPending !== null,
      storage: this.storage?.name ?? null,
      key: this._key,
    };
  }

  /* --- wiring -------------------------------------------------------- */

  /** Give autosave somewhere to write and a way to wait. Replaces any previous adapter. */
  attach(storage: StorageAdapter, options: AttachOptions): void {
    this.cancel();
    this.storage = storage;
    this.schedule = options.schedule;
    this.delayMs = options.delayMs ?? DEFAULT_AUTOSAVE_DELAY_MS;
    if (this.dirty) this.arm();
  }

  detach(): void {
    this.cancel();
    this.storage = null;
    this.schedule = null;
  }

  /**
   * Follow a project switch (Task 4.1, lifecycle.ts): write under `key`
   * from now on and start clean — the present revision counts as saved,
   * `savedText` is what the storage already holds for it (the manifest the
   * project was reopened from, or the copy written at creation; null when
   * nothing is known to be stored, so the first save writes). A pending
   * save of the previous project is cancelled: the lifecycle flushes it
   * before switching. The adapter and the schedule stay attached.
   */
  retarget(key: string, savedText: string | null): void {
    this.cancel();
    this._key = key;
    this.savedRevision = this.revisionOf();
    this.lastSavedText = savedText;
    this.lastAttempt = "none";
    this.savedAt = null;
    this.error = null;
    this.writes = 0;
    this.skipped = 0;
    this.everChanged = false;
  }

  /** The store calls this on every history event: the project is dirty, a save is due in `delayMs`. */
  notifyChange(): void {
    this.everChanged = true;
    if (this.lastAttempt === "failed" || this.lastAttempt === "saved") this.lastAttempt = "none";
    this.arm();
  }

  /* --- saving -------------------------------------------------------- */

  /** Save now (cancels a pending debounced save). Synchronous adapters answer synchronously. */
  save(): SaveResult | Promise<SaveResult> {
    this.cancel();
    const revision = this.revisionOf();
    if (!this.storage) return { ok: false, outcome: "no-storage", error: null, revision };
    if (revision === this.savedRevision) return { ok: true, outcome: "clean", error: null, revision };
    const text = this.serialize();
    if (text === this.lastSavedText) {
      // the stored copy already matches the project: current, whatever failed in between
      this.savedRevision = revision;
      this.skipped++;
      this.error = null;
      this.lastAttempt = "saved";
      return { ok: true, outcome: "unchanged", error: null, revision };
    }
    this.lastAttempt = "saving";
    try {
      const outcome = this.storage.write(this._key, text);
      if (outcome && typeof (outcome as Promise<void>).then === "function") {
        return (outcome as Promise<void>).then(
          () => this.written(revision, text),
          (e: unknown) => this.failed(e, revision),
        );
      }
      return this.written(revision, text);
    } catch (e) {
      return this.failed(e, revision);
    }
  }

  private written(revision: number, text: string): SaveResult {
    this.savedRevision = revision;
    this.lastSavedText = text;
    this.savedAt = this.clock ? this.clock() : null;
    this.error = null;
    this.writes++;
    this.lastAttempt = "saved";
    if (this.dirty) this.arm(); // edits landed during an asynchronous write
    return { ok: true, outcome: "written", error: null, revision };
  }

  private failed(e: unknown, revision: number): SaveResult {
    this.error = e instanceof Error ? e.message : String(e);
    this.lastAttempt = "failed";
    return { ok: false, outcome: "failed", error: this.error, revision };
  }

  private arm(): void {
    if (!this.storage || !this.schedule) return;
    this.cancel();
    this.cancelPending = this.schedule(() => {
      this.cancelPending = null;
      void this.save();
    }, this.delayMs);
  }

  private cancel(): void {
    if (this.cancelPending) {
      this.cancelPending();
      this.cancelPending = null;
    }
  }
}

export function createAutosave(options: AutosaveOptions): Autosave {
  return new Autosave(options);
}
