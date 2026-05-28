import { Router, type IRouter } from "express";
import { asc, eq } from "drizzle-orm";
import { db, lifeMembersTable } from "@workspace/db";
import {
  CreateLifeMemberBody,
  UpdateLifeMemberBody,
  UpdateLifeMemberParams,
  DeleteLifeMemberParams,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/require-admin";

const router: IRouter = Router();

router.get("/life-members", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(lifeMembersTable)
    .orderBy(asc(lifeMembersTable.inductionYear), asc(lifeMembersTable.name));
  res.json(rows);
});

router.post("/life-members", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateLifeMemberBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .insert(lifeMembersTable)
    .values({
      name: parsed.data.name,
      inductionYear: parsed.data.inductionYear,
      isPlayingMember: parsed.data.isPlayingMember ?? true,
      playerId: parsed.data.playerId ?? null,
      roleLabel: parsed.data.roleLabel ?? null,
      blurb: parsed.data.blurb ?? "",
    })
    .returning();
  res.status(201).json(row);
});

router.patch("/life-members/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateLifeMemberParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateLifeMemberBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [row] = await db
    .update(lifeMembersTable)
    .set(body.data)
    .where(eq(lifeMembersTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Life member not found" });
    return;
  }
  res.json(row);
});

router.delete("/life-members/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteLifeMemberParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .delete(lifeMembersTable)
    .where(eq(lifeMembersTable.id, params.data.id))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Life member not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
