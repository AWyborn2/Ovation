import type { Request } from "express";
import { desc, eq } from "drizzle-orm";
import { db, playerGradeStatsTable, playerIdMapTable, type PlayerGradeStat } from "@workspace/db";
import { dataSource, type DataSource } from "./tenant";
import { resolveCuration } from "./central-curation";

/**
 * The per-grade career leaderboard (every player's aggregate for one grade),
 * from the correct data source for a tenant. Served by
 * `GET /grades/:grade/leaderboard` and consumed in bulk by the carousel-set
 * generator (routes/social-cards). On the central path the crosswalk maps
 * PlayHQ GUIDs to the app's int player ids and curation supplies name
 * overrides.
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
    const [mapRows, curation] = await Promise.all([
      db
        .select({
          participantId: playerIdMapTable.participantId,
          playerId: playerIdMapTable.playerId,
        })
        .from(playerIdMapTable)
        .where(eq(playerIdMapTable.tenantId, tenantId)),
      resolveCuration(tenantId),
    ]);
    const intByGuid = new Map(mapRows.map((m) => [m.participantId, m.playerId]));
    return centralGradeLeaderboard(grade, {
      clubId,
      intByGuid,
      nameByGuid: curation.nameByGuid,
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
