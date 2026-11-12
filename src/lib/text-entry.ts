/**
 * ALLOY — the typing-target predicate (Task 3.3, moved to its own module by
 * Task 10.1).
 *
 * A pure function with no dependencies, needed by two very different callers:
 * the project shell's undo/redo shortcuts (which must stand down while a text
 * or number field is being typed in) and the follow control's Re-follow
 * shortcut (same reason). The architecture rule — no component imports the
 * shell — stands: the predicate lives here so both callers reach it without
 * the shell's installation code.
 */

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
