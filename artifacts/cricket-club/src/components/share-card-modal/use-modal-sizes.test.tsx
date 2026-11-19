import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import type { CardSize } from "@/lib/share-card";
import { useModalSizes } from "./use-modal-sizes";

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
});
