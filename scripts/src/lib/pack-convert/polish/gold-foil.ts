/**
 * Gold Foil's polish (L4-C, P1–P5): what the converter can't carry over.
 *
 * - The pack's diagonal stripes (a repeating gradient at 135°, the accent at
 *   8 %) on every page, as a vector per size.
 * - The shared polish (`shared.ts`): the uniform sponsors grid, Weekend
 *   Wrap's result chips, left-aligned grade cells and the grade on Match Day's
 *   round line.
 */
import type { LookPolish } from "./index";
import { addStripes } from "./helpers";
import { SKELETON_GRID, sharedPolish } from "./shared";

export const goldFoil: LookPolish = {
  description: "Deep navy and foil: metallic numbers, a fine double frame and diagonal sheen.",
  displayOrder: 4,
  halfDays: 4,
  apply(doc, kind) {
    return [
      ...addStripes(doc, {
        period: 17.28,
        width: 2.7,
        colour: "var(--gold)",
        opacity: 0.08,
        // The pack draws its landscape at 630 / 1080 of the square's scale.
        scaleOf: (size) => (size === "landscape" ? 630 / 1080 : 1),
      }),
      ...sharedPolish(doc, kind, {
        sponsorGrid: SKELETON_GRID,
        gapPx: 15,
        chipFill: "var(--gold)",
      }),
    ];
  },
};
