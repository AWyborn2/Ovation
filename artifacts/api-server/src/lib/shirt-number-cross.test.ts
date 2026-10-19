import { describe, it, expect } from "vitest";
import {
  annotateCrossRegister,
  crossRegisterNotes,
  juniorSeniorNumbers,
  registerOverlap,
  type CrossEntry,
  type OverlapSeniorEntry,
} from "./shirt-number-cross";
import { crossRegisterNumberOf, type PreviewRow } from "./shirt-number-upload";

/**
 * The admin-only cross-check between the senior and juniors registers. Shapes from a
 * real club's exports (fake ids and names): a PlayHQ family account puts a parent's or a
 * brother's Profile ID on a child's row, so an id alone never says "same person" — the
 * name has to agree too.
 */

const ID = {
  parent: "20000000-0000-4000-8000-000000000001",
  noah: "20000000-0000-4000-8000-000000000002",
  hayes: "20000000-0000-4000-8000-000000000003",
  cohen: "20000000-0000-4000-8000-000000000004",
  archie: "20000000-0000-4000-8000-000000000005",
  sam: "20000000-0000-4000-8000-000000000006",
};

// The senior register for the season.
const senior: CrossEntry[] = [
  { ids: [ID.parent], name: "Ben Dreckow", number: "6" },
  { ids: [ID.noah], name: "Noah Dreckow", number: "48" },
  // Brothers' ids crossed in the senior export too.
  { ids: [ID.hayes], name: "Cohen Buller", number: "8" },
  { ids: [ID.cohen], name: "Hayes Buller", number: "3" },
  { ids: [ID.archie], name: "Archie Nicholson", number: "70" },
  { ids: [ID.sam], name: "Sam Richards", number: null },
];

describe("crossRegisterNotes", () => {
  it("same id and same name: the same person (a genuine dual player)", () => {
    expect(crossRegisterNotes({ ids: [ID.archie], name: "Archie Nicholson" }, senior)).toEqual([
      { relation: "same", name: "Archie Nicholson", number: "70" },
    ]);
  });

  it("a parent's id on a child's row is a shared id, plus the child's own senior entry by name", () => {
    expect(crossRegisterNotes({ ids: [ID.parent], name: "Noah Dreckow" }, senior)).toEqual([
      { relation: "sharedId", name: "Ben Dreckow", number: "6" },
      { relation: "nameOnly", name: "Noah Dreckow", number: "48" },
    ]);
  });

  it("brothers with crossed ids: never a number difference, the brother's number by name", () => {
    const notes = crossRegisterNotes({ ids: [ID.hayes], name: "Hayes Buller" }, senior);
    expect(notes).toEqual([
      { relation: "sharedId", name: "Cohen Buller", number: "8" },
      { relation: "nameOnly", name: "Hayes Buller", number: "3" },
    ]);
    expect(crossRegisterNumberOf({ crossRegister: notes })).toBeNull();
  });

  it("a dual player unnumbered in the other register gives no number to use", () => {
    const notes = crossRegisterNotes({ ids: [ID.sam], name: "Sam Richards" }, senior);
    expect(notes).toEqual([{ relation: "same", name: "Sam Richards", number: null }]);
    expect(crossRegisterNumberOf({ crossRegister: notes })).toBeNull();
  });

  it("ids are compared in any casing; nothing related gives no notes", () => {
    expect(
      crossRegisterNotes({ ids: [ID.archie.toUpperCase()], name: "archie NICHOLSON" }, senior),
    ).toEqual([{ relation: "same", name: "Archie Nicholson", number: "70" }]);
    expect(crossRegisterNotes({ ids: [null], name: "Nobody Here" }, senior)).toEqual([]);
  });

  it("a name shared by two other-register people is not offered by name", () => {
    const twins: CrossEntry[] = [
      { ids: [], name: "Jo Smith", number: "1" },
      { ids: [], name: "Jo Smith", number: "2" },
    ];
    expect(crossRegisterNotes({ ids: [], name: "Jo Smith" }, twins)).toEqual([]);
  });
});

describe("annotateCrossRegister", () => {
  const row = (rowIndex: number, over: Partial<PreviewRow>): PreviewRow => ({
    rowIndex,
    name: "",
    participantId: null,
    number: null,
    status: "matched",
    playerId: null,
    candidates: [],
    existingEntryId: null,
    existingNumber: null,
    numberChange: false,
    duplicate: false,
    duplicateWith: [],
    errors: [],
    ...over,
  });

  it("notes every usable row by its ids and name, and leaves invalid rows alone", () => {
    const rows = annotateCrossRegister(
      [
        row(1, { name: "Archie Nicholson", participantId: ID.archie, number: "71" }),
        row(2, { name: "Bad Row", status: "invalid", errors: ["x"] }),
      ],
      senior,
      (r) => [r.participantId],
    );
    expect(rows[0]!.crossRegister).toEqual([
      { relation: "same", name: "Archie Nicholson", number: "70" },
    ]);
    expect(crossRegisterNumberOf(rows[0]!)).toBe("70");
    expect(rows[1]!.crossRegister).toEqual([]);
  });
});

describe("juniorSeniorNumbers", () => {
  it("only same-id, same-name, numbered senior entries prefill a junior's number", () => {
    expect(
      juniorSeniorNumbers(
        [
          { participantId: ID.archie, displayName: "Archie Nicholson" },
          { participantId: ID.hayes, displayName: "Hayes Buller" },
          { participantId: ID.sam, displayName: "Sam Richards" },
          { participantId: ID.noah.toUpperCase(), displayName: "Noah Dreckow" },
        ],
        senior,
      ),
    ).toEqual([
      { participantId: ID.archie, number: "70" },
      { participantId: ID.noah, number: "48" },
    ]);
  });
});

describe("registerOverlap (People -> Shirt numbers 'Also in' badges)", () => {
  const sen = (
    id: number,
    category: "men" | "female",
    name: string,
    who: { playerId?: number | null; participantId?: string | null; guids?: string[] } = {},
  ): OverlapSeniorEntry => ({
    id,
    category,
    name,
    playerId: who.playerId ?? null,
    participantId: who.participantId ?? null,
    ids: [who.participantId ?? null, ...(who.guids ?? [])],
  });

  it("groups one person across the men's, female and juniors registers", () => {
    const out = registerOverlap(
      [
        sen(1, "men", "Archie Nicholson", { playerId: 9, guids: [ID.archie] }),
        sen(2, "female", "Archie Nicholson", { playerId: 9 }),
        sen(3, "men", "Solo Senior", { playerId: 10 }),
      ],
      [
        { id: 50, name: "Archie Nicholson", participantId: ID.archie.toUpperCase() },
        { id: 51, name: "Solo Junior", participantId: ID.sam },
      ],
    );
    expect(out).toEqual([
      { registers: ["men", "female", "juniors"], seniorEntryIds: [1, 2], juniorEntryIds: [50] },
    ]);
  });

  it("a shared Profile ID with a different name (family account) is not the same person", () => {
    const out = registerOverlap(
      [sen(1, "men", "Paul Dreckow", { participantId: ID.parent })],
      [{ id: 50, name: "Noah Dreckow", participantId: ID.parent }],
    );
    expect(out).toEqual([]);
  });

  it("returns flags and entry ids only: no names, numbers or stats", () => {
    const out = registerOverlap(
      [sen(1, "men", "Archie Nicholson", { participantId: ID.archie })],
      [{ id: 50, name: "Archie Nicholson", participantId: ID.archie }],
    );
    expect(out).toHaveLength(1);
    expect(Object.keys(out[0]!).sort()).toEqual(["juniorEntryIds", "registers", "seniorEntryIds"]);
  });
});
