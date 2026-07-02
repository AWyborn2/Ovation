import { DEFAULT_BRAND, type ClubBrand } from "@workspace/scorecard";

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

const clampL = (hsl: Hsl, min: number, max: number): Hsl => ({
  ...hsl,
  l: Math.min(max, Math.max(min, hsl.l)),
});

const withL = (hsl: Hsl, l: number): Hsl => ({ ...hsl, l: Math.min(100, Math.max(0, l)) });

const withS = (hsl: Hsl, s: number): Hsl => ({ ...hsl, s: Math.min(hsl.s, s) });

/**
 * Compute the full set of CSS custom properties (structural surfaces + brand
 * accents) for a tenant's brand at a given light/dark mode. Dark mode's
 * formula generalises Halls Head's own pre-existing hardcoded palette
 * (background = primary hue at L24%, card = L27%, etc — reverse-engineered
 * from `index.css`'s original literals) so `deriveThemeTokens(HALLS_HEAD_BRAND,
 * "dark")` reproduces today's look exactly. Light mode mirrors the same shape
 * at inverted lightness with capped saturation, so an arbitrary brand hue
 * reads as a subtle tint rather than a harsh coloured background.
 */
export function deriveThemeTokens(brand: ClubBrand, mode: ThemeMode): Record<string, string> {
  const primary =
    hexToHsl(brand.primaryColour) ?? hexToHsl(DEFAULT_BRAND.primaryColour)!;
  const accent =
    hexToHsl(brand.secondaryColour) ?? hexToHsl(DEFAULT_BRAND.secondaryColour)!;
  const tertiary =
    hexToHsl(brand.tertiaryColour) ?? hexToHsl(DEFAULT_BRAND.tertiaryColour)!;

  if (mode === "dark") {
    const secondary = clampL(tertiary, 15, 30);
    return {
      "--background": hslString(withL(primary, 24)),
      "--foreground": "0 0% 100%",
      "--border": hslString(withL(primary, 35)),
      "--input": hslString(withL(primary, 35)),
      "--ring": hslString(accent),
      "--card": hslString(withL(primary, 27)),
      "--card-foreground": "0 0% 100%",
      "--card-border": hslString(accent),
      "--popover": hslString(withL(primary, 27)),
      "--popover-foreground": "0 0% 100%",
      "--popover-border": hslString(withL(primary, 35)),
      "--primary": hslString(accent),
      "--primary-foreground": hslString(primary),
      "--primary-border": hslString(withL(accent, accent.l - 7)),
      "--secondary": hslString(secondary),
      "--secondary-foreground": hslString(accent),
      "--secondary-border": hslString(withL(secondary, secondary.l - 6)),
      "--muted": hslString(withL(primary, 30)),
      "--muted-foreground": hslString(withL(withS(primary, 10), 75)),
      "--muted-border": hslString(withL(primary, 35)),
      "--accent": hslString(accent),
      "--accent-foreground": hslString(primary),
      "--accent-border": hslString(withL(accent, accent.l - 7)),
      "--destructive": "0 72% 51%",
      "--destructive-foreground": "0 0% 100%",
      "--destructive-border": "0 72% 45%",
    };
  }

  // Light mode: same shape, inverted lightness, saturation capped low so a
  // structural surface reads as a subtle brand tint rather than a fully
  // saturated background.
  const surface = withS(primary, 8);
  const secondaryLight = clampL(tertiary, 88, 94);
  const darkText = withL(primary, Math.min(primary.l, 20));
  return {
    "--background": hslString(withL(surface, 97)),
    "--foreground": hslString(withL(withS(primary, 15), 15)),
    "--border": hslString(withL(withS(primary, 10), 85)),
    "--input": hslString(withL(withS(primary, 10), 85)),
    "--ring": hslString(accent),
    "--card": "0 0% 100%",
    "--card-foreground": hslString(withL(withS(primary, 15), 15)),
    "--card-border": hslString(accent),
    "--popover": "0 0% 100%",
    "--popover-foreground": hslString(withL(withS(primary, 15), 15)),
    "--popover-border": hslString(withL(withS(primary, 10), 85)),
    "--primary": hslString(accent),
    "--primary-foreground": hslString(darkText),
    "--primary-border": hslString(withL(accent, accent.l - 7)),
    "--secondary": hslString(secondaryLight),
    "--secondary-foreground": hslString(withL(tertiary, 20)),
    "--secondary-border": hslString(withL(secondaryLight, secondaryLight.l - 8)),
    "--muted": hslString(withL(surface, 94)),
    "--muted-foreground": hslString(withL(withS(primary, 10), 40)),
    "--muted-border": hslString(withL(withS(primary, 10), 85)),
    "--accent": hslString(accent),
    "--accent-foreground": hslString(darkText),
    "--accent-border": hslString(withL(accent, accent.l - 7)),
    "--destructive": "0 72% 45%",
    "--destructive-foreground": "0 0% 100%",
    "--destructive-border": "0 72% 38%",
  };
}
