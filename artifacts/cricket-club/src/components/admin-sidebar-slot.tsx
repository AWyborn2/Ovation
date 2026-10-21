import { createContext, useContext, useEffect, useState } from "react";

export type SidebarMode = "menu" | "pool";

const MODE_KEY = "selection-sidebar-mode";

/**
 * A space in the admin sidebar a page can render into (the Selection Hub's
 * player pool). `node` is set only while the slot is on screen: the page is
 * the hub, the sidebar is in pool mode, not collapsed, and the viewport is at
 * the `nav` breakpoint or wider. With no node the page renders inline.
 */
export type AdminSidebarSlot = {
  node: HTMLElement | null;
  /** The number shown on the Pool toggle (the hub's unpicked players). */
  setCount: (n: number | null) => void;
};

export const AdminSidebarSlotContext = createContext<AdminSidebarSlot>({
  node: null,
  setCount: () => {},
});

export const useAdminSidebarSlot = () => useContext(AdminSidebarSlotContext);

export function readSidebarMode(): SidebarMode {
  try {
    return localStorage.getItem(MODE_KEY) === "menu" ? "menu" : "pool";
  } catch {
    return "pool";
  }
}

export function writeSidebarMode(mode: SidebarMode) {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // Storage blocked: the choice lasts until the page reloads.
  }
}

/** True while `query` matches; false where matchMedia is missing (tests, SSR). */
export function useMediaQuery(query: string): boolean {
  const get = () => typeof matchMedia === "function" && matchMedia(query).matches;
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const mql = matchMedia(query);
    const on = () => setMatches(mql.matches);
    on();
    mql.addEventListener("change", on);
    return () => mql.removeEventListener("change", on);
  }, [query]);
  return matches;
}

/** The `nav` breakpoint (--breakpoint-nav in index.css). */
export const NAV_QUERY = "(min-width: 56.25rem)";
