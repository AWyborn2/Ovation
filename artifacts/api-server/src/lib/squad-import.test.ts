import { describe, it, expect } from "vitest";
import {
  parseSquadCsv,
  planSquadImport,
  parseExportDate,
  isJuniorLabel,
  SquadImportError,
} from "./squad-import";
import {
  ADULT,
  JUNIOR,
  COACH,
  CANCELLED,
  DISCARDED_SENTINELS,
  PLAYHQ_PARTICIPANT_COLUMNS,
  buildParticipantCsv,
  participantRow,
} from "../test/fixtures/playhq-participants";

// Pure parsing/planning for the PlayHQ participant export (plan 2026-10-06-002
// U3). DB writes and linking are covered by routes/squad.test.ts.

function plan(rows: Array<Record<string, string>>) {
  return planSquadImport(parseSquadCsv(buildParticipantCsv(rows)));
}

describe("parseSquadCsv", () => {
  it("keeps only whitelisted columns — no discarded value survives parsing (R2, R3)", () => {
    const parsed = parseSquadCsv(buildParticipantCsv([ADULT]));
    expect(parsed.rows).toHaveLength(1);
    const blob = JSON.stringify(parsed);
    for (const v of Object.values(DISCARDED_SENTINELS)) expect(blob).not.toContain(v);
    expect(parsed.rows[0].fields["Profile ID"]).toBe(ADULT["Profile ID"]);
    expect(Object.keys(parsed.rows[0].fields)).not.toContain("Disability");
  });

  it("names the missing column when Profile ID is absent", () => {
    const cols = PLAYHQ_PARTICIPANT_COLUMNS.filter((c) => c !== "Profile ID");
    expect(() => parseSquadCsv(buildParticipantCsv([ADULT], cols))).toThrow(SquadImportError);
    expect(() => parseSquadCsv(buildParticipantCsv([ADULT], cols))).toThrow(/Profile ID/);
  });

  it("rejects an empty file", () => {
    expect(() => parseSquadCsv("")).toThrow(SquadImportError);
  });
});

describe("planSquadImport", () => {
  it("one adult row becomes one active senior member with account-holder contacts", () => {
    const p = plan([ADULT]);
    expect(p.members).toHaveLength(1);
    const m = p.members[0];
    expect(m).toMatchObject({
      playhqProfileId: ADULT["Profile ID"],
      firstName: "Alex",
      lastName: "Fakerton",
      preferredName: "Al",
      dateOfBirth: "1995-03-14",
      section: "senior",
      gradeHint: "A Grade",
      teamName: "Fakeville A Grade",
      ageGroup: "Open",
      isPrivate: false,
      accountHolderName: "Alex Fakerton",
      accountHolderMobile: "0400000001",
      accountHolderEmail: "alex.fakerton@example.com",
    });
    const blob = JSON.stringify(p);
    for (const v of Object.values(DISCARDED_SENTINELS)) expect(blob).not.toContain(v);
  });

  it("skips coaches and cancelled registrations with reasons (R4)", () => {
    const p = plan([ADULT, COACH, CANCELLED]);
    expect(p.members.map((m) => m.firstName)).toEqual(["Alex"]);
    expect(p.skipped).toEqual([
      expect.objectContaining({ line: 3, name: "Casey Coachman", reason: "not_a_player" }),
      expect.objectContaining({ line: 4, name: "Drew Gonebye", reason: "inactive_status" }),
    ]);
    // The cancelled player's profile is reported so an existing member can be stood down.
    expect(p.inactiveProfileIds).toEqual([CANCELLED["Profile ID"]]);
  });

  it("a 15-year-old is junior from Age Group and keeps both guardians (R5)", () => {
    const p = plan([JUNIOR]);
    expect(p.members[0]).toMatchObject({
      section: "junior",
      dateOfBirth: "2011-06-20",
      guardian1Name: "Pat Testwood",
      guardian1Mobile: "0400000011",
      guardian1Email: "pat.testwood@example.com",
      guardian2Name: "Robin Testwood",
      guardian2Mobile: "0400000012",
      guardian2Email: "robin.testwood@example.com",
    });
  });

  it("takes the most common season as current and skips the others", () => {
    const old = participantRow({
      "First Name": "Old",
      "Last Name": "Season",
      "Profile ID": "a0000000-0000-4000-8000-000000000099",
      Season: "2025/26",
    });
    const p = plan([ADULT, JUNIOR, old]);
    expect(p.season).toBe(ADULT.Season);
    expect(p.members).toHaveLength(2);
    expect(p.skipped).toEqual([expect.objectContaining({ line: 4, reason: "other_season" })]);
  });

  it("rejects rows from another host organisation than the file's majority", () => {
    const stray = participantRow({
      "First Name": "Stray",
      "Last Name": "Org",
      "Profile ID": "a0000000-0000-4000-8000-000000000098",
      "Host Organisation ID": "ffffffff-0000-4000-8000-000000000000",
    });
    const p = plan([ADULT, JUNIOR, stray]);
    expect(p.members).toHaveLength(2);
    expect(p.skipped).toEqual([expect.objectContaining({ reason: "other_organisation" })]);
  });

  it("keeps the first row for a profile registered twice", () => {
    const again = { ...ADULT, Team: "Fakeville B Grade", Grade: "B Grade" };
    const p = plan([ADULT, again]);
    expect(p.members).toHaveLength(1);
    expect(p.members[0].gradeHint).toBe("A Grade");
    expect(p.skipped).toEqual([expect.objectContaining({ reason: "duplicate_profile" })]);
  });

  it("marks a private profile", () => {
    const p = plan([{ ...ADULT, "Privacy Setting": "Private" }]);
    expect(p.members[0].isPrivate).toBe(true);
  });
});

describe("helpers", () => {
  it("parses dd/mm/yyyy and yyyy-mm-dd dates, rejecting impossible ones", () => {
    expect(parseExportDate("14/03/1995")).toBe("1995-03-14");
    expect(parseExportDate("4/3/1995")).toBe("1995-03-04");
    expect(parseExportDate("1995-03-14")).toBe("1995-03-14");
    expect(parseExportDate("14/03/1995 00:00")).toBe("1995-03-14");
    expect(parseExportDate("31/02/1995")).toBeNull();
    expect(parseExportDate("")).toBeNull();
    expect(parseExportDate("not a date")).toBeNull();
  });

  it("recognises junior age groups and grades", () => {
    for (const s of ["Under 16", "U16", "U 12 Girls", "U-14", "Junior Blasters", "under 11s"]) {
      expect(isJuniorLabel(s)).toBe(true);
    }
    for (const s of ["Open", "A Grade", "Colts", "Senior", "Club 12", ""]) {
      expect(isJuniorLabel(s)).toBe(false);
    }
  });
});
