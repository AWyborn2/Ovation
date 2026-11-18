/**
 * Changing a set's look keeps the pages the admin added (dev retest 3, item
 * 12): a Team List set of 12 slides lost its added page (12 to 11). A slide's
 * own layout was made from the old look's page, so it goes (decision 7).
 */
import { describe, expect, it } from "vitest";
import { templateDocumentErrors, type SetDocument } from "@workspace/scorecard/kind-templates";
import { keepAddedPages } from "../set-doc";

const text = (id: string) => ({
  id,
  kind: "text",
  content: id.toUpperCase(),
  geometry: { square: { x: 10, y: 10, w: 50, h: 10 } },
});

const page = (id: string, slot: string, kind: string, p: string, name?: string) => ({
  id,
  role: slot === "team" ? "repeat" : "fixed",
  slot,
  kind,
  page: p,
  ...(name ? { name } : {}),
  layers: [text(`${id}-1`)],
});

const look = (stem: string, extra: object = {}) =>
  ({
    formatVersion: 2,
    set: "teamLists",
    pages: [
      page("cover", "cover", "teamListRound", "card", `${stem} cover`),
      page("team", "team", "teamList", "team", `${stem} team`),
      page("sponsors", "sponsors", "matchDay", "sponsors", `${stem} sponsors`),
    ],
    ...extra,
  }) as unknown as SetDocument;

const OLD_LOOK = look("Old");
const NEW_LOOK = look("New", { palettes: ["club-kit"] });

/** The set as the admin left it: an added page after B Grade, and A Grade's own layout. */
const EDITED = {
  ...OLD_LOOK,
  pages: [
    ...OLD_LOOK.pages.slice(0, 2),
    page("Page1", "page", "teamList", "team", "Page 1"),
    OLD_LOOK.pages[2]!,
    page("a-layout", "page", "teamList", "team", "A Grade layout"),
  ],
  palettes: ["duotone"],
  arrangement: {
    order: ["page:cover", "detail:senior:A Grade", "page:Page1", "page:sponsors"],
    removed: [],
    pageFor: { "detail:senior:A Grade": "a-layout" },
  },
} as unknown as SetDocument;

describe("change look keeps the pages the admin added", () => {
  it("keeps an added page, in its place, and lets a slide's own layout go", () => {
    const { doc, kept, dropped } = keepAddedPages(NEW_LOOK, EDITED, OLD_LOOK);
    expect([kept, dropped]).toEqual([1, 0]);
    expect(doc.pages.map((p) => p.id)).toEqual(["cover", "team", "Page1", "sponsors"]);
    // The added page keeps what the admin put on it.
    expect(doc.pages[2]!.layers).toEqual(EDITED.pages[2]!.layers);
    // The new look's own pages are the new look's.
    expect(doc.pages[1]!.name).toBe("New team");
    // Palettes the added page used come too.
    expect(doc.palettes).toEqual(["club-kit", "duotone"]);
    expect(templateDocumentErrors(doc, "set:teamLists")).toEqual([]);
  });

  it("knows an added page by the new look's pages when the old look isn't listed", () => {
    expect(keepAddedPages(NEW_LOOK, EDITED).doc.pages.map((p) => p.id)).toEqual([
      "cover",
      "team",
      "Page1",
      "sponsors",
    ]);
  });

  it("does not carry over the old look's own design page", () => {
    const oldWithIntro = {
      ...OLD_LOOK,
      pages: [...OLD_LOOK.pages, page("intro", "page", "teamListRound", "card", "Intro")],
    } as unknown as SetDocument;
    const edited = { ...EDITED, pages: [...EDITED.pages, oldWithIntro.pages[3]!] };
    const ids = keepAddedPages(NEW_LOOK, edited, oldWithIntro).doc.pages.map((p) => p.id);
    expect(ids).not.toContain("intro");
    expect(ids).toContain("Page1");
  });

  it("renames an added page whose id the new look uses, and its place follows", () => {
    // The arrangement is the old set's, carried onto the new look (as Change look does).
    const clash = look("New", {
      pages: [...NEW_LOOK.pages, page("Page1", "page", "matchDay", "sponsors", "Look page")],
    });
    const withOrder = {
      ...clash,
      arrangement: { order: ["page:Page1"], removed: [] },
    } as unknown as SetDocument;
    const { doc } = keepAddedPages(withOrder, EDITED, OLD_LOOK);
    expect(doc.pages.map((p) => p.id)).toEqual(["cover", "team", "Page1-2", "sponsors", "Page1"]);
    expect(doc.arrangement?.order).toEqual(["page:Page1-2"]);
  });

  it("leaves a set with no added page as the new look", () => {
    expect(keepAddedPages(NEW_LOOK, OLD_LOOK, OLD_LOOK).doc).toBe(NEW_LOOK);
  });
});
