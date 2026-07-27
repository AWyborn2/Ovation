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
 * "H S% L%" (the triplet a CSS HSL custom property stores) → "#rrggbb", or null
 * when the triplet is malformed. The inverse of {@link hexToHslTriplet}; used to
 * seed `<input type="color">` swatches in the override editors from the derived
 * auto value so a picker opens on the colour it is actually replacing.
 */
export function hslTripletToHex(triplet?: string | null): string | null {
  if (!triplet) return null;
  const m = /^\s*(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%\s*$/.exec(triplet);
  if (!m) return null;
  const h = parseFloat(m[1]);
  const s = parseFloat(m[2]) / 100;
  const l = parseFloat(m[3]) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const mm = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (v: number) =>
    Math.max(0, Math.min(255, Math.round((v + mm) * 255)))
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
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
 * The colour CSS custom properties a tenant/concierge theme override may target.
 * These are exactly the keys {@link deriveThemeTokens} emits, so an override for
 * any of them replaces the derived value. Override values for these keys are
 * stored as 6-digit hex and converted to the "H S% L%" triplet at apply time.
 */
export const OVERRIDE_COLOUR_KEYS = [
  "--background",
  "--foreground",
  "--border",
  "--input",
  "--ring",
  "--card",
  "--card-foreground",
  "--card-border",
  "--popover",
  "--popover-foreground",
  "--popover-border",
  "--primary",
  "--primary-foreground",
  "--primary-border",
  "--secondary",
  "--secondary-foreground",
  "--secondary-border",
  "--muted",
  "--muted-foreground",
  "--muted-border",
  "--accent",
  "--accent-foreground",
  "--accent-border",
  "--destructive",
  "--destructive-foreground",
  "--destructive-border",
] as const;

/**
 * Non-colour theme tokens an override may target. Their values are raw CSS
 * strings (a length for `--radius`, a font stack for the `--app-font-*` keys)
 * applied verbatim rather than hex-converted.
 */
export const OVERRIDE_RAW_KEYS = [
  "--radius",
  "--app-font-sans",
  "--app-font-serif",
  "--app-font-mono",
] as const;

export type OverrideColourKey = (typeof OVERRIDE_COLOUR_KEYS)[number];
export type OverrideRawKey = (typeof OVERRIDE_RAW_KEYS)[number];
export type ThemeOverrideKey = OverrideColourKey | OverrideRawKey;

const OVERRIDE_COLOUR_SET: ReadonlySet<string> = new Set(OVERRIDE_COLOUR_KEYS);
const OVERRIDE_RAW_SET: ReadonlySet<string> = new Set(OVERRIDE_RAW_KEYS);

/** True when `key` is a colour token an override may target (hex-valued). */
export function isOverrideColourKey(key: string): key is OverrideColourKey {
  return OVERRIDE_COLOUR_SET.has(key);
}

/**
 * Overlay a brand's `themeOverrides` onto an already-derived token map, mutating
 * and returning it. Colour keys are converted hex→triplet (unparseable values are
 * skipped, so a bad override degrades to the derived value rather than breaking
 * the theme); raw keys (`--radius`, fonts) are applied verbatim. Unknown keys are
 * ignored. A null/absent map is a no-op — the derived theme is returned unchanged,
 * which is what keeps `deriveThemeTokens(DEFAULT_BRAND, …)` byte-identical to the
 * static index.css fallback.
 */
export function applyThemeOverrides(
  tokens: Record<string, string>,
  overrides: Record<string, string> | null | undefined,
): Record<string, string> {
  if (!overrides) return tokens;
  for (const [key, value] of Object.entries(overrides)) {
    if (isOverrideColourKey(key)) {
      const triplet = hexToHslTriplet(value);
      if (triplet) tokens[key] = triplet;
    } else if (OVERRIDE_RAW_SET.has(key)) {
      tokens[key] = value;
    }
  }
  return tokens;
}

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
    return applyThemeOverrides(
      {
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
      },
      brand.themeOverrides,
    );
  }

  return applyThemeOverrides(
    {
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
    },
    brand.themeOverrides,
  );
}

/** Re-export for callers that need the default brand's tokens statically. */
export { DEFAULT_BRAND };
