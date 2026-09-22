import { describe, expect, it } from "vitest";

import {
  PLAYHQ_ORG_GUID_RE,
  toFixtureRow,
  type OrgLite,
  type PlayhqMatchLite,
} from "./playhq-project-fixtures";

const HH = "4559f1b9-86d8-eb11-a7ad-2818780da0cc";
const SBCC = "3d38cd53-8ad8-eb11-a7ad-2818780da0cc";
const START = new Date("2026-10-10T03:45:00.000Z");

const base: PlayhqMatchLite = {
  id: "44ec2743-3358-4f75-aced-0a878b234b23",
  gradeName: "A Grade Wyllie Cup",
  roundName: "Round 1",
  startAt: START,
  venueName: "Stan Twight Reserve",
  surfaceName: "Stan Twight Reserve - Oval #1 (West)",
  status: "UPCOMING",
  homeOrgId: SBCC,
  awayOrgId: HH,
  homeTeamName: "SBCC A Grade",
  awayTeamName: "Halls Head A Grade",
};
const orgs = new Map<string, OrgLite>([
  [
    SBCC,
    { name: "Shoalwater Bay Cricket Club", shortName: "SBCC", logoUrl: "https://crest/sbcc.png" },
  ],
]);
const gradeOf = (name: string | null) => (name && /\ba grade\b/i.test(name) ? "A Grade" : null);

describe("toFixtureRow", () => {
  it("shapes an away match from the club's perspective with the opponent's branding", () => {
    const row = toFixtureRow(base, HH, 1, orgs, new Map([[SBCC, 42]]), gradeOf);
    expect(row).toEqual({
      tenantId: 1,
      grade: "A Grade",
      roundLabel: "Round 1",
      opponentName: "Shoalwater Bay Cricket Club",
      opponentClubId: 42,
      opponentLogoUrl: "https://crest/sbcc.png",
      venue: "Stan Twight Reserve",
      startAt: START,
      isHome: false,
      source: "playhq",
      playhqMatchId: base.id,
    });
  });

  it("marks a home match and falls back to the team name when the organisation is unknown", () => {
    const row = toFixtureRow(
      {
        ...base,
        homeOrgId: HH,
        awayOrgId: SBCC,
        homeTeamName: "Halls Head A Grade",
        awayTeamName: "SBCC A Grade",
      },
      HH,
      7,
      new Map(),
      new Map(),
      gradeOf,
    );
    expect(row.isHome).toBe(true);
    expect(row.opponentName).toBe("SBCC A Grade");
    expect(row.opponentClubId).toBeNull();
    expect(row.opponentLogoUrl).toBeNull();
  });

  it("keeps the raw PlayHQ grade name when it does not map to an app grade", () => {
    const row = toFixtureRow(
      { ...base, gradeName: "Mid-Year T20 D Grade" },
      HH,
      1,
      orgs,
      new Map(),
      () => null,
    );
    expect(row.grade).toBe("Mid-Year T20 D Grade");
  });

  it("treats a club-versus-club-B-team match (both sides the same org) as home", () => {
    const row = toFixtureRow(
      { ...base, homeOrgId: HH, awayOrgId: HH },
      HH,
      1,
      orgs,
      new Map(),
      gradeOf,
    );
    expect(row.isHome).toBe(true);
    expect(row.opponentName).toBe("Halls Head A Grade");
  });
});

describe("PLAYHQ_ORG_GUID_RE", () => {
  it("accepts a PlayHQ organisation GUID and rejects the 8-char crest prefix", () => {
    expect(PLAYHQ_ORG_GUID_RE.test(HH)).toBe(true);
    expect(PLAYHQ_ORG_GUID_RE.test("5fe82f6b")).toBe(false);
  });
});
