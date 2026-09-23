import { describe, it, expect } from "vitest";
import { clubAbbrev, gradeCode } from "./grade-code";

describe("gradeCode", () => {
  it.each([
    ["A Grade", "A"],
    ["b grade", "B"],
    ["Female A", "FA"],
    ["Female", "F"],
    ["Under 17s", "U17"],
    ["U15 Boys", "U15"],
    ["PPL", "PPL"],
    ["Colts", "COL"],
    ["", ""],
  ])("%s → %s", (input, out) => {
    expect(gradeCode(input)).toBe(out);
  });
});

describe("clubAbbrev", () => {
  it("prefers the short name", () => {
    expect(clubAbbrev("Mandurah Cricket Club", "man")).toBe("MAN");
  });
  it("uses initials for multi-word names, dropping 'Cricket Club'", () => {
    expect(clubAbbrev("Halls Head Cricket Club")).toBe("HH");
    expect(clubAbbrev("Baldivis Cricket Club")).toBe("BAL");
  });
  it("returns empty for no name", () => {
    expect(clubAbbrev(null)).toBe("");
  });
});
