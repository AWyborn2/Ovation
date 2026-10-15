import { describe, expect, it } from "vitest";
import { dismissalWithoutNames, formatDismissal } from "./dismissal";

/**
 * Public junior scorecards keep only the mode of a dismissal, never the fielder or
 * bowler named in PlayHQ's text (junior PlayHQ sync review, security P1).
 */
describe("dismissalWithoutNames", () => {
  const cases: Array<[string, string]> = [
    ["c: O Green b: S Taylor", "c: b:"],
    ["C: O Green B: S Taylor", "c: b:"],
    ["c&b: S Taylor", "c&b:"],
    ["c & b: S Taylor", "c&b:"],
    ["st: K Keeper b: S Taylor", "st: b:"],
    ["lbw: S Taylor", "lbw:"],
    ["b: S Taylor", "b:"],
    ["run out (O Green)", "run out"],
    ["run out (O Green/K Keeper)", "run out"],
    ["run out", "run out"],
    ["not out", "not out"],
    ["Not Out", "not out"],
    ["retired hurt", "retired hurt"],
    ["retired", "retired"],
    ["retired out", "retired out"],
    ["did not bat", "did not bat"],
    ["dnb", "did not bat"],
    ["Caught", "c: b:"],
    ["Bowled", "b:"],
    ["Stumped", "st: b:"],
    ["LBW", "lbw:"],
    ["hit wicket: S Taylor", "hit wicket"],
    ["timed out", "timed out"],
  ];

  it.each(cases)("%s -> %s", (raw, expected) => {
    expect(dismissalWithoutNames(raw)).toBe(expected);
  });

  it("keeps a missing or blank dismissal as it was (not out)", () => {
    expect(dismissalWithoutNames(null)).toBeNull();
    expect(dismissalWithoutNames(undefined)).toBeNull();
    expect(dismissalWithoutNames("")).toBe("");
    expect(dismissalWithoutNames("   ")).toBe("");
  });

  it("fails closed on an unrecognised shape: 'out', never the raw text", () => {
    expect(dismissalWithoutNames("Olivia Green somehow")).toBe("out");
    expect(dismissalWithoutNames("obstructed by S Taylor")).toBe("out");
  });

  it("never carries a name through to the rendered scorecard text", () => {
    for (const [raw] of cases) {
      const stripped = dismissalWithoutNames(raw);
      const shown = formatDismissal(stripped, false);
      expect(shown).not.toMatch(/green|taylor|keeper/i);
    }
  });

  it("renders the stripped forms as plain modes", () => {
    const show = (raw: string) => formatDismissal(dismissalWithoutNames(raw), false);
    expect(show("c: O Green b: S Taylor")).toBe("caught");
    expect(show("c&b: S Taylor")).toBe("c & b");
    expect(show("st: K Keeper b: S Taylor")).toBe("st");
    expect(show("lbw: S Taylor")).toBe("lbw");
    expect(show("b: S Taylor")).toBe("bowled");
    expect(show("run out (O Green)")).toBe("run out");
  });
});
