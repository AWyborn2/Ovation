/**
 * Team list name lines (Halls Head, Nov 2026): every Team List look prints
 * "J. SURNAME" with the captain / keeper mark, as the older cards did.
 */
import { describe, expect, it } from "vitest";
import { teamListName } from "./bind";

describe("teamListName", () => {
  it("prints the initial, the surname and the role mark", () => {
    expect(teamListName("J", "YOUNG", undefined)).toBe("J. YOUNG");
    expect(teamListName("M", "HEAD", "WK")).toBe("M. HEAD (WK)");
    expect(teamListName("P", "HEAD", "C")).toBe("P. HEAD (C)");
    expect(teamListName("T", "VAN DER MERWE", "C/WK")).toBe("T. VAN DER MERWE (C/WK)");
  });

  it("keeps a row without an approved initial surname-only", () => {
    expect(teamListName(undefined, "JONES", "VC")).toBe("JONES (VC)");
    expect(teamListName("Jo", "JONES", "")).toBe("JONES");
  });

  it("never marks a withheld player, so a role can't point at a private child", () => {
    expect(teamListName(undefined, "PRIVATE PLAYER", "C")).toBe("PRIVATE PLAYER");
    expect(teamListName(undefined, "Private Player", "WK")).toBe("Private Player");
  });
});
