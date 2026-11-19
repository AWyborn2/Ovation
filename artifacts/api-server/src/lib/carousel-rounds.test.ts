import { describe, expect, it } from "vitest";
import { finalsRank, groupCarouselRounds, roundLabelOf, type RoundGame } from "./carousel-rounds";

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

  it("opens on the next round when a late game stretches an old round past today (round 9 retest, A4)", () => {
    // Round 1's senior games were in October; Female A Grade plays its Round 1 on 28 Nov.
    const late = [
      g(10, 2026, "2026-10-10", "Round 1"),
      g(11, 2026, "2026-10-11", "Round 1"),
      g(12, 2026, "2026-11-28", "Round 1"),
      g(13, 2026, "2026-11-14", "Round 6"),
      g(14, 2026, "2026-11-21", "Round 7"),
      g(15, 2026, "2026-11-22", "Round 7"),
      g(16, 2026, "2026-11-28", "Round 8"),
    ];
    const r = groupCarouselRounds(late, true, "2026-11-19");
    expect(r.defaultRounds).toEqual(["r:round 7"]);
    expect(r.seasons[0].rounds.find((x) => x.label === "Round 1")).toMatchObject({
      from: "2026-10-10",
      to: "2026-11-28",
      gameIds: [10, 11, 12],
    });
    // On the Sunday of Round 7 it is still the round on.
    expect(groupCarouselRounds(late, true, "2026-11-22").defaultRounds).toEqual(["r:round 7"]);
    // Round 7 done: Round 8 (from 28 Nov) beats Round 1's late game on the same day.
    expect(groupCarouselRounds(late, true, "2026-11-23").defaultRounds).toEqual(["r:round 8"]);
    // With only an old round's late game left, that round is the one to play.
    const onlyLate = late.filter((x) => x.id <= 12);
    expect(groupCarouselRounds(onlyLate, true, "2026-11-19").defaultRounds).toEqual(["r:round 1"]);
    // Results and match summaries still open on the most recent completed round.
    expect(groupCarouselRounds(late, false, "2026-11-30").defaultRounds).toEqual(["r:round 8"]);
  });

  it("sorts finals after every numbered round, in finals order", () => {
    const season = [
      g(1, 2025, "2026-02-14", "Round 17"),
      g(2, 2025, "2026-03-07", "Grand Final"),
      g(3, 2025, "2026-02-21", "Semi Final"),
      g(4, 2025, "2026-02-14", "Elimination Final"),
      g(5, 2025, "2026-02-28", "Round 18"),
      g(6, 2025, "2026-02-28", "Preliminary Final"),
      g(7, 2025, "2026-02-14", "Qualifying Final"),
      g(8, 2025, "2026-01-10", null),
      g(9, 2025, "2025-10-11", "1"),
    ];
    expect(
      groupCarouselRounds(season, false, "2026-04-01").seasons[0].rounds.map((r) => r.label),
    ).toEqual([
      "Round 1",
      "Round 17",
      "Round 18",
      "Qualifying Final",
      "Elimination Final",
      "Semi Final",
      "Preliminary Final",
      "Grand Final",
      "Other games",
    ]);
    // The default is still the most recent round played: the grand final.
    expect(groupCarouselRounds(season, false, "2026-04-01").defaultRounds).toEqual([
      "r:grand final",
    ]);
  });

  it("ranks finals labels", () => {
    expect(finalsRank("Qualifying Final")).toBeLessThan(finalsRank("Elimination Final")!);
    expect(finalsRank("Elimination Final")).toBeLessThan(finalsRank("Semi-Final")!);
    expect(finalsRank("Quarter Final")).toBeLessThan(finalsRank("semi final")!);
    expect(finalsRank("Semi Final")).toBeLessThan(finalsRank("Preliminary Final")!);
    expect(finalsRank("Preliminary Final")).toBeLessThan(finalsRank("Final")!);
    expect(finalsRank("Final")).toBeLessThan(finalsRank("GRAND FINAL")!);
    expect(finalsRank("SF")).toBe(finalsRank("Semi Final"));
    expect(finalsRank("GF")).toBe(finalsRank("Grand Final"));
    expect(finalsRank("Round 5")).toBeNull();
    expect(finalsRank("Trial Match")).toBeNull();
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
