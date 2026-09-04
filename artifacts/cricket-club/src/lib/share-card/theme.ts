// Palette derivation: hex helpers, the tenant-brand default theme, the forced
// junior brown theme, and the resolved Palette the canvas helpers draw from.
import { DEFAULT_BRAND, type ClubBrand } from "@workspace/scorecard";
import type { CardTheme, ShareCardInput } from "./types";

export type Palette = {
  bgDark: string;
  bgPanel: string;
  accent: string;
  accentSoft: string; // accent @ 0.18
  accentBorder: string; // accent @ 0.4
  accentStrip: string; // accent @ 0.5
  textLight: string;
  textMuted: string; // textLight @ 0.65
};

export const hexToRgb = (hex: string): [number, number, number] => {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  const n = parseInt(h, 16);
  if (h.length !== 6 || Number.isNaN(n)) return [251, 208, 57];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export const rgba = (hex: string, alpha: number): string => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// Lighten a hex colour toward white by `amount` (0..1) — used to derive the
// slightly raised panel shade from the club's navy primary.
const lighten = (hex: string, amount: number): string => {
  const [r, g, b] = hexToRgb(hex);
  const c = (n: number) => Math.round(n + (255 - n) * amount);
  return `#${[c(r), c(g), c(b)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
};

// The default card theme IS the current tenant's brand (primary/secondary from
// the resolved `opts.brand`, neutral DEFAULT_BRAND when there's none).
// Selectable card themes still override these. textLight is a neutral cream
// for legibility on a dark background.
const themeFromBrand = (brand?: ClubBrand | null): CardTheme => {
  const primary = brand?.backgroundColour || DEFAULT_BRAND.backgroundColour || "#334155";
  const secondary = brand?.primaryColour || DEFAULT_BRAND.primaryColour || "#94A3B8";
  return {
    bgDark: primary,
    bgPanel: lighten(primary, 0.1),
    accent: secondary,
    textLight: "#F5F2E8",
  };
};

// Junior cards are forced onto this brown background, regardless of any
// selected card theme, so junior social content is instantly distinguishable
// from the senior cards. Per Task #200 this brown branding intentionally
// overrides the club's own primary colour; the accent still follows the
// tenant's brand (or the neutral default) rather than a fixed hex.
const JUNIOR_BROWN = "#42342B";
export const juniorThemeFromBrand = (brand?: ClubBrand | null): CardTheme => ({
  bgDark: JUNIOR_BROWN,
  bgPanel: lighten(JUNIOR_BROWN, 0.12),
  accent: brand?.primaryColour || DEFAULT_BRAND.primaryColour || "#94A3B8",
  textLight: "#F5EFE6",
});

// True when an input is a junior-flagged card kind.
export const isJuniorInput = (input: ShareCardInput): boolean =>
  "junior" in input && input.junior === true;

export const resolvePalette = (theme?: CardTheme | null, brand?: ClubBrand | null): Palette => {
  const fallback = themeFromBrand(brand);
  const t = theme ?? fallback;
  return {
    bgDark: t.bgDark || fallback.bgDark,
    bgPanel: t.bgPanel || fallback.bgPanel,
    accent: t.accent || fallback.accent,
    accentSoft: rgba(t.accent || fallback.accent, 0.18),
    accentBorder: rgba(t.accent || fallback.accent, 0.4),
    accentStrip: rgba(t.accent || fallback.accent, 0.5),
    textLight: t.textLight || fallback.textLight,
    textMuted: rgba(t.textLight || fallback.textLight, 0.65),
  };
};

// A tenant with no configured hashtag gets one derived from its short name
// (Halls Head's seeded shortName "HHCC" reproduces the old literal exactly);
// a brand-less tenant gets no hashtag rather than Halls Head's.
export const defaultHashtag = (brand?: ClubBrand | null): string =>
  brand?.shortName ? `#${brand.shortName.replace(/\s+/g, "")}` : "";
