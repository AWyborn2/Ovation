/**
 * Pack renderer — public contracts (tokens, tenant data, image slots) plus the
 * internal shapes shared by the bind and html stages.
 */

// ---------------------------------------------------------------------------
// Public token contract
// ---------------------------------------------------------------------------

export interface PackTokens {
  /** Brand accent → `--gold`. */
  accent: string;
  /** Panel colour → `--panel` (junior forces brown `#42342B`). */
  panel: string;
  /** Deep background → `--ink`. */
  ink: string;
  /** Body text colour. */
  textLight: string;
  /** Display font key → `--disp` family. */
  displayFont?: string;
}

/** The junior brown panel, forced regardless of theme (KTD6 / replit.md). */
export const JUNIOR_PANEL = "#42342B";

/**
 * Placement of the player hero photo on a pack card. Mirrors the canvas
 * renderer's feature-vs-headshot concept (`PhotoPlacement` in `share-card.ts`):
 *
 *   - `"contained"` (default) — the photo stays in the template's own framed
 *     region (e.g. the right-hand column of Player Spotlight), object-fit:cover.
 *     Existing cards render byte-identical to before.
 *   - `"fullBleed"` — the photo's wrapper is promoted to cover the whole card
 *     (`position:absolute;inset:0`) so an action shot fills the frame edge to
 *     edge, sitting BEHIND the template's existing scrim/gradient layers and the
 *     text (DOM order is preserved, so legibility scrims still overlay it).
 *
 * Only the player hero slot (`data-slot="photo"`) is affected — the match-result
 * and every logo/sponsor slot are untouched.
 */
export type PackPhotoPlacement = "contained" | "fullBleed";

// ---------------------------------------------------------------------------
// Tenant data contract
// ---------------------------------------------------------------------------

/**
 * Per-render tenant data threaded into the pack path alongside the theme tokens.
 *
 * The canvas (BYO) renderer already receives brand / sponsors / uploaded photo
 * via `RenderOptions`; the pack renderer historically saw only the bound
 * `ShareCardInput`, so tenant logo / name / hashtags / sponsors / uploaded photo
 * never reached pack cards and they fell back to the Broadcast-Dark sample
 * literals ("HALLS HEAD", "#HALLSHEAD", empty sponsor placeholders). This object
 * carries exactly those values so pack cards render with real tenant data. Every
 * field is optional — when absent the template sample defaults still apply, so
 * gallery previews and brand-less tenants are unaffected.
 */
export interface PackCardData {
  /**
   * Tenant brand → top-left `clubLogo` slot + `clubName` header value, and the
   * DEFAULT pack token palette (see {@link brandDefaultTokens}). The colour
   * fields mirror the resolved `ClubBrand`: `primaryColour` seeds the accent and
   * `juniorsColour` seeds the panel. `backgroundColour` is carried for
   * completeness but intentionally NOT mapped onto the fixed deep-ink stage
   * (see {@link brandDefaultTokens} for why).
   */
  brand?: {
    name?: string | null;
    /** Short club tagline → the `clubTagline` header sub-line. Empty when unset. */
    tagline?: string | null;
    logoUrl?: string | null;
    primaryColour?: string | null;
    backgroundColour?: string | null;
    juniorsColour?: string | null;
  } | null;
  /** Pre-resolved club hashtag (e.g. "#HALLSHEAD") → `clubHashtag` / `hashtags`. */
  hashtag?: string | null;
  /**
   * Active sponsors for this card kind (already kind-filtered upstream by
   * `sponsorAppliesToKind`); the first three `logoUrl`s fill `sponsor1..3`.
   */
  sponsors?: Array<{ name: string; logoUrl: string }> | null;
  /**
   * The tenant's designated presenting (primary) sponsor NAME → the pack cards'
   * "presented by <sponsor>" line (`sponsorPresentedBy` value). NOT kind-filtered
   * — it is the club's headline sponsor, shown on every card's presented-by line.
   * Null/absent clears the line entirely (see {@link applyPackData}) so the
   * Broadcast-Dark sample literal ("eSA Sport" / "PlayHQ") never leaks.
   */
  presentingSponsorName?: string | null;
  /**
   * Uploaded / gallery-selected photo. Overrides the input's own `photoUrl` in
   * the `photo` slot.
   */
  photoUrl?: string | null;
  /** Focal point + zoom for the photo. Only the focal point is applied (as
   * `object-position`) in the pack path; see {@link resolveSlots}. */
  photoTransform?: { focalX: number; focalY: number; zoom: number } | null;
  /**
   * How the player hero photo is placed (see {@link PackPhotoPlacement}).
   * Absent / `"contained"` keeps the template's framed placement (default,
   * unchanged); `"fullBleed"` promotes the photo to a full-card action shot.
   * Only the `photo` slot honours this; logos and sponsors ignore it.
   */
  photoPlacement?: PackPhotoPlacement | null;
  /**
   * Generic per-slot image overrides (B1), keyed by render slot key
   * (`clubLogo`, `photo`, `club.logo`, `opposition.logo`,
   * `teamPhoto`, `squadPhoto`, `sponsor1..3`, …). An admin-supplied image for
   * ANY slot a template exposes wins over both the bound input image and the
   * brand / sponsor / uploaded-photo overlays above — i.e. resolution is
   * `override > input > bind` (see {@link applyPackData}). This is the generic
   * mechanism the descriptor `image` fields stop short of: those cover only the
   * input-driven slots (player photo / opposition logo / team & squad photo),
   * whereas this map lets an admin repoint any slot (a logo, a sponsor tile, the
   * team or squad photo, …). Absent / empty leaves every slot on its
   * bound or overlaid value, so existing renders are byte-identical.
   */
  imagesOverride?: Record<string, string> | null;
}

/** An image slot (photo/logo) a pack template exposes, for the per-slot editor. */
export interface PackImageSlot {
  key: string;
  label: string;
  type: "photo" | "logo";
}

// ---------------------------------------------------------------------------
// Internal shapes shared between bind / html-utils / render
// ---------------------------------------------------------------------------

export interface PackRow {
  /** Row-template variant to use (`data-repeat-variant="…"`), if any. */
  variant?: string;
  values: Record<string, string>;
}

export interface BoundInput {
  values: Record<string, string>;
  images: Record<string, string>;
  rows: Record<string, PackRow[]>;
}
