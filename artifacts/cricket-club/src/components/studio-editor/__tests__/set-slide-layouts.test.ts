/**
 * A set draft's own-layout slides through delete, reorder and add (dev
 * retest, 17 Nov 2026, draft 962). Deleting the A Grade slide of a Team List
 * carousel used to drop every slide's layout, leaving the layout pages as
 * blank slides after Sponsors ("A Grade v Waroona … layout"), and B Grade
 * lost its own. The layout pages must never draw, count or post as slides.
 */
import { describe, expect, it } from "vitest";
import {
  mapCarouselSlides,
  templateDocumentErrors,
  withoutStrandedLayouts,
  type SetDocument,
  type StoredSetSlide,
} from "@workspace/scorecard/kind-templates";
import {
  addBlankPage,
  deleteSlide,
  layoutPages,
  newSlideLayout,
  openSetTemplate,
  storedSetDocument,
  withSlideOrder,
  type EditorTemplateDoc,
} from "../set-doc";

const page = (id: string, slot: string, kind: string, p: string, name?: string) => ({
  id,
  role: slot === "team" ? "repeat" : "fixed",
  slot,
  kind,
  page: p,
  ...(name ? { name } : {}),
  layers: [],
});

/** A Team List round carousel: cover, a team page, sponsors, and two slides' own layouts. */
const SET = {
  formatVersion: 2,
  set: "teamLists",
  pages: [
    page("cover", "cover", "teamListRound", "card"),
    page("team", "team", "teamList", "team"),
    page("sponsors", "sponsors", "matchDay", "sponsors"),
    page("a-layout", "page", "teamList", "team", "A Grade v Waroona layout"),
    page("b-layout", "page", "teamList", "team", "B Grade v Pinjarra layout"),
  ],
  arrangement: { order: [], removed: [], pageFor: { a: "a-layout", b: "b-layout" } },
} as unknown as SetDocument;

/** The queued carousel's stored slides: cover, four teams, sponsors. */
const STORED: StoredSetSlide[] = [
  { id: "cover", input: { kind: "teamListRound", carouselPage: { page: "title" } } },
  { id: "a", label: "A Grade v Waroona", input: { kind: "teamList", grade: "A Grade" } },
  { id: "b", label: "B Grade v Pinjarra", input: { kind: "teamList", grade: "B Grade" } },
  { id: "c", label: "C Grade", input: { kind: "teamList", grade: "C Grade" } },
  { id: "d", label: "D Grade", input: { kind: "teamList", grade: "D Grade" } },
  { id: "sponsors", input: { kind: "matchDay", carouselPage: { page: "sponsors" } } },
];

const opened = (set: SetDocument = SET) => openSetTemplate(set).doc;

/** The slides as drawn: key → page id, in the stored order minus removed ones. */
function drawn(doc: EditorTemplateDoc, stored = STORED) {
  const set = storedSetDocument(doc);
  const removed = new Set(set.arrangement?.removed ?? []);
  return mapCarouselSlides(
    set,
    stored.filter((s) => !removed.has(s.id)),
  ).slides.map((s) => [s.key, s.page.id]);
}

describe("own-layout slides in a set draft (draft 962)", () => {
  it("draws each layout page only for its slide", () => {
    expect(drawn(opened())).toEqual([
      ["cover", "cover"],
      ["a", "a-layout"],
      ["b", "b-layout"],
      ["c", "team"],
      ["d", "team"],
      ["sponsors", "sponsors"],
    ]);
  });

  it("deleting a slide removes its own layout page and no other", () => {
    const doc = deleteSlide(opened(), { key: "a", design: false, page: { id: "a-layout" } });
    const set = storedSetDocument(doc);
    expect(set.pages.map((p) => p.id)).toEqual(["cover", "team", "sponsors", "b-layout"]);
    expect(set.arrangement).toEqual({ order: [], removed: ["a"], pageFor: { b: "b-layout" } });
    // Five slides, no blank layout pages after Sponsors, and B Grade keeps its own.
    expect(drawn(doc)).toEqual([
      ["cover", "cover"],
      ["b", "b-layout"],
      ["c", "team"],
      ["d", "team"],
      ["sponsors", "sponsors"],
    ]);
    expect(templateDocumentErrors(set, "set:teamLists")).toEqual([]);
  });

  it("reordering keeps every slide's own layout", () => {
    const doc = withSlideOrder(opened(), ["cover", "d", "b", "a", "c", "sponsors"]);
    const set = storedSetDocument(doc);
    expect(set.arrangement?.pageFor).toEqual({ a: "a-layout", b: "b-layout" });
    expect(set.pages).toHaveLength(5);
    expect(layoutPages(doc)).toEqual(new Set(["a-layout", "b-layout"]));
  });

  it("adding a page keeps every slide's own layout, and the new page is one slide", () => {
    const r = addBlankPage(opened(), { kind: "teamList", page: "team" }, "sponsors");
    const set = storedSetDocument(r.doc);
    expect(set.arrangement?.pageFor).toEqual({ a: "a-layout", b: "b-layout" });
    expect(layoutPages(r.doc)).toEqual(new Set(["a-layout", "b-layout"]));
    expect(layoutPages(r.doc).has(r.id)).toBe(false);
  });

  it("delete, then reorder, then delete again: layouts follow their slides", () => {
    let doc = deleteSlide(opened(), { key: "b", design: false, page: { id: "b-layout" } });
    doc = withSlideOrder(doc, ["cover", "c", "a", "d", "sponsors"]);
    doc = deleteSlide(doc, { key: "c", design: false, page: { id: "team" } });
    const set = storedSetDocument(doc);
    expect(set.arrangement?.pageFor).toEqual({ a: "a-layout" });
    expect(set.arrangement?.removed).toEqual(["b", "c"]);
    expect(set.pages.map((p) => p.id)).toEqual(["cover", "team", "sponsors", "a-layout"]);
  });

  it("a design page's slide goes with its page and leaves the layouts alone", () => {
    const r = addBlankPage(opened(), { kind: "teamList", page: "team" }, "sponsors");
    const doc = deleteSlide(r.doc, { key: `page:${r.id}`, design: true, page: { id: r.id } });
    const set = storedSetDocument(doc);
    expect(set.pages.map((p) => p.id)).toEqual(SET.pages.map((p) => p.id));
    expect(set.arrangement?.pageFor).toEqual({ a: "a-layout", b: "b-layout" });
  });
});

describe("a set already holding let-go layout pages (as draft 962 was saved)", () => {
  // What the old delete saved: no pageFor, both layout pages left, and a stored
  // design slide for each after Sponsors.
  const BROKEN = {
    ...SET,
    arrangement: { order: [], removed: [] },
  } as unknown as SetDocument;
  const STORED_BROKEN: StoredSetSlide[] = [
    ...STORED.filter((s) => s.id !== "a"),
    {
      id: "page:a-layout",
      pageId: "a-layout",
      label: "A Grade v Waroona layout",
      input: { kind: "teamList" },
    },
    {
      id: "page:b-layout",
      pageId: "b-layout",
      label: "B Grade v Pinjarra layout",
      input: { kind: "teamList" },
    },
  ];

  it("shows the layout pages nowhere", () => {
    expect(drawn(opened(BROKEN), STORED_BROKEN).map(([k]) => k)).toEqual([
      "cover",
      "b",
      "c",
      "d",
      "sponsors",
    ]);
  });

  it("drops them on the next save", () => {
    const set = withoutStrandedLayouts(BROKEN);
    expect(set.pages.map((p) => p.id)).toEqual(["cover", "team", "sponsors"]);
    expect(storedSetDocument(opened(set)).pages).toHaveLength(3);
  });

  it("keeps a page the admin added, whatever kind page it draws", () => {
    const withBlank = {
      ...BROKEN,
      pages: [...BROKEN.pages, page("p3", "page", "teamList", "team", "Page 3")],
    } as unknown as SetDocument;
    expect(withoutStrandedLayouts(withBlank).pages.map((p) => p.id)).toEqual([
      "cover",
      "team",
      "sponsors",
      "p3",
    ]);
  });
});

describe("orphaned layouts in a set as the editor opens it (dev retest 3, draft 962)", () => {
  // As draft 962 was saved: no pageFor, both layout pages left, a stored
  // design slide for each after Sponsors.
  const BROKEN = { ...SET, arrangement: { order: [], removed: [] } } as unknown as SetDocument;
  const STORED_BROKEN: StoredSetSlide[] = [
    ...STORED,
    {
      id: "page:a-layout",
      pageId: "a-layout",
      label: "A Grade v Waroona layout",
      input: { kind: "teamList" },
    },
    {
      id: "page:b-layout",
      pageId: "b-layout",
      label: "B Grade v Pinjarra layout",
      input: { kind: "teamList" },
    },
  ];

  it("opened (shed of its let-go layouts), draws no slide for them", () => {
    // The editor opens the set without the pages; their stored slides used to
    // fall back to the team page and draw as blank team slides.
    const doc = opened(withoutStrandedLayouts(BROKEN));
    expect(drawn(doc, STORED_BROKEN).map(([k]) => k)).toEqual([
      "cover",
      "a",
      "b",
      "c",
      "d",
      "sponsors",
    ]);
  });

  it("a layout page only a deleted slide names is let go, with its map entry", () => {
    const set = {
      ...SET,
      arrangement: { order: [], removed: ["a"], pageFor: { a: "a-layout", b: "b-layout" } },
    } as unknown as SetDocument;
    const shed = withoutStrandedLayouts(set);
    expect(shed.pages.map((p) => p.id)).toEqual(["cover", "team", "sponsors", "b-layout"]);
    expect(shed.arrangement).toEqual({ order: [], removed: ["a"], pageFor: { b: "b-layout" } });
  });

  it("a long slide name keeps its layout page known as a layout", () => {
    const long = "A Grade v Waroona Cricket Club Sharks, Sat 15 Nov 2026, Halls Head Oval";
    const r = newSlideLayout(opened(), "c", "team", `${long} layout`);
    const set = storedSetDocument(r.doc);
    const made = set.pages.find((p) => p.id === r.id)!;
    expect(made.name!.length).toBeLessThanOrEqual(60);
    expect(made.name).toMatch(/ layout$/);
    // Let go (as before the fix), it is shed like any other.
    const letGo = { ...set, arrangement: { order: [], removed: [] } } as SetDocument;
    expect(withoutStrandedLayouts(letGo).pages.some((p) => p.id === r.id)).toBe(false);
  });
});
