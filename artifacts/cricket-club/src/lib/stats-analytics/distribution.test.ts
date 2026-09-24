import { describe, expect, it } from "vitest";
import { scoreDistribution, wicketDistribution } from "./distribution";
import { bowl, inn, match } from "./test-fixtures";

describe("distribution", () => {
  it("buckets every innings and computes 50→100 conversion", () => {
    const r = scoreDistribution([
      match({ innings: [inn({ runs: 0 }), inn({ runs: 9 })] }),
      match({ innings: [inn({ runs: 10 })] }),
      match({ innings: [inn({ runs: 49 })] }),
      match({ innings: [inn({ runs: 50, notOut: true })] }),
      match({ innings: [inn({ runs: 99 })] }),
      match({ innings: [inn({ runs: 100 })] }),
    ]);
    if (!r.ok) throw new Error(r.reason);
    expect(r.data.buckets.map((b) => b.count)).toEqual([2, 1, 1, 2, 1]);
    expect(r.data.buckets.reduce((s, b) => s + b.count, 0)).toBe(r.data.innings);
    expect(r.data.conversion).toBeCloseTo(1 / 3);
  });

  it("buckets wickets per bowling innings", () => {
    const r = wicketDistribution([
      match(bowl(0, 20)),
      match(bowl(1, 20)),
      match(bowl(3, 20)),
      match(bowl(6, 20)),
      match(),
    ]);
    if (!r.ok) throw new Error(r.reason);
    expect(r.data.buckets.map((b) => b.count)).toEqual([1, 1, 0, 1, 1]);
    expect(r.data.threePlus).toBe(2);
    expect(r.data.threePlusRate).toBe(0.5);
  });

  it("needs 3 innings", () => {
    expect(scoreDistribution([match({ innings: [inn({ runs: 4 })] })]).ok).toBe(false);
  });
});
