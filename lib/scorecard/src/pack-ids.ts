// The built-in design pack ids, kept in a leaf module so `pack-resolve` and the
// kind template starters can read them without an import cycle through
// `queued-carousel` (which re-exports everything here).

/** Built-in identities only; never uploaded backgrounds or layer templates. */
export const CAROUSEL_PACK_IDS = [
  "broadcast-dark-v1",
  "gold-foil-v1",
  "bold-type-v1",
  "neon-night-v1",
  "sunset-v1",
  "club-kit-v1",
  "duotone-v1",
] as const;
export const LEGACY_CAROUSEL_PACK_ID = "club-kit-v1";

/**
 * Packs hidden from every picker, listing and resolver (match-day carousel
 * content P9, decision of 21 Oct 2026). Their template code stays in the repo:
 * the planned social template library (Canva-style) will convert them and
 * bring them back from this one list. Until then a saved choice of one renders
 * as Club Kit.
 */
export const LEGACY_PACK_IDS = [
  "gold-foil-v1",
  "bold-type-v1",
  "neon-night-v1",
  "sunset-v1",
] as const;

/** Where a hidden or unknown pack's saved choice lands. */
export const FALLBACK_PACK_ID = "club-kit-v1";

/** The built-in packs a club can choose today, in catalogue order. */
export const ACTIVE_PACK_IDS: readonly string[] = CAROUSEL_PACK_IDS.filter(
  (id) => !isLegacyPackId(id),
);

/** Whether `id` names one of the hidden legacy packs. */
export function isLegacyPackId(id: unknown): boolean {
  return typeof id === "string" && (LEGACY_PACK_IDS as readonly string[]).includes(id);
}

/**
 * The pack a saved pack id renders with. Every pack choice is read through
 * this: a legacy pack (`LEGACY_PACK_IDS`) or an unknown id renders as Club Kit,
 * so a stored row never errors or draws a blank card. No choice (null or
 * undefined) passes through to the caller's own default, and so does `"blank"`,
 * the card kind template canvas, which is not a pack.
 */
export function resolveActivePackId<T extends string | null | undefined>(
  id: T,
): T extends string ? string : T {
  if (typeof id !== "string" || id === "blank" || ACTIVE_PACK_IDS.includes(id))
    return id as T extends string ? string : T;
  return FALLBACK_PACK_ID as T extends string ? string : T;
}
export function isCarouselPackId(value: unknown): value is (typeof CAROUSEL_PACK_IDS)[number] {
  return typeof value === "string" && (CAROUSEL_PACK_IDS as readonly string[]).includes(value);
}
