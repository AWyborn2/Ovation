/**
 * Pack renderer (U3).
 *
 * Binds a `ShareCardInput` into a Pack A ("Broadcast Dark") template and
 * produces a self-contained, native-size HTML card string. The output is a
 * single positioned root element carrying the theme tokens as CSS custom
 * properties; `PackCard` mounts it scaled via `transform: scale()` and the
 * server-side still/PNG harness (U4) mounts it unscaled.
 *
 * The renderer is DOM-free and pure — safe to run in the browser preview and in
 * the headless render page alike. It never trusts input text: every substituted
 * value is HTML-escaped (security invariant — do not remove).
 */

import { getPackManifest } from "./pack-templates/registry";
import type {
  PackCardTemplate,
  PackDesignEntry,
  PackTemplateFormats,
  PackTemplateField,
} from "./pack-templates/types";
import type {
  ShareCardInput,
  CardSize,
  MatchSummaryInnings,
  TeamListPlayer,
  WeekendWrapMatch,
  LadderRow,
  ClubLeaderboardLeader,
} from "./share-card";

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

/**
 * Slot keys the generic per-slot override PANEL hides — the tenant-branding
 * "moat" (the header club logo + the sponsor tiles). Admins shouldn't repoint
 * these per-card from a generic editor; they are club-wide branding. Only the UI
 * list is filtered — the {@link PackCardData.imagesOverride} MECHANISM stays
 * fully general, so any key (including these) still wins if set programmatically.
 */
export const PACK_OVERRIDE_HIDDEN_SLOTS: ReadonlySet<string> = new Set([
  "clubLogo",
  "sponsor1",
  "sponsor2",
  "sponsor3",
]);

/**
 * Friendly, disambiguated display labels per slot key. The raw template labels
 * are non-unique — match-result exposes two "Logo" fields (`club.logo`,
 * `opposition.logo`) and three "Sponsor" fields (`sponsor1..3`) — so the panel
 * would show indistinguishable rows. Unmapped keys fall back to the template
 * label.
 */
const PACK_SLOT_LABELS: Record<string, string> = {
  clubLogo: "Club logo",
  "club.logo": "Club logo",
  "opposition.logo": "Opposition logo",
  photo: "Photo",
  teamPhoto: "Team photo",
  squadPhoto: "Squad photo",
  sponsor1: "Sponsor 1",
  sponsor2: "Sponsor 2",
  sponsor3: "Sponsor 3",
};

/**
 * The image slots (photo/logo) a card kind's pack template exposes, each with a
 * friendly, unique display label — the enumeration that drives the modal's
 * generic per-slot image-override editor (B1). Text and repeat fields are
 * skipped; an unsupported kind (no pack design) yields `[]`.
 *
 * By default the tenant-branding slots ({@link PACK_OVERRIDE_HIDDEN_SLOTS}) are
 * filtered out so the panel surfaces only content slots (player photo,
 * opposition logo, team / squad photo, …). Pass
 * `includeHidden: true` for the raw enumerator (every image slot). The override
 * mechanism itself is unaffected — it can target any key regardless of this
 * filter.
 */
export function packImageSlots(
  input: ShareCardInput,
  opts?: { includeHidden?: boolean; packId?: string | null },
): PackImageSlot[] {
  const template = resolveTemplate(input, opts?.packId);
  if (!template) return [];
  return template.fields
    .filter((f) => f.type === "photo" || f.type === "logo")
    .filter((f) => opts?.includeHidden || !PACK_OVERRIDE_HIDDEN_SLOTS.has(f.key))
    .map((f) => ({
      key: f.key,
      label: PACK_SLOT_LABELS[f.key] ?? f.label,
      type: f.type as "photo" | "logo",
    }));
}

// ---------------------------------------------------------------------------
// Token resolution (junior force > per-card override > theme > brand default)
// ---------------------------------------------------------------------------

/** A `card_themes` row (or any theme-shaped object) as the renderer reads it. */
export interface CardThemeLike {
  accent?: string | null;
  bgPanel?: string | null;
  bgDark?: string | null;
  textLight?: string | null;
  displayFont?: string | null;
}

/**
 * Map a `card_themes`-shaped object onto the pack token keys, dropping any
 * null/empty field so it never clobbers a lower-priority source during merge.
 * (`bgPanel`→`panel`, `bgDark`→`ink`, `accent`→`accent`, `textLight`→`textLight`,
 * `displayFont`→`displayFont`.)
 */
export function tokensFromCardTheme(
  theme: CardThemeLike | null | undefined,
): Partial<PackTokens> {
  const out: Partial<PackTokens> = {};
  if (!theme) return out;
  if (theme.accent) out.accent = theme.accent;
  if (theme.bgPanel) out.panel = theme.bgPanel;
  if (theme.bgDark) out.ink = theme.bgDark;
  if (theme.textLight) out.textLight = theme.textLight;
  if (theme.displayFont) out.displayFont = theme.displayFont;
  return out;
}

/** Sources feeding {@link resolvePackTokens}, lowest priority first. */
export interface PackTokenSources {
  /** Tenant brand default — the complete baseline (lowest priority). */
  brand: PackTokens;
  /** Selected theme's tokens; each present key overrides the brand. */
  theme?: Partial<PackTokens> | null;
  /** Explicit per-card overrides; each present key overrides the theme. */
  override?: Partial<PackTokens> | null;
  /** Junior force — the brown panel wins over every source (KTD6). */
  junior?: boolean;
}

/** Copy only the defined values of a partial onto the target. */
function assignDefined(target: PackTokens, src?: Partial<PackTokens> | null): void {
  if (!src) return;
  for (const k of Object.keys(src) as (keyof PackTokens)[]) {
    const v = src[k];
    if (v !== undefined && v !== null && v !== "") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (target as any)[k] = v;
    }
  }
}

/**
 * Resolve the final pack tokens by priority (highest wins):
 *   1. junior force (brown panel, regardless of anything)
 *   2. explicit per-card override tokens
 *   3. selected theme's tokens (incl. `displayFont` → `--disp`)
 *   4. tenant brand default
 */
export function resolvePackTokens(sources: PackTokenSources): PackTokens {
  const resolved: PackTokens = { ...sources.brand };
  assignDefined(resolved, sources.theme);
  assignDefined(resolved, sources.override);
  if (sources.junior) resolved.panel = JUNIOR_PANEL;
  return resolved;
}

// ---------------------------------------------------------------------------
// Brand → default token bridge
// ---------------------------------------------------------------------------

/**
 * The pack's built-in default palette — the "Broadcast Dark" look: a gold accent
 * on the juniors-brown panel over a near-black ink stage. It is the last-resort
 * fallback for any pack token a tenant's brand leaves unset, and the baseline
 * {@link brandDefaultTokens} overlays brand colours onto.
 *
 * Halls Head (tenant #1) is seeded with exactly the brand colours that reproduce
 * this palette, so HH pack cards stay pixel-identical to the pre-bridge output
 * (see {@link brandDefaultTokens}).
 */
export const PACK_DEFAULT_TOKENS: PackTokens = {
  accent: "#FBAC27",
  panel: "#42342B",
  ink: "#101216",
  textLight: "#F5F2E8",
  displayFont: "anton",
};

/**
 * Validate + normalise a tenant-supplied brand colour to a plain 6-digit hex.
 *
 * Brand colours are admin-controlled and flow, unescaped, into an inline
 * `style="…"` string that {@link rootStyle} builds and the preview/still harness
 * mounts via `dangerouslySetInnerHTML`. So this is a security boundary: a value
 * like `#fff"><img src=x onerror=alert(1)>` must never reach the tokens. We
 * therefore accept ONLY a strict hex literal (`#RGB`, `#RRGGBB`, or
 * `#RRGGBBAA`) — never `rgb()/hsl()/named` strings — and reject anything else by
 * returning null (the caller then keeps the hard-coded default token). Accepting
 * only hex keeps the injection surface closed with no escaping to get wrong.
 *
 * Normalisation also matters downstream: `--panel-2` is derived by
 * {@link darkenHex}, which only matches a 6-digit hex. Expanding `#RGB`→`#RRGGBB`
 * and stripping the alpha from `#RRGGBBAA` here means a valid short/alpha brand
 * colour still yields a proper darkened panel gradient rather than silently
 * falling back to the Halls-Head brown. Returns an uppercase `#RRGGBB` string,
 * or null when the input is absent/invalid.
 */
export function normaliseBrandHex(colour?: string | null): string | null {
  if (!colour) return null;
  const m = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.exec(colour.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  else if (h.length === 8) h = h.slice(0, 6); // drop the alpha channel
  return `#${h.toUpperCase()}`;
}

/**
 * Bridge a tenant's brand colours onto the pack's DEFAULT token baseline. This
 * is the LOWEST-priority token source: {@link resolvePackTokens} still layers
 * theme, then per-card override, then the junior force on top, so priority stays
 * `junior > override > theme > brand-default`.
 *
 * Mapping (only the tokens a club brand can meaningfully drive):
 *   - `primaryColour` → `accent` (`--gold`)  — the brand's headline accent
 *   - `juniorsColour` → `panel`  (`--panel`) — the pack panel IS the juniors tone
 *
 * Any brand colour that is absent (null/undefined/empty) leaves that token on
 * the hard-coded {@link PACK_DEFAULT_TOKENS} fallback. `ink` and `textLight` have
 * no brand source and always keep the fallback.
 *
 * Halls Head parity (invariant — HH MUST stay visually identical): HH's brand is
 * `primaryColour #FBAC27` and `juniorsColour #42342B`, which map onto the default
 * accent/panel unchanged. The brand's `backgroundColour` is deliberately NOT
 * mapped onto `ink`: the pack `ink` is a fixed deep near-black *stage* colour,
 * not a club's mid-tone site background, so bridging it would shift the stage per
 * club — and specifically would push HH's ink from #101216 to its slate
 * background #333F48, breaking parity. Leaving `ink` fixed keeps HH byte-for-byte
 * identical while still letting non-HH brands seed their accent + panel.
 */
export function brandDefaultTokens(
  brand?: PackCardData["brand"],
): PackTokens {
  const tokens: PackTokens = { ...PACK_DEFAULT_TOKENS };
  if (!brand) return tokens;
  // Sanitise + normalise each brand colour at the boundary: only a strict hex
  // literal survives (→ default token otherwise), and it is normalised to a
  // 6-digit hex so `darkenHex` can derive `--panel-2`. HH's clean 6-digit
  // #FBAC27 / #42342B pass through unchanged, preserving parity.
  const accent = normaliseBrandHex(brand.primaryColour);
  const panel = normaliseBrandHex(brand.juniorsColour);
  if (accent) tokens.accent = accent;
  if (panel) tokens.panel = panel;
  return tokens;
}

/** Curated display-font families behind the `--disp` token. */
export const DISPLAY_FONT_FAMILY: Record<string, string> = {
  anton: "'Anton'",
  bebas: "'Bebas Neue'",
  oswald: "'Oswald'",
  teko: "'Teko'",
  archivo: "'Archivo Black'",
};

const NATIVE: Record<CardSize, { w: number; h: number }> = {
  square: { w: 1080, h: 1080 },
  portrait: { w: 1080, h: 1350 },
  story: { w: 1080, h: 1920 },
};

// The shared (non-story) layouts flex via `--k`; portrait is taller so it gets
// more generous type than the square. Story uses its own dedicated layout.
const SHARED_K: Record<CardSize, number> = {
  square: 1.0,
  portrait: 1.4,
  story: 1.4,
};

// ---------------------------------------------------------------------------
// Template resolution
// ---------------------------------------------------------------------------

/**
 * kind → designs, per pack. Built lazily on first use of a pack and cached, so
 * registering a pack costs nothing until something renders it.
 *
 * This was a single module-level map built from Pack A, which is what made the
 * renderer single-pack: template lookup had no way to ask for a different pack.
 */
const DESIGN_INDEX = new Map<string, Map<string, PackDesignEntry[]>>();

function designsByKind(packId?: string | null): Map<string, PackDesignEntry[]> {
  const manifest = getPackManifest(packId);
  let index = DESIGN_INDEX.get(manifest.packId);
  if (!index) {
    index = new Map<string, PackDesignEntry[]>();
    for (const d of manifest.designs) {
      const list = index.get(d.kind) ?? [];
      list.push(d);
      index.set(d.kind, list);
    }
    DESIGN_INDEX.set(manifest.packId, index);
  }
  return index;
}

/**
 * True when `packId` (default pack when omitted) has a design for `kind`.
 * Packs are not required to cover the same kinds, so this is per-pack.
 */
export function packSupportsKind(kind: string, packId?: string | null): boolean {
  return designsByKind(packId).has(kind);
}

/** Pick the design for an input; the two two-design kinds split on category. */
function resolveTemplate(
  input: ShareCardInput,
  packId?: string | null,
): PackCardTemplate | null {
  const designs = designsByKind(packId).get(input.kind);
  if (!designs || designs.length === 0) return null;
  if (designs.length === 1) return designs[0].template;
  // gradeLeader / clubLeaderboard: choose Runs vs Wickets by category.
  const category = (input as { category?: string }).category ?? "Runs";
  const wantsWickets = category.trim().toLowerCase().startsWith("w");
  const match = designs.find(
    (d) => (d.categoryPreset === "Wickets") === wantsWickets,
  );
  return (match ?? designs[0]).template;
}

/** Select the format html for a size. A1 has three; every other card has two. */
function selectFormatHtml(
  formats: PackTemplateFormats,
  size: CardSize,
): string {
  if ("portrait" in formats) {
    // Match Result — three distinct layouts.
    if (size === "portrait") return formats.portrait;
    if (size === "square") return formats.square;
    if (size === "story") return formats.story;
    return formats.story; // unknown size → sane default
  }
  // story vs shared (portrait + square both map to shared).
  if (size === "story") return formats.story;
  return formats.shared;
}

// ---------------------------------------------------------------------------
// HTML escaping (security invariant)
// ---------------------------------------------------------------------------

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Balanced <div> scanning (no regex can balance nested tags)
// ---------------------------------------------------------------------------

interface DivBounds {
  /** Index of the first char after the opening tag's `>`. */
  contentStart: number;
  /** Index of the matching `</div>` opening `<`. */
  contentEnd: number;
  /** Index just after the matching `</div>`. */
  end: number;
}

/** Given `openIdx` at a `<div`, return the bounds of its balanced content. */
function divBounds(html: string, openIdx: number): DivBounds {
  const contentStart = html.indexOf(">", openIdx) + 1;
  let depth = 1;
  const re = /<\/?div\b/g;
  re.lastIndex = contentStart;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (html[m.index + 1] === "/") {
      depth--;
      if (depth === 0) {
        const contentEnd = m.index;
        const end = html.indexOf(">", m.index) + 1;
        return { contentStart, contentEnd, end };
      }
    } else {
      depth++;
    }
  }
  // Unbalanced (shouldn't happen for transcribed templates) — treat rest as body.
  return { contentStart, contentEnd: html.length, end: html.length };
}

/** Split a run of sibling top-level `<div>…</div>` into separate strings. */
function splitTopLevelDivs(inner: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < inner.length) {
    const open = inner.indexOf("<div", i);
    if (open < 0) break;
    const b = divBounds(inner, open);
    out.push(inner.slice(open, b.end));
    i = b.end;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Sponsor variant selection
// ---------------------------------------------------------------------------

/** Remove every `<div data-sponsors="loser">…</div>` block, keeping the winner. */
/**
 * Remove any element marked `data-drop-if-empty="<slotKey>"` when that image
 * slot resolved to nothing.
 *
 * An optional hero photo would otherwise render as a large empty framed box —
 * technically the placeholder working as designed, but on a Match Result posted
 * without a photo it reads as a broken card. Dropping the whole block lets a
 * flex-column layout close the space instead.
 *
 * Strips the marker attribute when the slot IS filled so the emitted html
 * carries no leftover authoring hooks.
 */
function dropEmptyImageBlocks(html: string, images: Record<string, string>): string {
  const re = /<div[^>]*?\sdata-drop-if-empty="([^"]+)"/;
  let out = html;
  let m = re.exec(out);
  while (m) {
    const key = m[1];
    if (images[key]) {
      // Keep the block; remove the marker so the next exec moves past it.
      out =
        out.slice(0, m.index) +
        out.slice(m.index).replace(` data-drop-if-empty="${key}"`, "");
    } else {
      out = out.slice(0, m.index) + out.slice(divBounds(out, m.index).end);
    }
    m = re.exec(out);
  }
  return out;
}

function selectSponsorVariant(html: string, sponsorsOn: boolean): string {
  const loser = sponsorsOn ? "off" : "on";
  const needle = `<div data-sponsors="${loser}"`;
  let out = html;
  let idx = out.indexOf(needle);
  while (idx >= 0) {
    const b = divBounds(out, idx);
    out = out.slice(0, idx) + out.slice(b.end);
    idx = out.indexOf(needle);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Repeat expansion
// ---------------------------------------------------------------------------

interface PackRow {
  /** Row-template variant to use (`data-repeat-variant="…"`), if any. */
  variant?: string;
  values: Record<string, string>;
}

function substituteRow(
  template: string,
  values: Record<string, string>,
  defaults: Record<string, string>,
): string {
  return template.replace(/\{\{\s*row\.([\w.]+)\s*\}\}/g, (_all, key: string) => {
    const raw = key in values ? values[key] : defaults[key] ?? "";
    return escapeHtml(raw);
  });
}

/** Expand every `<div data-repeat="key">…</div>` over the supplied rows. */
function expandRepeats(
  html: string,
  rowsByKey: Record<string, PackRow[]>,
  template: PackCardTemplate,
): string {
  let out = html;
  const OPEN = '<div data-repeat="';
  let searchFrom = 0;
  while (true) {
    const idx = out.indexOf(OPEN, searchFrom);
    if (idx < 0) break;
    const keyStart = idx + OPEN.length;
    const keyEnd = out.indexOf('"', keyStart);
    const key = out.slice(keyStart, keyEnd);
    const b = divBounds(out, idx);
    const inner = out.slice(b.contentStart, b.contentEnd);
    const rowTemplates = splitTopLevelDivs(inner);
    const byVariant: Record<string, string> = {};
    let base = rowTemplates[0] ?? "";
    for (const t of rowTemplates) {
      const vm = t.match(/data-repeat-variant="([^"]+)"/);
      if (vm) byVariant[vm[1]] = t;
      else base = t;
    }
    const repeatDef = template.repeats?.find((r) => r.key === key);
    const rowDefaults: Record<string, string> = {};
    for (const f of repeatDef?.fields ?? []) rowDefaults[f.key] = f.sample;

    const rows = rowsByKey[key] ?? [];
    const expanded = rows
      .map((row) => {
        const chosen = (row.variant && byVariant[row.variant]) || base;
        return substituteRow(chosen, row.values, rowDefaults);
      })
      .join("");

    // Neutralise the `data-repeat` attribute so the container is not re-matched,
    // keep the opening/closing tags, and swap in the expanded rows.
    const openTag = out.slice(idx, b.contentStart);
    const newOpenTag = openTag.replace(` data-repeat="${key}"`, "");
    out = out.slice(0, idx) + newOpenTag + expanded + out.slice(b.contentEnd);
    searchFrom = idx + newOpenTag.length + expanded.length;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Image slot resolution
// ---------------------------------------------------------------------------

// For an unresolved logo/photo slot we render an initials chip; the source name
// is looked up in the bound values by slot-key convention.
const SLOT_NAME_SOURCE: Record<string, string> = {
  clubLogo: "clubName",
  "club.logo": "club.name",
  "opposition.logo": "opposition.name",
  photo: "playerName",
};

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const letters = parts.slice(0, 2).map((p) => p[0]);
  return letters.join("").toUpperCase();
}

/**
 * Turn a photo transform's focal point into an `object-position` suffix. Only
 * the focal point maps cleanly onto an `object-fit:cover` image; `zoom` has no
 * DOM equivalent that is safe to apply inside the fixed-size slot wrappers, so
 * it is intentionally ignored here (canvas path still honours it). A centred
 * focal point yields no override so untransformed renders are byte-identical.
 */
function photoPositionStyle(
  transform?: { focalX: number; focalY: number } | null,
): string {
  if (!transform) return "";
  const clamp = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 100);
  const fx = clamp(transform.focalX);
  const fy = clamp(transform.focalY);
  if (fx === 50 && fy === 50) return "";
  return `;object-position:${fx}% ${fy}%`;
}

/** Marker that opens the player hero photo slot placeholder. */
const PHOTO_SLOT_OPEN = '<div data-slot="photo" data-slot-type="photo"';

/**
 * Full-card legibility scrim injected behind the text ONLY on a full-bleed
 * render. The templates' own scrims are column-scoped (e.g. Player Spotlight's
 * gradients are `width:600px` / `width:56%`), so once the photo covers the whole
 * 1080 canvas the large `{{playerName}}` — which carries no text-shadow — would
 * otherwise sit over the RAW photo on the left. These two full-canvas gradients
 * (top-down for the header, bottom-up for the name/stats/footer) darken the
 * photo where text lands, mirroring the values the always-full-bleed `debut`
 * card already uses. Layered directly after the photo (over it) but before the
 * template's own scrims and text, so text stays fully on top. Marked with
 * `data-fullbleed-scrim` for testability. `pointer-events:none` so it never
 * intercepts interaction. Never emitted in contained mode → byte-identical.
 */
const FULL_BLEED_SCRIM =
  `<div data-fullbleed-scrim="1" style="position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(8,10,14,.78) 0%,rgba(8,10,14,.12) 26%,transparent 40%)"></div>` +
  `<div data-fullbleed-scrim="1" style="position:absolute;inset:0;pointer-events:none;background:linear-gradient(0deg,rgba(6,8,11,.94) 0%,rgba(6,8,11,.45) 30%,transparent 60%)"></div>`;

/**
 * Promote the player hero photo to a full-bleed action shot by rewriting the
 * geometry of its immediate wrapper to cover the whole card
 * (`position:absolute;inset:0`), and inject a full-card legibility scrim
 * ({@link FULL_BLEED_SCRIM}) right after it. The templates wrap the hero slot in
 * a single positioned box whose only child is the slot placeholder
 * (`<div style="position:absolute;…">${slot("photo","photo")}</div>`), so the
 * wrapper is the `<div …>` directly preceding the placeholder. Rewriting the
 * wrapper (not the placeholder) keeps the photo in its original DOM position —
 * after the background base, before the scrim/gradient layers and text — so it
 * fills the frame while the scrims (the template's column ones plus the injected
 * full-card one) still overlay it and the text stays legible.
 *
 * ASSUMPTION (template-author warning): the `data-slot="photo"` placeholder must
 * be the DIRECT, sole child of a single positioned wrapper `<div>`. A hero photo
 * nested inside extra wrapper divs would fail the "nothing between" check and
 * silently stay contained (no full-bleed) rather than mis-rewrite the wrong box.
 * Keep new player templates to that one-wrapper shape for full-bleed to work.
 *
 * Only `data-slot="photo"` is targeted; logo and sponsor slots are left
 * contained. Returns the html
 * unchanged when no such wrapper is found (byte-identical to contained).
 */
function makePhotoSlotFullBleed(html: string): string {
  let out = html;
  let searchFrom = 0;
  while (true) {
    const photoIdx = out.indexOf(PHOTO_SLOT_OPEN, searchFrom);
    if (photoIdx < 0) break;
    // The wrapper is the `<div …>` immediately before the placeholder. Search
    // strictly before `photoIdx` so we don't match the placeholder's own tag.
    const wrapperOpen = out.lastIndexOf("<div ", photoIdx - 1);
    const wrapperGt = wrapperOpen >= 0 ? out.indexOf(">", wrapperOpen) : -1;
    // Confirm the wrapper directly wraps the slot (nothing between `>` and the
    // placeholder). If not, leave this occurrence contained and move on.
    if (
      wrapperOpen < 0 ||
      wrapperGt < 0 ||
      wrapperGt >= photoIdx ||
      out.slice(wrapperGt + 1, photoIdx).trim() !== ""
    ) {
      searchFrom = photoIdx + PHOTO_SLOT_OPEN.length;
      continue;
    }
    const wrapperTag = out.slice(wrapperOpen, wrapperGt + 1);
    const newTag = /style="[^"]*"/.test(wrapperTag)
      ? wrapperTag.replace(/style="[^"]*"/, 'style="position:absolute;inset:0"')
      : wrapperTag.replace("<div ", '<div style="position:absolute;inset:0" ');
    // The wrapper contains exactly the flat photo-slot div, so its closing
    // `</div>` is the second `</div>` after the placeholder (first closes the
    // slot itself). Inject the full-card scrim as the wrapper's next sibling.
    const slotClose = out.indexOf("</div>", photoIdx);
    const wrapperCloseStart =
      slotClose >= 0 ? out.indexOf("</div>", slotClose + 6) : -1;
    const wrapperCloseEnd = wrapperCloseStart >= 0 ? wrapperCloseStart + 6 : -1;
    if (wrapperCloseEnd < 0) {
      // Malformed wrapper (shouldn't happen) — just rewrite the geometry.
      out = out.slice(0, wrapperOpen) + newTag + out.slice(wrapperGt + 1);
      searchFrom = wrapperOpen + newTag.length + PHOTO_SLOT_OPEN.length;
      continue;
    }
    const rebuilt =
      newTag + out.slice(wrapperGt + 1, wrapperCloseEnd) + FULL_BLEED_SCRIM;
    out = out.slice(0, wrapperOpen) + rebuilt + out.slice(wrapperCloseEnd);
    // Advance past the rewritten wrapper AND the injected scrim so neither the
    // same slot nor the scrim markup is re-scanned (the scrim carries no
    // photo-slot marker, but advancing keeps the loop strictly progressing).
    searchFrom = wrapperOpen + rebuilt.length;
  }
  return out;
}

function resolveSlots(
  html: string,
  images: Record<string, string>,
  values: Record<string, string>,
  photoTransform?: { focalX: number; focalY: number } | null,
  photoFullBleed = false,
): string {
  if (photoFullBleed) html = makePhotoSlotFullBleed(html);
  const slotRe =
    /<div data-slot="([^"]+)" data-slot-type="([^"]+)"([^>]*)><\/div>/g;
  return html.replace(slotRe, (_all, key: string, type: string, rest: string) => {
    const url = images[key];
    // Sponsor logos are contained (never cropped) even without an explicit
    // data-fit; club logos already carry data-fit="contain".
    const contain = type === "sponsor" || /data-fit="contain"/.test(rest);
    const fit = contain ? "contain" : "cover";
    if (url) {
      const pos = type === "photo" ? photoPositionStyle(photoTransform) : "";
      return `<img src="${escapeHtml(url)}" alt="" style="width:100%;height:100%;object-fit:${fit}${pos};display:block" />`;
    }
    // No URL → placeholder (never an empty <img src>).
    if (type === "sponsor") {
      return `<div class="pack-slot-placeholder" style="width:100%;height:100%;background:rgba(255,255,255,.12)"></div>`;
    }
    const sourceKey = SLOT_NAME_SOURCE[key];
    const initials = sourceKey ? initialsOf(values[sourceKey] ?? "") : "";
    const chip = initials
      ? `<span style="font-family:var(--disp,'Anton'),sans-serif;font-size:2.4em;line-height:1;color:rgba(255,255,255,.55)">${escapeHtml(initials)}</span>`
      : "";
    return `<div class="pack-slot-placeholder" style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.08)">${chip}</div>`;
  });
}

// ---------------------------------------------------------------------------
// Input binding — ShareCardInput → template field values / rows / images
// ---------------------------------------------------------------------------

interface BoundInput {
  values: Record<string, string>;
  images: Record<string, string>;
  rows: Record<string, PackRow[]>;
}

function set(
  target: Record<string, string>,
  key: string,
  value: string | number | null | undefined,
): void {
  if (value === null || value === undefined) return;
  target[key] = String(value);
}

function seasonFromYear(year: number): string {
  const next = (year + 1) % 100;
  return `${year}/${next.toString().padStart(2, "0")}`;
}

function inningsScore(i: MatchSummaryInnings): string {
  const suffix = i.declared ? "d" : "";
  return `${i.wickets}/${i.totalRuns}${suffix}`;
}

function inningsPerformers(i: MatchSummaryInnings): string {
  const bats = i.topBatters
    .slice(0, 2)
    .map(
      (b) =>
        `${b.name} ${b.runs}${b.notOut ? "*" : ""}${b.balls != null ? ` (${b.balls})` : ""}`,
    );
  const bowls = i.topBowlers
    .slice(0, 1)
    .map((b) => `${b.name} ${b.wickets}/${b.runs} (${b.overs})`);
  return [...bats, ...bowls].join(" · ");
}

function bindInput(input: ShareCardInput): BoundInput {
  const values: Record<string, string> = {};
  const images: Record<string, string> = {};
  const rows: Record<string, PackRow[]> = {};

  switch (input.kind) {
    case "matchSummary": {
      set(values, "matchTitle", input.matchTitle);
      set(values, "result", input.result);
      set(values, "club.name", input.club.name);
      set(values, "opposition.name", input.opposition.name);
      if (input.club.logoUrl) images["club.logo"] = input.club.logoUrl;
      if (input.opposition.logoUrl) images["opposition.logo"] = input.opposition.logoUrl;
      const clubInn = input.innings.find((i) => i.teamKey === "club");
      const oppInn = input.innings.find((i) => i.teamKey === "opposition");
      if (clubInn) {
        set(values, "club.score", inningsScore(clubInn));
        set(values, "club.oversLabel", `${clubInn.overs} OVERS`);
        set(values, "club.performers", inningsPerformers(clubInn));
      }
      if (oppInn) {
        set(values, "opposition.score", inningsScore(oppInn));
        set(values, "opposition.oversLabel", `${oppInn.overs} OVERS`);
        set(values, "opposition.performers", inningsPerformers(oppInn));
      }
      if (input.resultWinner === "draw") {
        set(values, "resultVerb", "MATCH DRAWN");
        set(values, "resultVerbShort", "DRAW");
      }
      break;
    }
    case "player": {
      set(values, "playerName", input.playerName);
      set(values, "headline", input.headline);
      const stats = input.stats ?? [];
      stats.slice(0, 3).forEach((s, idx) => {
        set(values, `stat${idx + 1}Value`, s.value);
        set(values, `stat${idx + 1}Label`, s.label);
      });
      if (input.photoUrl) images["photo"] = input.photoUrl;
      break;
    }
    case "record": {
      set(values, "title", input.title);
      set(values, "value", input.value);
      set(values, "playerName", input.playerName);
      set(values, "grade", input.grade);
      if (input.photoUrl) images["photo"] = input.photoUrl;
      break;
    }
    case "gradeLeader": {
      set(values, "grade", input.grade);
      set(values, "category", input.category);
      set(values, "value", input.value);
      set(values, "playerName", input.playerName);
      if (input.photoUrl) images["photo"] = input.photoUrl;
      break;
    }
    case "premiership": {
      set(values, "grade", input.grade);
      set(values, "season", seasonFromYear(input.year));
      set(values, "competition", input.competition);
      set(values, "result", input.result);
      set(values, "mom", input.mom);
      if (input.teamPhotoUrl) images["teamPhoto"] = input.teamPhotoUrl;
      break;
    }
    case "debut": {
      set(values, "grade", input.grade);
      set(values, "season", input.season);
      set(values, "playerName", input.playerName);
      set(values, "round", input.round);
      set(values, "opponent", input.opponent);
      set(values, "capNumber", input.capNumber);
      set(values, "tributeLine", input.headline);
      if (input.photoUrl) images["photo"] = input.photoUrl;
      break;
    }
    case "century": {
      set(values, "playerName", input.playerName);
      set(values, "grade", input.grade);
      set(values, "runs", input.runs);
      set(values, "balls", input.balls);
      set(values, "opponent", input.opponent);
      set(values, "round", input.round);
      if (input.photoUrl) images["photo"] = input.photoUrl;
      break;
    }
    case "fiveFor": {
      set(values, "playerName", input.playerName);
      set(values, "grade", input.grade);
      set(values, "wickets", input.wickets);
      set(values, "figures", input.figures);
      set(values, "overs", input.overs);
      set(values, "opponent", input.opponent);
      set(values, "round", input.round);
      if (input.photoUrl) images["photo"] = input.photoUrl;
      break;
    }
    case "milestone": {
      set(values, "tierLabel", input.tierLabel);
      set(values, "currentValue", input.currentValue);
      set(values, "milestoneLabel", input.milestoneLabel);
      set(values, "playerName", input.playerName);
      set(values, "headline", input.headline);
      if (input.photoUrl) images["photo"] = input.photoUrl;
      break;
    }
    case "matchDay": {
      set(values, "roundLabel", input.roundLabel);
      set(values, "opposition.name", input.oppositionName);
      set(values, "homeAway", input.homeAway);
      set(values, "oppositionHomeAway", input.homeAway === "HOME" ? "AWAY" : "HOME");
      set(values, "venue", input.venue);
      set(values, "date", input.date);
      set(values, "startTime", input.startTime);
      set(values, "note.title", input.noteTitle);
      set(values, "note.body", input.noteBody);
      if (input.oppositionLogoUrl) images["opposition.logo"] = input.oppositionLogoUrl;
      break;
    }
    case "teamList": {
      set(values, "gradeRound", input.gradeRound);
      set(values, "competitionLine", input.competitionLine);
      set(values, "venueDateTime", input.venueDateTime);
      if (input.squadPhotoUrl) images["squadPhoto"] = input.squadPhotoUrl;
      rows["players"] = (input.players ?? []).map((p: TeamListPlayer) => ({
        values: {
          number: String(p.order),
          surname: p.surname,
          role: p.role ?? "",
        },
      }));
      break;
    }
    case "weekendWrap": {
      set(values, "roundLabel", input.roundLabel);
      set(values, "dateRange", input.dateRange);
      rows["matches"] = (input.matches ?? []).map((mt: WeekendWrapMatch) => {
        // The input carries one grade string ("A GRADE", "U15s") but the
        // templates render a stacked block: a large {{row.gradeLabel}} letter
        // over a small {{row.gradeSub}}. Binding the whole string into the
        // large slot made "A GRADE" wrap/clip at display size while the sub
        // fell back to its sample — every row read "A GRADE / GRADE". Split:
        // first token → the big letter, remainder → the sub (empty when the
        // grade is a single token like "U15s", which renders alone).
        const [gradeHead, ...gradeRest] = (mt.gradeLabel ?? "").trim().split(/\s+/);
        return {
          variant: mt.outcome === "lost" ? "lost" : undefined,
          values: {
            gradeLabel: gradeHead ?? "",
            gradeSub: gradeRest.join(" "),
            resultLine: mt.resultLine,
            performers: mt.performers,
            outcome: mt.outcome.toUpperCase(),
          },
        };
      });
      break;
    }
    case "ladder": {
      set(values, "competitionName", input.competitionName);
      set(values, "gradeLabel", input.gradeLabel);
      set(values, "asOfLabel", input.asOfLabel);
      rows["rows"] = (input.rows ?? []).map((r: LadderRow) => ({
        variant: r.isClub ? "club" : undefined,
        values: {
          pos: String(r.pos),
          team: r.team,
          played: String(r.played),
          won: String(r.won),
          lost: String(r.lost),
          points: String(r.points),
        },
      }));
      break;
    }
    case "bigMoment": {
      set(values, "oppositionName", input.oppositionName);
      set(values, "momentLabel", input.momentLabel);
      set(values, "playerName", input.playerName);
      set(values, "runs", input.runs);
      set(values, "balls", input.balls);
      set(values, "boundaryDetail", input.boundaryDetail);
      set(values, "inningsLabel", input.inningsLabel);
      set(values, "liveScore", input.liveScore);
      set(values, "oversChaseLine", input.oversChaseLine);
      set(values, "equation", input.equation);
      // NOTE (A6): big-moment.ts has no `data-slot="photo"`, so binding
      // images["photo"] here was dead. Dropped — the card renders without a
      // photo by design.
      break;
    }
    case "newSigning": {
      set(values, "season", input.season);
      set(values, "playerFirstName", input.playerFirstName);
      set(values, "playerLastName", input.playerLastName);
      set(values, "role", input.role);
      set(values, "formerClub", input.formerClub);
      set(values, "headline", input.headline);
      if (input.photoUrl) images["photo"] = input.photoUrl;
      break;
    }
    case "countdown": {
      set(values, "eventLabel", input.eventLabel);
      set(values, "daysToGo", input.daysToGo);
      set(values, "hypeLine1", input.hypeLine1);
      set(values, "hypeLine2", input.hypeLine2);
      set(values, "dateVenue", input.dateVenue);
      set(values, "fixtureLine", input.fixtureLine);
      break;
    }
    case "clubLeaderboard": {
      set(values, "category", `TOP ${input.category.toUpperCase()}`);
      set(values, "title", input.title);
      set(values, "subtitle", input.subtitle);
      set(values, "season", input.season);
      rows["leaders"] = (input.leaders ?? []).map((l: ClubLeaderboardLeader) => ({
        values: {
          gradeLabel: l.gradeLabel,
          playerName: l.playerName,
          value: l.value,
        },
      }));
      break;
    }
  }

  return { values, images, rows };
}

/**
 * Overlay per-render tenant data (logo, name, hashtags, sponsors, uploaded
 * photo) onto an already-bound input. Applied uniformly across every card kind
 * after {@link bindInput}, so a single seam threads tenant data into the pack
 * path (mirroring what `RenderOptions` already gives the canvas renderer).
 * Values set here override the template sample defaults; anything absent leaves
 * the sample fallback in place.
 *
 * Every in-app `PackCard` mount now passes `data` — including the Studio's
 * card-type gallery, which used to be treated as a deliberate sample-default
 * case and consequently showed Halls Head's branding to every tenant. The
 * sample fallback therefore only applies to brand-less tenants and to direct
 * `renderPackCard` calls in tests. A source-level guard
 * (`pack-card-mounts.test.ts`) keeps it that way.
 */
function applyPackData(bound: BoundInput, data: PackCardData, kind: string): void {
  const { values, images } = bound;

  // A1 — tenant logo → top-left clubLogo slot (storyHeader / sharedHeader).
  if (data.brand?.logoUrl) images["clubLogo"] = data.brand.logoUrl;

  // A2 — club name + hashtags from the resolved brand / settings, replacing the
  // hard-coded "HALLS HEAD" / "#HALLSHEAD" sample defaults.
  if (data.brand?.name) set(values, "clubName", data.brand.name);
  // S1: this runs only for a real (data-bearing) render, so the sample hashtag
  // must NEVER survive — overwrite unconditionally, using "" when the tenant has
  // no configured hashtag, so another club's "#HALLSHEAD" can't leak through.
  values["clubHashtag"] = data.hashtag ?? "";
  values["hashtags"] = data.hashtag ?? "";
  // S2: the clubTagline sample is "CRICKET CLUB · EST 1991" — Halls Head's
  // founding year. Bind the tenant's own tagline (A9) where set, else "" so
  // another club's founding line never leaks through the sample default.
  values["clubTagline"] = data.brand?.tagline ?? "";
  // S3: the `hashtagsExtra` sample is a hard-coded competition line
  // ("#PEELPREMIERLEAGUE" / "LIVE UPDATES"). There is no clean per-tenant
  // competition source threaded onto PackCardData yet — deriving it would mean
  // inventing an association name — so clear it on every data-bearing render
  // rather than leak the Peel literal.
  // TODO(A9): thread a real competition hashtag from central match context
  // (central.matches grade/competition) once cards carry that on PackCardData.
  values["hashtagsExtra"] = "";

  // A3 — active sponsors → sponsor1..3 slots (already kind-filtered upstream).
  (data.sponsors ?? []).slice(0, 3).forEach((s, idx) => {
    if (s.logoUrl) images[`sponsor${idx + 1}`] = s.logoUrl;
  });

  // A7 — presenting (primary) sponsor → the "presented by <sponsor>" line.
  // S1-style: this runs only for a real (data-bearing) render, so the sample
  // literal ("eSA Sport" / "PlayHQ") must NEVER survive — overwrite
  // unconditionally, using "" when the tenant designated no presenting sponsor.
  // An empty value makes {@link dropEmptyPresentedBy} drop the whole line so no
  // orphan "presented by" prose is left behind.
  values["sponsorPresentedBy"] = data.presentingSponsorName ?? "";

  // A4 — uploaded / selected photo overrides the input's own photoUrl.
  //
  // This used to also fill match-result's `potm.photo` (A5). That slot is gone:
  // the Player-of-the-Match section was removed from every pack because
  // `potm.name` / `potm.figures` / `potm.detail` are not on `ShareCardInput` and
  // nothing ever populated them, so the panel published a fabricated player as
  // though it were that week's result.
  if (data.photoUrl) images["photo"] = data.photoUrl;

  // B1 — generic per-slot image overrides. Applied LAST so an admin's explicit
  // per-slot upload wins over both the bound input image and every overlay above
  // (brand logo, sponsors, uploaded photo): override > input > bind. Empty
  // values are ignored so a cleared override falls back rather than blanking the
  // slot.
  if (data.imagesOverride) {
    for (const [slotKey, url] of Object.entries(data.imagesOverride)) {
      if (url) images[slotKey] = url;
    }
  }
}

// ---------------------------------------------------------------------------
// Root wrapper (theme tokens as CSS custom properties)
// ---------------------------------------------------------------------------

function darkenHex(hex: string, amount: number): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = Math.round(((n >> 16) & 0xff) * (1 - amount));
  const g = Math.round(((n >> 8) & 0xff) * (1 - amount));
  const b = Math.round((n & 0xff) * (1 - amount));
  const to2 = (v: number) => v.toString(16).padStart(2, "0");
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

function rootStyle(
  tokens: PackTokens,
  junior: boolean,
  size: CardSize,
): string {
  const native = NATIVE[size] ?? NATIVE.story;
  const panel = junior ? JUNIOR_PANEL : tokens.panel;
  const panel2 = darkenHex(panel, 0.42);
  const disp = DISPLAY_FONT_FAMILY[tokens.displayFont ?? "anton"] ?? DISPLAY_FONT_FAMILY.anton;
  const decls: string[] = [
    `position:relative`,
    `width:${native.w}px`,
    `height:${native.h}px`,
    `overflow:hidden`,
    `background:${tokens.ink}`,
    `color:${tokens.textLight}`,
    `font-family:'IBM Plex Sans',system-ui,-apple-system,sans-serif`,
    `--gold:${tokens.accent}`,
    `--panel:${panel}`,
    `--ink:${tokens.ink}`,
    `--disp:${disp}`,
    `--k:${SHARED_K[size] ?? 1.4}`,
  ];
  if (panel2) decls.push(`--panel-2:${panel2}`);
  return decls.join(";");
}

// ---------------------------------------------------------------------------
// Field substitution + cleanup
// ---------------------------------------------------------------------------

function fieldDefaults(template: PackCardTemplate): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of template.fields) {
    if (f.type === "text") out[f.key] = f.sample;
  }
  return out;
}

function substituteFields(html: string, values: Record<string, string>): string {
  return html.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_all, key: string) => {
    const raw = values[key] ?? "";
    return escapeHtml(raw);
  });
}

/** Drop team-list role parentheticals rendered empty (no role on that player). */
function cleanupEmptyRoles(html: string): string {
  return html.replace(/\s*<span[^>]*>\(\)<\/span>/g, "");
}

/**
 * Remove the whole "presented by <sponsor>" line when the presenting sponsor is
 * empty, so no orphan prose ("presented by", "proudly supported by", …) is left
 * behind. Every such line — via the `presentedBy` fragment or inline — ends with
 * the sponsor name wrapped in the unique `<span style="color:#fff;font-weight:700">`
 * marker, so the tightest enclosing `<div>…</div>` is matched and dropped. Called
 * BEFORE field substitution, while the raw `{{sponsorPresentedBy}}` placeholder is
 * still present. The clubHashtag sibling in footer rows is untouched.
 */
function dropEmptyPresentedBy(html: string): string {
  return html.replace(
    /<div[^>]*>[^<]*<span style="color:#fff;font-weight:700">\{\{sponsorPresentedBy\}\}<\/span><\/div>/g,
    "",
  );
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Bind an input into its pack template and return native-size, self-contained
 * card HTML. Falls back to the story/shared layout for an unknown size, and to
 * template samples for any field the input does not supply.
 *
 * `packId` selects which registered pack supplies the design; omitted or
 * unknown resolves to {@link DEFAULT_PACK_ID}. Returns `""` when the resolved
 * pack has no design for the input's kind — packs need not cover every kind, so
 * check {@link packSupportsKind} with the same `packId` before routing here.
 */
export function renderPackCard(
  input: ShareCardInput,
  size: CardSize,
  sponsorsOn: boolean,
  tokens: PackTokens,
  junior: boolean,
  data?: PackCardData | null,
  packId?: string | null,
): string {
  const template = resolveTemplate(input, packId);
  if (!template) return "";

  const bound = bindInput(input);
  // Overlay tenant data (logo, name, hashtags, sponsors, photo) onto the bound
  // input before defaults are merged, so tenant values win over the samples.
  if (data) applyPackData(bound, data, input.kind);
  const values = { ...fieldDefaults(template), ...bound.values };
  // On a data-bearing render, any template SAMPLE still surfacing (a field the
  // input did not bind) speaks as the tenant rather than a generic club:
  // "YOUR CLUB · 2ND INNINGS" → "MANDURAH · 2ND INNINGS". Only default-derived
  // values are touched — anything the input or the tenant overlay bound is
  // real data and must never be rewritten.
  if (data?.brand?.name) {
    const club = data.brand.name.replace(/\s+Cricket Club$/i, "").trim() || data.brand.name;
    for (const key of Object.keys(values)) {
      if (key in bound.values) continue;
      values[key] = values[key].replace(/SAMPLE CLUB|YOUR CLUB|Sample Club|Your Club/g, (t) =>
        t === t.toUpperCase() ? club.toUpperCase() : club,
      );
    }
  }

  // Full-bleed only makes sense once there is an actual photo bound to the hero
  // slot; without one the wrapper would just stretch an initials placeholder
  // across the whole card. Gate on both the placement flag and a resolved photo.
  const photoFullBleed =
    data?.photoPlacement === "fullBleed" && Boolean(bound.images["photo"]);

  let html = selectFormatHtml(template.formats, size);
  html = selectSponsorVariant(html, sponsorsOn);
  html = expandRepeats(html, bound.rows, template);
  // Before slots resolve: an optional block whose image never arrived is removed
  // outright rather than rendering an empty framed placeholder.
  html = dropEmptyImageBlocks(html, bound.images);
  html = resolveSlots(html, bound.images, values, data?.photoTransform, photoFullBleed);
  // Drop the "presented by <sponsor>" line entirely when no presenting sponsor
  // resolved (empty value) — must run before substitution while the placeholder
  // is intact. A non-empty sample/tenant value keeps the line.
  if (!values["sponsorPresentedBy"]) html = dropEmptyPresentedBy(html);
  html = substituteFields(html, values);
  html = cleanupEmptyRoles(html);

  return `<div class="pack-card-root" style="${rootStyle(tokens, junior, size)}">${html}</div>`;
}

/** Native pixel dimensions for a size (exposed for scaled mounting). */
export function packNativeSize(size: CardSize): { w: number; h: number } {
  return NATIVE[size] ?? NATIVE.story;
}
