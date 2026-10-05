import { describe, expect, it } from "vitest";
import { clubNameKey, matchOrgsToClubs, type CentralClubName } from "./club-names";

// Real names: PlayHQ organisations vs the central clubs they are (production, 5 Oct 2026).
const CENTRAL: CentralClubName[] = [
  { clubId: 3, name: "Rockingham Mandurah Cricket Club (Mariners RMDCC)", active: false },
  { clubId: 5, name: "Mandurah Cricket Club", active: true },
  { clubId: 19, name: "Curtin Victoria Park Cricket Club", active: false },
  { clubId: 101, name: "Bayswater Morley Districts", active: true },
  { clubId: 107, name: "Melville", active: true },
  { clubId: 109, name: "Mount Lawley D", active: true },
  { clubId: 110, name: "Perth WA", active: true },
  { clubId: 111, name: "Rockingham-Mandurah", active: true },
  { clubId: 114, name: "Subiaco-Floreat", active: true },
  { clubId: 116, name: "Willetton Premier", active: true },
];

const org = (orgId: string, name: string) => ({ orgId, name });

describe("clubNameKey", () => {
  it("drops filler words, punctuation and brackets but keeps their words", () => {
    expect(clubNameKey("Perth Cricket Club (WA)")).toBe("perth wa");
    expect(clubNameKey("Perth WA")).toBe("perth wa");
    expect(clubNameKey("Subiaco-Floreat Cricket Club")).toBe("subiaco floreat");
    expect(clubNameKey("Harvey Benger Cricket Club Inc")).toBe("harvey benger");
    expect(clubNameKey(null)).toBe("");
  });
});

describe("matchOrgsToClubs", () => {
  it("maps RMDCC's WA Premier opponents to their central clubs", () => {
    const m = matchOrgsToClubs(
      [
        org("A2D6A841-8AD8-EB11-A7AD-2818780DA0CC", "Perth Cricket Club (WA)"),
        org("300dffbf", "Subiaco-Floreat Cricket Club"),
        org("c2cfa9a1", "Mount Lawley D Cricket Club"),
        org("ae4ef7c5", "Willetton Premier Cricket Club"),
        org("f5c909cc", "Bayswater Morley Districts Cricket Club"),
        org("760dffbf", "Melville Cricket Club"),
        org("2dd0a9a1", "Rockingham-Mandurah Cricket Club"),
      ],
      CENTRAL,
    );
    expect(Object.fromEntries(m)).toEqual({
      "a2d6a841-8ad8-eb11-a7ad-2818780da0cc": 110,
      "300dffbf": 114,
      c2cfa9a1: 109,
      ae4ef7c5: 116,
      f5c909cc: 101,
      "760dffbf": 107,
      // The PCA "Rockingham Mandurah … (Mariners RMDCC)" keys differently, so no clash.
      "2dd0a9a1": 111,
    });
  });

  it("an inactive club still matches when it is the only one with the name", () => {
    const m = matchOrgsToClubs([org("f8cd4bf0", "Curtin Victoria Park Cricket Club")], CENTRAL);
    expect(m.get("f8cd4bf0")).toBe(19);
  });

  it("two active clubs with the same name map to neither", () => {
    const m = matchOrgsToClubs(
      [org("x", "Melville Cricket Club")],
      [...CENTRAL, { clubId: 200, name: "Melville CC", active: true }],
    );
    expect(m.has("x")).toBe(false);
  });

  it("one active club wins over an inactive namesake", () => {
    const m = matchOrgsToClubs(
      [org("x", "Melville Cricket Club")],
      [...CENTRAL, { clubId: 200, name: "Melville", active: false }],
    );
    expect(m.get("x")).toBe(107);
  });

  it("unknown names and a club's historical names", () => {
    const m = matchOrgsToClubs(
      [org("a", "Country XI"), org("b", "Mariners")],
      [...CENTRAL, { clubId: 3, name: "Mariners", active: false }],
    );
    expect(m.has("a")).toBe(false);
    expect(m.get("b")).toBe(3);
  });
});
