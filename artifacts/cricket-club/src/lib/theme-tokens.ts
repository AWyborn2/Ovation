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
 * The design system's fixed surface scales (Ovation UI migration §2/§4).
 * Dark mode is the system's native navy scale (#0B0F1A page → #131826 card →
 * #1B2236 elevated → #232B3D border); light mode is the companion theme built
 * from the same hue family at inverted lightness. No tenant hue ever reaches
 * a structural surface — only the accent slots below vary per tenant.
 */
const NAVY_DARK = {
  950: "222 33% 8%", // #0B0F1A page
  900: "220 30% 11%", // #131826 card
  800: "222 28% 16%", // #1B2236 elevated / muted
  700: "220 23% 21%", // #232B3D border
};
const INK_DARK = { 0: "220 20% 96%", 2: "218 12% 60%" }; // #F5F7FA / #8D96A8

const NAVY_LIGHT = {
  bg: "220 25% 97%", // #F5F6FA
  card: "0 0% 100%", // #FFFFFF
  elevated: "220 20% 94%", // #EBEDF2
  border: "220 20% 88%", // #D9DDE6
};
const INK_LIGHT = { 0: "222 30% 12%", 2: "218 12% 42%" }; // #14171F / #5D6472

/**
 * The five accent hues a tenant may pick as their brand colour — identical in
 * both modes; only the surrounding surface inverts. Keys match the shared
 * `AccentToken` union in `@workspace/scorecard` (which also carries the
 * canonical hex values as `ACCENT_HEX`).
 */
export const ACCENT_TOKENS: Record<AccentToken, string> = {
  // Exact hexToHsl() conversions of ACCENT_HEX — keep the two in lockstep.
  amber: "37 100% 61%", // #FFB238 — the platform default
  purple: "247 81% 68%", // #7C6CF0
  green: "153 56% 52%", // #3FC98B
  blue: "217 89% 63%", // #4C8CF5
  red: "9 85% 62%", // #F0654B
};
export type { AccentToken };

/**
 * Compute the full set of CSS custom properties (structural surfaces + accent)
 * for a tenant's brand at a given light/dark mode. Surfaces are the fixed navy
 * (dark) / paper (light) scales above; the brand-variable part is the accent
 * derived directly from `brand.secondaryColour` via hex→HSL conversion.
 *
 * Using hexToHsl directly (rather than snapping to one of five tokens) means
 * any hex saved by the admin — including white, navy, or a custom club colour
 * — is faithfully reflected in the CSS custom properties. Preset hex values
 * (from ACCENT_HEX) round-trip cleanly through hexToHsl/hslString because
 * they were derived from the ACCENT_TOKENS HSL values in the first place, so
 * existing tenants on preset tokens see no visual change.
 *
 * Foreground is contrast-aware: light accents (L > 55) use dark navy text;
 * dark accents (L ≤ 55) use light ink — so neither white-on-white nor
 * navy-on-navy is ever produced regardless of what colour the admin chose.
 *
 * Depth comes from surface-level contrast + hairline borders — never box-shadow.
 */
export function deriveThemeTokens(brand: ClubBrand, mode: ThemeMode): Record<string, string> {
  // Direct hex→HSL: faithful to the saved colour, no token snap.
  const hsl = hexToHsl(brand.secondaryColour);
  const accent = hsl ? hslString(hsl) : ACCENT_TOKENS.amber;
  // Contrast-aware foreground: light fills (L > 55) → dark navy; dark fills → light ink.
  const accentForeground = hsl && hsl.l > 55 ? NAVY_DARK[950] : INK_DARK[0];

  if (mode === "dark") {
    return {
      "--background": NAVY_DARK[950],
      "--foreground": INK_DARK[0],
      "--border": NAVY_DARK[700],
      "--input": NAVY_DARK[700],
      "--ring": accent,
      "--card": NAVY_DARK[900],
      "--card-foreground": INK_DARK[0],
      "--card-border": NAVY_DARK[700],
      "--popover": NAVY_DARK[900],
      "--popover-foreground": INK_DARK[0],
      "--popover-border": NAVY_DARK[700],
      "--primary": accent,
      "--primary-foreground": accentForeground,
      "--primary-border": accent,
      "--secondary": NAVY_DARK[800],
      "--secondary-foreground": INK_DARK[2],
      "--secondary-border": NAVY_DARK[700],
      "--muted": NAVY_DARK[800],
      "--muted-foreground": INK_DARK[2],
      "--muted-border": NAVY_DARK[700],
      "--accent": accent,
      "--accent-foreground": accentForeground,
      "--accent-border": accent,
      "--destructive": ACCENT_TOKENS.red,
      "--destructive-foreground": "0 0% 100%",
      "--destructive-border": ACCENT_TOKENS.red,
    };
  }

  return {
    "--background": NAVY_LIGHT.bg,
    "--foreground": INK_LIGHT[0],
    "--border": NAVY_LIGHT.border,
    "--input": NAVY_LIGHT.border,
    "--ring": accent,
    "--card": NAVY_LIGHT.card,
    "--card-foreground": INK_LIGHT[0],
    "--card-border": NAVY_LIGHT.border,
    "--popover": NAVY_LIGHT.card,
    "--popover-foreground": INK_LIGHT[0],
    "--popover-border": NAVY_LIGHT.border,
    "--primary": accent,
    "--primary-foreground": accentForeground,
    "--primary-border": accent,
    "--secondary": NAVY_LIGHT.elevated,
    "--secondary-foreground": INK_LIGHT[2],
    "--secondary-border": NAVY_LIGHT.border,
    "--muted": NAVY_LIGHT.elevated,
    "--muted-foreground": INK_LIGHT[2],
    "--muted-border": NAVY_LIGHT.border,
    "--accent": accent,
    "--accent-foreground": accentForeground,
    "--accent-border": accent,
    // Deepened from the red accent for AA text contrast on white surfaces;
    // tinted fill chips keep using the accent-red at full lightness.
    "--destructive": "6 78% 46%",
    "--destructive-foreground": "0 0% 100%",
    "--destructive-border": "6 78% 40%",
  };
}

/** Re-export for callers that need the default brand's tokens statically. */
export { DEFAULT_BRAND };
