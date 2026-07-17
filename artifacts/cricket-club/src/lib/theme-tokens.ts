import {
  DEFAULT_BRAND,
  type AccentToken,
  type ClubBrand,
} from "@workspace/scorecard";

export type ThemeMode = "light" | "dark";

interface Hsl {
  h: number;
  s: number;
  l: number;
}

/** "#rrggbb" (or shorthand "#rgb") → {h, s, l} (h in degrees, s/l as 0-100 integers). */
export function hexToHsl(hex?: string | null): Hsl | null {
  if (!hex) return null;
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let hue = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r:
        hue = ((g - b) / d) % 6;
        break;
      case g:
        hue = (b - r) / d + 2;
        break;
      default:
        hue = (r - g) / d + 4;
    }
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  return { h: Math.round(hue), s: Math.round(s * 100), l: Math.round(l * 100) };
}

/** {h, s, l} → the "H S% L%" triplet string a CSS HSL custom property expects. */
export function hslString(t: Hsl): string {
  return `${t.h} ${t.s}% ${t.l}%`;
}

/** "#rrggbb" → "H S% L%", or null if unparseable (mirrors {@link hexToHsl}). */
export function hexToHslTriplet(hex?: string | null): string | null {
  const hsl = hexToHsl(hex);
  return hsl ? hslString(hsl) : null;
}

/**
 * The design system's fixed navy surface scales — the Ovation fallback when no
 * club backgroundColour is available, it is too light, or `useNavyBase` is set.
 * Dark mode: #0B0F1A page → #131826 card → #1B2236 elevated → #232B3D border.
 * Light mode: #F5F6FA page → #FFFFFF card → #EBEDF2 elevated → #D9DDE6 border.
 */
const NAVY_DARK = {
  950: "222 33% 8%",
  900: "220 30% 11%",
  800: "222 28% 16%",
  700: "220 23% 21%",
};
const INK_DARK = { 0: "220 20% 96%", 2: "218 12% 60%" };

const NAVY_LIGHT = {
  bg: "220 25% 97%",
  card: "0 0% 100%",
  elevated: "220 20% 94%",
  border: "220 20% 88%",
};
const INK_LIGHT = { 0: "222 30% 12%", 2: "218 12% 42%" };

/**
 * The five accent hues a tenant may pick as their brand colour — identical in
 * both modes; only the surrounding surface inverts. Keys match the shared
 * `AccentToken` union in `@workspace/scorecard` (which also carries the
 * canonical hex values as `ACCENT_HEX`).
 */
export const ACCENT_TOKENS: Record<AccentToken, string> = {
  amber: "37 100% 61%",
  purple: "247 81% 68%",
  green: "153 56% 52%",
  blue: "217 89% 63%",
  red: "9 85% 62%",
};
export type { AccentToken };

/**
 * Maximum saturation (integer percent) applied to derived dark-mode surface
 * steps — caps very saturated club colours so surfaces remain readable.
 */
const SURFACE_DARK_MAX_S = 35;
/**
 * Maximum saturation (integer percent) applied to derived light-mode surface
 * steps — light-mode surfaces stay subtly tinted, never garish.
 */
const SURFACE_LIGHT_MAX_S = 20;
/**
 * Minimum-darkness floor: a backgroundColour whose HSL lightness exceeds this
 * value is too light to use as a dark page background and falls back to navy.
 */
const SURFACE_FLOOR_L = 60;

interface SurfaceScale {
  page: string;
  card: string;
  elevated: string;
  border: string;
}

/**
 * Derive the four structural surface steps (page, card, elevated, border) from
 * a club's `backgroundColour`.
 *
 * Falls back to the fixed Ovation navy when any of these is true:
 *  - `useNavyBase` is true (explicit opt-out from brand surfaces)
 *  - `backgroundColour` is absent or unparseable
 *  - the colour's HSL lightness exceeds {@link SURFACE_FLOOR_L} (prevents pale
 *    or near-white colours from producing unreadable page backgrounds)
 *
 * When deriving, the brand hue is preserved exactly; saturation is clamped to
 * {@link SURFACE_DARK_MAX_S} / {@link SURFACE_LIGHT_MAX_S} and tapered across
 * the lightness steps so the scale reads as a coherent shade family.
 */
function buildSurfaceScale(
  backgroundColour: string | null | undefined,
  useNavyBase: boolean,
  mode: ThemeMode,
): SurfaceScale {
  if (!useNavyBase && backgroundColour) {
    const hsl = hexToHsl(backgroundColour);
    if (hsl && hsl.l <= SURFACE_FLOOR_L) {
      const { h, s } = hsl;
      if (mode === "dark") {
        const sd = Math.min(s, SURFACE_DARK_MAX_S);
        return {
          page: `${h} ${sd}% 8%`,
          card: `${h} ${Math.round(sd * 0.9)}% 11%`,
          elevated: `${h} ${Math.round(sd * 0.85)}% 16%`,
          border: `${h} ${Math.round(sd * 0.7)}% 21%`,
        };
      } else {
        const sl = Math.min(s, SURFACE_LIGHT_MAX_S);
        return {
          page: `${h} ${sl}% 97%`,
          card: "0 0% 100%",
          elevated: `${h} ${Math.round(sl * 0.9)}% 94%`,
          border: `${h} ${Math.round(sl * 0.85)}% 88%`,
        };
      }
    }
  }
  return mode === "dark"
    ? {
        page: NAVY_DARK[950],
        card: NAVY_DARK[900],
        elevated: NAVY_DARK[800],
        border: NAVY_DARK[700],
      }
    : {
        page: NAVY_LIGHT.bg,
        card: NAVY_LIGHT.card,
        elevated: NAVY_LIGHT.elevated,
        border: NAVY_LIGHT.border,
      };
}

/**
 * Compute the full set of CSS custom properties (structural surfaces + accent)
 * for a tenant's brand at a given light/dark mode.
 *
 * **Surfaces** are derived from `brand.backgroundColour` via
 * {@link buildSurfaceScale}: the brand hue drives the page/card/border scale in
 * both dark and light modes, giving each club a distinctly-theirs feel without
 * sacrificing readability. If the colour is absent, too light (L > 60%), or
 * `brand.useNavyBase` is true, the fixed Ovation navy/paper scales are used
 * instead — identical to the prior behaviour.
 *
 * **Accent** slots (`--primary`, `--accent`, `--ring`, …) continue to come
 * from `brand.primaryColour` via direct hex→HSL conversion, so any hex saved
 * by the admin is faithfully reflected. Preset hex values (from `ACCENT_HEX`)
 * round-trip cleanly through hexToHsl/hslString because they were derived from
 * the `ACCENT_TOKENS` HSL values in the first place.
 *
 * **Foreground** is contrast-aware: light accents (L > 55) use dark navy text;
 * dark accents (L ≤ 55) use light ink — so neither white-on-white nor
 * navy-on-navy is ever produced regardless of what colour the admin chose.
 */
export function deriveThemeTokens(brand: ClubBrand, mode: ThemeMode): Record<string, string> {
  const surf = buildSurfaceScale(brand.backgroundColour, brand.useNavyBase ?? false, mode);

  const hsl = hexToHsl(brand.primaryColour);
  const accent = hsl ? hslString(hsl) : ACCENT_TOKENS.amber;
  const accentForeground = hsl && hsl.l > 55 ? NAVY_DARK[950] : INK_DARK[0];

  if (mode === "dark") {
    return {
      "--background": surf.page,
      "--foreground": INK_DARK[0],
      "--border": surf.border,
      "--input": surf.border,
      "--ring": accent,
      "--card": surf.card,
      "--card-foreground": INK_DARK[0],
      "--card-border": surf.border,
      "--popover": surf.card,
      "--popover-foreground": INK_DARK[0],
      "--popover-border": surf.border,
      "--primary": accent,
      "--primary-foreground": accentForeground,
      "--primary-border": accent,
      "--secondary": surf.elevated,
      "--secondary-foreground": INK_DARK[2],
      "--secondary-border": surf.border,
      "--muted": surf.elevated,
      "--muted-foreground": INK_DARK[2],
      "--muted-border": surf.border,
      "--accent": accent,
      "--accent-foreground": accentForeground,
      "--accent-border": accent,
      "--destructive": ACCENT_TOKENS.red,
      "--destructive-foreground": "0 0% 100%",
      "--destructive-border": ACCENT_TOKENS.red,
    };
  }

  return {
    "--background": surf.page,
    "--foreground": INK_LIGHT[0],
    "--border": surf.border,
    "--input": surf.border,
    "--ring": accent,
    "--card": surf.card,
    "--card-foreground": INK_LIGHT[0],
    "--card-border": surf.border,
    "--popover": surf.card,
    "--popover-foreground": INK_LIGHT[0],
    "--popover-border": surf.border,
    "--primary": accent,
    "--primary-foreground": accentForeground,
    "--primary-border": accent,
    "--secondary": surf.elevated,
    "--secondary-foreground": INK_LIGHT[2],
    "--secondary-border": surf.border,
    "--muted": surf.elevated,
    "--muted-foreground": INK_LIGHT[2],
    "--muted-border": surf.border,
    "--accent": accent,
    "--accent-foreground": accentForeground,
    "--accent-border": accent,
    "--destructive": "6 78% 46%",
    "--destructive-foreground": "0 0% 100%",
    "--destructive-border": "6 78% 40%",
  };
}

/** Re-export for callers that need the default brand's tokens statically. */
export { DEFAULT_BRAND };
