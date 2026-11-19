/**
 * A draft's saved design size (portrait and story sizes plan, Stage 2,
 * migration 0081): the size the admin designs the card at, so the editor
 * reopens there (round 7: Format wasn't saved). It never changes what renders.
 *
 * Square and Landscape are older sizes. A draft may save one only when it
 * already has it saved, or when its design already has layers on it (every
 * stored design does), so an older card stays editable at its own size while a
 * Portrait and Story design can't be grown back into a retired one. The
 * design's sizes are Stage 1's `designSizes`, read from its document.
 */
import type { DraftDesignSize } from "@workspace/db";
import { designSizes, type DraftDesign } from "./draft-render";

/** The sizes no longer offered for new designs (D1); stored designs keep them. */
export const OLDER_DESIGN_SIZES: readonly DraftDesignSize[] = ["square", "landscape"];

const SIZE_LABEL: Record<DraftDesignSize, string> = {
  square: "Square",
  portrait: "Portrait",
  story: "Story",
  landscape: "Landscape",
};

/**
 * Why `size` can't be saved on a draft with `design` (null when it can).
 * Portrait and Story always can. An older size can when the draft already has
 * it saved (`saved`), or when the design has layers on it.
 */
export function designSizeRefusal(
  design: DraftDesign,
  size: DraftDesignSize,
  saved: DraftDesignSize | null = null,
): string | null {
  if (!OLDER_DESIGN_SIZES.includes(size) || size === saved) return null;
  if (designSizes(design).includes(size)) return null;
  return `${SIZE_LABEL[size]} is an older size this design doesn't have. Design it at Portrait or Story.`;
}
