import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../app";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

// Guards the single canonical junior "Games" figure (see
// .agents/memory/junior-games-consistency.md): every junior surface that reports
// a games/matches/appearances number must use the roster-appearances count
// (`COUNT(DISTINCT junior_match_rosters.match_id)` over HH, non-null participant
// lines) so the Directory, Most Games, rich leaderboard and Most Wickets board
// all show the SAME number for the same player. A future change that re-derives
// games from batting/bowling/union ids would silently diverge — these tests fail.

// Known HH junior participants that ALSO appear in the all-time top-25 Most
// Wickets board (so they're present in GET /juniors/leaderboards), keyed on
// participant_id, never display name.
const KNOWN: { id: string; name: string }[] = [
  { id: "b2d6db53-86ed-44fd-8859-0efef475b4c9", name: "C Gray" },
  { id: "7cd75bae-d4b5-440c-b886-10ee5c6d8311", name: "Z Dreckow" },
  { id: "d147283d-49d7-4722-b4d4-236749a7eb8d", name: "H Young" },
  { id: "36075d9b-1c99-49c4-a213-f2ba5c87fc78", name: "N Dreckow" },
  { id: "c46e4352-2872-4135-a545-c4c303c18fe0", name: "D Baker" },
];

// Brothers / namesakes: two distinct "C Gray" participants that must never merge.
const C_GRAY_A = "b2d6db53-86ed-44fd-8859-0efef475b4c9";
const C_GRAY_B = "8a1dd3f2-23b7-40d4-b0bd-7887a04592a8";

// A participant with games + runs + wickets all under one season/age scope.
const SCOPED = {
  id: "d08370e0-8da7-470e-a79e-964ca1e89e5c",
  name: "A Quigg",
  season: "2016/17",
  ageGroup: "Year 9",
};

type Scope = { season?: string; ageGroup?: string };

// Canonical expected games: COUNT(DISTINCT junior_match_rosters.match_id) for HH,
// non-null participant lines, optionally scoped — computed straight from the DB so
// the test stays correct as junior data is reloaded.
async function rosterGames(participantId: string, scope: Scope = {}): Promise<number> {
  const seasonCond = scope.season ? sql`AND m.season = ${scope.season}` : sql``;
  const ageCond = scope.ageGroup ? sql`AND m.age_group = ${scope.ageGroup}` : sql``;
  const res = await db.execute(sql`
    SELECT COUNT(DISTINCT jr.match_id)::int AS games
    FROM junior_match_rosters jr
    JOIN junior_matches m ON m.id = jr.match_id
    WHERE jr.is_halls_head
      AND jr.participant_id IS NOT NULL
      AND jr.participant_id = ${participantId}
      ${seasonCond} ${ageCond}
  `);
  return Number((res.rows[0] as { games: number }).games);
}

async function scopedRuns(participantId: string, scope: Scope): Promise<number> {
  const seasonCond = scope.season ? sql`AND m.season = ${scope.season}` : sql``;
  const ageCond = scope.ageGroup ? sql`AND m.age_group = ${scope.ageGroup}` : sql``;
  const res = await db.execute(sql`
    SELECT COALESCE(SUM(b.runs), 0)::int AS runs
    FROM junior_match_batting b
    JOIN junior_matches m ON m.id = b.match_id
    WHERE b.is_halls_head
      AND b.participant_id IS NOT NULL
      AND b.participant_id = ${participantId}
      ${seasonCond} ${ageCond}
  `);
  return Number((res.rows[0] as { runs: number }).runs);
}

async function scopedWickets(participantId: string, scope: Scope): Promise<number> {
  const seasonCond = scope.season ? sql`AND m.season = ${scope.season}` : sql``;
  const ageCond = scope.ageGroup ? sql`AND m.age_group = ${scope.ageGroup}` : sql``;
  const res = await db.execute(sql`
    SELECT COALESCE(SUM(bo.wickets), 0)::int AS wickets
    FROM junior_match_bowling bo
    JOIN junior_matches m ON m.id = bo.match_id
    WHERE bo.is_halls_head
      AND bo.participant_id IS NOT NULL
      AND bo.participant_id = ${participantId}
      ${seasonCond} ${ageCond}
  `);
  return Number((res.rows[0] as { wickets: number }).wickets);
}

type DirectoryRow = { participantId: string; matches: number; runs: number; wickets: number };
type LeaderboardRow = { participantId: string; matches: number };
type WicketRow = { participantId: string; matches: number };

describe("junior Games figure is consistent across every tab", () => {
  it("matches is identical across Directory, rich leaderboard, Most Wickets and equals roster COUNT(DISTINCT match_id)", async () => {
    const [playersRes, leaderboardRes, leaderboardsRes] = await Promise.all([
      request(app).get("/api/juniors/players").expect(200),
      request(app).get("/api/juniors/leaderboard").expect(200),
      request(app).get("/api/juniors/leaderboards").expect(200),
    ]);

    const directory = playersRes.body as DirectoryRow[];
    const leaderboard = leaderboardRes.body as LeaderboardRow[];
    const mostWickets = (leaderboardsRes.body as { mostWickets: WicketRow[] }).mostWickets;

    for (const p of KNOWN) {
      const expected = await rosterGames(p.id);
      expect(expected, `${p.name} should have roster games`).toBeGreaterThan(0);

      const dirRow = directory.find((r) => r.participantId === p.id);
      const lbRow = leaderboard.find((r) => r.participantId === p.id);
      const mwRow = mostWickets.find((r) => r.participantId === p.id);

      expect(dirRow, `${p.name} in /juniors/players`).toBeDefined();
      expect(lbRow, `${p.name} in /juniors/leaderboard`).toBeDefined();
      expect(mwRow, `${p.name} in /juniors/leaderboards mostWickets`).toBeDefined();

      expect(dirRow!.matches, `${p.name} directory games`).toBe(expected);
      expect(lbRow!.matches, `${p.name} rich leaderboard games`).toBe(expected);
      expect(mwRow!.matches, `${p.name} Most Wickets games`).toBe(expected);
    }
  });

  it("keeps brothers / namesakes (two 'C Gray') separate by participant_id", async () => {
    const res = await request(app)
      .get("/api/juniors/players")
      .query({ search: "Gray" })
      .expect(200);
    const rows = res.body as DirectoryRow[];

    const a = rows.find((r) => r.participantId === C_GRAY_A);
    const b = rows.find((r) => r.participantId === C_GRAY_B);

    expect(a, "first C Gray present").toBeDefined();
    expect(b, "second C Gray present").toBeDefined();
    expect(C_GRAY_A).not.toBe(C_GRAY_B);

    // Each keeps its own games figure, derived per participant_id.
    expect(a!.matches).toBe(await rosterGames(C_GRAY_A));
    expect(b!.matches).toBe(await rosterGames(C_GRAY_B));
    // Their counts genuinely differ — proof they are not merged.
    expect(a!.matches).not.toBe(b!.matches);
  });

  it("scopes games, runs and wickets to the season + age-group filter", async () => {
    const scope: Scope = { season: SCOPED.season, ageGroup: SCOPED.ageGroup };
    const [expectedGames, expectedRuns, expectedWickets] = await Promise.all([
      rosterGames(SCOPED.id, scope),
      scopedRuns(SCOPED.id, scope),
      scopedWickets(SCOPED.id, scope),
    ]);

    expect(expectedGames, "scoped games > 0").toBeGreaterThan(0);
    expect(expectedRuns, "scoped runs > 0").toBeGreaterThan(0);
    expect(expectedWickets, "scoped wickets > 0").toBeGreaterThan(0);

    const res = await request(app)
      .get("/api/juniors/players")
      .query({ season: SCOPED.season, ageGroup: SCOPED.ageGroup })
      .expect(200);
    const rows = res.body as DirectoryRow[];
    const row = rows.find((r) => r.participantId === SCOPED.id);

    expect(row, `${SCOPED.name} in scoped /juniors/players`).toBeDefined();
    expect(row!.matches, "scoped games").toBe(expectedGames);
    expect(row!.runs, "scoped runs").toBe(expectedRuns);
    expect(row!.wickets, "scoped wickets").toBe(expectedWickets);

    // The scoped figure must be strictly less than the all-time figure (proof the
    // filter actually narrows the count rather than ignoring scope).
    const allTimeGames = await rosterGames(SCOPED.id);
    expect(expectedGames).toBeLessThan(allTimeGames);
  });
});
