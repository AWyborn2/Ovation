import { describe, it, expect } from "vitest";
import {
  buildJuniorPreviewRows,
  juniorCanonicalizer,
  resolveJuniorCommitRows,
  shapeJuniorShirtNumbers,
  type JuniorMergeLike,
  type JuniorParticipantLike,
} from "./junior-shirt-numbers";
import type { ParsedUploadRow, PreviewRow } from "./shirt-number-upload";
import type { RegisterEntryLike } from "./shirt-numbers";

/**
 * Season shirt numbers — the juniors register's pure rules (plan U10; R17
 * applying R4, R5, R7, R8, R14-R16). No database: participants, merges and the
 * season's register are injected.
 */

const G = {
  amy: "aaaaaaaa-0000-4000-8000-000000000001",
  ben: "bbbbbbbb-0000-4000-8000-000000000002",
  cal: "cccccccc-0000-4000-8000-000000000003",
  dupOfAmy: "dddddddd-0000-4000-8000-000000000004",
  priv: "eeeeeeee-0000-4000-8000-000000000005",
  stranger: "ffffffff-0000-4000-8000-000000000006",
};

const participants: JuniorParticipantLike[] = [
  // Stored casing is whatever the juniors export used; the register lowercases.
  { participantId: G.amy.toUpperCase(), displayName: "Amy Archer", isPrivate: false },
  { participantId: G.ben, displayName: "Ben Bowler", isPrivate: false },
  { participantId: G.cal, displayName: "Cal Bowler", isPrivate: false },
  { participantId: G.priv, displayName: "Pip Private", isPrivate: true },
];
const merges: JuniorMergeLike[] = [
  { duplicateParticipantId: G.dupOfAmy, keeperParticipantId: G.amy.toUpperCase() },
];

const parsed = (
  rowIndex: number,
  name: string,
  participantId: string | null = null,
  number: string | null = null,
  errors: string[] = [],
): ParsedUploadRow => {
  const parts = name.split(" ");
  return {
    rowIndex,
    name,
    givenName: parts.slice(0, -1).join(" "),
    surname: parts[parts.length - 1] ?? "",
    participantId,
    number,
    errors,
  };
};

describe("juniorCanonicalizer", () => {
  const canonical = juniorCanonicalizer(participants, merges);

  it("lowercases a known participant id whatever its casing", () => {
    expect(canonical(G.amy)).toBe(G.amy);
    expect(canonical(G.amy.toUpperCase())).toBe(G.amy);
    expect(canonical(`  ${G.ben}  `)).toBe(G.ben);
  });

  it("follows a merged-away duplicate to its keeper", () => {
    expect(canonical(G.dupOfAmy)).toBe(G.amy);
    expect(canonical(G.dupOfAmy.toUpperCase())).toBe(G.amy);
  });

  it("returns null for ids that are not the club's junior participants", () => {
    expect(canonical(G.stranger)).toBeNull();
    expect(canonical("")).toBeNull();
    expect(canonical(null)).toBeNull();
  });

  it("treats a merge cycle as a miss", () => {
    const loop = juniorCanonicalizer(
      [],
      [
        { duplicateParticipantId: "x", keeperParticipantId: "y" },
        { duplicateParticipantId: "y", keeperParticipantId: "x" },
      ],
    );
    expect(loop("x")).toBeNull();
  });
});

describe("buildJuniorPreviewRows", () => {
  const preview = (rows: ParsedUploadRow[], entries: RegisterEntryLike[] = []) =>
    buildJuniorPreviewRows(rows, participants, merges, entries);

  it("matches by participant id first, then by name", () => {
    const [byId, byName] = preview([
      parsed(1, "Totally Different", G.ben, "4"),
      parsed(2, "Amy Archer", null, "5"),
    ]);
    expect(byId).toMatchObject({ status: "matched", participantId: G.ben, playerId: null });
    expect(byName).toMatchObject({ status: "matched", participantId: G.amy, playerId: null });
  });

  it("an id merged away resolves to the keeper", () => {
    const [row] = preview([parsed(1, "Amy A", G.dupOfAmy.toUpperCase(), "9")]);
    expect(row).toMatchObject({ status: "matched", participantId: G.amy });
  });

  it("an unknown id falls back to the name and never keeps the stranger's id", () => {
    const [known, unknown] = preview([
      parsed(1, "Ben Bowler", G.stranger),
      parsed(2, "Nobody Here", G.stranger),
    ]);
    expect(known).toMatchObject({ status: "matched", participantId: G.ben });
    expect(unknown).toMatchObject({ status: "new", participantId: null });
  });

  it("a private participant matches by id but is never offered by name", () => {
    const [byId, byName] = preview([
      parsed(1, "Pip Private", G.priv),
      parsed(2, "Pip Private", null),
    ]);
    expect(byId).toMatchObject({ status: "matched", participantId: G.priv });
    expect(byName!.status).toBe("new");
  });

  it("near names are suggestions with participant candidates, never applied", () => {
    const [row] = preview([parsed(1, "Ben Bowlerr", null, "3")]);
    expect(row!.status).toBe("suggested");
    expect(row!.participantId).toBeNull();
    expect(row!.candidates.map((c) => c.participantId)).toContain(G.ben);
    expect(row!.candidates.every((c) => c.playerId === null)).toBe(true);
  });

  it("reports the entry it updates, a number change and duplicates in the junior season", () => {
    const entries: RegisterEntryLike[] = [
      { id: 10, name: "Amy Archer", number: "5", playerId: null, participantId: G.amy },
      { id: 11, name: "Cal Bowler", number: "8", playerId: null, participantId: G.cal },
    ];
    const [amy, ben] = preview(
      [parsed(1, "Amy Archer", G.amy, "6"), parsed(2, "Ben Bowler", G.ben, "8")],
      entries,
    );
    expect(amy).toMatchObject({ existingEntryId: 10, existingNumber: "5", numberChange: true });
    expect(ben).toMatchObject({
      existingEntryId: null,
      duplicate: true,
      duplicateWith: ["Cal Bowler"],
    });
  });
});

describe("resolveJuniorCommitRows", () => {
  const canonical = juniorCanonicalizer(participants, merges);
  const row = (rowIndex: number, over: Partial<PreviewRow> = {}): PreviewRow => ({
    rowIndex,
    name: `Row ${rowIndex}`,
    participantId: null,
    number: null,
    status: "new",
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

  it("defaults: matched rows link to their participant, everything else is discarded", () => {
    const res = resolveJuniorCommitRows(
      [
        row(1, { status: "matched", participantId: G.amy, number: "5" }),
        row(2, { status: "suggested" }),
        row(3, { status: "new" }),
        row(4, { status: "invalid", errors: ["bad"] }),
      ],
      [],
      canonical,
    );
    expect(res).toEqual({
      ok: true,
      planned: [{ row: expect.objectContaining({ rowIndex: 1 }), participantId: G.amy }],
      discarded: 3,
    });
  });

  it("links a suggested or new row to a chosen participant (merges resolved)", () => {
    const res = resolveJuniorCommitRows(
      [row(1, { status: "suggested" }), row(2, { status: "new" })],
      [
        { rowIndex: 1, action: "link", participantId: G.ben.toUpperCase() },
        { rowIndex: 2, action: "link", participantId: G.dupOfAmy },
      ],
      canonical,
    );
    expect(res.ok && res.planned.map((p) => p.participantId)).toEqual([G.ben, G.amy]);
  });

  it("refuses a link to someone who is not one of the club's junior participants", () => {
    const res = resolveJuniorCommitRows(
      [row(1)],
      [{ rowIndex: 1, action: "link", participantId: G.stranger }],
      canonical,
    );
    expect(res).toMatchObject({ ok: false });
    expect(!res.ok && res.error).toMatch(/junior participant/);
  });

  it("refuses a link with no participant, an invalid row, a stray or doubled resolution", () => {
    const rows = [row(1), row(2, { status: "invalid", errors: ["bad"] })];
    for (const resolutions of [
      [{ rowIndex: 1, action: "link" as const }],
      [{ rowIndex: 2, action: "link" as const, participantId: G.ben }],
      [{ rowIndex: 9, action: "discard" as const }],
      [
        { rowIndex: 1, action: "discard" as const },
        { rowIndex: 1, action: "discard" as const },
      ],
    ]) {
      expect(resolveJuniorCommitRows(rows, resolutions, canonical).ok).toBe(false);
    }
  });

  it("refuses two rows for the same participant", () => {
    const res = resolveJuniorCommitRows(
      [row(1, { status: "matched", participantId: G.amy }), row(2)],
      [{ rowIndex: 2, action: "link", participantId: G.dupOfAmy }],
      canonical,
    );
    expect(res).toEqual({ ok: false, error: "Rows 1 and 2 are the same person." });
  });
});

describe("shapeJuniorShirtNumbers", () => {
  it("gives the current season's number and numbered seasons newest first", () => {
    expect(
      shapeJuniorShirtNumbers(
        [
          { season: 2024, number: "3", participantId: G.amy },
          { season: 2026, number: "07", participantId: G.amy },
          { season: 2025, number: null, participantId: G.amy },
        ],
        { currentSeason: 2026, participantId: G.amy },
      ),
    ).toEqual({
      shirtNumber: "07",
      shirtNumbers: [
        { season: 2026, number: "07" },
        { season: 2024, number: "3" },
      ],
    });
  });

  it("no number this season shows none (never a placeholder)", () => {
    expect(
      shapeJuniorShirtNumbers([{ season: 2024, number: "3", participantId: G.amy }], {
        currentSeason: 2026,
        participantId: G.amy,
      }).shirtNumber,
    ).toBeNull();
  });

  it("the keeper's own entry wins over a merged duplicate's in the same season", () => {
    const shaped = shapeJuniorShirtNumbers(
      [
        { season: 2026, number: "11", participantId: G.dupOfAmy },
        { season: 2026, number: "5", participantId: G.amy },
        { season: 2025, number: "11", participantId: G.dupOfAmy },
      ],
      { currentSeason: 2026, participantId: G.amy },
    );
    expect(shaped.shirtNumber).toBe("5");
    expect(shaped.shirtNumbers).toEqual([
      { season: 2026, number: "5" },
      { season: 2025, number: "11" },
    ]);
  });
});
