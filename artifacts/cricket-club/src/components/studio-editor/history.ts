/**
 * Undo/redo for the editor (Social Studio U16): JSON snapshots of the
 * document, capped at 40. A new edit clears the redo stack.
 */

export const HISTORY_CAP = 40;

export type History<T> = { past: T[]; present: T; future: T[] };

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Record `next` as a new state; the previous one becomes undoable. */
export function commit<T>(h: History<T>, next: T): History<T> {
  if (JSON.stringify(next) === JSON.stringify(h.present)) return h;
  const past = [...h.past, clone(h.present)].slice(-HISTORY_CAP);
  return { past, present: next, future: [] };
}

/** Replace the present without an undo step (live drag previews). */
export function replace<T>(h: History<T>, next: T): History<T> {
  return { ...h, present: next };
}

export function undo<T>(h: History<T>): History<T> {
  if (h.past.length === 0) return h;
  const prev = h.past[h.past.length - 1];
  return { past: h.past.slice(0, -1), present: prev, future: [clone(h.present), ...h.future] };
}

export function redo<T>(h: History<T>): History<T> {
  if (h.future.length === 0) return h;
  const [next, ...rest] = h.future;
  return { past: [...h.past, clone(h.present)].slice(-HISTORY_CAP), present: next, future: rest };
}

/**
 * Commit the end of a gesture whose intermediate states were `replace`d: the
 * state before the gesture (`base`) becomes the single undo step.
 */
export function commitFrom<T>(h: History<T>, base: T, next: T): History<T> {
  if (JSON.stringify(base) === JSON.stringify(next)) return { ...h, present: next };
  return { past: [...h.past, clone(base)].slice(-HISTORY_CAP), present: next, future: [] };
}
