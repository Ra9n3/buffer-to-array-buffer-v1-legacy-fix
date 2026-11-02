/**
 * ALLOY — THE PROJECT SHELL — Task 3.3 app wiring.
 *
 * The one place the browser meets the editing foundations. `main.ts` calls
 * `installProjectShell(window)` once, before the app is mounted (Task 4.1:
 * the settings and the restored project must be in place for the first
 * paint):
 *
 *   1. CLOCK — history gets `performance.now` so a continuous adjustment
 *      coalesces into one undo step (history.ts).
 *   2. AUTOSAVE — the manifest is written to `localStorage` under
 *      `alloy.project.<id>`, debounced with `setTimeout`. If Web Storage is
 *      unavailable (privacy mode, a disabled storage) nothing is attached
 *      and autosave reports `storage: null`, never "saved".
 *   3. SHORTCUTS — Ctrl / Cmd + Z = undo, Ctrl / Cmd + Shift + Z and Ctrl + Y
 *      = redo (plan §4 "keyboard shortcuts"; owner, Task 3.3: no visible
 *      control). Ignored while a text or number field is being typed in
 *      (the hardware's numeric entry keeps the browser's own undo) and when
 *      another handler already consumed the key.
 *   4. DEBUG HANDLE — only when the URL has `?debug`: `window.alloy` =
 *      { project, ops, history, clipboard, autosave, fields, flush,
 *      lifecycle, settings } for browser evidence and the console. Inert
 *      otherwise (owner, Task 3.3).
 *   5. SETTINGS (Task 4.1) — lib/settings.svelte.ts reads `alloy.settings`
 *      from the same storage and writes it on every change; the motion
 *      preference is mirrored onto `<html data-motion>` (lib/preferences.css
 *      acts on it) now and whenever it changes.
 *   6. LIFECYCLE (Task 4.1) — lib/project/lifecycle.ts gets the storage,
 *      a wall clock (`Date`, ISO) for the recent index and `crypto.randomUUID`
 *      for new project ids; then the newest recent project is reopened from
 *      its saved copy (owner, D4.1.1), the fixture session staying when
 *      nothing valid is stored.
 *
 * Everything decision-shaped is a pure function here (`shortcutAction`,
 * `isTextEntry`, `wantsDebugHandle`) so the tests cover it without a DOM.
 */

import { attachSettings, detachSettings, settings, type AppSettings } from "../settings.svelte";
import { lifecycle, type RestoreResult } from "./lifecycle";
import { webStorageAdapter } from "./persistence";
import { autosave, clipboard, fieldRegistry, history, ops, project } from "./store.svelte";

export type ShortcutAction = "undo" | "redo";

export interface KeyLike {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
  readonly defaultPrevented: boolean;
  readonly target: unknown;
}

interface ElementLike {
  readonly tagName?: string;
  readonly type?: string;
  readonly isContentEditable?: boolean;
}

const TEXT_INPUT_TYPES = new Set(["text", "number", "search", "email", "url", "tel", "password", ""]);

/** A typing target: a text-like input, a textarea, or contenteditable — the browser's own undo belongs to it. */
export function isTextEntry(target: unknown): boolean {
  if (!target || typeof target !== "object") return false;
  const el = target as ElementLike;
  const tag = (el.tagName ?? "").toUpperCase();
  if (tag === "TEXTAREA") return true;
  if (tag === "INPUT") return TEXT_INPUT_TYPES.has((el.type ?? "").toLowerCase());
  return el.isContentEditable === true;
}

/** What a key event asks of history, or null. */
export function shortcutAction(e: KeyLike): ShortcutAction | null {
  if (e.defaultPrevented || e.altKey) return null;
  if (!(e.ctrlKey || e.metaKey)) return null;
  if (isTextEntry(e.target)) return null;
  const key = e.key.toLowerCase();
  if (key === "z") return e.shiftKey ? "redo" : "undo";
  if (key === "y" && e.ctrlKey && !e.metaKey && !e.shiftKey) return "redo";
  return null;
}

export const DEBUG_FLAG = "debug";

export function wantsDebugHandle(search: string): boolean {
  return new URLSearchParams(search).has(DEBUG_FLAG);
}

export const AUTOSAVE_DELAY_MS = 1000;

export interface ShellOptions {
  /** Override the storage lookup (tests); default reads `win.localStorage` inside a try / catch. */
  readonly storage?: Pick<Storage, "getItem" | "setItem"> | null;
}

export interface DebugHandle {
  readonly project: typeof project;
  readonly ops: typeof ops;
  readonly history: typeof history;
  readonly clipboard: typeof clipboard;
  readonly autosave: typeof autosave;
  /** The registry's paths — of the project open now (Task 4.1: a getter, the registry is rebuilt on a project switch). */
  readonly fields: readonly string[];
  /** Record anything pending right now (the observer would do it a microtask later). */
  flush(): void;
  readonly lifecycle: typeof lifecycle;
  readonly settings: typeof settings;
  /** What happened at start (Task 4.1). */
  readonly restored: RestoreResult | null;
}

export function debugHandle(restored: RestoreResult | null = null): DebugHandle {
  return {
    project,
    ops,
    history,
    clipboard,
    autosave,
    get fields() {
      return fieldRegistry.map((f) => f.path);
    },
    flush: () => {
      history.observe();
    },
    lifecycle,
    settings,
    restored,
  };
}

/** The `<html data-motion>` value for a motion preference. */
export function motionAttribute(s: Pick<AppSettings, "motion">): string {
  return s.motion;
}

/** A fresh project id: the platform's UUID when it has one, otherwise time and randomness (the shell is the one place either is allowed). */
export function newProjectId(win: { readonly crypto?: Crypto }): string {
  const c = win.crypto;
  if (c && typeof c.randomUUID === "function") return `project-${c.randomUUID()}`;
  return `project-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function webStorageOf(win: Window, options: ShellOptions): Pick<Storage, "getItem" | "setItem"> | null {
  if (options.storage !== undefined) return options.storage;
  try {
    return win.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Wire the shell; returns a function that undoes the wiring (tests). */
export function installProjectShell(win: Window, options: ShellOptions = {}): () => void {
  history.clock = () => win.performance.now();

  const storage = webStorageOf(win, options);
  const adapter = storage ? webStorageAdapter(storage) : null;
  if (adapter) {
    autosave.attach(adapter, {
      delayMs: AUTOSAVE_DELAY_MS,
      schedule: (fn, ms) => {
        const t = win.setTimeout(fn, ms);
        return () => win.clearTimeout(t);
      },
    });
  }

  // 5. settings — read, then mirrored onto <html> now and on every change
  if (adapter) attachSettings(adapter);
  const root = win.document?.documentElement ?? null;
  const applyMotion = (s: Pick<AppSettings, "motion">): void => {
    root?.setAttribute("data-motion", motionAttribute(s));
  };
  applyMotion(settings);
  const unsubscribeSettings = settings.subscribe(applyMotion);

  // 6. lifecycle — storage, wall clock, ids; then the last project
  lifecycle.attach({
    storage: adapter,
    now: () => new Date().toISOString(),
    newId: () => newProjectId(win),
  });
  const restored = lifecycle.restoreLast();

  const onKeydown = (e: KeyboardEvent): void => {
    const action = shortcutAction(e);
    if (!action) return;
    e.preventDefault();
    if (action === "undo") history.undo();
    else history.redo();
  };
  win.addEventListener("keydown", onKeydown);

  const scope = win as Window & { alloy?: DebugHandle };
  if (wantsDebugHandle(win.location.search)) scope.alloy = debugHandle(restored);

  return () => {
    win.removeEventListener("keydown", onKeydown);
    unsubscribeSettings();
    lifecycle.detach();
    detachSettings();
    root?.removeAttribute("data-motion");
    autosave.detach();
    history.clock = null;
    if (scope.alloy) delete scope.alloy;
  };
}
