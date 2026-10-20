import { describe, it, expect } from "vitest";
import {
  draftFrom,
  draftProblem,
  emptyDraft,
  isEmail,
  juniorTeamLabel,
  listSummary,
  toInput,
} from "./email-lists";

describe("email list drafts", () => {
  it("needs a name and real addresses, ignoring blank rows", () => {
    const d = emptyDraft();
    expect(draftProblem(d)).toBe("Give the list a name.");
    d.name = "A Grade contacts";
    expect(draftProblem(d)).toBeNull();
    d.members = [
      { name: "Sam", email: "sam@example.com" },
      { name: "Jo", email: "jo at example" },
    ];
    expect(draftProblem(d)).toBe(`"jo at example" isn't an email address.`);
    d.members[1] = { name: "  ", email: "" };
    expect(draftProblem(d)).toBeNull();
  });

  it("builds a trimmed team-sheet body without blank rows", () => {
    const d = {
      ...emptyDraft(),
      name: " A Grade ",
      gradeKeys: ["A Grade"],
      members: [
        { name: " Sam ", email: " sam@example.com " },
        { name: "", email: "" },
      ],
    };
    expect(toInput(d)).toEqual({
      kind: "team_sheet",
      section: "senior",
      name: "A Grade",
      sendMode: "on_publish",
      schedule: null,
      resendOnChange: true,
      active: true,
      gradeKeys: ["A Grade"],
      members: [{ name: "Sam", email: "sam@example.com" }],
    });
  });

  it("opens a saved list with one blank row when it has no contacts", () => {
    const d = draftFrom({
      id: 4,
      kind: "team_sheet",
      section: "senior",
      name: "B",
      sendMode: "manual",
      schedule: null,
      resendOnChange: true,
      assetReady: false,
      reviewNeeded: false,
      milestone: false,
      active: false,
      gradeKeys: ["B Grade"],
      members: [],
      createdAt: "2026-10-20T00:00:00Z",
    });
    expect(d).toMatchObject({ id: 4, sendMode: "manual", active: false });
    expect(d.members).toEqual([{ name: "", email: "" }]);
  });

  it("checks address shape loosely", () => {
    expect(isEmail("a@b.co")).toBe(true);
    expect(isEmail("a@b")).toBe(false);
    expect(isEmail("a b@c.d")).toBe(false);
  });

  it("a scheduled list sends its day and time; a social list its toggles and no grades", () => {
    const sched = { ...emptyDraft(), name: "A", sendMode: "scheduled" as const, gradeKeys: ["A"] };
    expect(toInput({ ...sched, scheduleDow: 5, scheduleTime: "17:30" })).toMatchObject({
      sendMode: "scheduled",
      schedule: { dow: 5, time: "17:30" },
    });
    expect(draftProblem({ ...sched, scheduleTime: "25:00" })).toBe(
      "Choose a time for the weekly email.",
    );
    const social = { ...emptyDraft("social"), gradeKeys: ["A Grade"], milestone: false };
    const body = toInput(social);
    expect(body).toMatchObject({
      kind: "social",
      name: "Social media",
      gradeKeys: [],
      assetReady: true,
      reviewNeeded: true,
      milestone: false,
    });
    expect(body).not.toHaveProperty("sendMode");
  });

  it("summarises when a list is emailed", () => {
    const base = {
      id: 1,
      section: "senior" as const,
      name: "L",
      active: true,
      gradeKeys: [],
      members: [],
      createdAt: "2026-10-20T00:00:00Z",
      resendOnChange: true,
      assetReady: true,
      reviewNeeded: false,
      milestone: true,
    };
    expect(
      listSummary({
        ...base,
        kind: "team_sheet",
        sendMode: "scheduled",
        schedule: { dow: 4, time: "18:00" },
      }),
    ).toBe("Thursdays at 18:00");
    expect(listSummary({ ...base, kind: "social", sendMode: "off", schedule: null })).toBe(
      "Card ready to post, Milestones and achievements",
    );
  });

  it("a junior list keeps its section and labels junior teams like the server", () => {
    const d = { ...emptyDraft("team_sheet", "junior"), name: "U13", gradeKeys: ["Year 7 Gold"] };
    expect(toInput(d)).toMatchObject({ section: "junior", gradeKeys: ["Year 7 Gold"] });
    expect(juniorTeamLabel({ teamName: " Year 7 Gold ", grade: "U13" })).toBe("Year 7 Gold");
    expect(juniorTeamLabel({ teamName: null, grade: null, ageGroup: "U11" })).toBe("U11");
  });
});
