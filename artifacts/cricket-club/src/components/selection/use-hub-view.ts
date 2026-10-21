import { useCallback, useEffect, useState } from "react";

export type HubView = "focus" | "board";

/** Most sides shown side by side in Focus. */
export const MAX_FOCUS = 3;

/**
 * The focused sides that still exist, in the board's (grade) order. When none
 * are left, the first `fallback` sides.
 */
export function pruneFocus(focused: readonly number[], order: readonly number[], fallback: number) {
  const kept = order.filter((id) => focused.includes(id));
  return kept.length > 0 ? kept : order.slice(0, Math.max(1, fallback));
}

/**
 * Toggle `id` in Focus. Never fewer than one; past `max`, the side focused
 * longest ago drops out. `focused` is kept in the order sides were added, so
 * the oldest is first.
 */
export function toggleFocus(focused: readonly number[], id: number, max = MAX_FOCUS): number[] {
  if (focused.includes(id)) {
    return focused.length > 1 ? focused.filter((x) => x !== id) : [...focused];
  }
  const next = [...focused, id];
  return next.length > max ? next.slice(next.length - max) : next;
}

type Stored = { view: HubView; focused: number[] };

const key = (section: string) => `selection-hub-view:${section}`;

function read(section: string): Stored | null {
  try {
    const raw = localStorage.getItem(key(section));
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Stored>;
    return {
      view: v.view === "board" ? "board" : "focus",
      focused: Array.isArray(v.focused) ? v.focused.filter((x) => typeof x === "number") : [],
    };
  } catch {
    return null;
  }
}

function write(section: string, s: Stored) {
  try {
    localStorage.setItem(key(section), JSON.stringify(s));
  } catch {
    // Storage blocked: the view lasts until the page reloads.
  }
}

/**
 * Focus / Board and the focused sides for one section, remembered per section.
 * `order` is the board's side ids in grade order; `narrow` starts Focus on one
 * grade instead of three.
 */
export function useHubView(section: string, order: readonly number[], narrow: boolean) {
  const [stored, setStored] = useState<Stored>(
    () => read(section) ?? { view: "focus", focused: [] },
  );
  useEffect(() => setStored(read(section) ?? { view: "focus", focused: [] }), [section]);

  // Shown in grade order; `stored.focused` keeps the order they were added for dropping the oldest.
  const focused = pruneFocus(stored.focused, order, narrow ? 1 : MAX_FOCUS);

  const update = useCallback(
    (s: Stored) => {
      setStored(s);
      write(section, s);
    },
    [section],
  );

  // Toggling starts from the sides on screen (oldest first as stored).
  const current = stored.focused.filter((id) => focused.includes(id));
  const base = current.length > 0 ? current : focused;

  return {
    view: stored.view,
    focused,
    setView: (view: HubView) => update({ view, focused: base }),
    toggle: (id: number) => update({ view: "focus", focused: toggleFocus(base, id) }),
    focusOnly: (id: number) => update({ view: "focus", focused: [id] }),
  };
}
