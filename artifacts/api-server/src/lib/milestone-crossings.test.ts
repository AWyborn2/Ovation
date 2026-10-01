/**
 * The native career tier-crossing walk and the milestone tier ladders, shared
 * by the native milestone board (routes/milestones.ts) and the Halls Head
 * cut-over preview (scripts/src/hh-cutover-preview.ts, hybrid stats plan U13).
 * Pure — no database.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_GAMES_TIERS,
  DEFAULT_RUNS_TIERS,
  DEFAULT_WICKETS_TIERS,
  centralMilestoneTiers,
  nativeCareerCrossings,
  nativeMilestoneTiers,
} from "./milestone-crossings";

const match = (id: number, matchDate: string | null) => [id, { matchDate }] as const;

describe("nativeCareerCrossings", () => {
  const tiers = { gamesTiers: [3], runsTiers: [100, 200], wicketsTiers: [5] };

  it("emits a crossing at the match where the running career total passes a tier", () => {
    const out = nativeCareerCrossings({
      // Career 230 runs over 4 games; the three scorecard lines carry 150 of
      // them, so 80 runs and 1 game come from before the scorecards.
      careerById: new Map([[7, { games: 4, runs: 230, wickets: 0 }]]),
      matchById: new Map([match(1, "2020-10-10"), match(2, "2020-10-17"), match(3, "2020-10-24")]),
      lines: [
        { matchId: 3, playerId: 7, runs: 100, wickets: 0 },
        { matchId: 1, playerId: 7, runs: 30, wickets: 0 },
        { matchId: 2, playerId: 7, runs: 20, wickets: null },
      ],
      ...tiers,
    });
    expect(out).toEqual([
      // games: 1 before, then 2, 3 (crosses 3 in match 2), 4.
      { playerId: 7, boardKey: "games", tierIndex: 0, tier: 3, value: 3, matchId: 2 },
      // runs: 80 before, 110 after match 1 (crosses 100), 130, 230 (crosses 200).
      { playerId: 7, boardKey: "runs", tierIndex: 0, tier: 100, value: 110, matchId: 1 },
      { playerId: 7, boardKey: "runs", tierIndex: 1, tier: 200, value: 230, matchId: 3 },
    ]);
  });

  it("skips lines whose match has no parseable date, and players with no career row", () => {
    const out = nativeCareerCrossings({
      careerById: new Map([[7, { games: 3, runs: 0, wickets: 0 }]]),
      matchById: new Map([match(1, "2020-10-10"), match(2, null), match(3, "not a date")]),
      lines: [
        { matchId: 1, playerId: 7, runs: 0, wickets: 0 },
        { matchId: 2, playerId: 7, runs: 0, wickets: 0 },
        { matchId: 3, playerId: 7, runs: 0, wickets: 0 },
        { matchId: 1, playerId: 8, runs: 500, wickets: 9 },
      ],
      ...tiers,
    });
    // Only match 1 is walked: 2 games before it, the third in it.
    expect(out).toEqual([
      { playerId: 7, boardKey: "games", tierIndex: 0, tier: 3, value: 3, matchId: 1 },
    ]);
  });
});

describe("milestone tier ladders", () => {
  it("native: the club's tiers sorted ascending, defaults when unset or empty", () => {
    expect(nativeMilestoneTiers(null)).toEqual({
      games: DEFAULT_GAMES_TIERS,
      runs: DEFAULT_RUNS_TIERS,
      wickets: DEFAULT_WICKETS_TIERS,
    });
    expect(
      nativeMilestoneTiers({ gamesTiers: [200, 50], runsTiers: [], wicketsTiers: [10] }),
    ).toEqual({ games: [50, 200], runs: DEFAULT_RUNS_TIERS, wickets: [10] });
  });

  it("central: the club's tiers as stored, defaults only when unset", () => {
    expect(centralMilestoneTiers(undefined)).toEqual({
      games: DEFAULT_GAMES_TIERS,
      runs: DEFAULT_RUNS_TIERS,
      wickets: DEFAULT_WICKETS_TIERS,
    });
    expect(
      centralMilestoneTiers({ gamesTiers: [200, 50], runsTiers: [], wicketsTiers: [10] }),
    ).toEqual({ games: [200, 50], runs: [], wickets: [10] });
  });
});
