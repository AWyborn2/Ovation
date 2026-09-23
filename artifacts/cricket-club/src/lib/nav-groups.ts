import type { ResolvedNavItem } from "@/lib/use-nav";

export type Section = "seniors" | "juniors";
export type NavGroupKey = "stats" | "history" | "club";

export interface NavGroup {
  key: NavGroupKey;
  label: string;
  items: ResolvedNavItem[];
}

export interface GroupedNav {
  /** Ungrouped top-level links (Home / Overview). */
  top: ResolvedNavItem[];
  /** Non-empty groups in display order: Stats, History, Club. */
  groups: NavGroup[];
}

const GROUP_LABELS: Record<NavGroupKey, string> = {
  stats: "Stats",
  history: "History",
  club: "Club",
};
const GROUP_ORDER: NavGroupKey[] = ["stats", "history", "club"];

/** Known internal targets → group. Anything unmapped (or external) → Club. */
const TARGET_GROUPS: Record<Section, [prefix: string, group: NavGroupKey | "top"][]> = {
  seniors: [
    ["/players", "stats"],
    ["/matches", "stats"],
    ["/grades", "stats"],
    ["/records", "stats"],
    ["/compare", "stats"],
    ["/stats", "stats"],
    ["/honour-boards", "history"],
    ["/premierships", "history"],
    ["/caps", "history"],
    ["/fixtures", "club"],
  ],
  juniors: [
    ["/juniors/matches", "stats"],
    ["/juniors/players", "stats"],
    ["/juniors/premierships", "history"],
    ["/juniors/office-bearers", "history"],
  ],
};

/** One-line descriptions for the mega-menu, used when the admin set none. */
const DEFAULT_DESCRIPTIONS: Record<string, string> = {
  "/players": "Career stats for everyone who has played",
  "/matches": "Results and full scorecards",
  "/grades": "Leaderboards by grade and season",
  "/records": "Club records across all grades",
  "/compare": "Put two players side by side",
  "/honour-boards": "Life members, awards and honours",
  "/premierships": "Every premiership-winning side",
  "/fixtures": "Upcoming games and results",
  "/juniors/matches": "Junior results and scorecards",
  "/juniors/players": "Every junior player's record",
  "/juniors/premierships": "Junior premiership sides",
  "/juniors/office-bearers": "Junior committee and coordinators",
};

function pathOf(target: string): string {
  return target.split(/[?#]/)[0];
}

/** Which group (or top level) a nav item belongs to in a section. */
export function groupOf(item: ResolvedNavItem, section: Section): NavGroupKey | "top" {
  if (item.isExternal || /^https?:\/\//i.test(item.target)) return "club";
  const path = pathOf(item.target);
  if (path === "/" || path === "/juniors") return "top";
  for (const [prefix, group] of TARGET_GROUPS[section]) {
    if (path === prefix || path.startsWith(prefix + "/")) return group;
  }
  return "club";
}

/** The item's description, falling back to a built-in one for known pages. */
export function describe(item: ResolvedNavItem): string {
  return item.description?.trim() || DEFAULT_DESCRIPTIONS[pathOf(item.target)] || "";
}

/**
 * Group a section's configured nav items (from `useNavSurface`) into the
 * Broadcast header's menus. Order within a group follows the admin's order.
 */
export function groupNavItems(items: ResolvedNavItem[], section: Section): GroupedNav {
  const top: ResolvedNavItem[] = [];
  const buckets: Record<NavGroupKey, ResolvedNavItem[]> = { stats: [], history: [], club: [] };
  for (const item of items) {
    const g = groupOf(item, section);
    if (g === "top") top.push(item);
    else buckets[g].push(item);
  }
  return {
    top,
    groups: GROUP_ORDER.filter((k) => buckets[k].length > 0).map((k) => ({
      key: k,
      label: GROUP_LABELS[k],
      items: buckets[k],
    })),
  };
}

const INDEX_PATHS = new Set(["/", "/juniors"]);

/** True when `location` is the item's page (index pages match exactly). */
export function isNavItemActive(location: string, item: ResolvedNavItem): boolean {
  if (item.isExternal) return false;
  const path = pathOf(item.target);
  if (INDEX_PATHS.has(path)) return location === path;
  return location === path || location.startsWith(path + "/");
}

/** True when any child of the group is the current page. */
export function isGroupActive(location: string, group: NavGroup): boolean {
  return group.items.some((i) => isNavItemActive(location, i));
}

/** Section derived from the route, as before the redesign. */
export function sectionOf(location: string): Section {
  return location === "/juniors" || location.startsWith("/juniors/") ? "juniors" : "seniors";
}
