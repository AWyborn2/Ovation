/**
 * Pack renderer — theme tokens: resolution priority (junior > override > theme
 * > brand default, or junior > override > club brand > theme in "club colours"
 * mode), the brand → default-token bridge, display fonts, native sizes and the
 * root wrapper style that exposes tokens as CSS custom properties.
 */

import type { PackInkTint } from "../pack-templates/types";
import type { CardSize } from "../share-card";
import { JUNIOR_PANEL, type PackCardData, type PackColourMode, type PackTokens } from "./types";

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
export function tokensFromCardTheme(theme: CardThemeLike | null | undefined): Partial<PackTokens> {
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
  /**
   * Colour mode for the pack being rendered. `"club"` (the product default)
   * lets the club's brand colours beat the theme's accent / panel / stage: the
   * theme then contributes only `displayFont` and `textLight`. `"pack"` (and
   * absent) is the historical `theme > brand` order, unchanged.
   */
  mode?: PackColourMode;
}

/** The theme keys a card theme still contributes in "club colours" mode. */
const CLUB_MODE_THEME_KEYS: readonly (keyof PackTokens)[] = ["displayFont", "textLight"];

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
 *
 * In `"club"` mode the theme drops to `displayFont` / `textLight` only, so the
 * brand's accent, panel and stage (already on `brand`) win over the theme's
 * colours. Override and junior keep their places at the top.
 */
export function resolvePackTokens(sources: PackTokenSources): PackTokens {
  const resolved: PackTokens = { ...sources.brand };
  if (sources.mode === "club") {
    const theme: Partial<PackTokens> = {};
    for (const k of CLUB_MODE_THEME_KEYS) {
      const v = sources.theme?.[k];
      if (v) theme[k] = v;
    }
    assignDefined(resolved, theme);
  } else {
    assignDefined(resolved, sources.theme);
  }
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
 * theme (or, in "club" mode, only the theme's font and text colour), then
 * per-card override, then the junior force on top.
 *
 * `"pack"` mode — "Pack's own look", byte-identical to the output before the
 * club colour mode existed:
 *   - `primaryColour` → `accent` (`--gold`)  — the brand's headline accent
 *   - `juniorsColour` → `panel`  (`--panel`)
 *   - `ink` and `textLight` keep the fixed fallback (a fixed near-black stage).
 *
 * `"club"` mode — "Club colours", the card takes on the club's own identity:
 *   - `primaryColour`    → `accent`
 *   - `backgroundColour` → `panel` (falling back to `juniorsColour`), darkened
 *     only as far as light card type needs to hold 4.5:1 on it
 *   - `backgroundColour` → `ink` as a deep shade ({@link clubStageInk}), falling
 *     back to the fixed ink when the club has no background colour.
 *
 * Any brand colour that is absent or invalid leaves that token on the
 * hard-coded {@link PACK_DEFAULT_TOKENS} fallback.
 */
export function brandDefaultTokens(
  brand?: PackCardData["brand"],
  mode: PackColourMode = "pack",
): PackTokens {
  const tokens: PackTokens = { ...PACK_DEFAULT_TOKENS };
  if (!brand) return tokens;
  // Sanitise + normalise each brand colour at the boundary: only a strict hex
  // literal survives (→ default token otherwise), and it is normalised to a
  // 6-digit hex so `darkenHex` can derive `--panel-2`. Tokens flow unescaped
  // into an inline style, so no brand colour may bypass this.
  const accent = normaliseBrandHex(brand.primaryColour);
  const juniors = normaliseBrandHex(brand.juniorsColour);
  if (accent) tokens.accent = accent;
  if (mode === "club") {
    const background = normaliseBrandHex(brand.backgroundColour);
    const panel = background ? legibleShade(background, 0) : juniors;
    if (panel) tokens.panel = panel;
    const ink = clubStageInk(background);
    if (ink) tokens.ink = ink;
  } else if (juniors) {
    tokens.panel = juniors;
  }
  return tokens;
}

/**
 * Whether a brand carries any colour "club colours" mode can use. A brand with
 * none renders the pack's own look instead, so a brand-less preview (gallery
 * samples, a tenant that never set colours) is unchanged by the mode.
 */
export function hasClubColours(brand?: PackCardData["brand"]): boolean {
  return Boolean(
    brand && (normaliseBrandHex(brand.backgroundColour) || normaliseBrandHex(brand.primaryColour)),
  );
}

/** How far the club background is darkened to become the stage by default. */
export const CLUB_STAGE_DARKEN = 0.55;

/**
 * The dimmest light ink the packs set on the stage and panel (Metallic Foil's
 * cream) — the reference for the legibility clamp, so every pack's type
 * clears it.
 */
export const LIGHT_TYPE_REF = "#F6EBD0";

/** WCAG AA for body text. */
export const MIN_TEXT_CONTRAST = 4.5;

/**
 * The club's deep stage: its `backgroundColour` darkened by
 * {@link CLUB_STAGE_DARKEN}, or further when that still leaves light card type
 * under 4.5:1 (a club with a pale background). Null when the club has no valid
 * background colour — the caller keeps the fixed default ink.
 */
export function clubStageInk(background?: string | null): string | null {
  const hex = normaliseBrandHex(background);
  return hex ? legibleShade(hex, CLUB_STAGE_DARKEN) : null;
}

/**
 * `hex` darkened by at least `minDarken`, then in 5% steps until light type
 * ({@link LIGHT_TYPE_REF}) reaches {@link MIN_TEXT_CONTRAST} on it. Falls back
 * to the fixed default ink should nothing pass.
 */
function legibleShade(hex: string, minDarken: number): string {
  for (let step = Math.round(minDarken * 20); step <= 19; step++) {
    const shade = step === 0 ? hex : darkenHex(hex, step / 20);
    if (shade && contrastRatio(shade, LIGHT_TYPE_REF) >= MIN_TEXT_CONTRAST) {
      return shade.toUpperCase();
    }
  }
  return PACK_DEFAULT_TOKENS.ink;
}

/** WCAG relative luminance of a 6-digit hex, or null when it is not one. */
export function relativeLuminance(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin((n >> 16) & 0xff) + 0.7152 * lin((n >> 8) & 0xff) + 0.0722 * lin(n & 0xff);
}

/** WCAG contrast ratio between two 6-digit hexes (1 when either is invalid). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la == null || lb == null) return 1;
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
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
  landscape: { w: 1200, h: 630 },
};

// The shared (non-story) layouts flex via `--k`; portrait is taller so it gets
// more generous type than the square. Story uses its own dedicated layout.
// Landscape is short, so a dedicated landscape layout runs tighter type.
const SHARED_K: Record<CardSize, number> = {
  square: 1.0,
  portrait: 1.4,
  story: 1.4,
  landscape: 0.7,
};

// ---------------------------------------------------------------------------
// Root wrapper (theme tokens as CSS custom properties)
// ---------------------------------------------------------------------------

export function darkenHex(hex: string, amount: number): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = Math.round(((n >> 16) & 0xff) * (1 - amount));
  const g = Math.round(((n >> 8) & 0xff) * (1 - amount));
  const b = Math.round((n & 0xff) * (1 - amount));
  const to2 = (v: number) => v.toString(16).padStart(2, "0");
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}

/**
 * Readable ink for type set ON the accent (chips, result banners, sponsor
 * pills): near-black on a light accent, white on a dark one. Packs have always
 * read `var(--accent-ink, …)`, but nothing emitted it, so a tenant with a deep
 * accent (purple, navy) got near-black type on it. WCAG relative luminance;
 * the 0.4 threshold keeps Halls Head's gold (#FBAC27, L≈0.53) on dark ink.
 * Returns null for anything that is not a 6-digit hex (the caller then omits
 * the declaration and the templates' own fallbacks apply).
 */
export function accentInk(hex: string): string | null {
  const l = relativeLuminance(hex);
  if (l == null) return null;
  return l > 0.4 ? "#10151B" : "#FFFFFF";
}

/**
 * The stage colour for this pack: the tenant's `ink` pulled toward the pack's
 * own base by its {@link PackInkTint}, or the tenant's tone verbatim when the
 * pack declares no tint.
 *
 * `color-mix` rather than a flat swap so the club's tone still carries the card
 * — the same technique the metallic foil ramp uses on `--gold`. A pack that
 * simply hard-coded its own base would look identical for every club, which is
 * the opposite failure.
 *
 * In "club colours" mode the pack's `clubTenantWeight` (when it declares one)
 * replaces `tenantWeight`, leaning the stage mostly to the club.
 */
export function stageInk(
  tokens: PackTokens,
  tint?: PackInkTint,
  mode: PackColourMode = "pack",
): string {
  if (!tint) return tokens.ink;
  const weight = mode === "club" ? (tint.clubTenantWeight ?? tint.tenantWeight) : tint.tenantWeight;
  const w = Math.max(0, Math.min(100, weight));
  return `color-mix(in srgb, ${tokens.ink} ${w}%, ${tint.toward})`;
}

export function rootStyle(
  tokens: PackTokens,
  junior: boolean,
  size: CardSize,
  inkTint?: PackInkTint,
  mode: PackColourMode = "pack",
): string {
  const native = NATIVE[size] ?? NATIVE.story;
  const panel = junior ? JUNIOR_PANEL : tokens.panel;
  const panel2 = darkenHex(panel, 0.42);
  const disp = DISPLAY_FONT_FAMILY[tokens.displayFont ?? "anton"] ?? DISPLAY_FONT_FAMILY.anton;
  const ink = stageInk(tokens, inkTint, mode);
  const decls: string[] = [
    `position:relative`,
    `width:${native.w}px`,
    `height:${native.h}px`,
    `overflow:hidden`,
    `background:${ink}`,
    `color:${tokens.textLight}`,
    `font-family:'IBM Plex Sans',system-ui,-apple-system,sans-serif`,
    `--gold:${tokens.accent}`,
    `--panel:${panel}`,
    `--ink:${ink}`,
    `--disp:${disp}`,
    `--k:${SHARED_K[size] ?? 1.4}`,
  ];
  if (panel2) decls.push(`--panel-2:${panel2}`);
  const onAccent = accentInk(tokens.accent);
  if (onAccent) decls.push(`--accent-ink:${onAccent}`);
  return decls.join(";");
}

/** Native pixel dimensions for a size (exposed for scaled mounting). */
export function packNativeSize(size: CardSize): { w: number; h: number } {
  return NATIVE[size] ?? NATIVE.story;
}
