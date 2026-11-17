import { describe, expect, it } from "vitest";
import {
  SENIOR_KINDS,
  createSearch,
  nextStep,
  parseCreateState,
  blankCarouselDocument,
  prevStep,
  teamSourceOf,
  teamSourcesById,
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

  it("asks One or many only for kinds with a carousel, and skips Fill from for a blank design", () => {
    const team = parseCreateState("kind=teamList");
    expect(nextStep(team)).toBe(2);
    const milestone = parseCreateState("kind=milestone");
    expect(nextStep(milestone)).toBe(3);
    expect(prevStep({ ...milestone, step: 3 })).toBe(1);
    const blank = parseCreateState("kind=blank");
    expect(nextStep(blank)).toBe(4);
    expect(parseCreateState("kind=blank&step=3").step).toBe(4);
    // A carousel only where the kind has one.
    expect(parseCreateState("kind=teamList&mode=many&step=3").mode).toBe("many");
    expect(parseCreateState("kind=milestone&mode=many&step=3").mode).toBe("one");
  });

  it("makes Junior Match Day only as a carousel, skipping One or many", () => {
    const s = parseCreateState("team=junior&kind=matchDay&step=2");
    expect(s).toMatchObject({ mode: "many", step: 3 });
    expect(prevStep(s)).toBe(1);
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
    expect(teamSourceOf(undefined)).toBe("none");
    expect(teamSourceOf({ isPublished: true, source: "playhq", playerCount: 11 })).toBe("playhq");
    expect(teamSourceOf({ isPublished: false, source: "admin", playerCount: 11 })).toBe("draft");
    expect(teamSourceOf({ isPublished: true, source: "selection", playerCount: 11 })).toBe(
      "selection",
    );
    expect(teamSourceOf({ isPublished: true, source: "admin", playerCount: 11 })).toBe("selection");
    // A saved list with no names has nothing to fill from.
    expect(teamSourceOf({ isPublished: true, source: "admin", playerCount: 0 })).toBe("none");
  });

  it("maps the one team-list-sources read by fixture id, and waits for it", () => {
    expect(teamSourcesById(undefined)).toBeNull();
    const byId = teamSourcesById([
      { fixtureId: 7, source: "playhq", isPublished: true, playerCount: 12 },
      { fixtureId: 9, source: "admin", isPublished: false, playerCount: 3 },
    ])!;
    expect(teamSourceOf(byId.get(7))).toBe("playhq");
    expect(teamSourceOf(byId.get(9))).toBe("draft");
    // A fixture the read doesn't name has no saved list, however far ahead.
    expect(teamSourceOf(byId.get(500))).toBe("none");
  });

  it("starts a hand-picked carousel as three blank pages with no data", () => {
    const doc = blankCarouselDocument("announcement");
    expect(doc).toMatchObject({ formatVersion: 2, set: "free" });
    expect(doc.pages.map((p) => [p.id, p.slot, p.layers.length])).toEqual([
      ["page-1", "page", 0],
      ["page-2", "page", 0],
      ["page-3", "page", 0],
    ]);
  });
});
