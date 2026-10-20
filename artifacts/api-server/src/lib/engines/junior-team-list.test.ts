/**
 * The junior team-list card input (junior PlayHQ sync plan U8; KTD13, R17, R20, R21).
 * Pure — no database. The DB-backed drafting is covered by junior-social.db.test.ts (CI).
 */
import { describe, it, expect } from "vitest";
import type { JuniorFixtureRow, JuniorNameStyle, JuniorTeamListPlayer } from "@workspace/db";
import { makeJuniorNaming, type JuniorNameFacts } from "../junior-names";
import { buildJuniorTeamListShirtNumbers } from "../junior-shirt-numbers";
import { juniorCardNamer, juniorTeamListToCardInput } from "./junior-team-list";

const OLLIE = "aaaaaaaa-0000-4000-8000-000000000001";
const SAM = "aaaaaaaa-0000-4000-8000-000000000002";
const PRIV = "aaaaaaaa-0000-4000-8000-000000000003";
const OVERRIDDEN = "aaaaaaaa-0000-4000-8000-000000000004";
const UNKNOWN = "aaaaaaaa-0000-4000-8000-000000000005";
const MERGED = "aaaaaaaa-0000-4000-8000-000000000006";

const fixture: JuniorFixtureRow = {
  id: 7,
  tenantId: 1,
  playhqMatchId: "m-1",
  seasonStartYear: 2026,
  ageGroup: "Year 9",
  grade: "Year 9 Gold",
  teamName: "Halls Head Hawks",
  opponentName: "Rockingham Rams",
  venue: "Halls Head Oval",
  startAt: new Date("2026-10-17T01:00:00Z"),
  isHome: true,
  status: "UPCOMING",
  createdAt: new Date("2026-10-01T00:00:00Z"),
  updatedAt: new Date("2026-10-01T00:00:00Z"),
};

const facts = new Map<string, JuniorNameFacts>([
  [OLLIE, { displayName: "Ollie Gallash", isPrivate: false, privacyOverride: false }],
  [SAM, { displayName: "Sam", isPrivate: false, privacyOverride: false }],
  [PRIV, { displayName: "Secret Child", isPrivate: true, privacyOverride: false }],
  [OVERRIDDEN, { displayName: "Named Kid", isPrivate: true, privacyOverride: true }],
]);

const namer = (style: JuniorNameStyle) => juniorCardNamer(makeJuniorNaming(style, facts));

const players: JuniorTeamListPlayer[] = [
  { order: 3, participantId: PRIV },
  { order: 1, participantId: OLLIE, role: "C" },
  { order: 2, participantId: SAM },
  { order: 4, participantId: OVERRIDDEN },
  { order: 5, participantId: UNKNOWN },
];

type Row = { order: number; surname: string; firstInitial?: string; shirtNumber?: string };
const rowsOf = (input: Record<string, unknown>) => input.players as Row[];

describe("juniorTeamListToCardInput", () => {
  it("is a junior team-list card in batting order", () => {
    const input = juniorTeamListToCardInput(fixture, players, namer("full"));
    expect(input.kind).toBe("teamList");
    expect(input.junior).toBe(true);
    expect(rowsOf(input).map((r) => r.order)).toEqual([1, 2, 3, 4, 5]);
    expect(input.opponent).toBe("Rockingham Rams");
    expect(input.homeAway).toBe("HOME");
    expect(input.grade).toBe("Year 9 Gold");
    expect(input.teamName).toBe("Halls Head Hawks");
  });

  it("names players in the club's full style", () => {
    const rows = rowsOf(juniorTeamListToCardInput(fixture, players, namer("full")));
    expect(rows[0]).toMatchObject({ surname: "GALLASH", firstInitial: "O" });
    expect(rows[1]).toEqual({ order: 2, surname: "SAM" });
    expect(rows[3]).toMatchObject({ surname: "KID", firstInitial: "N" });
  });

  it("names players in the first-name-and-initial style without a surname", () => {
    const rows = rowsOf(juniorTeamListToCardInput(fixture, players, namer("first_initial")));
    expect(rows[0]).toEqual({ order: 1, surname: "OLLIE G", role: "C" });
    expect(JSON.stringify(rows)).not.toContain("GALLASH");
  });

  it("names players by first name only in the first-name style", () => {
    const rows = rowsOf(juniorTeamListToCardInput(fixture, players, namer("first")));
    expect(rows[0]).toEqual({ order: 1, surname: "OLLIE", role: "C" });
    expect(rows[3]).toEqual({ order: 4, surname: "NAMED" });
  });

  it("withholds a private, non-overridden player and an unknown participant", () => {
    const input = juniorTeamListToCardInput(
      fixture,
      players,
      namer("full"),
      buildJuniorTeamListShirtNumbers(
        [
          { participantId: PRIV, number: "13" },
          { participantId: UNKNOWN, number: "14" },
        ],
        [],
      ),
    );
    const rows = rowsOf(input);
    expect(rows[2]).toEqual({ order: 3, surname: "PRIVATE PLAYER" });
    expect(rows[4]).toEqual({ order: 5, surname: "PRIVATE PLAYER" });
    expect(JSON.stringify(input)).not.toContain("SECRET");
    expect(JSON.stringify(input)).not.toContain(PRIV);
  });

  it("numbers players by shirt from the junior register, by participant", () => {
    const numbers = buildJuniorTeamListShirtNumbers(
      [
        { participantId: OLLIE.toUpperCase(), number: "7" },
        { participantId: SAM, number: null },
      ],
      [],
    );
    const input = juniorTeamListToCardInput(fixture, players, namer("full"), numbers);
    expect(input.numbering).toBe("shirt");
    const rows = rowsOf(input);
    expect(rows[0].shirtNumber).toBe("7");
    expect(rows[1]).not.toHaveProperty("shirtNumber");
  });

  it("a merged-away duplicate on the list shows its keeper's number", () => {
    const numbers = buildJuniorTeamListShirtNumbers(
      [{ participantId: OLLIE, number: "7" }],
      [{ duplicateParticipantId: MERGED, keeperParticipantId: OLLIE }],
    );
    expect(numbers.byParticipantId.get(MERGED)).toBe("7");
    expect(numbers.byPlayerId.size).toBe(0);
  });

  it("without the shirt-number feature the card has no numbering", () => {
    const input = juniorTeamListToCardInput(fixture, players, namer("full"), null);
    expect(input).not.toHaveProperty("numbering");
    expect(rowsOf(input).some((r) => "shirtNumber" in r)).toBe(false);
  });

  it("carries no photo of any kind", () => {
    const input = juniorTeamListToCardInput(fixture, players, namer("full"));
    for (const key of [
      "squadPhotoUrl",
      "teamPhotoUrl",
      "cardPhotoUrl",
      "photoUrl",
      "featuredPlayerId",
      "playerId",
    ]) {
      expect(input).not.toHaveProperty(key);
    }
  });
});

describe("juniorTeamListToCardInput overseas mark (ADR-009)", () => {
  it("marks a named overseas player and never a withheld one", () => {
    const input = juniorTeamListToCardInput(
      fixture,
      [
        { order: 1, participantId: OLLIE, overseas: true },
        { order: 2, participantId: PRIV, overseas: true },
        { order: 3, participantId: SAM },
      ],
      namer("full"),
    );
    const rows = input.players as { overseas?: boolean }[];
    expect(rows.map((r) => r.overseas)).toEqual([true, undefined, undefined]);
  });
});
