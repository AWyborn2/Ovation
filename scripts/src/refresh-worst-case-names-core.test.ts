import { describe, expect, it } from "vitest";
import {
  firstLast,
  fixtureSource,
  pickWorstCaseNames,
  standInName,
  type NameSources,
} from "./refresh-worst-case-names-core";

const source = (over: Partial<NameSources>): NameSources => ({
  label: "test",
  teams: [],
  grades: [],
  venues: [],
  players: [],
  ...over,
});

describe("standInName", () => {
  it("keeps the shape of a name and none of its letters", () => {
    const real = "Alexander O'Brien-Featherstonehaugh";
    const stand = standInName(real);
    expect(stand).toHaveLength(real.length);
    expect(stand.replace(/\p{L}/gu, "x")).toBe(real.replace(/\p{L}/gu, "x"));
    expect(stand).not.toContain("Alexander");
    expect(stand).not.toContain("Brien");
    expect(stand.split(/[\s'-]/).every((w) => /^[A-Z]/.test(w))).toBe(true);
  });
});

describe("firstLast", () => {
  it("turns WA's 'Last, First' into 'First Last'", () => {
    expect(firstLast("Saxon,  Tate")).toBe("Tate Saxon");
    expect(firstLast("Tate Saxon")).toBe("Tate Saxon");
  });
});

describe("pickWorstCaseNames", () => {
  const names = pickWorstCaseNames(
    [
      source({
        label: "PCA",
        teams: [
          "Halls Head Cricket Club",
          "Mandurah",
          "Rockingham Mandurah Districts Cricket Club Inc",
        ],
        grades: ["A Grade", "Western District Female Premier Championship Grade", "Under 13 Blue"],
        venues: ["Rushton Park", "Mike Barnett Sports Complex Oval 2"],
        players: ["Sam Smith", "Alexander Featherstonehaugh-Smith"],
      }),
      source({
        label: "WA",
        teams: ["Mandurah"],
        grades: ["Graham McKenzie Shield (Male Under 14s)"],
        players: ["Jo Bloggs"],
      }),
    ],
    2,
  );

  it("ranks names by the length a card prints, longest first, without repeats", () => {
    expect(names.sources).toEqual(["PCA", "WA"]);
    expect(names.teams).toHaveLength(2);
    expect(names.teams[0]!.raw).toBe("Rockingham Mandurah Districts Cricket Club Inc");
    expect(names.venues).toEqual(["Mike Barnett Sports Complex Oval 2", "Rushton Park"]);
  });

  it("keeps junior grades apart, 'Under 14s' included", () => {
    expect(names.grades.map((g) => g.raw)).toEqual([
      "Western District Female Premier Championship Grade",
      "A Grade",
    ]);
    expect(names.juniorGrades.map((g) => g.raw).sort()).toEqual(
      ["Graham McKenzie Shield (Male Under 14s)", "Under 13 Blue"].sort(),
    );
  });

  it("commits stand-ins for players, never the names", () => {
    expect(names.players[0]).toHaveLength("Alexander Featherstonehaugh-Smith".length);
    expect(fixtureSource(names)).not.toContain("Featherstonehaugh");
    expect(fixtureSource(names)).toContain("export const WORST_CASE_NAMES");
  });
});
