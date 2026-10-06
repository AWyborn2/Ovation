import { describe, expect, it } from "vitest";
import { gradeMatchKey, maxSponsorLogos, sponsorsForCard } from "./sponsor-limit";
import { sponsorAppliesToKind } from "./types";

/** Sponsor per team: which sponsor a card carries. */
const SPONSORS = [
  { name: "Gallery", cardKinds: [], grades: [], isPresenting: false },
  { name: "Presenting", cardKinds: [], grades: [], isPresenting: true },
  { name: "A Grade Co", cardKinds: [], grades: ["A Grade"], isPresenting: false },
  {
    name: "Women Co",
    cardKinds: [],
    grades: ["Female A Grade", "Female B Grade"],
    isPresenting: false,
  },
];
const names = (kind: string, grade: string | null) =>
  sponsorsForCard(SPONSORS, kind, grade, sponsorAppliesToKind as never).map((s) => s.name);

describe("sponsorsForCard", () => {
  it("gives a team list its team's own sponsor only", () => {
    expect(names("teamList", "A Grade")).toEqual(["A Grade Co"]);
    expect(names("teamList", "female b grade")).toEqual(["Women Co"]);
  });

  it("falls back to the presenting sponsor, never another team's", () => {
    expect(names("teamList", "B Grade")[0]).toBe("Presenting");
    expect(names("teamList", "B Grade")).not.toContain("A Grade Co");
    expect(names("teamList", null)).toEqual(["Presenting", "Gallery"]);
  });

  it("leaves every other card as before (presenting first, team sponsors included)", () => {
    expect(names("milestone", null)).toEqual(["Presenting", "Gallery", "A Grade Co", "Women Co"]);
  });

  it("a team list shows one logo", () => {
    expect(maxSponsorLogos("teamList")).toBe(1);
  });

  it("matches grade labels loosely", () => {
    expect(gradeMatchKey(" A-Grade ")).toBe(gradeMatchKey("a grade"));
  });
});
