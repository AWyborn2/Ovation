import { describe, expect, it } from "vitest";
import { GAMES_MILESTONE_HEADING, milestoneCardHeading } from "./milestone-heading";

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
