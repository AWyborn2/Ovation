/** A list's row choice (full draft editor plan, stages 4 and 5): whose, sorted how, how many. */
import { describe, expect, it } from "vitest";
import {
  economyText,
  effectivePick,
  isPerformanceRepeat,
  isPickableRepeat,
  oversToBalls,
  performanceEntries,
  performancePickRows,
  pickRowIndexes,
  pickSortsFor,
  pickStat,
  strikeRateText,
} from "./rows-pick";
import type { MatchSummaryInnings } from "../match-summary-types";

const bat = (name: string, runs: number, balls: number | null, side: string, notOut = false) => ({
  name,
  runs: `${runs}${notOut ? "*" : ""}`,
  runsOnly: String(runs),
  notOut: notOut ? "*" : "",
  balls: balls == null ? "" : String(balls),
  side,
});
const bowl = (name: string, wickets: number, runs: number, side: string, overs = "") => ({
  name,
  figures: `${wickets}/${runs}`,
  overs,
  side,
});

// Innings 1 (the club batting), then innings 2 (the opposition batting).
const BATTING = [
  bat("Club A", 20, 30, "club"),
  bat("Club B", 64, 50, "club"),
  bat("Club C", 64, 41, "club"),
  bat("Club D", 5, 9, "club"),
  bat("Opp A", 88, 70, "opposition"),
  bat("Opp B", 12, null, "opposition"),
];
const BOWLING = [
  bowl("Opp X", 2, 30, "opposition"),
  bowl("Opp Y", 4, 41, "opposition"),
  bowl("Club X", 3, 20, "club"),
  bowl("Club Y", 3, 18, "club"),
  bowl("Club Z", 1, 12, "club"),
];
const names = (rows: Array<{ name: string }>, picked: number[]) => picked.map((i) => rows[i]!.name);

describe("which lists take a row choice", () => {
  it("knows the performance and innings batting and bowling lists", () => {
    expect(isPerformanceRepeat("performances.batting")).toBe(true);
    expect(isPerformanceRepeat("innings1.batting")).toBe(false);
    expect(isPickableRepeat("innings2.bowling")).toBe(true);
    expect(isPickableRepeat("innings1.pairs")).toBe(false);
    expect(isPickableRepeat("players")).toBe(false);
    expect(pickStat("performances.bowling")).toBe("bowling");
    expect(pickStat("innings1.batting")).toBe("batting");
    expect(pickStat("leaders")).toBeNull();
  });

  it("draws every row without a choice; a choice without a side keeps both teams (D4)", () => {
    expect(effectivePick("performances.batting", undefined)).toBeNull();
    expect(effectivePick("performances.batting", { count: 0 })).toEqual({ count: 0 });
    expect(effectivePick("innings1.batting", { side: "both", count: 2 })).toEqual({ count: 2 });
    expect(effectivePick("innings1.batting", undefined)).toBeNull();
    expect(effectivePick("players", { count: 2 })).toBeNull();
  });

  it("offers each stat its own sorts, and stage 4's three on either", () => {
    expect(pickSortsFor("batting")).toEqual(["runs", "balls", "strikeRate", "wickets", "figures"]);
    expect(pickSortsFor("bowling")).toEqual(["wickets", "figures", "economy", "runs"]);
  });
});

describe("cricket numbers", () => {
  it("reads overs as overs and balls", () => {
    expect(oversToBalls("8.3")).toBe(51);
    expect(oversToBalls("10")).toBe(60);
    expect(oversToBalls("")).toBeNull();
    expect(oversToBalls("4.7")).toBeNull();
  });

  it("formats strike rate and economy, empty without balls", () => {
    expect(strikeRateText(45, 36)).toBe("125.0");
    expect(strikeRateText(12, null)).toBe("");
    expect(strikeRateText(0, 0)).toBe("");
    expect(economyText(28, "8.3")).toBe("3.29");
    expect(economyText(10, "")).toBe("");
  });
});

describe("pickRowIndexes", () => {
  it("draws every performance of both teams in scorecard order without a choice (D4)", () => {
    expect(pickRowIndexes("performances.batting", BATTING, undefined)).toEqual([0, 1, 2, 3, 4, 5]);
    // A choice that names no side keeps both teams too.
    expect(names(BATTING, pickRowIndexes("performances.batting", BATTING, { count: 2 }))).toEqual([
      "Club A",
      "Club B",
    ]);
  });

  it("filters by side: the opposition's, or both sides together", () => {
    const opp = pickRowIndexes("performances.batting", BATTING, { side: "opposition" });
    expect(names(BATTING, opp)).toEqual(["Opp A", "Opp B"]);
    const both = pickRowIndexes("performances.batting", BATTING, {
      side: "both",
      sort: "runs",
      count: 3,
    });
    expect(names(BATTING, both)).toEqual(["Opp A", "Club C", "Club B"]);
  });

  it("keeps all, the best, or the top N", () => {
    const all = pickRowIndexes("performances.batting", BATTING, { side: "club", count: 0 });
    // No sort: the bound order.
    expect(names(BATTING, all)).toEqual(["Club A", "Club B", "Club C", "Club D"]);
    const best = pickRowIndexes("performances.batting", BATTING, {
      side: "club",
      count: 1,
      sort: "runs",
    });
    expect(names(BATTING, best)).toEqual(["Club C"]);
  });

  it("sorts bowlers by wickets, then fewest runs; figures sorts the same way", () => {
    const club = { side: "club" as const, count: 0, sort: "wickets" as const };
    expect(names(BOWLING, pickRowIndexes("performances.bowling", BOWLING, club))).toEqual([
      "Club Y",
      "Club X",
      "Club Z",
    ]);
    const both = { side: "both" as const, count: 2, sort: "figures" as const };
    expect(names(BOWLING, pickRowIndexes("performances.bowling", BOWLING, both))).toEqual([
      "Opp Y",
      "Club Y",
    ]);
    // A bowling list set to "runs" still orders by its own stat, figures.
    const runs = { side: "club" as const, count: 1, sort: "runs" as const };
    expect(names(BOWLING, pickRowIndexes("performances.bowling", BOWLING, runs))).toEqual([
      "Club Y",
    ]);
  });

  it("applies count and sort to an innings list, ignoring side", () => {
    const innings = BATTING.slice(0, 4);
    expect(pickRowIndexes("innings1.batting", innings, undefined)).toEqual([0, 1, 2, 3]);
    const top = pickRowIndexes("innings1.batting", innings, {
      side: "opposition",
      count: 2,
      sort: "runs",
    });
    expect(names(innings, top)).toEqual(["Club C", "Club B"]);
  });

  it("sorts batters by balls faced or strike rate, rows without balls last", () => {
    const balls = pickRowIndexes("performances.batting", BATTING, { sort: "balls" });
    expect(names(BATTING, balls)).toEqual([
      "Opp A",
      "Club B",
      "Club C",
      "Club A",
      "Club D",
      "Opp B",
    ]);
    // 64 off 41 (156.1), 64 off 50 (128), 88 off 70 (125.7), 20 off 30, 5 off 9.
    const sr = pickRowIndexes("performances.batting", BATTING, { sort: "strikeRate" });
    expect(names(BATTING, sr)).toEqual(["Club C", "Club B", "Opp A", "Club A", "Club D", "Opp B"]);
  });

  it("sorts bowlers by economy, lowest first, rows without overs last", () => {
    const rows = [
      bowl("Four an over", 1, 40, "club", "10"),
      bowl("No overs", 3, 10, "club"),
      bowl("Three an over", 2, 15, "club", "5"),
      bowl("Part over", 0, 6, "opposition", "1.3"), // 6 off 9 balls: 4.00
    ];
    const econ = pickRowIndexes("performances.bowling", rows, { sort: "economy" });
    expect(names(rows, econ)).toEqual(["Three an over", "Four an over", "Part over", "No overs"]);
  });

  it("filters by a minimum of runs or wickets, and not outs", () => {
    const fifty = pickRowIndexes("performances.batting", BATTING, { minRuns: 50 });
    expect(names(BATTING, fifty)).toEqual(["Club B", "Club C", "Opp A"]);
    const threes = pickRowIndexes("performances.bowling", BOWLING, {
      minWickets: 3,
      side: "club",
    });
    expect(names(BOWLING, threes)).toEqual(["Club X", "Club Y"]);
    const rows = [bat("Out", 40, 30, "club"), bat("Not out", 12, 10, "club", true)];
    expect(names(rows, pickRowIndexes("innings1.batting", rows, { notOutOnly: true }))).toEqual([
      "Not out",
    ]);
  });

  it("changes nothing when applied to the rows it already chose (a slide's share)", () => {
    const pick = { side: "both" as const, sort: "strikeRate" as const, count: 4, minRuns: 5 };
    const first = pickRowIndexes("performances.batting", BATTING, pick).map((i) => BATTING[i]!);
    expect(pickRowIndexes("performances.batting", first, pick)).toEqual([0, 1, 2, 3]);
  });

  it("leaves any other list as bound", () => {
    expect(pickRowIndexes("players", BATTING, { count: 1, sort: "runs" })).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
  });
});

describe("a result's performances", () => {
  const innings: MatchSummaryInnings[] = [
    {
      teamKey: "opposition",
      inningsNum: 1,
      totalRuns: "150",
      wickets: "10",
      overs: "40",
      topBatters: [],
      topBowlers: [],
      batters: [{ name: "Opp A", runs: 50, balls: 60 }],
      bowlers: [{ name: "Club X", wickets: 3, runs: 20, overs: "8.3" }],
    },
    {
      teamKey: "club",
      inningsNum: 2,
      totalRuns: "151",
      wickets: "4",
      overs: "35",
      // An older input: the top three only.
      topBatters: [{ name: "Club A", runs: 70, balls: 80, notOut: true }],
      topBowlers: [{ name: "Opp X", wickets: 2, runs: 30, overs: "7" }],
    },
  ];

  it("lists every innings' batters and bowlers in scorecard order, each with its side", () => {
    const { batting, bowling } = performanceEntries(innings);
    expect(batting.map((e) => [e.player.name, e.side])).toEqual([
      ["Opp A", "opposition"],
      ["Club A", "club"],
    ]);
    expect(bowling.map((e) => [e.player.name, e.side])).toEqual([
      ["Club X", "club"],
      ["Opp X", "opposition"],
    ]);
  });

  it("gives the values a choice reads, as the binding formats them", () => {
    expect(performancePickRows(innings, "performances.batting")).toEqual([
      { runs: "50", runsOnly: "50", notOut: "", balls: "60", side: "opposition" },
      { runs: "70*", runsOnly: "70", notOut: "*", balls: "80", side: "club" },
    ]);
    expect(performancePickRows(innings, "performances.bowling")).toEqual([
      { figures: "3/20", overs: "8.3", side: "club" },
      { figures: "2/30", overs: "7", side: "opposition" },
    ]);
    expect(performancePickRows(innings, "innings1.batting")).toEqual([]);
  });
});
