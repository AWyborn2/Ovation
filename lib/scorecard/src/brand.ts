import type { TeamColors } from "./types";

/**
 * The design system's fixed accent set. A tenant's brand colour is one of these
 * five named hues — never an arbitrary hex — so every theme derives from the
 * same navy surface scale plus a known-good accent (Ovation UI migration §2/§8).
 */
export type AccentToken = "amber" | "purple" | "green" | "blue" | "red";

/** Canonical hex for each accent token (identical in light and dark modes). */
export const ACCENT_HEX: Record<AccentToken, string> = {
  amber: "#FFB238",
  purple: "#7C6CF0",
  green: "#3FC98B",
  blue: "#4C8CF5",
  red: "#F0654B",
};

/**
 * A club's brand (logo + colours), the single shape every renderer reads so none
 * carry their own copy of a club's colours or logo. Surfaced by the API
 * (match detail brand field, social-settings `brand`, `GET /tenant-brand`).
 *
 * Colour semantics (after the §351 rename):
 *   - `backgroundColour` — the club's dark background colour (scorecard/share-card fill)
 *   - `primaryColour`    — the club's primary accent (buttons, badges, nav highlights)
 *   - `juniorsColour`    — the juniors section banner colour only
 */
export interface ClubBrand {
  name: string;
  shortName?: string | null;
  logoUrl?: string | null;
  logoUrl128?: string | null;
  /**
   * The tenant's accent, one of the design system's five named hues. When
   * absent (legacy brand rows), renderers snap `primaryColour` (the accent
   * slot) to the nearest token via {@link snapHexToAccentToken}.
   */
  accentToken?: AccentToken | null;
  backgroundColour?: string | null;
  primaryColour?: string | null;
  juniorsColour?: string | null;
  /** Optional site background image. Null/absent = neutral (no image). */
  backgroundUrl?: string | null;
  /** Optional favicon. Null/absent = the platform's neutral default favicon. */
  faviconUrl?: string | null;
}

/** @deprecated Use {@link ClubBrand}. Kept so downstream imports compile. */
export type HallsHeadBrand = ClubBrand;

/**
 * Neutral default brand — the last-resort fallback when a DB-sourced tenant
 * brand is unavailable, so a brand-less club renders as a generic Ovation site
 * (the Ovation placeholder logo + slate colours) rather than inheriting Halls
 * Head's. Per-tenant brands come from `getTenantBrand()`; Halls Head's own brand
 * lives in its tenant record (seeded from the clubs register — see
 * `scripts/seed-tenants`), so this fallback only affects tenants with no brand.
 *
 * `logoUrl`/`logoUrl128` point at the Ovation wordmark
 * (`artifacts/cricket-club/public/ovation-logo.svg`), a placeholder a designed
 * brand asset can replace later without code changes (KTD6). The old neutral
 * `/placeholder-club-logo.svg` stays on disk (unreferenced by this default) so
 * any lingering external references don't 404.
 */
export const DEFAULT_BRAND: ClubBrand = {
  name: "Cricket Club",
  shortName: null,
  logoUrl: "/ovation-logo.svg",
  logoUrl128: "/ovation-logo.svg",
  accentToken: "amber",
  backgroundColour: "#334155",
  primaryColour: "#94A3B8",
  juniorsColour: "#475569",
  backgroundUrl: null,
  faviconUrl: null,
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
  // #FBAC27 snaps to the amber accent — Halls Head keeps its gold look.
  accentToken: "amber",
  backgroundColour: "#333F48",
  primaryColour: "#FBAC27",
  juniorsColour: "#42342B",
  // The design system is flat solid navy — no photography/texture anywhere —
  // so the old scoreboard texture is no longer seeded (UI migration §10).
  backgroundUrl: null,
  // No distinct Halls Head favicon exists — it uses the same neutral favicon
  // (index.html's static default) as every other tenant.
  faviconUrl: null,
};

/** Default background colour — used when a brand record omits the background colour. */
const FALLBACK_BACKGROUND = DEFAULT_BRAND.backgroundColour as string;
/** Default primary accent — used when a brand record omits the primary colour. */
const FALLBACK_PRIMARY = DEFAULT_BRAND.primaryColour as string;

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

/** Hue (0-360) of a hex colour, or null when unparseable/achromatic-ish. */
function hexToHue(hex: string): number | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return null; // grey — no hue to snap on
  let hue: number;
  if (max === r) hue = ((g - b) / d) % 6;
  else if (max === g) hue = (b - r) / d + 2;
  else hue = (r - g) / d + 4;
  hue *= 60;
  return hue < 0 ? hue + 360 : hue;
}

/** Hue of each accent token, matching {@link ACCENT_HEX}. */
const ACCENT_HUES: Record<AccentToken, number> = {
  amber: 38,
  purple: 246,
  green: 154,
  blue: 215,
  red: 6,
};

/**
 * Snap a legacy stored hex to the nearest design-system accent token by hue
 * distance on the colour wheel (Halls Head's #FBAC27 → amber). Greys and
 * unparseable values land on the platform default, amber.
 */
export function snapHexToAccentToken(hex?: string | null): AccentToken {
  const hue = hex ? hexToHue(hex) : null;
  if (hue == null) return "amber";
  let best: AccentToken = "amber";
  let bestDist = Infinity;
  for (const [token, accentHue] of Object.entries(ACCENT_HUES) as Array<
    [AccentToken, number]
  >) {
    const raw = Math.abs(hue - accentHue);
    const dist = Math.min(raw, 360 - raw);
    if (dist < bestDist) {
      bestDist = dist;
      best = token;
    }
  }
  return best;
}

/**
 * The accent token a brand resolves to: its explicit `accentToken` when set,
 * else its stored accent-slot hex (`primaryColour`, falling back to
 * `backgroundColour`) snapped to the nearest token, else amber.
 */
export function resolveAccentToken(brand: ClubBrand): AccentToken {
  if (brand.accentToken && brand.accentToken in ACCENT_HEX) return brand.accentToken;
  return snapHexToAccentToken(brand.primaryColour ?? brand.backgroundColour);
}

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
 * Build a club's scorecard colour scheme from its background/primary colours
 * (primary text on background is the signature look); missing colours degrade to
 * the default fallbacks.
 */
export function deriveClubColors(
  backgroundColour?: string | null,
  primaryColour?: string | null,
): TeamColors {
  const background =
    (backgroundColour && hexToRgb(backgroundColour)) || hexToRgb(FALLBACK_BACKGROUND)!;
  const primary =
    (primaryColour && hexToRgb(primaryColour)) ||
    hexToRgb(FALLBACK_PRIMARY)!;
  const backgroundHex = toHex(background);
  const primaryHex = toHex(primary);
  return {
    primary: backgroundHex,
    secondary: primaryHex,
    text: primaryHex,
    accentText: backgroundHex,
    rowOdd: toHex(mix(background, BLACK, 0.18)),
    rowEven: toHex(mix(background, BLACK, 0.34)),
    rowText: "#e8e8e8",
    totalBg: backgroundHex,
    totalText: primaryHex,
    borderColor: `rgba(${primary.r},${primary.g},${primary.b},0.16)`,
  };
}

/** @deprecated Use {@link deriveClubColors}. */
export const deriveHallsHeadColors = deriveClubColors;
