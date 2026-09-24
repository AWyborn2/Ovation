/**
 * Editor keyboard shortcuts (Social Studio U16), as a pure key → action map
 * so the canvas and its tests share one table.
 */

export type EditorAction =
  | { type: "undo" }
  | { type: "redo" }
  | { type: "duplicate" }
  | { type: "group" }
  | { type: "ungroup" }
  | { type: "delete" }
  | { type: "escape" }
  | { type: "nudge"; dx: number; dy: number };

export const NUDGE = 0.5;
export const NUDGE_BIG = 2;

type KeyLike = Pick<KeyboardEvent, "key" | "shiftKey" | "metaKey" | "ctrlKey">;

/** The action for a key press, or null when the editor doesn't handle it. */
export function actionForKey(e: KeyLike): EditorAction | null {
  const mod = e.metaKey || e.ctrlKey;
  const key = e.key.toLowerCase();
  if (mod && key === "z") return e.shiftKey ? { type: "redo" } : { type: "undo" };
  if (mod && key === "y") return { type: "redo" };
  if (mod && key === "d") return { type: "duplicate" };
  if (mod && key === "g") return e.shiftKey ? { type: "ungroup" } : { type: "group" };
  if (mod) return null;
  if (key === "delete" || key === "backspace") return { type: "delete" };
  if (key === "escape") return { type: "escape" };
  const step = e.shiftKey ? NUDGE_BIG : NUDGE;
  if (key === "arrowleft") return { type: "nudge", dx: -step, dy: 0 };
  if (key === "arrowright") return { type: "nudge", dx: step, dy: 0 };
  if (key === "arrowup") return { type: "nudge", dx: 0, dy: -step };
  if (key === "arrowdown") return { type: "nudge", dx: 0, dy: step };
  return null;
}

/** Keys typed into inputs belong to the input, not the editor. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}
