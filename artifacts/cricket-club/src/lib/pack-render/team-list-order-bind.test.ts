/**
 * The binder draws a Team List in its player order (build decision 16): the
 * design's own order over the one it was built with, a withheld junior last
 * even when the name was taken out after the card was built, roles kept with
 * their player, and the row number counting the rows as drawn.
 */
import { describe, expect, it } from "vitest";
import { bindInput } from "./bind";
import type { ShareCardInput, TeamListPlayer } from "../share-card";

const players: TeamListPlayer[] = [
  { order: 1, surname: "YOUNG", firstInitial: "J", role: "C", shirtNumber: "23" },
  { order: 2, surname: "BROWN", firstInitial: "T", shirtNumber: "7" },
  // Redacted at read time: still in its old place in the stored input.
  { order: 3, surname: "PRIVATE PLAYER" },
  { order: 4, surname: "ADAMS", firstInitial: "S", role: "WK" },
];
const card = (over: Record<string, unknown> = {}) =>
  ({
    kind: "teamList",
    grade: "A Grade",
    gradeRound: "A GRADE, ROUND 3",
    competitionLine: "A Grade",
    venueDateTime: "Oval • SAT 10 OCT",
    players,
    ...over,
  }) as ShareCardInput;
const rows = (input: ShareCardInput) =>
  bindInput(input).rows["players"]!.map((r) => [r.values.number, r.values.listName]);

describe("Team List player order in the binder", () => {
  it("As selected: picked order, the withheld junior last, numbered as drawn", () => {
    expect(rows(card())).toEqual([
      ["1", "J. YOUNG (C)"],
      ["2", "T. BROWN"],
      ["3", "S. ADAMS (WK)"],
      ["4", "PRIVATE PLAYER"],
    ]);
  });

  it("Alphabetical keeps each role with its player", () => {
    expect(rows(card({ playerOrder: "alpha" }))).toEqual([
      ["1", "S. ADAMS (WK)"],
      ["2", "T. BROWN"],
      ["3", "J. YOUNG (C)"],
      ["4", "PRIVATE PLAYER"],
    ]);
  });

  it("Shirt number: numbers printed, lowest first, no number after them", () => {
    expect(rows(card({ playerOrder: "shirt", numbering: "shirt" }))).toEqual([
      ["7", "T. BROWN"],
      ["23", "J. YOUNG (C)"],
      ["", "S. ADAMS (WK)"],
      ["", "PRIVATE PLAYER"],
    ]);
  });

  it("the design's own order wins over the club's it was built with", () => {
    expect(rows(card({ playerOrder: "alpha", playerOrderOverride: "selected" }))[0]).toEqual([
      "1",
      "J. YOUNG (C)",
    ]);
  });
});
