import { Router, type IRouter } from "express";
import { and, eq, desc } from "drizzle-orm";
import { UpsertPlayerCurationBody } from "@workspace/api-zod";
import { db, playerCurationTable } from "@workspace/db";
import { requireAdmin } from "../middlewares/require-admin";
import { getTenantId } from "../middlewares/tenant-context";

/**
 * Per-tenant central-player curation (rename + merge). Admin-only and always
 * scoped to the requesting tenant — a club can only curate its own view of
 * central players, and nothing here ever writes to the central database.
 *
 * Bodies are validated with the schema generated from openapi.yaml
 * (PlayerCurationBody), so the contract, the client hooks and this route agree.
 */
const router: IRouter = Router();

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
    const parsed = UpsertPlayerCurationBody.safeParse(req.body);
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
