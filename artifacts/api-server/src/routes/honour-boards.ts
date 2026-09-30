import { Router, type IRouter } from "express";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db, honourBoardsTable, honourBoardOverridesTable } from "@workspace/db";
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
import { requireEntitlement } from "../middlewares/require-entitlement";
import { getTenantId } from "../middlewares/tenant-context";
import { assertPlayerInTenantSpace } from "../lib/curated-player-space";

const router: IRouter = Router();

router.get("/honour-boards", async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(honourBoardsTable)
    .where(
      and(eq(honourBoardsTable.tenantId, getTenantId(req)), isNull(honourBoardsTable.deletedAt)),
    )
    .orderBy(asc(honourBoardsTable.displayOrder), asc(honourBoardsTable.id));
  res.json(rows);
});

router.post(
  "/honour-boards",
  requireAdmin,
  requireEntitlement("curation"),
  async (req, res): Promise<void> => {
    const parsed = CreateHonourBoardBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [row] = await db
      .insert(honourBoardsTable)
      .values({
        tenantId: getTenantId(req),
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
  },
);

router.patch(
  "/honour-boards/:key",
  requireAdmin,
  requireEntitlement("curation"),
  async (req, res): Promise<void> => {
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
      .where(
        and(
          eq(honourBoardsTable.tenantId, getTenantId(req)),
          eq(honourBoardsTable.key, params.data.key),
        ),
      )
      .returning();
    if (!row) {
      res.status(404).json({ error: "Honour board not found" });
      return;
    }
    res.json(row);
  },
);

router.delete(
  "/honour-boards/:key",
  requireAdmin,
  requireEntitlement("curation"),
  async (req, res): Promise<void> => {
    const params = DeleteHonourBoardParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [row] = await db
      .update(honourBoardsTable)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(honourBoardsTable.tenantId, getTenantId(req)),
          eq(honourBoardsTable.key, params.data.key),
        ),
      )
      .returning();
    if (!row) {
      res.status(404).json({ error: "Honour board not found" });
      return;
    }
    res.sendStatus(204);
  },
);

router.get("/honour-boards/:key/overrides", async (req, res): Promise<void> => {
  const params = ListHonourBoardOverridesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const rows = await db
    .select()
    .from(honourBoardOverridesTable)
    .where(
      and(
        eq(honourBoardOverridesTable.tenantId, getTenantId(req)),
        eq(honourBoardOverridesTable.boardKey, params.data.key),
      ),
    );
  res.json(rows);
});

router.post(
  "/honour-boards/:key/overrides",
  requireAdmin,
  requireEntitlement("curation"),
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
    await assertPlayerInTenantSpace(getTenantId(req), body.data.playerId);
    const values = {
      tenantId: getTenantId(req),
      boardKey: params.data.key,
      playerId: body.data.playerId,
      pinned: body.data.pinned ?? false,
      hidden: body.data.hidden ?? false,
      note: body.data.note ?? "",
    };
    // One override per (tenant, board, player): another club's override for
    // the same board key and player id is a different row (U8, R17). Written as
    // update-else-insert rather than ON CONFLICT (cols) so it works against
    // both the old global (board_key, player_id) index and migration 0020's
    // per-tenant one — the code can deploy before the migration is applied.
    const own = and(
      eq(honourBoardOverridesTable.tenantId, values.tenantId),
      eq(honourBoardOverridesTable.boardKey, values.boardKey),
      eq(honourBoardOverridesTable.playerId, values.playerId),
    );
    const update = () =>
      db
        .update(honourBoardOverridesTable)
        .set({ pinned: values.pinned, hidden: values.hidden, note: values.note })
        .where(own)
        .returning();
    let [row] = await update();
    if (!row) {
      [row] = await db
        .insert(honourBoardOverridesTable)
        .values(values)
        .onConflictDoNothing()
        .returning();
      // Lost a race with a concurrent insert of the same override: update it.
      if (!row) [row] = await update();
    }
    if (!row) {
      // Only reachable before migration 0020: the old global index holds
      // another club's override for this board key and player id.
      res.status(409).json({ error: "Override could not be saved; try again" });
      return;
    }
    res.json(row);
  },
);

router.delete(
  "/honour-boards/:key/overrides/:playerId",
  requireAdmin,
  requireEntitlement("curation"),
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
          eq(honourBoardOverridesTable.tenantId, getTenantId(req)),
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
