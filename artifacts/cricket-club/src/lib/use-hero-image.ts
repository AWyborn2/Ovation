import { useBrand } from "@/lib/brand-context";

/** Top-level Broadcast hero slots. */
export type HeroSlot = "home" | "juniors" | "honours";
/** Explore-the-club photo card slots. */
export type ExploreSlot = "honours" | "players" | "premierships";

/**
 * The tenant's uploaded hero photo for `slot`, or null when none is set — the
 * caller then renders the brand-colour gradient, never another club's photo.
 */
export function useHeroImage(slot: HeroSlot): string | null {
  return useBrand().heroImages?.[slot] || null;
}

/** The tenant's explore-card photo for `slot`, or null when none is set. */
export function useExploreImage(slot: ExploreSlot): string | null {
  return useBrand().heroImages?.explore?.[slot] || null;
}
