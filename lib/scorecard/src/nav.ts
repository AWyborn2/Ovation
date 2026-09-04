/**
 * Navigation resolution shared by the website and the mobile app.
 *
 * Pure: no React, DOM or React Native. Each app's `use-nav.ts` is a thin hook
 * that fetches `GET /nav-items?surface=…` and hands the rows to
 * `resolveNavItems`, so the filtering / ordering / fallback rules live once.
 */

/** Every admin-configurable navigation surface. */
export const NAV_SURFACES = [
  "senior_menu",
  "junior_menu",
  "junior_quick_links",
  "admin_tiles",
] as const;

export type NavSurface = (typeof NAV_SURFACES)[number];

/** What a rendered menu / tile needs to know about one item. */
export type ResolvedNavItem = {
  label: string;
  target: string;
  isExternal: boolean;
  iconKey: string;
  description: string;
};

/**
 * Structural shape of an API `NavItem` row. Only `ResolvedNavItem`'s fields
 * are required so callers can pass the generated client type directly;
 * `surface`, `sortOrder` and `visible` refine the result when present.
 */
export type NavItemLike = ResolvedNavItem & {
  surface?: string;
  sortOrder?: number;
  visible?: boolean;
};

/** Project an API row down to the fields the UI renders. */
export function toResolvedNavItem(item: NavItemLike): ResolvedNavItem {
  return {
    label: item.label,
    target: item.target,
    isExternal: item.isExternal,
    iconKey: item.iconKey,
    description: item.description,
  };
}

/**
 * Resolve the items to render for a surface.
 *
 * - Rows for another surface and rows explicitly marked `visible: false` are
 *   dropped (the public endpoint already does both; this makes the client
 *   safe against a stale or over-broad response).
 * - Rows are ordered by `sortOrder` when present; the API's order is kept for
 *   ties, so an already-sorted response is returned unchanged.
 * - When nothing remains — config not loaded, API unavailable or unseeded —
 *   the supplied hard-coded `fallback` is returned so the surface always
 *   renders.
 */
export function resolveNavItems(
  surface: NavSurface,
  items: readonly NavItemLike[] | null | undefined,
  fallback: ResolvedNavItem[],
): ResolvedNavItem[] {
  if (!items?.length) return fallback;
  const kept = items.filter(
    (it) => (it.surface === undefined || it.surface === surface) && it.visible !== false,
  );
  if (kept.length === 0) return fallback;
  const ordered = kept
    .map((it, i) => ({ it, i }))
    .sort((a, b) => {
      const ao = a.it.sortOrder ?? 0;
      const bo = b.it.sortOrder ?? 0;
      return ao !== bo ? ao - bo : a.i - b.i;
    })
    .map(({ it }) => it);
  return ordered.map(toResolvedNavItem);
}

/**
 * True when a nav target must be opened outside the app's router — either
 * flagged external by the admin or an absolute URL pasted into the target.
 */
export function isExternalNavTarget(item: Pick<ResolvedNavItem, "target" | "isExternal">): boolean {
  return item.isExternal || /^[a-z][a-z0-9+.-]*:\/\//i.test(item.target);
}
