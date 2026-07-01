import { Router, type IRouter } from "express";
import { and, eq, desc } from "drizzle-orm";
import { z } from "zod";
import { db, playerCurationTable } from "@workspace/db";
import { requireAdmin } from "../middlewares/require-admin";
import { getTenantId } from "../middlewares/tenant-context";

/**
 * Per-tenant central-player curation (rename + merge). Admin-only and always
 * scoped to the requesting tenant — a club can only curate its own view of
 * central players, and nothing here ever writes to the central database.
 *
 * Validation is inline (zod) rather than generated so the route is self-
 * contained; the OpenAPI spec mirrors it for the client hooks (run codegen).
 */
const router: IRouter = Router();

const CurationBody = z.object({
  overrideDisplayName: z.string().trim().min(1).max(120).nullable().optional(),
  mergedIntoParticipantId: z.string().trim().min(1).nullable().optional(),
});

function paramStr(v: string | string[] | undefined): string {
  return Array.isArray(v) ? v[0] : (v ?? "");
}

// List this tenant's curation rows.
router.get("/player-curation", requireAdmin, async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  const rows = await db
    .select()
    .from(playerCurationTable)
    .where(eq(playerCurationTable.tenantId, tenantId))
    .orderBy(desc(playerCurationTable.updatedAt));
  res.json(rows);
});

// Upsert curation (rename and/or merge) for one central participant.
router.put(
  "/player-curation/:participantId",
  requireAdmin,
  async (req, res): Promise<void> => {
    const tenantId = getTenantId(req);
    const participantId = paramStr(req.params.participantId);
    if (!participantId) {
      res.status(400).json({ error: "participantId is required" });
      return;
    }
    const parsed = CurationBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
      return;
    }
    if (parsed.data.mergedIntoParticipantId === participantId) {
      res.status(400).json({ error: "A player cannot be merged into itself." });
      return;
    }
    const values = {
      tenantId,
      participantId,
      overrideDisplayName: parsed.data.overrideDisplayName ?? null,
      mergedIntoParticipantId: parsed.data.mergedIntoParticipantId ?? null,
      updatedAt: new Date(),
    };
    const [row] = await db
      .insert(playerCurationTable)
      .values(values)
      .onConflictDoUpdate({
        target: [playerCurationTable.tenantId, playerCurationTable.participantId],
        set: {
          overrideDisplayName: values.overrideDisplayName,
          mergedIntoParticipantId: values.mergedIntoParticipantId,
          updatedAt: values.updatedAt,
        },
      })
      .returning();
    res.json(row);
  },
);

// Clear curation for one participant (revert to central defaults).
router.delete(
  "/player-curation/:participantId",
  requireAdmin,
  async (req, res): Promise<void> => {
    const tenantId = getTenantId(req);
    const participantId = paramStr(req.params.participantId);
    await db
      .delete(playerCurationTable)
      .where(
        and(
          eq(playerCurationTable.tenantId, tenantId),
          eq(playerCurationTable.participantId, participantId),
        ),
      );
    res.status(204).end();
  },
);

export default router;
