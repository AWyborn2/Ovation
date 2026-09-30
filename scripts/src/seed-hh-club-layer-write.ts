/**
 * seed-hh-club-layer-write.ts — the write half of the Halls Head club layer
 * seed (hybrid stats plan U12). Called by seed-hh-club-layer.ts INSIDE its one
 * transaction, after the plan was re-made against locked rows and matched the
 * preview. Unit-tested with a recording fake transaction
 * (seed-hh-club-layer.test.ts); the real run happens only on Ash's --commit.
 *
 * Writes, in order, only what the plan says changed:
 *   1. the tenant's boundaries (replaced as a set, like the admin route);
 *   2. decision crosswalk rows (a review player mapped to its native id);
 *   3. pinned synthetic players, through the shared minting helper;
 *   4. one history batch with its rows and coverage, through the U11 library.
 * Never writes corrections, drafts, native stats tables or central.
 */
import { eq } from "drizzle-orm";
import {
  clubHistoryBoundariesTable,
  mintPinnedSyntheticPlayers,
  playerIdMapTable,
  type Db,
} from "@workspace/db";
import {
  insertHistoryBatch,
  insertHistoryRows,
} from "../../artifacts/api-server/src/lib/history-import";
import { SEED_LABEL, SEED_SOURCE, type SeedPlan } from "./seed-hh-club-layer-core";

export const SEED_CREATED_BY = "script:seed-hh-club-layer";

export interface SeedWriteResult {
  boundariesReplaced: boolean;
  mapRows: number;
  pinned: number;
  batchId: number | null;
  historyRows: number;
}

/** The note on the seed batch: the review decisions it was committed with. */
export function decisionNote(plan: SeedPlan): string | null {
  const parts = plan.identity.decisionsNeeded.flatMap((d) => {
    if (!d.decision) return [];
    return d.decision.kind === "map"
      ? [`${d.nativePlayerId}=map:${d.decision.participantId}`]
      : [`${d.nativePlayerId}=unmapped${d.decision.note ? ` (${d.decision.note})` : ""}`];
  });
  return parts.length > 0 ? `U4 review decisions: ${parts.join("; ")}` : null;
}

export async function writeSeedPlan(
  tx: Pick<Db, "select" | "insert" | "delete" | "execute">,
  tenantId: number,
  plan: SeedPlan,
): Promise<SeedWriteResult> {
  if (plan.blockers.length > 0) {
    throw new Error(`refusing to write a plan with blockers: ${plan.blockers.join(" | ")}`);
  }
  if (plan.boundaries.changed) {
    await tx
      .delete(clubHistoryBoundariesTable)
      .where(eq(clubHistoryBoundariesTable.tenantId, tenantId));
    await tx.insert(clubHistoryBoundariesTable).values(
      plan.boundaries.desired.map((b) => ({
        tenantId,
        grade: b.grade,
        startSeason: b.startSeason,
        updatedBy: SEED_CREATED_BY,
      })),
    );
  }
  if (plan.identity.decisionMapInserts.length > 0) {
    // Plain insert: a unique clash (tenant+GUID or tenant+id) aborts the transaction.
    await tx.insert(playerIdMapTable).values(
      plan.identity.decisionMapInserts.map((r) => ({
        tenantId,
        participantId: r.participantId,
        playerId: r.playerId,
      })),
    );
  }
  const pinned = await mintPinnedSyntheticPlayers(
    tx,
    tenantId,
    plan.identity.pins.map((p) => ({ playerId: p.playerId, displayName: p.displayName })),
  );
  let batchId: number | null = null;
  let historyRows = 0;
  if (plan.batch.write) {
    batchId = await insertHistoryBatch(tx, {
      tenantId,
      source: SEED_SOURCE,
      label: SEED_LABEL,
      note: decisionNote(plan),
      createdBy: SEED_CREATED_BY,
    });
    historyRows = (await insertHistoryRows(tx, tenantId, batchId, plan.history.rows)).rows;
  }
  return {
    boundariesReplaced: plan.boundaries.changed,
    mapRows: plan.identity.decisionMapInserts.length,
    pinned: pinned.length,
    batchId,
    historyRows,
  };
}
