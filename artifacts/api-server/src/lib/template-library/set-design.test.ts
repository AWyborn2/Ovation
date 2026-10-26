/**
 * Which drafts the set editor opens (carousel set editor plan, part 3; full
 * draft editor plan, stage 2: a card made into a free set of pages).
 */
import { describe, expect, it } from "vitest";
import { draftSetType } from "./set-design";

const freeSet = {
  formatVersion: 2,
  set: "free",
  pages: [{ id: "page-1", role: "fixed", slot: "page", kind: "player", page: "card", layers: [] }],
};

describe("draftSetType", () => {
  it("opens a card made into a free set of pages", () => {
    expect(draftSetType({ cardInput: { kind: "player" }, adjustments: freeSet })).toEqual({
      setType: "free",
      layout: "pages",
    });
  });

  it("opens a round of team lists, and nothing for a single card's own design", () => {
    expect(draftSetType({ cardInput: { kind: "teamListRound" } })).toEqual({
      setType: "teamLists",
      layout: "list",
    });
    expect(
      draftSetType({ cardInput: { kind: "player" }, adjustments: { formatVersion: 2, pages: {} } }),
    ).toBeNull();
  });
});
