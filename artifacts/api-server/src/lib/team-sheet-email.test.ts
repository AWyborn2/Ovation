import { describe, it, expect } from "vitest";
import { sendModeOf, teamSheetEmail, teamSheetKey } from "./team-sheet-email";
import type { TeamSheet } from "./team-sheet";

/** The team-sheet list email's subject, body and keys (email-distribution-lists). */

const sheet = (over: Partial<TeamSheet> = {}): TeamSheet => ({
  section: "senior",
  clubName: "Halls Head",
  logoUrl: null,
  homeTeam: "Halls Head A",
  awayTeam: "Mandurah A",
  grade: "A Grade",
  round: "Round 3",
  date: "Saturday 24 October 2026",
  startTime: "12:00 pm",
  format: "T20",
  overs: "20",
  venue: "Halls Head Oval",
  competition: null,
  bowlingRulesSource: null,
  ruleNotes: [],
  players: [
    { order: 1, name: "Ava Hill", role: "C", shirtNumber: null, junior: null },
    { order: 2, name: "Ben Cole", role: null, shirtNumber: null, junior: null, overseas: true },
    { order: 12, name: "Dan Ford", role: null, shirtNumber: null, junior: null },
  ],
  generatedAt: "Tuesday 20 October 2026",
  ...over,
});

describe("teamSheetEmail", () => {
  it("names the club, grade, round and teams, and lists the side", () => {
    const { subject, text } = teamSheetEmail(sheet(), false);
    expect(subject).toBe("Halls Head A Grade Round 3 team sheet — Halls Head A v Mandurah A");
    expect(text).toContain("Saturday 24 October 2026, 12:00 pm at Halls Head Oval");
    expect(text).toContain("1. Ava Hill (C)");
    expect(text).toContain("2. Ben Cole OS");
    expect(text).toContain("12th. Dan Ford");
    expect(text).toContain("The printable team sheet is attached.");
  });

  it("marks a re-sent side as updated", () => {
    const { subject, text } = teamSheetEmail(sheet(), true);
    expect(subject.startsWith("UPDATED: ")).toBe(true);
    expect(text).toContain("This replaces the team sheet sent earlier.");
  });

  it("numbers every row when all 12 play", () => {
    expect(teamSheetEmail(sheet({ allPlay: true }), false).text).toContain("12. Dan Ford");
  });
});

describe("keys and modes", () => {
  it("keys a send on side and version", () => {
    expect(teamSheetKey(7, 3)).toBe("ts:7:v3");
  });
  it("defaults a list without a mode to on publish", () => {
    expect(sendModeOf({})).toBe("on_publish");
    expect(sendModeOf({ sendMode: "off" })).toBe("off");
  });
});
