/**
 * Season shirt numbers U7 (docs/plans/2026-10-06-001-feat-season-shirt-numbers-plan.md,
 * KTD10): the team-list card input carries each selected player's season shirt
 * number when the club has the feature on. Pure — no database.
 */
import { describe, it, expect } from "vitest";
import type { FixtureRow, TeamListPlayer } from "@workspace/db";
import { buildTeamListShirtNumbers, teamListToCardInput } from "./team-list";

const fixture: FixtureRow = {
  id: 1,
  tenantId: 1,
  grade: "A Grade",
  roundLabel: "Round 3",
  opponentName: "Rockingham",
  opponentClubId: null,
  opponentLogoUrl: null,
  venue: "Halls Head Oval",
  venueLatitude: null,
  venueLongitude: null,
  startAt: new Date("2026-10-10T02:00:00Z"),
  isHome: true,
  notes: null,
  source: "playhq",
  playhqMatchId: null,
  createdAt: new Date("2026-10-01T00:00:00Z"),
} as FixtureRow;

const PARTICIPANT = "0f1e2d3c-aaaa-bbbb-cccc-000000000001";

const players: TeamListPlayer[] = [
  { order: 2, playerId: 12, displayName: "Sam Numbered" },
  { order: 1, playerId: 11, displayName: "Alex Opener", role: "C" },
  { order: 3, playerId: 13, displayName: "Player Unnumbered" },
  { order: 4, participantId: PARTICIPANT, displayName: "Held Debutant" },
  { order: 5, playerId: 90001, displayName: "Fill In" },
  { order: 6, displayName: "Typed Name", role: "WK" },
];

const numbers = buildTeamListShirtNumbers([
  { playerId: 11, participantId: null, number: "7" },
  { playerId: 12, participantId: null, number: "23" },
  // On the register but unnumbered: no number.
  { playerId: 13, participantId: null, number: null },
  // Held (no player yet), selected by participant id (R16 exception).
  { playerId: null, participantId: PARTICIPANT.toUpperCase(), number: "31" },
  // A fill-in's entry must never reach the card.
  { playerId: 90001, participantId: null, number: "99" },
]);

type CardPlayer = { order: number; surname: string; role?: string; shirtNumber?: string };
const cardPlayers = (input: Record<string, unknown>) => input.players as CardPlayer[];

describe("teamListToCardInput with season shirt numbers", () => {
  it("carries each kept player's number and numbering: shirt, in batting order", () => {
    const input = teamListToCardInput(fixture, players, numbers);
    expect(input.numbering).toBe("shirt");
    expect(cardPlayers(input)).toEqual([
      { order: 1, surname: "OPENER", role: "C", shirtNumber: "7" },
      { order: 2, surname: "NUMBERED", shirtNumber: "23" },
      { order: 3, surname: "UNNUMBERED" },
      { order: 4, surname: "DEBUTANT", shirtNumber: "31" },
      { order: 6, surname: "NAME", role: "WK" },
    ]);
  });

  it("gives an unnumbered player no number at all (R15)", () => {
    const input = teamListToCardInput(fixture, players, numbers);
    const unnumbered = cardPlayers(input).find((p) => p.surname === "UNNUMBERED")!;
    expect("shirtNumber" in unnumbered).toBe(false);
    const typed = cardPlayers(input).find((p) => p.surname === "NAME")!;
    expect("shirtNumber" in typed).toBe(false);
  });

  it("shows a held participant's number on this fixture's card (R16 exception)", () => {
    const input = teamListToCardInput(fixture, players, numbers);
    expect(cardPlayers(input).find((p) => p.surname === "DEBUTANT")?.shirtNumber).toBe("31");
  });

  it("still drops fill-ins", () => {
    for (const n of [numbers, null, undefined]) {
      const input = teamListToCardInput(fixture, players, n);
      expect(cardPlayers(input).map((p) => p.surname)).not.toContain("IN");
      expect(cardPlayers(input)).toHaveLength(5);
    }
  });

  it("keeps the card input identical to today when the feature is off", () => {
    const before = teamListToCardInput(fixture, players);
    expect(teamListToCardInput(fixture, players, null)).toEqual(before);
    expect(before).not.toHaveProperty("numbering");
    expect(cardPlayers(before).some((p) => "shirtNumber" in p)).toBe(false);
    expect(Object.keys(before)).toEqual([
      "kind",
      "gradeRound",
      "competitionLine",
      "venueDateTime",
      "players",
      "grade",
    ]);
  });

  it("prefers the player's linked number over a participant match", () => {
    const both = buildTeamListShirtNumbers([
      { playerId: 11, participantId: null, number: "7" },
      { playerId: null, participantId: PARTICIPANT, number: "70" },
    ]);
    const input = teamListToCardInput(
      fixture,
      [{ order: 1, playerId: 11, participantId: PARTICIPANT, displayName: "Alex Opener" }],
      both,
    );
    expect(cardPlayers(input)[0].shirtNumber).toBe("7");
  });
});
