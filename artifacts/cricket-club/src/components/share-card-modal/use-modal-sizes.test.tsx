import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import type { CardSize } from "@/lib/share-card";
import { useModalSizes } from "./use-modal-sizes";
import { isOlderPackVariant } from "./use-layout-template";

/**
 * The share card modal (the queue's Share to socials) keeps a stored draft's
 * own older sizes whatever the club's switches (portrait and story sizes plan,
 * D3): after migration 0083 switches Square off, an older square draft still
 * opens and downloads at Square there. A new card gets Portrait and Story.
 */

const SQUARE_OFF = { sizeSquare: false, sizePortrait: true, sizeStory: true, sizeLandscape: false };

const sizes = (olderSizes?: readonly CardSize[], settings = SQUARE_OFF) =>
  renderHook(() => useModalSizes({ open: true, settings, olderSizes })).result.current;

describe("useModalSizes", () => {
  it("keeps a square draft's Square with the club's Square off", () => {
    expect(sizes(["square"]).enabledSizes).toEqual(["square", "portrait", "story"]);
  });

  it("keeps a draft's Landscape with the club's Landscape off", () => {
    expect(sizes(["square", "landscape"]).enabledSizes).toEqual([
      "square",
      "portrait",
      "story",
      "landscape",
    ]);
  });

  it("a new card: Portrait and Story only, opening at Portrait", () => {
    const out = sizes([]);
    expect(out.enabledSizes).toEqual(["portrait", "story"]);
    expect(out.activeSize).toBe("portrait");
    // Even where the club still has Square on.
    expect(sizes(undefined, { ...SQUARE_OFF, sizeSquare: true }).enabledSizes).toEqual([
      "portrait",
      "story",
    ]);
  });

  it("Portrait and Story still follow the club's switches", () => {
    expect(sizes(["square"], { ...SQUARE_OFF, sizeStory: false }).enabledSizes).toEqual([
      "square",
      "portrait",
    ]);
  });

  it("round 9 B11: a Story card offers Story even with the club's Story off", () => {
    const storyOff = { ...SQUARE_OFF, sizeStory: false };
    const out = renderHook(() =>
      useModalSizes({ open: true, settings: storyOff, olderSizes: [], designSize: "story" }),
    ).result.current;
    expect(out.enabledSizes).toEqual(["portrait", "story"]);
  });

  it("round 9 B11/B13: a new card from a four-size look: Portrait and Story, nothing it doesn't draw", () => {
    const all: CardSize[] = ["square", "portrait", "story", "landscape"];
    const four = renderHook(() =>
      useModalSizes({ open: true, settings: SQUARE_OFF, olderSizes: [], drawnSizes: all }),
    ).result.current;
    expect(four.enabledSizes).toEqual(["portrait", "story"]);
    // Card 1022 (no Story layers): Portrait only.
    const t20 = renderHook(() =>
      useModalSizes({
        open: true,
        settings: SQUARE_OFF,
        olderSizes: [],
        designSize: "portrait",
        drawnSizes: ["square", "portrait", "landscape"],
      }),
    ).result.current;
    expect(t20.enabledSizes).toEqual(["portrait"]);
    expect(t20.activeSize).toBe("portrait");
  });
});

describe("the share window's Layout menu (round 9 B11)", () => {
  it("drops a design pack's Square and Landscape rows, keeps Portrait, Story and BYO layouts", () => {
    const pack = (packVariant: string) => ({ source: "pack" as const, packVariant });
    expect(isOlderPackVariant(pack("square"))).toBe(true);
    expect(isOlderPackVariant(pack("landscape"))).toBe(true);
    expect(isOlderPackVariant(pack("portrait"))).toBe(false);
    expect(isOlderPackVariant(pack("story"))).toBe(false);
    // A club's own layout is never a pack size row.
    expect(isOlderPackVariant({ source: "layers", packVariant: null })).toBe(false);
    expect(isOlderPackVariant({ source: "background", packVariant: "square" })).toBe(false);
  });
});
