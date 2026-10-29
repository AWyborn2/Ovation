/**
 * Which drafts the set editor opens (carousel set editor plan, part 3; full
 * draft editor plan, stage 2: a card made into a free set of pages).
 */
import { describe, expect, it } from "vitest";
import type { SetDocument } from "@workspace/scorecard/kind-templates";
import { arrangeCarouselSlides, draftSetType } from "./set-design";

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

describe("arrangeCarouselSlides", () => {
  const doc = (pageFor?: Record<string, string>): SetDocument =>
    ({
      formatVersion: 2,
      set: "teamLists",
      pages: [
        { id: "team", role: "repeat", slot: "team", kind: "teamList", page: "team", layers: [] },
        { id: "team-b", role: "fixed", slot: "page", kind: "teamList", page: "team", layers: [] },
      ],
      arrangement: { order: [], removed: [], ...(pageFor ? { pageFor } : {}) },
    }) as unknown as SetDocument;
  const stored = [
    { id: "t1", input: { kind: "teamList" } },
    { id: "t2", input: { kind: "teamList" } },
  ];

  it("adds a slide for a design page no slide draws", () => {
    expect(arrangeCarouselSlides(stored, doc()).map((s) => s.id)).toEqual([
      "t1",
      "t2",
      "page:team-b",
    ]);
  });

  it("adds none for a page that is one slide's own layout (studio-create S9)", () => {
    expect(arrangeCarouselSlides(stored, doc({ t2: "team-b" })).map((s) => s.id)).toEqual([
      "t1",
      "t2",
    ]);
  });
});
