/**
 * Portrait and Story sizes plan, Stage 2, and round 9 (B8, B13): which sizes a
 * draft may save as its design size, and which older sizes it was made in.
 * Pure (no database); the design's sizes come from Stage 1's `designSizes`
 * (tested in draft-sizes.test.ts).
 */
import { describe, expect, it } from "vitest";
import {
  designSizeRefusal,
  initialDesignSize,
  keptDesignSize,
  madeInOlderSizes,
  SIZES_SAVED_FROM,
} from "./draft-design-size";

const box = { x: 5, y: 5, w: 90, h: 20 };
const newLayer = {
  id: "n",
  kind: "shape",
  sizes: ["portrait", "story"],
  geometry: { portrait: box, story: box },
};
const allLayer = {
  id: "a",
  kind: "shape",
  geometry: { square: box, portrait: box, story: box, landscape: box },
};
/** An OMG T20 Match Summary look: Square, Portrait and Landscape, no Story (card 1022). */
const noStoryLayer = {
  id: "t20",
  kind: "shape",
  sizes: ["square", "portrait", "landscape"],
  geometry: { square: box, portrait: box, landscape: box },
};
const card = { kind: "milestone", playerName: "Sam", value: 100 };
const fresh = { cardInput: card, adjustments: { layers: [newLayer] }, templateVersion: 1 };
const fourSize = { ...fresh, adjustments: { layers: [allLayer] } };
const noStory = { ...fresh, adjustments: { layers: [noStoryLayer] } };

const after = new Date(SIZES_SAVED_FROM.getTime() + 60_000);
const before = new Date(SIZES_SAVED_FROM.getTime() - 60_000);

describe("designSizeRefusal", () => {
  it("lets Portrait and Story be saved where the design draws them", () => {
    expect(designSizeRefusal(fresh, "portrait")).toBeNull();
    expect(designSizeRefusal(fresh, "story")).toBeNull();
  });

  it("refuses any size the design doesn't draw, Story included (round 9 B13)", () => {
    expect(designSizeRefusal(noStory, "story")).toBe(
      "This design has no Story size. Design it at a size it has.",
    );
    expect(designSizeRefusal(fresh, "square")).toBe(
      "This design has no Square size. Design it at a size it has.",
    );
    // Even when it was saved there before: it would reopen blank.
    expect(designSizeRefusal(fresh, "square", "square")).toMatch(/^This design has no Square/);
  });

  it("refuses an older size the draft wasn't made in, though the design draws it (round 9 B8)", () => {
    expect(designSizeRefusal(fourSize, "square")).toBe(
      "Square is an older size this design wasn't made in. Design it at Portrait or Story.",
    );
    expect(designSizeRefusal(noStory, "landscape")).toMatch(/^Landscape is an older size/);
  });

  it("allows an older size the draft has saved, or was made in, where the design draws it", () => {
    expect(designSizeRefusal(fourSize, "square", "square")).toBeNull();
    expect(designSizeRefusal(fourSize, "landscape", null, ["landscape"])).toBeNull();
    expect(designSizeRefusal(fourSize, "square", null, ["landscape"])).not.toBeNull();
  });

  it("a pack-based draft draws all four, but an older size still needs to be made in", () => {
    const pack = { cardInput: card, adjustments: null, templateVersion: null };
    expect(designSizeRefusal(pack, "portrait")).toBeNull();
    expect(designSizeRefusal(pack, "story")).toBeNull();
    expect(designSizeRefusal(pack, "square", null, ["square", "landscape"])).toBeNull();
    expect(designSizeRefusal(pack, "landscape", null, ["square", "landscape"])).toBeNull();
    expect(designSizeRefusal(pack, "square")).toMatch(/older size/);
  });

  it("reads a page set from every page it has", () => {
    const pages = {
      cardInput: card,
      adjustments: {
        formatVersion: 2,
        set: "free",
        pages: [
          { id: "p1", slot: "page", kind: "milestone", page: "card", layers: [newLayer] },
          { id: "p2", slot: "page", kind: "milestone", page: "card", layers: [allLayer] },
        ],
      },
      templateVersion: 1,
    };
    expect(designSizeRefusal(pages, "square", null, ["square"])).not.toBeNull();
    expect(designSizeRefusal(pages, "story")).toBeNull();
  });
});

describe("madeInOlderSizes (round 9 B8)", () => {
  const draft = (over: Partial<Parameters<typeof madeInOlderSizes>[0]>) => ({
    ...fourSize,
    designSize: null,
    createdAt: after,
    ...over,
  });

  it("a brand-new card from a four-size library look has none", () => {
    expect(madeInOlderSizes(draft({ designSize: "portrait" }))).toEqual([]);
    // A sweep's new card saves no size: still a new design.
    expect(madeInOlderSizes(draft({}))).toEqual([]);
    expect(madeInOlderSizes(draft({ ...noStory, designSize: "portrait" }))).toEqual([]);
  });

  it("keeps the older size a draft is saved at, or a revision was", () => {
    expect(madeInOlderSizes(draft({ designSize: "square" }))).toEqual(["square"]);
    expect(madeInOlderSizes(draft({ designSize: "portrait" }), ["landscape", null])).toEqual([
      "landscape",
    ]);
  });

  it("an older draft (no saved size, made before sizes were saved) keeps every older size it draws", () => {
    expect(madeInOlderSizes(draft({ createdAt: before }))).toEqual(["square", "landscape"]);
    expect(madeInOlderSizes(draft({ ...noStory, createdAt: before.toISOString() }))).toEqual([
      "square",
      "landscape",
    ]);
    // An older draft whose design draws only Portrait and Story has none.
    expect(madeInOlderSizes(draft({ ...fresh, createdAt: before }))).toEqual([]);
    // One saved at a size since is read by that size.
    expect(madeInOlderSizes(draft({ createdAt: before, designSize: "portrait" }))).toEqual([]);
  });

  it("never an older size the design doesn't draw", () => {
    expect(madeInOlderSizes(draft({ ...fresh, designSize: "square" }), ["landscape"])).toEqual([]);
  });

  it("a queued carousel keeps the older size it is saved at, and no other", () => {
    const carousel = (size: string) => ({
      cardInput: {
        kind: "matchDay",
        weekendCarousel: {
          version: 1,
          setType: "matchDay",
          submissionId: "12345678-1234-1234-1234-123456789abc",
          size,
          slides: ["page-1", "page-2", "page-3"].map((id, i) => ({
            id,
            label: id,
            input: {
              kind: "matchDay",
              ...(i !== 1 ? { carouselPage: { page: i ? "sponsors" : "title" } } : {}),
            },
            data: {},
            junior: false,
            sponsorsOn: false,
            warnings: [],
          })),
        },
      },
      adjustments: null,
      templateVersion: null,
      designSize: null,
      createdAt: after,
    });
    expect(madeInOlderSizes(carousel("landscape"))).toEqual(["landscape"]);
    expect(madeInOlderSizes(carousel("square"))).toEqual(["square"]);
    expect(madeInOlderSizes(carousel("portrait"))).toEqual([]);
  });
});

describe("the size a draft is made at (round 9)", () => {
  const storyOnly = {
    ...fresh,
    adjustments: {
      layers: [{ id: "s", kind: "shape", sizes: ["story"], geometry: { story: box } }],
    },
  };

  it("Portrait by default, the asked-for size when drawn, never one the design lacks", () => {
    expect(initialDesignSize(fourSize)).toBe("portrait");
    expect(initialDesignSize(fourSize, "story")).toBe("story");
    expect(initialDesignSize(storyOnly)).toBe("story");
    expect(initialDesignSize(noStory, "story")).toBe("portrait");
    expect(initialDesignSize({ ...fresh, adjustments: { layers: [noStoryLayer] } }, "square")).toBe(
      "square",
    );
    // A pack design draws all four.
    expect(initialDesignSize({ cardInput: card, adjustments: null, templateVersion: null })).toBe(
      "portrait",
    );
  });

  it("an older draft keeps no size when none is asked for; others keep theirs where drawn", () => {
    const older = { designSize: null, createdAt: before };
    const newer = { designSize: "story" as const, createdAt: after };
    expect(keptDesignSize(older, fourSize)).toBeNull();
    expect(keptDesignSize({ ...older, designSize: "square" }, fourSize)).toBe("square");
    expect(keptDesignSize(newer, fourSize)).toBe("story");
    expect(keptDesignSize(newer, noStory)).toBe("portrait");
    expect(keptDesignSize({ designSize: null, createdAt: after }, fourSize)).toBe("portrait");
  });
});
