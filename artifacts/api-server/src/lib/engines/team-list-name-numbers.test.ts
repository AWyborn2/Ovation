import { describe, expect, it } from "vitest";
import type { FixtureRow, TeamListPlayer } from "@workspace/db";
import { buildTeamListShirtNumbers, shirtNumberOf, teamListToCardInput } from "./team-list";

const fixture = {
  grade: "A Grade",
  roundLabel: "Round 3",
  opponentName: "Visitors",
  startAt: new Date("2026-10-24T04:00:00Z"),
  isHome: true,
} as FixtureRow;
const entry = (name: string, number: string | null, playerId: number | null = null) => ({
  name,
  number,
  playerId,
  participantId: null,
});
const selected = (displayName: string, playerId?: number): TeamListPlayer => ({
  order: 1,
  displayName,
  ...(playerId == null ? {} : { playerId }),
});
const card = (players: TeamListPlayer[], entries: ReturnType<typeof entry>[]) =>
  teamListToCardInput(fixture, players, new Set(), buildTeamListShirtNumbers(entries)).players as {
    surname: string;
    shirtNumber?: string;
  }[];

describe("presentation-only exact full-name team slide numbers", () => {
  it("finds an imported register number when the selected player has an older ID", () => {
    const players = [selected("Alex Example", 116)];
    const before = structuredClone(players);
    expect(card(players, [entry("Alex Example", "36", 9049)])[0].shirtNumber).toBe("36");
    expect(players).toEqual(before);
  });

  it("finds the number for a selected player with no identity yet", () => {
    expect(card([selected("New Signing")], [entry("New Signing", "88", 9055)])[0].shirtNumber).toBe(
      "88",
    );
  });

  it("ignores case and repeated whitespace, not punctuation or name parts", () => {
    expect(
      card([selected("  ALEX   Example ")], [entry("Alex Example", "36")])[0].shirtNumber,
    ).toBe("36");
    for (const name of ["A Example", "Example", "Alex-Example", "Alex Another Example"])
      expect(card([selected(name)], [entry("Alex Example", "36")])[0]).not.toHaveProperty(
        "shirtNumber",
      );
  });

  it("prefers the verified player ID over a conflicting name", () => {
    expect(
      card(
        [selected("Alex Example", 116)],
        [entry("Another Name", "7", 116), entry("Alex Example", "36", 9049)],
      )[0].shirtNumber,
    ).toBe("7");
  });

  it("prefers the verified participant ID over a conflicting name", () => {
    const numbers = buildTeamListShirtNumbers([
      { ...entry("Another Name", "7"), participantId: "GUID" },
      entry("Alex Example", "36"),
    ]);
    const input = teamListToCardInput(
      fixture,
      [{ ...selected("Alex Example"), participantId: "guid" }],
      new Set(),
      numbers,
    );
    expect(input.players).toMatchObject([{ shirtNumber: "7" }]);
  });

  it("does not borrow a number from another same-named register entry", () => {
    for (const secondNumber of ["36", "99", null])
      expect(
        card(
          [selected("Alex Example")],
          [entry("Alex Example", "36", 9049), entry(" ALEX  EXAMPLE ", secondNumber, 9055)],
        )[0],
      ).not.toHaveProperty("shirtNumber");
  });

  it("does not guess between duplicate names on the selected team", () => {
    const players = [selected("Alex Example"), { ...selected(" ALEX  EXAMPLE "), order: 2 }];
    expect(card(players, [entry("Alex Example", "36")]).every((p) => !p.shirtNumber)).toBe(true);
  });

  it("does not override an explicitly unnumbered player or participant", () => {
    expect(
      card(
        [selected("Alex Example", 116)],
        [entry("Old Name", null, 116), entry("Alex Example", "36", 9049)],
      )[0],
    ).not.toHaveProperty("shirtNumber");
    const input = teamListToCardInput(
      fixture,
      [{ ...selected("Alex Example"), participantId: "guid" }],
      new Set(),
      buildTeamListShirtNumbers([
        { ...entry("Old Name", null), participantId: "GUID" },
        entry("Alex Example", "36"),
      ]),
    );
    expect(input.players).not.toMatchObject([{ shirtNumber: "36" }]);
  });

  it("keeps private placeholders, single names and fill-ins unnumbered", () => {
    for (const name of ["Private Player", "Example"])
      expect(card([selected(name)], [entry(name, "36")])[0]).not.toHaveProperty("shirtNumber");
    expect(card([selected("Fill In", 90001)], [entry("Fill In", "36")])).toEqual([]);
    expect(card([selected("Fill In")], [entry("Fill In", "36", 90001)])[0]).not.toHaveProperty(
      "shirtNumber",
    );
  });

  it("does not add name matching to shared identity lookups or feature-off cards", () => {
    const p = selected("Alex Example", 116);
    const numbers = buildTeamListShirtNumbers([entry("Alex Example", "36", 9049)]);
    expect(shirtNumberOf(p, numbers)).toBeNull();
    expect(teamListToCardInput(fixture, [p], new Set(), null)).not.toHaveProperty("numbering");
    expect(teamListToCardInput(fixture, [p], new Set(), null).players).not.toMatchObject([
      { shirtNumber: "36" },
    ]);
  });
});
