import { describe, expect, it } from "vitest";
import { battingSplits, bowlingSplits } from "./splits";
import { bowl, inn, match } from "./test-fixtures";
import { strikeRateOverKnownBalls } from "./shared";

describe("batting splits", () => {
  const rows = [
    match({ isHome: true, battedFirst: true, innings: [inn({ runs: 60, battingPos: 1 })] }),
    match({ isHome: true, battedFirst: false, innings: [inn({ runs: 20, battingPos: 3 })] }),
    match({ isHome: false, battedFirst: false, innings: [inn({ runs: 10, battingPos: 4 })] }),
    match({ isHome: false, battedFirst: true, innings: [inn({ runs: 30, battingPos: 6 })] }),
  ];

  it("flags the highest average in each group", () => {
    const r = battingSplits(rows);
    if (!r.ok) throw new Error(r.reason);
    const group = (k: string) => r.data.find((g) => g.key === k)!;
    expect(group("homeAway").rows.map((x) => [x.label, x.average, x.best])).toEqual([
      ["Home", 40, true],
      ["Away", 20, false],
    ]);
    expect(group("position").rows.find((x) => x.best)?.label).toBe("Opening");
    expect(group("situation").rows.find((x) => x.best)?.label).toBe("Batting first");
  });

  it("hides home/away when isHome is never known (native path)", () => {
    const r = battingSplits(rows.map((m) => ({ ...m, isHome: null })));
    if (!r.ok) throw new Error(r.reason);
    expect(r.data.map((g) => g.key)).toEqual(["position", "situation"]);
  });
});

describe("bowling splits", () => {
  it("flags the LOWEST bowling average as best", () => {
    const r = bowlingSplits([
      match({ isHome: true, battedFirst: true, ...bowl(4, 20) }),
      match({ isHome: false, battedFirst: false, ...bowl(2, 50) }),
    ]);
    if (!r.ok) throw new Error(r.reason);
    const homeAway = r.data.find((g) => g.key === "homeAway")!;
    expect(homeAway.rows.map((x) => [x.label, x.average, x.best])).toEqual([
      ["Home", 5, true],
      ["Away", 25, false],
    ]);
    const situation = r.data.find((g) => g.key === "situation")!;
    // Club batted first → this bowler was defending.
    expect(situation.rows.find((x) => x.best)?.label).toBe("Defending");
  });

  it("is insufficient for a non-bowler", () => {
    expect(bowlingSplits([match()]).ok).toBe(false);
  });
});

describe("strike rate over recorded balls", () => {
  it("ignores innings whose ball count is 0 (not recorded)", () => {
    expect(
      strikeRateOverKnownBalls([
        { runs: 80, balls: 0 },
        { runs: 30, balls: 40 },
        { runs: 5, balls: null },
      ]),
    ).toBeCloseTo(75);
    expect(strikeRateOverKnownBalls([{ runs: 80, balls: 0 }])).toBeNull();
  });
});
