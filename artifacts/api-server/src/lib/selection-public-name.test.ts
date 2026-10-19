import { describe, it, expect } from "vitest";
import {
  PRIVATE_PLAYER,
  namedPublicly,
  publicName,
  selectionPublishedPlayers,
} from "./selection-published-players";

/**
 * Who is named on the club's public surfaces (ADR-008): a public member always; a
 * private member only once an admin turns on `showNamePublicly`, and never a junior
 * or under-18 member. A reader that doesn't select the flag reads it as off, so
 * every existing caller is unchanged.
 */

const NOW = new Date("2026-10-19T02:00:00Z");
const adult = {
  firstName: "Casey",
  lastName: "Nguyen",
  preferredName: null,
  section: "senior" as const,
  dateOfBirth: "1995-03-04",
};

describe("namedPublicly / publicName", () => {
  it("names a public member", () => {
    expect(namedPublicly({ ...adult, isPrivate: false }, NOW)).toBe(true);
    expect(publicName({ ...adult, isPrivate: false }, NOW)).toBe("Casey Nguyen");
  });

  it("masks a private member unless an admin chose to name them", () => {
    expect(publicName({ ...adult, isPrivate: true }, NOW)).toBe(PRIVATE_PLAYER);
    expect(publicName({ ...adult, isPrivate: true, showNamePublicly: false }, NOW)).toBe(
      PRIVATE_PLAYER,
    );
    expect(publicName({ ...adult, isPrivate: true, showNamePublicly: true }, NOW)).toBe(
      "Casey Nguyen",
    );
  });

  it("never names a private junior or under-18 member, whatever the flag", () => {
    const flagged = { ...adult, isPrivate: true, showNamePublicly: true };
    expect(namedPublicly({ ...flagged, section: "junior" }, NOW)).toBe(false);
    expect(namedPublicly({ ...flagged, dateOfBirth: "2010-01-01" }, NOW)).toBe(false);
    // Turns 18 the day after NOW (Perth date): still under 18.
    expect(namedPublicly({ ...flagged, dateOfBirth: "2008-10-20" }, NOW)).toBe(false);
    expect(namedPublicly({ ...flagged, dateOfBirth: "2008-10-19" }, NOW)).toBe(true);
  });

  it("names a flagged senior whose birth date is unknown", () => {
    expect(
      namedPublicly({ ...adult, dateOfBirth: null, isPrivate: true, showNamePublicly: true }, NOW),
    ).toBe(true);
  });

  it("reads a missing section as not senior", () => {
    expect(
      namedPublicly(
        { isPrivate: true, showNamePublicly: true, dateOfBirth: "1990-01-01" } as never,
        NOW,
      ),
    ).toBe(false);
  });
});

describe("selectionPublishedPlayers with the public-name flag", () => {
  const side = {
    slots: [{ memberId: 1 }, { memberId: 2 }],
    captainMemberId: null,
    keeperMemberId: null,
  };
  const member = (id: number, extra: object) => ({
    id,
    ...adult,
    firstName: `P${id}`,
    linkedPlayerId: null,
    ...extra,
  });

  it("publishes a flagged private senior by name and an unflagged one as Private Player", () => {
    const players = selectionPublishedPlayers(side, [
      member(1, { isPrivate: true, showNamePublicly: true }),
      member(2, { isPrivate: true }),
    ]);
    expect(players.map((p) => p.displayName)).toEqual(["P1 Nguyen", PRIVATE_PLAYER]);
  });

  it("never attaches an identity to a private member, named or not", () => {
    const players = selectionPublishedPlayers(
      side,
      [
        member(1, { isPrivate: true, showNamePublicly: true, linkedPlayerId: 42 }),
        member(2, { isPrivate: false, linkedPlayerId: 43 }),
      ],
      new Map([
        [1, "aaaaaaaa-0000-0000-0000-000000000001"],
        [2, "aaaaaaaa-0000-0000-0000-000000000002"],
      ]),
    );
    expect(players[0]).not.toHaveProperty("playerId");
    expect(players[0]).not.toHaveProperty("participantId");
    expect(players[1].playerId).toBe(43);
  });
});
