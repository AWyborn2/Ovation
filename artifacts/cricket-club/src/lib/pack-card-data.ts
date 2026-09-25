/**
 * Shared `PackCardData` builder (U1).
 *
 * Every surface that mounts a pack card — the share-card modal, the Studio
 * composer, the Studio card-type gallery, and the carousel slide filmstrip —
 * must hand `renderPackCard` the SAME shape of tenant data. Before this module
 * each call site hand-rolled its own object, and they drifted: the composer and
 * the gallery passed nothing at all (so the Broadcast-Dark sample literals
 * "HALLS HEAD" / "#HALLSHEAD" / "eSA Sport" rendered for every tenant), and the
 * carousel narrowed `brand` to `{ name, logoUrl }` (so slides silently lost the
 * tenant's accent colour and tagline).
 *
 * Funnelling construction through one function makes that class of omission
 * impossible: a new call site gets every field or none.
 *
 * This is a plain function, not a hook, so the server still-render harness and
 * the unit tests can call it without React.
 */

import type { PackCardData, PackColourMode } from "./pack-render";
import {
  sponsorAppliesToKind,
  type CardKind,
  type PhotoPlacement,
  type PhotoTransform,
} from "./share-card";

/**
 * Structural brand shape accepted by the builder.
 *
 * Deliberately loose so both the resolved `ClubBrand` (from `useBrand()`) and
 * `SocialSettingsBundle["brand"]` satisfy it without a cast at the call site.
 */
export interface PackBrandSource {
  name?: string | null;
  tagline?: string | null;
  logoUrl?: string | null;
  primaryColour?: string | null;
  backgroundColour?: string | null;
  juniorsColour?: string | null;
}

export interface BuildPackDataOptions {
  /** Tenant brand → clubLogo slot, clubName/clubTagline values, default tokens. */
  brand?: PackBrandSource | null;
  /** Pre-resolved club hashtag. Absent/empty renders no hashtag — never another club's. */
  hashtag?: string | null;
  /** Kind-filtered active sponsors; the first three logos fill sponsor1..3. */
  sponsors?: Array<{ name: string; logoUrl: string }> | null;
  /** Designated presenting sponsor NAME → the "presented by <sponsor>" line. */
  presentingSponsorName?: string | null;
  /** Uploaded / gallery-selected photo, overriding the input's own photoUrl. */
  photoUrl?: string | null;
  /** Focal point + zoom; only the focal point is applied in the pack path. */
  photoTransform?: PhotoTransform | null;
  /**
   * The canvas renderer's placement vocabulary ("feature" | "headshot"), mapped
   * onto the pack's own ("fullBleed" | "contained") below. Absent → contained,
   * which is behaviourally identical to omitting the field entirely.
   */
  photoPlacement?: PhotoPlacement | null;
  /** Admin per-slot image overrides (B1). Only forwarded when non-empty. */
  imageOverrides?: Record<string, string> | null;
  /**
   * The club's per-pack colour modes (`settings.packColourModes`). Absent →
   * every pack in "Club colours". Pass it from the settings bundle on EVERY
   * surface so previews, the editor and server renders agree.
   */
  packColourModes?: Record<string, string> | null;
  /** Per-card style-panel overrides (share modal). Only forwarded when set. */
  tokenOverride?: PackCardData["tokenOverride"];
}

/**
 * Build the complete per-render tenant payload for `renderPackCard`.
 *
 * Field semantics are the renderer's (see `PackCardData` in `pack-render.ts`);
 * this function only assembles them from already-resolved inputs.
 */
export function buildPackData(options: BuildPackDataOptions = {}): PackCardData {
  const {
    brand,
    hashtag,
    sponsors,
    presentingSponsorName,
    photoUrl,
    photoTransform,
    photoPlacement,
    imageOverrides,
    packColourModes,
    tokenOverride,
  } = options;
  const modes = packModesFrom(packColourModes);
  const override = tokenOverride
    ? Object.fromEntries(Object.entries(tokenOverride).filter(([, v]) => Boolean(v)))
    : null;

  return {
    brand: brand
      ? {
          name: brand.name,
          // Club tagline (A9) → the pack header sub-line; empty when unset.
          tagline: brand.tagline,
          logoUrl: brand.logoUrl,
          // Colours seed the pack's DEFAULT token palette via
          // `brandDefaultTokens`: primary → accent always; background → panel
          // and deep stage in "Club colours", juniors → panel in "Pack's own look".
          primaryColour: brand.primaryColour,
          backgroundColour: brand.backgroundColour,
          juniorsColour: brand.juniorsColour,
        }
      : null,
    hashtag,
    sponsors,
    presentingSponsorName,
    photoUrl,
    photoTransform,
    // On a pack card, "feature" promotes the photo to a full-bleed action shot;
    // "headshot" (and absent) keeps it contained in the template's framed region.
    photoPlacement: photoPlacement === "feature" ? "fullBleed" : "contained",
    // Only sent when non-empty so a no-override render stays byte-identical to
    // one built before per-slot overrides existed.
    imagesOverride:
      imageOverrides && Object.keys(imageOverrides).length ? imageOverrides : undefined,
    // Only the packs a club switched to "Pack's own look" need a key; absent =
    // "Club colours" everywhere.
    ...(modes ? { packColourModes: modes } : {}),
    ...(override && Object.keys(override).length ? { tokenOverride: override } : {}),
  };
}

/**
 * Narrow a stored mode map (the API types it as plain strings) to the
 * renderer's vocabulary: only `"pack"` entries matter, since absent already
 * means `"club"`. Null when no pack is on its own look.
 */
function packModesFrom(
  raw: Record<string, string> | null | undefined,
): Record<string, PackColourMode> | null {
  if (!raw) return null;
  const out: Record<string, PackColourMode> = {};
  for (const [packId, mode] of Object.entries(raw)) if (mode === "pack") out[packId] = "pack";
  return Object.keys(out).length ? out : null;
}

// ---------------------------------------------------------------------------
// Bundle resolution helpers
// ---------------------------------------------------------------------------
//
// The three inputs above that are derived (rather than passed straight through)
// were each re-derived at every call site. Same drift risk as the payload
// itself, so they live here too. Structurally typed so `SocialSettingsBundle`
// satisfies them without this module depending on the generated API client.

/**
 * A club name shortened for card COPY: "Mandurah Cricket Club" → "Mandurah".
 * Sample content reads as prose ("Mandurah won by 5 wickets"), where the full
 * legal name is noise. Falls back to the input when stripping would empty it.
 */
export function shortClubName(name: string): string {
  return name.replace(/\s+Cricket Club$/i, "").trim() || name;
}

export interface PackSettingsSource {
  settings?: { clubHashtag?: string | null } | null;
  brand?: { shortName?: string | null } | null;
  activeSponsors?: Array<{
    name: string;
    logoUrl: string;
    cardKinds?: string[] | null;
    isPresenting?: boolean | null;
  }> | null;
}

/**
 * The tenant's club hashtag: its configured value, else one derived from its
 * short name, else empty. Never another club's — a brand-less tenant gets "".
 */
export function tenantHashtag(bundle?: PackSettingsSource | null): string {
  return (
    bundle?.settings?.clubHashtag ??
    (bundle?.brand?.shortName ? `#${bundle.brand.shortName.replace(/\s+/g, "")}` : "")
  );
}

/** Active sponsors that apply to `kind`. Empty when the sponsor strip is off. */
export function kindSponsors(
  bundle: PackSettingsSource | null | undefined,
  kind: CardKind,
  enabled: boolean,
): Array<{ name: string; logoUrl: string }> {
  if (!enabled || !bundle?.activeSponsors) return [];
  return bundle.activeSponsors
    .filter((sp) => sponsorAppliesToKind(sp.cardKinds, kind))
    .map((sp) => ({ name: sp.name, logoUrl: sp.logoUrl }));
}

/**
 * The club's designated headline sponsor NAME → the "presented by" line. Not
 * kind-filtered. Null when sponsors are off, so the line drops entirely rather
 * than leaving orphan "presented by" prose.
 */
export function presentingSponsorName(
  bundle: PackSettingsSource | null | undefined,
  enabled: boolean,
): string | null {
  if (!enabled) return null;
  return bundle?.activeSponsors?.find((sp) => sp.isPresenting)?.name ?? null;
}
