import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import {
  SHIRT_NUMBER_UPLOAD_MAX_ROWS,
  UploadParseError,
  buildPreviewRows,
  buildUploadRoster,
  parseShirtNumberUpload,
  previewCounts,
  uploadFileType,
  type RosterPerson,
} from "./shirt-number-upload";

/**
 * Season shirt numbers — upload parsing and matching (plan U4; R4, R5, R7, R8,
 * R11). Pure: no database. The roster and the season's register are injected.
 */

const csv = (text: string) => Buffer.from(text, "utf8");

async function xlsx(rows: (string | number | null)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Numbers");
  for (const r of rows) sheet.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const GUID_A = "aaaaaaaa-0000-4000-8000-000000000001";
const GUID_B = "bbbbbbbb-0000-4000-8000-000000000002";

const person = (
  playerId: number,
  givenName: string,
  surname: string,
  participantId: string | null = null,
): RosterPerson => ({
  playerId,
  participantId,
  name: `${givenName} ${surname}`.trim(),
  givenName,
  surname,
});

describe("uploadFileType", () => {
  it("accepts .csv and .xlsx only, case-insensitively", () => {
    expect(uploadFileType("numbers.csv")).toBe("csv");
    expect(uploadFileType("Numbers.XLSX")).toBe("xlsx");
    expect(uploadFileType("numbers.xls")).toBeNull();
    expect(uploadFileType("numbers.pdf")).toBeNull();
    expect(uploadFileType("numbers")).toBeNull();
  });
});

describe("parseShirtNumberUpload", () => {
  it("parses a Name,Number CSV", async () => {
    const parsed = await parseShirtNumberUpload(
      csv("Name,Number\nJane Smith,7\nTom Brown,07\n"),
      "numbers.csv",
      "numbers",
    );
    expect(parsed.errors).toEqual([]);
    expect(parsed.unrecognisedHeaders).toEqual([]);
    expect(parsed.rows.map((r) => [r.rowIndex, r.name, r.number])).toEqual([
      [1, "Jane Smith", "7"],
      [2, "Tom Brown", "07"],
    ]);
  });

  it("parses an XLSX with First Name, Surname, Shirt No. to the same rows", async () => {
    const parsed = await parseShirtNumberUpload(
      await xlsx([
        ["First Name", "Surname", "Shirt No."],
        ["Jane", "Smith", 7],
        ["Tom", "Brown", "07"],
      ]),
      "numbers.xlsx",
      "numbers",
    );
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows.map((r) => [r.rowIndex, r.name, r.number])).toEqual([
      [1, "Jane Smith", "7"],
      [2, "Tom Brown", "07"],
    ]);
    expect(parsed.rows[0]).toMatchObject({ givenName: "Jane", surname: "Smith" });
  });

  it("normalises headers case- and space-insensitively and reads a participant id", async () => {
    const parsed = await parseShirtNumberUpload(
      csv(`  PLAYER NAME ,  Profile ID , # , Notes\nJane Smith,${GUID_A.toUpperCase()},9,x\n`),
      "numbers.csv",
      "numbers",
    );
    expect(parsed.errors).toEqual([]);
    expect(parsed.unrecognisedHeaders).toEqual(["Notes"]);
    expect(parsed.rows[0]).toMatchObject({
      name: "Jane Smith",
      participantId: GUID_A,
      number: "9",
    });
  });

  it("reads a 'Surname, Given' full name", async () => {
    const parsed = await parseShirtNumberUpload(
      csv('Name,Number\n"Smith, Jane",4\n'),
      "numbers.csv",
      "numbers",
    );
    expect(parsed.rows[0]).toMatchObject({
      name: "Jane Smith",
      surname: "Smith",
      givenName: "Jane",
    });
  });

  it("an unknown header set is a file-level error listing the headers found", async () => {
    const parsed = await parseShirtNumberUpload(csv("Foo,Bar\n1,2\n"), "numbers.csv", "numbers");
    expect(parsed.rows).toEqual([]);
    expect(parsed.errors).toHaveLength(1);
    expect(parsed.errors[0]).toContain("Foo");
    expect(parsed.errors[0]).toContain("Bar");
    expect(parsed.unrecognisedHeaders).toEqual(["Foo", "Bar"]);
  });

  it("a numbers upload without a number column is a file-level error", async () => {
    const parsed = await parseShirtNumberUpload(csv("Name\nJane Smith\n"), "n.csv", "numbers");
    expect(parsed.rows).toEqual([]);
    expect(parsed.errors[0]).toMatch(/number/i);
  });

  it("flags an invalid number on the row and keeps blank numbers as unnumbered", async () => {
    const parsed = await parseShirtNumberUpload(
      csv("Name,Number\nJane Smith,abc\nTom Brown,\nAmy Lee,1234\nBo Diaz,#12\n,5\n"),
      "numbers.csv",
      "numbers",
    );
    const byIndex = new Map(parsed.rows.map((r) => [r.rowIndex, r]));
    expect(byIndex.get(1)!.errors[0]).toMatch(/1 to 3 digits/);
    expect(byIndex.get(2)).toMatchObject({ number: null, errors: [] });
    expect(byIndex.get(3)!.errors).toHaveLength(1);
    expect(byIndex.get(4)).toMatchObject({ number: "12", errors: [] });
    expect(byIndex.get(5)!.errors[0]).toMatch(/name/i);
  });

  it("a registration upload ignores any number column", async () => {
    const parsed = await parseShirtNumberUpload(
      csv("First Name,Last Name,Participant ID,Number\nJane,Smith,abc-1,7\nTom,Brown,,xyz\n"),
      "registrations.csv",
      "registration",
    );
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows.map((r) => [r.name, r.number, r.errors])).toEqual([
      ["Jane Smith", null, []],
      ["Tom Brown", null, []],
    ]);
  });

  it("a registration upload needs no number column", async () => {
    const parsed = await parseShirtNumberUpload(
      csv("First Name,Last Name\nJane,Smith\n"),
      "registrations.csv",
      "registration",
    );
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toHaveLength(1);
  });

  it("skips blank rows and finds a header below title rows", async () => {
    const parsed = await parseShirtNumberUpload(
      await xlsx([
        ["Club shirt numbers 2026/27"],
        [],
        ["Name", "Number"],
        ["Jane Smith", 7],
        [],
        ["Tom Brown", 8],
      ]),
      "numbers.xlsx",
      "numbers",
    );
    expect(parsed.errors).toEqual([]);
    expect(parsed.unrecognisedHeaders).toEqual([]);
    expect(parsed.rows.map((r) => [r.rowIndex, r.name])).toEqual([
      [1, "Jane Smith"],
      [3, "Tom Brown"],
    ]);
  });

  it("rejects a sparse sheet with a far-away cell fast, without walking its full extent", async () => {
    // A1 plus XFD1048576: a few KB on disk, but 1,048,576 x 16,384 cells if
    // walked densely. The parse must refuse it from the cells actually present.
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet("Numbers");
    sheet.getCell("A1").value = "Name";
    sheet.getCell("XFD1048576").value = "x";
    const buffer = Buffer.from(await wb.xlsx.writeBuffer());

    const started = Date.now();
    await expect(parseShirtNumberUpload(buffer, "sparse.xlsx", "numbers")).rejects.toBeInstanceOf(
      UploadParseError,
    );
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it("rejects a sheet whose data reaches too far right or down", async () => {
    const wide = new ExcelJS.Workbook();
    const ws = wide.addWorksheet("Numbers");
    ws.getCell("A1").value = "Name";
    ws.getCell(1, 500).value = "Stray";
    await expect(
      parseShirtNumberUpload(Buffer.from(await wide.xlsx.writeBuffer()), "w.xlsx", "numbers"),
    ).rejects.toBeInstanceOf(UploadParseError);

    const tall = new ExcelJS.Workbook();
    const ts = tall.addWorksheet("Numbers");
    ts.getCell("A1").value = "Name";
    ts.getCell("B1").value = "Number";
    ts.getCell(50_000, 1).value = "Far Away";
    await expect(
      parseShirtNumberUpload(Buffer.from(await tall.xlsx.writeBuffer()), "t.xlsx", "numbers"),
    ).rejects.toBeInstanceOf(UploadParseError);
  });

  it(`rejects a file with more than ${SHIRT_NUMBER_UPLOAD_MAX_ROWS} rows`, async () => {
    const lines = ["Name,Number"];
    for (let i = 0; i <= SHIRT_NUMBER_UPLOAD_MAX_ROWS; i++) lines.push(`Player ${i},1`);
    await expect(
      parseShirtNumberUpload(csv(lines.join("\n")), "big.csv", "numbers"),
    ).rejects.toBeInstanceOf(UploadParseError);

    const ok = ["Name,Number"];
    for (let i = 0; i < SHIRT_NUMBER_UPLOAD_MAX_ROWS; i++) ok.push(`Player ${i},1`);
    const parsed = await parseShirtNumberUpload(csv(ok.join("\n")), "ok.csv", "numbers");
    expect(parsed.rows).toHaveLength(SHIRT_NUMBER_UPLOAD_MAX_ROWS);
  });

  it("an unreadable spreadsheet is a parse error", async () => {
    await expect(
      parseShirtNumberUpload(Buffer.from("not a zip"), "broken.xlsx", "numbers"),
    ).rejects.toBeInstanceOf(UploadParseError);
  });
});

describe("buildPreviewRows", () => {
  const roster = buildUploadRoster([
    person(1, "Jane", "Smith", GUID_A),
    person(2, "J", "Brown"),
    person(3, "J", "Brown"),
    person(4, "Mitchell", "Starc"),
  ]);

  async function preview(text: string, season: Parameters<typeof buildPreviewRows>[2] = []) {
    const parsed = await parseShirtNumberUpload(csv(text), "n.csv", "numbers");
    return buildPreviewRows(parsed.rows, roster, season);
  }

  it("matches a row by participant id (any casing) before its name", async () => {
    const [row] = await preview(
      `Name,Participant ID,Number\nSomeone Else,${GUID_A.toUpperCase()},7\n`,
    );
    expect(row).toMatchObject({ status: "matched", playerId: 1, participantId: GUID_A });
  });

  it("matches a unique exact normalised name", async () => {
    const [row] = await preview("Name,Number\n  jane   SMITH ,7\n");
    expect(row).toMatchObject({ status: "matched", playerId: 1, candidates: [] });
  });

  it("a name matching two players is suggested with both candidates", async () => {
    const [row] = await preview("Name,Number\nJ Brown,7\n");
    expect(row.status).toBe("suggested");
    expect(row.playerId).toBeNull();
    expect(row.candidates.map((c) => c.playerId).sort()).toEqual([2, 3]);
  });

  it("a near name is suggested, never matched", async () => {
    const [row] = await preview("Name,Number\nMitch Starc,7\n");
    expect(row.status).toBe("suggested");
    expect(row.playerId).toBeNull();
    expect(row.candidates[0]).toMatchObject({ playerId: 4, name: "Mitchell Starc" });
  });

  it("a row with no match is new", async () => {
    const [row] = await preview("Name,Number\nZed Nobody,7\n");
    expect(row).toMatchObject({ status: "new", playerId: null, candidates: [] });
  });

  it("an invalid number makes the row invalid", async () => {
    const [row] = await preview("Name,Number\nJane Smith,abc\n");
    expect(row.status).toBe("invalid");
    expect(row.number).toBeNull();
    expect(row.errors.length).toBeGreaterThan(0);
  });

  it("the same person twice in a file: the later row is invalid", async () => {
    const rows = await preview(
      "Name,Number\nJane Smith,7\njane smith,8\nZed Nobody,1\nZed Nobody,2\n",
    );
    expect(rows.map((r) => r.status)).toEqual(["matched", "invalid", "new", "invalid"]);
    expect(rows[1].errors[0]).toMatch(/row 1/);
  });

  it("reports number changes and duplicates against the season's register", async () => {
    const rows = await preview("Name,Number\nJane Smith,9\nMitchell Starc,12\nZed Nobody,3\n", [
      { id: 50, name: "Jane Smith", number: "7", playerId: 1, participantId: null },
      { id: 51, name: "Held Person", number: "12", playerId: null, participantId: null },
      { id: 52, name: "Zed Nobody", number: "3", playerId: null, participantId: null },
    ]);
    expect(rows[0]).toMatchObject({
      existingEntryId: 50,
      existingNumber: "7",
      numberChange: true,
      duplicate: false,
    });
    expect(rows[1]).toMatchObject({
      existingEntryId: null,
      numberChange: false,
      duplicate: true,
      duplicateWith: ["Held Person"],
    });
    // A held entry with the same name is the same person: an unchanged number.
    expect(rows[2]).toMatchObject({ existingEntryId: 52, numberChange: false, duplicate: false });

    expect(previewCounts(rows)).toEqual({
      total: 3,
      matched: 2,
      suggested: 0,
      new: 1,
      invalid: 0,
      numberChanges: 1,
      duplicates: 1,
    });
  });

  it("flags two rows in the same file wearing one number", async () => {
    const rows = await preview("Name,Number\nJane Smith,5\nZed Nobody,5\n");
    expect(rows.map((r) => r.duplicate)).toEqual([true, true]);
    expect(rows[0].duplicateWith).toEqual(["Zed Nobody"]);
  });

  it("an existing entry moving off a number frees it", async () => {
    const rows = await preview("Name,Number\nJane Smith,9\nMitchell Starc,7\n", [
      { id: 50, name: "Jane Smith", number: "7", playerId: 1, participantId: null },
    ]);
    expect(rows[1].duplicate).toBe(false);
  });

  it("an upper-case participant id matches a lower-case register entry", async () => {
    const rows = await preview(`Name,Participant ID,Number\nNew Kid,${GUID_B.toUpperCase()},4\n`, [
      { id: 60, name: "New Kid", number: null, playerId: null, participantId: GUID_B },
    ]);
    expect(rows[0]).toMatchObject({ status: "new", participantId: GUID_B, existingEntryId: 60 });
  });
});
