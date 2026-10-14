import { describe, expect, it } from "vitest";
import {
  capNameKey,
  parseCapCsv,
  parseSeedArgs,
  planCapSeed,
  readCsvRecords,
  type CapCandidate,
  type CapSeedRow,
} from "./seed-cap-register-core";

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
});
