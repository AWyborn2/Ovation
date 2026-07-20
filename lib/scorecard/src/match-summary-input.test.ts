// @ts-nocheck — @workspace/scorecard carries no vitest devDependency (it is a
// leaf lib; the workspace's test runner lives in the api-server or cricket-club
// package). Run this suite with:
//   npx vitest run lib/scorecard/src/match-summary-input.test.ts
// The functions under test are pure mappers with no DB or DOM dependency.
import { describe, it, expect, vi } from "vitest";
import {
  deriveWinner,
  topBatters,
  topBowlers,
  seasonLabel,
  matchToSummaryInput,
} from "./match-summary-input";
import type { ScorecardBatsman, ScorecardBowler } from "./types";

vi.mock("./mapping", () => ({
  buildScorecard: vi.fn(),
}));
import { buildScorecard } from "./mapping";

// ---------------------------------------------------------------------------
// deriveWinner
// ---------------------------------------------------------------------------

describe("deriveWinner", () => {
  it('returns "club" for result text containing "won"', () => {
    expect(deriveWinner("Won by 5 wickets")).toBe("club");
  });

  it('returns "club" for result text containing "win"', () => {
    expect(deriveWinner("Outright win")).toBe("club");
  });

  it('returns "club" for result text containing "victor"', () => {
    expect(deriveWinner("Victory by 30 runs")).toBe("club");
  });

  it('returns "opposition" for result text containing "lost"', () => {
    expect(deriveWinner("Lost by 3 wickets")).toBe("opposition");
  });

  it('returns "opposition" for result text containing "loss"', () => {
    expect(deriveWinner("Loss on run rate")).toBe("opposition");
  });

  it('returns "opposition" for result text containing "defeat"', () => {
    expect(deriveWinner("Defeat by 12 runs")).toBe("opposition");
  });

  it('returns "draw" for a drawn match', () => {
    expect(deriveWinner("Match drawn")).toBe("draw");
  });

  it('returns "draw" for null/undefined', () => {
    expect(deriveWinner(null)).toBe("draw");
    expect(deriveWinner(undefined)).toBe("draw");
  });

  it('returns "draw" for an empty string', () => {
    expect(deriveWinner("")).toBe("draw");
  });

  it("is case-insensitive", () => {
    expect(deriveWinner("WON BY 100 RUNS")).toBe("club");
    expect(deriveWinner("LOST by 2 wickets")).toBe("opposition");
  });
});

// ---------------------------------------------------------------------------
// topBatters
// ---------------------------------------------------------------------------

function bat(name: string, runs: number | null, balls?: number | null, notOut = false): ScorecardBatsman {
  return {
    playerId: null,
    name,
    dismissal: notOut ? "not out" : "bowled",
    notOut,
    runs,
    balls: balls ?? null,
    fours: null,
    sixes: null,
    strikeRate: null,
  };
}

describe("topBatters", () => {
  it("returns at most 3 batters sorted by runs descending", () => {
    const batsmen = [
      bat("A", 10),
      bat("B", 50),
      bat("C", 30),
      bat("D", 20),
      bat("E", 40),
    ];
    const result = topBatters(batsmen);
    expect(result).toHaveLength(3);
    expect(result[0].name).toBe("B");
    expect(result[0].runs).toBe(50);
    expect(result[1].name).toBe("E");
    expect(result[1].runs).toBe(40);
    expect(result[2].name).toBe("C");
    expect(result[2].runs).toBe(30);
  });

  it("returns fewer than 3 when fewer batters exist", () => {
    const batsmen = [bat("A", 25)];
    const result = topBatters(batsmen);
    expect(result).toHaveLength(1);
    expect(result[0].runs).toBe(25);
  });

  it("handles null runs as -1 for sorting (sorts to end)", () => {
    const batsmen = [bat("A", null), bat("B", 10), bat("C", 5)];
    const result = topBatters(batsmen);
    expect(result[0].name).toBe("B");
    expect(result[1].name).toBe("C");
    expect(result[2].name).toBe("A");
    expect(result[2].runs).toBe(0); // null mapped to 0 in output
  });

  it("preserves notOut and balls in the output", () => {
    const batsmen = [bat("A", 50, 40, true)];
    const result = topBatters(batsmen);
    expect(result[0].notOut).toBe(true);
    expect(result[0].balls).toBe(40);
  });

  it("returns an empty array for an empty input", () => {
    expect(topBatters([])).toEqual([]);
  });

  it("excludes batters matching excludeName", () => {
    const batsmen = [bat("Private Player", 100), bat("B", 50)];
    const result = topBatters(batsmen, "Private Player");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("B");
  });
});

// ---------------------------------------------------------------------------
// topBowlers
// ---------------------------------------------------------------------------

function bowl(
  name: string,
  wickets: number | null,
  runs: number | null,
  overs: string | null = "4",
): ScorecardBowler {
  return {
    playerId: null,
    name,
    overs,
    maidens: null,
    runs,
    wickets,
    economy: null,
    wides: null,
    noBalls: null,
  };
}

describe("topBowlers", () => {
  it("returns at most 3 bowlers sorted by wickets desc then runs asc", () => {
    const bowlers = [
      bowl("A", 1, 40),
      bowl("B", 3, 25),
      bowl("C", 3, 20),
      bowl("D", 2, 30),
      bowl("E", 0, 50),
    ];
    const result = topBowlers(bowlers);
    expect(result).toHaveLength(3);
    // C and B both have 3 wickets; C conceded fewer runs so ranks first
    expect(result[0].name).toBe("C");
    expect(result[0].wickets).toBe(3);
    expect(result[0].runs).toBe(20);
    expect(result[1].name).toBe("B");
    expect(result[1].wickets).toBe(3);
    expect(result[1].runs).toBe(25);
    expect(result[2].name).toBe("D");
    expect(result[2].wickets).toBe(2);
  });

  it("excludes bowlers with 0 wickets and no overs", () => {
    const bowlers = [bowl("A", 0, 10, null), bowl("B", 2, 20)];
    const result = topBowlers(bowlers);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("B");
  });

  it("includes bowlers with 0 wickets when overs are recorded", () => {
    const bowlers = [bowl("A", 0, 10, "4"), bowl("B", 2, 20)];
    const result = topBowlers(bowlers);
    expect(result).toHaveLength(2);
  });

  it("returns an empty array for an empty input", () => {
    expect(topBowlers([])).toEqual([]);
  });

  it("excludes bowlers matching excludeName", () => {
    const bowlers = [bowl("Private Player", 5, 10), bowl("B", 2, 20)];
    const result = topBowlers(bowlers, "Private Player");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("B");
  });
});

// ---------------------------------------------------------------------------
// seasonLabel
// ---------------------------------------------------------------------------

describe("seasonLabel", () => {
  it("formats a season start year as YYYY/YY", () => {
    expect(seasonLabel(2024)).toBe("2024/25");
  });

  it("handles century rollover", () => {
    expect(seasonLabel(1999)).toBe("1999/00");
  });

  it("handles year 2000", () => {
    expect(seasonLabel(2000)).toBe("2000/01");
  });

  it("zero-pads the second part", () => {
    expect(seasonLabel(2002)).toBe("2002/03");
  });
});

// ---------------------------------------------------------------------------
// matchToSummaryInput: zero-innings guard (thin-data crash fix)
// ---------------------------------------------------------------------------

describe("matchToSummaryInput: zero-innings guard", () => {
  it("returns a minimal card without crashing when innings array is empty", () => {
    // Mock buildScorecard to return empty innings (simulates thin data).
    (buildScorecard as any).mockReturnValue({ innings: [], orderKnown: false });

    const match = {
      id: 1,
      season: 2024,
      grade: "A Grade",
      round: 5,
      stage: null,
      matchDate: "2025-01-15",
      venue: "Test Oval",
      opponent: "Test CC",
      opponentName: "Test CC",
      opponentClub: null,
      club: null,
      competition: "One Day",
      clubScore: null,
      opponentScore: null,
      clubBattedFirst: null,
      result: null,
      abandoned: false,
      lines: [],
      oppositionLines: [],
    } as any;

    // Should not throw
    const input = matchToSummaryInput(match);

    expect(input.kind).toBe("matchSummary");
    expect(input.matchTitle).toBe("A Grade • Round 5");
    expect(input.innings).toEqual([]);
    expect(input.result).toBe("Result pending");
    expect(input.resultWinner).toBe("draw");
    expect(input.club.name).toBe("Club");
    expect(input.opposition.name).toBe("Test CC");
    expect(input.date).toBeTruthy();
    expect(input.venue).toBe("Test Oval");
    expect(input.matchType).toBe("One Day");
  });
});
