import { describe, it, expect } from "vitest";
import {
  buildMemberMatcher,
  fixtureSection,
  memberDisplayName,
  memberGradeFor,
  memberGrades,
  normaliseName,
  perthDate,
  perthDayStart,
  perthDow,
  roundWindow,
  type MemberIdentity,
} from "./availability-grades";

/** Shared availability helpers (plan 2026-10-06-002 KTD7, KTD12). Pure — no DB. */

const member = (
  id: number,
  firstName: string,
  lastName: string,
  extra: Partial<MemberIdentity> = {},
): MemberIdentity => ({
  id,
  firstName,
  lastName,
  preferredName: null,
  linkedPlayerId: null,
  active: true,
  gradeHint: null,
  ...extra,
});

describe("fixtureSection (KTD12)", () => {
  it("is senior for senior app grades and junior otherwise", () => {
    expect(fixtureSection("A Grade")).toBe("senior");
    expect(fixtureSection("Colts")).toBe("senior");
    expect(fixtureSection("T20")).toBe("senior");
    expect(fixtureSection("Under 15")).toBe("junior");
    expect(fixtureSection("")).toBe("junior");
  });
});

describe("names", () => {
  it("normalises case, accents, punctuation and spacing", () => {
    expect(normaliseName("  Tom   BROOKS ")).toBe("tom brooks");
    expect(normaliseName("Seán O'Neill-Smith")).toBe("sean oneill smith");
    expect(normaliseName("J. Hale")).toBe("j hale");
  });

  it("displays the preferred name when there is one", () => {
    expect(memberDisplayName(member(1, "Thomas", "Brooks", { preferredName: "Tom" }))).toBe(
      "Tom Brooks",
    );
    expect(memberDisplayName(member(1, "Thomas", "Brooks", { preferredName: "  " }))).toBe(
      "Thomas Brooks",
    );
  });
});

describe("buildMemberMatcher (KTD7)", () => {
  const tom = member(1, "Thomas", "Brooks", { preferredName: "Tom" });
  const linked = member(2, "Jack", "Hale", { linkedPlayerId: 41 });
  const match = buildMemberMatcher([tom, linked]);

  it("matches a linked playerId first", () => {
    expect(match({ playerId: 41, displayName: "J. Hale" })).toBe(linked);
  });

  it("matches by preferred-or-first name plus last name", () => {
    expect(match({ displayName: "Tom Brooks" })).toBe(tom);
    expect(match({ displayName: "thomas  brooks" })).toBe(tom);
  });

  it("never matches a fill-in id, even by name", () => {
    expect(match({ playerId: 90012, displayName: "Tom Brooks" })).toBeNull();
  });

  it("does not name-match a member linked to a different player", () => {
    expect(match({ playerId: 77, displayName: "Jack Hale" })).toBeNull();
    // An entry with an unlinked playerId still name-matches an unlinked member.
    expect(match({ playerId: 77, displayName: "Tom Brooks" })).toBe(tom);
  });

  it("leaves an ambiguous name unmatched, preferring an active member", () => {
    const a = member(3, "Sam", "Lee");
    const b = member(4, "Sam", "Lee");
    expect(buildMemberMatcher([a, b])({ displayName: "Sam Lee" })).toBeNull();
    const old = member(5, "Sam", "Lee", { active: false });
    expect(buildMemberMatcher([a, old])({ displayName: "Sam Lee" })).toBe(a);
  });

  it("returns null for an unknown name", () => {
    expect(match({ displayName: "Nobody Here" })).toBeNull();
  });
});

describe("member grades (KTD12)", () => {
  const tom = member(1, "Tom", "Brooks", { gradeHint: "B Grade" });
  const sam = member(2, "Sam", "Lee", { gradeHint: "Premier League" });
  const kid = member(3, "Kid", "Junior", { gradeHint: "Under 15" });
  const lists = [
    {
      grade: "C Grade",
      startAt: new Date("2026-09-26T02:00:00Z"),
      players: [{ order: 1, displayName: "Tom Brooks" }],
    },
    {
      grade: "D Grade",
      startAt: new Date("2026-10-03T02:00:00Z"),
      players: [{ order: 1, displayName: "Tom Brooks" }],
    },
  ];
  const fixtureGrades = ["A Grade", "B Grade", "D Grade", "Under 15"];

  it("takes the grade of the most recent team list the member appears in", () => {
    expect(memberGradeFor(tom, lists, fixtureGrades)).toBe("D Grade");
  });

  it("falls back to the grade hint only when it matches a club fixture grade", () => {
    expect(memberGradeFor(kid, lists, fixtureGrades)).toBe("Under 15");
    expect(memberGradeFor(sam, lists, fixtureGrades)).toBeNull();
  });

  it("works in bulk", () => {
    const grades = memberGrades([tom, sam, kid], lists, fixtureGrades);
    expect(grades.get(1)).toBe("D Grade");
    expect(grades.get(2)).toBeNull();
    expect(grades.get(3)).toBe("Under 15");
  });
});

describe("Perth dates", () => {
  it("gives the Perth calendar date and weekday of an instant", () => {
    // 17:00Z Friday is 01:00 Saturday in Perth.
    expect(perthDate(new Date("2026-10-16T17:00:00Z"))).toBe("2026-10-17");
    expect(perthDow(new Date("2026-10-16T17:00:00Z"))).toBe(6);
    expect(perthDow("2026-10-18")).toBe(0);
  });

  it("starts a Perth day at 16:00Z the day before", () => {
    expect(perthDayStart("2026-10-17").toISOString()).toBe("2026-10-16T16:00:00.000Z");
  });

  it("spans Friday to Sunday around the round's Saturday", () => {
    const w = roundWindow("2026-10-17");
    expect(w.from.toISOString()).toBe("2026-10-15T16:00:00.000Z");
    expect(w.to.toISOString()).toBe("2026-10-18T16:00:00.000Z");
  });
});
