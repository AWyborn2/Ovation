import type { TeamColors } from "./types";
import { DEFAULT_BRAND, deriveClubColors } from "./brand";

/**
 * Default club colours — the tenant #1 navy & gold, derived from the default
 * brand. Used as the scorecard fallback when a match carries no DB-sourced brand.
 */
export const DEFAULT_TEAM_COLORS: TeamColors = deriveClubColors(
  DEFAULT_BRAND.primaryColour,
  DEFAULT_BRAND.secondaryColour,
);

/** @deprecated Use {@link DEFAULT_TEAM_COLORS}. */
export const HALLS_HEAD_COLORS: TeamColors = DEFAULT_TEAM_COLORS;

/** Neutral dark scheme used when an opposition club has no brand colours. */
const NEUTRAL_OPPOSITION: TeamColors = {
  primary: "#1f2733",
  secondary: "#9aa6b2",
  text: "#f0f2f5",
  accentText: "#1f2733",
  rowOdd: "#1a212b",
  rowEven: "#151b23",
  rowText: "#e0e3e8",
  totalBg: "#1f2733",
  totalText: "#f0f2f5",
  borderColor: "rgba(154,166,178,0.18)",
};

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

/** Mix a colour toward a target (amount 0..1). */
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

const BLACK = { r: 0, g: 0, b: 0 };
const WHITE = { r: 255, g: 255, b: 255 };

/** Relative luminance (0..1) for contrast decisions. */
function luminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** Pick a readable text colour (white or near-black) for a background. */
function readableOn(bg: { r: number; g: number; b: number }): string {
  return luminance(bg) > 0.45 ? "#10171f" : "#ffffff";
}

/**
 * Build a full colour scheme for an opposition club from its (optional) brand
 * colours, degrading to a neutral dark scheme when nothing usable is provided.
 */
export function deriveOppositionColors(
  primaryColour: string | null | undefined,
  secondaryColour: string | null | undefined,
): TeamColors {
  const primary = primaryColour ? hexToRgb(primaryColour) : null;
  if (!primary) return NEUTRAL_OPPOSITION;

  const secondary = (secondaryColour && hexToRgb(secondaryColour)) ||
    mix(primary, WHITE, 0.55);

  const primaryHex = toHex(primary);
  const secondaryHex = toHex(secondary);
  return {
    primary: primaryHex,
    secondary: secondaryHex,
    text: readableOn(primary),
    accentText: readableOn(secondary),
    rowOdd: toHex(mix(primary, BLACK, 0.32)),
    rowEven: toHex(mix(primary, BLACK, 0.46)),
    rowText: "#e8e8e8",
    totalBg: primaryHex,
    totalText: readableOn(primary) === "#ffffff" ? secondaryHex : "#10171f",
    borderColor: `rgba(${secondary.r},${secondary.g},${secondary.b},0.18)`,
  };
}
