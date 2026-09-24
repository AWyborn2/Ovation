import { and, desc, eq, or, sql, type AnyColumn } from "drizzle-orm";
import {
  centralDb,
  centralClubsTable,
  centralFieldingTable,
  centralMatchBattingTable,
  centralMatchBowlingTable,
  centralMatchesTable,
  centralMatchRostersTable,
  playhqMatchesTable,
} from "../central";
import { cacheKey, withCentralCache } from "./cache";
import { appGradeFromCentral, parseSeasonStartYear } from "./grades";
import { centralOversToBalls } from "./match-innings";
import { centralPlayerNames } from "./privacy";
import { classifyInnings } from "./scoring";
import { inList } from "./where";

// ---------------------------------------------------------------------------
// Squad vs club (stats analytics KTD6). Every club player's career record
// against ONE opponent club, across all senior grades, for the Compare
// selection helper. Read from the central scorecard lines.
//
// Rules this read follows (see
// docs/solutions/architecture-patterns/central-read-player-identity-crosswalk.md):
//   - Aggregated by participant GUID, never by display name. NULL/empty
//     participant lines are excluded.
//   - Rows carry the GUID, not an app player id; the route resolves the id
//     through the tenant's `player_id_map` crosswalk.
//   - A match counts only when its grade label maps to a senior app grade and
//     its season parses — the same filter the per-player match log
//     (`centralPlayerMatchLog`) applies, so a player's figures here equal the
//     sum of their per-innings match-log rows against the same club. Junior /
//     pathway labels map to null and never count (juniors isolation).
//   - Innings follow `classifyInnings` ("did not bat" is not an innings).
//   - Private participants are OMITTED (public-facing aggregate; privacy.ts).
// ---------------------------------------------------------------------------

/** A central match between the club and the opponent, with its labels. */
export interface CentralVsClubMatch {
  matchId: number;
  grade: string | null;
  season: string | null;
}

/** One participant's raw career record against the opponent club. */
export interface CentralVsClubRow {
  participantId: string;
  displayName: string | null;
  matches: number;
  innings: number;
  notOuts: number;
  outs: number;
  runs: number;
  highScore: number | null;
  highScoreNotOut: boolean;
  /** Bowling lines (spells) recorded against the club; 0 = never bowled. */
  spells: number;
  wickets: number;
  runsConceded: number;
  /** Balls over spells with recorded overs; null when none recorded. */
  ballsBowled: number | null;
  bestWickets: number | null;
  bestRuns: number | null;
}

/** Raw batting line the aggregator needs. */
export interface VsClubBatLine {
  matchId: number;
  participantId: string;
  runs: number | null;
  dismissal: string | null;
  dismissalType: string | null;
}

/** Raw bowling line the aggregator needs. */
export interface VsClubBowlLine {
  matchId: number;
  participantId: string;
  overs: number | null;
  runs: number | null;
  wickets: number | null;
}

/** An appearance with no figures (roster / fielding line). */
export interface VsClubAppearance {
  matchId: number;
  participantId: string;
}

/**
 * The senior matches that count. Pure: a label that maps to no app grade
 * (junior, pathway, charity) or a season that doesn't parse is excluded —
 * exactly the match-log rule.
 */
export function vsClubSeniorMatchIds(matches: readonly CentralVsClubMatch[]): number[] {
  const ids: number[] = [];
  for (const m of matches) {
    if (!appGradeFromCentral(m.grade)) continue;
    if (parseSeasonStartYear(m.season) === null) continue;
    ids.push(m.matchId);
  }
  return ids;
}

/**
 * Fold raw lines into one row per participant GUID. Pure, so the aggregation
 * rules are unit-testable without a database. Lines whose match isn't in
 * `matchIds` or whose participant is blank are ignored.
 */
export function aggregateVsClubLines(input: {
  matchIds: readonly number[];
  batting: readonly VsClubBatLine[];
  bowling: readonly VsClubBowlLine[];
  appearances: readonly VsClubAppearance[];
}): Omit<CentralVsClubRow, "displayName">[] {
  const allowed = new Set(input.matchIds);
  const keep = (l: { matchId: number; participantId: string }) =>
    allowed.has(l.matchId) && !!l.participantId && l.participantId.trim() !== "";

  type Acc = Omit<CentralVsClubRow, "displayName"> & { matchSet: Set<number> };
  const byPid = new Map<string, Acc>();
  const acc = (pid: string): Acc => {
    let a = byPid.get(pid);
    if (!a) {
      a = {
        participantId: pid,
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
      byPid.set(pid, a);
    }
    return a;
  };

  for (const l of input.batting) {
    if (!keep(l)) continue;
    const a = acc(l.participantId);
    a.matchSet.add(l.matchId);
    const kind = classifyInnings(l.dismissalType, l.dismissal);
    if (kind === "dnb") continue;
    const runs = l.runs ?? 0;
    a.innings += 1;
    a.runs += runs;
    if (kind === "notout") a.notOuts += 1;
    else a.outs += 1;
    const notOut = kind === "notout";
    // Higher score wins; on a tie the not-out version is the better innings.
    if (a.highScore === null || runs > a.highScore || (runs === a.highScore && notOut)) {
      a.highScore = runs;
      a.highScoreNotOut = notOut;
    }
  }

  for (const l of input.bowling) {
    if (!keep(l)) continue;
    const a = acc(l.participantId);
    a.matchSet.add(l.matchId);
    const wickets = l.wickets ?? 0;
    const runs = l.runs ?? 0;
    a.spells += 1;
    a.wickets += wickets;
    a.runsConceded += runs;
    const balls = centralOversToBalls(l.overs);
    if (balls !== null) a.ballsBowled = (a.ballsBowled ?? 0) + balls;
    // Best figures: most wickets, then fewest runs.
    if (
      a.bestWickets === null ||
      wickets > a.bestWickets ||
      (wickets === a.bestWickets && runs < (a.bestRuns ?? Infinity))
    ) {
      a.bestWickets = wickets;
      a.bestRuns = runs;
    }
  }

  for (const l of input.appearances) {
    if (!keep(l)) continue;
    acc(l.participantId).matchSet.add(l.matchId);
  }

  return [...byPid.values()].map(({ matchSet, ...row }) => ({ ...row, matches: matchSet.size }));
}

/** Every central match between the two clubs (either side at home). */
async function matchesBetween(
  clubId: number,
  opponentClubId: number,
): Promise<CentralVsClubMatch[]> {
  const m = centralMatchesTable;
  return centralDb
    .select({ matchId: m.matchId, grade: m.grade, season: m.season })
    .from(m)
    .where(
      or(
        and(eq(m.homeClubId, clubId), eq(m.awayClubId, opponentClubId)),
        and(eq(m.homeClubId, opponentClubId), eq(m.awayClubId, clubId)),
      ),
    );
}

/**
 * The club's players' career records against one opponent club. `clubId` is
 * required — never defaulted, so an omitted club is a compile error rather
 * than a read of another club's data.
 */
export async function centralVsClub(opts: {
  clubId: number;
  opponentClubId: number;
}): Promise<CentralVsClubRow[]> {
  const { clubId, opponentClubId } = opts;
  if (clubId === opponentClubId) return [];
  return withCentralCache(cacheKey("centralVsClub", [clubId, opponentClubId]), () =>
    centralVsClubImpl(clubId, opponentClubId),
  );
}

async function centralVsClubImpl(
  clubId: number,
  opponentClubId: number,
): Promise<CentralVsClubRow[]> {
  const matchIds = vsClubSeniorMatchIds(await matchesBetween(clubId, opponentClubId));
  if (matchIds.length === 0) return [];

  const b = centralMatchBattingTable;
  const w = centralMatchBowlingTable;
  const r = centralMatchRostersTable;
  const f = centralFieldingTable;
  const hasParticipant = (col: AnyColumn) => sql`${col} is not null and ${col} <> ''`;

  const [batting, bowling, rosters, fielding] = await Promise.all([
    centralDb
      .select({
        matchId: b.matchId,
        participantId: b.participantId,
        runs: b.runs,
        dismissal: b.dismissal,
        dismissalType: b.dismissalType,
      })
      .from(b)
      .where(
        and(eq(b.clubId, clubId), inList(b.matchId, matchIds), hasParticipant(b.participantId)),
      ),
    centralDb
      .select({
        matchId: w.matchId,
        participantId: w.participantId,
        overs: w.overs,
        runs: w.runs,
        wickets: w.wickets,
      })
      .from(w)
      .where(
        and(eq(w.clubId, clubId), inList(w.matchId, matchIds), hasParticipant(w.participantId)),
      ),
    centralDb
      .select({ matchId: r.matchId, participantId: r.participantId })
      .from(r)
      .where(
        and(eq(r.clubId, clubId), inList(r.matchId, matchIds), hasParticipant(r.participantId)),
      ),
    centralDb
      .select({ matchId: f.matchId, participantId: f.participantId })
      .from(f)
      .where(
        and(eq(f.clubId, clubId), inList(f.matchId, matchIds), hasParticipant(f.participantId)),
      ),
  ]);

  // Drizzle types these columns nullable; the SQL predicate already dropped
  // blank participants and a line always has a match id.
  const nn = <T extends { matchId: number | null; participantId: string | null }>(rows: T[]) =>
    rows.filter(
      (x): x is T & { matchId: number; participantId: string } =>
        x.matchId !== null && x.participantId !== null,
    );

  const rows = aggregateVsClubLines({
    matchIds,
    batting: nn(batting),
    bowling: nn(bowling),
    appearances: [...nn(rosters), ...nn(fielding)],
  });
  const names = await centralPlayerNames(rows.map((x) => x.participantId));
  return rows
    .filter((x) => !names.get(x.participantId)?.isPrivate)
    .map((x) => ({ ...x, displayName: names.get(x.participantId)?.displayName ?? null }));
}

/** A central club's register row, or null when the id isn't in the register. */
export async function centralClubById(
  clubId: number,
): Promise<{ clubId: number; name: string | null; shortName: string | null } | null> {
  return withCentralCache(cacheKey("centralClubById", [clubId]), async () => {
    const [row] = await centralDb
      .select({
        clubId: centralClubsTable.clubId,
        name: centralClubsTable.name,
        shortName: centralClubsTable.shortName,
      })
      .from(centralClubsTable)
      .where(eq(centralClubsTable.clubId, clubId));
    return row ?? null;
  });
}

/**
 * The central club id for a PlayHQ organisation, derived from the matches both
 * datasets share (`central.matches.playhq_match_id` = `playhq.matches.id`): the
 * central club on the org's side of those matches. The most frequent id wins,
 * so a stray mis-sided row can't flip it. Null when the org has no scorecard
 * in central.
 */
export async function centralClubIdForPlayhqOrg(orgId: string): Promise<number | null> {
  if (!orgId.trim()) return null;
  return withCentralCache(cacheKey("centralClubIdForPlayhqOrg", [orgId]), async () => {
    const pm = playhqMatchesTable;
    const cm = centralMatchesTable;
    const clubCol = sql<
      number | null
    >`case when ${pm.homeOrgId} = ${orgId} then ${cm.homeClubId} else ${cm.awayClubId} end`;
    const [row] = await centralDb
      .select({ clubId: clubCol, n: sql<number>`count(*)::int` })
      .from(pm)
      .innerJoin(cm, eq(cm.playhqMatchId, pm.id))
      .where(or(eq(pm.homeOrgId, orgId), eq(pm.awayOrgId, orgId)))
      .groupBy(clubCol)
      .orderBy(desc(sql`count(*)`))
      .limit(1);
    return row?.clubId == null ? null : Number(row.clubId);
  });
}
