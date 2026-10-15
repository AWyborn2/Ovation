import { describe, it, expect } from "vitest";
import {
  buildJuniorPreviewRows,
  juniorCanonicalizer,
  juniorRegisterLink,
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
      parsed(1, "Ben Bowler", G.ben, "4"),
      parsed(2, "Amy Archer", null, "5"),
    ]);
    expect(byId).toMatchObject({ status: "matched", participantId: G.ben, playerId: null });
    expect(byName).toMatchObject({ status: "matched", participantId: G.amy, playerId: null });
  });

  it("an id merged away resolves to the keeper", () => {
    const [row] = preview([parsed(1, "Amy Archer", G.dupOfAmy.toUpperCase(), "9")]);
    expect(row).toMatchObject({ status: "matched", participantId: G.amy });
  });

  it("an unknown id with a unique name match takes the matched junior's id", () => {
    const [known] = preview([parsed(1, "Ben Bowler", G.stranger)]);
    expect(known).toMatchObject({ status: "matched", participantId: G.ben });
  });

  it("an unknown PlayHQ id with no name match is held by that id, not a blocker", () => {
    const [held] = preview([parsed(1, "Nobody Here", G.stranger.toUpperCase(), "12")]);
    expect(held).toMatchObject({ status: "held", participantId: G.stranger, number: "12" });
  });

  it("an id that is not a PlayHQ GUID is never held: the row needs a link", () => {
    const [row] = preview([parsed(1, "Nobody Here", "12345", "12")]);
    expect(row).toMatchObject({ status: "new", participantId: null });
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

  it("defaults: matched rows link, held rows hold, everything else is discarded", () => {
    const res = resolveJuniorCommitRows(
      [
        row(1, { status: "matched", participantId: G.amy, number: "5" }),
        row(2, { status: "suggested" }),
        row(3, { status: "new" }),
        row(4, { status: "invalid", errors: ["bad"] }),
        row(5, { status: "held", participantId: G.stranger, number: "12" }),
      ],
      [],
      canonical,
    );
    expect(res).toEqual({
      ok: true,
      planned: [
        {
          row: expect.objectContaining({ rowIndex: 1 }),
          participantId: G.amy,
          held: false,
          explicit: "5",
        },
        {
          row: expect.objectContaining({ rowIndex: 5 }),
          participantId: G.stranger,
          held: true,
          explicit: "12",
        },
      ],
      discarded: 3,
    });
  });

  it("a held row can be discarded or linked instead, but only a held row can be held", () => {
    const rows = [
      row(1, { status: "held", participantId: G.stranger }),
      row(2, { status: "held", participantId: G.cal }),
      row(3, { status: "new" }),
    ];
    const res = resolveJuniorCommitRows(
      rows,
      [
        { rowIndex: 1, action: "discard" },
        { rowIndex: 2, action: "link", participantId: G.ben },
        { rowIndex: 3, action: "discard" },
      ],
      canonical,
    );
    expect(res.ok && res.planned.map((p) => [p.participantId, p.held])).toEqual([[G.ben, false]]);
    expect(
      resolveJuniorCommitRows(rows, [{ rowIndex: 3, action: "hold" }], canonical),
    ).toMatchObject({ ok: false });
  });

  it("a mismatch row needs an explicit decision and can never be held", () => {
    const rows = [row(1, { status: "mismatch", participantId: G.cal, idOwnerName: "Cal Bowler" })];
    expect(resolveJuniorCommitRows(rows, [], canonical)).toMatchObject({ ok: false });
    expect(
      resolveJuniorCommitRows(rows, [{ rowIndex: 1, action: "hold" }], canonical),
    ).toMatchObject({ ok: false });
    const linked = resolveJuniorCommitRows(
      rows,
      [{ rowIndex: 1, action: "link", participantId: G.ben }],
      canonical,
    );
    expect(linked.ok && linked.planned[0]).toMatchObject({ participantId: G.ben, held: false });
  });

  it("uses the senior number only for a same-id, same-name note", () => {
    const same = row(1, {
      status: "matched",
      participantId: G.amy,
      number: "8",
      crossRegister: [{ relation: "same", name: "Amy Archer", number: "3" }],
    });
    const shared = row(2, {
      status: "matched",
      participantId: G.ben,
      number: "8",
      crossRegister: [{ relation: "sharedId", name: "Bob Bowler", number: "3" }],
    });
    const res = resolveJuniorCommitRows(
      [same],
      [{ rowIndex: 1, action: "link", participantId: G.amy, useCrossRegisterNumber: true }],
      canonical,
    );
    expect(res.ok && res.planned[0]!.explicit).toBe("3");
    expect(
      resolveJuniorCommitRows(
        [shared],
        [{ rowIndex: 2, action: "link", participantId: G.ben, useCrossRegisterNumber: true }],
        canonical,
      ),
    ).toMatchObject({ ok: false });
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

  it("a season after the current one is not worn yet and stays off the profile (R14)", () => {
    expect(
      shapeJuniorShirtNumbers(
        [
          { season: 2030, number: "22", participantId: G.amy },
          { season: 2026, number: "4", participantId: G.amy },
        ],
        { currentSeason: 2026, participantId: G.amy },
      ),
    ).toEqual({ shirtNumber: "4", shirtNumbers: [{ season: 2026, number: "4" }] });
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

// ── Family accounts: PlayHQ Profile IDs are not trusted when names disagree ──
// Shapes from a real club's exports (fake ids and names): a parent's id on a child's
// row, brothers' ids crossed, a genuine dual player, and a child not in the app yet.
describe("buildJuniorPreviewRows — family accounts", () => {
  const F = {
    parent: "10000000-0000-4000-8000-000000000001", // Ben Dreckow, a senior (not a junior)
    noah: "10000000-0000-4000-8000-000000000002",
    hayes: "10000000-0000-4000-8000-000000000003",
    cohen: "10000000-0000-4000-8000-000000000004",
    archie: "10000000-0000-4000-8000-000000000005",
    newKid: "10000000-0000-4000-8000-000000000006",
  };
  const juniors: JuniorParticipantLike[] = [
    { participantId: F.noah, displayName: "Noah Dreckow", isPrivate: false },
    { participantId: F.hayes, displayName: "Hayes Buller", isPrivate: false },
    { participantId: F.cohen, displayName: "Cohen Buller", isPrivate: false },
    { participantId: F.archie, displayName: "Archie Nicholson", isPrivate: false },
  ];
  const rows = buildJuniorPreviewRows(
    [
      parsed(1, "Noah Dreckow", F.parent, "48"),
      parsed(2, "Hayes Buller", F.cohen, "3"),
      parsed(3, "Cohen Buller", F.hayes, "8"),
      parsed(4, "Archie Nicholson", F.archie, "70"),
      parsed(5, "Mia Newcomb", F.newKid, "12"),
      parsed(6, "Lily Newcomb", F.newKid, "13"),
    ],
    juniors,
    [],
    [],
  );

  it("a parent's id on a child's row links the child by name, never the parent's id", () => {
    expect(rows[0]).toMatchObject({ status: "matched", participantId: F.noah });
  });

  it("brothers with crossed ids are mismatches, each offered the brother of the same name", () => {
    expect(rows[1]).toMatchObject({
      status: "mismatch",
      idOwnerName: "Cohen Buller",
      participantId: F.cohen,
    });
    expect(rows[1]!.candidates.map((c) => c.participantId)).toEqual([F.hayes]);
    expect(rows[2]).toMatchObject({ status: "mismatch", idOwnerName: "Hayes Buller" });
    expect(rows[2]!.candidates.map((c) => c.participantId)).toEqual([F.cohen]);
  });

  it("a genuine player (same id, same name) matches", () => {
    expect(rows[3]).toMatchObject({ status: "matched", participantId: F.archie });
  });

  it("a new child is held by id; a sibling on the same account needs a link", () => {
    expect(rows[4]).toMatchObject({ status: "held", participantId: F.newKid });
    expect(rows[5]).toMatchObject({ status: "new", participantId: null, errors: [] });
  });
});

describe("juniorRegisterLink", () => {
  const P = {
    noah: "30000000-0000-4000-8000-000000000001",
    parent: "30000000-0000-4000-8000-000000000002",
    hayes: "30000000-0000-4000-8000-000000000003",
    cohen: "30000000-0000-4000-8000-000000000004",
    unknown: "30000000-0000-4000-8000-000000000005",
  };
  const people: JuniorParticipantLike[] = [
    { participantId: P.noah, displayName: "Noah Dreckow", isPrivate: false },
    { participantId: P.hayes, displayName: "Hayes Buller", isPrivate: false },
    { participantId: P.cohen, displayName: "Cohen Buller", isPrivate: false },
  ];
  const link = (
    entry: { participantId: string; name: string; held: boolean },
    onRegister: readonly string[] = [],
  ) => juniorRegisterLink(entry, people, [], new Set(onRegister));

  it("a live entry is linked and shows the PlayHQ name", () => {
    expect(link({ participantId: P.noah, name: "noah dreckow", held: false })).toEqual({
      linkStatus: "linked",
      playerName: "Noah Dreckow",
      suggestedLink: null,
    });
  });

  it("a held entry waits for its player; the sync makes it live", () => {
    expect(link({ participantId: P.unknown, name: "Mia Newcomb", held: true })).toEqual({
      linkStatus: "waiting",
      playerName: null,
      suggestedLink: null,
    });
  });

  it("a held entry whose player arrived under another name is flagged, never live", () => {
    // The sheet put Hayes's id on Cohen's row (brothers crossed).
    expect(link({ participantId: P.hayes, name: "Cohen Buller", held: true })).toMatchObject({
      linkStatus: "nameMismatch",
      playerName: "Hayes Buller",
    });
  });

  it("suggests the one junior with the sheet's exact name under another id (never auto)", () => {
    // A parent's id on the child's row; the child arrived under their own id.
    expect(link({ participantId: P.parent, name: "Noah Dreckow", held: true })).toEqual({
      linkStatus: "waiting",
      playerName: null,
      suggestedLink: { participantId: P.noah, name: "Noah Dreckow" },
    });
    // Not when that junior already has a live entry this season.
    expect(
      link({ participantId: P.parent, name: "Noah Dreckow", held: true }, [P.noah]).suggestedLink,
    ).toBeNull();
    // The mismatch case offers the brother of the sheet's name.
    expect(
      link({ participantId: P.hayes, name: "Cohen Buller", held: true }).suggestedLink,
    ).toEqual({ participantId: P.cohen, name: "Cohen Buller" });
  });
});
