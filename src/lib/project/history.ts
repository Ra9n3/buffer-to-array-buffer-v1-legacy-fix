/**
 * ALLOY — PROJECT HISTORY (undo / redo) — Task 3.3.
 *
 * Pure: no Svelte, no DOM, no timers. The store owns one `History` over its
 * field registry (fields.ts) and calls `observe()` whenever the project may
 * have changed — from its reactive observer after every write, and
 * synchronously before an undo, a redo, a transaction or a save. History
 * therefore sees EVERY project edit, whichever room or helper made it, and
 * nothing that is not a project field (D3.3.2).
 *
 * The boundaries and rules:
 *
 *   ENTRY     = the set of fields that changed between two observations,
 *               each as `{ path, before, after }`. One synchronous block of
 *               writes — an op that writes two leaves (`setSendTo`: `to` +
 *               `mode`; `setParamValue`: `value` + `mode`), ALL AUTO over a
 *               module, a whole paste — is one entry, because the observer
 *               runs after the block.
 *   NO-OP     = nothing changed → no entry. A same-value write, a rejected
 *               route, a paste with nothing to change never reach history.
 *   COALESCE  = a continuous adjustment is one entry: when a new change
 *               touches only paths the previous entry already holds, the
 *               previous entry was not closed, and the clock says it was
 *               updated less than `coalesceMs` ago, the change merges into
 *               it (first `before`, latest `after`). A knob drag, a fader
 *               drag, a run of arrow keys = one undo step. A different
 *               control, a pause, an undo / redo or a transaction closes
 *               the entry. If a merged entry ends where it began it is
 *               dropped. Without a clock there is no coalescing.
 *   TRANSACTION = `transaction(label, fn)`: pending changes are recorded
 *               first, `fn` runs, and everything it changed is recorded as
 *               one closed entry under `label` (paste).
 *   UNDO / REDO = linear. Undo restores every `before` of the newest entry
 *               (reverse order) and moves it to the redo stack; redo
 *               restores the `after`s. A new entry clears the redo stack.
 *               Restores are applied with observation suspended, so they
 *               never record themselves. Because every recorded state was
 *               reached through the validating ops, restoring states in
 *               order keeps every invariant (routing validity included).
 *   LIMIT     = `limit` entries (default 200); the oldest fall off.
 *   REVISION  = a counter bumped by every record, merge, undo and redo —
 *               what autosave compares against its saved revision.
 */

import { sameValue, type FieldRef, type FieldValue } from "./fields";

export interface HistoryPatch {
  readonly path: string;
  readonly before: FieldValue;
  after: FieldValue;
}

export interface HistoryEntry {
  readonly id: number;
  readonly label: string;
  readonly patches: HistoryPatch[];
  /** Clock reading when the entry was opened / last merged into (0 without a clock). */
  readonly at: number;
  updatedAt: number;
  /** Open to coalescing (closed by undo / redo, a transaction, or being a transaction). */
  open: boolean;
}

export type HistoryEventKind = "record" | "merge" | "undo" | "redo" | "clear";

export interface HistoryEvent {
  readonly kind: HistoryEventKind;
  readonly entry: HistoryEntry | null;
  readonly revision: number;
}

export interface HistoryOptions {
  readonly fields: readonly FieldRef[];
  /** A monotonic clock in ms (performance.now in the app, a counter in tests). Without one nothing coalesces. */
  readonly clock?: (() => number) | null;
  readonly coalesceMs?: number;
  readonly limit?: number;
}

export const DEFAULT_COALESCE_MS = 1000;
export const DEFAULT_HISTORY_LIMIT = 200;

export class History {
  readonly fields: readonly FieldRef[];
  readonly coalesceMs: number;
  readonly limit: number;
  clock: (() => number) | null;

  private readonly byPath = new Map<string, number>();
  private readonly baseline: FieldValue[];
  private readonly undoStack: HistoryEntry[] = [];
  private readonly redoStack: HistoryEntry[] = [];
  private readonly listeners = new Set<(event: HistoryEvent) => void>();
  private applying = false;
  private seq = 0;
  private _revision = 0;

  constructor(options: HistoryOptions) {
    this.fields = options.fields;
    this.clock = options.clock ?? null;
    this.coalesceMs = options.coalesceMs ?? DEFAULT_COALESCE_MS;
    this.limit = options.limit ?? DEFAULT_HISTORY_LIMIT;
    this.baseline = this.fields.map((f) => f.get());
    this.fields.forEach((f, i) => this.byPath.set(f.path, i));
  }

  /* --- reads --------------------------------------------------------- */

  get revision(): number {
    return this._revision;
  }
  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }
  /** Oldest first; the newest is what `undo()` takes. */
  get entries(): readonly HistoryEntry[] {
    return this.undoStack;
  }
  /** What `redo()` takes next is the last one. */
  get redoEntries(): readonly HistoryEntry[] {
    return this.redoStack;
  }
  get undoLabel(): string | null {
    return this.undoStack.at(-1)?.label ?? null;
  }
  get redoLabel(): string | null {
    return this.redoStack.at(-1)?.label ?? null;
  }

  subscribe(listener: (event: HistoryEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /* --- recording ----------------------------------------------------- */

  /**
   * Compare every field with the last observation and record what moved.
   * Returns the entry written to (new or merged) or null when nothing
   * changed. Safe to call at any time, as often as wanted.
   */
  observe(label?: string, options: { readonly closed?: boolean } = {}): HistoryEntry | null {
    if (this.applying) return null;
    const patches: HistoryPatch[] = [];
    for (let i = 0; i < this.fields.length; i++) {
      const value = this.fields[i].get();
      if (!sameValue(value, this.baseline[i])) {
        patches.push({ path: this.fields[i].path, before: this.baseline[i], after: value });
        this.baseline[i] = value;
      }
    }
    if (patches.length === 0) return null;

    const now = this.clock ? this.clock() : 0;
    const last = this.undoStack.at(-1);
    if (!options.closed && label === undefined && last && this.canMerge(last, patches, now)) {
      for (const p of patches) {
        const target = last.patches.find((q) => q.path === p.path);
        if (target) target.after = p.after;
      }
      last.updatedAt = now;
      this.redoStack.length = 0;
      if (last.patches.every((p) => sameValue(p.before, p.after))) {
        // the adjustment came back to where it started: nothing to undo
        this.undoStack.pop();
        this.bump("merge", null);
        return null;
      }
      this.bump("merge", last);
      return last;
    }

    const entry: HistoryEntry = {
      id: ++this.seq,
      label: label ?? this.describe(patches),
      patches,
      at: now,
      updatedAt: now,
      open: !options.closed && label === undefined,
    };
    this.undoStack.push(entry);
    if (this.undoStack.length > this.limit) this.undoStack.splice(0, this.undoStack.length - this.limit);
    this.redoStack.length = 0;
    this.bump("record", entry);
    return entry;
  }

  /** Record anything pending, run `fn`, record what it changed as ONE closed entry under `label`. */
  transaction<T>(label: string, fn: () => T): { readonly result: T; readonly entry: HistoryEntry | null } {
    this.observe();
    const last = this.undoStack.at(-1);
    if (last) last.open = false;
    const result = fn();
    const entry = this.observe(label, { closed: true });
    return { result, entry };
  }

  /* --- undo / redo --------------------------------------------------- */

  undo(): HistoryEntry | null {
    this.observe();
    const entry = this.undoStack.pop();
    if (!entry) return null;
    this.apply(entry, "before");
    entry.open = false;
    this.redoStack.push(entry);
    this.bump("undo", entry);
    return entry;
  }

  redo(): HistoryEntry | null {
    this.observe();
    const entry = this.redoStack.pop();
    if (!entry) return null;
    this.apply(entry, "after");
    entry.open = false;
    this.undoStack.push(entry);
    this.bump("redo", entry);
    return entry;
  }

  /** Forget everything (a future "new project"); the present state becomes the baseline. */
  clear(): void {
    this.observe();
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.bump("clear", null);
  }

  /* --- internals ----------------------------------------------------- */

  private canMerge(last: HistoryEntry, patches: readonly HistoryPatch[], now: number): boolean {
    if (!this.clock || !last.open) return false;
    if (now - last.updatedAt > this.coalesceMs) return false;
    return patches.every((p) => last.patches.some((q) => q.path === p.path));
  }

  private apply(entry: HistoryEntry, side: "before" | "after"): void {
    this.applying = true;
    try {
      const ordered = side === "before" ? [...entry.patches].reverse() : entry.patches;
      for (const p of ordered) {
        const index = this.byPath.get(p.path);
        if (index === undefined) throw new Error(`history: unknown field ${p.path}`);
        const value = p[side];
        this.fields[index].set(value);
        this.baseline[index] = value;
      }
    } finally {
      this.applying = false;
    }
  }

  private describe(patches: readonly HistoryPatch[]): string {
    const first = this.fields[this.byPath.get(patches[0].path) ?? 0];
    if (patches.length === 1) return first.label;
    const channels = new Set(patches.map((p) => this.fields[this.byPath.get(p.path) ?? 0].channel));
    if (channels.size === 1) {
      const owner = first.label.split(" · ")[0];
      return `${owner} · ${patches.length} settings`;
    }
    return `${patches.length} settings on ${channels.size} channels`;
  }

  private bump(kind: HistoryEventKind, entry: HistoryEntry | null): void {
    this._revision++;
    const event: HistoryEvent = { kind, entry, revision: this._revision };
    for (const l of this.listeners) l(event);
  }
}

export function createHistory(options: HistoryOptions): History {
  return new History(options);
}
