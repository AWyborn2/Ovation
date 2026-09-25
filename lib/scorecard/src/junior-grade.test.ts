import { describe, it, expect } from "vitest";
import { isJuniorGradeLabel } from "./junior-grade";

describe("isJuniorGradeLabel", () => {
  it("matches junior grade labels", () => {
    for (const g of ["Under 15", "U13s", "U-17 Girls", "Juniors", "under14"]) {
      expect({ g, junior: isJuniorGradeLabel(g) }).toEqual({ g, junior: true });
    }
  });

  it("leaves senior grades, Colts included, alone", () => {
    for (const g of ["A Grade", "B Grade", "Colts", "PPL", "Masters", "1st Grade", null, ""]) {
      expect({ g, junior: isJuniorGradeLabel(g) }).toEqual({ g, junior: false });
    }
  });
});
