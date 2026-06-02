import { eq, sql } from "drizzle-orm";
import { capRegisterTable, playerGradeStatsTable } from "@workspace/db";
import { GRADE_TO_CAP_CATEGORY, type CapSyncTx } from "./cap-sync";

/**
 * Reconcile A Grade / Female A Grade cap lists AFTER stats were rolled back
 * (CSV import delete or season undo). MUST run inside the rollback transaction,
 * AFTER `recomputeAggregates`, so per-grade games reflect the post-rollback state.
 *
 * For each cap-bearing grade:
 *  - Players still in the grade's stats: refresh `inStats` + `gamesAGrade`.
 *  - Players no longer in the stats:
 *      • auto-created caps are deleted (the import that issued them was undone);
 *      • manually-entered caps are kept but flagged `inStats = false`, games 0.
 */
export async function reverseCapsAfterRollback(
  tx: CapSyncTx,
  grades: string[],
): Promise<void> {
  for (const grade of grades) {
    const category = GRADE_TO_CAP_CATEGORY[grade];
    if (!category) continue;

    const statRows = await tx
      .select({
        playerId: playerGradeStatsTable.playerId,
        games: playerGradeStatsTable.games,
      })
      .from(playerGradeStatsTable)
      .where(eq(playerGradeStatsTable.grade, grade));
    const gamesByPlayer = new Map<number, number>();
    for (const r of statRows) gamesByPlayer.set(r.playerId, r.games ?? 0);

    const caps = await tx
      .select()
      .from(capRegisterTable)
      .where(eq(capRegisterTable.category, category));

    for (const cap of caps) {
      if (cap.playerId == null) continue;
      const games = gamesByPlayer.get(cap.playerId) ?? 0;
      if (games > 0) {
        await tx
          .update(capRegisterTable)
          .set({ inStats: true, gamesAGrade: games })
          .where(eq(capRegisterTable.id, cap.id));
      } else if (cap.autoCreated) {
        await tx.delete(capRegisterTable).where(eq(capRegisterTable.id, cap.id));
      } else {
        await tx
          .update(capRegisterTable)
          .set({ inStats: false, gamesAGrade: 0 })
          .where(eq(capRegisterTable.id, cap.id));
      }
    }
  }
}

/**
 * Delete players who, after a rollback, no longer have ANY data referencing
 * them: no season/grade stats, no match lines, no premiership/cap/life-member/
 * honour-board links. MUST run inside the rollback transaction, AFTER the stat
 * rows + match lines have been removed.
 *
 * @param candidateIds players touched by the rolled-back import; only these are
 *        considered, so untouched players are never examined.
 * @returns number of orphan players deleted.
 */
export async function cleanupOrphanPlayers(
  tx: CapSyncTx,
  candidateIds: number[],
): Promise<number> {
  if (candidateIds.length === 0) return 0;
  const ids = sql`(${sql.join(
    candidateIds.map((id) => sql`${id}`),
    sql`, `,
  )})`;
  const result = await tx.execute(sql`
    DELETE FROM players p
    WHERE p.id IN ${ids}
      AND NOT EXISTS (SELECT 1 FROM player_grade_season_stats s WHERE s.player_id = p.id)
      AND NOT EXISTS (SELECT 1 FROM player_grade_stats s WHERE s.player_id = p.id)
      AND NOT EXISTS (SELECT 1 FROM match_player_lines m WHERE m.player_id = p.id)
      AND NOT EXISTS (SELECT 1 FROM premiership_players pp WHERE pp.player_id = p.id)
      AND NOT EXISTS (SELECT 1 FROM cap_register c WHERE c.player_id = p.id)
      AND NOT EXISTS (SELECT 1 FROM life_members l WHERE l.player_id = p.id)
      AND NOT EXISTS (SELECT 1 FROM honour_board_overrides h WHERE h.player_id = p.id)
  `);
  const rowCount = (result as { rowCount?: number } | null)?.rowCount;
  return typeof rowCount === "number" ? rowCount : 0;
}
