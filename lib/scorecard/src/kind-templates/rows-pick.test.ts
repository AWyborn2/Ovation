/** A list's row choice (full draft editor plan, stage 4): whose, sorted how, how many. */
import { describe, expect, it } from "vitest";
import {
  defaultPick,
  effectivePick,
  isPerformanceRepeat,
  isPickableRepeat,
  pickRowIndexes,
  pickStat,
} from "./rows-pick";

const bat = (name: string, runs: number, balls: number | null, side: string) => ({
  name,
  runs: String(runs),
  runsOnly: String(runs),
  balls: balls == null ? "" : String(balls),
  side,
});
const bowl = (name: string, wickets: number, runs: number, side: string) => ({
  name,
  figures: `${wickets}/${runs}`,
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

  it("starts a performance list as the club's top three (D4)", () => {
    expect(defaultPick("performances.batting")).toEqual({ side: "club", count: 3, sort: "runs" });
    expect(defaultPick("performances.bowling")).toEqual({
      side: "club",
      count: 3,
      sort: "wickets",
    });
    expect(defaultPick("innings1.batting")).toBeUndefined();
    // A choice without a side keeps to the club; an innings list has no side.
    expect(effectivePick("performances.batting", { count: 0 })).toEqual({
      side: "club",
      count: 0,
    });
    expect(effectivePick("innings1.batting", { side: "both", count: 2 })).toEqual({ count: 2 });
    expect(effectivePick("innings1.batting", undefined)).toBeNull();
    expect(effectivePick("players", { count: 2 })).toBeNull();
  });
});

describe("pickRowIndexes", () => {
  it("draws the club's top three batters without a choice, never the opposition's", () => {
    expect(names(BATTING, pickRowIndexes("performances.batting", BATTING, undefined))).toEqual([
      "Club C", // 64 off 41 beats 64 off 50
      "Club B",
      "Club A",
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

  it("leaves any other list as bound", () => {
    expect(pickRowIndexes("players", BATTING, { count: 1, sort: "runs" })).toEqual([
      0, 1, 2, 3, 4, 5,
    ]);
  });
});
