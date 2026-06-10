import { HALLS_HEAD_BRAND } from "@workspace/scorecard";

// Official club brand (clubs id 2), via the shared single source of truth.
export const logoUrl = HALLS_HEAD_BRAND.logoUrl ?? "";
export const CHARCOAL = HALLS_HEAD_BRAND.primaryColour ?? "#333F48";
export const GOLD = HALLS_HEAD_BRAND.secondaryColour ?? "#FBAC27";
export const BROWN = HALLS_HEAD_BRAND.tertiaryColour ?? "#42342B";

export const CARD_W = 384;
export const CARD_H = 800;

export const FONT = "'Montserrat', sans-serif";

export type Phase =
  | "intro"
  | "careerStats"
  | "batting"
  | "bowling"
  | "fielding"
  | "premierships"
  | "awards"
  | "outro";

export const fmt = (v: number | string): string =>
  typeof v === "number" ? v.toLocaleString("en-AU") : v;

// Persistent photo height in the animation. The header, photo and name stay
// fixed across EVERY phase; only the lower content region (PhaseContent) swaps,
// so the player's photo reads as a static portrait while the stats cycle under it.
export const PHASE_PHOTO_H = 290;
// Header (~70) + photo + name block (~56) + footer (~44) leaves this for content.
export const PHASE_CONTENT_H = CARD_H - 70 - PHASE_PHOTO_H - 56 - 44;
