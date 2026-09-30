import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import {
  centralDb,
  centralFieldingTable,
  centralMatchBattingTable,
  centralMatchBowlingTable,
  centralMatchesTable,
} from "../central";
import { appGradeFromCentral, parseSeasonStartYear } from "./grades";
import { clubInvolvedWhere, inList } from "./where";

// ---------------------------------------------------------------------------
// Reads behind the club corrections admin screen (hybrid stats plan U16, R15,
// KTD7). A club admin picks one of the club's matches, then a player line in
// it, then a figure. Read-only, like every central read; deliberately UNCACHED
// — an admin correcting a figure must see central as it is now, and the write
// check compares against the same live figure.
//
// Senior matches only (juniors isolation): a junior / pathway / unmapped grade
// is never offered, and a correction naming one is refused.
// ---------------------------------------------------------------------------

/** One of the club's matches, from the club's side. `grade` null = not senior. */
export interface CentralCorrectionMatch {
  matchId: number;
  playhqMatchId: string | null;
  season: number | null;
  /** App grade; null for a junior / pathway / unmapped label. */
  grade: string | null;
  round: string | null;
  matchDate: string | null;
  opponent: string | null;
  clubScore: string | null;
  opponentScore: string | null;
}

const MATCH_COLUMNS = {
  matchId: centralMatchesTable.matchId,
  playhqMatchId: centralMatchesTable.playhqMatchId,
  season: centralMatchesTable.season,
  grade: centralMatchesTable.grade,
  round: centralMatchesTable.round,
  matchDate: centralMatchesTable.matchDate,
  homeClubId: centralMatchesTable.homeClubId,
  homeTeam: centralMatchesTable.homeTeam,
  awayTeam: centralMatchesTable.awayTeam,
  homeScore: centralMatchesTable.homeScore,
  awayScore: centralMatchesTable.awayScore,
};

type MatchRow = {
  matchId: number;
  playhqMatchId: string | null;
  season: string | null;
  grade: string | null;
  round: string | null;
  matchDate: string | null;
  homeClubId: number | null;
  homeTeam: string | null;
  awayTeam: string | null;
  homeScore: string | null;
  awayScore: string | null;
};

/** Shape a central match row from `clubId`'s side. Pure. */
export function correctionMatchFromRow(row: MatchRow, clubId: number): CentralCorrectionMatch {
  const home = row.homeClubId === clubId;
  return {
    matchId: row.matchId,
    playhqMatchId: row.playhqMatchId,
    season: parseSeasonStartYear(row.season),
    grade: appGradeFromCentral(row.grade),
    round: row.round,
    matchDate: row.matchDate,
    opponent: home ? row.awayTeam : row.homeTeam,
    clubScore: home ? row.homeScore : row.awayScore,
    opponentScore: home ? row.awayScore : row.homeScore,
  };
}

/** Escape LIKE wildcards so a search word matches literally. */
function likeWord(word: string): string {
  return `%${word.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * The words of a search, each of which must appear in the match's date,
 * opponent (either team), round, grade or season. Pure.
 */
export function correctionSearchWords(q: string | undefined): string[] {
  return (q ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 6);
}

/**
 * The club's SENIOR matches matching `q`, newest first, at most `limit`.
 */
export async function centralCorrectionMatchSearch(
  clubId: number,
  opts: { q?: string; limit: number },
): Promise<CentralCorrectionMatch[]> {
  const conds: SQL[] = [clubInvolvedWhere(clubId)];
  for (const word of correctionSearchWords(opts.q)) {
    const w = likeWord(word);
    conds.push(sql`(
      coalesce(${centralMatchesTable.matchDate}, '') ilike ${w}
      or coalesce(${centralMatchesTable.homeTeam}, '') ilike ${w}
      or coalesce(${centralMatchesTable.awayTeam}, '') ilike ${w}
      or coalesce(${centralMatchesTable.round}, '') ilike ${w}
      or coalesce(${centralMatchesTable.grade}, '') ilike ${w}
      or coalesce(${centralMatchesTable.season}, '') ilike ${w}
    )`);
  }
  const rows = await centralDb
    .select(MATCH_COLUMNS)
    .from(centralMatchesTable)
    .where(and(...conds))
    .orderBy(
      desc(sql`coalesce(${centralMatchesTable.matchDate}, '')`),
      desc(centralMatchesTable.matchId),
    );
  const out: CentralCorrectionMatch[] = [];
  for (const r of rows) {
    const m = correctionMatchFromRow(r, clubId);
    if (m.grade === null) continue; // juniors isolation
    out.push(m);
    if (out.length >= opts.limit) break;
  }
  return out;
}

/** One of the club's matches by central id (any grade), or null when it isn't the club's. */
export async function centralCorrectionMatch(
  clubId: number,
  matchId: number,
): Promise<CentralCorrectionMatch | null> {
  const [row] = await centralDb
    .select(MATCH_COLUMNS)
    .from(centralMatchesTable)
    .where(and(eq(centralMatchesTable.matchId, matchId), clubInvolvedWhere(clubId)));
  return row ? correctionMatchFromRow(row, clubId) : null;
}

/** The club's matches with these PlayHQ ids (any grade); others are left out. */
export async function centralCorrectionMatchesByPlayhqIds(
  clubId: number,
  playhqMatchIds: readonly string[],
): Promise<CentralCorrectionMatch[]> {
  const ids = [...new Set(playhqMatchIds.filter(Boolean))];
  if (ids.length === 0) return [];
  const rows = await centralDb
    .select(MATCH_COLUMNS)
    .from(centralMatchesTable)
    .where(and(inList(centralMatchesTable.playhqMatchId, ids), clubInvolvedWhere(clubId)));
  return rows.map((r) => correctionMatchFromRow(r, clubId));
}

/**
 * GUIDs with a batting, bowling or fielding row for the club in one match —
 * the lines a correction can name (a team-sheet-only player has no figures).
 */
export async function centralClubMatchParticipantIds(
  clubId: number,
  matchId: number,
): Promise<string[]> {
  const [bat, bowl, field] = await Promise.all([
    centralDb
      .selectDistinct({ participantId: centralMatchBattingTable.participantId })
      .from(centralMatchBattingTable)
      .where(
        and(
          eq(centralMatchBattingTable.matchId, matchId),
          eq(centralMatchBattingTable.clubId, clubId),
        ),
      ),
    centralDb
      .selectDistinct({ participantId: centralMatchBowlingTable.participantId })
      .from(centralMatchBowlingTable)
      .where(
        and(
          eq(centralMatchBowlingTable.matchId, matchId),
          eq(centralMatchBowlingTable.clubId, clubId),
        ),
      ),
    centralDb
      .selectDistinct({ participantId: centralFieldingTable.participantId })
      .from(centralFieldingTable)
      .where(
        and(eq(centralFieldingTable.matchId, matchId), eq(centralFieldingTable.clubId, clubId)),
      ),
  ]);
  const ids = new Set<string>();
  for (const r of [...bat, ...bowl, ...field]) if (r.participantId) ids.add(r.participantId);
  return [...ids];
}
