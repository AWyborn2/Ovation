import { describe, expect, it } from "vitest";
import { dismissalBreakdown } from "./dismissals";
import { inn, match } from "./test-fixtures";

describe("dismissal donut", () => {
  it("counts outs by type, including both innings of a two-innings match", () => {
    const r = dismissalBreakdown([
      match({
        innings: [
          inn({ runs: 3, dismissalType: "caught" }),
          inn({ runs: 20, dismissalType: "bowled" }),
        ],
      }),
      match({ innings: [inn({ runs: 9, dismissalType: "caught" })] }),
      match({ innings: [inn({ runs: 40, dismissalType: "retired" })] }),
      match({ innings: [inn({ runs: 60, notOut: true })] }),
    ]);
    if (!r.ok) throw new Error(r.reason);
    expect(r.data.outs).toBe(4);
    expect(r.data.innings).toBe(5);
    const by = Object.fromEntries(r.data.slices.map((s) => [s.key, s.count]));
    expect(by).toEqual({ caught: 2, bowled: 1, lbw: 0, runOut: 0, stumped: 0, other: 1 });
    expect(r.data.top.key).toBe("caught");
    expect(r.data.slices.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1);
  });

  it('returns "not recorded" for a player with no typed dismissals', () => {
    const r = dismissalBreakdown(
      [1, 2, 3, 4].map(() => match({ innings: [inn({ runs: 10, dismissalType: "other" })] })),
    );
    expect(r).toEqual({ ok: false, reason: "Dismissal detail not recorded" });
  });

  it("is insufficient under 3 dismissals", () => {
    const r = dismissalBreakdown([match({ innings: [inn({ runs: 1, dismissalType: "lbw" })] })]);
    expect(r.ok).toBe(false);
  });

  it("bowling mode says how wickets fell isn't recorded", () => {
    expect(dismissalBreakdown([], "bowl").ok).toBe(false);
  });
});
