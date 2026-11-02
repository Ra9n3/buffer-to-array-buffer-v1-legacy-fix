/**
 * ALLOY — THE PROJECT SHELL — Task 3.3 app wiring.
 *
 * The one place the browser meets the editing foundations. `main.ts` calls
 * `installProjectShell(window)` once, after the app is mounted:
 *
 *   1. CLOCK — history gets `performance.now` so a continuous adjustment
 *      coalesces into one undo step (history.ts).
 *   2. AUTOSAVE — the manifest is written to `localStorage` under
 *      `alloy.project.<id>`, debounced with `setTimeout` (owner, Task 3.3:
 *      write only — the app still opens the approved fixture session on
 *      every load; the saved document waits for a load task). If Web
 *      Storage is unavailable (privacy mode, a disabled storage) nothing is
 *      attached and autosave reports `storage: null`, never "saved".
 *   3. SHORTCUTS — Ctrl / Cmd + Z = undo, Ctrl / Cmd + Shift + Z and Ctrl + Y
 *      = redo (plan §4 "keyboard shortcuts"; owner, Task 3.3: no visible
 *      control). Ignored while a text or number field is being typed in
 *      (the hardware's numeric entry keeps the browser's own undo) and when
 *      another handler already consumed the key.
 *   4. DEBUG HANDLE — only when the URL has `?debug`: `window.alloy` =
 *      { project, ops, history, clipboard, autosave, fields, flush } for
 *      browser evidence and the console. Inert otherwise (owner, Task 3.3).
 *
 * Everything decision-shaped is a pure function here (`shortcutAction`,
 * `isTextEntry`, `wantsDebugHandle`) so the tests cover it without a DOM.
 */

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
  readonly fields: readonly string[];
  /** Record anything pending right now (the observer would do it a microtask later). */
  flush(): void;
}

export function debugHandle(): DebugHandle {
  return {
    project,
    ops,
    history,
    clipboard,
    autosave,
    fields: fieldRegistry.map((f) => f.path),
    flush: () => {
      history.observe();
    },
  };
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
  if (storage) {
    autosave.attach(webStorageAdapter(storage), {
      delayMs: AUTOSAVE_DELAY_MS,
      schedule: (fn, ms) => {
        const t = win.setTimeout(fn, ms);
        return () => win.clearTimeout(t);
      },
    });
  }

  const onKeydown = (e: KeyboardEvent): void => {
    const action = shortcutAction(e);
    if (!action) return;
    e.preventDefault();
    if (action === "undo") history.undo();
    else history.redo();
  };
  win.addEventListener("keydown", onKeydown);

  const scope = win as Window & { alloy?: DebugHandle };
  if (wantsDebugHandle(win.location.search)) scope.alloy = debugHandle();

  return () => {
    win.removeEventListener("keydown", onKeydown);
    autosave.detach();
    history.clock = null;
    if (scope.alloy) delete scope.alloy;
  };
}
