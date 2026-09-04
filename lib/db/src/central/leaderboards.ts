import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  centralDb,
  centralMatchBattingTable,
  centralMatchBowlingTable,
  centralMatchRostersTable,
  centralFieldingTable,
  centralPlayersTable,
} from "../central";
import type { PlayerGradeStat } from "../schema";
import { cacheKey, withCentralCache } from "./cache";
import { getClubMatchRows } from "./club-matches";
import { appGradeFromCentral, centralSeasonMatchesStartYear, parseSeasonStartYear } from "./grades";
import { isPrivateRow } from "./privacy";
import { battingInningsKindSql, round2, splitDisplayName, tallyFielding } from "./scoring";
import { inList } from "./where";

/**
 * Central-read grade batting leaderboard. Rebuilds the per-(player, grade) career
 * batting aggregate the endpoint normally serves from the tenant
 * `player_grade_stats` table, instead reading the shared central PCA database:
 * `central.match_batting` for figures, `central.matches` to scope by club +
 * grade. Output keeps the exact `PlayerGradeStat` shape so the API contract is
 * unchanged.
 *
 * Scope / known limitations (the EXPECTED, explainable differences the comparison
 * script surfaces — see scripts/src/compare-central-leaderboard.ts):
 *   - Central data is scorecard-era only (2002/03+). The tenant numbers fold in
 *     hand-kept pre-2002 history and curated corrections, so career totals differ.
 *   - This is the BATTING leaderboard: bowling/fielding columns are left null
 *     (not derived from central here).
 *   - `playerId` can't be filled — central identifies players by PlayHQ
 *     `participant_id` (GUID); the int crosswalk (`player_id_map`) is a later
 *     step. It's set to 0; consumers key on name for now.
 *   - Seniors only — the central read never touches junior data.
 *   - Central data carries no fill-ins, so there is no `playerId >= 90000` floor
 *     to apply (that convention is tenant-only).
 */

/**
 * Career (or, when `seasonStartYear` is given, single-season) batting leaderboard
 * for a tenant club, read entirely from the central PCA database. Rows are sorted
 * games-desc to mirror the tenant endpoint.
 */
export async function centralGradeLeaderboard(
  appGrade: string,
  opts: {
    /**
     * REQUIRED tenant club filter. Never defaulted — an omitted club id must be
     * a compile error, not a silent read of another club's data.
     */
    clubId: number;
    seasonStartYear?: number;
    /**
     * Tenant crosswalk (central participant GUID -> app player id). When
     * supplied, each row's `playerId` is resolved so leaderboard players are
     * clickable and correctly separated. Built and passed by the route (the
     * crosswalk lives in the tenant DB, not central). Absent -> `playerId` 0.
     */
    intByGuid?: Map<string, number>;
    /**
     * Tenant rename overrides (GUID -> display name). Applied over the central
     * "Initial Surname" so a club's curated names show on its leaderboard.
     */
    nameByGuid?: Map<string, string>;
  },
): Promise<PlayerGradeStat[]> {
  const clubId = opts.clubId;
  return withCentralCache(cacheKey("centralGradeLeaderboard", [appGrade, clubId, opts]), () =>
    centralGradeLeaderboardImpl(appGrade, clubId, opts),
  );
}

async function centralGradeLeaderboardImpl(
  appGrade: string,
  clubId: number,
  opts: {
    seasonStartYear?: number;
    intByGuid?: Map<string, number>;
    nameByGuid?: Map<string, string>;
  },
): Promise<PlayerGradeStat[]> {
  // 1. Central matches involving this club, narrowed to the requested app grade
  //    (and optionally a single season). Grade mapping is per-label, so resolve
  //    it in JS rather than SQL.
  const matchRows = await getClubMatchRows(clubId);

  const matchIds = matchRows
    .filter((m) => appGradeFromCentral(m.grade) === appGrade)
    .filter(
      (m) =>
        opts.seasonStartYear === undefined ||
        centralSeasonMatchesStartYear(m.season, opts.seasonStartYear),
    )
    .map((m) => m.matchId);

  if (matchIds.length === 0) return [];

  // 2. One SQL round trip replaces the old fetch-every-line-and-aggregate-in-JS
  //    approach (index-backed by (club_id, match_id) on match_batting/rosters):
  //      - `i`     classifies each of the club's batting lines exactly like
  //                classifyInnings() (see battingInningsKindSql);
  //      - `bat`   is the per-participant GROUP BY (innings excludes DNB,
  //                fifties are 50..99, hundreds 100+, matching the JS
  //                if/else-if);
  //      - hs_enc  encodes high-score-with-not-out-flag as runs*2 + notOut so a
  //                single max() picks the top score AND whether any innings of
  //                that score was not out (ties prefer the not-out, exactly
  //                like the old runs===highScore && notout promotion);
  //      - `games` counts distinct matches from batting lines (DNB included)
  //                unioned with roster lines, restricted to players who have a
  //                batting line — the same Set union the JS built;
  //      - names + privacy left-join central.players (was a 2nd round trip).
  // Fielding dismissals (catches/stumpings/run-outs) run in parallel with the
  // batting aggregate — they're keyed on the same (club, match) index and only
  // attach to players who already have a leaderboard row.
  const [result, fieldingRows] = await Promise.all([
    centralDb.execute(sql`
    with i as (
      select
        ${centralMatchBattingTable.participantId} as participant_id,
        ${centralMatchBattingTable.matchId} as match_id,
        coalesce(${centralMatchBattingTable.runs}, 0) as runs,
        ${battingInningsKindSql} as kind
      from ${centralMatchBattingTable}
      where ${centralMatchBattingTable.clubId} = ${clubId}
        and ${inList(centralMatchBattingTable.matchId, matchIds)}
        and ${centralMatchBattingTable.participantId} is not null
        and ${centralMatchBattingTable.participantId} <> ''
    ),
    bat as (
      select
        participant_id,
        (count(*) filter (where kind <> 'dnb'))::int as innings,
        coalesce(sum(runs) filter (where kind <> 'dnb'), 0)::int as runs,
        (count(*) filter (where kind = 'notout'))::int as not_outs,
        (count(*) filter (where kind <> 'dnb' and runs >= 100))::int as hundreds,
        (count(*) filter (where kind <> 'dnb' and runs >= 50 and runs < 100))::int as fifties,
        max(case when kind <> 'dnb' then runs * 2 + (kind = 'notout')::int end) as hs_enc
      from i
      group by participant_id
    ),
    games as (
      select participant_id, count(distinct match_id)::int as games
      from (
        select participant_id, match_id from i
        union
        select ${centralMatchRostersTable.participantId}, ${centralMatchRostersTable.matchId}
        from ${centralMatchRostersTable}
        where ${centralMatchRostersTable.clubId} = ${clubId}
          and ${inList(centralMatchRostersTable.matchId, matchIds)}
          and ${centralMatchRostersTable.participantId} in (select participant_id from bat)
      ) apps
      group by participant_id
    )
    select
      b.participant_id as "participantId",
      b.innings,
      b.runs,
      b.not_outs as "notOuts",
      b.hundreds,
      b.fifties,
      coalesce(b.hs_enc, 0)::int as "hsEnc",
      g.games,
      p.display_name as "displayName",
      p.is_private as "isPrivate"
    from bat b
    join games g on g.participant_id = b.participant_id
    left join ${centralPlayersTable} p on p.participant_id = b.participant_id
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
  const aggRows = result.rows as Array<{
    participantId: string;
    innings: number;
    runs: number;
    notOuts: number;
    hundreds: number;
    fifties: number;
    hsEnc: number;
    games: number;
    displayName: string | null;
    isPrivate: number | null;
  }>;
  if (aggRows.length === 0) return [];

  // 3. Project to the PlayerGradeStat shape the endpoint contract requires.
  const rows: PlayerGradeStat[] = aggRows.map((r) => {
    const participantId = r.participantId;
    const innings = Number(r.innings);
    const runs = Number(r.runs);
    const notOuts = Number(r.notOuts);
    const hsEnc = Number(r.hsEnc);
    const highScore = hsEnc >> 1;
    const highScoreNotOut = (hsEnc & 1) === 1;
    const isPrivate = isPrivateRow(r);
    const name = isPrivate
      ? { givenName: "Private", surname: "Player" }
      : splitDisplayName(opts.nameByGuid?.get(participantId) ?? r.displayName ?? participantId);
    const dismissals = innings - notOuts;
    const resolvedPlayerId = opts.intByGuid?.get(participantId) ?? 0;
    const fld = fieldingByPid.get(participantId);
    return {
      // Central has no per-grade-stat row id; use the resolved player id so the
      // client's React key (stat.id) stays distinct per row and the player link
      // (stat.playerId) resolves.
      id: resolvedPlayerId,
      playerId: resolvedPlayerId,
      surname: name.surname,
      givenName: name.givenName,
      grade: appGrade,
      season: null,
      games: Number(r.games),
      innings,
      notOuts,
      runs,
      batAvg: dismissals > 0 ? round2(runs / dismissals) : null,
      highScore: innings === 0 ? null : `${highScore}${highScoreNotOut ? "*" : ""}`,
      fifties: Number(r.fifties),
      hundreds: Number(r.hundreds),
      wickets: null,
      runsConceded: null,
      bowlAvg: null,
      bestBowling: null,
      fiveWickets: null,
      catches: fld?.catches ?? 0,
      stumpings: fld?.stumpings ?? 0,
      runOuts: fld?.runOuts ?? 0,
    };
  });

  // Mirror the tenant endpoint's ordering (games desc); tie-break for stable
  // output across runs/environments.
  rows.sort(
    (x, y) =>
      (y.games ?? 0) - (x.games ?? 0) ||
      (y.runs ?? 0) - (x.runs ?? 0) ||
      x.surname.localeCompare(y.surname),
  );
  return rows;
}

/** A season's top run-scorers / wicket-takers for a club, from central (top 5,
 *  private players excluded). Keyed by participant GUID; route maps to int id.
 *  Optional `appGrade` narrows to matches whose central grade maps to it. */
export async function centralSeasonLeaders(
  clubId: number,
  season: number,
  metric: "runs" | "wickets",
  appGrade?: string,
): Promise<{ participantId: string; displayName: string | null; value: number }[]> {
  return withCentralCache(
    cacheKey("centralSeasonLeaders", [clubId, season, metric, appGrade]),
    () => centralLeadersImpl(clubId, metric, { season, appGrade }),
  );
}

/** All-time (career) top run-scorers / wicket-takers for a club, from central
 *  (top 5, private players excluded). Optional `appGrade` filter as above. */
export async function centralAllTimeLeaders(
  clubId: number,
  metric: "runs" | "wickets",
  appGrade?: string,
): Promise<{ participantId: string; displayName: string | null; value: number }[]> {
  return withCentralCache(cacheKey("centralAllTimeLeaders", [clubId, metric, appGrade]), () =>
    centralLeadersImpl(clubId, metric, { appGrade }),
  );
}

async function centralLeadersImpl(
  clubId: number,
  metric: "runs" | "wickets",
  opts: { season?: number; appGrade?: string },
): Promise<{ participantId: string; displayName: string | null; value: number }[]> {
  const matchRows = await getClubMatchRows(clubId);
  const matchIds = matchRows
    .filter((m) => opts.season === undefined || parseSeasonStartYear(m.season) === opts.season)
    .filter((m) => opts.appGrade === undefined || appGradeFromCentral(m.grade) === opts.appGrade)
    .map((m) => m.matchId);
  if (matchIds.length === 0) return [];

  const agg =
    metric === "runs"
      ? await centralDb
          .select({
            participantId: centralMatchBattingTable.participantId,
            value: sql<number>`coalesce(sum(${centralMatchBattingTable.runs}), 0)`,
          })
          .from(centralMatchBattingTable)
          .where(
            and(
              eq(centralMatchBattingTable.clubId, clubId),
              inList(centralMatchBattingTable.matchId, matchIds),
            ),
          )
          .groupBy(centralMatchBattingTable.participantId)
          .orderBy(desc(sql`coalesce(sum(${centralMatchBattingTable.runs}), 0)`))
          .limit(25)
      : await centralDb
          .select({
            participantId: centralMatchBowlingTable.participantId,
            value: sql<number>`coalesce(sum(${centralMatchBowlingTable.wickets}), 0)`,
          })
          .from(centralMatchBowlingTable)
          .where(
            and(
              eq(centralMatchBowlingTable.clubId, clubId),
              inList(centralMatchBowlingTable.matchId, matchIds),
            ),
          )
          .groupBy(centralMatchBowlingTable.participantId)
          .orderBy(desc(sql`coalesce(sum(${centralMatchBowlingTable.wickets}), 0)`))
          .limit(25);

  const ids = agg.map((a) => a.participantId).filter((p): p is string => Boolean(p));
  if (ids.length === 0) return [];
  const players = await centralDb
    .select({
      participantId: centralPlayersTable.participantId,
      displayName: centralPlayersTable.displayName,
      isPrivate: centralPlayersTable.isPrivate,
    })
    .from(centralPlayersTable)
    // The top-25 candidates — small by construction.
    .where(inArray(centralPlayersTable.participantId, ids));
  const byId = new Map(players.map((p) => [p.participantId, p]));

  const out: { participantId: string; displayName: string | null; value: number }[] = [];
  for (const a of agg) {
    if (!a.participantId) continue;
    const p = byId.get(a.participantId);
    if (isPrivateRow(p)) continue; // private excluded from leaderboards
    const value = Number(a.value ?? 0);
    if (value <= 0) continue;
    out.push({ participantId: a.participantId, displayName: p?.displayName ?? null, value });
    if (out.length >= 5) break;
  }
  return out;
}

/** A grade's season leaders for the Club Runs/Wickets leaderboard card
 *  (A19/A20). Each of `topRunScorer` / `topWicketTaker` is one card row
 *  ({gradeLabel, playerName, value}); the card picks the category. */
export interface CentralClubSeasonGradeLeaders {
  gradeLabel: string;
  topRunScorer: { playerName: string; value: number } | null;
  topWicketTaker: { playerName: string; value: number } | null;
}

/**
 * Season-scoped, per-grade version of {@link centralClubTotals} for the Club
 * Leaderboard card (A19/A20). For each senior grade the club fielded in the
 * season it returns the top run scorer and top wicket taker (name + value), so
 * the card can render its four rows for either category.
 *
 * Seniors-only by construction: junior grades never exist in central data and
 * `appGradeFromCentral` returns null for anything it can't map, so junior
 * grades are excluded from this senior prefill (R20).
 *
 * Fill-in exclusion (`playerId >= 90000`) is inherited from upstream: central
 * identifies players by PlayHQ GUID (no int fill-in sentinel exists), and the
 * batting/bowling reads already drop null/empty participant ids — so there is
 * no fill-in floor to apply here, and none is silently introduced. Private
 * players are excluded from the leader picks (same rule as the leaderboards).
 */
export async function centralClubTotalsBySeason(
  clubId: number,
  season: number,
): Promise<CentralClubSeasonGradeLeaders[]> {
  return withCentralCache(cacheKey("centralClubTotalsBySeason", [clubId, season]), () =>
    centralClubTotalsBySeasonImpl(clubId, season),
  );
}

async function centralClubTotalsBySeasonImpl(
  clubId: number,
  season: number,
): Promise<CentralClubSeasonGradeLeaders[]> {
  const matchRows = await getClubMatchRows(clubId);
  const gradeMatchIds = new Map<string, number[]>();
  for (const m of matchRows) {
    if (parseSeasonStartYear(m.season) !== season) continue;
    const g = appGradeFromCentral(m.grade);
    if (!g) continue; // unmapped / junior grades never contribute (R20)
    const arr = gradeMatchIds.get(g);
    if (arr) arr.push(m.matchId);
    else gradeMatchIds.set(g, [m.matchId]);
  }
  if (gradeMatchIds.size === 0) return [];

  const grades = [...gradeMatchIds.keys()].sort((a, b) => a.localeCompare(b));

  // Per grade: a few top run scorers + wicket takers, so a private top scorer
  // can be skipped (mirrors centralLeadersImpl's top-N-then-filter).
  const perGrade = await Promise.all(
    grades.map(async (grade) => {
      const ids = gradeMatchIds.get(grade) ?? [];
      const [batAgg, bowlAgg] = await Promise.all([
        centralDb
          .select({
            participantId: centralMatchBattingTable.participantId,
            value: sql<number>`coalesce(sum(${centralMatchBattingTable.runs}), 0)`,
          })
          .from(centralMatchBattingTable)
          .where(
            and(
              eq(centralMatchBattingTable.clubId, clubId),
              inList(centralMatchBattingTable.matchId, ids),
            ),
          )
          .groupBy(centralMatchBattingTable.participantId)
          .orderBy(desc(sql`coalesce(sum(${centralMatchBattingTable.runs}), 0)`))
          .limit(5),
        centralDb
          .select({
            participantId: centralMatchBowlingTable.participantId,
            value: sql<number>`coalesce(sum(${centralMatchBowlingTable.wickets}), 0)`,
          })
          .from(centralMatchBowlingTable)
          .where(
            and(
              eq(centralMatchBowlingTable.clubId, clubId),
              inList(centralMatchBowlingTable.matchId, ids),
            ),
          )
          .groupBy(centralMatchBowlingTable.participantId)
          .orderBy(desc(sql`coalesce(sum(${centralMatchBowlingTable.wickets}), 0)`))
          .limit(5),
      ]);
      return { grade, batAgg, bowlAgg };
    }),
  );

  // One round trip resolves display names + privacy for every candidate.
  const ids = new Set<string>();
  for (const g of perGrade) {
    for (const r of g.batAgg) if (r.participantId) ids.add(r.participantId);
    for (const r of g.bowlAgg) if (r.participantId) ids.add(r.participantId);
  }
  const players = ids.size
    ? await centralDb
        .select({
          participantId: centralPlayersTable.participantId,
          displayName: centralPlayersTable.displayName,
          isPrivate: centralPlayersTable.isPrivate,
        })
        .from(centralPlayersTable)
        // ≤10 candidates per grade — small by construction.
        .where(inArray(centralPlayersTable.participantId, [...ids]))
    : [];
  const byId = new Map(players.map((p) => [p.participantId, p]));

  const pick = (
    agg: { participantId: string | null; value: number }[],
  ): { playerName: string; value: number } | null => {
    for (const a of agg) {
      if (!a.participantId) continue;
      const p = byId.get(a.participantId);
      if (isPrivateRow(p)) continue; // private excluded
      const value = Number(a.value ?? 0);
      if (value <= 0) continue;
      const name = p?.displayName?.trim();
      return { playerName: name && name.length ? name : a.participantId, value };
    }
    return null;
  };

  return perGrade.map((g) => ({
    gradeLabel: g.grade,
    topRunScorer: pick(g.batAgg),
    topWicketTaker: pick(g.bowlAgg),
  }));
}
