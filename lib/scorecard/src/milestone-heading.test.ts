import { describe, expect, it } from "vitest";
import {
  GAMES_MILESTONE_HEADING,
  centuryCardFeat,
  centuryCardText,
  milestoneCardHeading,
} from "./milestone-heading";

describe("milestoneCardHeading", () => {
  it("names every games tier 'Club Milestone', including the old 'Centurion'", () => {
    for (const tier of ["50 Games", "Centurion", "150 Games", "200 games", "300 Games"]) {
      expect(milestoneCardHeading(tier, "Games")).toBe(GAMES_MILESTONE_HEADING);
    }
    expect(milestoneCardHeading("100 Games", "Games played")).toBe(GAMES_MILESTONE_HEADING);
  });

  it("keeps other milestones and an admin's own heading", () => {
    expect(milestoneCardHeading("1000 Runs", "Runs")).toBe("1000 Runs");
    expect(milestoneCardHeading("Centurion", "Runs")).toBe("Centurion");
    expect(milestoneCardHeading("Life Member", "Games")).toBe("Life Member");
  });
});

describe("centuryCardFeat / centuryCardText", () => {
  it("calls a 50 to 99 innings a fifty, and 100 or more a century", () => {
    expect(centuryCardFeat(52)).toEqual({ word: "Fifty", threshold: 50 });
    expect(centuryCardFeat("99")).toEqual({ word: "Fifty", threshold: 50 });
    expect(centuryCardFeat(50)).toEqual({ word: "Fifty", threshold: 50 });
    expect(centuryCardFeat(100)).toEqual({ word: "Century", threshold: 100 });
    expect(centuryCardFeat(147)).toEqual({ word: "Century", threshold: 100 });
  });

  it("keeps the century wording with no runs, or under 50", () => {
    for (const runs of [null, undefined, "", "abc", 30]) {
      expect(centuryCardFeat(runs).word).toBe("Century");
      expect(centuryCardText("CENTURY", runs)).toBe("CENTURY");
    }
  });

  it("swaps the word in the text's own case and leaves other text alone", () => {
    expect(centuryCardText("CENTURY", 52)).toBe("FIFTY");
    expect(centuryCardText("Maiden Century!", 61)).toBe("Maiden Fifty!");
    expect(centuryCardText("a century", 75)).toBe("a fifty");
    expect(centuryCardText("RAISED THE BAT", 52)).toBe("RAISED THE BAT");
    expect(centuryCardText("CENTURY", 104)).toBe("CENTURY");
  });
});
