import { Router, type IRouter } from "express";
import { asc, desc, eq } from "drizzle-orm";
import { db, clubRolesTable } from "@workspace/db";
import {
  CreateClubRoleBody,
  UpdateClubRoleBody,
  UpdateClubRoleParams,
  DeleteClubRoleParams,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/require-admin";

const router: IRouter = Router();

const orderedSelect = () =>
  db
    .select()
    .from(clubRolesTable)
    .orderBy(
      desc(clubRolesTable.season),
      asc(clubRolesTable.displayOrder),
      asc(clubRolesTable.id),
    );

// Public: published role records only.
router.get("/club-roles", async (_req, res): Promise<void> => {
  const rows = await orderedSelect().where(eq(clubRolesTable.published, true));
  res.json(rows);
});

// Admin: every role record including unpublished drafts.
router.get("/club-roles/all", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await orderedSelect();
  res.json(rows);
});

router.post("/club-roles", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateClubRoleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .insert(clubRolesTable)
    .values({
      season: parsed.data.season,
      role: parsed.data.role,
      grade: parsed.data.grade ?? null,
      playerId: parsed.data.playerId ?? null,
      name: parsed.data.name,
      displayOrder: parsed.data.displayOrder ?? 0,
      published: parsed.data.published ?? false,
    })
    .returning();
  res.status(201).json(row);
});

router.patch("/club-roles/:id", requireAdmin, async (req, res): Promise<void> => {
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
    .where(eq(clubRolesTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Club role not found" });
    return;
  }
  res.json(row);
});

router.delete("/club-roles/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteClubRoleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .delete(clubRolesTable)
    .where(eq(clubRolesTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Club role not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
