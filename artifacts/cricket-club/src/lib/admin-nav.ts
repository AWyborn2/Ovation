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
  /**
   * Routable but left out of the tab bar, sidebar and jump-to (New Studio keeps
   * the old pages reachable by URL and from its Settings page).
   */
  hidden?: boolean;
  /** Send this tab's path on to another page instead of mounting one. */
  redirect?: string;
  /** Skip the redirect when the URL carries this query parameter. */
  redirectUnless?: string;
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
  /**
   * The group's tabs when the club's "New Studio (preview)" switch is on
   * (studio-create-consolidation). Absent: the same tabs either way.
   */
  previewTabs?: AdminNavTab[];
};

/** Per-tenant switches that change the menu. */
export type NavOptions = { newStudio?: boolean };

const studioTab = (value: string, label: string, path: string, extra: Partial<AdminNavTab> = {}) =>
  ({ value, label, path, feature: "socialStudio", ...extra }) satisfies AdminNavTab;

/**
 * New Studio's menu (studio-create-consolidation): Home, Create, Queue, Your
 * designs, Templates, Photos, Settings. The pages that leave the menu stay
 * routable (hidden); Settings links to them. Old URLs whose page moved redirect.
 */
export const NEW_STUDIO_TABS: AdminNavTab[] = [
  studioTab("studio", "Home", "/admin/social"),
  studioTab("create", "Create", "/admin/social/create"),
  studioTab("queue", "Queue", "/admin/social/queue"),
  studioTab("designs", "Your designs", "/admin/social/designs"),
  studioTab("template-library", "Templates", "/admin/social/template-library"),
  studioTab("photos", "Photos", "/admin/social/photos"),
  studioTab("settings", "Settings", "/admin/social/settings"),
  studioTab("plan", "Posting Plan", "/admin/social/plan", { hidden: true }),
  studioTab("cards", "Cards", "/admin/social/cards", { hidden: true }),
  studioTab("fixtures", "Fixtures", "/admin/social/fixtures", { hidden: true }),
  studioTab("email-lists", "Email lists", "/admin/social/email-lists", { hidden: true }),
  // Junior cards are made in Create, with Juniors on.
  studioTab("juniors", "Junior cards", "/admin/social/juniors", {
    hidden: true,
    redirect: "/admin/social/create?team=junior",
  }),
  // Old export-only carousel sets open from Your designs (`?open=<id>`); the list moved there.
  studioTab("sets", "Carousel sets", "/admin/social/sets", {
    hidden: true,
    redirect: "/admin/social/designs?type=set",
    redirectUnless: "open",
  }),
  studioTab("library", "Photo library", "/admin/social/library", {
    hidden: true,
    redirect: "/admin/social/photos",
  }),
  studioTab("junior-library", "Junior photo library", "/admin/social/junior-library", {
    hidden: true,
    redirect: "/admin/social/photos?tab=junior",
  }),
];

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
    description:
      "Design and post branded cards: a Studio home to create and pick up designs, templates, carousel sets, junior cards and the review queue.",
    tabs: [
      // Home is the Canva-style Studio home (plan 2026-10-23); Cards holds the
      // posting, theme, sponsor and caption settings, and the old upload cards.
      { value: "studio", label: "Home", path: "/admin/social", feature: "socialStudio" },
      {
        value: "template-library",
        label: "Templates",
        path: "/admin/social/template-library",
        feature: "socialStudio",
      },
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
        value: "plan",
        label: "Posting Plan",
        path: "/admin/social/plan",
        feature: "socialStudio",
      },
      { value: "queue", label: "Queue", path: "/admin/social/queue", feature: "socialStudio" },
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
      {
        value: "email-lists",
        label: "Email lists",
        path: "/admin/social/email-lists",
        feature: "socialStudio",
      },
      {
        value: "library",
        label: "Photo library",
        path: "/admin/social/library",
        feature: "socialStudio",
      },
      {
        value: "junior-library",
        label: "Junior photo library",
        path: "/admin/social/junior-library",
        feature: "socialStudio",
      },
      { value: "cards", label: "Cards", path: "/admin/social/cards", feature: "socialStudio" },
      {
        value: "settings",
        label: "Settings",
        path: "/admin/social/settings",
        feature: "socialStudio",
      },
    ],
    previewTabs: NEW_STUDIO_TABS,
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
      "Premierships, awards, Team of the Decade, caps, life members, hat-tricks and junior premierships.",
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
        value: "hat-tricks",
        label: "Hat-tricks",
        path: "/admin/honours/hat-tricks",
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

/** A group's tabs for this tenant (hidden ones included): New Studio's when its switch is on. */
export function groupTabs(group: AdminNavGroup, opts: NavOptions = {}): AdminNavTab[] {
  return opts.newStudio && group.previewTabs ? group.previewTabs : group.tabs;
}

/** Groups and tabs the tenant's plan includes, as the menu shows them (no hidden tabs). */
export function visibleNav(
  entitlements: Partial<Record<Feature, boolean>>,
  opts: NavOptions = {},
): AdminNavGroup[] {
  return ADMIN_NAV.filter((g) => !g.feature || entitlements[g.feature]).map((g) => ({
    ...g,
    tabs: groupTabs(g, opts).filter((t) => !t.hidden && (!t.feature || entitlements[t.feature])),
  }));
}

/** Breadcrumb parts for a location: Admin / Group / Tab. */
export function adminBreadcrumb(location: string, opts: NavOptions = {}): string[] {
  const group = ADMIN_NAV.find((g) => groupIsActive(location, g));
  if (!group) return ["Admin"];
  const tab = activeTab(location, { ...group, tabs: groupTabs(group, opts) });
  return tab ? ["Admin", group.label, tab.label] : ["Admin", group.label];
}
