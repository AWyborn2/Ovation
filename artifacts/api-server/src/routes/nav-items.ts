import { Router, type IRouter } from "express";
import { and, asc, eq, inArray, type SQL } from "drizzle-orm";
import { db, navItemsTable } from "@workspace/db";
import {
  ListNavItemsQueryParams,
  CreateNavItemBody,
  UpdateNavItemParams,
  UpdateNavItemBody,
  DeleteNavItemParams,
  ReorderNavItemsBody,
} from "@workspace/api-zod";
import { requireAdmin, resolveAdmin } from "../middlewares/require-admin";

const router: IRouter = Router();

// Curated set of internal page targets the admin can link a nav item to.
const INTERNAL_TARGETS: { value: string; label: string; section: "senior" | "junior" | "admin" }[] = [
  // Senior public pages
  { value: "/", label: "Honour Boards", section: "senior" },
  { value: "/players", label: "Players", section: "senior" },
  { value: "/matches", label: "Matches", section: "senior" },
  { value: "/grades", label: "Grades", section: "senior" },
  { value: "/records", label: "Records", section: "senior" },
  { value: "/premierships", label: "Premierships", section: "senior" },
  { value: "/compare", label: "Compare", section: "senior" },
  // Junior public pages
  { value: "/juniors", label: "Juniors Overview", section: "junior" },
  { value: "/juniors/matches", label: "Juniors Matches", section: "junior" },
  { value: "/juniors/premierships", label: "Juniors Premierships", section: "junior" },
  { value: "/juniors/players", label: "Juniors Players", section: "junior" },
  { value: "/juniors/office-bearers", label: "Juniors Office Bearers", section: "junior" },
  // Admin pages
  { value: "/admin", label: "Admin Hub", section: "admin" },
  { value: "/admin/users", label: "Admin users", section: "admin" },
  { value: "/admin/stats", label: "Stats", section: "admin" },
  { value: "/admin/players", label: "Players", section: "admin" },
  { value: "/admin/premierships", label: "Premierships", section: "admin" },
  { value: "/admin/honour-boards", label: "Honour boards", section: "admin" },
  { value: "/admin/milestone-board", label: "Milestone board", section: "admin" },
  { value: "/admin/match-display", label: "Matches page display", section: "admin" },
  { value: "/admin/import", label: "Import CSV", section: "admin" },
  { value: "/admin/caps", label: "Cap register", section: "admin" },
  { value: "/admin/life-members", label: "Life members", section: "admin" },
  { value: "/admin/awards", label: "Awards", section: "admin" },
  { value: "/admin/team-of-decade", label: "Team of the Decade", section: "admin" },
  { value: "/admin/committee", label: "Committee", section: "admin" },
  { value: "/admin/captains", label: "Captains", section: "admin" },
  { value: "/admin/junior-committee", label: "Junior office bearers", section: "admin" },
  { value: "/admin/social", label: "Social cards", section: "admin" },
  { value: "/admin/social/create", label: "Create a card", section: "admin" },
  { value: "/admin/social/queue", label: "Social queue", section: "admin" },
  { value: "/admin/nav", label: "Navigation & menus", section: "admin" },
];

// Curated icon keys. The client maps each key to a lucide icon; keep this list
// in sync with NAV_ICON_MAP in the frontend (src/lib/nav-icons.tsx).
const ICON_KEYS = [
  "scrollText",
  "users",
  "clipboardList",
  "trophy",
  "award",
  "crown",
  "gitCompare",
  "settings",
  "baby",
  "calendarDays",
  "trendingUp",
  "star",
  "home",
  "link",
  "fileText",
  "shoppingBag",
  "image",
  "listChecks",
  "barChart3",
  "shield",
  "flag",
  "mail",
  "phone",
  "userCog",
  "database",
  "upload",
  "medal",
  "bookOpen",
  "megaphone",
  "layoutGrid",
  "ticket",
];

function serialize(row: typeof navItemsTable.$inferSelect) {
  return {
    id: row.id,
    surface: row.surface as
      | "senior_menu"
      | "junior_menu"
      | "junior_quick_links"
      | "admin_tiles",
    label: row.label,
    description: row.description,
    iconKey: row.iconKey,
    target: row.target,
    isExternal: row.isExternal,
    sortOrder: row.sortOrder,
    visible: row.visible,
  };
}

router.get("/nav-options", (_req, res): void => {
  res.json({ internalTargets: INTERNAL_TARGETS, icons: ICON_KEYS });
});

// Public read. Hidden items are excluded unless an authenticated admin asks for
// them via includeHidden=true.
router.get("/nav-items", async (req, res): Promise<void> => {
  const parsed = ListNavItemsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const includeHidden =
    parsed.data.includeHidden === true && !!(await resolveAdmin(req));

  const conditions: SQL[] = [];
  if (parsed.data.surface) {
    conditions.push(eq(navItemsTable.surface, parsed.data.surface));
  }
  if (!includeHidden) {
    conditions.push(eq(navItemsTable.visible, true));
  }

  const rows = await db
    .select()
    .from(navItemsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(navItemsTable.surface), asc(navItemsTable.sortOrder), asc(navItemsTable.id));

  res.json(rows.map(serialize));
});

router.post("/nav-items", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateNavItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  // New items go to the end of their surface by default.
  const existing = await db
    .select({ sortOrder: navItemsTable.sortOrder })
    .from(navItemsTable)
    .where(eq(navItemsTable.surface, parsed.data.surface));
  const nextOrder =
    parsed.data.sortOrder ??
    (existing.length === 0
      ? 0
      : Math.max(...existing.map((e) => e.sortOrder)) + 1);

  const [row] = await db
    .insert(navItemsTable)
    .values({
      surface: parsed.data.surface,
      label: parsed.data.label,
      description: parsed.data.description ?? "",
      iconKey: parsed.data.iconKey ?? "",
      target: parsed.data.target,
      isExternal: parsed.data.isExternal ?? false,
      sortOrder: nextOrder,
      visible: parsed.data.visible ?? true,
    })
    .returning();
  res.status(201).json(serialize(row));
});

router.patch("/nav-items/reorder", requireAdmin, async (req, res): Promise<void> => {
  const parsed = ReorderNavItemsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { surface, ids } = parsed.data;
  if (ids.length > 0) {
    // Verify all ids belong to the surface before reordering.
    const rows = await db
      .select({ id: navItemsTable.id, surface: navItemsTable.surface })
      .from(navItemsTable)
      .where(inArray(navItemsTable.id, ids));
    const bySurface = new Set(rows.filter((r) => r.surface === surface).map((r) => r.id));
    if (ids.some((id) => !bySurface.has(id))) {
      res.status(400).json({ error: "All ids must belong to the given surface." });
      return;
    }
    await db.transaction(async (tx) => {
      for (let i = 0; i < ids.length; i++) {
        await tx
          .update(navItemsTable)
          .set({ sortOrder: i, updatedAt: new Date() })
          .where(eq(navItemsTable.id, ids[i]));
      }
    });
  }
  const out = await db
    .select()
    .from(navItemsTable)
    .where(eq(navItemsTable.surface, surface))
    .orderBy(asc(navItemsTable.sortOrder), asc(navItemsTable.id));
  res.json(out.map(serialize));
});

router.patch("/nav-items/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateNavItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateNavItemBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [row] = await db
    .update(navItemsTable)
    .set({ ...body.data, updatedAt: new Date() })
    .where(eq(navItemsTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Nav item not found" });
    return;
  }
  res.json(serialize(row));
});

router.delete("/nav-items/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteNavItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .delete(navItemsTable)
    .where(eq(navItemsTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Nav item not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
