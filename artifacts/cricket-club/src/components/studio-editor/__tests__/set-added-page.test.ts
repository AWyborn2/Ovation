/**
 * Retest 5, item 5 (set 972): a page the admin added to a queued carousel
 * ("Page 1": Add page → Blank page, a heading typed on it) keeps its heading
 * through every web path that opens, draws or re-looks the set: the editor's
 * load (stranded-layout cleanup, open, store), the queue preview's slides,
 * and Change look (`keepAddedPages`), with the look's own pages on a newer
 * version. The server's side (save, look update, migration 0079, read back)
 * is `set-designs.test.ts` in the API.
 *
 * Reads the committed bundle files from disk.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assembleSetDocument,
  strandedLayoutPageIds,
  withoutStrandedLayouts,
  type SetDocument,
  type TemplateLayerV2,
} from "@workspace/scorecard/kind-templates";
import { readQueuedCarousel } from "@workspace/scorecard/queued-carousel";
import { BLANK_PACK_ID, renderPackCard, resolveCardTokens } from "@/lib/pack-render";
import { setDraftSlides, slideDocument } from "@/lib/set-draft";
import type { CardSize } from "@/lib/share-card";
import {
  addBlankPage,
  keepAddedPages,
  openSetTemplate,
  storedSetDocument,
  templatePageName,
} from "../set-doc";

const BUNDLES = path.resolve(__dirname, "../../../../../../lib/template-bundles");
const lookSet = (look: string): SetDocument =>
  assembleSetDocument("matchDay", (kind) => {
    try {
      return JSON.parse(readFileSync(path.join(BUNDLES, look, `${kind}.json`), "utf8")).document;
    } catch {
      return undefined;
    }
  })!.document;

const BRAND = {
  brand: { name: "Our Cricket Club", primaryColour: "#1f6f43", backgroundColour: "#0c2a1b" },
  hashtag: "#OURCC",
};

const slide = (id: string, input: Record<string, unknown>) => ({
  id,
  label: id,
  junior: false,
  sponsorsOn: false,
  warnings: [],
  input,
  data: {},
});

/** A queued carousel (v3) as the server stores it, its stored slides given. */
const draftWith = (slides: ReturnType<typeof slide>[], adjustments: SetDocument) => ({
  cardInput: {
    kind: "matchDay",
    weekendCarousel: {
      version: 3,
      templateRef: { libraryTemplateId: 1, version: 1 },
      setType: "matchDay",
      submissionId: "12345678-1234-1234-1234-123456789abc",
      size: "square",
      slides,
    },
  },
  adjustments,
});

const STORED = [
  slide("title", {
    kind: "matchDay",
    carouselPage: { page: "title", title: "This weekend", sponsors: [] },
  }),
  slide("fx-1", { kind: "matchDay", grade: "A Grade", opponentName: "Waroona" }),
  slide("sponsors", {
    kind: "matchDay",
    carouselPage: { page: "sponsors", title: "This weekend", sponsors: [] },
  }),
];

const HEADING: TemplateLayerV2 = {
  id: "heading-1",
  kind: "text",
  name: "HEADING",
  content: "OUR BIG WEEKEND",
  style: { fontSize: 9, fontWeight: 800 },
  geometry: { square: { x: 15, y: 40, w: 70, h: 18 } },
  editedAt: { square: 1_763_000_000_000 },
} as unknown as TemplateLayerV2;

/** The set editor: open the look's set, Add page → Blank page after the fixture page, type a heading. */
function addedPageSet(look: string): { doc: SetDocument; pageId: string } {
  const opened = openSetTemplate(lookSet(look)).doc;
  const { doc, id } = addBlankPage(opened, { kind: "matchDay", page: "fixture" }, "fixture");
  const pages = doc.pages as Record<string, { layers: unknown[] }>;
  pages[id] = { layers: [HEADING] };
  return { doc: storedSetDocument(doc), pageId: id };
}

/** The stored slides after the save (`arrangeCarouselSlides` adds one for the design page). */
const savedSlides = (pageId: string) => [
  ...STORED.slice(0, 2),
  { ...slide(`page:${pageId}`, { kind: "matchDay" }), pageId },
  STORED[2]!,
];

function draws(doc: SetDocument, pageId: string, size: CardSize = "square"): string {
  const s = setDraftSlides(draftWith(savedSlides(pageId), doc), doc, BRAND).find(
    (x) => x.key === `page:${pageId}`,
  );
  expect(s, "the added page is a slide").toBeDefined();
  expect(s!.page.layers).toEqual([HEADING]);
  return renderPackCard(
    s!.input,
    size,
    s!.sponsorsOn,
    resolveCardTokens({ junior: s!.junior, data: s!.data, packId: BLANK_PACK_ID }),
    s!.junior,
    s!.data,
    BLANK_PACK_ID,
    slideDocument(doc, s!),
  );
}

describe("an added page keeps its heading (retest 5, set 972)", () => {
  for (const look of ["club-kit", "bold-type", "duotone"]) {
    it(`${look}: is named Page 1 and draws its heading on every size`, () => {
      const { doc, pageId } = addedPageSet(look);
      expect(doc.pages.find((p) => p.id === pageId)?.name).toBe("Page 1");
      expect(readQueuedCarousel(draftWith(savedSlides(pageId), doc).cardInput)).not.toBeNull();
      for (const size of ["square", "portrait", "story", "landscape"] as CardSize[])
        expect(draws(doc, pageId, size), size).toContain("OUR BIG WEEKEND");
    });

    it(`${look}: survives the editor's load path (stranded-layout cleanup, open, store)`, () => {
      const { doc, pageId } = addedPageSet(look);
      const reopened = storedSetDocument(openSetTemplate(withoutStrandedLayouts(doc)).doc);
      expect(reopened).toEqual(doc);
      expect(draws(reopened, pageId)).toContain("OUR BIG WEEKEND");
    });
  }

  it("survives Change look, onto a look on a newer version, and draws there", () => {
    const { doc: before, pageId } = addedPageSet("club-kit");
    // What the set editor's Change look does (admin-set-draft-editor.tsx).
    const next = lookSet("bold-type");
    const relooked = keepAddedPages(next, before, lookSet("club-kit"));
    expect(relooked).toMatchObject({ kept: 1, dropped: 0 });
    const page = relooked.doc.pages.find((p) => p.id === pageId);
    expect(page).toMatchObject({ name: "Page 1", slot: "page", layers: [HEADING] });
    // In its place: after the fixture page.
    const ids = relooked.doc.pages.map((p) => p.id);
    expect(ids.indexOf(pageId)).toBe(ids.indexOf("fixture") + 1);
    expect(draws(relooked.doc, pageId)).toContain("OUR BIG WEEKEND");
    // Back again: still there.
    const back = keepAddedPages(lookSet("club-kit"), relooked.doc, next);
    expect(back.doc.pages.find((p) => p.id === pageId)?.layers).toEqual([HEADING]);
  });

  it("a page added from a template named '… layout' is never taken for a slide's layout", () => {
    // A one-page Team List template the club named "Team layout", added to a
    // Team Lists set: named so, it read as a let-go slide layout and went on
    // open, save, Change look and in migration 0079.
    const name = templatePageName("Team layout", "Team", false);
    expect(name).toBe("Team layout · Team");
    expect(templatePageName("Our team list", "Team", false)).toBe("Our team list");
    expect(templatePageName("Our match day", "Title", true)).toBe("Our match day · Title");
    const long = templatePageName(`${"x".repeat(53)} layout and more`, "Team", false);
    expect(long.length).toBeLessThanOrEqual(60);
    expect(long).not.toMatch(/\slayout$/i);
    const set = {
      formatVersion: 2,
      set: "teamLists",
      pages: [
        { id: "team", role: "repeat", slot: "team", kind: "teamList", page: "team", layers: [] },
        {
          id: "Teamlayout",
          role: "fixed",
          slot: "page",
          kind: "teamList",
          page: "team",
          name,
          layers: [HEADING],
        },
      ],
    } as unknown as SetDocument;
    expect(strandedLayoutPageIds(set).size).toBe(0);
    expect(withoutStrandedLayouts(set)).toBe(set);
  });

  it("survives Change look when the old look isn't known (a set from before looks were listed)", () => {
    const { doc: before, pageId } = addedPageSet("club-kit");
    const relooked = keepAddedPages(lookSet("bold-type"), before);
    expect(relooked.doc.pages.find((p) => p.id === pageId)?.layers).toEqual([HEADING]);
  });
});
