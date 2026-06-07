import type { TeamColors } from "./types";

/**
 * Halls Head Cricket Club brand, as carried on the clubs register record (id 2)
 * and surfaced by the API (match detail `hallsHead`, social-settings `brand`).
 * This is the single shape every renderer reads so none carry their own copy of
 * the club's colours or logo.
 */
export interface HallsHeadBrand {
  name: string;
  shortName?: string | null;
  logoUrl?: string | null;
  logoUrl128?: string | null;
  primaryColour?: string | null;
  secondaryColour?: string | null;
  tertiaryColour?: string | null;
}

/**
 * Canonical Halls Head brand. Values mirror the clubs register record (id 2),
 * the brand source of truth. Used only as the last-resort fallback when the
 * DB-sourced brand is unavailable, so the official logo + colours still show.
 */
export const HALLS_HEAD_BRAND: HallsHeadBrand = {
  name: "Halls Head Cricket Club",
  shortName: "HHCC",
  logoUrl:
    "https://res.cloudinary.com/playhq/image/upload/v1/production/ca/5fe82f6b-ee78-4232-9910-f5343547c1c3/1687781014605/logo.png",
  logoUrl128:
    "https://res.cloudinary.com/playhq/image/upload/h_128,w_128/v1/production/ca/5fe82f6b-ee78-4232-9910-f5343547c1c3/1687781014605/logo.png",
  primaryColour: "#333F48",
  secondaryColour: "#FBAC27",
  tertiaryColour: "#42342B",
};

/** Official navy/charcoal — used when a brand record omits the primary colour. */
const FALLBACK_PRIMARY = HALLS_HEAD_BRAND.primaryColour as string;
/** Official gold — used when a brand record omits the secondary colour. */
const FALLBACK_SECONDARY = HALLS_HEAD_BRAND.secondaryColour as string;

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function toHex({ r, g, b }: { r: number; g: number; b: number }): string {
  const c = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

const BLACK = { r: 0, g: 0, b: 0 };

function mix(
  base: { r: number; g: number; b: number },
  target: { r: number; g: number; b: number },
  amount: number,
): { r: number; g: number; b: number } {
  return {
    r: base.r + (target.r - base.r) * amount,
    g: base.g + (target.g - base.g) * amount,
    b: base.b + (target.b - base.b) * amount,
  };
}

/**
 * Build the Halls Head scorecard colour scheme from the brand's primary/secondary
 * colours (navy + gold by default). Gold text on navy is the club's signature
 * look; missing colours degrade to the official fallbacks.
 */
export function deriveHallsHeadColors(
  primaryColour?: string | null,
  secondaryColour?: string | null,
): TeamColors {
  const primary =
    (primaryColour && hexToRgb(primaryColour)) || hexToRgb(FALLBACK_PRIMARY)!;
  const secondary =
    (secondaryColour && hexToRgb(secondaryColour)) ||
    hexToRgb(FALLBACK_SECONDARY)!;
  const primaryHex = toHex(primary);
  const secondaryHex = toHex(secondary);
  return {
    primary: primaryHex,
    secondary: secondaryHex,
    text: secondaryHex,
    accentText: primaryHex,
    rowOdd: toHex(mix(primary, BLACK, 0.18)),
    rowEven: toHex(mix(primary, BLACK, 0.34)),
    rowText: "#e8e8e8",
    totalBg: primaryHex,
    totalText: secondaryHex,
    borderColor: `rgba(${secondary.r},${secondary.g},${secondary.b},0.16)`,
  };
}
