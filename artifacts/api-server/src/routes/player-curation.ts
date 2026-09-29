import { Router, type IRouter } from "express";
import { and, eq, desc, isNotNull, ne } from "drizzle-orm";
import { UpsertPlayerCurationBody } from "@workspace/api-zod";
import { db, playerCurationTable, type MergeStatus } from "@workspace/db";
import { requireAdmin } from "../middlewares/require-admin";
import { getTenantId } from "../middlewares/tenant-context";
import { findMergeProblem, MAX_MERGE_CHAIN } from "../lib/central-curation";
import { invalidateMilestonesCache } from "../lib/milestones-cache";
import { getTenantCentralClubId, TenantNotFoundError } from "../lib/tenant";

/**
 * Per-tenant central-player curation (rename + merge). Admin-only and always
 * scoped to the requesting tenant — a club can only curate its own view of
 * central players, and nothing here ever writes to the central database.
 *
 * Bodies are validated with the schema generated from openapi.yaml
 * (PlayerCurationBody), so the contract, the client hooks and this route agree.
 *
 * Merges are validated before they are stored (KTD2), because a confirmed
 * merge folds two careers on every central read:
 *   - both GUIDs must have played for THIS tenant's central club (a club can
 *     never pull another club's player into its records);
 *   - neither may be private (a merge must never expose or hide a private
 *     player's stats under a public name) — rejected pairs are exempt, since
 *     they never fold;
 *   - no cycle (A -> B -> A) and no chain deeper than MAX_MERGE_CHAIN.
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

/**
 * Why a merge of `participantId` into `keeperId` can't be stored for this
 * tenant, or null when it can.
 */
async function mergeRefusal(
  tenantId: number,
  participantId: string,
  keeperId: string,
  status: MergeStatus,
): Promise<string | null> {
  let centralClubId: number;
  try {
    centralClubId = await getTenantCentralClubId(tenantId);
  } catch (err) {
    if (err instanceof TenantNotFoundError) {
      return "This club has no central player data to merge.";
    }
    throw err;
  }

  const { centralClubParticipants } = await import("@workspace/db/central-queries");
  const club = new Map(
    (await centralClubParticipants(centralClubId)).map((p) => [p.participantId, p]),
  );
  const from = club.get(participantId);
  const to = club.get(keeperId);
  if (!from || !to) return "Both players must have played for this club.";
  if (status !== "rejected" && (from.isPrivate || to.isPrivate)) {
    return "A private player can't be merged.";
  }
  if (status === "rejected") return null; // never folds, so can't loop

  // The tenant's other live links (a rejected pair is not a link).
  const links = await db
    .select({
      participantId: playerCurationTable.participantId,
      mergedIntoParticipantId: playerCurationTable.mergedIntoParticipantId,
    })
    .from(playerCurationTable)
    .where(
      and(
        eq(playerCurationTable.tenantId, tenantId),
        isNotNull(playerCurationTable.mergedIntoParticipantId),
        ne(playerCurationTable.mergeStatus, "rejected"),
        ne(playerCurationTable.participantId, participantId),
      ),
    );
  const edges = new Map(links.map((l) => [l.participantId, l.mergedIntoParticipantId as string]));
  const problem = findMergeProblem(edges, participantId, keeperId);
  if (problem === "cycle") return "That merge would loop back on itself.";
  if (problem === "too-deep") {
    return `That merge would make a chain longer than ${MAX_MERGE_CHAIN} players.`;
  }
  return null;
}

// Upsert curation (rename and/or merge) for one central participant.
router.put("/player-curation/:participantId", requireAdmin, async (req, res): Promise<void> => {
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
  const keeperId = parsed.data.mergedIntoParticipantId ?? null;
  if (keeperId === participantId) {
    res.status(400).json({ error: "A player cannot be merged into itself." });
    return;
  }
  // A merge an admin makes here is confirmed unless they say otherwise; the
  // duplicate-suggestion engine (U7) writes "suggested".
  const mergeStatus: MergeStatus | null = keeperId
    ? (parsed.data.mergeStatus ?? "confirmed")
    : null;
  if (keeperId && mergeStatus) {
    const refusal = await mergeRefusal(tenantId, participantId, keeperId, mergeStatus);
    if (refusal) {
      res.status(400).json({ error: refusal });
      return;
    }
  }

  const values = {
    tenantId,
    participantId,
    overrideDisplayName: parsed.data.overrideDisplayName ?? null,
    mergedIntoParticipantId: keeperId,
    mergeStatus,
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
        mergeStatus: values.mergeStatus,
        updatedAt: values.updatedAt,
      },
    })
    .returning();
  // The milestone board caches whole builds; a merge changes careers on it.
  invalidateMilestonesCache(tenantId);
  res.json(row);
});

// Clear curation for one participant (revert to central defaults).
router.delete("/player-curation/:participantId", requireAdmin, async (req, res): Promise<void> => {
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
  invalidateMilestonesCache(tenantId);
  res.status(204).end();
});

export default router;
