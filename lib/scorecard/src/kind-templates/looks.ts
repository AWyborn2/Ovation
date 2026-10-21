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
