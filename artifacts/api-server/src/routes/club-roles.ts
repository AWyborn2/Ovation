import { Router, type IRouter } from "express";
import { and, asc, desc, eq } from "drizzle-orm";
import { db, clubRolesTable } from "@workspace/db";
import {
  CreateClubRoleBody,
  UpdateClubRoleBody,
  UpdateClubRoleParams,
  DeleteClubRoleParams,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/require-admin";
import { requireEntitlement } from "../middlewares/require-entitlement";
import { getTenantId } from "../middlewares/tenant-context";

const router: IRouter = Router();

const orderedSelect = (tenantId: number) =>
  db
    .select()
    .from(clubRolesTable)
    .where(eq(clubRolesTable.tenantId, tenantId))
    .orderBy(
      desc(clubRolesTable.season),
      asc(clubRolesTable.displayOrder),
      asc(clubRolesTable.id),
    )
    .$dynamic();

// Public: published role records only.
router.get("/club-roles", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  const rows = await db
    .select()
    .from(clubRolesTable)
    .where(and(eq(clubRolesTable.tenantId, tenantId), eq(clubRolesTable.published, true)))
    .orderBy(
      desc(clubRolesTable.season),
      asc(clubRolesTable.displayOrder),
      asc(clubRolesTable.id),
    );
  res.json(rows);
});

// Admin: every role record including unpublished drafts — for this tenant only.
router.get("/club-roles/all", requireAdmin, async (req, res): Promise<void> => {
  const rows = await orderedSelect(getTenantId(req));
  res.json(rows);
});

router.post("/club-roles", requireAdmin, requireEntitlement("curation"), async (req, res): Promise<void> => {
  const parsed = CreateClubRoleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .insert(clubRolesTable)
    .values({
      tenantId: getTenantId(req),
      season: parsed.data.season,
      role: parsed.data.role,
      grade: parsed.data.grade ?? null,
      playerId: parsed.data.playerId ?? null,
      nonPlayerId: parsed.data.nonPlayerId ?? null,
      name: parsed.data.name,
      displayOrder: parsed.data.displayOrder ?? 0,
      published: parsed.data.published ?? false,
    })
    .returning();
  res.status(201).json(row);
});

router.patch("/club-roles/:id", requireAdmin, requireEntitlement("curation"), async (req, res): Promise<void> => {
  const params = UpdateClubRoleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateClubRoleBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [row] = await db
    .update(clubRolesTable)
    .set(body.data)
    .where(and(eq(clubRolesTable.tenantId, getTenantId(req)), eq(clubRolesTable.id, params.data.id)))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Club role not found" });
    return;
  }
  res.json(row);
});

router.delete("/club-roles/:id", requireAdmin, requireEntitlement("curation"), async (req, res): Promise<void> => {
  const params = DeleteClubRoleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .delete(clubRolesTable)
    .where(and(eq(clubRolesTable.tenantId, getTenantId(req)), eq(clubRolesTable.id, params.data.id)))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Club role not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
