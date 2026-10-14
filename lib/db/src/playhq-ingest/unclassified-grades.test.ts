import { describe, expect, it } from "vitest";

import { findUnclassifiedGrades } from "./unclassified-grades";

const use = (gradeName: string | null, matches = 4, seasonName: string | null = "2026/27") => ({
  gradeName,
  seasonName,
  matches,
});

describe("findUnclassifiedGrades", () => {
  it("reports a competition name the classifier can't place", () => {
    expect(findUnclassifiedGrades([use("Peel Social Shield", 7)])).toEqual([
      {
        gradeName: "Peel Social Shield",
        seasonName: "2026/27",
        matches: 7,
        reason: "Ovation doesn't recognise this competition name",
      },
    ]);
  });

  it("stays quiet for grades Ovation does recognise, including the age-based ones", () => {
    const known = [
      "A Grade Wyllie Cup",
      "Senior Female B Grade",
      "PCA Colts Competition",
      "Over 40s A Grade",
      "Focus Cup Over 45s",
      "Masters Competition",
    ];
    expect(findUnclassifiedGrades(known.map((g) => use(g)))).toEqual([]);
  });

  it("stays quiet for deliberate exclusions (charity one-offs, junior grades)", () => {
    expect(
      findUnclassifiedGrades([use("Charity T20 Match"), use("Tony Mann Shield (Premier U15)")]),
    ).toEqual([]);
  });

  it("stays quiet for any grade the PlayHQ grade classifier calls junior", () => {
    // Stored before the ingest learned the loader's age banding, these can still sit in
    // playhq.grades with is_junior = false until the next ingest reclassifies them.
    expect(
      findUnclassifiedGrades([use("Peel Girls League"), use("Year 7 Gold"), use("U13 Boys")]),
    ).toEqual([]);
  });

  it("reports the grades the app has no equivalent for, with the classifier's reason", () => {
    const [r] = findUnclassifiedGrades([use("Female C Grade", 3)]);
    expect(r?.reason).toMatch(/Female C/);
  });

  it("ignores blank names and lists the busiest competition first", () => {
    const out = findUnclassifiedGrades([
      use(null),
      use("  "),
      use("Zeta Cup", 2),
      use("Alpha Cup", 9),
    ]);
    expect(out.map((r) => r.gradeName)).toEqual(["Alpha Cup", "Zeta Cup"]);
  });
});
