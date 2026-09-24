import { describe, expect, it } from "vitest";
import { battedFirstFrom, buildInningsLines, centralOversToBalls, sumKnown } from "./match-innings";

const line = (
  innings: number,
  runs: number,
  dismissal: string,
  dismissalType: string | null,
  batOrder = 3,
) => ({ innings, batOrder, runs, balls: runs * 2, dismissal, dismissalType });

describe("buildInningsLines", () => {
  it("a two-innings match (out, then not out) yields two innings in order", () => {
    const out = buildInningsLines([
      line(3, 12, "not out", "not out", 5),
      line(1, 40, "c: A Smith b: J Nguyen", "caught", 4),
    ]);
    expect(out).toEqual([
      {
        innings: 1,
        runs: 40,
        balls: 80,
        notOut: false,
        battingPos: 4,
        dismissal: "c: A Smith b: J Nguyen",
        dismissalType: "caught",
      },
      {
        innings: 3,
        runs: 12,
        balls: 24,
        notOut: true,
        battingPos: 5,
        dismissal: "not out",
        dismissalType: "not out",
      },
    ]);
  });

  it("drops did-not-bat lines (not innings) and counts retired hurt as not out", () => {
    const out = buildInningsLines([
      line(1, 0, "did not bat", "other"),
      line(3, 20, "retired hurt", "other"),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ innings: 3, notOut: true, dismissal: "retired hurt" });
  });
});

describe("battedFirstFrom (match-level innings numbers)", () => {
  it("the side with the lower minimum innings batted first", () => {
    // one innings each (1 vs 2), or two each (1,3 vs 2,4 → minima 1 vs 2)
    expect(battedFirstFrom(1, 2)).toBe(true);
    expect(battedFirstFrom(2, 1)).toBe(false);
  });

  it("falls back to innings 1 when only one side batted", () => {
    expect(battedFirstFrom(1, null)).toBe(true);
    expect(battedFirstFrom(null, 1)).toBe(false);
    expect(battedFirstFrom(2, undefined)).toBeNull();
  });

  it("is unknown with no lines or an impossible tie", () => {
    expect(battedFirstFrom(null, null)).toBeNull();
    expect(battedFirstFrom(1, 1)).toBeNull();
  });
});

describe("centralOversToBalls (ball notation stored as a double)", () => {
  it("converts whole and part overs", () => {
    expect(centralOversToBalls(4)).toBe(24);
    expect(centralOversToBalls(4.3)).toBe(27);
    expect(centralOversToBalls(10.5)).toBe(65);
    expect(centralOversToBalls(0.1)).toBe(1);
  });

  it("returns null for NULL and impossible ball digits", () => {
    expect(centralOversToBalls(null)).toBeNull();
    expect(centralOversToBalls(3.7)).toBeNull();
  });
});

describe("sumKnown", () => {
  it("is null only when nothing is known", () => {
    expect(sumKnown([])).toBeNull();
    expect(sumKnown([null, undefined])).toBeNull();
    expect(sumKnown([0, null])).toBe(0);
    expect(sumKnown([3, null, 4])).toBe(7);
  });
});
