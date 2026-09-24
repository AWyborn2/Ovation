import { describe, it, expect } from "vitest";
import { season } from "@/lib/stats-analytics/test-fixtures";
import {
  mostPlayedGrade,
  parseBestBowling,
  parseHighScore,
  rankSpan,
  seasonTotals,
} from "./season-stats";

describe("profile season stats", () => {
  it("parses high scores and bowling figures", () => {
    expect(parseHighScore("112*")).toEqual({ runs: 112, notOut: true });
    expect(parseHighScore("74")).toEqual({ runs: 74, notOut: false });
    expect(parseHighScore("")).toBeNull();
    expect(parseBestBowling("5/22")).toEqual({ wickets: 5, runs: 22 });
    expect(parseBestBowling("-")).toBeNull();
  });

  it("totals season rows, keeping the best high score and figures", () => {
    const t = seasonTotals([
      season({
        season: null,
        games: 40,
        innings: 38,
        notOuts: 3,
        runs: 900,
        highScore: "88",
        wickets: 10,
        runsConceded: 300,
        bestBowling: "3/20",
      }),
      season({
        season: 2024,
        games: 10,
        innings: 10,
        notOuts: 0,
        runs: 400,
        highScore: "88*",
        wickets: 5,
        runsConceded: 120,
        bestBowling: "3/15",
        ballsBowled: 180,
        maidens: 4,
      }),
      season({ season: 2024, grade: "CLUB TOTAL", games: 99, runs: 9999 }),
    ]);
    expect(t.games).toBe(50);
    expect(t.runs).toBe(1300);
    expect(t.highScore).toEqual({ runs: 88, notOut: true });
    expect(t.bestBowling).toEqual({ wickets: 3, runs: 15 });
    expect(t.battingAverage).toBeCloseTo(1300 / 45);
    // Economy only from rows with recorded balls: 120 runs off 30 overs.
    expect(t.economy).toBeCloseTo(4);
    expect(t.maidens).toBe(4);
  });

  it("maidens and economy are unknown (null) when no row records them", () => {
    const t = seasonTotals([season({ season: null, wickets: 3, runsConceded: 60 })]);
    expect(t.maidens).toBeNull();
    expect(t.economy).toBeNull();
  });

  it("picks the most-played grade in range, seniority breaking ties", () => {
    const rows = [
      season({ season: 2020, grade: "B Grade", games: 12 }),
      season({ season: 2024, grade: "B Grade", games: 5 }),
      season({ season: 2024, grade: "A Grade", games: 5 }),
    ];
    expect(mostPlayedGrade(rows, { from: null, to: null })).toBe("B Grade");
    expect(mostPlayedGrade(rows, { from: 2024, to: 2024 })).toBe("A Grade");
    expect(mostPlayedGrade([], { from: null, to: null })).toBeNull();
  });

  it("ranks span: the bounded range, else the last five seasons played", () => {
    const rows = [season({ season: 2016 }), season({ season: 2023 })];
    expect(rankSpan(rows, { from: 2019, to: 2021 })).toEqual({ from: 2019, to: 2021 });
    expect(rankSpan(rows, { from: null, to: null })).toEqual({ from: 2019, to: 2023 });
    expect(rankSpan([season({ season: null })], { from: null, to: null })).toBeNull();
  });
});
