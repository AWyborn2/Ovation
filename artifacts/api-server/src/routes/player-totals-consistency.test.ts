import { describe, it, expect } from "vitest";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

// Club-wide invariant guard (companion to senior-games-consistency.test.ts,
// which pins the endpoint contract for three hand-picked players). Those tests
// prove Directory = Detail = Leaderboard = sum-of-grades for a sample; this one
// scans EVERY real player (id < 90000) so a data glitch on any other player —
// where players.total_games no longer equals SUM(player_grade_stats.games), or a
// linked A Grade cap's cached games drift away from the per-grade total — fails
// the suite for everyone, not just the sampled three.
//
// Runs against the live dev DB like the other consistency tests. Aggregates use
// NULLIF(...,0) in recompute.ts, so a 0 total is stored as NULL; every
// comparison below collapses NULL to 0 with COALESCE so an absent row and a
// genuine zero are treated identically.

type MismatchRow = {
  id: number;
  surname: string | null;
  given_name: string | null;
  player_total: number;
  grade_sum: number;
};

type CapMismatchRow = {
  cap_number: number;
  category: string;
  name: string | null;
  player_id: number;
  cap_games: number;
  in_stats: boolean;
  stat_games: number;
};

describe.skipIf(process.env.CI_SKIP_DATA_TESTS)("club-wide player game totals stay consistent", () => {
  it("players.total_games equals SUM(player_grade_stats.games) for every real player", async () => {
    const res = await db.execute(sql`
      SELECT p.id,
             p.surname,
             p.given_name,
             COALESCE(p.total_games, 0)::int AS player_total,
             COALESCE(g.sum_games, 0)::int   AS grade_sum
      FROM players p
      LEFT JOIN (
        SELECT player_id, SUM(COALESCE(games, 0)) AS sum_games
        FROM player_grade_stats
        GROUP BY player_id
      ) g ON g.player_id = p.id
      WHERE p.id < 90000
        AND COALESCE(p.total_games, 0) <> COALESCE(g.sum_games, 0)
      ORDER BY p.id
    `);

    const mismatches = res.rows as unknown as MismatchRow[];

    // Sanity: there is real data to check, so a silently-empty players table
    // can't make this pass by vacuous truth.
    const [{ real_players }] = (
      await db.execute(sql`
        SELECT COUNT(*)::int AS real_players FROM players WHERE id < 90000
      `)
    ).rows as unknown as { real_players: number }[];
    expect(real_players, "there should be real players to validate").toBeGreaterThan(0);

    const detail = mismatches
      .map(
        (m) =>
          `#${m.id} ${m.given_name ?? ""} ${m.surname ?? ""}`.trim() +
          ` — total_games=${m.player_total} but SUM(grades)=${m.grade_sum}`,
      )
      .join("\n");

    expect(
      mismatches.length,
      mismatches.length
        ? `players.total_games drifted from the sum of player_grade_stats.games:\n${detail}`
        : "",
    ).toBe(0);
  });

  it("every linked A Grade cap's cached games match that player's per-grade total", async () => {
    // For each cap linked to a player, games_a_grade must equal the player's
    // games in the cap's grade (A Grade for 'male', Female A Grade for
    // 'female'), and in_stats must reflect whether that figure is > 0. Unlinked
    // (pre-digital) caps are intentionally left out — they keep hand-entered
    // state and are never recomputed.
    const res = await db.execute(sql`
      SELECT c.cap_number,
             c.category,
             c.name,
             c.player_id,
             COALESCE(c.games_a_grade, 0)::int AS cap_games,
             c.in_stats,
             COALESCE(s.games, 0)::int AS stat_games
      FROM cap_register c
      LEFT JOIN player_grade_stats s
        ON s.player_id = c.player_id
       AND s.grade = CASE c.category
                       WHEN 'male'   THEN 'A Grade'
                       WHEN 'female' THEN 'Female A Grade'
                     END
      WHERE c.player_id IS NOT NULL
        AND (
          COALESCE(c.games_a_grade, 0) <> COALESCE(s.games, 0)
          OR c.in_stats <> (COALESCE(s.games, 0) > 0)
        )
      ORDER BY c.category, c.cap_number
    `);

    const mismatches = res.rows as unknown as CapMismatchRow[];

    const detail = mismatches
      .map(
        (m) =>
          `cap #${m.cap_number} (${m.category}) ${m.name ?? ""} player=${m.player_id}` +
          ` — games_a_grade=${m.cap_games}/in_stats=${m.in_stats}` +
          ` but per-grade games=${m.stat_games}`,
      )
      .join("\n");

    expect(
      mismatches.length,
      mismatches.length
        ? `linked cap game counts drifted from player_grade_stats:\n${detail}`
        : "",
    ).toBe(0);
  });
});
