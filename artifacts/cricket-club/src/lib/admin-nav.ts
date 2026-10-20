import {
  CalendarCheck,
  ClipboardList,
  Database,
  Image,
  LayoutGrid,
  Settings,
  Trophy,
  Upload,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Feature } from "@/lib/entitlements";

/**
 * The admin's information architecture (Social Studio U20): the groups, the
 * tabs inside each, and where they live. One source for the sidebar, the
 * group pages' tab bars, the breadcrumb and jump-to, so they never disagree.
 * The first tab of a group lives at the group's own path.
 */
export type AdminNavTab = {
  value: string;
  label: string;
  path: string;
  /** Paid feature; hidden when the tenant's plan lacks it. */
  feature?: Feature;
};

export type AdminNavGroup = {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  description?: string;
  /** Hide the whole group when the plan lacks this feature. */
  feature?: Feature;
  badge?: "social-queue";
  tabs: AdminNavTab[];
};

export const ADMIN_NAV: AdminNavGroup[] = [
  { key: "hub", label: "Hub", href: "/admin", icon: LayoutGrid, tabs: [] },
  {
    key: "selection",
    label: "Selection Hub",
    href: "/admin/selection",
    icon: ClipboardList,
    description:
      "This round's drafted sides, the team lists for upcoming junior games, and who team sheets are emailed to.",
    tabs: [
      { value: "senior", label: "Senior selection", path: "/admin/selection" },
      {
        value: "junior-fixtures",
        label: "Junior team lists",
        path: "/admin/selection/junior-fixtures",
      },
      { value: "email-lists", label: "Email lists", path: "/admin/selection/email-lists" },
    ],
  },
  {
    key: "availability",
    label: "Availability",
    href: "/admin/availability",
    icon: CalendarCheck,
    description: "The weekly availability round, its schedule, and the squad register.",
    tabs: [],
  },
  {
    key: "social",
    label: "Social Media Studio",
    href: "/admin/social",
    icon: Image,
    feature: "socialStudio",
    badge: "social-queue",
    description: "Branded share-card factory, card builders, junior cards and the review queue.",
    tabs: [
      { value: "studio", label: "Studio", path: "/admin/social", feature: "socialStudio" },
      {
        value: "plan",
        label: "Posting Plan",
        path: "/admin/social/plan",
        feature: "socialStudio",
      },
      { value: "cards", label: "Cards", path: "/admin/social/cards", feature: "socialStudio" },
      {
        value: "create",
        label: "Create a card",
        path: "/admin/social/create",
        feature: "socialStudio",
      },
      {
        value: "sets",
        label: "Carousel sets",
        path: "/admin/social/sets",
        feature: "socialStudio",
      },
      {
        value: "fixtures",
        label: "Fixtures",
        path: "/admin/social/fixtures",
        feature: "socialStudio",
      },
      {
        value: "juniors",
        label: "Junior cards",
        path: "/admin/social/juniors",
        feature: "socialStudio",
      },
      { value: "queue", label: "Queue", path: "/admin/social/queue", feature: "socialStudio" },
      {
        value: "library",
        label: "Photo library",
        path: "/admin/social/library",
        feature: "socialStudio",
      },
    ],
  },
  {
    key: "settings",
    label: "Display & Settings",
    href: "/admin/settings",
    icon: Settings,
    description:
      "Defaults and display options for the public pages, the clubroom display, plus site navigation.",
    tabs: [
      { value: "matches", label: "Matches page", path: "/admin/settings" },
      { value: "records", label: "Records page", path: "/admin/settings/records" },
      {
        value: "honour-boards",
        label: "Honour boards",
        path: "/admin/settings/honour-boards",
        feature: "curation",
      },
      {
        value: "milestone-board",
        label: "Milestone board",
        path: "/admin/settings/milestone-board",
        feature: "curation",
      },
      {
        value: "display",
        label: "Display & kiosk",
        path: "/admin/settings/display",
        feature: "clubroomTv",
      },
      { value: "junior-matches", label: "Junior matches", path: "/admin/settings/junior-matches" },
      { value: "tour", label: "Welcome & tour", path: "/admin/settings/tour" },
      { value: "nav", label: "Navigation & menus", path: "/admin/settings/nav" },
      { value: "branding", label: "Branding", path: "/admin/settings/branding" },
    ],
  },
  {
    key: "people",
    label: "People",
    href: "/admin/people",
    icon: Users,
    description: "Players, junior players, shirt numbers, committee, captains and club officials.",
    tabs: [
      { value: "players", label: "Players", path: "/admin/people" },
      { value: "junior-players", label: "Junior players", path: "/admin/people/junior-players" },
      {
        value: "shirt-numbers",
        label: "Shirt numbers",
        path: "/admin/people/shirt-numbers",
        feature: "curation",
      },
      {
        value: "committee",
        label: "Committee",
        path: "/admin/people/committee",
        feature: "curation",
      },
      { value: "captains", label: "Captains", path: "/admin/people/captains" },
      {
        value: "junior-office-bearers",
        label: "Junior office bearers",
        path: "/admin/people/junior-office-bearers",
      },
      { value: "non-players", label: "Non-player people", path: "/admin/people/non-players" },
    ],
  },
  {
    key: "honours",
    label: "Honours & Records",
    href: "/admin/honours",
    icon: Trophy,
    description:
      "Premierships, awards, Team of the Decade, caps, life members and junior premierships.",
    tabs: [
      { value: "premierships", label: "Premierships", path: "/admin/honours", feature: "curation" },
      { value: "awards", label: "Awards", path: "/admin/honours/awards", feature: "curation" },
      {
        value: "team-of-decade",
        label: "Team of the Decade",
        path: "/admin/honours/team-of-decade",
        feature: "curation",
      },
      { value: "caps", label: "Cap register", path: "/admin/honours/caps", feature: "curation" },
      {
        value: "life-members",
        label: "Life members",
        path: "/admin/honours/life-members",
        feature: "curation",
      },
      {
        value: "junior-premierships",
        label: "Junior premierships",
        path: "/admin/honours/junior-premierships",
      },
    ],
  },
  {
    key: "data",
    label: "Stats & Data",
    href: "/admin/data",
    icon: Database,
    description:
      "Fix the numbers: player stat rows, junior scorecards, stat corrections and duplicate players.",
    tabs: [
      { value: "stats", label: "Stats", path: "/admin/data" },
      {
        value: "junior-scorecards",
        label: "Junior scorecards",
        path: "/admin/data/junior-scorecards",
      },
      { value: "corrections", label: "Corrections", path: "/admin/data/corrections" },
      { value: "duplicates", label: "Duplicate players", path: "/admin/data/duplicates" },
    ],
  },
  {
    key: "import",
    label: "Imports",
    href: "/admin/import",
    icon: Upload,
    description:
      "Every file upload in one place: season and match stats, the PlayHQ squad export and shirt numbers.",
    tabs: [
      { value: "stats", label: "Stats", path: "/admin/import" },
      { value: "squad", label: "Squad", path: "/admin/import/squad" },
      {
        value: "shirt-numbers",
        label: "Shirt numbers",
        path: "/admin/import/shirt-numbers",
        feature: "curation",
      },
    ],
  },
  { key: "users", label: "Admin users", href: "/admin/users", icon: UserCog, tabs: [] },
];

export function groupIsActive(location: string, group: AdminNavGroup): boolean {
  return (
    location === group.href || (group.href !== "/admin" && location.startsWith(`${group.href}/`))
  );
}

/** The tab a location belongs to within its group (first tab lives at the group root). */
export function activeTab(location: string, group: AdminNavGroup): AdminNavTab | undefined {
  const nested = group.tabs.find(
    (t) => t.path !== group.href && (location === t.path || location.startsWith(`${t.path}/`)),
  );
  return nested ?? (group.tabs.length ? group.tabs[0] : undefined);
}

/** Groups and tabs the tenant's plan includes. */
export function visibleNav(entitlements: Partial<Record<Feature, boolean>>): AdminNavGroup[] {
  return ADMIN_NAV.filter((g) => !g.feature || entitlements[g.feature]).map((g) => ({
    ...g,
    tabs: g.tabs.filter((t) => !t.feature || entitlements[t.feature]),
  }));
}

/** Breadcrumb parts for a location: Admin / Group / Tab. */
export function adminBreadcrumb(location: string): string[] {
  const group = ADMIN_NAV.find((g) => groupIsActive(location, g));
  if (!group) return ["Admin"];
  const tab = activeTab(location, group);
  return tab ? ["Admin", group.label, tab.label] : ["Admin", group.label];
}
