/**
 * Which drafts the set editor opens (carousel set editor plan, part 3; full
 * draft editor plan, stage 2: a card made into a free set of pages).
 */
import { describe, expect, it } from "vitest";
import type { SetDocument } from "@workspace/scorecard/kind-templates";
import { arrangeCarouselSlides, carouselSetDesign, draftSetType } from "./set-design";

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

describe("saving a carousel with slides' own layouts (dev retest, draft 962)", () => {
  const page = (id: string, slot: string, kind: string, p: string, name?: string) => ({
    id,
    role: slot === "team" ? "repeat" : "fixed",
    slot,
    kind,
    page: p,
    ...(name ? { name } : {}),
    layers: [],
  });
  const pages = [
    page("cover", "cover", "teamListRound", "card"),
    page("team", "team", "teamList", "team"),
    page("sponsors", "sponsors", "matchDay", "sponsors"),
    page("a-layout", "page", "teamList", "team", "A Grade v Waroona layout"),
    page("b-layout", "page", "teamList", "team", "B Grade v Pinjarra layout"),
  ];
  const set = (arrangement: object) =>
    ({ formatVersion: 2, set: "teamLists", pages, arrangement }) as unknown as SetDocument;
  const stored = ["cover", "a", "b", "c", "sponsors"].map((id) => ({
    id,
    input: { kind: id === "cover" ? "teamListRound" : id === "sponsors" ? "matchDay" : "teamList" },
  }));

  it("a deleted slide's layout page goes with it; the others keep theirs", () => {
    const doc = set({ order: [], removed: ["a"], pageFor: { a: "a-layout", b: "b-layout" } });
    const slides = arrangeCarouselSlides(stored, doc);
    expect(slides.map((s) => s.id)).toEqual(["cover", "b", "c", "sponsors"]);
    const saved = carouselSetDesign(doc, slides);
    expect(saved.pages.map((p) => p.id)).toEqual(["cover", "team", "sponsors", "b-layout"]);
    expect(saved.arrangement?.pageFor).toEqual({ b: "b-layout" });
  });

  it("a set saved with let-go layout pages sheds them and their slides", () => {
    const broken = set({ order: [], removed: [] });
    const withDesignSlides = [
      ...stored.filter((s) => s.id !== "a"),
      { id: "page:a-layout", pageId: "a-layout", input: { kind: "teamList" } },
      { id: "page:b-layout", pageId: "b-layout", input: { kind: "teamList" } },
    ];
    const slides = arrangeCarouselSlides(withDesignSlides, broken);
    expect(slides.map((s) => s.id)).toEqual(["cover", "b", "c", "sponsors"]);
    expect(carouselSetDesign(broken, slides).pages.map((p) => p.id)).toEqual([
      "cover",
      "team",
      "sponsors",
    ]);
  });
});
