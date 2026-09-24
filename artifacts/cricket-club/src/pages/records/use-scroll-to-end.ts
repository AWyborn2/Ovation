import { useEffect, useRef } from "react";

/**
 * Wide season grids (heatmap, five-fors) scroll sideways on narrow screens;
 * start them at the newest seasons (the right-hand end), like the handoff's
 * "latest ten seasons" view. `key` re-runs it when the columns change.
 */
export function useScrollToEnd<T extends HTMLElement>(key: unknown) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [key]);
  return ref;
}

/** Token-coloured scrollbar so the sideways scroller suits both themes. */
export const SCROLLER_STYLE = { scrollbarColor: "hsl(var(--border)) transparent" } as const;
