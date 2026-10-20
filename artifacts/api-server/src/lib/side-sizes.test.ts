import { describe, it, expect } from "vitest";
import { cleanAllPlayGrades, cleanSideSizes, gradeSideSize, gradeSideSpec } from "./side-sizes";

/** Players per side by grade (ADR-009): the pure helpers. */

describe("gradeSideSize", () => {
  it("reads the grade's size, and 12 for a grade with none or a bad value", () => {
    const map = { "A Grade": 14, "B Grade": 13, Junk: 15 };
    expect(gradeSideSize(map, "A Grade")).toBe(14);
    expect(gradeSideSize(map, " B Grade ")).toBe(13);
    expect(gradeSideSize(map, "C Grade")).toBe(12);
    expect(gradeSideSize(map, "Junk")).toBe(12);
    expect(gradeSideSize(null, "A Grade")).toBe(12);
  });
});

describe("cleanSideSizes", () => {
  it("trims grades and drops 12, the default", () => {
    expect(cleanSideSizes({ " A Grade ": 14, "B Grade": 12, "C Grade": 13 })).toEqual({
      sideSizes: { "A Grade": 14, "C Grade": 13 },
    });
  });

  it("refuses a size outside 12–14, a fraction, or a blank grade", () => {
    expect(cleanSideSizes({ "A Grade": 15 })).toEqual({
      error: "A Grade: a side has 12 to 14 players.",
    });
    expect(cleanSideSizes({ "A Grade": 11 })).toHaveProperty("error");
    expect(cleanSideSizes({ "A Grade": 12.5 })).toHaveProperty("error");
    expect(cleanSideSizes({ "  ": 13 })).toEqual({ error: "Each side size needs a grade." });
  });
});

describe("gradeSideSpec", () => {
  const settings = { sideSizes: { "A Grade": 14 }, allPlayGrades: [" C Grade", "A Grade"] };

  it("marks a grade at 12 on the all-play list as all play", () => {
    expect(gradeSideSpec(settings, "C Grade")).toEqual({ sideSize: 12, allPlay: true });
  });

  it("leaves other grades at 12 with a 12th", () => {
    expect(gradeSideSpec(settings, "B Grade")).toEqual({ sideSize: 12, allPlay: false });
    expect(gradeSideSpec({ sideSizes: null, allPlayGrades: null }, "B Grade")).toEqual({
      sideSize: 12,
      allPlay: false,
    });
  });

  it("ignores the list above 12", () => {
    expect(gradeSideSpec(settings, "A Grade")).toEqual({ sideSize: 14, allPlay: false });
  });
});

describe("cleanAllPlayGrades", () => {
  it("trims, and drops blanks and repeats", () => {
    expect(cleanAllPlayGrades([" C Grade ", "C Grade", "", "Colts"])).toEqual(["C Grade", "Colts"]);
  });
});
