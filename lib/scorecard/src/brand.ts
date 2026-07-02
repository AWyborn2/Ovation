import type { TeamColors } from "./types";

/**
 * A club's brand (logo + colours), the single shape every renderer reads so none
 * carry their own copy of a club's colours or logo. Surfaced by the API
 * (match detail brand field, social-settings `brand`, `GET /tenant-brand`).
 */
export interface ClubBrand {
  name: string;
  shortName?: string | null;
  logoUrl?: string | null;
  logoUrl128?: string | null;
  primaryColour?: string | null;
  secondaryColour?: string | null;
  tertiaryColour?: string | null;
}

/** @deprecated Use {@link ClubBrand}. Kept so downstream imports compile. */
export type HallsHeadBrand = ClubBrand;

/**
 * Neutral default brand — the last-resort fallback when a DB-sourced tenant
 * brand is unavailable, so a brand-less club renders as a generic Ovation site
 * (a neutral placeholder logo + slate colours) rather than inheriting Halls
 * Head's. Per-tenant brands come from `getTenantBrand()`; Halls Head's own brand
 * lives in its tenant record (seeded from the clubs register — see
 * `scripts/seed-tenants`), so this fallback only affects tenants with no brand.
 */
export const DEFAULT_BRAND: ClubBrand = {
  name: "Cricket Club",
  shortName: null,
  logoUrl: "/placeholder-club-logo.svg",
  logoUrl128: "/placeholder-club-logo.svg",
  primaryColour: "#334155",
  secondaryColour: "#94A3B8",
  tertiaryColour: "#475569",
};

/**
 * Halls Head's real brand values. Used ONLY to seed tenant #1's record
 * (`scripts/seed-tenants`); the runtime fallback is the neutral
 * {@link DEFAULT_BRAND} above. Deliberately NOT an alias of DEFAULT_BRAND —
 * keeping the two distinct is exactly what stops Halls Head's brand leaking onto
 * other clubs.
 */
export const HALLS_HEAD_BRAND: ClubBrand = {
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

/** Default primary — used when a brand record omits the primary colour. */
const FALLBACK_PRIMARY = DEFAULT_BRAND.primaryColour as string;
/** Default secondary — used when a brand record omits the secondary colour. */
const FALLBACK_SECONDARY = DEFAULT_BRAND.secondaryColour as string;

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
 * Build a club's scorecard colour scheme from its primary/secondary colours
 * (secondary text on primary is the signature look); missing colours degrade to
 * the default fallbacks.
 */
export function deriveClubColors(
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

/** @deprecated Use {@link deriveClubColors}. */
export const deriveHallsHeadColors = deriveClubColors;
