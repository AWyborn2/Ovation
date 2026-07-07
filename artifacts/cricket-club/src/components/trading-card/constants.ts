import { DEFAULT_BRAND, type ClubBrand } from "@workspace/scorecard";
import { useBrand } from "@/lib/brand-context";

/**
 * The current tenant's brand, resolved for card rendering (colours + logo),
 * with the neutral default filling any gap. Replaces the old static
 * Halls-Head-only `logoUrl`/`CHARCOAL`/`GOLD`/`BROWN` exports so cards render
 * on-brand for every tenant instead of always showing Halls Head's.
 */
export function useCardBrand() {
  const brand = useBrand();
  return {
    brand,
    logoUrl: brand.logoUrl ?? DEFAULT_BRAND.logoUrl ?? "",
    CHARCOAL: brand.primaryColour ?? DEFAULT_BRAND.primaryColour ?? "#334155",
    GOLD: brand.secondaryColour ?? DEFAULT_BRAND.secondaryColour ?? "#94A3B8",
    BROWN: brand.tertiaryColour ?? DEFAULT_BRAND.tertiaryColour ?? "#475569",
  };
}

/**
 * A club's name without a trailing "Cricket Club" (Halls Head Cricket Club ->
 * Halls Head), so the card header/copy can show a short label without also
 * duplicating the static "Cricket Club" tagline printed beside it.
 */
export function clubShortLabel(brand: ClubBrand): string {
  const trimmed = (brand.name ?? "").replace(/\s+Cricket Club$/i, "").trim();
  return trimmed || brand.name;
}

export const CARD_W = 384;
export const CARD_H = 800;

export const FONT = "'IBM Plex Sans', sans-serif";

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
