/**
 * Portrait and Story sizes plan, Stage 3: what each surface offers a new
 * design (Portrait, the default, and Story), and which older sizes (Square,
 * Landscape) a stored design keeps.
 */
import { describe, it, expect } from "vitest";
import { placeholderDocument, TEMPLATE_SIZE_ORDER } from "@workspace/scorecard/kind-templates";
import { CREATE_SIZES } from "@/components/studio-home/create-picker";
import { CAROUSEL_SIZES } from "@/components/studio-create/carousel-flow";
import { SET_SIZES } from "@/components/template-library/make-set-dialog";
import { PACK_PREVIEW_FORMATS } from "@/components/social-studio/design-packs-section";
import { FORMATS, formatOptions } from "@/components/studio-editor/editor-shell";
import { PLATFORM_HINT } from "@/components/studio-editor/export/download";
import { clubKitBackgroundAdjustments } from "@/components/social-studio/editor-starters";
import {
  clubSizesFor,
  DEFAULT_NEW_SIZE,
  designOwnSizes,
  draftOlderSizes,
  packDraftOlderSizes,
} from "./offered-sizes";

const box = { x: 1, y: 1, w: 10, h: 10 };

describe("sizes offered for a new design", () => {
  it("Create, the carousel flow, Make a set, look previews and Format: Portrait first, then Story", () => {
    expect(CREATE_SIZES.map((s) => s.value)).toEqual(["portrait", "story"]);
    expect(CAROUSEL_SIZES.map((s) => s.value)).toEqual(["portrait", "story"]);
    expect(SET_SIZES).toEqual(["portrait", "story"]);
    expect(PACK_PREVIEW_FORMATS.map((s) => s.value)).toEqual(["portrait", "story"]);
    expect(FORMATS.map((s) => s.value)).toEqual(["portrait", "story"]);
    expect(DEFAULT_NEW_SIZE).toBe("portrait");
  });

  it("the Format menu adds an older size only when asked, after Portrait and Story", () => {
    expect(formatOptions([]).map((f) => f.value)).toEqual(["portrait", "story"]);
    expect(formatOptions(["landscape", "square"]).map((f) => [f.value, f.older])).toEqual([
      ["portrait", false],
      ["story", false],
      ["square", true],
      ["landscape", true],
    ]);
    // The size on show is always listed, so the menu shows where it is.
    expect(formatOptions([], "square").map((f) => f.value)).toEqual([
      "portrait",
      "story",
      "square",
    ]);
  });

  it("downloads call Square and Landscape an older size", () => {
    expect(PLATFORM_HINT.square).toBe("Older size");
    expect(PLATFORM_HINT.landscape).toBe("Older size");
    expect(PLATFORM_HINT.portrait).not.toBe("Older size");
    expect(PLATFORM_HINT.story).not.toBe("Older size");
  });
});

describe("starters and placeholders", () => {
  it("the Club Kit background starter is on Portrait and Story only, with sizes set", () => {
    const [layer] = clubKitBackgroundAdjustments().layers as {
      sizes: string[];
      geometry: Record<string, unknown>;
    }[];
    expect(layer!.sizes).toEqual(["portrait", "story"]);
    expect(Object.keys(layer!.geometry).sort()).toEqual(["portrait", "story"]);
    expect(designOwnSizes(clubKitBackgroundAdjustments())).toEqual(["portrait", "story"]);
  });

  it("a placeholder for new sizes has portrait and story boxes only, with sizes set", () => {
    const doc = placeholderDocument("milestone", ["story", "portrait"]);
    expect(doc.layers.length).toBeGreaterThan(0);
    for (const l of doc.layers) {
      expect(l.sizes).toEqual(["portrait", "story"]);
      expect(Object.keys(l.geometry).sort()).toEqual(["portrait", "story"]);
    }
  });

  it("the placeholder with no sizes is unchanged: on every size, no sizes list", () => {
    const doc = placeholderDocument("milestone");
    for (const l of doc.layers) {
      expect(l.sizes).toBeUndefined();
      expect(Object.keys(l.geometry)).toEqual([...TEMPLATE_SIZE_ORDER]);
    }
    expect(placeholderDocument("milestone", TEMPLATE_SIZE_ORDER)).toEqual(doc);
  });
});

describe("a design's own sizes", () => {
  it("a four-size design keeps all four; a new one Portrait and Story", () => {
    expect(designOwnSizes(placeholderDocument("milestone"))).toEqual([...TEMPLATE_SIZE_ORDER]);
    expect(designOwnSizes(placeholderDocument("milestone", ["portrait", "story"]))).toEqual([
      "portrait",
      "story",
    ]);
    expect(designOwnSizes({ layers: [] })).toEqual(["portrait", "story"]);
  });

  it("reads every page of a page-based design and a set", () => {
    const v2 = {
      formatVersion: 2,
      pages: {
        title: { layers: [] },
        day: { layers: [{ id: "a", sizes: ["landscape"], geometry: { landscape: box } }] },
      },
    };
    expect(designOwnSizes(v2)).toEqual(["portrait", "story", "landscape"]);
  });

  it("keeps the size the editor is open at", () => {
    expect(designOwnSizes({ layers: [] }, "square")).toEqual(["square", "portrait", "story"]);
  });

  it("the pack editor: a pack design keeps both older sizes; the blank base only drawn ones", () => {
    expect(packDraftOlderSizes({}, false)).toEqual(["square", "landscape"]);
    expect(packDraftOlderSizes({ layers: [{ geometry: { portrait: box } }] }, true)).toEqual([]);
    expect(packDraftOlderSizes({ layers: [{ geometry: { square: box } }] }, true)).toEqual([
      "square",
    ]);
  });

  it("a stored draft's older sizes", () => {
    expect(draftOlderSizes({ packId: "broadcast-dark", templateVersion: null })).toEqual([
      "square",
      "landscape",
    ]);
    expect(
      draftOlderSizes({
        packId: "blank",
        templateVersion: 2,
        adjustments: placeholderDocument("milestone", ["portrait", "story"]),
      }),
    ).toEqual([]);
    expect(
      draftOlderSizes({
        packId: "blank",
        templateVersion: 2,
        adjustments: placeholderDocument("milestone"),
      }),
    ).toEqual(["square", "landscape"]);
  });
});

describe("the older screens' sizes (share card modal, Card Sets editor, D7)", () => {
  const club = { sizeSquare: true, sizePortrait: true, sizeStory: true, sizeLandscape: true };

  it("a new card: Portrait and Story, even where the club has Square on", () => {
    expect(clubSizesFor(club)).toEqual(["portrait", "story"]);
    expect(clubSizesFor(undefined)).toEqual(["portrait", "story"]);
    expect(clubSizesFor({ ...club, sizeStory: false })).toEqual(["portrait"]);
  });

  it("an older square item keeps Square where the club has it on", () => {
    expect(clubSizesFor(club, ["square"])).toEqual(["square", "portrait", "story"]);
    expect(clubSizesFor({ ...club, sizeSquare: false }, ["square"])).toEqual(["portrait", "story"]);
  });

  it("an older set always keeps the size it was saved at, so it still opens there", () => {
    expect(clubSizesFor({ ...club, sizeSquare: false }, [], "square")).toEqual([
      "square",
      "portrait",
      "story",
    ]);
    expect(clubSizesFor(club, [], "portrait")).toEqual(["portrait", "story"]);
  });

  it("never empty: Portrait", () => {
    expect(
      clubSizesFor({
        sizeSquare: true,
        sizePortrait: false,
        sizeStory: false,
        sizeLandscape: false,
      }),
    ).toEqual(["portrait"]);
  });
});
