import { describe, it, expect } from "vitest";
import type { matchesTable } from "@workspace/db";
import {
  premiershipSeasons,
  pickGrandFinal,
  linkPremiershipMatch,
} from "./premierships";

type GfMatch = Pick<
  typeof matchesTable.$inferSelect,
  "id" | "grade" | "season" | "opponent" | "matchDate" | "result"
>;

function byKey(matches: GfMatch[]): Map<string, GfMatch[]> {
  const map = new Map<string, GfMatch[]>();
  for (const m of matches) {
    const key = `${m.grade}|${m.season}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(m);
  }
  return map;
}

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

describe("linkPremiershipMatch", () => {
  const base = { year: 2024, grade: "A Grade", ...prem({ matchDate: "2024-03-16" }) };

  it("prefers an explicit Grand Final when one exists for the grade+season", () => {
    const gfByKey = byKey([gf({ id: 100, season: 2023 })]);
    const finalsByKey = byKey([gf({ id: 200, season: 2023 })]);
    expect(linkPremiershipMatch(base, gfByKey, finalsByKey)).toBe(100);
  });

  it("falls back to a Finals decider when there is no Grand Final", () => {
    // PPL T20 Cup / PCA Colts label their decider "Finals", not "Grand Final".
    const gfByKey = byKey([]);
    const finalsByKey = byKey([gf({ id: 200, season: 2023 })]);
    expect(linkPremiershipMatch(base, gfByKey, finalsByKey)).toBe(200);
  });

  it("returns null when neither a Grand Final nor a Finals exists", () => {
    expect(linkPremiershipMatch(base, byKey([]), byKey([]))).toBeNull();
  });

  it("disambiguates a multi-Finals season via opponent-in-result text", () => {
    // PPL 2025 (start-year) had two "Finals": one vs Waroona, the decider vs
    // Pinjarra. The premiership result text names Pinjarra, so that wins.
    const ppl2026 = {
      year: 2026,
      grade: "PPL",
      ...prem({
        competition: "Grand Final",
        matchDate: "2026-03-10",
        result: "Halls Head 6/167 def Pinjarra 9/137",
      }),
    };
    const finalsByKey = byKey([
      gf({ id: 11613, grade: "PPL", season: 2025, opponent: "Waroona Cricket Club", result: "Won", matchDate: "12:00 PM, Tuesday, 24 Feb 2026" }),
      gf({ id: 11612, grade: "PPL", season: 2025, opponent: "Pinjarra Cricket Club", result: "Won", matchDate: "12:00 PM, Tuesday, 10 Mar 2026" }),
    ]);
    expect(linkPremiershipMatch(ppl2026, byKey([]), finalsByKey)).toBe(11612);
  });

  it("does not fall back to Finals when a same-season Grand Final is present", () => {
    // If both exist, the Grand Final must win even if a Finals match looks like
    // a better opponent/text match — Finals is strictly a no-Grand-Final fallback.
    const gfByKey = byKey([gf({ id: 100, season: 2023, opponent: "Some Club", result: "Won" })]);
    const finalsByKey = byKey([gf({ id: 200, season: 2023, opponent: "Pinjarra", result: "Won" })]);
    expect(linkPremiershipMatch(base, gfByKey, finalsByKey)).toBe(100);
  });
});
