import { describe, it, expect } from "vitest";
import { draftFrom, draftProblem, emptyDraft, isEmail, toInput } from "./email-lists";

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
      name: "A Grade",
      sendMode: "on_publish",
      active: true,
      gradeKeys: ["A Grade"],
      members: [{ name: "Sam", email: "sam@example.com" }],
    });
  });

  it("opens a saved list with one blank row when it has no contacts", () => {
    const d = draftFrom({
      id: 4,
      kind: "team_sheet",
      name: "B",
      sendMode: "manual",
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
});
