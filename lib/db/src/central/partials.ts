import { sql } from "drizzle-orm";
import {
  centralDb,
  centralFieldingTable,
  centralMatchBattingTable,
  centralMatchBowlingTable,
  centralMatchesTable,
  centralMatchRostersTable,
} from "../central";
import { cacheKey, withCentralCache } from "./cache";
import { getClubMatchRows, seniorMatchRows } from "./club-matches";
import { appGradeFromCentral, parseSeasonStartYear } from "./grades";
import { canonicalPidSql, mergesCacheArg, type CentralMerges } from "./merges";
import { centralPlayerNames } from "./privacy";
import { centralOversToBalls } from "./match-innings";
import { battingInningsKindSql, classifyFieldingKind, classifyInnings } from "./scoring";
import { inList } from "./where";

// ---------------------------------------------------------------------------
// Partial aggregates for the club overlay (hybrid stats plan U10, KTD1).
//
// The club overlay works at (participant, app grade, season) grain: the
// boundary drops whole (grade, season) buckets, corrections add deltas to one
// bucket, and club history supplies buckets for the seasons before the
// boundary. So instead of a finished career, these reads return one row per
// (participant, app grade, season) bucket — still club-filtered and cached by
// club (+ the tenant's confirmed merges, which fold in SQL exactly as U6's
// reads do) — and the overlay in the API route does the final aggregation.
//
// Rules shared with every other central read:
//   - Senior matches only (junior / pathway / unmapped grades never produce a
//     bucket — juniors isolation).
//   - Games = distinct matches from roster ∪ batting ∪ bowling (R7: a rostered
//     player who did not bat or bowl has played).
//   - Blank / null participants are never attributed.
//   - Nothing here writes to central.
// ---------------------------------------------------------------------------

/** One participant's figures for one (app grade, season) bucket. */
export interface CentralPartialFigures {
  /** Distinct matches (roster ∪ batting ∪ bowling). */
  games: number;
  /** Batting lines, DNB included (the batting leaderboard lists only batters). */
  batLines: number;
  innings: number;
  notOuts: number;
  runs: number;
  /** Balls faced over played innings; null when none recorded. */
  ballsFaced: number | null;
  fours: number;
  sixes: number;
  fifties: number;
  hundreds: number;
  /** Highest score over played innings; null when none. */
  highScore: number | null;
  highScoreNotOut: boolean;
  bowlLines: number;
  /** Balls bowled from ball-notation overs; null when none recorded. */
  ballsBowled: number | null;
  /** Maidens; null when none recorded. */
  maidens: number | null;
  runsConceded: number;
  wickets: number;
  wides: number;
  noBalls: number;
  fiveWickets: number;
  /** Best bowling over every bowling line (most wickets, then fewest runs). */
  bestBowlingWickets: number | null;
  bestBowlingRuns: number | null;
  catches: number;
  stumpings: number;
  runOuts: number;
}

export interface CentralPartial extends CentralPartialFigures {
  /** Keeper GUID (merged-away GUIDs already folded). */
  participantId: string;
  /** App grade (always a senior grade). */
  grade: string;
  /** Season start year; null when central's season text doesn't parse. */
  season: number | null;
}

export interface CentralPartials {
  buckets: CentralPartial[];
  /** Name + privacy per keeper (private when ANY GUID in its merge group is). */
  players: Array<{ participantId: string; displayName: string | null; isPrivate: boolean }>;
}

export function emptyPartialFigures(): CentralPartialFigures {
  return {
    games: 0,
    batLines: 0,
    innings: 0,
    notOuts: 0,
    runs: 0,
    ballsFaced: null,
    fours: 0,
    sixes: 0,
    fifties: 0,
    hundreds: 0,
    highScore: null,
    highScoreNotOut: false,
    bowlLines: 0,
    ballsBowled: null,
    maidens: null,
    runsConceded: 0,
    wickets: 0,
    wides: 0,
    noBalls: 0,
    fiveWickets: 0,
    bestBowlingWickets: null,
    bestBowlingRuns: null,
    catches: 0,
    stumpings: 0,
    runOuts: 0,
  };
}

/** null + null = null (unknown stays unknown); otherwise treat null as 0. */
export function addKnown(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null;
  return (a ?? 0) + (b ?? 0);
}

/** True when bowling figures (w1, r1) beat (w2, r2): more wickets, then fewer runs. */
export function betterBowling(w1: number, r1: number, w2: number | null, r2: number | null) {
  if (w2 === null) return true;
  return w1 > w2 || (w1 === w2 && r1 < (r2 ?? Infinity));
}

/**
 * Fold `add` into `into` (both figures of the SAME player and bucket, e.g. two
 * central grade labels that map to one app grade). Counts add; the high score
 * and best bowling take the better; unknown-able sums stay null only when both
 * sides are unknown. Mutates and returns `into`.
 */
export function mergePartialFigures<T extends CentralPartialFigures>(
  into: T,
  add: CentralPartialFigures,
): T {
  into.games += add.games;
  into.batLines += add.batLines;
  into.innings += add.innings;
  into.notOuts += add.notOuts;
  into.runs += add.runs;
  into.ballsFaced = addKnown(into.ballsFaced, add.ballsFaced);
  into.fours += add.fours;
  into.sixes += add.sixes;
  into.fifties += add.fifties;
  into.hundreds += add.hundreds;
  if (add.highScore !== null) {
    if (
      into.highScore === null ||
      add.highScore > into.highScore ||
      (add.highScore === into.highScore && add.highScoreNotOut)
    ) {
      into.highScoreNotOut =
        into.highScore === add.highScore
          ? into.highScoreNotOut || add.highScoreNotOut
          : add.highScoreNotOut;
      into.highScore = add.highScore;
    }
  }
  into.bowlLines += add.bowlLines;
  into.ballsBowled = addKnown(into.ballsBowled, add.ballsBowled);
  into.maidens = addKnown(into.maidens, add.maidens);
  into.runsConceded += add.runsConceded;
  into.wickets += add.wickets;
  into.wides += add.wides;
  into.noBalls += add.noBalls;
  into.fiveWickets += add.fiveWickets;
  if (
    add.bestBowlingWickets !== null &&
    betterBowling(
      add.bestBowlingWickets,
      add.bestBowlingRuns ?? 0,
      into.bestBowlingWickets,
      into.bestBowlingRuns,
    )
  ) {
    into.bestBowlingWickets = add.bestBowlingWickets;
    into.bestBowlingRuns = add.bestBowlingRuns;
  }
  into.catches += add.catches;
  into.stumpings += add.stumpings;
  into.runOuts += add.runOuts;
  return into;
}

/**
 * Every (participant, app grade, season) bucket the club's senior matches
 * produce, with names and privacy for the keepers. Cached by club + the
 * tenant's confirmed merges (a per-tenant input, so it is in the key).
 */
export async function centralPlayerPartials(
  clubId: number,
  merges?: CentralMerges,
): Promise<CentralPartials> {
  return withCentralCache(cacheKey("centralPlayerPartials", [clubId, mergesCacheArg(merges)]), () =>
    centralPlayerPartialsImpl(clubId, merges),
  );
}

type Row = Record<string, unknown>;
const num = (v: unknown): number => Number(v ?? 0);
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

async function centralPlayerPartialsImpl(
  clubId: number,
  merges?: CentralMerges,
): Promise<CentralPartials> {
  const batPid = canonicalPidSql(centralMatchBattingTable.participantId, merges);
  const bowlPid = canonicalPidSql(centralMatchBowlingTable.participantId, merges);
  const rosterPid = canonicalPidSql(centralMatchRostersTable.participantId, merges);
  const fieldPid = canonicalPidSql(centralFieldingTable.participantId, merges);
  const senior = seniorMatchRows(await getClubMatchRows(clubId));
  const matchIds = senior.map((m) => m.matchId);
  if (matchIds.length === 0) return { buckets: [], players: [] };

  // Grouped by the central grade/season LABELS in SQL; the label -> app grade
  // mapping (regex) runs in JS on the few distinct labels, and buckets whose
  // labels map to the same app grade are merged below.
  const [bat, bowl, apps, field] = await Promise.all([
    centralDb.execute(sql`
      with i as (
        select
          ${batPid} as participant_id,
          ${centralMatchBattingTable.matchId} as match_id,
          coalesce(${centralMatchBattingTable.runs}, 0) as runs,
          ${centralMatchBattingTable.balls} as balls,
          ${centralMatchBattingTable.fours} as fours,
          ${centralMatchBattingTable.sixes} as sixes,
          ${battingInningsKindSql} as kind
        from ${centralMatchBattingTable}
        where ${centralMatchBattingTable.clubId} = ${clubId}
          and ${inList(centralMatchBattingTable.matchId, matchIds)}
          and ${centralMatchBattingTable.participantId} is not null
          and ${centralMatchBattingTable.participantId} <> ''
      )
      select
        i.participant_id as "participantId",
        m.grade as "gradeLabel",
        m.season as "seasonLabel",
        count(*)::int as "batLines",
        (count(*) filter (where kind <> 'dnb'))::int as innings,
        coalesce(sum(runs) filter (where kind <> 'dnb'), 0)::int as runs,
        (count(*) filter (where kind = 'notout'))::int as "notOuts",
        (count(*) filter (where kind <> 'dnb' and runs >= 100))::int as hundreds,
        (count(*) filter (where kind <> 'dnb' and runs >= 50 and runs < 100))::int as fifties,
        max(case when kind <> 'dnb' then runs * 2 + (kind = 'notout')::int end) as "hsEnc",
        (sum(balls) filter (where kind <> 'dnb'))::int as "ballsFaced",
        coalesce(sum(fours) filter (where kind <> 'dnb'), 0)::int as fours,
        coalesce(sum(sixes) filter (where kind <> 'dnb'), 0)::int as sixes
      from i
      join ${centralMatchesTable} m on m.match_id = i.match_id
      group by i.participant_id, m.grade, m.season
    `),
    centralDb.execute(sql`
      with l as (
        select
          ${bowlPid} as participant_id,
          ${centralMatchBowlingTable.matchId} as match_id,
          coalesce(${centralMatchBowlingTable.wickets}, 0) as wickets,
          coalesce(${centralMatchBowlingTable.runs}, 0) as runs,
          ${centralMatchBowlingTable.maidens} as maidens,
          coalesce(${centralMatchBowlingTable.wides}, 0) as wides,
          coalesce(${centralMatchBowlingTable.noBalls}, 0) as no_balls,
          case
            when ${centralMatchBowlingTable.overs} is null or ${centralMatchBowlingTable.overs} < 0 then null
            when round(((${centralMatchBowlingTable.overs} - floor(${centralMatchBowlingTable.overs})) * 10)::numeric) > 5 then null
            else (floor(${centralMatchBowlingTable.overs}) * 6
              + round(((${centralMatchBowlingTable.overs} - floor(${centralMatchBowlingTable.overs})) * 10)::numeric))::int
          end as balls
        from ${centralMatchBowlingTable}
        where ${centralMatchBowlingTable.clubId} = ${clubId}
          and ${inList(centralMatchBowlingTable.matchId, matchIds)}
          and ${centralMatchBowlingTable.participantId} is not null
          and ${centralMatchBowlingTable.participantId} <> ''
      )
      select
        l.participant_id as "participantId",
        m.grade as "gradeLabel",
        m.season as "seasonLabel",
        count(*)::int as "bowlLines",
        sum(wickets)::int as wickets,
        sum(runs)::int as "runsConceded",
        sum(maidens)::int as maidens,
        sum(balls)::int as "ballsBowled",
        sum(wides)::int as wides,
        sum(no_balls)::int as "noBalls",
        (count(*) filter (where wickets >= 5))::int as "fiveWickets",
        max(wickets::bigint * 100000 + (99999 - least(runs, 99999))) as "bestEnc"
      from l
      join ${centralMatchesTable} m on m.match_id = l.match_id
      group by l.participant_id, m.grade, m.season
    `),
    centralDb.execute(sql`
      with apps as (
        select ${batPid} as participant_id, ${centralMatchBattingTable.matchId} as match_id
        from ${centralMatchBattingTable}
        where ${centralMatchBattingTable.clubId} = ${clubId}
          and ${inList(centralMatchBattingTable.matchId, matchIds)}
          and ${centralMatchBattingTable.participantId} is not null
          and ${centralMatchBattingTable.participantId} <> ''
        union
        select ${bowlPid}, ${centralMatchBowlingTable.matchId}
        from ${centralMatchBowlingTable}
        where ${centralMatchBowlingTable.clubId} = ${clubId}
          and ${inList(centralMatchBowlingTable.matchId, matchIds)}
          and ${centralMatchBowlingTable.participantId} is not null
          and ${centralMatchBowlingTable.participantId} <> ''
        union
        select ${rosterPid}, ${centralMatchRostersTable.matchId}
        from ${centralMatchRostersTable}
        where ${centralMatchRostersTable.clubId} = ${clubId}
          and ${inList(centralMatchRostersTable.matchId, matchIds)}
          and ${centralMatchRostersTable.participantId} is not null
          and ${centralMatchRostersTable.participantId} <> ''
      )
      select
        a.participant_id as "participantId",
        m.grade as "gradeLabel",
        m.season as "seasonLabel",
        count(distinct a.match_id)::int as games
      from apps a
      join ${centralMatchesTable} m on m.match_id = a.match_id
      group by a.participant_id, m.grade, m.season
    `),
    centralDb.execute(sql`
      with f as (
        select
          ${fieldPid} as participant_id,
          ${centralFieldingTable.matchId} as match_id,
          ${centralFieldingTable.kind} as kind
        from ${centralFieldingTable}
        where ${centralFieldingTable.clubId} = ${clubId}
          and ${inList(centralFieldingTable.matchId, matchIds)}
          and ${centralFieldingTable.participantId} is not null
          and ${centralFieldingTable.participantId} <> ''
      )
      select
        f.participant_id as "participantId",
        m.grade as "gradeLabel",
        m.season as "seasonLabel",
        f.kind,
        count(*)::int as n
      from f
      join ${centralMatchesTable} m on m.match_id = f.match_id
      group by f.participant_id, m.grade, m.season, f.kind
    `),
  ]);

  const buckets = new Map<string, CentralPartial>();
  const bucketFor = (r: Row): CentralPartial | null => {
    const pid = r.participantId as string | null;
    if (!pid) return null;
    const grade = appGradeFromCentral((r.gradeLabel as string | null) ?? null);
    if (!grade) return null; // defensive: senior matches only
    const season = parseSeasonStartYear((r.seasonLabel as string | null) ?? null);
    const key = `${pid}\u0000${grade}\u0000${season ?? ""}`;
    let b = buckets.get(key);
    if (!b) {
      b = { participantId: pid, grade, season, ...emptyPartialFigures() };
      buckets.set(key, b);
    }
    return b;
  };

  for (const r of apps.rows as Row[]) {
    const b = bucketFor(r);
    if (b) b.games += num(r.games);
  }
  for (const r of bat.rows as Row[]) {
    const b = bucketFor(r);
    if (!b) continue;
    const hsEnc = numOrNull(r.hsEnc);
    mergePartialFigures(b, {
      ...emptyPartialFigures(),
      batLines: num(r.batLines),
      innings: num(r.innings),
      notOuts: num(r.notOuts),
      runs: num(r.runs),
      ballsFaced: numOrNull(r.ballsFaced),
      fours: num(r.fours),
      sixes: num(r.sixes),
      fifties: num(r.fifties),
      hundreds: num(r.hundreds),
      highScore: hsEnc === null ? null : Math.floor(hsEnc / 2),
      highScoreNotOut: hsEnc !== null && hsEnc % 2 === 1,
    });
  }
  for (const r of bowl.rows as Row[]) {
    const b = bucketFor(r);
    if (!b) continue;
    const bestEnc = numOrNull(r.bestEnc);
    mergePartialFigures(b, {
      ...emptyPartialFigures(),
      bowlLines: num(r.bowlLines),
      wickets: num(r.wickets),
      runsConceded: num(r.runsConceded),
      maidens: numOrNull(r.maidens),
      ballsBowled: numOrNull(r.ballsBowled),
      wides: num(r.wides),
      noBalls: num(r.noBalls),
      fiveWickets: num(r.fiveWickets),
      bestBowlingWickets: bestEnc === null ? null : Math.floor(bestEnc / 100000),
      bestBowlingRuns: bestEnc === null ? null : 99999 - (bestEnc % 100000),
    });
  }
  for (const r of field.rows as Row[]) {
    const cls = classifyFieldingKind((r.kind as string | null) ?? null);
    if (!cls) continue;
    const b = bucketFor(r);
    if (!b) continue;
    if (cls === "catch") b.catches += num(r.n);
    else if (cls === "stumping") b.stumpings += num(r.n);
    else b.runOuts += num(r.n);
  }

  const ids = [...new Set([...buckets.values()].map((b) => b.participantId))];
  const names = await centralPlayerNames(ids, merges);
  return {
    buckets: [...buckets.values()],
    players: ids.map((participantId) => {
      const n = names.get(participantId);
      return {
        participantId,
        displayName: n?.displayName ?? null,
        isPrivate: n?.isPrivate === true,
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Per-match lines for the participants a club has corrected (KTD7).
//
// A correction targets one (PlayHQ match, participant GUID, field). To apply it
// the overlay needs that line's current central figures (the staleness check)
// and, so the high score and best bowling stay exact, every line of the
// participant's merge group in the affected (grade, season) bucket. Only the
// corrected participants' lines are fetched — a handful of careers — never the
// club's whole history.
// ---------------------------------------------------------------------------

/** One batting innings of a participant in a match. */
export interface CentralLineBatting {
  runs: number;
  balls: number | null;
  fours: number;
  sixes: number;
  kind: "out" | "notout" | "dnb";
}

/** One bowling spell of a participant in a match. */
export interface CentralLineBowling {
  balls: number | null;
  maidens: number | null;
  runs: number;
  wickets: number;
  wides: number;
  noBalls: number;
}

/** Everything one participant did in one senior club match. */
export interface CentralParticipantMatchLine {
  /** The participant's OWN GUID (not folded — corrections name a raw GUID). */
  participantId: string;
  matchId: number;
  playhqMatchId: string | null;
  /** App grade (senior only). */
  grade: string;
  season: number | null;
  batting: CentralLineBatting[];
  bowling: CentralLineBowling[];
  catches: number;
  stumpings: number;
  runOuts: number;
}

/**
 * Every senior club-match line for the given participants (their own GUIDs —
 * pass whole merge groups). Cached by club + the sorted participant list.
 */
export async function centralParticipantMatchLines(
  clubId: number,
  participantIds: readonly string[],
): Promise<CentralParticipantMatchLine[]> {
  const ids = [...new Set(participantIds.filter(Boolean))].sort();
  if (ids.length === 0) return [];
  return withCentralCache(cacheKey("centralParticipantMatchLines", [clubId, ids]), () =>
    centralParticipantMatchLinesImpl(clubId, ids),
  );
}

async function centralParticipantMatchLinesImpl(
  clubId: number,
  ids: string[],
): Promise<CentralParticipantMatchLine[]> {
  const senior = seniorMatchRows(await getClubMatchRows(clubId));
  const meta = new Map(
    senior.map((m) => [
      m.matchId,
      { grade: appGradeFromCentral(m.grade)!, season: parseSeasonStartYear(m.season) },
    ]),
  );
  const matchIds = [...meta.keys()];
  if (matchIds.length === 0) return [];

  const [batting, bowling, fielding] = await Promise.all([
    centralDb
      .select({
        participantId: centralMatchBattingTable.participantId,
        matchId: centralMatchBattingTable.matchId,
        runs: centralMatchBattingTable.runs,
        balls: centralMatchBattingTable.balls,
        fours: centralMatchBattingTable.fours,
        sixes: centralMatchBattingTable.sixes,
        dismissal: centralMatchBattingTable.dismissal,
        dismissalType: centralMatchBattingTable.dismissalType,
      })
      .from(centralMatchBattingTable)
      .where(
        sql`${centralMatchBattingTable.clubId} = ${clubId}
          and ${inList(centralMatchBattingTable.participantId, ids)}
          and ${inList(centralMatchBattingTable.matchId, matchIds)}`,
      )
      .orderBy(centralMatchBattingTable.id),
    centralDb
      .select({
        participantId: centralMatchBowlingTable.participantId,
        matchId: centralMatchBowlingTable.matchId,
        overs: centralMatchBowlingTable.overs,
        maidens: centralMatchBowlingTable.maidens,
        runs: centralMatchBowlingTable.runs,
        wickets: centralMatchBowlingTable.wickets,
        wides: centralMatchBowlingTable.wides,
        noBalls: centralMatchBowlingTable.noBalls,
      })
      .from(centralMatchBowlingTable)
      .where(
        sql`${centralMatchBowlingTable.clubId} = ${clubId}
          and ${inList(centralMatchBowlingTable.participantId, ids)}
          and ${inList(centralMatchBowlingTable.matchId, matchIds)}`,
      )
      .orderBy(centralMatchBowlingTable.id),
    centralDb
      .select({
        participantId: centralFieldingTable.participantId,
        matchId: centralFieldingTable.matchId,
        kind: centralFieldingTable.kind,
      })
      .from(centralFieldingTable)
      .where(
        sql`${centralFieldingTable.clubId} = ${clubId}
          and ${inList(centralFieldingTable.participantId, ids)}
          and ${inList(centralFieldingTable.matchId, matchIds)}`,
      ),
  ]);

  const lines = new Map<string, CentralParticipantMatchLine>();
  const lineFor = (pid: string | null, matchId: number | null) => {
    if (!pid || matchId === null) return null;
    const m = meta.get(matchId);
    if (!m) return null;
    const key = `${pid}\u0000${matchId}`;
    let l = lines.get(key);
    if (!l) {
      l = {
        participantId: pid,
        matchId,
        playhqMatchId: null,
        grade: m.grade,
        season: m.season,
        batting: [],
        bowling: [],
        catches: 0,
        stumpings: 0,
        runOuts: 0,
      };
      lines.set(key, l);
    }
    return l;
  };
  for (const b of batting) {
    const l = lineFor(b.participantId, b.matchId);
    if (!l) continue;
    l.batting.push({
      runs: b.runs ?? 0,
      balls: b.balls,
      fours: b.fours ?? 0,
      sixes: b.sixes ?? 0,
      kind: classifyInnings(b.dismissalType, b.dismissal),
    });
  }
  for (const b of bowling) {
    const l = lineFor(b.participantId, b.matchId);
    if (!l) continue;
    l.bowling.push({
      balls: centralOversToBalls(b.overs),
      maidens: b.maidens,
      runs: b.runs ?? 0,
      wickets: b.wickets ?? 0,
      wides: b.wides ?? 0,
      noBalls: b.noBalls ?? 0,
    });
  }
  for (const f of fielding) {
    const cls = classifyFieldingKind(f.kind);
    if (!cls) continue;
    const l = lineFor(f.participantId, f.matchId);
    if (!l) continue;
    if (cls === "catch") l.catches += 1;
    else if (cls === "stumping") l.stumpings += 1;
    else l.runOuts += 1;
  }
  if (lines.size === 0) return [];

  // The PlayHQ ids of just the matches these participants played.
  const touched = [...new Set([...lines.values()].map((l) => l.matchId))];
  const phq = await centralDb
    .select({
      matchId: centralMatchesTable.matchId,
      playhqMatchId: centralMatchesTable.playhqMatchId,
    })
    .from(centralMatchesTable)
    .where(inList(centralMatchesTable.matchId, touched));
  const phqOf = new Map(phq.map((m) => [m.matchId, m.playhqMatchId]));
  for (const l of lines.values()) l.playhqMatchId = phqOf.get(l.matchId) ?? null;
  return [...lines.values()];
}
