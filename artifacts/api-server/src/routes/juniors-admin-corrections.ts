import { Router, type IRouter } from "express";
import { and, desc, eq, gt } from "drizzle-orm";
import {
  db,
  type juniorMatchesTable,
  juniorParticipantsTable,
  juniorStatCorrectionsTable,
} from "@workspace/db";
import {
  ListJuniorStatCorrectionsQueryParams,
  RevertJuniorStatCorrectionParams,
} from "@workspace/api-zod";
import { requireAdmin, type RequestWithAdmin } from "../middlewares/require-admin";
import { adminWriteRateLimiter } from "../middlewares/rate-limit";
import { getTenantId } from "../middlewares/tenant-context";
import {
  snakeToCamel,
  serializeCorrection,
  SNAKE_TO_TABLE,
} from "../lib/junior-admin-helpers";
import { isCentralTenant } from "../lib/tenant";

/**
 * Juniors admin — the corrections journal: list + revert.
 *
 * `GET /juniors/corrections` reads the audit trail and
 * `DELETE /juniors/corrections/:id` reverts the newest correction on a target
 * from its stored pre-image. See routes/juniors-admin.ts for the write-through
 * + journal model. Mounted there.
 */
const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Corrections journal — list + revert
// ---------------------------------------------------------------------------

router.get(
  "/juniors/corrections",
  requireAdmin,
  async (req: RequestWithAdmin, res): Promise<void> => {
    const query = ListJuniorStatCorrectionsQueryParams.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: query.error.message });
      return;
    }
    if (await isCentralTenant(req)) {
      res.json([]);
      return;
    }
    const conds = [
      eq(juniorStatCorrectionsTable.tenantId, getTenantId(req)),
    ];
    if (query.data.matchId !== undefined) {
      conds.push(eq(juniorStatCorrectionsTable.matchId, query.data.matchId));
    }
    const rows = await db
      .select()
      .from(juniorStatCorrectionsTable)
      .where(and(...conds))
      .orderBy(desc(juniorStatCorrectionsTable.id));
    res.json(rows.map(serializeCorrection));
  },
);

router.delete(
  "/juniors/corrections/:id",
  requireAdmin,
  adminWriteRateLimiter,
  async (req: RequestWithAdmin, res): Promise<void> => {
    const params = RevertJuniorStatCorrectionParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (await isCentralTenant(req)) {
      res.status(404).json({ error: "Correction not found" });
      return;
    }
    const tenantId = getTenantId(req);
    const [correction] = await db
      .select()
      .from(juniorStatCorrectionsTable)
      .where(
        and(
          eq(juniorStatCorrectionsTable.id, params.data.id),
          eq(juniorStatCorrectionsTable.tenantId, tenantId),
        ),
      );
    if (!correction) {
      res.status(404).json({ error: "Correction not found" });
      return;
    }

    // Reverts must run newest-first per target row: restoring an older
    // pre-image over a newer correction would silently wipe the newer edit.
    const [newer] = await db
      .select({ id: juniorStatCorrectionsTable.id })
      .from(juniorStatCorrectionsTable)
      .where(
        and(
          eq(juniorStatCorrectionsTable.tenantId, tenantId),
          eq(juniorStatCorrectionsTable.targetTable, correction.targetTable),
          eq(juniorStatCorrectionsTable.targetId, correction.targetId),
          gt(juniorStatCorrectionsTable.id, correction.id),
        ),
      );
    if (newer) {
      res.status(409).json({
        error:
          "A newer correction targets the same row — revert that one first",
      });
      return;
    }

    const table =
      SNAKE_TO_TABLE[correction.targetTable as keyof typeof SNAKE_TO_TABLE];
    if (!table) {
      res.status(500).json({ error: "Unknown correction target" });
      return;
    }

    await db.transaction(async (tx) => {
      if (correction.op === "update") {
        const prev = (correction.prevValues ?? {}) as Record<string, unknown>;
        const set: Record<string, unknown> = {};
        for (const [snake, value] of Object.entries(prev)) {
          set[snakeToCamel(snake)] = value;
        }
        if (Object.keys(set).length > 0) {
          if (correction.targetTable === "junior_participants") {
            await tx
              .update(juniorParticipantsTable)
              .set(set)
              .where(
                eq(
                  juniorParticipantsTable.participantId,
                  correction.targetId,
                ),
              );
          } else {
            await tx
              .update(table)
              .set(set)
              .where(
                eq(
                  (table as typeof juniorMatchesTable).id,
                  Number(correction.targetId),
                ),
              );
          }
        }
      } else if (correction.op === "insert") {
        // Undo a created row by deleting it.
        if (correction.targetTable !== "junior_participants") {
          await tx
            .delete(table)
            .where(
              eq(
                (table as typeof juniorMatchesTable).id,
                Number(correction.targetId),
              ),
            );
        }
      } else if (correction.op === "delete") {
        // Undo a deletion by re-inserting the full pre-image.
        const prev = (correction.prevValues ?? {}) as Record<string, unknown>;
        const values: Record<string, unknown> = {};
        for (const [snake, value] of Object.entries(prev)) {
          values[snakeToCamel(snake)] = value;
        }
        if (Object.keys(values).length > 0) {
          await tx
            .insert(table)
            .values(values as never)
            .onConflictDoNothing();
        }
      }
      await tx
        .delete(juniorStatCorrectionsTable)
        .where(eq(juniorStatCorrectionsTable.id, correction.id));
    });

    res.status(204).end();
  },
);

export default router;
