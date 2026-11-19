/**
 * Which sizes a draft renders at (portrait and story sizes plan, Stage 1):
 * `draftSizes` narrows the club's enabled sizes to the sizes the draft's
 * design covers and is never empty. Every stored design (pack-based, or a
 * templated design on all four sizes) renders at exactly the sizes it does
 * today; a portrait-and-story design never renders square or landscape. A
 * download keeps a design's own older size (D3). Pure: no database.
 */
import { describe, expect, it } from "vitest";
import {
  clubSizes,
  designSizes,
  draftSizes,
  EmptySizeError,
  feedSize,
  type CardSize,
  type DraftDesign,
  type SizeSwitches,
} from "./draft-render";

const ALL: CardSize[] = ["square", "portrait", "story", "landscape"];

/** Every combination of the four switches. */
const SWITCHES: SizeSwitches[] = Array.from({ length: 16 }, (_, n) => ({
  sizeSquare: (n & 1) !== 0,
  sizePortrait: (n & 2) !== 0,
  sizeStory: (n & 4) !== 0,
  sizeLandscape: (n & 8) !== 0,
}));

const box = { x: 10, y: 10, w: 80, h: 20 };
const text = (id: string, sizes?: CardSize[]) => ({
  id,
  kind: "text",
  text: "Round 7",
  geometry: Object.fromEntries((sizes ?? ALL).map((s) => [s, box])),
  ...(sizes ? { sizes } : {}),
});
const NEW_SIZES: CardSize[] = ["portrait", "story"];

/** A flat (v1) layer document on every size, and one on portrait and story only. */
const FOUR_SIZE_V1 = { layers: [text("title")] };
const NEW_V1 = { layers: [text("title", NEW_SIZES), text("name", ["portrait"])] };

const card = (adjustments: unknown, templateVersion: number | null = 1): DraftDesign => ({
  cardInput: { kind: "milestone", playerName: "Sam", value: 100 },
  adjustments: adjustments as DraftDesign["adjustments"],
  templateVersion,
});

/** A pack-based draft (before the template library). */
const PACK = card({ fields: { headline: "Root" } }, null);

/** A page-based (v2) Match Day document whose title page lacks story. */
const MATCH_DAY_V2 = {
  formatVersion: 2,
  pages: {
    fixture: { layers: [text("fixture", NEW_SIZES)] },
    title: { layers: [text("title", ["portrait"])] },
  },
};

const setDoc = (pages: Array<{ id: string; layers: unknown[] }>) => ({
  formatVersion: 2,
  set: "free",
  pages: pages.map((p) => ({
    id: p.id,
    role: "fixed",
    slot: "page",
    kind: "player",
    page: "card",
    layers: p.layers,
  })),
});

/** A templated (version 3) carousel of design pages, at `size`, drawn with `adjustments`. */
const carousel = (size: CardSize, adjustments: unknown, version: 1 | 3 = 3): DraftDesign => ({
  cardInput: {
    kind: "matchDay",
    weekendCarousel: {
      version,
      ...(version === 3 ? { templateRef: { copyId: 12, version: 4 } } : {}),
      setType: "matchDay",
      submissionId: "12345678-1234-1234-1234-123456789abc",
      size,
      slides: ["page-1", "page-2", "page-3"].map((id, i) => ({
        id,
        label: id,
        ...(version === 3 ? { pageId: id } : {}),
        // A version 1 set opens and closes with its bookends.
        input: {
          kind: "matchDay",
          ...(version === 1 && i !== 1 ? { carouselPage: { page: i ? "sponsors" : "title" } } : {}),
        },
        data: {},
        junior: false,
        sponsorsOn: false,
        warnings: [],
      })),
    },
  },
  adjustments: adjustments as DraftDesign["adjustments"],
  templateVersion: version === 3 ? 1 : null,
});

describe("designSizes", () => {
  it("reads all four for a pack draft, a four-size design and an unreadable one", () => {
    expect(designSizes(PACK)).toEqual(ALL);
    expect(designSizes(card(FOUR_SIZE_V1))).toEqual(ALL);
    // Nothing to read a size from: renders as it does today.
    expect(designSizes(card(null))).toEqual(ALL);
    expect(designSizes(card({ layers: [] }))).toEqual(ALL);
  });

  it("reads a portrait-and-story design's own sizes", () => {
    expect(designSizes(card(NEW_V1))).toEqual(NEW_SIZES);
  });

  it("reads a page-based design for the page the card draws", () => {
    const fixture = {
      cardInput: { kind: "matchDay" },
      adjustments: MATCH_DAY_V2 as DraftDesign["adjustments"],
      templateVersion: 1,
    };
    expect(designSizes(fixture)).toEqual(NEW_SIZES);
    const title = { ...fixture, cardInput: { kind: "matchDay", carouselPage: { page: "title" } } };
    expect(designSizes(title)).toEqual(["portrait"]);
  });

  it("reads a set design from every page with layers", () => {
    const set = setDoc([
      { id: "page-1", layers: [text("a", NEW_SIZES)] },
      { id: "page-2", layers: [text("b")] },
      { id: "page-3", layers: [] },
    ]);
    expect(designSizes(card(set))).toEqual(NEW_SIZES);
    expect(designSizes(carousel("portrait", set))).toEqual(NEW_SIZES);
    // A four-size set covers all four.
    expect(
      designSizes(carousel("square", setDoc([{ id: "page-1", layers: [text("a")] }]))),
    ).toEqual(ALL);
  });

  it("reads all four for a pack-based (version 1) carousel", () => {
    expect(designSizes(carousel("landscape", null, 1))).toEqual(ALL);
  });
});

describe("draftSizes", () => {
  it("a four-size design gets exactly the club's enabled sizes for every switch combination", () => {
    for (const settings of SWITCHES) {
      const today = clubSizes(settings);
      for (const d of [PACK, card(FOUR_SIZE_V1), card(null)]) {
        expect(draftSizes(d, settings)).toEqual(today);
        expect(draftSizes(d, settings, "download")).toEqual(today);
      }
    }
  });

  it("a portrait-and-story design never gets square or landscape, and never nothing", () => {
    const set = setDoc([{ id: "page-1", layers: [text("a", NEW_SIZES)] }]);
    for (const settings of SWITCHES) {
      for (const d of [card(NEW_V1), card(set)]) {
        for (const use of ["post", "download"] as const) {
          const sizes = draftSizes(d, settings, use);
          expect(sizes.length).toBeGreaterThan(0);
          expect(sizes.every((s) => NEW_SIZES.includes(s))).toBe(true);
          // Narrowed from the club's own sizes whenever they overlap.
          const overlap = clubSizes(settings).filter((s) => NEW_SIZES.includes(s));
          if (overlap.length) expect(sizes).toEqual(overlap);
        }
      }
    }
  });

  it("posts a design that covers none of the club's sizes at its feed size", () => {
    const squareOnly: SizeSwitches = {
      sizeSquare: true,
      sizePortrait: false,
      sizeStory: false,
      sizeLandscape: false,
    };
    expect(draftSizes(card(NEW_V1), squareOnly)).toEqual(["portrait"]);
    expect(draftSizes(card(NEW_V1), squareOnly, "download")).toEqual(NEW_SIZES);
  });

  it("D3: a download keeps a design's own older size when the club has it off; posting doesn't", () => {
    const portraitStory: SizeSwitches = {
      sizeSquare: false,
      sizePortrait: true,
      sizeStory: true,
      sizeLandscape: false,
    };
    const squareOnlyDesign = card({ layers: [text("title", ["square"])] });
    expect(draftSizes(squareOnlyDesign, portraitStory, "download")).toEqual(["square"]);
    // Posting and layout checks follow the club: the design has no portrait, so its feed size.
    expect(draftSizes(squareOnlyDesign, portraitStory)).toEqual(["square"]);
    const landscapeOnly = card({ layers: [text("title", ["landscape"])] });
    expect(draftSizes(landscapeOnly, portraitStory, "download")).toEqual(["landscape"]);
  });

  it("D3: a square carousel still downloads square once the club switches square off", () => {
    const squareOff: SizeSwitches = {
      sizeSquare: false,
      sizePortrait: true,
      sizeStory: true,
      sizeLandscape: false,
    };
    for (const d of [
      carousel("square", setDoc([{ id: "page-1", layers: [text("a")] }])),
      carousel("square", null, 1),
    ]) {
      expect(draftSizes(d, squareOff, "download")).toEqual(["square"]);
    }
    expect(draftSizes(carousel("landscape", null, 1), squareOff, "download")).toEqual([
      "landscape",
    ]);
  });
  it("round 9 B13: a carousel saved at a size its design doesn't draw is refused, never drawn blank", () => {
    const on: SizeSwitches = {
      sizeSquare: false,
      sizePortrait: true,
      sizeStory: true,
      sizeLandscape: false,
    };
    const portraitOnly = setDoc([{ id: "page-1", layers: [text("a", ["portrait"])] }]);
    expect(() => draftSizes(carousel("story", portraitOnly), on, "download")).toThrow(
      EmptySizeError,
    );
    expect(() => draftSizes(carousel("story", portraitOnly), on, "download")).toThrow(
      "This design has no Story size, so it can't download at Story. Change its look or size in the editor.",
    );
    expect(draftSizes(carousel("portrait", portraitOnly), on, "download")).toEqual(["portrait"]);
  });
});

describe("feedSize", () => {
  it("keeps today's rule for a four-size design: portrait when on, else square", () => {
    for (const settings of SWITCHES)
      expect(feedSize(ALL, settings)).toBe(settings.sizePortrait ? "portrait" : "square");
  });

  it("posts a portrait-and-story design at portrait whatever the switches", () => {
    for (const settings of SWITCHES) expect(feedSize(NEW_SIZES, settings)).toBe("portrait");
  });

  it("has no feed size for a design with neither portrait nor square", () => {
    expect(feedSize(["story"], SWITCHES[15])).toBeNull();
  });
});
