import { describe, it, expect } from "vitest";
import {
  PCA_BYLAW_5_9,
  ageOn,
  bowlingRulesFor,
  juniorBowlingLimit,
  oversFromFormat,
} from "./team-sheet-rules";

describe("ageOn", () => {
  it("counts whole years, turning a year older on the birthday", () => {
    expect(ageOn("2010-06-30", "2026-06-30")).toBe(16);
    expect(ageOn("2010-07-01", "2026-06-30")).toBe(15);
    expect(ageOn("2010-02-28", "2026-06-30")).toBe(16);
  });

  it("is null for a missing or malformed date", () => {
    expect(ageOn(null, "2026-06-30")).toBeNull();
    expect(ageOn("30/06/2010", "2026-06-30")).toBeNull();
  });
});

describe("bowlingRulesFor", () => {
  it("finds PCA's rules by its PlayHQ organisation, case-insensitively", () => {
    expect(bowlingRulesFor("C65C0BB8-87D8-EB11-A7AD-2818780DA0CC")).toBe(PCA_BYLAW_5_9);
  });

  it("knows no rules for another or a missing association", () => {
    expect(bowlingRulesFor("00000000-0000-0000-0000-000000000000")).toBeNull();
    expect(bowlingRulesFor(null)).toBeNull();
  });
});

describe("juniorBowlingLimit (PCA Bylaw 5.9)", () => {
  // The 2026/27 season: ages are taken on 30 June 2026.
  const limit = (dob: string | null) => juniorBowlingLimit(PCA_BYLAW_5_9, dob, 2026);

  it("applies the bylaw's quota for each age band", () => {
    expect(limit("2016-01-01")).toEqual({ age: 10, band: "U11", maxOversPerDay: 4, maxSpell: 2 });
    expect(limit("2013-03-01")).toMatchObject({
      age: 13,
      band: "11–13",
      maxOversPerDay: 8,
      maxSpell: 4,
    });
    expect(limit("2011-08-01")).toMatchObject({
      age: 14,
      band: "14–15",
      maxOversPerDay: 12,
      maxSpell: 5,
    });
    expect(limit("2010-06-30")).toMatchObject({
      age: 16,
      band: "16–17",
      maxOversPerDay: 16,
      maxSpell: 5,
    });
  });

  it("does not restrict a player 17 or older on 30 June, or one with no birth date", () => {
    expect(limit("2009-06-30")).toBeNull();
    expect(limit(null)).toBeNull();
  });

  it("keeps a player's band for the whole season after a mid-season birthday", () => {
    // 16 on 30 June 2026, 17 by the summer: still a Junior Aged Player.
    expect(limit("2009-07-01")).toMatchObject({ age: 16 });
  });
});

describe("oversFromFormat", () => {
  it("reads the overs from a T20-style format", () => {
    expect(oversFromFormat("T20")).toBe("20");
    expect(oversFromFormat("Mid-Year T20")).toBe("20");
  });

  it("leaves other formats for the captain to fill in", () => {
    expect(oversFromFormat("One Day")).toBeNull();
    expect(oversFromFormat(null)).toBeNull();
  });
});
