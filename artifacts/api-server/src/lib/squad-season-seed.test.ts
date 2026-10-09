import { describe, it, expect } from "vitest";
import {
  NAME_RANK,
  collectSeasonPlayers,
  pickName,
  planSeasonSeed,
  seasonWindow,
  splitPersonName,
  type SeasonAppearance,
} from "./squad-season-seed";

/** Pure rules of the squad register's season seed. */

const appearance = (over: Partial<SeasonAppearance>): SeasonAppearance => ({
  playerId: null,
  participantId: null,
  names: [],
  grade: "A Grade",
  at: "2026-10-03",
  isPrivate: false,
  ...over,
});

describe("seasonWindow", () => {
  it("starts the season on 1 July in Perth", () => {
    // 00:30 on 1 July in Perth is still 30 June in UTC.
    expect(seasonWindow(new Date("2026-06-30T16:30:00Z"))).toMatchObject({
      startYear: 2026,
      from: "2026-07-01",
      to: "2027-07-01",
    });
    expect(seasonWindow(new Date("2026-06-30T15:59:00Z")).startYear).toBe(2025);
    expect(seasonWindow(new Date("2027-03-01T00:00:00Z")).startYear).toBe(2026);
  });

  it("gives the Perth instants of the window", () => {
    const w = seasonWindow(new Date("2026-10-09T00:00:00Z"));
    expect(w.fromAt.toISOString()).toBe("2026-06-30T16:00:00.000Z");
    expect(w.toAt.toISOString()).toBe("2027-06-30T16:00:00.000Z");
  });
});

describe("splitPersonName", () => {
  it("reads 'Surname, Firstname' and 'First Last'", () => {
    expect(splitPersonName("Wyllie, Jack")).toEqual({ firstName: "Jack", lastName: "Wyllie" });
    expect(splitPersonName("Tom De Pedro")).toEqual({ firstName: "Tom", lastName: "De Pedro" });
    expect(splitPersonName("  Jack   Wyllie ")).toEqual({ firstName: "Jack", lastName: "Wyllie" });
  });

  it("title-cases an all-lower-case name and refuses one word", () => {
    expect(splitPersonName("a geeraets")).toEqual({ firstName: "A", lastName: "Geeraets" });
    expect(splitPersonName("Wyllie")).toBeNull();
    expect(splitPersonName("")).toBeNull();
    expect(splitPersonName(", Jack")).toBeNull();
  });
});

describe("pickName", () => {
  it("prefers a full given name over an initial, whatever the source", () => {
    expect(
      pickName([
        { name: "J Wyllie", rank: NAME_RANK.teamList },
        { name: "Wyllie, Jack", rank: NAME_RANK.centralDisplay },
      ]),
    ).toEqual({ firstName: "Jack", lastName: "Wyllie" });
  });

  it("then the better source, and keeps an initial when that is all there is", () => {
    expect(
      pickName([
        { name: "Wyllie, Jackson", rank: NAME_RANK.centralDisplay },
        { name: "Jack Wyllie", rank: NAME_RANK.teamList },
      ]),
    ).toEqual({ firstName: "Jack", lastName: "Wyllie" });
    expect(pickName([{ name: "J Wyllie", rank: NAME_RANK.centralLine }])).toEqual({
      firstName: "J",
      lastName: "Wyllie",
    });
    expect(pickName([{ name: "Wyllie", rank: NAME_RANK.teamList }])).toBeNull();
  });
});

describe("collectSeasonPlayers", () => {
  it("merges a player's team-list and central sightings, taking the latest grade", () => {
    const { players, skipped } = collectSeasonPlayers([
      appearance({
        playerId: 7,
        participantId: "ABC",
        names: [{ name: "Jack Wyllie", rank: NAME_RANK.teamList }],
        grade: "B Grade",
        at: "2026-10-03T01:30:00.000Z",
      }),
      appearance({
        participantId: "abc",
        names: [{ name: "J Wyllie", rank: NAME_RANK.centralLine }],
        grade: "A Grade",
        at: "2026-10-10",
        isPrivate: true,
      }),
    ]);
    expect(skipped).toBe(0);
    expect(players).toEqual([
      { firstName: "Jack", lastName: "Wyllie", playerId: 7, gradeHint: "A Grade", isPrivate: true },
    ]);
  });

  it("folds a typed name into the one identified player with that name", () => {
    const { players } = collectSeasonPlayers([
      appearance({ playerId: 7, names: [{ name: "Jack Wyllie", rank: 0 }] }),
      appearance({ names: [{ name: "jack wyllie", rank: 0 }], at: "2026-11-01" }),
      appearance({ names: [{ name: "Sam New", rank: 0 }] }),
      appearance({ names: [{ name: "Sam New", rank: 0 }] }),
    ]);
    expect(players.map((p) => `${p.firstName} ${p.lastName}`).sort()).toEqual([
      "Jack Wyllie",
      "Sam New",
    ]);
  });

  it("skips fill-ins (by id, or a GUID seen as a fill-in) and nameless players", () => {
    const { players, skipped } = collectSeasonPlayers([
      appearance({ playerId: 90001, participantId: "f1", names: [{ name: "Fill In", rank: 0 }] }),
      appearance({ participantId: "F1", names: [{ name: "Fill In", rank: 3 }] }),
      appearance({ playerId: 95000, names: [{ name: "Other Fill", rank: 0 }] }),
      appearance({ playerId: 8, names: [] }),
      appearance({ playerId: 9, names: [{ name: "Real Player", rank: 0 }] }),
    ]);
    expect(players.map((p) => p.lastName)).toEqual(["Player"]);
    expect(skipped).toBe(3);
  });
});

describe("planSeasonSeed", () => {
  const member = (firstName: string, lastName: string, linkedPlayerId: number | null = null) => ({
    firstName,
    lastName,
    preferredName: null,
    linkedPlayerId,
  });
  const player = (firstName: string, lastName: string, playerId: number | null = null) => ({
    firstName,
    lastName,
    playerId,
    gradeHint: "A Grade",
    isPrivate: false,
  });

  it("finds members by linked player, then full name", () => {
    const { toAdd, alreadyPresent } = planSeasonSeed(
      [player("Someone", "Else", 7), player("Jack", "Wyllie"), player("New", "Person", 9)],
      [member("Jordan", "Linked", 7), { ...member("Jackson", "Wyllie"), preferredName: "Jack" }],
    );
    expect(alreadyPresent).toBe(2);
    expect(toAdd.map((p) => p.lastName)).toEqual(["Person"]);
  });

  it("matches first initial + surname only when unique and one side is an initial", () => {
    const { toAdd, alreadyPresent } = planSeasonSeed(
      [
        player("J", "Wyllie"),
        player("Kim", "Initial"),
        player("Jack", "Smith"),
        player("T", "Twin"),
      ],
      [
        member("Jack", "Wyllie"),
        member("K", "Initial"),
        member("James", "Smith"),
        member("Tom", "Twin"),
        member("Tim", "Twin"),
      ],
    );
    expect(alreadyPresent).toBe(2);
    expect(toAdd.map((p) => `${p.firstName} ${p.lastName}`)).toEqual(["Jack Smith", "T Twin"]);
  });
});
