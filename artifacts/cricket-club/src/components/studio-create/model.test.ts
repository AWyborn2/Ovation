import { describe, expect, it } from "vitest";
import {
  SENIOR_KINDS,
  createSearch,
  nextStep,
  parseCreateState,
  prevStep,
  teamSourceOf,
} from "./model";

describe("Create wizard model", () => {
  it("round-trips its state through the query string", () => {
    const s = parseCreateState("kind=teamList&step=3", SENIOR_KINDS);
    expect(s).toEqual({ team: "senior", kind: "teamList", mode: "one", step: 3 });
    expect(createSearch(s)).toBe("kind=teamList&step=3");
  });

  it("goes back to step 1 without a kind, and drops an unknown kind", () => {
    expect(parseCreateState("step=4", SENIOR_KINDS).step).toBe(1);
    expect(parseCreateState("kind=nope&step=3", SENIOR_KINDS)).toMatchObject({
      kind: null,
      step: 1,
    });
  });

  it("skips One or many while no carousel is offered, and Fill from for a blank design", () => {
    const team = parseCreateState("kind=teamList", SENIOR_KINDS);
    expect(nextStep(team)).toBe(3);
    expect(prevStep({ ...team, step: 3 })).toBe(1);
    const blank = parseCreateState("kind=blank", SENIOR_KINDS);
    expect(nextStep(blank)).toBe(4);
    expect(parseCreateState("kind=blank&step=3", SENIOR_KINDS).step).toBe(4);
  });

  it("leaves Round Team Lists and Junior Highlights out of the senior single cards", () => {
    expect(SENIOR_KINDS).toContain("teamList");
    expect(SENIOR_KINDS).not.toContain("teamListRound");
    expect(SENIOR_KINDS).not.toContain("juniorHighlights");
  });

  it("badges a team by where its names came from", () => {
    expect(teamSourceOf(null)).toBe("none");
    expect(teamSourceOf({ isPublished: true, source: "playhq" })).toBe("playhq");
    expect(teamSourceOf({ isPublished: false, source: "admin" })).toBe("draft");
    expect(teamSourceOf({ isPublished: true, source: "selection" })).toBe("selection");
    expect(teamSourceOf({ isPublished: true, source: "admin" })).toBe("selection");
  });
});
