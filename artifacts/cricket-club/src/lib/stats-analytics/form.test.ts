import { describe, expect, it } from "vitest";
import { battingForm, bowlingForm } from "./form";
import { bowl, inn, match } from "./test-fixtures";

describe("form guide", () => {
  it("returns the last 10 INNINGS newest first (a two-innings match gives two)", () => {
    // 5 single-innings matches then 3 two-innings matches = 11 innings.
    const rows = [
      ...[1, 2, 3, 4, 5].map((r) => match({ season: 2024, round: r, innings: [inn({ runs: r })] })),
      ...[6, 7, 8].map((r) =>
        match({
          season: 2024,
          round: r,
          innings: [inn({ runs: r * 10 }), inn({ runs: r * 10 + 1 })],
        }),
      ),
    ];
    // Shuffle to prove ordering doesn't rely on the API's order.
    const r = battingForm([...rows].reverse());
    if (!r.ok) throw new Error(r.reason);
    expect(r.data.entries).toHaveLength(10);
    expect(r.data.entries.map((e) => e.runs)).toEqual([81, 80, 71, 70, 61, 60, 5, 4, 3, 2]);
    expect(r.data.entries[0].inningsNo).toBe(2);
  });

  it("marks a not-out 50 as ≥50 with a star", () => {
    const r = battingForm([
      match({ round: 1, innings: [inn({ runs: 12 })] }),
      match({ round: 2, innings: [inn({ runs: 49 })] }),
      match({ round: 3, innings: [inn({ runs: 50, notOut: true })] }),
    ]);
    if (!r.ok) throw new Error(r.reason);
    const [latest, prev] = r.data.entries;
    expect(latest).toMatchObject({ runs: 50, notOut: true, label: "50*", highlight: true });
    expect(prev.highlight).toBe(false);
    // 111 runs / 2 outs over the window.
    expect(r.data.recentAverage).toBeCloseTo(55.5);
  });

  it("gives the delta against the range average", () => {
    const rows = [
      ...Array.from({ length: 10 }, (_, i) =>
        match({ season: 2020, round: i + 1, innings: [inn({ runs: 10 })] }),
      ),
      ...Array.from({ length: 10 }, (_, i) =>
        match({ season: 2024, round: i + 1, innings: [inn({ runs: 30 })] }),
      ),
    ];
    const r = battingForm(rows);
    if (!r.ok) throw new Error(r.reason);
    expect(r.data.recentAverage).toBe(30);
    expect(r.data.rangeAverage).toBe(20);
    expect(r.data.delta).toBe(10);
  });

  it("marks bowling returns of 3+ wickets", () => {
    const r = bowlingForm([
      match({ round: 1, ...bowl(1, 30) }),
      match({ round: 2, ...bowl(3, 25) }),
      match({ round: 3, ...bowl(2, 12) }),
      match({ round: 4 }),
    ]);
    if (!r.ok) throw new Error(r.reason);
    expect(r.data.entries.map((e) => [e.figures, e.highlight])).toEqual([
      ["2/12", false],
      ["3/25", true],
      ["1/30", false],
    ]);
  });

  it("is insufficient for a non-bowler", () => {
    expect(bowlingForm([match({ innings: [inn({ runs: 5 })] })])).toEqual({
      ok: false,
      reason: "No bowling recorded in this range",
    });
  });
});
