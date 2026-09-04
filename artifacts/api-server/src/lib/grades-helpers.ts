import { eq, and, desc, sum, lt, gt, isNotNull, sql, type SQL } from "drizzle-orm";
import {
  db,
  playerGradeStatsTable,
  playerGradeSeasonStatsTable,
  playersTable,
  matchesTable,
  clubsTable,
  type recordsDisplaySettingsTable,
} from "@workspace/db";
import { FILL_IN_THRESHOLD } from "@workspace/scorecard";

/**
 * Shared helpers for the grades routes: opponent-club branding, season/date
 * SQL fragments, and the native season/all-time leaderboard queries.
 *
 * Extracted from routes/grades.ts. They only depend on the db layer — never on
 * a route — so importing them back into the router cannot create a cycle.
 */


export const opponentClubColumns = {
  opponentClubId: clubsTable.id,
  opponentClubName: clubsTable.name,
  opponentClubShortName: clubsTable.shortName,
  opponentClubLogoUrl: clubsTable.logoUrl,
  opponentClubLogoUrl128: clubsTable.logoUrl128,
  opponentClubBackgroundColour: clubsTable.backgroundColour,
  opponentClubPrimaryColour: clubsTable.primaryColour,
};

export function toOpponentClub(row: {
  opponentClubId: number | null;
  opponentClubName: string | null;
  opponentClubShortName: string | null;
  opponentClubLogoUrl: string | null;
  opponentClubLogoUrl128: string | null;
  opponentClubBackgroundColour: string | null;
  opponentClubPrimaryColour: string | null;
}) {
  if (row.opponentClubId == null || row.opponentClubName == null) return null;
  return {
    id: row.opponentClubId,
    name: row.opponentClubName,
    shortName: row.opponentClubShortName,
    logoUrl: row.opponentClubLogoUrl,
    logoUrl128: row.opponentClubLogoUrl128,
    backgroundColour: row.opponentClubBackgroundColour,
    primaryColour: row.opponentClubPrimaryColour,
  };
}

export const notEmptyFixture: SQL = sql`NOT (
  (${matchesTable.opponent} IS NULL OR btrim(${matchesTable.opponent}) = '')
  AND COALESCE(${matchesTable.abandoned}, false) = false
  AND (${matchesTable.result} IS NULL OR btrim(${matchesTable.result}) = '')
  AND (${matchesTable.hhccScore} IS NULL OR btrim(${matchesTable.hhccScore}) = '')
  AND (${matchesTable.opponentScore} IS NULL OR btrim(${matchesTable.opponentScore}) = '')
  AND NOT EXISTS (SELECT 1 FROM match_player_lines mpl WHERE mpl.match_id = ${matchesTable.id})
  AND NOT EXISTS (SELECT 1 FROM match_opposition_lines mol WHERE mol.match_id = ${matchesTable.id})
)`;

export const matchDateExpr = sql`CASE WHEN ${matchesTable.matchDate} ~ '^[0-9]{1,2}:[0-9]{2} (AM|PM), [A-Za-z]+, [0-9]{1,2} [A-Za-z]{3} [0-9]{4}$' THEN to_timestamp(${matchesTable.matchDate}, 'HH12:MI AM, Day, DD Mon YYYY') END`;

export function seasonLabel(season: number): string {
  return `${season}/${String((season + 1) % 100).padStart(2, "0")}`;
}

export function toRecentMatch(row: {
  id: number;
  grade: string;
  season: number;
  round: number | null;
  stage: string | null;
  competition: string | null;
  matchDate: string | null;
  venue: string | null;
  result: string | null;
  opponent: string | null;
  clubScore: string | null;
  opponentScore: string | null;
  abandoned: boolean | null;
  playerCount: number;
  opponentClubId: number | null;
  opponentClubName: string | null;
  opponentClubShortName: string | null;
  opponentClubLogoUrl: string | null;
  opponentClubLogoUrl128: string | null;
  opponentClubBackgroundColour: string | null;
  opponentClubPrimaryColour: string | null;
}) {
  return {
    id: row.id,
    grade: row.grade,
    season: row.season,
    round: row.round,
    stage: row.stage,
    competition: row.competition,
    matchDate: row.matchDate,
    venue: row.venue,
    result: row.result,
    opponent: row.opponent,
    clubScore: row.clubScore,
    opponentScore: row.opponentScore,
    abandoned: row.abandoned ?? false,
    playerCount: row.playerCount,
    opponentClub: toOpponentClub(row),
  };
}

export async function seasonLeaders(
  season: number,
  metric: "runs" | "wickets",
  grade?: string,
): Promise<{ playerId: number; givenName: string; surname: string; value: number }[]> {
  const col =
    metric === "runs"
      ? playerGradeSeasonStatsTable.runs
      : playerGradeSeasonStatsTable.wickets;
  const conds: SQL[] = [
    eq(playerGradeSeasonStatsTable.season, season),
    lt(playerGradeSeasonStatsTable.playerId, FILL_IN_THRESHOLD),
  ];
  if (grade) conds.push(eq(playerGradeSeasonStatsTable.grade, grade));

  const rows = await db
    .select({
      playerId: playerGradeSeasonStatsTable.playerId,
      givenName: playersTable.givenName,
      surname: playersTable.surname,
      value: sum(col).mapWith(Number),
    })
    .from(playerGradeSeasonStatsTable)
    .innerJoin(playersTable, eq(playersTable.id, playerGradeSeasonStatsTable.playerId))
    .where(and(...conds))
    .groupBy(playerGradeSeasonStatsTable.playerId, playersTable.givenName, playersTable.surname)
    .having(gt(sum(col), 0))
    .orderBy(desc(sum(col)))
    .limit(5);

  return rows.map((r) => ({
    playerId: r.playerId,
    givenName: r.givenName,
    surname: r.surname,
    value: Number(r.value ?? 0),
  }));
}

export async function allTimeLeaders(
  metric: "runs" | "wickets",
  grade?: string,
): Promise<{ playerId: number; givenName: string; surname: string; value: number }[]> {
  const col =
    metric === "runs" ? playerGradeStatsTable.runs : playerGradeStatsTable.wickets;
  const conds: SQL[] = [lt(playerGradeStatsTable.playerId, FILL_IN_THRESHOLD)];
  if (grade) conds.push(eq(playerGradeStatsTable.grade, grade));

  const rows = await db
    .select({
      playerId: playerGradeStatsTable.playerId,
      givenName: playersTable.givenName,
      surname: playersTable.surname,
      value: sum(col).mapWith(Number),
    })
    .from(playerGradeStatsTable)
    .innerJoin(playersTable, eq(playersTable.id, playerGradeStatsTable.playerId))
    .where(and(...conds))
    .groupBy(playerGradeStatsTable.playerId, playersTable.givenName, playersTable.surname)
    .having(gt(sum(col), 0))
    .orderBy(sql`${sum(col)} desc nulls last`)
    .limit(5);

  return rows.map((r) => ({
    playerId: r.playerId,
    givenName: r.givenName,
    surname: r.surname,
    value: Number(r.value ?? 0),
  }));
}

export async function seasonOptions(): Promise<{ season: number; label: string }[]> {
  const rows = await db
    .selectDistinct({ season: playerGradeSeasonStatsTable.season })
    .from(playerGradeSeasonStatsTable)
    .where(
      and(
        isNotNull(playerGradeSeasonStatsTable.season),
        lt(playerGradeSeasonStatsTable.playerId, FILL_IN_THRESHOLD),
      ),
    )
    .orderBy(desc(playerGradeSeasonStatsTable.season));
  return rows
    .filter((r): r is { season: number } => r.season !== null)
    .map((r) => ({ season: r.season, label: seasonLabel(r.season) }));
}

export async function gradesForSeason(season: number | null): Promise<string[]> {
  const conds: SQL[] = [
    lt(playerGradeSeasonStatsTable.playerId, FILL_IN_THRESHOLD),
    gt(playerGradeSeasonStatsTable.games, 0),
  ];
  if (season !== null) conds.push(eq(playerGradeSeasonStatsTable.season, season));
  const rows = await db
    .selectDistinct({ grade: playerGradeSeasonStatsTable.grade })
    .from(playerGradeSeasonStatsTable)
    .where(and(...conds));
  return rows.map((r) => r.grade).filter((g): g is string => Boolean(g));
}

export function serializeRecordsDisplaySettings(
  row: typeof recordsDisplaySettingsTable.$inferSelect,
) {
  return {
    defaultTab: row.defaultTab as
      | "total"
      | "by-grade"
      | "partnerships"
      | "centuries"
      | "five-for",
    byGradeDefaultGrade: row.byGradeDefaultGrade,
    partnershipsDefaultGrade: row.partnershipsDefaultGrade,
    centuriesSort: row.centuriesSort,
    fiveForSort: row.fiveForSort,
  };
}
