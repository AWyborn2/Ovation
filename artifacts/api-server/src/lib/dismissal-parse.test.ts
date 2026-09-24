import { describe, expect, it } from "vitest";
import { classifyDismissal, normaliseSurname, parseDismissal } from "./dismissal-parse";

describe("parseDismissal — conventional notation (plan U3 cases)", () => {
  it.each([
    ["c Smith b Nguyen", "caught", "nguyen"],
    ["b J Nguyen", "bowled", "nguyen"],
    ["lbw b Lee", "lbw", "lee"],
    ["run out (Jones)", "runOut", null],
    ["st Kay b Ali", "stumped", "ali"],
    ["retired hurt", "retired", null],
    ["not out", "notOut", null],
    ["c & b Lee", "caught", "lee"],
    ["c B Cooper b B Nguyen", "caught", "nguyen"],
    ["something unexpected", "other", null],
    ["", "other", null],
  ])("%j → %s by %j", (text, type, by) => {
    expect(parseDismissal(text)).toEqual({ dismissalType: type, dismissedBy: by });
  });

  it("treats null as other", () => {
    expect(parseDismissal(null)).toEqual({ dismissalType: "other", dismissedBy: null });
  });
});

// Real strings as stored in imported scorecards (the master-DB colon format the
// tenant #1 bulk load and central match_batting both carry), including the
// blank, masked and placeholder names the source emits.
describe("parseDismissal — real imported scorecard strings", () => {
  it.each([
    ["c: A Weissel b: C Burgess", "caught", "burgess"],
    ["c: B Cooper b: A Rodier", "caught", "rodier"],
    ["c:  b: B Johnson", "caught", "johnson"],
    ["c:  b: J Van der Westhuizen", "caught", "van der westhuizen"],
    ["c:  b: ", "caught", null],
    ["c: M Crump b: ", "caught", null],
    ["c: ******** b: Z Jarrett", "caught", "jarrett"],
    ["c: K Smith b: ********", "caught", null],
    ["c: S Roach b: U Player_1", "caught", null],
    ["c: J Kenny b: A O’Brien", "caught", "o'brien"],
    ["c: S O'Brien  b: C Houlbrook", "caught", "houlbrook"],
    ["c: G Low b: J Bushe-Jones", "caught", "bushe-jones"],
    ["c&b: G Coles", "caught", "coles"],
    ["c&b: ", "caught", null],
    ["b: K May", "bowled", "may"],
    ["b: ", "bowled", null],
    ["b: ********", "bowled", null],
    ["lbw: J Krisko", "lbw", "krisko"],
    ["lbw: ", "lbw", null],
    ["st: G Pilling b: R Graham", "stumped", "graham"],
    ["st:  b: ", "stumped", null],
    ["st: c barbara b: S Moore", "stumped", "moore"],
    ["run out (A Darnley)", "runOut", null],
    ["run out ()", "runOut", null],
    ["run out (A Chinnery, A Maichil)", "runOut", null],
    ["hit wicket b: S Pope", "other", "pope"],
    ["retired not out", "retired", null],
    ["retired", "retired", null],
    ["absent", "other", null],
    ["did not bat", "other", null],
    ["obstructed field", "other", null],
  ])("%j → %s by %j", (text, type, by) => {
    expect(parseDismissal(text)).toEqual({ dismissalType: type, dismissedBy: by });
  });
});

describe("normaliseSurname", () => {
  it("drops initials, lower-cases and straightens apostrophes", () => {
    expect(normaliseSurname("J Nguyen")).toBe("nguyen");
    expect(normaliseSurname("JD Smith")).toBe("smith");
    expect(normaliseSurname("K D'SOUZA")).toBe("d'souza");
    expect(normaliseSurname("M Dell’Oro")).toBe("dell'oro");
    expect(normaliseSurname("Nguyen")).toBe("nguyen");
  });

  it("returns null for blank, masked and placeholder names", () => {
    expect(normaliseSurname("")).toBeNull();
    expect(normaliseSurname("   ")).toBeNull();
    expect(normaliseSurname(null)).toBeNull();
    expect(normaliseSurname("********")).toBeNull();
    expect(normaliseSurname("U Player_1")).toBeNull();
  });
});

describe("classifyDismissal — the line's not-out flag wins", () => {
  it("a not-out line is notOut, or retired when the text says so", () => {
    expect(classifyDismissal({ text: "not out", notOut: true })).toEqual({
      dismissalType: "notOut",
      dismissedBy: null,
    });
    expect(classifyDismissal({ text: "retired hurt", notOut: true })).toEqual({
      dismissalType: "retired",
      dismissedBy: null,
    });
    expect(classifyDismissal({ text: null, notOut: true }).dismissalType).toBe("notOut");
  });

  it("an out line never reports notOut", () => {
    expect(classifyDismissal({ text: "not out", notOut: false }).dismissalType).toBe("other");
  });

  it("prefers central's structured dismissal_type and keeps the parsed bowler", () => {
    expect(
      classifyDismissal({ text: "c&b: D Ellis", notOut: false, centralType: "caught & bowled" }),
    ).toEqual({ dismissalType: "caught", dismissedBy: "ellis" });
    expect(classifyDismissal({ text: "lbw: A White", notOut: false, centralType: "lbw" })).toEqual({
      dismissalType: "lbw",
      dismissedBy: "white",
    });
    expect(
      classifyDismissal({ text: "run out (K Ogden)", notOut: false, centralType: "run out" }),
    ).toEqual({ dismissalType: "runOut", dismissedBy: null });
    expect(
      classifyDismissal({ text: "st: E Scott b: R Patel", notOut: false, centralType: "stumped" }),
    ).toEqual({ dismissalType: "stumped", dismissedBy: "patel" });
  });

  it("falls back to the text for central 'other' (hit wicket, bare retired)", () => {
    expect(
      classifyDismissal({ text: "hit wicket b: S Pope", notOut: false, centralType: "other" }),
    ).toEqual({ dismissalType: "other", dismissedBy: "pope" });
    expect(
      classifyDismissal({ text: "retired", notOut: false, centralType: "other" }).dismissalType,
    ).toBe("retired");
  });
});
