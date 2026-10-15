import { describe, it, expect } from "vitest";
import { makeJuniorNaming, type JuniorNameFacts } from "./junior-names";
import {
  JUNIOR_TEAM_LIST_MAX,
  juniorFixtureListFrom,
  serializeJuniorFixture,
  shapeAdminJuniorTeamList,
  shapeJuniorTeamListCandidates,
  shapePublicJuniorTeamList,
  validateJuniorTeamList,
} from "./junior-fixtures";

/**
 * Junior fixtures and team lists: the pure rules behind /api/juniors/fixtures
 * (junior PlayHQ sync plan U6; KTD9, KTD12, KTD15, R8, R9, R15, R17, R23).
 */

const OWN_A = "aaaaaaaa-0000-0000-0000-000000000001";
const OWN_B = "bbbbbbbb-0000-0000-0000-000000000002";
const OWN_C = "cccccccc-0000-0000-0000-000000000003";
const MERGED = "dddddddd-0000-0000-0000-000000000004"; // merged into OWN_A
const OPPOSITION = "eeeeeeee-0000-0000-0000-000000000005";

/** The tenant's own participants (merged-away duplicates resolve to their keeper). */
const canonical = (id: string | null | undefined): string | null => {
  const key = (id ?? "").trim().toLowerCase();
  if (key === MERGED) return OWN_A;
  return [OWN_A, OWN_B, OWN_C].includes(key) ? key : null;
};

describe("validateJuniorTeamList", () => {
  it("accepts the club's own players, lowercases, sorts by order and renumbers 1..n", () => {
    const out = validateJuniorTeamList(
      [
        { order: 5, participantId: OWN_B.toUpperCase(), role: "WK" },
        { order: 2, participantId: OWN_A, role: "C" },
        { order: 9, participantId: OWN_C, role: null },
      ],
      canonical,
    );
    expect(out).toEqual({
      ok: true,
      players: [
        { order: 1, participantId: OWN_A, role: "C" },
        { order: 2, participantId: OWN_B, role: "WK" },
        { order: 3, participantId: OWN_C },
      ],
    });
  });

  it("maps a merged-away duplicate to its keeper", () => {
    const out = validateJuniorTeamList([{ order: 1, participantId: MERGED }], canonical);
    expect(out).toEqual({ ok: true, players: [{ order: 1, participantId: OWN_A }] });
  });

  it("accepts an empty list (clearing the side)", () => {
    expect(validateJuniorTeamList([], canonical)).toEqual({ ok: true, players: [] });
  });

  it("refuses an opposition or another club's participant", () => {
    const out = validateJuniorTeamList(
      [
        { order: 1, participantId: OWN_A },
        { order: 2, participantId: OPPOSITION },
      ],
      canonical,
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/not one of this club's junior players/i);
  });

  it("refuses a blank participant id", () => {
    const out = validateJuniorTeamList([{ order: 1, participantId: "  " }], canonical);
    expect(out.ok).toBe(false);
  });

  it("refuses the same player twice, including through a merge", () => {
    const out = validateJuniorTeamList(
      [
        { order: 1, participantId: OWN_A },
        { order: 2, participantId: MERGED },
      ],
      canonical,
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/more than once/i);
  });

  it("refuses duplicate or invalid orders", () => {
    const dup = validateJuniorTeamList(
      [
        { order: 1, participantId: OWN_A },
        { order: 1, participantId: OWN_B },
      ],
      canonical,
    );
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.error).toMatch(/order/i);
    for (const order of [0, -1, 1.5]) {
      expect(validateJuniorTeamList([{ order, participantId: OWN_A }], canonical).ok).toBe(false);
    }
  });

  it("refuses two captains, two vice-captains or two keepers", () => {
    const two = (a: "C" | "VC" | "WK" | "C/WK" | "VC/WK", b: typeof a) =>
      validateJuniorTeamList(
        [
          { order: 1, participantId: OWN_A, role: a },
          { order: 2, participantId: OWN_B, role: b },
        ],
        canonical,
      );
    expect(two("C", "C/WK").ok).toBe(false);
    expect(two("VC", "VC/WK").ok).toBe(false);
    expect(two("WK", "C/WK").ok).toBe(false);
    expect(two("C", "VC").ok).toBe(true);
    expect(two("C/WK", "VC").ok).toBe(true);
  });

  it("refuses an unknown role", () => {
    const out = validateJuniorTeamList(
      [{ order: 1, participantId: OWN_A, role: "XI" as unknown as "C" }],
      canonical,
    );
    expect(out.ok).toBe(false);
  });

  it(`refuses more than ${JUNIOR_TEAM_LIST_MAX} players`, () => {
    const many = Array.from({ length: JUNIOR_TEAM_LIST_MAX + 1 }, (_, i) => ({
      order: i + 1,
      participantId: OWN_A,
    }));
    const out = validateJuniorTeamList(many, canonical);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(String(JUNIOR_TEAM_LIST_MAX));
  });
});

describe("juniorFixtureListFrom", () => {
  it("keeps today's games listed for 12 hours after they start", () => {
    const now = new Date("2026-11-07T10:00:00Z");
    expect(juniorFixtureListFrom(now).toISOString()).toBe("2026-11-06T22:00:00.000Z");
  });
});

describe("serializeJuniorFixture", () => {
  it("returns the public fixture shape", () => {
    const startAt = new Date("2026-11-07T01:00:00Z");
    expect(
      serializeJuniorFixture(
        {
          id: 7,
          tenantId: 1,
          playhqMatchId: "m-1",
          seasonStartYear: 2026,
          ageGroup: "Year 6",
          grade: "Year 6 Gold",
          teamName: "Hawks",
          opponentName: "Eagles",
          venue: "Oval 1",
          startAt,
          isHome: true,
          status: "UPCOMING",
          createdAt: startAt,
          updatedAt: startAt,
        },
        true,
      ),
    ).toEqual({
      id: 7,
      seasonStartYear: 2026,
      ageGroup: "Year 6",
      grade: "Year 6 Gold",
      teamName: "Hawks",
      opponentName: "Eagles",
      venue: "Oval 1",
      startAt: "2026-11-07T01:00:00.000Z",
      isHome: true,
      status: "UPCOMING",
      hasTeamList: true,
    });
  });
});

const facts = new Map<string, JuniorNameFacts>([
  [OWN_A, { displayName: "Ollie Gallash", isPrivate: false, privacyOverride: false }],
  [OWN_B, { displayName: "Sam Private", isPrivate: true, privacyOverride: false }],
  [OWN_C, { displayName: "Kit Overridden", isPrivate: true, privacyOverride: true }],
]);

const numbers = new Map([
  [OWN_A, "7"],
  [OWN_B, "12"],
  [OWN_C, "3"],
]);

describe("shapePublicJuniorTeamList", () => {
  const stored = [
    { order: 2, participantId: OWN_B, role: "WK" as const },
    { order: 1, participantId: OWN_A, role: "C" as const },
    { order: 3, participantId: OWN_C },
    { order: 4, participantId: OPPOSITION },
  ];

  it("names players in the club's style and withholds private players", () => {
    const naming = makeJuniorNaming("first_initial", facts);
    expect(shapePublicJuniorTeamList(stored, naming, new Set(facts.keys()), numbers)).toEqual([
      { order: 1, name: "Ollie G", participantId: OWN_A, role: "C", shirtNumber: "7" },
      { order: 2, name: "Private Player", participantId: null, role: "WK", shirtNumber: null },
      { order: 3, name: "Kit O", participantId: OWN_C, role: null, shirtNumber: "3" },
    ]);
  });

  it("leaves shirt numbers out when the register is off", () => {
    const naming = makeJuniorNaming("full", facts);
    const out = shapePublicJuniorTeamList(stored, naming, new Set(facts.keys()), null);
    expect(out.map((p) => p.shirtNumber)).toEqual([null, null, null]);
    expect(out[0]!.name).toBe("Ollie Gallash");
  });
});

describe("shapeAdminJuniorTeamList", () => {
  it("carries full names, shirt numbers and the withheld flag", () => {
    const out = shapeAdminJuniorTeamList(
      [
        { order: 1, participantId: OWN_B, role: "VC" },
        { order: 2, participantId: OPPOSITION },
      ],
      facts,
      numbers,
    );
    expect(out).toEqual([
      {
        order: 1,
        participantId: OWN_B,
        name: "Sam Private",
        role: "VC",
        shirtNumber: "12",
        isPrivate: true,
        isKnown: true,
      },
      {
        order: 2,
        participantId: OPPOSITION,
        name: "Unknown player",
        role: null,
        shirtNumber: null,
        isPrivate: false,
        isKnown: false,
      },
    ]);
  });
});

describe("shapeJuniorTeamListCandidates", () => {
  it("lists the club's juniors by name with full names and shirt numbers", () => {
    const out = shapeJuniorTeamListCandidates(
      [
        {
          participantId: OWN_C,
          displayName: "Kit Overridden",
          isPrivate: true,
          privacyOverride: true,
          teams: "Hawks",
          lastSeason: "2026/27",
        },
        {
          participantId: OWN_B,
          displayName: "Sam Private",
          isPrivate: true,
          privacyOverride: false,
          teams: null,
          lastSeason: null,
        },
        {
          participantId: OWN_A,
          displayName: null,
          isPrivate: false,
          privacyOverride: false,
          teams: null,
          lastSeason: null,
        },
      ],
      numbers,
    );
    expect(out.map((c) => c.participantId)).toEqual([OWN_C, OWN_B]);
    expect(out[0]).toEqual({
      participantId: OWN_C,
      name: "Kit Overridden",
      isPrivate: false,
      shirtNumber: "3",
      teams: "Hawks",
      lastSeason: "2026/27",
    });
    expect(out[1]!.isPrivate).toBe(true);
  });
});
