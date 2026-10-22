/** Neon Night's polish (L4-C): the shared polish (`shared.ts`). */
import type { LookPolish } from "./index";
import { SKELETON_GRID, sharedPolish } from "./shared";

export const neonNight: LookPolish = {
  description: "A night-sky gradient with glowing type and neon pill badges.",
  displayOrder: 6,
  halfDays: 1,
  apply(doc, kind) {
    return sharedPolish(doc, kind, {
      sponsorGrid: SKELETON_GRID,
      gapPx: 15,
      chipFill: "var(--gold)",
    });
  },
};
