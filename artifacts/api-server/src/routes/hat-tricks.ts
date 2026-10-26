import { Router, type IRouter } from "express";
import { and, asc, desc, eq } from "drizzle-orm";
import { db, hatTricksTable } from "@workspace/db";
import {
  CreateHatTrickBody,
  UpdateHatTrickBody,
  UpdateHatTrickParams,
  DeleteHatTrickParams,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/require-admin";
import { requireEntitlement } from "../middlewares/require-entitlement";
import { getTenantId } from "../middlewares/tenant-context";
import { assertPlayerInTenantSpace } from "../lib/curated-player-space";

/**
 * Hat-tricks (honours kiosk redesign C2): a curated, tenant-scoped honour list.
 * Scorecards don't record the order wickets fell in, so an admin enters them;
 * the honours display shows them as an achievement list.
 */
const router: IRouter = Router();

/** Trimmed text, or null when blank. */
const clean = (v: string | null | undefined) => (v == null ? v : v.trim() || null);

router.get("/hat-tricks", async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(hatTricksTable)
    .where(eq(hatTricksTable.tenantId, getTenantId(req)))
    .orderBy(desc(hatTricksTable.season), asc(hatTricksTable.bowler), asc(hatTricksTable.id));
  res.json(rows.map(({ tenantId: _tenantId, ...r }) => r));
});

router.post(
  "/hat-tricks",
  requireAdmin,
  requireEntitlement("curation"),
  async (req, res): Promise<void> => {
    const parsed = CreateHatTrickBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const tenantId = getTenantId(req);
    await assertPlayerInTenantSpace(tenantId, parsed.data.playerId);
    const [row] = await db
      .insert(hatTricksTable)
      .values({
        tenantId,
        playerId: parsed.data.playerId ?? null,
        bowler: parsed.data.bowler.trim(),
        grade: parsed.data.grade.trim(),
        season: clean(parsed.data.season) ?? null,
        figures: clean(parsed.data.figures) ?? null,
        opponent: clean(parsed.data.opponent) ?? null,
      })
      .returning();
    const { tenantId: _tenantId, ...out } = row!;
    res.status(201).json(out);
  },
);

router.patch(
  "/hat-tricks/:id",
  requireAdmin,
  requireEntitlement("curation"),
  async (req, res): Promise<void> => {
    const params = UpdateHatTrickParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const body = UpdateHatTrickBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const tenantId = getTenantId(req);
    await assertPlayerInTenantSpace(tenantId, body.data.playerId);
    const patch = {
      ...body.data,
      ...(body.data.bowler !== undefined && { bowler: body.data.bowler.trim() }),
      ...(body.data.grade !== undefined && { grade: body.data.grade.trim() }),
      ...(body.data.season !== undefined && { season: clean(body.data.season) }),
      ...(body.data.figures !== undefined && { figures: clean(body.data.figures) }),
      ...(body.data.opponent !== undefined && { opponent: clean(body.data.opponent) }),
    };
    const [row] = await db
      .update(hatTricksTable)
      .set(patch)
      .where(and(eq(hatTricksTable.id, params.data.id), eq(hatTricksTable.tenantId, tenantId)))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Hat-trick not found" });
      return;
    }
    const { tenantId: _tenantId, ...out } = row;
    res.json(out);
  },
);

router.delete(
  "/hat-tricks/:id",
  requireAdmin,
  requireEntitlement("curation"),
  async (req, res): Promise<void> => {
    const params = DeleteHatTrickParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [row] = await db
      .delete(hatTricksTable)
      .where(
        and(eq(hatTricksTable.id, params.data.id), eq(hatTricksTable.tenantId, getTenantId(req))),
      )
      .returning();
    if (!row) {
      res.status(404).json({ error: "Hat-trick not found" });
      return;
    }
    res.sendStatus(204);
  },
);

export default router;
