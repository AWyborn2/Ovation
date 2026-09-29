/**
 * hh-central-crosswalk-read.ts — the READ side shared by the Halls Head
 * crosswalk scripts: hh-central-crosswalk.ts (the read-only diagnostic) and
 * persist-hh-crosswalk.ts (which persists its result). Never writes.
 *
 * Native reads run in one `BEGIN TRANSACTION READ ONLY` on a single client that
 * is ROLLED BACK at the end (Postgres itself rejects any write inside it);
 * central reads go through the read-only `centralDb` proxy (write builders
 * throw) on the SELECT-only central role, filtered to Halls Head's central club.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import {
  getPool,
  matchesTable,
  matchPlayerLinesTable,
  playersTable,
  playerGradeSeasonStatsTable,
} from "@workspace/db";
import {
  centralDb,
  centralMatchesTable,
  centralMatchBattingTable,
  centralMatchBowlingTable,
  centralMatchRostersTable,
  centralFieldingTable,
  centralPlayersTable,
} from "@workspace/db/central";
import {
  HALLS_HEAD_CENTRAL_CLUB_ID,
  clubInvolvedWhere,
  inList,
} from "@workspace/db/central-queries";
import type {
  CentralMatch,
  NativeLine,
  NativeMatch,
  NativePlayer,
} from "./hh-central-crosswalk-core";

export const HALLS_HEAD_TENANT_ID = 1;
const CLUB = HALLS_HEAD_CENTRAL_CLUB_ID;

// ---------------------------------------------------------------------------
// Native reads — one READ ONLY transaction, always rolled back
// ---------------------------------------------------------------------------

export interface NativeData {
  players: NativePlayer[];
  matches: NativeMatch[];
  lines: NativeLine[];
  pgss: {
    playerId: number;
    grade: string;
    season: number | null;
    games: number | null;
    innings: number | null;
    runs: number | null;
    wickets: number | null;
    catches: number | null;
  }[];
}

export async function readNative(): Promise<NativeData> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    await client.query("SET LOCAL statement_timeout = '300s'");
    const ro = drizzle(client);
    const [players, matches, lines, pgss] = [
      await ro
        .select({
          id: playersTable.id,
          givenName: playersTable.givenName,
          surname: playersTable.surname,
          isCapOnly: playersTable.isCapOnly,
        })
        .from(playersTable),
      await ro
        .select({
          id: matchesTable.id,
          sourceKey: matchesTable.sourceKey,
          season: matchesTable.season,
          grade: matchesTable.grade,
          abandoned: matchesTable.abandoned,
        })
        .from(matchesTable),
      await ro
        .select({
          matchId: matchPlayerLinesTable.matchId,
          playerId: matchPlayerLinesTable.playerId,
          batted: matchPlayerLinesTable.batted,
          battingPos: matchPlayerLinesTable.battingPos,
          runs: matchPlayerLinesTable.runs,
          balls: matchPlayerLinesTable.balls,
          notOut: matchPlayerLinesTable.notOut,
          bowled: matchPlayerLinesTable.bowled,
          overs: matchPlayerLinesTable.overs,
          maidens: matchPlayerLinesTable.maidens,
          runsConceded: matchPlayerLinesTable.runsConceded,
          wickets: matchPlayerLinesTable.wickets,
          catches: matchPlayerLinesTable.catches,
          stumpings: matchPlayerLinesTable.stumpings,
          runOuts: matchPlayerLinesTable.runOuts,
        })
        .from(matchPlayerLinesTable),
      await ro
        .select({
          playerId: playerGradeSeasonStatsTable.playerId,
          grade: playerGradeSeasonStatsTable.grade,
          season: playerGradeSeasonStatsTable.season,
          games: playerGradeSeasonStatsTable.games,
          innings: playerGradeSeasonStatsTable.innings,
          runs: playerGradeSeasonStatsTable.runs,
          wickets: playerGradeSeasonStatsTable.wickets,
          catches: playerGradeSeasonStatsTable.catches,
        })
        .from(playerGradeSeasonStatsTable),
    ];
    return { players, matches, lines, pgss };
  } finally {
    // Nothing was written (the transaction is READ ONLY) — roll back regardless.
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Central reads — SELECT only through the read-only proxy, Halls Head's club
// ---------------------------------------------------------------------------

export async function readCentral() {
  const matches: CentralMatch[] = await centralDb
    .select({
      matchId: centralMatchesTable.matchId,
      playhqMatchId: centralMatchesTable.playhqMatchId,
      season: centralMatchesTable.season,
      grade: centralMatchesTable.grade,
    })
    .from(centralMatchesTable)
    .where(clubInvolvedWhere(CLUB));
  const batting = await centralDb
    .select({
      matchId: centralMatchBattingTable.matchId,
      innings: centralMatchBattingTable.innings,
      batOrder: centralMatchBattingTable.batOrder,
      participantId: centralMatchBattingTable.participantId,
      playerName: centralMatchBattingTable.playerName,
      runs: centralMatchBattingTable.runs,
      balls: centralMatchBattingTable.balls,
      dismissal: centralMatchBattingTable.dismissal,
      dismissalType: centralMatchBattingTable.dismissalType,
    })
    .from(centralMatchBattingTable)
    .where(eq(centralMatchBattingTable.clubId, CLUB));
  const bowling = await centralDb
    .select({
      matchId: centralMatchBowlingTable.matchId,
      innings: centralMatchBowlingTable.innings,
      participantId: centralMatchBowlingTable.participantId,
      playerName: centralMatchBowlingTable.playerName,
      overs: centralMatchBowlingTable.overs,
      maidens: centralMatchBowlingTable.maidens,
      runs: centralMatchBowlingTable.runs,
      wickets: centralMatchBowlingTable.wickets,
    })
    .from(centralMatchBowlingTable)
    .where(eq(centralMatchBowlingTable.clubId, CLUB));
  const rosters = await centralDb
    .select({
      matchId: centralMatchRostersTable.matchId,
      participantId: centralMatchRostersTable.participantId,
      playerName: centralMatchRostersTable.playerName,
    })
    .from(centralMatchRostersTable)
    .where(eq(centralMatchRostersTable.clubId, CLUB));
  const fielding = await centralDb
    .select({
      matchId: centralFieldingTable.matchId,
      participantId: centralFieldingTable.participantId,
      kind: centralFieldingTable.kind,
    })
    .from(centralFieldingTable)
    .where(eq(centralFieldingTable.clubId, CLUB));

  const pids = [
    ...new Set(
      [...batting, ...bowling, ...rosters, ...fielding]
        .map((r) => r.participantId)
        .filter((p): p is string => Boolean(p)),
    ),
  ];
  const players = pids.length
    ? await centralDb
        .select({
          participantId: centralPlayersTable.participantId,
          displayName: centralPlayersTable.displayName,
          isPrivate: centralPlayersTable.isPrivate,
        })
        .from(centralPlayersTable)
        .where(inList(centralPlayersTable.participantId, pids))
    : [];
  return { matches, batting, bowling, rosters, fielding, players };
}

export type CentralData = Awaited<ReturnType<typeof readCentral>>;

/** Central `is_private` is stored as 0/1 (or boolean) — normalise to boolean. */
export const isCentralPrivate = (v: unknown): boolean => Number(v ?? 0) === 1;
