import type { Request } from "express";
import { desc, eq } from "drizzle-orm";
import { db, playerGradeStatsTable, type PlayerGradeStat } from "@workspace/db";
import { dataSource, type DataSource } from "./tenant";
import { loadClubIdentity } from "./club-overlay";

/**
 * The per-grade career leaderboard (every player's aggregate for one grade),
 * from the correct data source for a tenant. Served by
 * `GET /grades/:grade/leaderboard` and consumed in bulk by the carousel-set
 * generator (routes/social-cards). On the central path the club overlay maps
 * PlayHQ GUIDs to the app's int player ids, folds confirmed merges into one
 * row per player and supplies curated name overrides.
 *
 * Extracted from routes/grades.ts so routes never import routes.
 */
export async function loadGradeLeaderboardForSource(
  source: DataSource,
  grade: string,
): Promise<PlayerGradeStat[]> {
  if (source.kind === "central") {
    const { centralGradeLeaderboard } = await import("@workspace/db/central-queries");
    const { tenantId, clubId } = source;
    const identity = await loadClubIdentity(tenantId);
    return centralGradeLeaderboard(grade, {
      clubId,
      intByGuid: identity.intByGuid,
      nameByGuid: identity.nameByGuid,
      merges: identity.merges,
    });
  }

  return db
    .select()
    .from(playerGradeStatsTable)
    .where(eq(playerGradeStatsTable.grade, grade))
    .orderBy(desc(playerGradeStatsTable.games));
}

/** Request-flavoured wrapper: resolves the tenant's data source first. */
export async function loadGradeLeaderboard(
  req: Request,
  grade: string,
): Promise<PlayerGradeStat[]> {
  return loadGradeLeaderboardForSource(await dataSource(req), grade);
}
