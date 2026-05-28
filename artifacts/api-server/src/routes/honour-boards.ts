import { Router, type IRouter } from "express";
import { and, asc, eq, isNull } from "drizzle-orm";
import {
  db,
  honourBoardsTable,
  honourBoardOverridesTable,
} from "@workspace/db";
import {
  CreateHonourBoardBody,
  UpdateHonourBoardBody,
  UpdateHonourBoardParams,
  DeleteHonourBoardParams,
  UpsertHonourBoardOverrideBody,
  UpsertHonourBoardOverrideParams,
  ListHonourBoardOverridesParams,
  DeleteHonourBoardOverrideParams,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/require-admin";

const router: IRouter = Router();

router.get("/honour-boards", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(honourBoardsTable)
    .where(isNull(honourBoardsTable.deletedAt))
    .orderBy(asc(honourBoardsTable.displayOrder), asc(honourBoardsTable.id));
  res.json(rows);
});

router.post("/honour-boards", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CreateHonourBoardBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .insert(honourBoardsTable)
    .values({
      key: parsed.data.key,
      label: parsed.data.label,
      title: parsed.data.title,
      subtitle: parsed.data.subtitle ?? "",
      headlineLabel: parsed.data.headlineLabel ?? "",
      supportingLabel: parsed.data.supportingLabel ?? "",
      displayOrder: parsed.data.displayOrder ?? 0,
    })
    .returning();
  res.status(201).json(row);
});

router.patch("/honour-boards/:key", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateHonourBoardParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateHonourBoardBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const [row] = await db
    .update(honourBoardsTable)
    .set(body.data)
    .where(eq(honourBoardsTable.key, params.data.key))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Honour board not found" });
    return;
  }
  res.json(row);
});

router.delete("/honour-boards/:key", requireAdmin, async (req, res): Promise<void> => {
  const params = DeleteHonourBoardParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .update(honourBoardsTable)
    .set({ deletedAt: new Date() })
    .where(eq(honourBoardsTable.key, params.data.key))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Honour board not found" });
    return;
  }
  res.sendStatus(204);
});

router.get("/honour-boards/:key/overrides", async (req, res): Promise<void> => {
  const params = ListHonourBoardOverridesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const rows = await db
    .select()
    .from(honourBoardOverridesTable)
    .where(eq(honourBoardOverridesTable.boardKey, params.data.key));
  res.json(rows);
});

router.post(
  "/honour-boards/:key/overrides",
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = UpsertHonourBoardOverrideParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = UpsertHonourBoardOverrideBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const values = {
      boardKey: params.data.key,
      playerId: body.data.playerId,
      pinned: body.data.pinned ?? false,
      hidden: body.data.hidden ?? false,
      note: body.data.note ?? "",
    };
    const [row] = await db
      .insert(honourBoardOverridesTable)
      .values(values)
      .onConflictDoUpdate({
        target: [
          honourBoardOverridesTable.boardKey,
          honourBoardOverridesTable.playerId,
        ],
        set: {
          pinned: values.pinned,
          hidden: values.hidden,
          note: values.note,
        },
      })
      .returning();
    res.json(row);
  },
);

router.delete(
  "/honour-boards/:key/overrides/:playerId",
  requireAdmin,
  async (req, res): Promise<void> => {
    const params = DeleteHonourBoardOverrideParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [row] = await db
      .delete(honourBoardOverridesTable)
      .where(
        and(
          eq(honourBoardOverridesTable.boardKey, params.data.key),
          eq(honourBoardOverridesTable.playerId, params.data.playerId),
        ),
      )
      .returning();
    if (!row) {
      res.status(404).json({ error: "Override not found" });
      return;
    }
    res.sendStatus(204);
  },
);

export default router;
