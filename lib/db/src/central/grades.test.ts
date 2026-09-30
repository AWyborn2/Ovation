/**
 * grades.test.ts — the central grade classifier. Covers the WA Premier Cricket
 * rules added for the second association (Phase 3) and pins the PCA behaviour
 * they sit beside, so extending the vocabulary can't silently reclassify PCA
 * labels (the *-consistency suites depend on PCA mapping staying identical).
 */
import { describe, expect, it } from "vitest";
import { appGradeFromCentral, classifyCentralGrade, isSeniorAppGrade } from "./grades";

describe("classifyCentralGrade — WA Premier Cricket labels", () => {
  it("maps numbered senior grades to '<n>th Grade'", () => {
    expect(appGradeFromCentral("1st Grade")).toBe("1st Grade");
    expect(appGradeFromCentral("2nd Grade")).toBe("2nd Grade");
    expect(appGradeFromCentral("3rd Grade")).toBe("3rd Grade");
    expect(appGradeFromCentral("4th Grade")).toBe("4th Grade");
    expect(appGradeFromCentral("10th Grade")).toBe("10th Grade");
  });

  it("maps word-ordinal / numbered-prefix variants to the same grade", () => {
    expect(appGradeFromCentral("01. Men's First Grade")).toBe("1st Grade");
    expect(appGradeFromCentral("Men's Second Grade")).toBe("2nd Grade");
  });

  it("keeps women's numbered grades distinct from men's", () => {
    expect(appGradeFromCentral("Women's First Grade")).toBe("Women's 1st Grade");
  });

  it("EXCLUDES junior / pathway competitions from the senior read (juniors isolation)", () => {
    for (const label of [
      "Tony Mann Shield (Premier U15)",
      "Ted Hussey Shield (Premier U17)",
      "U14 Girls",
      "U13s",
      "Year 5 Boys",
      "Yr 8 Mixed",
      "Junior Shield",
    ]) {
      const m = classifyCentralGrade(label);
      expect(m.appGrade, label).toBeNull();
      expect(m.note, label).toMatch(/junior/i);
    }
  });

  it("maps One-Day grades and Masters", () => {
    expect(appGradeFromCentral("One Day Grade 2")).toBe("One Day Grade 2");
    expect(appGradeFromCentral("Over 50 Men")).toBe("Masters");
    expect(appGradeFromCentral("Masters")).toBe("Masters");
    expect(appGradeFromCentral("Veterans Cup")).toBe("Masters");
  });

  it("maps WA senior T20 divisions to 'T20' without touching PCA T20 labels", () => {
    expect(appGradeFromCentral("Senior Men T20 Div1")).toBe("T20");
    expect(appGradeFromCentral("T20 Division 1")).toBe("T20");
  });

  it("routes WA female / colts labels through the existing PCA rules", () => {
    expect(appGradeFromCentral("Female B Grade T20")).toBe("Female B Grade");
    expect(appGradeFromCentral("Men's Colts League")).toBe("Colts");
  });
});

describe("classifyCentralGrade — PCA behaviour is unchanged", () => {
  it("letter grades, divisions and sponsor/cup suffixes", () => {
    expect(appGradeFromCentral("A Grade")).toBe("A Grade");
    expect(appGradeFromCentral("A Grade: Wyllie Cup")).toBe("A Grade");
    expect(appGradeFromCentral("C1 Grade")).toBe("C Grade");
    expect(appGradeFromCentral("C2 Grade")).toBe("C Grade");
    expect(appGradeFromCentral("T20: B Grade")).toBe("B Grade");
    expect(appGradeFromCentral("Mid-Year T20 C Grade")).toBe("C Grade");
  });

  it("PPL, Colts and female grades", () => {
    expect(appGradeFromCentral("PPL")).toBe("PPL");
    expect(appGradeFromCentral("Peel Premier League")).toBe("PPL");
    expect(appGradeFromCentral("ID Athletic PCA Colts Competition")).toBe("Colts");
    expect(appGradeFromCentral("Senior Female A Grade")).toBe("Female A Grade");
    expect(appGradeFromCentral("Rio Tinto Female A Grade")).toBe("Female A Grade");
  });

  it("deliberate PCA exclusions still return null", () => {
    expect(appGradeFromCentral("Female C Grade")).toBeNull();
    expect(appGradeFromCentral("Senior Female C Grade")).toBeNull();
    expect(appGradeFromCentral("Charity Match")).toBeNull();
    expect(appGradeFromCentral(null)).toBeNull();
    expect(appGradeFromCentral("")).toBeNull();
  });
});

describe("classifyCentralGrade — Ladies T20 is senior Female B Grade (plan U3)", () => {
  it("maps the Ladies T20 label to Female B Grade, with an explaining note", () => {
    const m = classifyCentralGrade("Ladies T20");
    expect(m.appGrade).toBe("Female B Grade");
    expect(m.note).toMatch(/ladies t20/i);
  });

  it("tolerates case and whitespace variants of the label", () => {
    expect(appGradeFromCentral("ladies t20")).toBe("Female B Grade");
    expect(appGradeFromCentral("  LADIES T20  ")).toBe("Female B Grade");
    expect(appGradeFromCentral("Ladies  T20")).toBe("Female B Grade");
  });

  it("leaves the other female grades where they were", () => {
    expect(appGradeFromCentral("Senior Female A Grade")).toBe("Female A Grade");
    expect(appGradeFromCentral("Rio Tinto Female A Grade")).toBe("Female A Grade");
    expect(appGradeFromCentral("Mid-Year T20 Female A Grade")).toBe("Female A Grade");
    expect(appGradeFromCentral("Senior Female B Grade")).toBe("Female B Grade");
  });

  it("keeps junior girls' competitions out of the senior read (juniors isolation)", () => {
    for (const label of ["Under 15 Girls", "Under 13 Girls", "U14 Girls", "U17 Girls T20"]) {
      expect(appGradeFromCentral(label), label).toBeNull();
    }
  });

  it("leaves WA women's labels unchanged", () => {
    expect(appGradeFromCentral("Women's First Grade")).toBe("Women's 1st Grade");
    expect(appGradeFromCentral("Women's 2nd Grade")).toBe("Women's 2nd Grade");
    expect(appGradeFromCentral("Female B Grade T20")).toBe("Female B Grade");
  });

  it("does not catch unrelated T20 labels", () => {
    expect(appGradeFromCentral("T20: B Grade")).toBe("B Grade");
    expect(appGradeFromCentral("Senior Men T20 Div1")).toBe("T20");
  });
});

describe("isSeniorAppGrade — the club overlay's history-row guard (U10, R8)", () => {
  it("accepts every senior app grade the classifier produces", () => {
    for (const g of [
      "A Grade",
      "F Grade",
      "Female A Grade",
      "Female B Grade",
      "PPL",
      "Colts",
      "1st Grade",
      "Women's 1st Grade",
      "One Day Grade 1",
      "Masters",
      "T20",
    ]) {
      expect([g, isSeniorAppGrade(g)]).toEqual([g, true]);
    }
  });

  it("rejects junior, unmapped and un-normalised labels", () => {
    for (const g of ["Under 15", "U15 Juniors", "Female C Grade", "Ladies T20", "", null]) {
      expect([g, isSeniorAppGrade(g)]).toEqual([g, false]);
    }
  });
});
