/**
 * Bold Type's polish (L4-C): the shared polish (`shared.ts`). Its sponsors
 * grid sits higher on the tall sizes, its result chips are white with accent
 * text, and its photo, which bleeds off the card, is kept on it.
 */
import type { LookPolish } from "./index";
import { clampPhotoToArtboard } from "./helpers";
import { SKELETON_GRID, sharedPolish } from "./shared";

export const boldType: LookPolish = {
  description: "Huge type on a block of club colour, outlined numbers and a slanted photo panel.",
  displayOrder: 5,
  halfDays: 2,
  apply(doc, kind) {
    const notes = clampPhotoToArtboard(doc);
    return [
      ...notes,
      ...sharedPolish(doc, kind, {
        sponsorGrid: {
          ...SKELETON_GRID,
          portrait: { x: 13.04, y: 24.78, w: 73.91, h: 30.49 },
          story: { x: 13.04, y: 17.42, w: 73.91, h: 21.44 },
        },
        gapPx: 15,
        chipFill: "var(--accent-ink)",
      }),
    ];
  },
};
