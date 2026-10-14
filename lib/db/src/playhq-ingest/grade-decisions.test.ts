import { describe, expect, it } from "vitest";

import { classifyCentralGrade } from "../central/grades";
import {
  MAPPABLE_APP_GRADES,
  groupPending,
  loadMatchIdsForGradeKey,
  playhqGradeKey,
  validateGradeDecision,
} from "./grade-decisions";

describe("playhqGradeKey", () => {
  it("lowercases, drops season tokens and collapses whitespace like central.playhq_grade_key", () => {
    expect(playhqGradeKey("Over 45s Focus Cup")).toBe("over 45s focus cup");
    expect(playhqGradeKey("Over 45s Focus Cup 2025/26")).toBe("over 45s focus cup");
    expect(playhqGradeKey("  Over 45s   Focus Cup  2025-26 ")).toBe("over 45s focus cup");
    expect(playhqGradeKey("Focus Cup 2025")).toBe("focus cup");
    expect(playhqGradeKey("Summer 2024/2025 Social Shield")).toBe("summer social shield");
  });

  it("does not eat digits that aren't a year", () => {
    expect(playhqGradeKey("Over 45s")).toBe("over 45s");
    expect(playhqGradeKey("T20 Division 1")).toBe("t20 division 1");
    expect(playhqGradeKey("Year 6 - 30 OVERS")).toBe("year 6 - 30 overs");
  });

  it("is the same key for the same competition in different seasons", () => {
    expect(playhqGradeKey("Peel Social Shield 2025/26")).toBe(
      playhqGradeKey("Peel Social Shield 2026/27"),
    );
  });

  it("is empty for a blank name", () => {
    expect(playhqGradeKey(null)).toBe("");
    expect(playhqGradeKey("   ")).toBe("");
  });
});

describe("MAPPABLE_APP_GRADES", () => {
  it("only offers grades the classifier reads back as themselves", () => {
    for (const g of MAPPABLE_APP_GRADES) {
      expect([g, classifyCentralGrade(g).appGrade]).toEqual([g, g]);
    }
  });
});

describe("validateGradeDecision", () => {
  it("accepts a mapping to a mappable grade and keys it by the normalised name", () => {
    expect(
      validateGradeDecision({
        gradeName: " Peel Social Shield 2026/27 ",
        action: "map",
        centralGrade: "Over 45s",
      }),
    ).toEqual({
      ok: true,
      gradeKey: "peel social shield",
      gradeName: "Peel Social Shield 2026/27",
      centralGrade: "Over 45s",
    });
  });

  it("accepts an ignore with no grade", () => {
    expect(validateGradeDecision({ gradeName: "Charity Day", action: "ignore" })).toMatchObject({
      ok: true,
      centralGrade: null,
    });
  });

  it("rejects an ignore that names a grade", () => {
    expect(
      validateGradeDecision({ gradeName: "X Cup", action: "ignore", centralGrade: "A Grade" }),
    ).toMatchObject({ ok: false });
  });

  it("rejects a map with no grade, or a grade a competition can't map to", () => {
    expect(validateGradeDecision({ gradeName: "X Cup", action: "map" })).toMatchObject({
      ok: false,
    });
    for (const centralGrade of ["Under 15", "Female C Grade", "Ladies T20", "Zeta Grade"]) {
      expect(
        validateGradeDecision({ gradeName: "X Cup", action: "map", centralGrade }),
      ).toMatchObject({ ok: false });
    }
  });

  it("rejects a blank competition name", () => {
    expect(validateGradeDecision({ gradeName: "  ", action: "ignore" })).toMatchObject({
      ok: false,
    });
  });
});

describe("loadMatchIdsForGradeKey", () => {
  it("looks the competition up by its normalised key, senior grades only", async () => {
    const calls: { sql: string; params?: unknown[] }[] = [];
    const reader = {
      query: async (sql: string, params?: unknown[]) => {
        calls.push({ sql, params });
        return { rows: [{ id: "m1" }, { id: "m2" }] };
      },
    } as unknown as Parameters<typeof loadMatchIdsForGradeKey>[0];
    expect(await loadMatchIdsForGradeKey(reader, "over 45s focus cup")).toEqual(["m1", "m2"]);
    expect(calls[0]?.params).toEqual(["over 45s focus cup"]);
    expect(calls[0]?.sql).toMatch(/is_junior = false/);
    expect(calls[0]?.sql).toMatch(/central\.playhq_grade_key\(g\.name\) = \$1/);
  });
});

describe("groupPending", () => {
  const club = (id: number) => ({ id, name: `Club ${id}` });
  const g = (gradeName: string, matches: number, seasonName: string | null = "2026/27") => ({
    gradeName,
    seasonName,
    matches,
    reason: "Ovation doesn't recognise this competition name",
  });

  it("merges seasons under one competition and totals its matches", () => {
    const out = groupPending(
      [
        {
          tenants: [club(1)],
          grades: [
            g("Peel Social Shield 2025/26", 3, "2025/26"),
            g("Peel Social Shield 2026/27", 4),
          ],
        },
      ],
      new Set(),
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      gradeKey: "peel social shield",
      matches: 7,
      seasons: ["2025/26", "2026/27"],
      tenants: [{ id: 1, name: "Club 1" }],
    });
  });

  it("lists every club that plays in a competition once", () => {
    const out = groupPending(
      [
        { tenants: [club(1), club(2)], grades: [g("Social Shield", 2)] },
        { tenants: [club(2), club(3)], grades: [g("Social Shield", 5)] },
      ],
      new Set(),
    );
    expect(out[0]?.tenants.map((t) => t.id)).toEqual([1, 2, 3]);
    expect(out[0]?.matches).toBe(7);
  });

  it("drops competitions that already have a decision, whatever the season in the name", () => {
    const out = groupPending(
      [{ tenants: [club(1)], grades: [g("Decided Cup 2026/27", 9), g("Open Cup", 1)] }],
      new Set(["decided cup"]),
    );
    expect(out.map((p) => p.gradeName)).toEqual(["Open Cup"]);
  });

  it("puts the busiest competition first", () => {
    const out = groupPending(
      [{ tenants: [club(1)], grades: [g("Zeta Cup", 2), g("Alpha Cup", 9), g("Beta Cup", 9)] }],
      new Set(),
    );
    expect(out.map((p) => p.gradeName)).toEqual(["Alpha Cup", "Beta Cup", "Zeta Cup"]);
  });
});
