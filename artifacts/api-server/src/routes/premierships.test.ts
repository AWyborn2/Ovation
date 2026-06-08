import { describe, it, expect } from "vitest";
import type { matchesTable } from "@workspace/db";
import { premiershipSeasons, pickGrandFinal } from "./premierships";

type GfMatch = Pick<
  typeof matchesTable.$inferSelect,
  "id" | "grade" | "season" | "opponent" | "matchDate" | "result"
>;

function gf(overrides: Partial<GfMatch> & { id: number }): GfMatch {
  return {
    grade: "A Grade",
    season: 2023,
    opponent: "Pinjarra",
    matchDate: null,
    result: "Won",
    ...overrides,
  };
}

function prem(overrides: Partial<{
  result: string | null;
  competition: string;
  matchDate: string | null;
}> = {}) {
  return {
    result: "Won",
    competition: "A Grade",
    matchDate: null,
    ...overrides,
  };
}

describe("premiershipSeasons", () => {
  it("maps a season-ending (March) final to the previous start-year", () => {
    // March 2024 final belongs to season 2023 (2023/24).
    expect(premiershipSeasons(2024, "2024-03-21")).toEqual([2023]);
  });

  it("treats January-June finals as season-ending", () => {
    expect(premiershipSeasons(2024, "2024-01-15")).toEqual([2023]);
    expect(premiershipSeasons(2024, "2024-06-30")).toEqual([2023]);
  });

  it("maps a mid-season (December) T20 final to the same calendar year", () => {
    // December 2023 final belongs to season 2023 (2023/24).
    expect(premiershipSeasons(2023, "2023-12-10")).toEqual([2023]);
  });

  it("treats July-December finals as mid-season", () => {
    expect(premiershipSeasons(2023, "2023-07-01")).toEqual([2023]);
    expect(premiershipSeasons(2023, "2023-11-20")).toEqual([2023]);
  });

  it("returns both candidate seasons when there is no usable final date", () => {
    expect(premiershipSeasons(2024, null)).toEqual([2023, 2024]);
    expect(premiershipSeasons(2024, undefined)).toEqual([2023, 2024]);
    expect(premiershipSeasons(2024, "")).toEqual([2023, 2024]);
  });

  it("falls back to both seasons when the date is unparseable", () => {
    expect(premiershipSeasons(2024, "not-a-date")).toEqual([2023, 2024]);
  });
});

describe("pickGrandFinal", () => {
  it("returns null when there are no candidates (no match in the database)", () => {
    expect(pickGrandFinal([], prem())).toBeNull();
  });

  it("returns the only candidate when there is exactly one", () => {
    expect(pickGrandFinal([gf({ id: 7 })], prem())).toBe(7);
  });

  it("prefers the match whose date exactly matches the premiership date", () => {
    const candidates = [
      gf({ id: 1, matchDate: "12:00 PM, Saturday, 14 Mar 2024", result: "Won" }),
      gf({ id: 2, matchDate: "12:00 PM, Saturday, 21 Mar 2024", result: "Lost" }),
    ];
    // Exact-date wins even though id 1 is a Won and id 2 is a Lost.
    expect(pickGrandFinal(candidates, prem({ matchDate: "2024-03-21" }))).toBe(2);
  });

  it("disambiguates a season with two Grand Finals: cup vs T20", () => {
    const cupFinal = gf({ id: 10, opponent: "Pinjarra", result: "Won" });
    const t20Final = gf({ id: 11, opponent: "Mandurah T20", result: "Won" });
    const candidates = [cupFinal, t20Final];
    // A T20 premiership should pick the T20 final...
    expect(
      pickGrandFinal(candidates, prem({ competition: "A Grade T20" })),
    ).toBe(11);
    // ...and a non-T20 premiership should pick the cup final.
    expect(
      pickGrandFinal(candidates, prem({ competition: "A Grade" })),
    ).toBe(10);
  });

  it("prefers a Won result for a normal (decided) premiership", () => {
    const candidates = [
      gf({ id: 1, result: "Lost" }),
      gf({ id: 2, result: "Won" }),
    ];
    expect(pickGrandFinal(candidates, prem({ result: "Won" }))).toBe(2);
  });

  it("does not prefer a Won result for a washout/abandoned premiership", () => {
    const candidates = [
      gf({ id: 1, result: "Abandoned", opponent: "Pinjarra", matchDate: null }),
      gf({ id: 2, result: "Won", opponent: "Other Club", matchDate: null }),
    ];
    // Undecided premiership: the Won signal is skipped, so the opponent-in-result
    // text breaks the tie towards id 1 (Pinjarra appears in the result text).
    const result = pickGrandFinal(
      candidates,
      prem({ result: "Washout vs Pinjarra", competition: "A Grade" }),
    );
    expect(result).toBe(1);
  });

  it("falls back to opponent name appearing in the result text", () => {
    const candidates = [
      gf({ id: 1, opponent: "Halls Head", result: "Won" }),
      gf({ id: 2, opponent: "Pinjarra Cricket Club", result: "Won" }),
    ];
    expect(
      pickGrandFinal(candidates, prem({ result: "Won vs Pinjarra by 5 wkts" })),
    ).toBe(2);
  });

  it("falls back to most-recent date then lowest id when nothing else separates", () => {
    const candidates = [
      gf({ id: 5, matchDate: "12:00 PM, Saturday, 14 Mar 2020", result: "Won" }),
      gf({ id: 6, matchDate: "12:00 PM, Saturday, 21 Mar 2024", result: "Won" }),
    ];
    expect(pickGrandFinal(candidates, prem({ matchDate: null }))).toBe(6);
  });

  it("breaks a full tie by lowest id", () => {
    const candidates = [gf({ id: 9 }), gf({ id: 3 }), gf({ id: 12 })];
    expect(pickGrandFinal(candidates, prem())).toBe(3);
  });
});
