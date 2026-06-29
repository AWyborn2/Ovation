import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../app";
import { db, playerGradeStatsTable, playersTable } from "@workspace/db";
import { eq, lt, and } from "drizzle-orm";

// Guards the canonical senior career figures (Games / Runs / Wickets). Every
// senior surface that reports these numbers is derived from the same two source
// tables: `players` carries the career totals and `player_grade_stats` carries
// one row per (player, grade). The Directory (GET /players) and Player Detail
// (GET /players/:id) read the career totals straight off `players`; the
// per-grade Leaderboard (GET /grades/:grade/leaderboard) and the Player Detail
// `stats[]` breakdown read `player_grade_stats`. The invariant that ties them
// together is: per-grade totals must SUM to the career total. A future change
// that re-derives any of these surfaces differently would silently diverge —
// these tests fail.
//
// Known multi-grade HH seniors with both runs AND wickets, keyed on numeric
// player id (never display name). Stable top-of-table players unlikely to be
// removed.
const KNOWN: { id: number; name: string }[] = [
  { id: 1, name: "Chris Phelps" },
  { id: 2, name: "Dale Burns" },
  { id: 9, name: "Grant Matthews" },
];

type GradeStatRow = {
  playerId: number;
  grade: string;
  games: number | null;
  runs: number | null;
  wickets: number | null;
};

type DirectoryPlayer = {
  id: number;
  totalGames: number | null;
  totalRuns: number | null;
  totalWickets: number | null;
};

type PlayerDetail = {
  id: number;
  totalGames: number | null;
  totalRuns: number | null;
  totalWickets: number | null;
  stats: GradeStatRow[];
};

const n = (v: number | null | undefined): number => Number(v ?? 0);

// Career totals computed straight from the DB so the test stays correct as data
// is reloaded. `players` is the source of truth for career figures.
async function careerTotals(playerId: number) {
  const [row] = await db
    .select({
      totalGames: playersTable.totalGames,
      totalRuns: playersTable.totalRuns,
      totalWickets: playersTable.totalWickets,
    })
    .from(playersTable)
    .where(eq(playersTable.id, playerId));
  return row;
}

// Per-grade rows for a player, the source for the leaderboard + detail stats[].
async function gradeRows(playerId: number) {
  return db
    .select({
      grade: playerGradeStatsTable.grade,
      games: playerGradeStatsTable.games,
      runs: playerGradeStatsTable.runs,
      wickets: playerGradeStatsTable.wickets,
    })
    .from(playerGradeStatsTable)
    .where(eq(playerGradeStatsTable.playerId, playerId));
}

describe.skipIf(process.env.CI_SKIP_DATA_TESTS)("senior career Games / Runs / Wickets are consistent across every surface", () => {
  it("totalRuns / totalWickets / totalGames match across Directory, Detail and the per-grade Leaderboard", async () => {
    for (const p of KNOWN) {
      const career = await careerTotals(p.id);
      expect(career, `${p.name} should exist`).toBeDefined();

      // Directory (GET /players) — search by this player's surname so their
      // row is guaranteed to be on the page, then locate by numeric id.
      const surname = p.name.split(" ").slice(-1)[0];
      const directoryRes = await request(app)
        .get("/api/players")
        .query({ search: surname, limit: 200 })
        .expect(200);
      const directory = (directoryRes.body as { players: DirectoryPlayer[] }).players;
      const dirRow = directory.find((r) => r.id === p.id);
      expect(dirRow, `${p.name} in /players directory`).toBeDefined();

      // Directory career totals equal the DB source of truth.
      expect(n(dirRow!.totalRuns), `${p.name} directory totalRuns`).toBe(n(career!.totalRuns));
      expect(n(dirRow!.totalWickets), `${p.name} directory totalWickets`).toBe(
        n(career!.totalWickets),
      );
      expect(n(dirRow!.totalGames), `${p.name} directory totalGames`).toBe(
        n(career!.totalGames),
      );

      // Player Detail (GET /players/:id) — career totals + per-grade stats[].
      const detailRes = await request(app).get(`/api/players/${p.id}`).expect(200);
      const detail = detailRes.body as PlayerDetail;

      // Detail career totals equal the DB source of truth AND the directory row.
      expect(n(detail.totalRuns), `${p.name} detail totalRuns`).toBe(n(career!.totalRuns));
      expect(n(detail.totalWickets), `${p.name} detail totalWickets`).toBe(
        n(career!.totalWickets),
      );
      expect(n(detail.totalGames), `${p.name} detail totalGames`).toBe(n(career!.totalGames));
      expect(n(detail.totalRuns), `${p.name} directory==detail runs`).toBe(n(dirRow!.totalRuns));
      expect(n(detail.totalWickets), `${p.name} directory==detail wickets`).toBe(
        n(dirRow!.totalWickets),
      );

      // Per-grade stats[] sum to the career total (the core invariant).
      const sumRuns = detail.stats.reduce((acc, s) => acc + n(s.runs), 0);
      const sumWickets = detail.stats.reduce((acc, s) => acc + n(s.wickets), 0);
      const sumGames = detail.stats.reduce((acc, s) => acc + n(s.games), 0);
      expect(sumRuns, `${p.name} per-grade runs sum to career`).toBe(n(career!.totalRuns));
      expect(sumWickets, `${p.name} per-grade wickets sum to career`).toBe(
        n(career!.totalWickets),
      );
      expect(sumGames, `${p.name} per-grade games sum to career`).toBe(n(career!.totalGames));

      // Per-grade Leaderboard rows match the detail stats[] for the same grade.
      for (const s of detail.stats) {
        const lbRes = await request(app)
          .get(`/api/grades/${encodeURIComponent(s.grade)}/leaderboard`)
          .expect(200);
        const lb = lbRes.body as GradeStatRow[];
        const lbRow = lb.find((r) => r.playerId === p.id);
        expect(lbRow, `${p.name} in ${s.grade} leaderboard`).toBeDefined();
        expect(n(lbRow!.runs), `${p.name} ${s.grade} leaderboard runs`).toBe(n(s.runs));
        expect(n(lbRow!.wickets), `${p.name} ${s.grade} leaderboard wickets`).toBe(
          n(s.wickets),
        );
        expect(n(lbRow!.games), `${p.name} ${s.grade} leaderboard games`).toBe(n(s.games));
      }
    }
  });

  it("club-wide: every senior's per-grade runs/wickets/games sum to their career total", async () => {
    // Whole-of-club invariant rather than a handful of names: aggregate the
    // per-grade table and compare to the career totals for every real player
    // (fill-ins / cap-only excluded). Catches any single player whose snapshot
    // recompute drifted from their stored career figure.
    const FILL_IN_FLOOR = 90000;
    const players = await db
      .select({
        id: playersTable.id,
        totalGames: playersTable.totalGames,
        totalRuns: playersTable.totalRuns,
        totalWickets: playersTable.totalWickets,
      })
      .from(playersTable)
      .where(
        and(
          lt(playersTable.id, FILL_IN_FLOOR),
          eq(playersTable.isFillIn, false),
          eq(playersTable.isCapOnly, false),
        ),
      );

    const allGradeRows = await db
      .select({
        playerId: playerGradeStatsTable.playerId,
        games: playerGradeStatsTable.games,
        runs: playerGradeStatsTable.runs,
        wickets: playerGradeStatsTable.wickets,
      })
      .from(playerGradeStatsTable);

    const sums = new Map<number, { games: number; runs: number; wickets: number }>();
    for (const r of allGradeRows) {
      const cur = sums.get(r.playerId) ?? { games: 0, runs: 0, wickets: 0 };
      cur.games += n(r.games);
      cur.runs += n(r.runs);
      cur.wickets += n(r.wickets);
      sums.set(r.playerId, cur);
    }

    const mismatches: string[] = [];
    for (const p of players) {
      const s = sums.get(p.id) ?? { games: 0, runs: 0, wickets: 0 };
      if (s.runs !== n(p.totalRuns)) mismatches.push(`#${p.id} runs ${s.runs}!=${n(p.totalRuns)}`);
      if (s.wickets !== n(p.totalWickets))
        mismatches.push(`#${p.id} wickets ${s.wickets}!=${n(p.totalWickets)}`);
      if (s.games !== n(p.totalGames))
        mismatches.push(`#${p.id} games ${s.games}!=${n(p.totalGames)}`);
    }

    expect(mismatches, mismatches.slice(0, 20).join("; ")).toHaveLength(0);
  });
});
