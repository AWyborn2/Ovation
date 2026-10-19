import { describe, expect, it } from "vitest";
import { matchJuniorOpponentClub, normaliseJuniorClubName } from "./junior-opponent-matching";

const clubs = [
  { id: 1, name: "Mandurah Cricket Club" },
  { id: 12, name: "South Mandurah Cricket Club" },
  { id: 3, name: "Rockingham Hornets Cricket Club" },
];

describe("junior opponent crest matching", () => {
  it.each([
    "South Mandurah Junior Cricket Club", "South Mandurah JCC",
    "South Mandurah Year 5 Boys", "South Mandurah Junior Gold",
    "South Mandurah (Year 5) Blue", "South Mandurah U12 Girls",
  ])("resolves %s without falling onto Mandurah", name => {
    expect(matchJuniorOpponentClub(name, clubs)?.id).toBe(12);
  });
  it("does not confuse nicknames or partial tokens", () => {
    for (const name of ["Rockingham Rams", "South Mandurahville", "", null, "Unknown JCC"])
      expect(matchJuniorOpponentClub(name, clubs)).toBeNull();
    expect(normaliseJuniorClubName("Rockingham Rams U12")).toBe("rockingham rams");
  });
  it("refuses equally specific ambiguous clubs", () => {
    expect(matchJuniorOpponentClub("South Mandurah Junior", [
      ...clubs, { id: 50, name: "South Mandurah JCC" },
    ])).toBeNull();
  });
  it("preserves reference branding and leaves inputs untouched", () => {
    const branded = [{ ...clubs[1], logoUrl: "/south.png" }];
    const before = JSON.stringify(branded);
    expect(matchJuniorOpponentClub("South Mandurah Year 5", branded)?.logoUrl).toBe("/south.png");
    expect(JSON.stringify(branded)).toBe(before);
  });
});
