import { and, eq, sql, type AnyColumn } from "drizzle-orm";
import {
  centralDb,
  centralFieldingTable,
  centralMatchBattingTable,
  centralMatchBowlingTable,
  centralMatchRostersTable,
  centralPlayersTable,
} from "../central";
import { cacheKey, withCentralCache } from "./cache";
import { getClubMatchRows, type CentralClubMatchRow } from "./club-matches";
import { appGradeFromCentral, parseSeasonStartYear } from "./grades";
import { isPrivateRow } from "./privacy";
import { battingInningsKindSql, tallyFielding } from "./scoring";
import { inList } from "./where";

// ---------------------------------------------------------------------------
// Grade distribution (stats analytics KTD4). Every club player's raw aggregate
// for ONE app grade over a season span, read from the central scorecard lines.
// The API route turns these into qualifier-filtered metrics plus the club best
// per metric (percentile ranks on the profile, "% of club best" on Compare).
//
// Rules this read follows (see
// docs/solutions/architecture-patterns/central-read-player-identity-crosswalk.md):
//   - Aggregated by participant GUID, never by display name. NULL/empty
//     participant lines are excluded.
//   - Rows carry the GUID, not an app player id. The route resolves the id
//     through the tenant's `player_id_map` crosswalk.
//   - Grade labels map through classifyCentralGrade, so WA labels ("1st Grade",
//     "Men's First Grade") roll up to one app grade. Junior/pathway labels map
//     to null and so never match a senior grade (juniors isolation).
//   - Private participants are OMITTED (public-facing aggregate; privacy.ts).
//   - Counting stats follow centralPlayerSeasons exactly (games = roster ∪
//     batting ∪ bowling lines, "did not bat" is not an innings), so a span's
//     totals equal the sum of that player's /players/:id/seasons rows.
//   - Central `overs` are decimal cricket notation (7.3 = 7 overs 3 balls).
//     They are converted to balls (6 per over) before any rate is derived.
// ---------------------------------------------------------------------------

/** Season span in the app's integer start-year form (2024 = "2024/25"). */
export interface GradeDistributionSpan {
  /** Inclusive first season, or undefined for no lower bound. */
  fromSeason?: number;
  /** Inclusive last season, or undefined for no upper bound. */
  toSeason?: number;
}

/** One participant's raw aggregate for the grade and span. */
export interface CentralGradeDistributionRow {
  participantId: string;
  displayName: string | null;
  games: number;
  innings: number;
  notOuts: number;
  runs: number;
  highScore: number | null;
  fifties: number;
  hundreds: number;
  /** Balls faced over innings with a recorded ball count (null when none). */
  ballsFaced: number | null;
  /** Runs scored in those same innings, the strike-rate numerator. */
  runsOffBallsFaced: number | null;
  wickets: number;
  runsConceded: number;
  fiveWickets: number;
  /** Balls bowled over spells with recorded overs (null when none). */
  ballsBowled: number | null;
  /** Runs conceded in those same spells, the economy numerator. */
  runsOffBallsBowled: number | null;
  maidens: number;
  catches: number;
}

/**
 * Decimal overs → balls: 7.3 → 45. The fractional digit is the ball count, not
 * a tenth of an over. Rounded because double-precision storage turns 7.3 into
 * 7.29999…. Mirrors the SQL in {@link centralGradeDistribution}.
 */
export function decimalOversToBalls(overs: number | null | undefined): number | null {
  if (overs == null || !Number.isFinite(overs) || overs < 0) return null;
  const whole = Math.floor(overs);
  return whole * 6 + Math.round((overs - whole) * 10);
}

/**
 * The club's central match ids in the app grade and span. Pure, so the grade
 * and span rules are unit-testable without a database:
 *   - the label must map to `appGrade` (junior labels map to null, so never);
 *   - with no bounds every mapped match counts (career, like the leaderboard);
 *   - with a bound, a match whose season text doesn't parse is excluded.
 */
export function gradeDistributionMatchIds(
  matchRows: readonly CentralClubMatchRow[],
  appGrade: string,
  span: GradeDistributionSpan,
): number[] {
  const bounded = span.fromSeason !== undefined || span.toSeason !== undefined;
  const ids: number[] = [];
  for (const m of matchRows) {
    if (appGradeFromCentral(m.grade) !== appGrade) continue;
    if (bounded) {
      const season = parseSeasonStartYear(m.season);
      if (season === null) continue;
      if (span.fromSeason !== undefined && season < span.fromSeason) continue;
      if (span.toSeason !== undefined && season > span.toSeason) continue;
    }
    ids.push(m.matchId);
  }
  return ids;
}

/**
 * Raw per-participant aggregates for one app grade over a span, for a tenant
 * club. `clubId` is required — never defaulted, so an omitted club is a
 * compile error rather than a read of another club's data.
 */
export async function centralGradeDistribution(
  appGrade: string,
  opts: { clubId: number } & GradeDistributionSpan,
): Promise<CentralGradeDistributionRow[]> {
  const { clubId, fromSeason, toSeason } = opts;
  return withCentralCache(
    cacheKey("centralGradeDistribution", [appGrade, clubId, fromSeason, toSeason]),
    () => centralGradeDistributionImpl(appGrade, clubId, { fromSeason, toSeason }),
  );
}

async function centralGradeDistributionImpl(
  appGrade: string,
  clubId: number,
  span: GradeDistributionSpan,
): Promise<CentralGradeDistributionRow[]> {
  const matchIds = gradeDistributionMatchIds(await getClubMatchRows(clubId), appGrade, span);
  if (matchIds.length === 0) return [];

  const b = centralMatchBattingTable;
  const w = centralMatchBowlingTable;
  const r = centralMatchRostersTable;
  const hasParticipant = (col: AnyColumn) => sql`${col} is not null and ${col} <> ''`;

  const [result, fieldingRows] = await Promise.all([
    centralDb.execute(sql`
    with bat_lines as (
      select
        ${b.participantId} as participant_id,
        coalesce(${b.runs}, 0) as runs,
        ${b.balls} as balls,
        ${battingInningsKindSql} as kind
      from ${b}
      where ${b.clubId} = ${clubId}
        and ${inList(b.matchId, matchIds)}
        and ${hasParticipant(b.participantId)}
    ),
    bat as (
      select
        participant_id,
        (count(*) filter (where kind <> 'dnb'))::int as innings,
        coalesce(sum(runs) filter (where kind <> 'dnb'), 0)::int as runs,
        (count(*) filter (where kind = 'notout'))::int as not_outs,
        (count(*) filter (where kind <> 'dnb' and runs >= 100))::int as hundreds,
        (count(*) filter (where kind <> 'dnb' and runs >= 50 and runs < 100))::int as fifties,
        (max(runs) filter (where kind <> 'dnb'))::int as high_score,
        (sum(balls) filter (where kind <> 'dnb' and balls is not null))::int as balls_faced,
        (sum(runs) filter (where kind <> 'dnb' and balls is not null))::int as runs_off_balls_faced
      from bat_lines
      group by participant_id
    ),
    bowl_lines as (
      select
        ${w.participantId} as participant_id,
        coalesce(${w.wickets}, 0) as wickets,
        coalesce(${w.runs}, 0) as runs,
        coalesce(${w.maidens}, 0) as maidens,
        case
          when ${w.overs} is null or ${w.overs} < 0 then null
          else (floor(${w.overs}) * 6 + round((${w.overs} - floor(${w.overs})) * 10))::int
        end as balls
      from ${w}
      where ${w.clubId} = ${clubId}
        and ${inList(w.matchId, matchIds)}
        and ${hasParticipant(w.participantId)}
    ),
    bowl as (
      select
        participant_id,
        sum(wickets)::int as wickets,
        sum(runs)::int as runs_conceded,
        (count(*) filter (where wickets >= 5))::int as five_wickets,
        (sum(balls) filter (where balls is not null))::int as balls_bowled,
        (sum(runs) filter (where balls is not null))::int as runs_off_balls_bowled,
        sum(maidens)::int as maidens
      from bowl_lines
      group by participant_id
    ),
    games as (
      select participant_id, count(distinct match_id)::int as games
      from (
        select ${b.participantId} as participant_id, ${b.matchId} as match_id from ${b}
        where ${b.clubId} = ${clubId} and ${inList(b.matchId, matchIds)}
          and ${hasParticipant(b.participantId)}
        union
        select ${w.participantId}, ${w.matchId} from ${w}
        where ${w.clubId} = ${clubId} and ${inList(w.matchId, matchIds)}
          and ${hasParticipant(w.participantId)}
        union
        select ${r.participantId}, ${r.matchId} from ${r}
        where ${r.clubId} = ${clubId} and ${inList(r.matchId, matchIds)}
          and ${hasParticipant(r.participantId)}
      ) apps
      group by participant_id
    )
    select
      g.participant_id as "participantId",
      g.games,
      coalesce(bat.innings, 0) as innings,
      coalesce(bat.not_outs, 0) as "notOuts",
      coalesce(bat.runs, 0) as runs,
      bat.high_score as "highScore",
      coalesce(bat.fifties, 0) as fifties,
      coalesce(bat.hundreds, 0) as hundreds,
      bat.balls_faced as "ballsFaced",
      bat.runs_off_balls_faced as "runsOffBallsFaced",
      coalesce(bowl.wickets, 0) as wickets,
      coalesce(bowl.runs_conceded, 0) as "runsConceded",
      coalesce(bowl.five_wickets, 0) as "fiveWickets",
      bowl.balls_bowled as "ballsBowled",
      bowl.runs_off_balls_bowled as "runsOffBallsBowled",
      coalesce(bowl.maidens, 0) as maidens,
      p.display_name as "displayName",
      p.is_private as "isPrivate"
    from games g
    left join bat on bat.participant_id = g.participant_id
    left join bowl on bowl.participant_id = g.participant_id
    left join ${centralPlayersTable} p on p.participant_id = g.participant_id
  `),
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

  const fieldingByPid = tallyFielding(fieldingRows);
  const num = (v: unknown): number => Number(v ?? 0);
  const numOrNull = (v: unknown): number | null => (v == null ? null : Number(v));
  const rows = result.rows as Array<Record<string, unknown>>;

  return rows
    .filter((row) => !isPrivateRow({ isPrivate: numOrNull(row.isPrivate) }))
    .map((row) => {
      const participantId = String(row.participantId);
      return {
        participantId,
        displayName: (row.displayName as string | null) ?? null,
        games: num(row.games),
        innings: num(row.innings),
        notOuts: num(row.notOuts),
        runs: num(row.runs),
        highScore: numOrNull(row.highScore),
        fifties: num(row.fifties),
        hundreds: num(row.hundreds),
        ballsFaced: numOrNull(row.ballsFaced),
        runsOffBallsFaced: numOrNull(row.runsOffBallsFaced),
        wickets: num(row.wickets),
        runsConceded: num(row.runsConceded),
        fiveWickets: num(row.fiveWickets),
        ballsBowled: numOrNull(row.ballsBowled),
        runsOffBallsBowled: numOrNull(row.runsOffBallsBowled),
        maidens: num(row.maidens),
        catches: fieldingByPid.get(participantId)?.catches ?? 0,
      };
    });
}
