import { describe, expect, it } from "vitest";

import {
  PLAYHQ_ORG_GUID_RE,
  matchOrganisation,
  orgNameKey,
  requestDraftSweeps,
  toFixtureRow,
  type ProjectionSummary,
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

describe("matchOrganisation", () => {
  const orgs = [
    { id: HH, name: "Halls Head Cricket Club" },
    { id: SBCC, name: "Shoalwater Bay Cricket Club" },
    { id: "90dfe363-87d8-eb11-a7ad-2818780da0cc", name: "SJ Blues Cricket Club" },
  ];
  it("links a central club to the one organisation with the same name, ignoring case, punctuation and Inc", () => {
    expect(matchOrganisation("Halls Head Cricket Club", orgs)).toBe(HH);
    expect(matchOrganisation("halls head cricket club inc.", orgs)).toBe(HH);
    expect(orgNameKey("Harvey Benger Cricket Club Inc")).toBe("harvey benger cricket club");
  });
  it("refuses to guess when nothing or more than one organisation matches", () => {
    expect(matchOrganisation("Rockingham Beach Cricket Club", orgs)).toBeNull();
    expect(matchOrganisation(null, orgs)).toBeNull();
    expect(
      matchOrganisation("Halls Head Cricket Club", [
        ...orgs,
        { id: "dup", name: "HALLS HEAD CRICKET CLUB" },
      ]),
    ).toBeNull();
  });
});

describe("PLAYHQ_ORG_GUID_RE", () => {
  it("accepts a PlayHQ organisation GUID and rejects the 8-char crest prefix", () => {
    expect(PLAYHQ_ORG_GUID_RE.test(HH)).toBe(true);
    expect(PLAYHQ_ORG_GUID_RE.test("5fe82f6b")).toBe(false);
  });
});

describe("requestDraftSweeps", () => {
  const summary = (tenantId: number, inserted: number, updated: number): ProjectionSummary => ({
    tenantId,
    slug: `t${tenantId}`,
    orgId: HH,
    matches: inserted + updated,
    inserted,
    updated,
  });

  it("asks for a fixtures sweep for each tenant whose fixtures changed", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    const swept = await requestDraftSweeps([summary(1, 2, 0), summary(2, 0, 0), summary(3, 0, 1)], {
      url: "https://app.example/api/internal/draft-sweep",
      secret: "s3cret",
      fetchImpl,
      log: () => {},
    });
    expect(swept).toEqual([1, 3]);
    expect(calls).toHaveLength(2);
    expect(calls[0].init.headers).toMatchObject({ "x-sweep-secret": "s3cret" });
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ tenantId: 1, scope: "fixtures" });
  });

  it("does nothing without a URL or secret, and never throws on a failed request", async () => {
    const lines: string[] = [];
    expect(
      await requestDraftSweeps([summary(1, 1, 0)], {
        url: "",
        secret: "",
        log: (l) => lines.push(l),
      }),
    ).toEqual([]);
    expect(lines[0]).toMatch(/not requested/);

    const failing = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(
      await requestDraftSweeps([summary(1, 1, 0)], {
        url: "https://x",
        secret: "s",
        fetchImpl: failing,
        log: (l) => lines.push(l),
      }),
    ).toEqual([]);
    expect(lines.at(-1)).toMatch(/offline/);
  });
});
