import { describe, expect, it } from "vitest";
import { groupCarouselRounds, roundLabelOf, type RoundGame } from "./carousel-rounds";

const g = (id: number, season: number, day: string, round: string | null): RoundGame => ({
  id,
  season,
  day,
  round,
});

describe("roundLabelOf", () => {
  it("names numbered rounds and keeps finals as written", () => {
    expect(roundLabelOf("5")).toBe("Round 5");
    expect(roundLabelOf(12)).toBe("Round 12");
    expect(roundLabelOf("  Round   5 ")).toBe("Round 5");
    expect(roundLabelOf("Semi Final")).toBe("Semi Final");
    expect(roundLabelOf("")).toBeNull();
    expect(roundLabelOf(null)).toBeNull();
  });
});

describe("groupCarouselRounds", () => {
  const games = [
    g(1, 2026, "2026-11-14", "Round 6"),
    g(2, 2026, "2026-11-15", "round 6"),
    g(3, 2026, "2026-11-21", "Round 7"),
    g(4, 2026, "2026-11-28", "Round 8"),
    g(5, 2026, "2026-11-18", null),
    g(6, 2025, "2026-03-14", "Grand Final"),
    g(7, 2025, "2025-10-11", "1"),
  ];

  it("orders seasons newest first and rounds by date, Other games last", () => {
    const r = groupCarouselRounds(games, true, "2026-11-19");
    expect(r.seasons.map((s) => s.label)).toEqual(["2026/27", "2025/26"]);
    expect(r.seasons[0].rounds.map((x) => [x.label, x.from, x.to, x.gameIds])).toEqual([
      ["Round 6", "2026-11-14", "2026-11-15", [1, 2]],
      ["Round 7", "2026-11-21", "2026-11-21", [3]],
      ["Round 8", "2026-11-28", "2026-11-28", [4]],
      ["Other games", "2026-11-18", "2026-11-18", [5]],
    ]);
    expect(r.seasons[1].rounds.map((x) => x.label)).toEqual(["Round 1", "Grand Final"]);
  });

  it("opens an upcoming set on the next round, never Other games", () => {
    expect(groupCarouselRounds(games, true, "2026-11-19")).toMatchObject({
      defaultSeason: 2026,
      defaultRounds: ["r:round 7"],
    });
    // A round still being played (its last day is today) is the next round.
    expect(groupCarouselRounds(games, true, "2026-11-15").defaultRounds).toEqual(["r:round 6"]);
    // The season is over: the latest round.
    expect(groupCarouselRounds(games, true, "2027-01-01").defaultRounds).toEqual(["r:round 8"]);
  });

  it("opens a results set on the most recent completed round", () => {
    expect(groupCarouselRounds(games, false, "2026-11-30")).toMatchObject({
      defaultSeason: 2026,
      defaultRounds: ["r:round 8"],
    });
  });

  it("has no default without a labelled round", () => {
    expect(groupCarouselRounds([g(1, 2026, "2026-11-14", null)], true, "2026-11-01")).toEqual({
      seasons: [
        {
          season: 2026,
          label: "2026/27",
          rounds: [
            {
              key: "other",
              label: "Other games",
              from: "2026-11-14",
              to: "2026-11-14",
              other: true,
              gameIds: [1],
            },
          ],
        },
      ],
      defaultSeason: null,
      defaultRounds: [],
    });
    expect(groupCarouselRounds([], false, "2026-11-01")).toEqual({
      seasons: [],
      defaultSeason: null,
      defaultRounds: [],
    });
  });
});
