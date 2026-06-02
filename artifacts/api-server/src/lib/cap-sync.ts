import { eq, inArray } from "drizzle-orm";
import {
  db,
  capRegisterTable,
  playerGradeStatsTable,
  playersTable,
} from "@workspace/db";

/** The transaction handle passed to a `db.transaction` callback. */
export type CapSyncTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Maps a recomputed grade name to its A Grade cap-register category.
 * Only A Grade (male) and Female A Grade (female) have cap lists; all other
 * grades are intentionally absent and are ignored by the sync routine.
 */
export const GRADE_TO_CAP_CATEGORY: Record<string, "male" | "female"> = {
  "A Grade": "male",
  "Female A Grade": "female",
};

/**
 * Player ids that already hold a cap in the given category. Used by the import
 * preview to flag debuts: a player appearing in a cap-eligible grade who is NOT
 * in this set will be issued their first cap on commit. Mirrors the
 * `playerId`-based rule `syncCapsFromStats` uses to decide who needs a new cap.
 */
export async function getCappedPlayerIds(
  category: "male" | "female",
): Promise<Set<number>> {
  const rows = await db
    .select({ playerId: capRegisterTable.playerId })
    .from(capRegisterTable)
    .where(eq(capRegisterTable.category, category));
  const ids = new Set<number>();
  for (const r of rows) if (r.playerId != null) ids.add(r.playerId);
  return ids;
}

export type CapSyncResult = {
  grade: string;
  category: "male" | "female";
  updated: number;
  created: number;
  /** Caps freshly issued by this sync run (for per-match new-cap milestones). */
  createdCaps: { capNumber: number; playerId: number; name: string }[];
};

/**
 * Refresh and extend an A Grade cap list from freshly-recomputed stats.
 *
 * MUST run inside the import's DB transaction, AFTER `recomputeAggregates`, so
 * `gamesAGrade` reflects the new per-grade totals and readers never observe a
 * half-applied state.
 *
 * Behaviour for the grade's cap category:
 *  - Existing caps linked to a player present in the recomputed stats get their
 *    `inStats` flipped on and `gamesAGrade` refreshed from the per-grade total.
 *  - Players in the stats who are not yet capped (matched by linked `playerId`)
 *    are issued new caps with the next available cap numbers in sequence.
 *
 * Idempotent: re-importing the same grade+season matches existing caps on
 * `playerId` first, so no duplicate caps are created and numbers are not bumped.
 *
 * @param orderedPlayerIds player ids for this grade in the order new caps should
 *        be numbered (batting order, falling back to CSV row order). Players not
 *        in this list but present in the stats are still updated/created using
 *        the stats ordering as a fallback.
 */
export async function syncCapsFromStats(
  tx: CapSyncTx,
  grade: string,
  orderedPlayerIds: number[],
): Promise<CapSyncResult | null> {
  const category = GRADE_TO_CAP_CATEGORY[grade];
  if (!category) return null;

  // Per-grade recomputed totals (games) keyed by player.
  const statRows = await tx
    .select({
      playerId: playerGradeStatsTable.playerId,
      games: playerGradeStatsTable.games,
    })
    .from(playerGradeStatsTable)
    .where(eq(playerGradeStatsTable.grade, grade));

  const gamesByPlayer = new Map<number, number>();
  for (const r of statRows) {
    gamesByPlayer.set(r.playerId, r.games ?? 0);
  }
  if (gamesByPlayer.size === 0) {
    return { grade, category, updated: 0, created: 0, createdCaps: [] };
  }

  // Existing caps in this category.
  const existingCaps = await tx
    .select()
    .from(capRegisterTable)
    .where(eq(capRegisterTable.category, category));

  const capByPlayer = new Map<number, (typeof existingCaps)[number]>();
  let maxCapNumber = 0;
  for (const c of existingCaps) {
    if (c.capNumber > maxCapNumber) maxCapNumber = c.capNumber;
    if (c.playerId != null) capByPlayer.set(c.playerId, c);
  }

  let updated = 0;
  let created = 0;
  const createdCaps: { capNumber: number; playerId: number; name: string }[] = [];

  // Build the deterministic ordering of players in the stats: caller-provided
  // order first (batting / CSV row order), then any stats-only players by id.
  const orderedUnique: number[] = [];
  const seen = new Set<number>();
  for (const id of orderedPlayerIds) {
    if (gamesByPlayer.has(id) && !seen.has(id)) {
      seen.add(id);
      orderedUnique.push(id);
    }
  }
  for (const id of [...gamesByPlayer.keys()].sort((a, b) => a - b)) {
    if (!seen.has(id)) {
      seen.add(id);
      orderedUnique.push(id);
    }
  }

  // Names for players that need a brand-new cap entry.
  const newPlayerIds = orderedUnique.filter((id) => !capByPlayer.has(id));
  const nameByPlayer = new Map<number, string>();
  if (newPlayerIds.length > 0) {
    const playerRows = await tx
      .select({
        id: playersTable.id,
        surname: playersTable.surname,
        givenName: playersTable.givenName,
      })
      .from(playersTable)
      .where(inArray(playersTable.id, newPlayerIds));
    for (const p of playerRows) {
      nameByPlayer.set(
        p.id,
        `${p.givenName ?? ""} ${p.surname ?? ""}`.trim() || `Player #${p.id}`,
      );
    }
  }

  let nextCapNumber = maxCapNumber + 1;
  for (const playerId of orderedUnique) {
    const games = gamesByPlayer.get(playerId) ?? 0;
    const existing = capByPlayer.get(playerId);
    if (existing) {
      await tx
        .update(capRegisterTable)
        .set({ inStats: true, gamesAGrade: games })
        .where(eq(capRegisterTable.id, existing.id));
      updated++;
    } else {
      const name = nameByPlayer.get(playerId) ?? `Player #${playerId}`;
      await tx.insert(capRegisterTable).values({
        capNumber: nextCapNumber,
        category,
        name,
        inStats: true,
        gamesAGrade: games,
        autoCreated: true,
        playerId,
      });
      createdCaps.push({ capNumber: nextCapNumber, playerId, name });
      nextCapNumber++;
      created++;
    }
  }

  return { grade, category, updated, created, createdCaps };
}
