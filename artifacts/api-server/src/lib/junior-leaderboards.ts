import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import {
  db,
  juniorMatchBattingTable,
  juniorMatchBowlingTable,
  juniorMatchRostersTable,
  juniorParticipantsTable,
  juniorMatchesTable,
} from "@workspace/db";
import { BALLS_PER_OVER } from "./junior-cricket";

/**
 * Junior leaderboard query helpers, extracted from routes/juniors.ts.
 *
 * These five reads (roster games, batting/bowling leaders, best innings and
 * best figures) were interleaved among the route handlers. They are pure
 * scope-filtered queries against the junior match tables — no route, no
 * request context — so importing them back into the router cannot create a
 * cycle. Same shared-core-first pattern as junior-admin-helpers.ts.
 */
export type LeaderScope = { season?: string; ageGroup?: string };

/**
 * Canonical "Games" per HH participant: the count of DISTINCT matches the player
 * was named in the team roster. This is the single source of truth for every
 * game/match column across the junior leaderboards so a player shows the SAME
 * number on every tab (the roster is the true appearance record — a player can
 * be in the XI without batting or bowling, so batting-innings or bowling-spell
 * counts under-count appearances). Unscoped it equals
 * junior_participants.roster_appearances; with a season/age scope it counts only
 * matches in that scope, so the figure tracks whatever filter the tab applies.
 * Opposition lines have is_halls_head = false and are excluded.
 */
export async function rosterGamesByParticipant(
  scope: LeaderScope = {},
): Promise<Map<string, number>> {
  const conds = [
    eq(juniorMatchRostersTable.isHallsHead, true),
    isNotNull(juniorMatchRostersTable.participantId),
  ];
  if (scope.season) conds.push(eq(juniorMatchesTable.season, scope.season));
  if (scope.ageGroup) conds.push(eq(juniorMatchesTable.ageGroup, scope.ageGroup));
  const rows = await db
    .select({
      pid: juniorMatchRostersTable.participantId,
      games: sql<number>`count(distinct ${juniorMatchRostersTable.matchId})::int`,
    })
    .from(juniorMatchRostersTable)
    .innerJoin(juniorMatchesTable, eq(juniorMatchesTable.id, juniorMatchRostersTable.matchId))
    .where(and(...conds))
    .groupBy(juniorMatchRostersTable.participantId);
  return new Map(
    rows
      .filter((r): r is { pid: string; games: number } => r.pid != null)
      .map((r) => [r.pid, Number(r.games)]),
  );
}

export async function battingLeaders(limit: number, scope: LeaderScope = {}) {
  const conds = [
    eq(juniorMatchBattingTable.isHallsHead, true),
    eq(juniorParticipantsTable.isPrivate, false),
  ];
  if (scope.season) conds.push(eq(juniorMatchesTable.season, scope.season));
  if (scope.ageGroup) conds.push(eq(juniorMatchesTable.ageGroup, scope.ageGroup));
  const rows = await db
    .select({
      participantId: juniorParticipantsTable.participantId,
      displayName: juniorParticipantsTable.displayName,
      runs: sql<number>`coalesce(sum(${juniorMatchBattingTable.runs}),0)::int`,
      innings: sql<number>`count(*)::int`,
      highScore: sql<number>`max(${juniorMatchBattingTable.runs})`,
      outs: sql<number>`count(*) filter (where ${juniorMatchBattingTable.dismissal} is not null and ${juniorMatchBattingTable.dismissal} <> '' and lower(${juniorMatchBattingTable.dismissal}) not like '%not out%' and lower(${juniorMatchBattingTable.dismissal}) not like 'retired%')::int`,
    })
    .from(juniorMatchBattingTable)
    .innerJoin(
      juniorParticipantsTable,
      eq(juniorParticipantsTable.participantId, juniorMatchBattingTable.participantId),
    )
    .innerJoin(juniorMatchesTable, eq(juniorMatchesTable.id, juniorMatchBattingTable.matchId))
    .where(and(...conds))
    .groupBy(juniorParticipantsTable.participantId, juniorParticipantsTable.displayName)
    .having(sql`sum(${juniorMatchBattingTable.runs}) > 0`)
    .orderBy(sql`sum(${juniorMatchBattingTable.runs}) desc nulls last`)
    .limit(limit);
  return rows.map((r) => ({
    participantId: r.participantId,
    displayName: r.displayName ?? "",
    runs: r.runs,
    innings: r.innings,
    highScore: r.highScore,
    average: r.outs > 0 ? Math.round((r.runs / r.outs) * 100) / 100 : null,
  }));
}

export async function bowlingLeaders(limit: number, scope: LeaderScope = {}) {
  const conds = [
    eq(juniorMatchBowlingTable.isHallsHead, true),
    eq(juniorParticipantsTable.isPrivate, false),
  ];
  if (scope.season) conds.push(eq(juniorMatchesTable.season, scope.season));
  if (scope.ageGroup) conds.push(eq(juniorMatchesTable.ageGroup, scope.ageGroup));
  const rows = await db
    .select({
      participantId: juniorParticipantsTable.participantId,
      displayName: juniorParticipantsTable.displayName,
      wickets: sql<number>`coalesce(sum(${juniorMatchBowlingTable.wickets}),0)::int`,
      bestWickets: sql<number>`max(${juniorMatchBowlingTable.wickets})`,
      runs: sql<number>`coalesce(sum(${juniorMatchBowlingTable.runs}),0)::int`,
      // Ball notation → balls (whole*6 + tenths) before summing, not decimal overs.
      balls: sql<number>`coalesce(sum(floor(${juniorMatchBowlingTable.overs}) * ${BALLS_PER_OVER} + round((${juniorMatchBowlingTable.overs} - floor(${juniorMatchBowlingTable.overs})) * 10)), 0)::int`,
    })
    .from(juniorMatchBowlingTable)
    .innerJoin(
      juniorParticipantsTable,
      eq(juniorParticipantsTable.participantId, juniorMatchBowlingTable.participantId),
    )
    .innerJoin(juniorMatchesTable, eq(juniorMatchesTable.id, juniorMatchBowlingTable.matchId))
    .where(and(...conds))
    .groupBy(juniorParticipantsTable.participantId, juniorParticipantsTable.displayName)
    .having(sql`sum(${juniorMatchBowlingTable.wickets}) > 0`)
    .orderBy(sql`sum(${juniorMatchBowlingTable.wickets}) desc nulls last`)
    .limit(limit);
  // Canonical Games (roster appearances) under the same scope — NOT distinct
  // bowling matches, so "Matches" matches every other tab for the same player.
  const rosterGames = await rosterGamesByParticipant(scope);
  return rows.map((r) => ({
    participantId: r.participantId,
    displayName: r.displayName ?? "",
    wickets: r.wickets,
    matches: rosterGames.get(r.participantId) ?? 0,
    bestWickets: r.bestWickets,
    economy: r.balls > 0 ? Math.round((r.runs / (r.balls / BALLS_PER_OVER)) * 100) / 100 : null,
  }));
}

export async function highestScoreInnings(limit: number) {
  const rows = await db
    .select({
      participantId: juniorParticipantsTable.participantId,
      displayName: juniorParticipantsTable.displayName,
      runs: juniorMatchBattingTable.runs,
      balls: juniorMatchBattingTable.balls,
      season: juniorMatchesTable.season,
      ageGroup: juniorMatchesTable.ageGroup,
      matchId: juniorMatchesTable.id,
      opponentName: juniorMatchesTable.opponentName,
      matchDate: juniorMatchesTable.matchDate,
    })
    .from(juniorMatchBattingTable)
    .innerJoin(
      juniorParticipantsTable,
      eq(juniorParticipantsTable.participantId, juniorMatchBattingTable.participantId),
    )
    .innerJoin(juniorMatchesTable, eq(juniorMatchesTable.id, juniorMatchBattingTable.matchId))
    .where(
      and(
        eq(juniorMatchBattingTable.isHallsHead, true),
        eq(juniorParticipantsTable.isPrivate, false),
        isNotNull(juniorMatchBattingTable.runs),
      ),
    )
    .orderBy(desc(juniorMatchBattingTable.runs))
    .limit(limit);
  return rows.map((r) => ({
    participantId: r.participantId,
    displayName: r.displayName ?? "",
    runs: r.runs ?? 0,
    balls: r.balls,
    season: r.season,
    ageGroup: r.ageGroup,
    matchId: r.matchId,
    opponentName: r.opponentName,
    matchDate: r.matchDate,
  }));
}

export async function bestBowlingFigures(limit: number) {
  const rows = await db
    .select({
      participantId: juniorParticipantsTable.participantId,
      displayName: juniorParticipantsTable.displayName,
      wickets: juniorMatchBowlingTable.wickets,
      runs: juniorMatchBowlingTable.runs,
      season: juniorMatchesTable.season,
      ageGroup: juniorMatchesTable.ageGroup,
      matchId: juniorMatchesTable.id,
      opponentName: juniorMatchesTable.opponentName,
      matchDate: juniorMatchesTable.matchDate,
    })
    .from(juniorMatchBowlingTable)
    .innerJoin(
      juniorParticipantsTable,
      eq(juniorParticipantsTable.participantId, juniorMatchBowlingTable.participantId),
    )
    .innerJoin(juniorMatchesTable, eq(juniorMatchesTable.id, juniorMatchBowlingTable.matchId))
    .where(
      and(
        eq(juniorMatchBowlingTable.isHallsHead, true),
        eq(juniorParticipantsTable.isPrivate, false),
        isNotNull(juniorMatchBowlingTable.wickets),
      ),
    )
    .orderBy(desc(juniorMatchBowlingTable.wickets), juniorMatchBowlingTable.runs)
    .limit(limit);
  return rows.map((r) => ({
    participantId: r.participantId,
    displayName: r.displayName ?? "",
    wickets: r.wickets ?? 0,
    runs: r.runs ?? 0,
    season: r.season,
    ageGroup: r.ageGroup,
    matchId: r.matchId,
    opponentName: r.opponentName,
    matchDate: r.matchDate,
  }));
}
