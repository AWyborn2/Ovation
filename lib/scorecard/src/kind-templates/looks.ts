/**
 * Which library look a club's design pack maps to (ADR-011 §6, T3.14).
 *
 * Used only to seed a club's lazy default template for a kind: the club's
 * current pack picks the look, and the look's template for the kind becomes
 * the default copy. It replaces `PACK_TO_STARTER`.
 *
 * - Club Kit and Broadcast Dark map to their converted looks.
 * - Duotone maps to its look for the three kinds it designs; its other kinds
 *   take Club Kit's.
 * - The hidden legacy packs, an unknown id or no pack map to Club Kit.
 *
 * Look slugs are the folder names under `lib/template-bundles/`.
 */
import { templateKindFor } from "./pages";
import { LEGACY_PACK_IDS } from "../pack-ids";

export const CLUB_KIT_LOOK = "club-kit";

export const PACK_TO_LOOK: Readonly<Record<string, string>> = {
  "club-kit-v1": CLUB_KIT_LOOK,
  "broadcast-dark-v1": "broadcast-dark",
  "duotone-v1": "duotone",
};

/** The kinds Duotone designs; its other kinds fall back to Club Kit. */
const DUOTONE_KINDS = new Set(["matchDay", "matchSummary", "teamList"]);

/** The look a club on `packId` takes its default `kind` template from. */
export function lookForPack(packId: string | null | undefined, kind: string): string {
  const look = (packId && PACK_TO_LOOK[packId]) || CLUB_KIT_LOOK;
  if (look === "duotone" && !DUOTONE_KINDS.has(templateKindFor(kind))) return CLUB_KIT_LOOK;
  return look;
}

/** The bundle slug of a look's template for a kind (`<look>/<kind>`). */
export function lookTemplateSlug(look: string, kind: string): string {
  return `${look}/${templateKindFor(kind)}`;
}

/**
 * The starter look (the original layer starters, exported as bundles in L4-B)
 * a pack falls back to while its converted look isn't in the library: the
 * dark-ground packs to Broadcast Classic, the rest to Club Kit Classic.
 */
const PACK_TO_STARTER_LOOK: Readonly<Record<string, string>> = {
  "club-kit-v1": "club-kit-classic",
  "broadcast-dark-v1": "broadcast-classic",
  "gold-foil-v1": "broadcast-classic",
  "neon-night-v1": "broadcast-classic",
  "bold-type-v1": "club-kit-classic",
  "sunset-v1": "club-kit-classic",
};

export function starterLookForPack(packId: string | null | undefined): string {
  return (packId && PACK_TO_STARTER_LOOK[packId]) || "club-kit-classic";
}

/** Whether a pack id is one of the retired (hidden legacy) packs (R19). */
export function isRetiredPack(packId: string | null | undefined): boolean {
  return !!packId && (LEGACY_PACK_IDS as readonly string[]).includes(packId);
}

/**
 * Where a club's lazy default for `kind` is copied from, best first: its
 * pack's look, Club Kit's look, then its pack's starter look.
 */
export function lazyDefaultSlugs(packId: string | null | undefined, kind: string): string[] {
  return [
    ...new Set([
      lookTemplateSlug(lookForPack(packId, kind), kind),
      lookTemplateSlug(CLUB_KIT_LOOK, kind),
      lookTemplateSlug(starterLookForPack(packId), kind),
    ]),
  ];
}
