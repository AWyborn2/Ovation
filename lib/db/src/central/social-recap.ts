import { and, eq, sql } from "drizzle-orm";
import {
  centralDb,
  centralFieldingTable,
  centralMatchBattingTable,
  centralMatchBowlingTable,
  centralMatchesTable,
} from "../central";
import { appGradeFromCentral, parseRound, parseSeasonStartYear } from "./grades";
import { centralPlayerNames } from "./privacy";
import { classifyInnings, tallyFielding } from "./scoring";
import { clubInvolvedWhere, inList } from "./where";

// ---------------------------------------------------------------------------
// Social Studio round-up / season recap reads (central equivalents of the
// native `queryPerformers`, `queryInningsRows` and `latestRound` in the API
// server's lib/roundup.ts). One (app grade, season) for one club.
//
// Rules this read follows (see
// docs/solutions/architecture-patterns/central-read-player-identity-crosswalk.md):
//   - Aggregated by participant GUID; NULL/empty participant lines are dropped.
//   - Rows carry the GUID, never an app player id — the caller resolves the id
//     through the tenant's `player_id_map` crosswalk.
//   - Grade labels map through classifyCentralGrade: junior / pathway labels
//     map to null and so never match a senior grade (juniors isolation).
//   - Private participants are OMITTED (public-facing cards; privacy.ts).
//   - Deliberately UNCACHED, like the drafting-sweep reads: a round-up must see
//     the round that just loaded, not a cached copy from before it.
// ---------------------------------------------------------------------------

/** One participant's season totals — the round-up's "top performer" inputs. */
export interface CentralSeasonPerformer {
  participantId: string;
  displayName: string | null;
  runs: number;
  wickets: number;
  /** Catches + stumpings (run-outs aren't a keeper/fielder dismissal credit). */
  dismissals: number;
}

/**
 * One participant's best single innings and best single spell in the season,
 * formatted the way the native snapshot stores them ("87*", "5/22").
 */
export interface CentralSeasonInnings {
  participantId: string;
  displayName: string | null;
  highScore: string | null;
  bestBowling: string | null;
}

export interface CentralGradeSeasonSocial {
  performers: CentralSeasonPerformer[];
  innings: CentralSeasonInnings[];
  /** Highest numbered round played (finals carry no number), or null. */
  latestRound: number | null;
}

/** A club match row with the labels the grade/season/round filter needs. */
export interface CentralSocialMatchRow {
  matchId: number;
  grade: string | null;
  season: string | null;
  round: string | null;
}

/**
 * The club's match ids in one app grade and season, plus the latest numbered
 * round among them. Pure, so the juniors / season / finals rules are testable
 * without a database.
 */
export function socialGradeSeasonMatches(
  rows: readonly CentralSocialMatchRow[],
  appGrade: string,
  season: number,
): { matchIds: number[]; latestRound: number | null } {
  const matchIds: number[] = [];
  let latestRound: number | null = null;
  for (const m of rows) {
    if (appGradeFromCentral(m.grade) !== appGrade) continue;
    if (parseSeasonStartYear(m.season) !== season) continue;
    matchIds.push(m.matchId);
    const r = parseRound(m.round);
    if (r !== null && (latestRound === null || r > latestRound)) latestRound = r;
  }
  return { matchIds, latestRound };
}

export interface SocialBattingLine {
  participantId: string | null;
  runs: number | null;
  dismissal: string | null;
  dismissalType: string | null;
}

export interface SocialBowlingLine {
  participantId: string | null;
  wickets: number | null;
  runs: number | null;
}

export interface SocialFieldingRow {
  participantId: string | null;
  kind: string | null;
  n?: number;
}

/**
 * Fold one grade-season's scorecard lines into per-participant performers and
 * best innings/spell. Pure. "Did not bat" is not an innings; a tied high score
 * prefers the not-out innings; the best spell is most wickets, then fewest runs.
 */
export function foldGradeSeasonSocial(
  batting: readonly SocialBattingLine[],
  bowling: readonly SocialBowlingLine[],
  fielding: readonly SocialFieldingRow[],
): Map<
  string,
  {
    runs: number;
    wickets: number;
    dismissals: number;
    highScore: string | null;
    bestBowling: string | null;
  }
> {
  type Acc = {
    runs: number;
    wickets: number;
    dismissals: number;
    hs: { runs: number; notOut: boolean } | null;
    bb: { wkts: number; runs: number } | null;
  };
  const acc = new Map<string, Acc>();
  const accFor = (pid: string): Acc => {
    let a = acc.get(pid);
    if (!a) {
      a = { runs: 0, wickets: 0, dismissals: 0, hs: null, bb: null };
      acc.set(pid, a);
    }
    return a;
  };

  for (const b of batting) {
    if (!b.participantId) continue;
    const kind = classifyInnings(b.dismissalType, b.dismissal);
    if (kind === "dnb") continue;
    const a = accFor(b.participantId);
    const runs = b.runs ?? 0;
    const notOut = kind === "notout";
    a.runs += runs;
    if (!a.hs || runs > a.hs.runs || (runs === a.hs.runs && notOut && !a.hs.notOut)) {
      a.hs = { runs, notOut };
    }
  }
  for (const w of bowling) {
    if (!w.participantId) continue;
    const a = accFor(w.participantId);
    const wkts = w.wickets ?? 0;
    const runs = w.runs ?? 0;
    a.wickets += wkts;
    if (!a.bb || wkts > a.bb.wkts || (wkts === a.bb.wkts && runs < a.bb.runs)) {
      a.bb = { wkts, runs };
    }
  }
  for (const [pid, t] of tallyFielding([...fielding])) {
    accFor(pid).dismissals += t.catches + t.stumpings;
  }

  const out = new Map<
    string,
    {
      runs: number;
      wickets: number;
      dismissals: number;
      highScore: string | null;
      bestBowling: string | null;
    }
  >();
  for (const [pid, a] of acc) {
    out.set(pid, {
      runs: a.runs,
      wickets: a.wickets,
      dismissals: a.dismissals,
      highScore: a.hs ? `${a.hs.runs}${a.hs.notOut ? "*" : ""}` : null,
      bestBowling: a.bb ? `${a.bb.wkts}/${a.bb.runs}` : null,
    });
  }
  return out;
}

/**
 * Round-up / recap inputs for one club, app grade and season. `clubId` is
 * required — never defaulted — so an omitted club is a compile error rather
 * than a read of another club's data.
 */
export async function centralGradeSeasonSocial(
  clubId: number,
  appGrade: string,
  season: number,
): Promise<CentralGradeSeasonSocial> {
  const matchRows = await centralDb
    .select({
      matchId: centralMatchesTable.matchId,
      grade: centralMatchesTable.grade,
      season: centralMatchesTable.season,
      round: centralMatchesTable.round,
    })
    .from(centralMatchesTable)
    .where(clubInvolvedWhere(clubId));
  const { matchIds, latestRound } = socialGradeSeasonMatches(matchRows, appGrade, season);
  if (matchIds.length === 0) return { performers: [], innings: [], latestRound };

  const hasParticipant = sql`${centralMatchBattingTable.participantId} is not null`;
  const [batting, bowling, fielding] = await Promise.all([
    centralDb
      .select({
        participantId: centralMatchBattingTable.participantId,
        runs: centralMatchBattingTable.runs,
        dismissal: centralMatchBattingTable.dismissal,
        dismissalType: centralMatchBattingTable.dismissalType,
      })
      .from(centralMatchBattingTable)
      .where(
        and(
          eq(centralMatchBattingTable.clubId, clubId),
          inList(centralMatchBattingTable.matchId, matchIds),
          hasParticipant,
        ),
      ),
    centralDb
      .select({
        participantId: centralMatchBowlingTable.participantId,
        wickets: centralMatchBowlingTable.wickets,
        runs: centralMatchBowlingTable.runs,
      })
      .from(centralMatchBowlingTable)
      .where(
        and(
          eq(centralMatchBowlingTable.clubId, clubId),
          inList(centralMatchBowlingTable.matchId, matchIds),
        ),
      ),
    centralDb
      .select({
        participantId: centralFieldingTable.participantId,
        kind: centralFieldingTable.kind,
        n: sql<number>`count(*)::int`,
      })
      .from(centralFieldingTable)
      .where(
        and(
          eq(centralFieldingTable.clubId, clubId),
          inList(centralFieldingTable.matchId, matchIds),
        ),
      )
      .groupBy(centralFieldingTable.participantId, centralFieldingTable.kind),
  ]);

  const folded = foldGradeSeasonSocial(batting, bowling, fielding);
  const names = await centralPlayerNames([...folded.keys()]);

  const performers: CentralSeasonPerformer[] = [];
  const innings: CentralSeasonInnings[] = [];
  for (const [participantId, f] of folded) {
    const p = names.get(participantId);
    if (p?.isPrivate) continue; // OMIT (privacy.ts)
    const displayName = p?.displayName ?? null;
    performers.push({
      participantId,
      displayName,
      runs: f.runs,
      wickets: f.wickets,
      dismissals: f.dismissals,
    });
    innings.push({
      participantId,
      displayName,
      highScore: f.highScore,
      bestBowling: f.bestBowling,
    });
  }
  return { performers, innings, latestRound };
}
