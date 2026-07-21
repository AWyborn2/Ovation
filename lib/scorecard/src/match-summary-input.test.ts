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
// matchToSummaryInput: primary code path (club/opposition, performers, result)
// ---------------------------------------------------------------------------

describe("matchToSummaryInput: primary path", () => {
  const clubColors = {
    primary: "#333F48",
    secondary: "#FBAC27",
    text: "#ffffff",
    accentText: "#333F48",
    rowOdd: "#f5f5f5",
    rowEven: "#ffffff",
    rowText: "#333333",
    totalBg: "#333F48",
    totalText: "#ffffff",
    borderColor: "#e0e0e0",
  };
  const oppColors = {
    primary: "#CC0000",
    secondary: "#FFD700",
    text: "#ffffff",
    accentText: "#CC0000",
    rowOdd: "#f5f5f5",
    rowEven: "#ffffff",
    rowText: "#333333",
    totalBg: "#CC0000",
    totalText: "#ffffff",
    borderColor: "#e0e0e0",
  };

  const clubTeam = {
    name: "Halls Head",
    shortName: "HH",
    logoUrl: "/logos/hh.png",
    colors: clubColors,
    isHallsHead: true,
  };
  const oppTeam = {
    name: "Mandurah",
    shortName: "Mand",
    logoUrl: "/logos/mand.png",
    colors: oppColors,
    isHallsHead: false,
  };

  it("maps club and opposition teams from scorecard innings", () => {
    (buildScorecard as any).mockReturnValue({
      innings: [
        {
          battingTeam: clubTeam,
          bowlingTeam: oppTeam,
          inningsLabel: "1ST INNINGS",
          batsmen: [bat("A Smith", 75, 60, false), bat("B Jones", 45, 50, true)],
          didNotBat: [],
          bowlers: [bowl("X Kumar", 3, 28, "8"), bowl("Y Patel", 1, 35, "6")],
          extras: { total: 10, wides: 4, noBalls: 2, other: 4 },
          totalRuns: 180,
          wickets: 8,
          oversTotal: "45",
        },
        {
          battingTeam: oppTeam,
          bowlingTeam: clubTeam,
          inningsLabel: "2ND INNINGS",
          batsmen: [bat("P Lee", 55, 70, false), bat("Q Martin", 30, 40, false)],
          didNotBat: [],
          bowlers: [bowl("C Brown", 2, 22, "7"), bowl("D White", 0, 40, "5")],
          extras: { total: 5, wides: 3, noBalls: 1, other: 1 },
          totalRuns: 150,
          wickets: 10,
          oversTotal: "38.2",
        },
      ],
      orderKnown: true,
    });

    const match = {
      id: 42,
      season: 2024,
      grade: "A Grade",
      round: 8,
      stage: null,
      matchDate: "2025-02-15",
      venue: "Doddi Oval",
      opponent: "Mandurah",
      opponentName: "Mandurah",
      opponentClub: null,
      club: null,
      competition: "One Day",
      clubScore: "180",
      opponentScore: "150",
      clubBattedFirst: true,
      result: "Won by 30 runs",
      abandoned: false,
      lines: [],
      oppositionLines: [],
    } as any;

    const input = matchToSummaryInput(match);

    expect(input.kind).toBe("matchSummary");
    expect(input.matchTitle).toBe("A Grade • Round 8");
    expect(input.matchType).toBe("One Day");
    expect(input.venue).toBe("Doddi Oval");
    expect(input.result).toBe("Won by 30 runs");
    expect(input.resultWinner).toBe("club");

    // Club team identity
    expect(input.club.name).toBe("Halls Head");
    expect(input.club.shortName).toBe("HH");
    expect(input.club.primaryColor).toBe("#333F48");
    expect(input.club.logoUrl).toBe("/logos/hh.png");

    // Opposition team identity
    expect(input.opposition.name).toBe("Mandurah");
    expect(input.opposition.shortName).toBe("Mand");
    expect(input.opposition.primaryColor).toBe("#CC0000");

    // Two innings present
    expect(input.innings).toHaveLength(2);

    // 1st innings: club batting
    expect(input.innings[0].teamKey).toBe("club");
    expect(input.innings[0].totalRuns).toBe("180");
    expect(input.innings[0].wickets).toBe("8");
    expect(input.innings[0].overs).toBe("45");
    expect(input.innings[0].topBatters[0].name).toBe("A Smith");
    expect(input.innings[0].topBatters[0].runs).toBe(75);

    // 2nd innings: opposition batting
    expect(input.innings[1].teamKey).toBe("opposition");
    expect(input.innings[1].totalRuns).toBe("150");
    expect(input.innings[1].wickets).toBe("10");
    expect(input.innings[1].overs).toBe("38.2");
    expect(input.innings[1].topBatters[0].name).toBe("P Lee");
    expect(input.innings[1].topBatters[0].runs).toBe(55);
  });

  it("formats result as 'Match abandoned' when abandoned flag is set", () => {
    (buildScorecard as any).mockReturnValue({
      innings: [
        {
          battingTeam: clubTeam,
          bowlingTeam: oppTeam,
          inningsLabel: "1ST INNINGS",
          batsmen: [bat("A Smith", 20)],
          didNotBat: [],
          bowlers: [],
          extras: { total: 0, wides: 0, noBalls: 0, other: 0 },
          totalRuns: 20,
          wickets: 1,
          oversTotal: "10",
        },
      ],
      orderKnown: true,
    });

    const match = {
      id: 99,
      season: 2024,
      grade: "B Grade",
      round: 3,
      stage: null,
      matchDate: "2025-01-10",
      venue: null,
      opponent: "South",
      opponentName: "South",
      opponentClub: null,
      club: null,
      competition: null,
      clubScore: null,
      opponentScore: null,
      clubBattedFirst: true,
      result: "Lost by 5 wickets",
      abandoned: true,
      lines: [],
      oppositionLines: [],
    } as any;

    const input = matchToSummaryInput(match);

    expect(input.result).toBe("Match abandoned");
    expect(input.resultWinner).toBe("draw");
    expect(input.matchType).toBe("2024/25");
  });

  it("uses stage label instead of round when stage is present", () => {
    (buildScorecard as any).mockReturnValue({
      innings: [
        {
          battingTeam: clubTeam,
          bowlingTeam: oppTeam,
          inningsLabel: "1ST INNINGS",
          batsmen: [],
          didNotBat: [],
          bowlers: [],
          extras: { total: 0, wides: 0, noBalls: 0, other: 0 },
          totalRuns: 200,
          wickets: 5,
          oversTotal: "50",
        },
      ],
      orderKnown: true,
    });

    const match = {
      id: 55,
      season: 2024,
      grade: "A Grade",
      round: null,
      stage: "Grand Final",
      matchDate: "2025-03-22",
      venue: "Test Oval",
      opponent: "Opp CC",
      opponentName: "Opp CC",
      opponentClub: null,
      club: null,
      competition: "Two Day",
      clubScore: null,
      opponentScore: null,
      clubBattedFirst: true,
      result: "Won by an innings",
      abandoned: false,
      lines: [],
      oppositionLines: [],
    } as any;

    const input = matchToSummaryInput(match);
    expect(input.matchTitle).toBe("A Grade • Grand Final");
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
