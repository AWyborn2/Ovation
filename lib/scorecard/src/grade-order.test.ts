import { describe, expect, it } from "vitest";
import { gradeSeniorityRank, sortByGradeOrder } from "./grade-order";

const grades = (rows: string[], club?: string[]) => sortByGradeOrder(rows, (g) => g, club);

describe("sortByGradeOrder", () => {
  it("puts WA Premier grades in seniority order, men before women", () => {
    expect(
      grades([
        "4th Grade",
        "3rd Grade",
        "2nd Grade",
        "1st Grade",
        "Female A Grade",
        "Female B Grade",
      ]),
    ).toEqual([
      "1st Grade",
      "2nd Grade",
      "3rd Grade",
      "4th Grade",
      "Female A Grade",
      "Female B Grade",
    ]);
  });

  it("puts lettered grades in order, then PPL and Colts", () => {
    expect(
      grades(["Colts", "G Grade", "C Grade", "Female A Grade", "A Grade", "PPL", "B Grade"]),
    ).toEqual(["A Grade", "B Grade", "C Grade", "G Grade", "Female A Grade", "PPL", "Colts"]);
  });

  it("follows the club's own order first, then seniority", () => {
    expect(
      grades(["2nd Grade", "Female A Grade", "1st Grade"], ["female a grade", "2nd Grade"]),
    ).toEqual(["Female A Grade", "2nd Grade", "1st Grade"]);
  });

  it("keeps unknown grades last, in their original order", () => {
    expect(grades(["Zeta", "1st Grade", "Alpha"])).toEqual(["1st Grade", "Zeta", "Alpha"]);
    expect(gradeSeniorityRank("Women's 2nd Grade")).toBeGreaterThan(
      gradeSeniorityRank("Female B Grade"),
    );
  });
});
