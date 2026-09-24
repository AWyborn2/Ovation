import { and, eq, lt } from "drizzle-orm";
import type { z } from "zod";
import {
  db,
  matchesTable,
  matchPlayerLinesTable,
  playerIdMapTable,
  playersTable,
} from "@workspace/db";
import { FILL_IN_THRESHOLD, oversToBalls } from "@workspace/scorecard";
import type { GetPlayersVsClubResponse } from "@workspace/api-zod";
import type { DataSource } from "./tenant";
import { resolveCuration } from "./central-curation";
import type { ResolvedOpponent } from "./opponent-club";

/**
 * Squad vs club (stats analytics KTD6): every club player's career batting and
 * bowling against one opponent club, across all senior grades. Served by
 * `GET /players/vs-club`; feeds the Compare selection helper.
 *
 * Both read paths produce the same {@link VsClubRawRow} keyed by APP player id,
 * then {@link buildVsClub} applies the batting qualifier, derives averages and
 * ranks the lists the same way.
 *
 *   - Native: `match_player_lines` joined to `matches.opponent_club_id` (the
 *     native matches table holds senior matches only; juniors live in their own
 *     junior_* tables). Fill-ins (id >= 90000) are excluded in SQL.
 *   - Central: raw per-GUID rows from `centralVsClub` (junior grade labels never
 *     count, private players omitted); the GUID is resolved to the app id
 *     through the tenant's `player_id_map` HERE, in the route layer, and a GUID
 *     with no crosswalk row is dropped rather than returned as id 0.
 */

export const DEFAULT_VS_CLUB_MIN_INNINGS = 3;

export type PlayersVsClub = z.infer<typeof GetPlayersVsClubResponse>;

/** One player's raw record against the opponent, before qualification. */
export interface VsClubRawRow {
  playerId: number;
  givenName: string;
  surname: string;
  matches: number;
  innings: number;
  notOuts: number;
  outs: number;
  runs: number;
  highScore: number | null;
  highScoreNotOut: boolean;
  /** Bowling lines recorded; 0 = never bowled against the club. */
  spells: number;
  wickets: number;
  runsConceded: number;
  ballsBowled: number | null;
  bestWickets: number | null;
  bestRuns: number | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Qualify, derive and rank. Pure. */
export function buildVsClub(
  opponent: ResolvedOpponent,
  rows: readonly VsClubRawRow[],
  minInnings: number,
): PlayersVsClub {
  const name = (r: VsClubRawRow) => ({
    playerId: r.playerId,
    givenName: r.givenName,
    surname: r.surname,
    matches: r.matches,
  });

  const batting = rows
    .filter((r) => r.innings > 0 && r.innings >= minInnings)
    .map((r) => ({
      ...name(r),
      innings: r.innings,
      notOuts: r.notOuts,
      outs: r.outs,
      runs: r.runs,
      average: r.outs > 0 ? round2(r.runs / r.outs) : null,
      highScore: r.highScore,
      highScoreNotOut: r.highScoreNotOut,
    }))
    // Best average first; never-out batters (no average) rank after every
    // average, by runs; then runs, then fewer innings.
    .sort(
      (a, b) =>
        (b.average ?? -1) - (a.average ?? -1) ||
        b.runs - a.runs ||
        a.innings - b.innings ||
        a.playerId - b.playerId,
    );

  const bowling = rows
    .filter((r) => r.spells > 0)
    .map((r) => ({
      ...name(r),
      wickets: r.wickets,
      runsConceded: r.runsConceded,
      balls: r.ballsBowled,
      average: r.wickets > 0 ? round2(r.runsConceded / r.wickets) : null,
      bestWickets: r.bestWickets,
      bestRuns: r.bestRuns,
    }))
    // Most wickets first, then the LOWER average (lower is better).
    .sort(
      (a, b) =>
        b.wickets - a.wickets ||
        (a.average ?? Infinity) - (b.average ?? Infinity) ||
        a.playerId - b.playerId,
    );

  return {
    resolved: opponent.resolved,
    opponentClubId: opponent.clubId,
    opponentName: opponent.name,
    minInnings,
    batting: opponent.resolved ? batting : [],
    bowling: opponent.resolved ? bowling : [],
  };
}

/** Native line the fold needs (one line per player per match). */
export interface NativeVsClubLine {
  playerId: number;
  givenName: string | null;
  surname: string | null;
  matchId: number;
  batted: boolean;
  runs: number | null;
  notOut: boolean;
  bowled: boolean;
  overs: string | null;
  runsConceded: number | null;
  wickets: number | null;
}

/** Fold native lines into one row per player. Pure; fill-ins dropped again. */
export function foldNativeVsClubLines(lines: readonly NativeVsClubLine[]): VsClubRawRow[] {
  const by = new Map<number, VsClubRawRow & { matchSet: Set<number> }>();
  for (const l of lines) {
    if (l.playerId >= FILL_IN_THRESHOLD) continue;
    let a = by.get(l.playerId);
    if (!a) {
      a = {
        playerId: l.playerId,
        givenName: l.givenName ?? "",
        surname: l.surname ?? "",
        matches: 0,
        matchSet: new Set(),
        innings: 0,
        notOuts: 0,
        outs: 0,
        runs: 0,
        highScore: null,
        highScoreNotOut: false,
        spells: 0,
        wickets: 0,
        runsConceded: 0,
        ballsBowled: null,
        bestWickets: null,
        bestRuns: null,
      };
      by.set(l.playerId, a);
    }
    a.matchSet.add(l.matchId);
    if (l.batted) {
      const runs = l.runs ?? 0;
      a.innings += 1;
      a.runs += runs;
      if (l.notOut) a.notOuts += 1;
      else a.outs += 1;
      if (a.highScore === null || runs > a.highScore || (runs === a.highScore && l.notOut)) {
        a.highScore = runs;
        a.highScoreNotOut = l.notOut;
      }
    }
    if (l.bowled) {
      const wickets = l.wickets ?? 0;
      const runs = l.runsConceded ?? 0;
      a.spells += 1;
      a.wickets += wickets;
      a.runsConceded += runs;
      const balls = oversToBalls(l.overs);
      if (balls !== null) a.ballsBowled = (a.ballsBowled ?? 0) + balls;
      if (
        a.bestWickets === null ||
        wickets > a.bestWickets ||
        (wickets === a.bestWickets && runs < (a.bestRuns ?? Infinity))
      ) {
        a.bestWickets = wickets;
        a.bestRuns = runs;
      }
    }
  }
  return [...by.values()].map(({ matchSet, ...row }) => ({ ...row, matches: matchSet.size }));
}

export async function loadNativeVsClubRows(opponentClubId: number): Promise<VsClubRawRow[]> {
  const l = matchPlayerLinesTable;
  const lines = await db
    .select({
      playerId: l.playerId,
      givenName: playersTable.givenName,
      surname: playersTable.surname,
      matchId: l.matchId,
      batted: l.batted,
      runs: l.runs,
      notOut: l.notOut,
      bowled: l.bowled,
      overs: l.overs,
      runsConceded: l.runsConceded,
      wickets: l.wickets,
    })
    .from(l)
    .innerJoin(matchesTable, eq(matchesTable.id, l.matchId))
    .innerJoin(playersTable, eq(playersTable.id, l.playerId))
    .where(and(eq(matchesTable.opponentClubId, opponentClubId), lt(l.playerId, FILL_IN_THRESHOLD)));
  return foldNativeVsClubLines(lines);
}

export async function loadCentralVsClubRows(
  source: Extract<DataSource, { kind: "central" }>,
  opponentClubId: number,
): Promise<VsClubRawRow[]> {
  const { centralVsClub, splitDisplayName } = await import("@workspace/db/central-queries");
  const [rows, mapRows, curation] = await Promise.all([
    centralVsClub({ clubId: source.clubId, opponentClubId }),
    db
      .select({
        participantId: playerIdMapTable.participantId,
        playerId: playerIdMapTable.playerId,
      })
      .from(playerIdMapTable)
      .where(eq(playerIdMapTable.tenantId, source.tenantId)),
    resolveCuration(source.tenantId),
  ]);
  const intByGuid = new Map(mapRows.map((m) => [m.participantId, m.playerId]));

  const out: VsClubRawRow[] = [];
  for (const r of rows) {
    const playerId = intByGuid.get(r.participantId);
    if (!playerId) continue;
    const { participantId, displayName, ...figures } = r;
    out.push({
      playerId,
      ...splitDisplayName(curation.nameByGuid.get(participantId) ?? displayName ?? ""),
      ...figures,
    });
  }
  return out;
}

/** Load and shape the squad's record against a resolved (or unresolved) opponent. */
export async function loadVsClub(
  source: DataSource,
  opponent: ResolvedOpponent,
  minInnings: number,
): Promise<PlayersVsClub> {
  if (!opponent.resolved) return buildVsClub(opponent, [], minInnings);
  const rows =
    source.kind === "central"
      ? await loadCentralVsClubRows(source, opponent.clubId)
      : await loadNativeVsClubRows(opponent.clubId);
  return buildVsClub(opponent, rows, minInnings);
}
