/**
 * Seed the nav_items table with today's hard-coded navigation so the public
 * site is visually unchanged until an admin edits it.
 *
 * Idempotent / re-runnable: a surface is only seeded when it currently has zero
 * rows, so re-running never clobbers admin edits to an already-populated surface.
 *
 * Surfaces:
 *  - senior_menu        — senior top menu
 *  - junior_menu        — junior top menu
 *  - junior_quick_links — junior dashboard quick-link cards (title + desc + icon)
 *  - admin_tiles        — admin hub shortcut cards (title + desc)
 *
 * Run with: pnpm --filter @workspace/scripts run seed-nav-items
 */
import { db, navItemsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

type Seed = {
  label: string;
  target: string;
  iconKey?: string;
  description?: string;
};

const SENIOR_MENU: Seed[] = [
  { label: "Honour Boards", target: "/", iconKey: "scrollText" },
  { label: "Players", target: "/players", iconKey: "users" },
  { label: "Matches", target: "/matches", iconKey: "clipboardList" },
  { label: "Grades", target: "/grades", iconKey: "trophy" },
  { label: "Records", target: "/records", iconKey: "award" },
  { label: "Premierships", target: "/premierships", iconKey: "crown" },
  { label: "Compare", target: "/compare", iconKey: "gitCompare" },
];

const JUNIOR_MENU: Seed[] = [
  { label: "Overview", target: "/juniors", iconKey: "scrollText" },
  { label: "Matches", target: "/juniors/matches", iconKey: "clipboardList" },
  { label: "Premierships", target: "/juniors/premierships", iconKey: "crown" },
  { label: "Players", target: "/juniors/players", iconKey: "users" },
  { label: "Office Bearers", target: "/juniors/office-bearers", iconKey: "award" },
];

const JUNIOR_QUICK_LINKS: Seed[] = [
  {
    label: "Matches",
    target: "/juniors/matches",
    iconKey: "clipboardList",
    description: "Browse junior games and full scorecards.",
  },
  {
    label: "Premierships",
    target: "/juniors/premierships",
    iconKey: "crown",
    description: "Junior honour boards and winning rosters.",
  },
  {
    label: "Players & Leaders",
    target: "/juniors/players",
    iconKey: "users",
    description: "Runs, wickets and games leaderboards.",
  },
];

const ADMIN_TILES: Seed[] = [
  { label: "Admin users", target: "/admin/users", iconKey: "userCog", description: "Add, rename, reset passwords, remove admins." },
  { label: "Stats", target: "/admin/stats", iconKey: "barChart3", description: "Search, edit and delete per-grade stat rows." },
  { label: "Players", target: "/admin/players", iconKey: "users", description: "Rename, mark deceased, merge duplicates, delete." },
  { label: "Premierships", target: "/admin/premierships", iconKey: "crown", description: "Add and edit premiership records and squads." },
  { label: "Honour boards", target: "/admin/honour-boards", iconKey: "scrollText", description: "Edit board titles and pin/hide overrides." },
  { label: "Milestone board", target: "/admin/milestone-board", iconKey: "medal", description: "Show recent / approaching milestones and set thresholds." },
  { label: "Matches page display", target: "/admin/match-display", iconKey: "clipboardList", description: "Default grade/season, grade menu order, round order." },
  { label: "Import CSV", target: "/admin/import", iconKey: "upload", description: "Upload a PlayCricket combined CSV for a season." },
  { label: "Cap register", target: "/admin/caps", iconKey: "ticket", description: "A Grade cap numbers and links." },
  { label: "Life members", target: "/admin/life-members", iconKey: "star", description: "Honour-board life members." },
  { label: "Awards", target: "/admin/awards", iconKey: "award", description: "Create club awards and record past winners." },
  { label: "Team of the Decade", target: "/admin/team-of-decade", iconKey: "trophy", description: "Curate best-XI honour boards with draft/publish." },
  { label: "Junior office bearers", target: "/admin/junior-committee", iconKey: "baby", description: "Season-by-season junior committee (separate from seniors)." },
  { label: "Social cards", target: "/admin/social", iconKey: "image", description: "Share-card factory: sizes, sponsors, captions." },
  { label: "Create a card", target: "/admin/social/create", iconKey: "image", description: "Build a Match Summary card from a match or by hand." },
  { label: "Social queue", target: "/admin/social/queue", iconKey: "listChecks", description: "Auto-detected milestones, round-ups, tracked links." },
  { label: "Navigation & menus", target: "/admin/nav", iconKey: "layoutGrid", description: "Configure menus and quick-link cards across the site." },
];

const SURFACES: { surface: string; items: Seed[] }[] = [
  { surface: "senior_menu", items: SENIOR_MENU },
  { surface: "junior_menu", items: JUNIOR_MENU },
  { surface: "junior_quick_links", items: JUNIOR_QUICK_LINKS },
  { surface: "admin_tiles", items: ADMIN_TILES },
];

async function main() {
  for (const { surface, items } of SURFACES) {
    const existing = await db
      .select({ id: navItemsTable.id })
      .from(navItemsTable)
      .where(eq(navItemsTable.surface, surface));
    if (existing.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`• ${surface}: ${existing.length} rows already present — skipped`);
      continue;
    }
    await db.insert(navItemsTable).values(
      items.map((it, idx) => ({
        surface,
        label: it.label,
        description: it.description ?? "",
        iconKey: it.iconKey ?? "",
        target: it.target,
        isExternal: false,
        sortOrder: idx,
        visible: true,
      })),
    );
    // eslint-disable-next-line no-console
    console.log(`+ ${surface}: seeded ${items.length} items`);
  }
  // eslint-disable-next-line no-console
  console.log("seed-nav-items: done");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
