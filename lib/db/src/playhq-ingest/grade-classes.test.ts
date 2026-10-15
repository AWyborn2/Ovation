import { describe, expect, it } from "vitest";

import { classifyGrade, juniorReclassifications } from "./grade-classes";

describe("classifyGrade", () => {
  it.each([
    "Year 7 Gold",
    "Year 4 South",
    "Year 10-11 Boys South West",
    "U13 Boys",
    "Under 15 Girls",
    "Peel Girls League",
    "Ted Hussey Shield (Male Under 17s)",
    "Tony Mann Shield (Premier U15)",
    "Female Youth League Under 14s",
    "Junior Shield",
    "Woolworths Blast",
  ])("%s is junior", (name) => {
    expect(classifyGrade(name)).toBe("junior");
  });

  it.each([
    "A Grade",
    "A Grade: Wyllie Cup",
    "T20: B Grade",
    "Peel Premier League",
    "Colts",
    "Men's Colts League",
    "Female B Grade",
    "Senior Female A Grade",
    "Ladies T20",
    "Men's First Grade",
    "Women's 2nd Grade",
    "One Day Grade 1",
    "Senior Men T20 Div1",
    "Veterans Cup",
  ])("%s is senior", (name) => {
    expect(classifyGrade(name)).toBe("senior");
  });

  it.each(["Mixed Social Twilight", "Female C Grade", "Charity Match", "", null])(
    "%s is unclassified",
    (name) => {
      expect(classifyGrade(name)).toBe("unclassified");
    },
  );
});

describe("juniorReclassifications", () => {
  // Stored before the classifier learned the loader's age banding (adversarial review P2):
  // e.g. "Peel Girls League" sits in playhq.grades with is_junior = false.
  const stored = [
    { id: "g1", name: "Peel Girls League", isJunior: false },
    { id: "g2", name: "A Grade", isJunior: false },
    { id: "g3", name: "Year 7 Gold", isJunior: true },
    { id: "g4", name: "Mixed Social Twilight", isJunior: false },
    { id: "g5", name: "Under 15 Girls", isJunior: false },
    { id: "g6", name: null, isJunior: false },
  ];

  it("returns the stored senior grades the classifier now calls junior", () => {
    expect(juniorReclassifications(stored).map((g) => g.id)).toEqual(["g1", "g5"]);
  });

  it("never reclassifies a junior grade back to senior, or guesses an unclassified one", () => {
    const ids = juniorReclassifications(stored).map((g) => g.id);
    expect(ids).not.toContain("g3");
    expect(ids).not.toContain("g4");
    expect(ids).not.toContain("g6");
  });
});
