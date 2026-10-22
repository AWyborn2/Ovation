/** Sunset's polish (L4-C): the shared polish (`shared.ts`), with Sunset's own sponsors grid. */
import type { LookPolish } from "./index";
import { sharedPolish } from "./shared";

export const sunset: LookPolish = {
  description: "A warm sunset sky, a frosted glass panel and a handwritten flourish.",
  displayOrder: 7,
  halfDays: 1,
  apply(doc, kind) {
    return sharedPolish(doc, kind, {
      sponsorGrid: {
        square: { x: 19.4, y: 36.27, w: 45.36, h: 23.38 },
        portrait: { x: 14.63, y: 42.86, w: 54.9, h: 22.64 },
        story: { x: 14.63, y: 59.82, w: 54.9, h: 15.92 },
        landscape: { x: 31.67, y: 43.64, w: 19.79, h: 14.02 },
      },
      gapPx: 12,
      chipFill: "var(--gold)",
    });
  },
};
