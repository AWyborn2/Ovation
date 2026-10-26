import { describe, expect, it } from "vitest";
import { groupFamilies, lookFamilies, lookLabel } from "./look-families";

const looks = [
  { slug: "club-kit", name: "Club Kit" },
  { slug: "omg-broadcast", name: "Broadcast", family: "Ovation Match Graphics" },
  { slug: "gold-foil", name: "Gold Foil", family: null },
  { slug: "omg-t20", name: "T20", family: "Ovation Match Graphics" },
];

describe("look families", () => {
  it("labels a family's look with its family", () => {
    expect(lookLabel(looks[1]!)).toBe("Ovation Match Graphics · Broadcast");
    expect(lookLabel(looks[0]!)).toBe("Club Kit");
  });

  it("moves a family's looks together, where its first look is", () => {
    expect(groupFamilies(looks).map((l) => l.slug)).toEqual([
      "club-kit",
      "omg-broadcast",
      "omg-t20",
      "gold-foil",
    ]);
  });

  it("lists each family with its looks", () => {
    expect(lookFamilies(looks)).toEqual([
      { family: "Ovation Match Graphics", looks: [looks[1], looks[3]] },
    ]);
  });
});
