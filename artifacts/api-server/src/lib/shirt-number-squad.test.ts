import { describe, it, expect } from "vitest";
import {
  planJuniorSquadAdd,
  planSeniorSquadAdd,
  squadMemberName,
  type SquadMemberLike,
} from "./shirt-number-squad";
import type { RegisterEntryLike } from "./shirt-numbers";
import type { JuniorMergeLike, JuniorParticipantLike } from "./junior-shirt-numbers";

/**
 * "Add squad to register" (plan R5, U4, U10): the pure planning of which of the
 * club's squad members (`squad_members`, the availability squad import) become
 * season register entries. No database: members, the tenant's linkable player
 * ids, junior participants and both seasons' registers are injected.
 */

const member = (
  first: string,
  last: string,
  extra: Partial<SquadMemberLike> = {},
): SquadMemberLike => ({
  firstName: first,
  lastName: last,
  preferredName: null,
  playhqProfileId: null,
  linkedPlayerId: null,
  isPrivate: false,
  ...extra,
});

const entry = (
  id: number,
  name: string,
  number: string | null,
  who: { playerId?: number | null; participantId?: string | null } = {},
): RegisterEntryLike => ({
  id,
  name,
  number,
  playerId: who.playerId ?? null,
  participantId: who.participantId ?? null,
});

const GUID = (n: number) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("squadMemberName", () => {
  it("is the first and last name, trimmed and collapsed", () => {
    expect(squadMemberName(member("  Jo ", " Hale  Smith "))).toBe("Jo Hale Smith");
  });
});

describe("planSeniorSquadAdd", () => {
  const base = {
    current: [] as RegisterEntryLike[],
    previous: [] as RegisterEntryLike[],
    rolloverPolicy: "carry" as const,
    duplicatePolicy: "warn" as const,
  };

  it("adds a linked member with its player id and the crosswalk participant id", () => {
    const plan = planSeniorSquadAdd({
      ...base,
      members: [member("Alex", "Able", { linkedPlayerId: 101, playhqProfileId: "PROFILE-1" })],
      linkable: new Map([[101, GUID(1)]]),
    });
    expect(plan.create).toEqual([
      { name: "Alex Able", playerId: 101, participantId: GUID(1), number: null },
    ]);
    expect(plan.skipped).toBe(0);
    expect(plan.unmatched).toEqual([]);
  });

  it("never stores the PlayHQ profile id as a participant id", () => {
    const plan = planSeniorSquadAdd({
      ...base,
      members: [member("Una", "Linked", { playhqProfileId: GUID(9) })],
      linkable: new Map(),
    });
    expect(plan.create).toEqual([
      { name: "Una Linked", playerId: null, participantId: null, number: null },
    ]);
  });

  it("adds an unlinked member as a held, name-only entry", () => {
    const plan = planSeniorSquadAdd({
      ...base,
      members: [member("Ned", "New")],
      linkable: new Map(),
    });
    expect(plan.create).toEqual([
      { name: "Ned New", playerId: null, participantId: null, number: null },
    ]);
  });

  it("adds a private member like any other (admin-only data)", () => {
    const plan = planSeniorSquadAdd({
      ...base,
      members: [member("Pia", "Private", { isPrivate: true, linkedPlayerId: 102 })],
      linkable: new Map([[102, null]]),
    });
    expect(plan.create).toEqual([
      { name: "Pia Private", playerId: 102, participantId: null, number: null },
    ]);
  });

  it("drops a fill-in link or one outside the tenant's player space, holding the entry", () => {
    const plan = planSeniorSquadAdd({
      ...base,
      members: [
        member("Fil", "Inn", { linkedPlayerId: 90_001 }),
        member("Out", "Side", { linkedPlayerId: 555 }),
      ],
      // Even a fill-in id that slipped into the map is never linked.
      linkable: new Map([[90_001, null]]),
    });
    expect(plan.create.map((c) => [c.name, c.playerId])).toEqual([
      ["Fil Inn", null],
      ["Out Side", null],
    ]);
  });

  it("leaves an existing entry for the same person as it is", () => {
    const plan = planSeniorSquadAdd({
      ...base,
      members: [
        member("Alex", "Able", { linkedPlayerId: 101 }),
        member("Bea", "Bat", { linkedPlayerId: 102 }),
        member("Cy", "Held", { linkedPlayerId: 103 }),
        member("Dee", "Dup"),
        member("Eve", "Twin", { linkedPlayerId: 105 }),
      ],
      linkable: new Map<number, string | null>([
        [101, null],
        [102, GUID(2)],
        [103, null],
        [105, null],
      ]),
      current: [
        entry(1, "Alexander Able", "7", { playerId: 101 }),
        // A held lineup entry carrying the participant only.
        entry(2, "B Bat", null, { participantId: GUID(2) }),
        // A unique name-only held entry.
        entry(3, "Cy HELD", "3"),
        // An unlinked member matches any entry by name.
        entry(4, "Dee Dup", "4", { playerId: 104 }),
        // Two name-only entries share Eve's name: not unique, so Eve is added.
        entry(5, "Eve Twin", null),
        entry(6, "Eve Twin", null),
      ],
    });
    expect(plan.skipped).toBe(4);
    expect(plan.create.map((c) => c.name)).toEqual(["Eve Twin"]);
  });

  it("recognises an unlinked member by preferred name too", () => {
    const plan = planSeniorSquadAdd({
      ...base,
      members: [member("Robert", "Roe", { preferredName: "Bob" })],
      linkable: new Map(),
      current: [entry(1, "Bob Roe", "8")],
    });
    expect(plan.skipped).toBe(1);
    expect(plan.create).toEqual([]);
  });

  it("is idempotent within one run: a repeated member is added once", () => {
    const plan = planSeniorSquadAdd({
      ...base,
      members: [member("Ned", "New"), member("Ned", "New")],
      linkable: new Map(),
    });
    expect(plan.create).toHaveLength(1);
    expect(plan.skipped).toBe(1);
  });

  it("carries last season's number by player or participant id under carry", () => {
    const plan = planSeniorSquadAdd({
      ...base,
      members: [
        member("Alex", "Able", { linkedPlayerId: 101 }),
        member("Bea", "Bat", { linkedPlayerId: 102 }),
        member("Ned", "New"),
      ],
      linkable: new Map<number, string | null>([
        [101, null],
        [102, GUID(2)],
      ]),
      previous: [
        entry(10, "Alex Able", "7", { playerId: 101 }),
        entry(11, "B Bat", "12", { participantId: GUID(2) }),
        // Name-only entries never carry (ids only, like carriedNumberFor).
        entry(12, "Ned New", "99"),
      ],
    });
    expect(plan.create.map((c) => [c.name, c.number])).toEqual([
      ["Alex Able", "7"],
      ["Bea Bat", "12"],
      ["Ned New", null],
    ]);
  });

  it("carries nothing under blank, but still adds the members", () => {
    const plan = planSeniorSquadAdd({
      ...base,
      rolloverPolicy: "blank",
      members: [member("Alex", "Able", { linkedPlayerId: 101 })],
      linkable: new Map([[101, null]]),
      previous: [entry(10, "Alex Able", "7", { playerId: 101 })],
    });
    expect(plan.create).toEqual([
      { name: "Alex Able", playerId: 101, participantId: null, number: null },
    ]);
  });

  it("under block, leaves off a carried number someone already wears (also within the run)", () => {
    const plan = planSeniorSquadAdd({
      ...base,
      duplicatePolicy: "block",
      members: [
        member("Alex", "Able", { linkedPlayerId: 101 }),
        member("Bea", "Bat", { linkedPlayerId: 102 }),
        member("Cy", "Cee", { linkedPlayerId: 103 }),
      ],
      linkable: new Map<number, string | null>([
        [101, null],
        [102, null],
        [103, null],
      ]),
      current: [entry(1, "Zed Zee", "7", { playerId: 999 })],
      previous: [
        entry(10, "Alex Able", "7", { playerId: 101 }),
        entry(11, "Bea Bat", "12", { playerId: 102 }),
        entry(12, "Cy Cee", "12", { playerId: 103 }),
      ],
    });
    expect(plan.create.map((c) => [c.name, c.number])).toEqual([
      ["Alex Able", null],
      ["Bea Bat", "12"],
      ["Cy Cee", null],
    ]);
    expect(plan.blocked).toEqual([
      { name: "Alex Able", number: "7" },
      { name: "Cy Cee", number: "12" },
    ]);
  });

  it("under warn, keeps a carried duplicate", () => {
    const plan = planSeniorSquadAdd({
      ...base,
      members: [member("Alex", "Able", { linkedPlayerId: 101 })],
      linkable: new Map([[101, null]]),
      current: [entry(1, "Zed Zee", "7", { playerId: 999 })],
      previous: [entry(10, "Alex Able", "7", { playerId: 101 })],
    });
    expect(plan.create[0]!.number).toBe("7");
    expect(plan.blocked).toEqual([]);
  });
});

describe("planJuniorSquadAdd", () => {
  const participants: JuniorParticipantLike[] = [
    { participantId: GUID(1).toUpperCase(), displayName: "Amy Archer", isPrivate: false },
    { participantId: GUID(2), displayName: "Ben Bowler", isPrivate: false },
    { participantId: GUID(3), displayName: "Cal Catch", isPrivate: false },
    { participantId: GUID(4), displayName: "Cal Catch", isPrivate: false },
    { participantId: GUID(5), displayName: "Pip Private", isPrivate: true },
  ];
  const merges: JuniorMergeLike[] = [
    { duplicateParticipantId: GUID(6), keeperParticipantId: GUID(1) },
  ];
  const base = {
    participants,
    merges,
    current: [] as RegisterEntryLike[],
    previous: [] as RegisterEntryLike[],
    rolloverPolicy: "carry" as const,
    duplicatePolicy: "warn" as const,
  };

  it("matches a member whose profile id is a junior participant id (any casing, merges followed)", () => {
    const plan = planJuniorSquadAdd({
      ...base,
      members: [
        member("Amelia", "Archer", { playhqProfileId: GUID(1) }),
        member("Different", "Name", { playhqProfileId: GUID(6).toUpperCase() }),
      ],
    });
    expect(plan.create.map((c) => [c.name, c.participantId])).toEqual([["Amelia Archer", GUID(1)]]);
    // The merged-away id resolves to Amy too: already added in this run.
    expect(plan.skipped).toBe(1);
  });

  it("falls back to a unique exact normalised name", () => {
    const plan = planJuniorSquadAdd({
      ...base,
      members: [member("ben", "BOWLER", { playhqProfileId: "not-a-participant" })],
    });
    expect(plan.create).toEqual([
      { name: "ben BOWLER", playerId: null, participantId: GUID(2), number: null },
    ]);
  });

  it("reports ambiguous, private-only and unknown names as unmatched and creates nothing for them", () => {
    const plan = planJuniorSquadAdd({
      ...base,
      members: [member("Cal", "Catch"), member("Pip", "Private"), member("Nobody", "Known")],
    });
    expect(plan.create).toEqual([]);
    expect(plan.unmatched).toEqual(["Cal Catch", "Pip Private", "Nobody Known"]);
  });

  it("adds a private squad member matched by id", () => {
    const plan = planJuniorSquadAdd({
      ...base,
      members: [member("Pip", "Private", { playhqProfileId: GUID(5), isPrivate: true })],
    });
    expect(plan.create.map((c) => c.participantId)).toEqual([GUID(5)]);
  });

  it("skips a participant already on the season's register and carries last season's number", () => {
    const plan = planJuniorSquadAdd({
      ...base,
      duplicatePolicy: "block",
      members: [
        member("Amy", "Archer", { playhqProfileId: GUID(1) }),
        member("Ben", "Bowler", { playhqProfileId: GUID(2) }),
      ],
      current: [entry(1, "Amy Archer", "5", { participantId: GUID(1) })],
      previous: [entry(10, "Ben Bowler", "5", { participantId: GUID(2) })],
    });
    expect(plan.skipped).toBe(1);
    // Ben's carried #5 is Amy's this season: left off under block.
    expect(plan.create).toEqual([
      { name: "Ben Bowler", playerId: null, participantId: GUID(2), number: null },
    ]);
    expect(plan.blocked).toEqual([{ name: "Ben Bowler", number: "5" }]);
  });
});
