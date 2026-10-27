/**
 * Pack renderer — public contracts (tokens, tenant data, image slots) plus the
 * internal shapes shared by the bind and html stages.
 */

import type { CardNames } from "@workspace/scorecard/card-names";
import type { PhotoFocus } from "@workspace/scorecard/photo-focus";
import type { LayerPhotos } from "@workspace/scorecard/kind-templates";

// ---------------------------------------------------------------------------
// Public token contract
// ---------------------------------------------------------------------------

export interface PackTokens {
  /** Brand accent → `--gold`. */
  accent: string;
  /** Panel colour → `--panel`. */
  panel: string;
  /** Deep background → `--ink`. */
  ink: string;
  /** Body text colour. */
  textLight: string;
  /** Display font key → `--disp` family. */
  displayFont?: string;
}

/**
 * How a design pack is coloured for a club (stored per club, per pack):
 *
 *   - `"club"` — "Club colours" (the default): the club's background becomes
 *     the stage and panel and its primary the accent, beating the card theme's
 *     colours; tinted packs lean mostly to the club.
 *   - `"pack"` — "Pack's own look": the pack renders exactly as it did before
 *     the switch existed (theme > brand, the pack's own tint and sky).
 */
export type PackColourMode = "club" | "pack";

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
   * The template editor only: sample text for any field the card has no value
   * for, so a data block from another kind (a match scoreboard on a team list)
   * shows how it reads while designing. Never set on a real card.
   */
  sampleValues?: Record<string, string> | null;
  /**
   * The club's short names, labels and crests for teams and competitions
   * (ADR-010 P1). Every team name a card binds resolves through it, then the
   * automatic short name. Absent → automatic names only.
   */
  names?: CardNames | null;
  /**
   * Tenant brand → top-left `clubLogo` slot + `clubName` header value, and the
   * DEFAULT pack token palette (see {@link brandDefaultTokens}). The colour
   * fields mirror the resolved `ClubBrand`: `primaryColour` seeds the accent;
   * in "club colours" mode `backgroundColour` seeds the panel and the deep
   * stage, in "pack's own look" mode `juniorsColour` seeds the panel.
   */
  brand?: {
    name?: string | null;
    /** Short club tagline → the `clubTagline` header sub-line. Empty when unset. */
    tagline?: string | null;
    logoUrl?: string | null;
    /** The club's ground photo for card backgrounds (`{{groundPhoto}}` in templates). */
    groundPhotoUrl?: string | null;
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
   * The card's player's own sponsors (player sponsors), in order: the
   * `{{playerSponsorName}}` / `{{playerSponsorLogo}}` fields and the second
   * pair. Empty (or absent) when the card isn't about a sponsored player.
   */
  playerSponsors?: Array<{ name: string; logoUrl: string }> | null;
  /**
   * Uploaded / gallery-selected photo. Overrides the input's own `photoUrl` in
   * the `photo` slot.
   */
  photoUrl?: string | null;
  /** Focal point + zoom for the photo. Only the focal point is applied (as
   * `object-position`) in the pack path; see {@link resolveSlots}. */
  photoTransform?: { focalX: number; focalY: number; zoom: number } | null;
  /**
   * The photo's focus box and size (photo focus areas, the draft's
   * `photoFocus`): a template's photo frame crops to it while the sliders are
   * untouched. Applies to `photoUrl` only.
   */
  photoFocus?: PhotoFocus | null;
  /**
   * Sourced photo layers' own photos (photo layer sources, a draft's
   * `layerPhotos`), by layer key. Template photo layers only; a layer without
   * an entry shows `photoUrl`. Never applied to a junior card.
   */
  layerPhotos?: LayerPhotos | null;
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
  /**
   * The club's colour mode per pack id (`social_settings.pack_colour_modes`).
   * A pack absent from the map — or the whole map absent — is `"club"`. Carried
   * on the data (rather than resolved per call site) so the pack chosen at
   * render time picks its own mode on every surface, the server harness
   * included. See {@link packColourModeFor}.
   */
  packColourModes?: Record<string, PackColourMode> | null;
  /**
   * Explicit per-card token overrides (the share modal's style panel). They
   * win over every source but the junior panel in BOTH colour modes. Callers
   * also fold them into the theme for older consumers; carrying them here is
   * what keeps them on top when club colours outrank the theme.
   */
  tokenOverride?: {
    accent?: string | null;
    panel?: string | null;
    displayFont?: string | null;
  } | null;
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
