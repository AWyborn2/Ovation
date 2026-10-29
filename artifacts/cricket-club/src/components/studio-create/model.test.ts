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
    const s = parseCreateState("kind=teamList&step=3");
    expect(s).toEqual({ team: "senior", kind: "teamList", mode: "one", step: 3 });
    expect(createSearch(s)).toBe("kind=teamList&step=3");
  });

  it("goes back to step 1 without a kind, and drops an unknown kind", () => {
    expect(parseCreateState("step=4").step).toBe(1);
    expect(parseCreateState("kind=nope&step=3")).toMatchObject({
      kind: null,
      step: 1,
    });
  });

  it("skips One or many while no carousel is offered, and Fill from for a blank design", () => {
    const team = parseCreateState("kind=teamList");
    expect(nextStep(team)).toBe(3);
    expect(prevStep({ ...team, step: 3 })).toBe(1);
    const blank = parseCreateState("kind=blank");
    expect(nextStep(blank)).toBe(4);
    expect(parseCreateState("kind=blank&step=3").step).toBe(4);
  });

  it("leaves Round Team Lists and Junior Highlights out of the senior single cards", () => {
    expect(SENIOR_KINDS).toContain("teamList");
    expect(SENIOR_KINDS).not.toContain("teamListRound");
    expect(SENIOR_KINDS).not.toContain("juniorHighlights");
  });

  it("reads Juniors only while the club has juniors, and offers juniors their own kinds", () => {
    expect(parseCreateState("team=junior&kind=teamList&step=3")).toMatchObject({
      team: "junior",
      kind: "teamList",
      step: 3,
    });
    expect(parseCreateState("team=junior&kind=teamList", false).team).toBe("senior");
    // A junior has no Weekend Wrap or blank design.
    expect(parseCreateState("team=junior&kind=weekendWrap").kind).toBeNull();
    expect(parseCreateState("team=junior&kind=blank").kind).toBeNull();
  });

  it("badges a team by where its names came from", () => {
    expect(teamSourceOf(null)).toBe("none");
    expect(teamSourceOf({ isPublished: true, source: "playhq" })).toBe("playhq");
    expect(teamSourceOf({ isPublished: false, source: "admin" })).toBe("draft");
    expect(teamSourceOf({ isPublished: true, source: "selection" })).toBe("selection");
    expect(teamSourceOf({ isPublished: true, source: "admin" })).toBe("selection");
  });
});
