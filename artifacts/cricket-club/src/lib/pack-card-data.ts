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

import type { PackCardData } from "./pack-render";
import type { PhotoPlacement, PhotoTransform } from "./share-card";

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
  } = options;

  return {
    brand: brand
      ? {
          name: brand.name,
          // Club tagline (A9) → the pack header sub-line; empty when unset.
          tagline: brand.tagline,
          logoUrl: brand.logoUrl,
          // Colours seed the pack's DEFAULT token palette (primary → accent,
          // juniors → panel) via `brandDefaultTokens`; background is carried but
          // not mapped onto the fixed deep-ink stage.
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
  };
}
