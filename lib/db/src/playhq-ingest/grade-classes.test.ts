import { describe, expect, it } from "vitest";

import {
  classifyGrade,
  juniorReclassifications,
  mergeUnclassifiedGrades,
  unclassifiedGradesByOrg,
} from "./grade-classes";
import type { Row } from "./load";

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

describe("unclassifiedGradesByOrg", () => {
  const ENABLED = "4559f1b9-86d8-eb11-a7ad-2818780da0cc";
  const OTHER = "3d38cd53-8ad8-eb11-a7ad-2818780da0cc";
  const ASSOC = "11111111-2222-3333-4444-555555555555";
  const grade = (id: string, name: string, source: string, owner = ASSOC): Row => ({
    id,
    name,
    season_name: "2026/27",
    owner_org_id: owner,
    source_org_id: source,
    is_junior: false,
    raw: { teamNames: ["Halls Head Hawks", "Private Player"] },
  });

  it("lists an enabled organisation's unclassified grades once per grade and season", () => {
    const out = unclassifiedGradesByOrg(
      [
        grade("g1", "Mixed Social Twilight", ENABLED),
        grade("g1b", "Mixed Social Twilight", ENABLED),
        grade("g2", "A Grade", ENABLED),
        grade("g3", "Year 7 Gold", ENABLED),
        grade("g4", "Mixed Social Twilight", OTHER),
      ],
      new Set([ENABLED]),
    );
    expect(out).toEqual(
      new Map([[ENABLED, [{ grade: "Mixed Social Twilight", season: "2026/27" }]]]),
    );
    // No player names, team names or raw payloads travel with the report.
    expect(JSON.stringify([...out.values()])).not.toMatch(/Player|Hawks/);
  });

  it("files a grade under its owner organisation when that one is enabled", () => {
    const out = unclassifiedGradesByOrg(
      [grade("g1", "Mixed Social Twilight", OTHER, ENABLED.toUpperCase())],
      new Set([ENABLED]),
    );
    expect([...out.keys()]).toEqual([ENABLED]);
  });

  it("reports nothing for organisations that aren't enabled", () => {
    expect(
      unclassifiedGradesByOrg([grade("g1", "Mixed Social Twilight", OTHER)], new Set()).size,
    ).toBe(0);
  });
});

describe("mergeUnclassifiedGrades", () => {
  const twilight = { grade: "Mixed Social Twilight", season: "2026/27" };
  const indoor = { grade: "Indoor Mixed", season: "2026/27" };

  it("adds grades not yet recorded, once each, and says so", () => {
    expect(mergeUnclassifiedGrades([twilight], [twilight, indoor])).toEqual({
      grades: [twilight, indoor],
      changed: true,
    });
  });

  it("reports no change when every grade is already recorded", () => {
    expect(mergeUnclassifiedGrades([twilight, indoor], [indoor])).toEqual({
      grades: [twilight, indoor],
      changed: false,
    });
  });

  it("treats the same grade in another season as new", () => {
    const next = { ...twilight, season: "2027/28" };
    expect(mergeUnclassifiedGrades([twilight], [next]).grades).toEqual([twilight, next]);
  });

  it("tolerates a missing or malformed stored list", () => {
    expect(mergeUnclassifiedGrades(undefined, [twilight])).toEqual({
      grades: [twilight],
      changed: true,
    });
  });
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
