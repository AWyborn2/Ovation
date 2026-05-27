import { sql, type SQL } from "drizzle-orm";

interface DbLike {
  execute: (query: SQL) => Promise<unknown>;
}

/**
 * Re-derive aggregate tables from player_grade_season_stats snapshots.
 *
 * For the given affected grades: rebuild the per-grade rows in
 * player_grade_stats from snapshot sums, recompute affected players' career
 * totals, and rebuild grade_summaries for those grades.
 *
 * MUST be called inside the same transaction as the snapshot mutation so that
 * readers never observe a half-applied state, and so all statements run on a
 * single pooled connection (no temp tables / no cross-connection state).
 */
export async function recomputeAggregates(
  tx: DbLike,
  grades: string[],
): Promise<void> {
  if (grades.length === 0) return;

  const gradeList: SQL = sql`(${sql.join(
    grades.map((g) => sql`${g}`),
    sql`, `,
  )})`;

  // 1) Replace per-grade aggregate rows for the affected grades.
  await tx.execute(sql`DELETE FROM player_grade_stats WHERE grade IN ${gradeList}`);
  await tx.execute(sql`
    INSERT INTO player_grade_stats
      (player_id, surname, given_name, grade, season, games, innings, not_outs,
       runs, bat_avg, high_score, fifties, hundreds, wickets, runs_conceded,
       bowl_avg, best_bowling, five_wickets, catches, stumpings, run_outs)
    SELECT
      s.player_id,
      p.surname,
      p.given_name,
      s.grade,
      NULL::int AS season,
      NULLIF(COALESCE(SUM(s.games), 0), 0),
      NULLIF(COALESCE(SUM(s.innings), 0), 0),
      NULLIF(COALESCE(SUM(s.not_outs), 0), 0),
      NULLIF(COALESCE(SUM(s.runs), 0), 0),
      CASE
        WHEN COALESCE(SUM(s.innings), 0) - COALESCE(SUM(s.not_outs), 0) > 0
          THEN COALESCE(SUM(s.runs), 0)::real
               / (COALESCE(SUM(s.innings), 0) - COALESCE(SUM(s.not_outs), 0))
        ELSE NULL
      END,
      (
        SELECT high_score FROM player_grade_season_stats x
        WHERE x.player_id = s.player_id AND x.grade = s.grade
          AND x.high_score IS NOT NULL AND x.high_score <> ''
        ORDER BY
          NULLIF(regexp_replace(x.high_score, '[^0-9]', '', 'g'), '')::int DESC NULLS LAST,
          (x.high_score ~ '\\*') DESC
        LIMIT 1
      ),
      NULLIF(COALESCE(SUM(s.fifties), 0), 0),
      NULLIF(COALESCE(SUM(s.hundreds), 0), 0),
      NULLIF(COALESCE(SUM(s.wickets), 0), 0),
      NULLIF(COALESCE(SUM(s.runs_conceded), 0), 0),
      CASE
        WHEN COALESCE(SUM(s.wickets), 0) > 0
          THEN COALESCE(SUM(s.runs_conceded), 0)::real / SUM(s.wickets)
        ELSE NULL
      END,
      (
        SELECT best_bowling FROM player_grade_season_stats x
        WHERE x.player_id = s.player_id AND x.grade = s.grade
          AND x.best_bowling IS NOT NULL AND x.best_bowling <> ''
          AND x.best_bowling ~ '^[0-9]+/[0-9]+$'
        ORDER BY
          split_part(x.best_bowling, '/', 1)::int DESC,
          split_part(x.best_bowling, '/', 2)::int ASC
        LIMIT 1
      ),
      NULLIF(COALESCE(SUM(s.five_wickets), 0), 0),
      NULLIF(COALESCE(SUM(s.catches), 0), 0),
      NULLIF(COALESCE(SUM(s.stumpings), 0), 0),
      NULLIF(COALESCE(SUM(s.run_outs), 0), 0)
    FROM player_grade_season_stats s
    JOIN players p ON p.id = s.player_id
    WHERE s.grade IN ${gradeList}
    GROUP BY s.player_id, p.surname, p.given_name, s.grade
  `);

  // 2) Recompute career totals for every player whose rows in any of the
  //    affected grades may have changed. A single statement using a CTE; no
  //    temp tables so we never depend on connection-local state.
  await tx.execute(sql`
    WITH affected AS (
      SELECT DISTINCT player_id FROM player_grade_season_stats WHERE grade IN ${gradeList}
      UNION
      SELECT DISTINCT player_id FROM player_grade_stats        WHERE grade IN ${gradeList}
    ),
    agg AS (
      SELECT
        a.player_id,
        NULLIF(COALESCE(SUM(s.games), 0),   0) AS total_games,
        NULLIF(COALESCE(SUM(s.runs), 0),    0) AS total_runs,
        NULLIF(COALESCE(SUM(s.wickets), 0), 0) AS total_wickets,
        NULLIF(string_agg(DISTINCT s.grade, ', ' ORDER BY s.grade), '') AS grades_played
      FROM affected a
      LEFT JOIN player_grade_stats s ON s.player_id = a.player_id
      GROUP BY a.player_id
    )
    UPDATE players p SET
      total_games   = agg.total_games,
      total_runs    = agg.total_runs,
      total_wickets = agg.total_wickets,
      grades_played = agg.grades_played
    FROM agg
    WHERE p.id = agg.player_id
  `);

  // 3) Rebuild grade_summaries rows for affected grades.
  await tx.execute(sql`DELETE FROM grade_summaries WHERE grade IN ${gradeList}`);
  await tx.execute(sql`
    INSERT INTO grade_summaries (grade, players, games, innings, runs, wickets,
                                 catches, stumpings, run_outs)
    SELECT
      grade,
      COUNT(DISTINCT player_id),
      NULLIF(COALESCE(SUM(games), 0), 0),
      NULLIF(COALESCE(SUM(innings), 0), 0),
      NULLIF(COALESCE(SUM(runs), 0), 0),
      NULLIF(COALESCE(SUM(wickets), 0), 0),
      NULLIF(COALESCE(SUM(catches), 0), 0),
      NULLIF(COALESCE(SUM(stumpings), 0), 0),
      NULLIF(COALESCE(SUM(run_outs), 0), 0)
    FROM player_grade_stats
    WHERE grade IN ${gradeList}
    GROUP BY grade
  `);
}
