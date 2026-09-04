/**
 * Pack renderer — theme tokens: resolution priority (junior > override > theme
 * > brand default), the brand → default-token bridge, display fonts, native
 * sizes and the root wrapper style that exposes tokens as CSS custom
 * properties.
 */

import type { PackInkTint } from "../pack-templates/types";
import type { CardSize } from "../share-card";
import { JUNIOR_PANEL, type PackCardData, type PackTokens } from "./types";

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
 * The stage colour for this pack: the tenant's `ink` pulled toward the pack's
 * own base by its {@link PackInkTint}, or the tenant's tone verbatim when the
 * pack declares no tint.
 *
 * `color-mix` rather than a flat swap so the club's tone still carries the card
 * — the same technique the metallic foil ramp uses on `--gold`. A pack that
 * simply hard-coded its own base would look identical for every club, which is
 * the opposite failure.
 */
export function stageInk(tokens: PackTokens, tint?: PackInkTint): string {
  if (!tint) return tokens.ink;
  const w = Math.max(0, Math.min(100, tint.tenantWeight));
  return `color-mix(in srgb, ${tokens.ink} ${w}%, ${tint.toward})`;
}

export function rootStyle(
  tokens: PackTokens,
  junior: boolean,
  size: CardSize,
  inkTint?: PackInkTint,
): string {
  const native = NATIVE[size] ?? NATIVE.story;
  const panel = junior ? JUNIOR_PANEL : tokens.panel;
  const panel2 = darkenHex(panel, 0.42);
  const disp = DISPLAY_FONT_FAMILY[tokens.displayFont ?? "anton"] ?? DISPLAY_FONT_FAMILY.anton;
  const ink = stageInk(tokens, inkTint);
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
  return decls.join(";");
}

/** Native pixel dimensions for a size (exposed for scaled mounting). */
export function packNativeSize(size: CardSize): { w: number; h: number } {
  return NATIVE[size] ?? NATIVE.story;
}
