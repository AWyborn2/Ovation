import { describe, it, expect } from "vitest";
import { displayNameForShow, splitDisplayName } from "./names";

describe("splitDisplayName — either name order", () => {
  it("reads a surname-first name", () => {
    expect(splitDisplayName("Phelps, Chris")).toEqual({ givenName: "Chris", surname: "Phelps" });
    expect(splitDisplayName("de Vaurno, Matt")).toEqual({
      givenName: "Matt",
      surname: "de Vaurno",
    });
  });

  it("reads a given-first name", () => {
    expect(splitDisplayName("Chris Phelps")).toEqual({ givenName: "Chris", surname: "Phelps" });
    expect(splitDisplayName("C Phelps")).toEqual({ givenName: "C", surname: "Phelps" });
    expect(splitDisplayName("Prince")).toEqual({ givenName: "Prince", surname: "" });
    expect(splitDisplayName(null)).toEqual({ givenName: "", surname: "" });
  });

  it("shows names given name first", () => {
    expect(displayNameForShow("Phelps, Chris")).toBe("Chris Phelps");
    expect(displayNameForShow("Chris Phelps")).toBe("Chris Phelps");
  });
});
