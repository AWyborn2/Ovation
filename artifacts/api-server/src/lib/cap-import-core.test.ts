import { describe, expect, it } from "vitest";
import {
  CAP_BATCH_TOKEN_RE,
  capBatchNote,
  capBatchToken,
  capImportTemplateCsv,
  capNameKey,
  capUndoBlockers,
  groupCapBatches,
  parseCapBatchNote,
  parseCapCsv,
  parseSeedArgs,
  planCapSeed,
  readCsvRecords,
  type CapCandidate,
  type CapSeedRow,
} from "./cap-import-core";

const csv = (body: string) => `category,cap_number,name,games_a_grade\r\n${body}`;
const cand = (playerId: number, displayName: string | null, isPrivate = false): CapCandidate => ({
  playerId,
  displayName,
  isPrivate,
});
const none = { male: 0, female: 0 };
const rows = (text: string): CapSeedRow[] => parseCapCsv(csv(text)).rows;

describe("readCsvRecords / parseCapCsv", () => {
  it("reads quoted commas and CRLF", () => {
    expect(readCsvRecords('a,"b, c"\r\n1,2\r\n')).toEqual([
      ["a", "b, c"],
      ["1", "2"],
    ]);
  });

  it("ignores a leading byte-order mark", () => {
    const withBom = parseCapCsv(String.fromCharCode(0xfeff) + csv("male,1,Bom Smith,3"));
    expect(withBom.errors).toEqual([]);
    expect(withBom.rows[0]!.name).toBe("Bom Smith");
  });

  it("parses rows with their spreadsheet row number", () => {
    const parsed = parseCapCsv(csv("male,1,Leigh McIntosh,196\r\nfemale,1,Matilda Gray,41\r\n"));
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toEqual([
      { row: 2, category: "male", capNumber: 1, name: "Leigh McIntosh", games: 196 },
      { row: 3, category: "female", capNumber: 1, name: "Matilda Gray", games: 41 },
    ]);
  });

  it("reports bad rows and a missing column", () => {
    expect(parseCapCsv("category,name\r\nmale,x").errors).toContain('Missing column "cap_number".');
    const p = parseCapCsv(csv("boys,1,Al Smith,3\r\nmale,0,Al Smith,3\r\nmale,2,Al Smith,x\r\n"));
    expect(p.rows).toEqual([]);
    expect(p.errors).toHaveLength(3);
  });
});

describe("capNameKey", () => {
  it("ignores case, accents and punctuation, and reads Surname, Given the right way round", () => {
    expect(capNameKey("Leigh McIntosh")).toBe("leigh mcintosh");
    expect(capNameKey("McIntosh, Leigh")).toBe("leigh mcintosh");
    expect(capNameKey("Seán  O'Brien")).toBe("sean o brien");
  });
});

describe("planCapSeed", () => {
  it("links an exact, unique, non-private name", () => {
    const plan = planCapSeed({
      rows: rows("male,1,Leigh McIntosh,196\r\n"),
      candidates: [cand(10, "Leigh McIntosh"), cand(11, "Leigh Sibley")],
      existing: none,
    });
    expect(plan.caps[0]).toMatchObject({ playerId: 10, status: "linked" });
    expect(plan.errors).toEqual([]);
  });

  it("keeps an ambiguous name unlinked", () => {
    const plan = planCapSeed({
      rows: rows("male,2,Neil Blanche,2\r\n"),
      candidates: [cand(1, "Neil Blanche"), cand(2, "Neil Blanche")],
      existing: none,
    });
    expect(plan.caps[0]).toMatchObject({ playerId: null, status: "ambiguous" });
  });

  it("never links a private player", () => {
    const plan = planCapSeed({
      rows: rows("male,3,Mark Bowley,19\r\n"),
      candidates: [cand(5, "Mark Bowley", true)],
      existing: none,
    });
    expect(plan.caps[0]).toMatchObject({ playerId: null, status: "private" });
  });

  it("leaves a nickname unlinked but hints the close name", () => {
    const plan = planCapSeed({
      rows: rows("male,4,Mitch Brown,310\r\n"),
      candidates: [cand(7, "Mitchell Brown")],
      existing: none,
    });
    expect(plan.caps[0]).toMatchObject({ playerId: null, status: "unmatched" });
    expect(plan.caps[0]!.note).toContain("Mitchell Brown");
  });

  it("refuses a category that already has caps, and only that one", () => {
    const plan = planCapSeed({
      rows: rows("male,1,Leigh McIntosh,196\r\nfemale,1,Matilda Gray,41\r\n"),
      candidates: [],
      existing: { male: 3, female: 0 },
    });
    expect(plan.refusedCategories).toEqual([{ category: "male", existing: 3 }]);
    expect(plan.caps.map((c) => c.category)).toEqual(["female"]);
  });

  it("rejects repeated numbers and repeated names within a category", () => {
    const plan = planCapSeed({
      rows: rows(
        "male,1,Al Smith,3\r\nmale,1,Bo Jones,4\r\nmale,2,al smith,5\r\nfemale,1,Al Smith,6\r\n",
      ),
      candidates: [],
      existing: none,
    });
    expect(plan.errors).toHaveLength(2);
    expect(plan.caps.map((c) => `${c.category}${c.capNumber}`)).toEqual(["female1", "male1"]);
  });

  it("does not link one player to two caps", () => {
    const plan = planCapSeed({
      rows: rows("male,1,Al Smith,3\r\nfemale,1,Al Smith,4\r\n"),
      candidates: [cand(9, "Al Smith")],
      existing: none,
    });
    expect(plan.errors).toHaveLength(1);
    expect(plan.caps.filter((c) => c.playerId === 9)).toHaveLength(1);
  });
});

describe("parseSeedArgs", () => {
  it("requires tenant and file", () => {
    expect(() => parseSeedArgs(["--tenant=68"])).toThrow(/required/);
    expect(parseSeedArgs(["--tenant=68", "--file=caps.csv", "--commit"])).toMatchObject({
      tenant: 68,
      file: "caps.csv",
      commit: true,
    });
    expect(() => parseSeedArgs(["--bogus"])).toThrow(/Unknown/);
  });

  it("takes an optional batch label", () => {
    expect(parseSeedArgs(["--tenant=1", "--file=c.csv", "--label=WKBCC caps"]).label).toBe(
      "WKBCC caps",
    );
  });
});

describe("batch marker", () => {
  it("makes a UTC second-resolution token", () => {
    const token = capBatchToken(new Date("2026-10-14T02:32:15.987Z"));
    expect(token).toBe("20261014T023215Z");
    expect(CAP_BATCH_TOKEN_RE.test(token)).toBe(true);
  });

  it("round-trips a note and tidies the label", () => {
    const note = capBatchNote("20261014T023215Z", "  WKBCC   A Grade caps ");
    expect(note).toBe("CSV import [20261014T023215Z] WKBCC A Grade caps");
    expect(parseCapBatchNote(note)).toEqual({
      token: "20261014T023215Z",
      label: "WKBCC A Grade caps",
      createdAt: "2026-10-14T02:32:15Z",
    });
  });

  it("caps a long label and rejects other notes", () => {
    expect(capBatchNote("20261014T023215Z", "x".repeat(300))).toHaveLength(
      "CSV import [20261014T023215Z] ".length + 100,
    );
    expect(parseCapBatchNote("Seeded by hand")).toBeNull();
    expect(parseCapBatchNote(null)).toBeNull();
    expect(parseCapBatchNote("CSV import [bad] x")).toBeNull();
  });
});

describe("groupCapBatches", () => {
  const note = (t: string, l: string) => capBatchNote(t, l);
  it("groups by marker, counts per list and link status, newest first", () => {
    const batches = groupCapBatches([
      { category: "male", playerId: 1, capNote: note("20261014T023215Z", "Newer") },
      { category: "male", playerId: null, capNote: note("20261014T023215Z", "Newer") },
      { category: "female", playerId: 5, capNote: note("20261014T023215Z", "Newer") },
      { category: "male", playerId: 2, capNote: note("20251001T000000Z", "Older") },
      { category: "male", playerId: 3, capNote: "Entered by hand" },
      { category: "male", playerId: 4, capNote: null },
    ]);
    expect(batches).toEqual([
      {
        id: "20261014T023215Z",
        label: "Newer",
        createdAt: "2026-10-14T02:32:15Z",
        male: 2,
        female: 1,
        linked: 2,
        unlinked: 1,
      },
      {
        id: "20251001T000000Z",
        label: "Older",
        createdAt: "2025-10-01T00:00:00Z",
        male: 1,
        female: 0,
        linked: 1,
        unlinked: 0,
      },
    ]);
  });
});

describe("capUndoBlockers", () => {
  const batch = [
    { category: "male", capNumber: 1 },
    { category: "male", capNumber: 213 },
    { category: "female", capNumber: 32 },
  ];
  it("is empty when nothing follows the batch", () => {
    expect(capUndoBlockers(batch, [])).toEqual([]);
    expect(capUndoBlockers(batch, [{ category: "male", capNumber: -7 }])).toEqual([]);
  });

  it("blocks when a later cap exists in a list the batch touched", () => {
    const blockers = capUndoBlockers(batch, [
      { category: "male", capNumber: 214 },
      { category: "male", capNumber: 215 },
    ]);
    expect(blockers).toHaveLength(1);
    expect(blockers[0]).toContain("2 later cap(s)");
    expect(blockers[0]).toContain("A Grade");
    expect(blockers[0]).toContain("#214");
  });

  it("ignores a list the batch did not touch", () => {
    expect(
      capUndoBlockers([{ category: "male", capNumber: 5 }], [{ category: "female", capNumber: 9 }]),
    ).toEqual([]);
  });
});

describe("capImportTemplateCsv", () => {
  it("is a header and two example rows that parse cleanly", () => {
    const parsed = parseCapCsv(capImportTemplateCsv());
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows.map((r) => r.category)).toEqual(["male", "female"]);
  });
});
