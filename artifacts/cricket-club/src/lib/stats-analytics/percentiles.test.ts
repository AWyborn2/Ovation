import { describe, expect, it } from "vitest";
import type { GradeDistribution, GradeDistributionPlayer } from "@workspace/api-client-react";
import { pctOfBest, percentileRank, playerRanks } from "./percentiles";
import { bestIndices } from "./shared";

function player(id: number, runs: number, avg: number | null, econ: number | null) {
  const p: GradeDistributionPlayer = {
    playerId: id,
    givenName: "P",
    surname: String(id),
    games: 10,
    catches: 1,
    batting:
      avg == null
        ? null
        : {
            innings: 10,
            notOuts: 0,
            runs,
            average: avg,
            highScore: 50,
            fifties: 1,
            hundreds: 0,
            ballsFaced: null,
            strikeRate: null,
          },
    bowling:
      econ == null
        ? null
        : {
            overs: "60",
            ballsBowled: 360,
            maidens: 2,
            wickets: 10,
            runsConceded: econ * 60,
            average: econ * 6,
            economy: econ,
            strikeRate: 36,
            fiveWickets: 0,
          },
  };
  return p;
}

describe("percentiles", () => {
  it("the median player is at 50", () => {
    expect(percentileRank([10, 20, 30, 40, 50], 30, "battingAverage")).toBe(50);
  });

  it("lower-is-better inverts", () => {
    expect(percentileRank([3, 4, 5, 6, 7], 3, "economy")).toBe(90);
    expect(percentileRank([3, 4, 5, 6, 7], 7, "economy")).toBe(10);
    expect(percentileRank([3, 4, 5, 6, 7], 7, "battingAverage")).toBe(90);
  });

  it("% of club best honours direction", () => {
    expect(pctOfBest(25, 50, "battingAverage")).toBe(50);
    expect(pctOfBest(8, 4, "economy")).toBe(50);
    expect(pctOfBest(null, 4, "economy")).toBeNull();
  });

  it("bestIndices picks the minimum for lower-is-better metrics", () => {
    expect(bestIndices("bowlingAverage", [24.1, null, 19.9, 30])).toEqual([2]);
    expect(bestIndices("runs", [10, 30, 30])).toEqual([1, 2]);
  });

  it("ranks a player within the grade distribution", () => {
    const dist: GradeDistribution = {
      grade: "A Grade",
      fromSeason: 2021,
      toSeason: 2025,
      minInnings: 10,
      minOvers: 50,
      players: [
        player(1, 100, 10, 6),
        player(2, 200, 20, 5),
        player(3, 300, 30, 4),
        player(4, 400, 40, null),
        player(5, 500, 50, 3),
      ],
      best: {
        games: 10,
        catches: 1,
        runs: 500,
        battingAverage: 50,
        highScore: 50,
        fifties: 1,
        hundreds: 0,
        battingStrikeRate: null,
        wickets: 10,
        maidens: 2,
        fiveWickets: 0,
        bowlingAverage: 18,
        economy: 3,
        bowlingStrikeRate: 36,
      },
    };
    const r = playerRanks(dist, 3, ["battingAverage", "economy", "battingStrikeRate"]);
    if (!r.ok) throw new Error(r.reason);
    const [avg, econ, sr] = r.data;
    expect(avg).toMatchObject({ value: 30, percentile: 50, pctOfBest: 60, qualifiers: 5 });
    // Economy 4 among [6,5,4,3]: beats two, so (2 + 0.5) / 4.
    expect(econ).toMatchObject({ value: 4, percentile: 62.5, pctOfBest: 75, lowerIsBetter: true });
    expect(sr.percentile).toBeNull();

    expect(playerRanks(dist, 99, ["runs"]).ok).toBe(false);
  });
});
