/**
 * Pure helpers for the platform-admin tenant list's health view: relative
 * "last active" formatting, the health filter predicate, and sorting. Kept
 * separate from the component so the sort/filter/format logic is unit-testable
 * without rendering.
 */

/** The minimal tenant shape the health view reads (a structural subset of AdminTenant). */
export interface TenantHealthRow {
  name: string;
  slug: string;
  centralClubName?: string | null;
  adminCount: number;
  lastActiveAt?: string | null;
  suspendedAt?: string | null;
  brandingComplete: boolean;
}

export type HealthFilter =
  | "all"
  | "never-active"
  | "branding-incomplete"
  | "suspended";

export type SortColumn = "name" | "lastActive" | "admins";
export type SortDirection = "asc" | "desc";

export interface SortState {
  column: SortColumn;
  direction: SortDirection;
}

/**
 * The default sort: stalest first (never-active tenants at the very top), so the
 * operator's primary signal — which onboardings have stalled — is visible on
 * first paint without any interaction.
 */
export const DEFAULT_SORT: SortState = { column: "lastActive", direction: "asc" };

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Format an ISO instant as a coarse relative string ("just now", "3 hours ago",
 * "2 days ago"), or "never" when the tenant has never been active (null). `now`
 * is injectable so the formatting is deterministic under test.
 */
export function formatLastActive(
  iso: string | null | undefined,
  now: number = Date.now(),
): string {
  if (iso == null) return "never";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "never";
  const delta = Math.max(0, now - then);
  if (delta < MINUTE) return "just now";
  if (delta < HOUR) {
    const m = Math.floor(delta / MINUTE);
    return `${m} minute${m === 1 ? "" : "s"} ago`;
  }
  if (delta < DAY) {
    const h = Math.floor(delta / HOUR);
    return `${h} hour${h === 1 ? "" : "s"} ago`;
  }
  const d = Math.floor(delta / DAY);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

/** Whether a tenant passes the active health filter. */
export function passesHealthFilter(
  t: TenantHealthRow,
  filter: HealthFilter,
): boolean {
  switch (filter) {
    case "never-active":
      return t.lastActiveAt == null;
    case "branding-incomplete":
      return t.brandingComplete === false;
    case "suspended":
      return t.suspendedAt != null;
    case "all":
    default:
      return true;
  }
}

/** Whether a tenant matches the free-text search (name, slug, or central club name). */
export function matchesSearch(t: TenantHealthRow, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return (
    t.name.toLowerCase().includes(needle) ||
    t.slug.toLowerCase().includes(needle) ||
    (t.centralClubName ?? "").toLowerCase().includes(needle)
  );
}

/**
 * Sort key for the last-active column. A never-active tenant (null) is treated
 * as the oldest possible time so it sorts to the top under ascending order —
 * the stalest-first default the operator wants.
 */
function lastActiveKey(t: TenantHealthRow): number {
  if (t.lastActiveAt == null) return Number.NEGATIVE_INFINITY;
  const ms = new Date(t.lastActiveAt).getTime();
  return Number.isNaN(ms) ? Number.NEGATIVE_INFINITY : ms;
}

/**
 * Sort tenants by the given column/direction. Non-mutating (returns a new array).
 * Ties fall back to name so the order is stable and deterministic.
 */
export function sortTenants<T extends TenantHealthRow>(
  rows: readonly T[],
  { column, direction }: SortState,
): T[] {
  const dir = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    let primary = 0;
    if (column === "name") primary = a.name.localeCompare(b.name) * dir;
    else if (column === "admins") primary = (a.adminCount - b.adminCount) * dir;
    else primary = (lastActiveKey(a) - lastActiveKey(b)) * dir;
    // Stable, deterministic tie-break: always ascending by name.
    return primary !== 0 ? primary : a.name.localeCompare(b.name);
  });
}

/** Toggle sort state when a header is clicked: same column flips direction, new column starts ascending. */
export function nextSort(current: SortState, column: SortColumn): SortState {
  if (current.column === column) {
    return { column, direction: current.direction === "asc" ? "desc" : "asc" };
  }
  return { column, direction: "asc" };
}
