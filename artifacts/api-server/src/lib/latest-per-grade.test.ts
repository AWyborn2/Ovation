import { describe, expect, it } from "vitest";
import { latestByDate, latestPerGradeByDate, matchDateSortKey } from "./latest-per-grade";

const m = (id: number, grade: string, matchDate: string | null) => ({ id, grade, matchDate });

describe("latestPerGradeByDate", () => {
  it("picks each grade's latest-dated match, not its highest round", () => {
    // Input is in central's round-desc order: the final (no round) sorts last.
    const out = latestPerGradeByDate([
      m(1, "A Grade", "2026-03-07"), // round 14
      m(2, "A Grade", "2026-02-28"), // round 13
      m(3, "A Grade", "2026-03-21"), // grand final
      m(4, "B Grade", "2026-03-07"),
    ]);
    expect(out.map((x) => x.id)).toEqual([3, 4]);
  });

  it("prefers a dated match over an undated one", () => {
    const out = latestPerGradeByDate([m(1, "A Grade", null), m(2, "A Grade", "2026-01-10")]);
    expect(out.map((x) => x.id)).toEqual([2]);
  });

  it("keeps the first (round-order) match when dates tie or are missing", () => {
    expect(
      latestPerGradeByDate([m(1, "A Grade", null), m(2, "A Grade", null)]).map((x) => x.id),
    ).toEqual([1]);
    expect(
      latestPerGradeByDate([
        m(1, "A Grade", "2026-01-10T00:00:00Z"),
        m(2, "A Grade", "2026-01-10"),
      ]).map((x) => x.id),
    ).toEqual([1]);
  });
});

describe("matchDateSortKey", () => {
  it("reads ISO and the native free-text date form", () => {
    expect(matchDateSortKey("2026-03-07")).toBe("2026-03-07");
    expect(matchDateSortKey("12:20 PM, Saturday, 14 Mar 2026")).toBe("2026-03-14");
    expect(matchDateSortKey("Saturday, 7 March 2026")).toBe("2026-03-07");
    expect(matchDateSortKey("TBC")).toBe("");
    expect(matchDateSortKey(null)).toBe("");
  });
});

describe("latestByDate", () => {
  it("groups by any key and compares mixed date formats chronologically", () => {
    const rows = [
      { id: 9, age: "U13", date: "1:00 PM, Saturday, 7 Feb 2026" },
      { id: 8, age: "U13", date: "2026-02-14" },
      { id: 7, age: "U15", date: null },
    ];
    expect(
      latestByDate(
        rows,
        (r) => r.age,
        (r) => r.date,
      ).map((r) => r.id),
    ).toEqual([8, 7]);
  });
});
