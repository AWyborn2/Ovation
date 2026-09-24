import { eq, sql, type SQL } from "drizzle-orm";
import type { z } from "zod";
import { db, playerIdMapTable } from "@workspace/db";
import { FILL_IN_THRESHOLD, ballsToOvers } from "@workspace/scorecard";
import type { GetGradeDistributionResponse } from "@workspace/api-zod";
import type { DataSource } from "./tenant";
import { resolveCuration } from "./central-curation";

/**
 * Grade distribution (stats analytics KTD4): every qualifying club player's
 * aggregates for one grade and season span, plus the club best per metric.
 * Served by `GET /grades/:grade/distribution`; the web computes percentile
 * ranks and the Compare radar's "% of club best" from it.
 *
 * Both read paths produce the same {@link DistributionRawRow} (raw counts and
 * ball totals keyed by app player id), then {@link buildGradeDistribution}
 * applies the qualifier and derives every rate the same way. Rates always
 * divide by BALLS: overs are converted to balls (6 per over) first, never
 * divided as decimals.
 *
 *   - Native: counting stats from `player_grade_season_stats` (a career span
 *     includes the pre-scorecard baseline rows, season = null); balls faced,
 *     balls bowled and maidens from `match_player_lines` joined to `matches`
 *     over the same grade and span. Fill-ins are excluded in SQL.
 *   - Central: raw per-GUID aggregates from `centralGradeDistribution` (junior
 *     labels never map to a senior grade); the GUID is resolved to the app id
 *     through the tenant's `player_id_map` HERE, in the route layer, and a
 *     GUID with no crosswalk row is dropped rather than returned as id 0.
 */

export const DEFAULT_MIN_INNINGS = 10;
export const DEFAULT_MIN_OVERS = 100;
/**
 * A batting strike rate needs this many recorded balls faced to count, so a
 * few innings with ball counts can't produce a club "best" of 500+.
 */
export const MIN_STRIKE_RATE_BALLS = 120;

export interface DistributionOptions {
  fromSeason?: number;
  toSeason?: number;
  minInnings: number;
  minOvers: number;
}

/** One player's raw aggregate for the grade and span, before qualification. */
export interface DistributionRawRow {
  playerId: number;
  givenName: string;
  surname: string;
  games: number;
  innings: number;
  notOuts: number;
  runs: number;
  highScore: number | null;
  fifties: number;
  hundreds: number;
  wickets: number;
  runsConceded: number;
  fiveWickets: number;
  catches: number;
  /** Scorecard balls faced over innings with a ball count (null when none). */
  ballsFaced: number | null;
  /** Runs from those same innings (strike-rate numerator). */
  runsOffBallsFaced: number | null;
  /** Scorecard balls bowled (null when no spell had recorded overs). */
  ballsBowled: number | null;
  /** Runs conceded in those same spells (economy numerator). */
  runsOffBallsBowled: number | null;
  /** Wickets taken in those same spells (bowling strike-rate denominator). */
  wicketsOffBallsBowled?: number | null;
  maidens: number | null;
}

export type GradeDistribution = z.infer<typeof GetGradeDistributionResponse>;
type Best = GradeDistribution["best"];
type Player = GradeDistribution["players"][number];

const round2 = (n: number): number => Math.round(n * 100) / 100;

function maxOf(values: (number | null | undefined)[]): number | null {
  let out: number | null = null;
  for (const v of values) if (v != null && (out === null || v > out)) out = v;
  return out;
}

function minOf(values: (number | null | undefined)[]): number | null {
  let out: number | null = null;
  for (const v of values) if (v != null && (out === null || v < out)) out = v;
  return out;
}

/**
 * Qualify and shape raw rows. Pure, so the qualifier / fill-in / "best"
 * rules are unit-tested without a database.
 *   - Fill-ins (id >= FILL_IN_THRESHOLD) and unresolved ids (<= 0) never appear.
 *   - Batting qualifies at `innings >= minInnings` (and at least one innings);
 *     bowling at `ballsBowled >= minOvers * 6` (and at least one ball). A
 *     player who qualifies for neither is dropped; for one, the other is null.
 *   - Best: the maximum per metric, except bowling average, economy and
 *     bowling strike rate, where lower is better and the minimum wins.
 */
export function buildGradeDistribution(
  grade: string,
  rows: readonly DistributionRawRow[],
  opts: DistributionOptions,
): GradeDistribution {
  const minBalls = opts.minOvers * 6;
  const players: Player[] = [];

  for (const r of rows) {
    if (!(r.playerId > 0) || r.playerId >= FILL_IN_THRESHOLD) continue;

    const battingQualifies = r.innings > 0 && r.innings >= opts.minInnings;
    const balls = r.ballsBowled ?? 0;
    const bowlingQualifies = balls > 0 && balls >= minBalls;
    if (!battingQualifies && !bowlingQualifies) continue;

    const dismissals = r.innings - r.notOuts;
    const batting: Player["batting"] = battingQualifies
      ? {
          innings: r.innings,
          notOuts: r.notOuts,
          runs: r.runs,
          average: dismissals > 0 ? round2(r.runs / dismissals) : null,
          highScore: r.highScore,
          fifties: r.fifties,
          hundreds: r.hundreds,
          ballsFaced: r.ballsFaced,
          strikeRate:
            r.ballsFaced != null &&
            r.ballsFaced >= MIN_STRIKE_RATE_BALLS &&
            r.runsOffBallsFaced != null
              ? round2((r.runsOffBallsFaced / r.ballsFaced) * 100)
              : null,
        }
      : null;

    const bowling: Player["bowling"] = bowlingQualifies
      ? {
          overs: ballsToOvers(balls),
          ballsBowled: balls,
          maidens: r.maidens ?? 0,
          wickets: r.wickets,
          runsConceded: r.runsConceded,
          average: r.wickets > 0 ? round2(r.runsConceded / r.wickets) : null,
          economy: r.runsOffBallsBowled != null ? round2((r.runsOffBallsBowled / balls) * 6) : null,
          // Balls and wickets from the same spells: career wickets over
          // scorecard-era balls would understate it badly.
          strikeRate: (() => {
            const w = r.wicketsOffBallsBowled ?? r.wickets;
            return w > 0 ? round2(balls / w) : null;
          })(),
          fiveWickets: r.fiveWickets,
        }
      : null;

    players.push({
      playerId: r.playerId,
      givenName: r.givenName,
      surname: r.surname,
      games: r.games,
      catches: r.catches,
      batting,
      bowling,
    });
  }

  players.sort(
    (a, b) => b.games - a.games || a.surname.localeCompare(b.surname) || a.playerId - b.playerId,
  );

  const bat = players.map((p) => p.batting).filter((b) => b !== null);
  const bowl = players.map((p) => p.bowling).filter((b) => b !== null);
  const best: Best = {
    games: maxOf(players.map((p) => p.games)),
    catches: maxOf(players.map((p) => p.catches)),
    runs: maxOf(bat.map((b) => b.runs)),
    battingAverage: maxOf(bat.map((b) => b.average)),
    highScore: maxOf(bat.map((b) => b.highScore)),
    fifties: maxOf(bat.map((b) => b.fifties)),
    hundreds: maxOf(bat.map((b) => b.hundreds)),
    battingStrikeRate: maxOf(bat.map((b) => b.strikeRate)),
    wickets: maxOf(bowl.map((b) => b.wickets)),
    maidens: maxOf(bowl.map((b) => b.maidens)),
    fiveWickets: maxOf(bowl.map((b) => b.fiveWickets)),
    bowlingAverage: minOf(bowl.map((b) => b.average)),
    economy: minOf(bowl.map((b) => b.economy)),
    bowlingStrikeRate: minOf(bowl.map((b) => b.strikeRate)),
  };

  return {
    grade,
    fromSeason: opts.fromSeason ?? null,
    toSeason: opts.toSeason ?? null,
    minInnings: opts.minInnings,
    minOvers: opts.minOvers,
    players,
    best,
  };
}

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

const isBounded = (o: DistributionOptions): boolean =>
  o.fromSeason !== undefined || o.toSeason !== undefined;

/** `<col> between from and to`, with either bound optional; `true` for career. */
function spanSql(column: SQL, o: DistributionOptions): SQL {
  if (!isBounded(o)) return sql`true`;
  const parts = [sql`${column} is not null`];
  if (o.fromSeason !== undefined) parts.push(sql`${column} >= ${o.fromSeason}`);
  if (o.toSeason !== undefined) parts.push(sql`${column} <= ${o.toSeason}`);
  return sql.join(parts, sql` and `);
}

const n = (v: unknown): number => Number(v ?? 0);
const nOrNull = (v: unknown): number | null => (v == null ? null : Number(v));

/**
 * Native (tenant DB) raw rows. Counting stats from the season snapshot; the
 * ball-based figures from the per-match lines. Native `overs` is ball-notation
 * text ("10.3" = 63 balls), converted in SQL exactly like `oversToBalls` in
 * @workspace/scorecard; malformed text counts as unknown, not as zero.
 */
export async function loadNativeDistributionRows(
  grade: string,
  o: DistributionOptions,
): Promise<DistributionRawRow[]> {
  const seasonRows = await db.execute(sql`
    SELECT
      s.player_id AS "playerId",
      p.given_name AS "givenName",
      p.surname AS surname,
      COALESCE(SUM(s.games), 0)::int AS games,
      COALESCE(SUM(s.innings), 0)::int AS innings,
      COALESCE(SUM(s.not_outs), 0)::int AS "notOuts",
      COALESCE(SUM(s.runs), 0)::int AS runs,
      MAX(NULLIF(regexp_replace(COALESCE(s.high_score, ''), '[^0-9]', '', 'g'), '')::int)
        AS "highScore",
      COALESCE(SUM(s.fifties), 0)::int AS fifties,
      COALESCE(SUM(s.hundreds), 0)::int AS hundreds,
      COALESCE(SUM(s.wickets), 0)::int AS wickets,
      COALESCE(SUM(s.runs_conceded), 0)::int AS "runsConceded",
      COALESCE(SUM(s.five_wickets), 0)::int AS "fiveWickets",
      COALESCE(SUM(s.catches), 0)::int AS catches
    FROM player_grade_season_stats s
    JOIN players p ON p.id = s.player_id
    WHERE s.grade = ${grade}
      AND s.player_id < ${FILL_IN_THRESHOLD}
      AND ${spanSql(sql.raw("s.season"), o)}
    GROUP BY s.player_id, p.given_name, p.surname
  `);

  const lineRows = await db.execute(sql`
    SELECT
      x.player_id AS "playerId",
      -- A zero ball count means "not recorded" on imported scorecards, so
      -- only innings and spells with balls > 0 feed the rates.
      (SUM(x.balls) FILTER (WHERE x.batted AND x.balls > 0))::int AS "ballsFaced",
      (SUM(COALESCE(x.runs, 0)) FILTER (WHERE x.batted AND x.balls > 0))::int
        AS "runsOffBallsFaced",
      (SUM(x.balls_bowled) FILTER (WHERE x.balls_bowled > 0))::int AS "ballsBowled",
      (SUM(COALESCE(x.runs_conceded, 0)) FILTER (WHERE x.balls_bowled > 0))::int
        AS "runsOffBallsBowled",
      (SUM(COALESCE(x.wickets, 0)) FILTER (WHERE x.balls_bowled > 0))::int
        AS "wicketsOffBallsBowled",
      (SUM(COALESCE(x.maidens, 0)) FILTER (WHERE x.bowled))::int AS maidens
    FROM (
      SELECT
        l.player_id, l.batted, l.balls, l.runs, l.bowled, l.maidens, l.runs_conceded,
        l.wickets,
        CASE
          WHEN l.bowled AND trim(l.overs) ~ '^[0-9]+(\\.[0-5])?$'
            THEN split_part(trim(l.overs), '.', 1)::int * 6
               + COALESCE(NULLIF(split_part(trim(l.overs), '.', 2), '')::int, 0)
        END AS balls_bowled
      FROM match_player_lines l
      JOIN matches m ON m.id = l.match_id
      WHERE m.grade = ${grade}
        AND l.player_id < ${FILL_IN_THRESHOLD}
        AND ${spanSql(sql.raw("m.season"), o)}
    ) x
    GROUP BY x.player_id
  `);

  const lines = new Map<number, Record<string, unknown>>();
  for (const l of lineRows.rows as Record<string, unknown>[]) lines.set(n(l.playerId), l);

  return (seasonRows.rows as Record<string, unknown>[]).map((s) => {
    const playerId = n(s.playerId);
    const l = lines.get(playerId);
    return {
      playerId,
      givenName: String(s.givenName ?? ""),
      surname: String(s.surname ?? ""),
      games: n(s.games),
      innings: n(s.innings),
      notOuts: n(s.notOuts),
      runs: n(s.runs),
      highScore: nOrNull(s.highScore),
      fifties: n(s.fifties),
      hundreds: n(s.hundreds),
      wickets: n(s.wickets),
      runsConceded: n(s.runsConceded),
      fiveWickets: n(s.fiveWickets),
      catches: n(s.catches),
      ballsFaced: nOrNull(l?.ballsFaced),
      runsOffBallsFaced: nOrNull(l?.runsOffBallsFaced),
      ballsBowled: nOrNull(l?.ballsBowled),
      runsOffBallsBowled: nOrNull(l?.runsOffBallsBowled),
      wicketsOffBallsBowled: nOrNull(l?.wicketsOffBallsBowled),
      maidens: nOrNull(l?.maidens),
    };
  });
}

/**
 * Central raw rows with identity resolved through the tenant crosswalk (and
 * the tenant's curated display names). Unmapped GUIDs are dropped.
 */
export async function loadCentralDistributionRows(
  source: Extract<DataSource, { kind: "central" }>,
  grade: string,
  o: DistributionOptions,
): Promise<DistributionRawRow[]> {
  const { centralGradeDistribution, splitDisplayName } =
    await import("@workspace/db/central-queries");
  const [rows, mapRows, curation] = await Promise.all([
    centralGradeDistribution(grade, {
      clubId: source.clubId,
      fromSeason: o.fromSeason,
      toSeason: o.toSeason,
    }),
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

  const out: DistributionRawRow[] = [];
  for (const r of rows) {
    const playerId = intByGuid.get(r.participantId);
    if (!playerId) continue;
    const name = splitDisplayName(curation.nameByGuid.get(r.participantId) ?? r.displayName ?? "");
    out.push({
      playerId,
      ...name,
      games: r.games,
      innings: r.innings,
      notOuts: r.notOuts,
      runs: r.runs,
      highScore: r.highScore,
      fifties: r.fifties,
      hundreds: r.hundreds,
      wickets: r.wickets,
      runsConceded: r.runsConceded,
      fiveWickets: r.fiveWickets,
      catches: r.catches,
      ballsFaced: r.ballsFaced,
      runsOffBallsFaced: r.runsOffBallsFaced,
      ballsBowled: r.ballsBowled,
      runsOffBallsBowled: r.runsOffBallsBowled,
      wicketsOffBallsBowled: r.wicketsOffBallsBowled,
      maidens: r.maidens,
    });
  }
  return out;
}

/** The whole read for one tenant: pick the path, load, qualify, shape. */
export async function loadGradeDistribution(
  source: DataSource,
  grade: string,
  o: DistributionOptions,
): Promise<GradeDistribution> {
  const rows =
    source.kind === "central"
      ? await loadCentralDistributionRows(source, grade, o)
      : await loadNativeDistributionRows(grade, o);
  return buildGradeDistribution(grade, rows, o);
}
