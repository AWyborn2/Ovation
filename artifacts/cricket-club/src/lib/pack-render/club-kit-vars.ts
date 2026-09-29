/**
 * Club Kit colour derivation (Club Colours handoff §1).
 *
 * Every Club Kit colour is computed from the club's brand, once per card, and
 * emitted as `--ck-*` custom properties on the card root (and on a free-layer
 * overlay that carries Club Kit elements). The derivation guarantees legible
 * type for any brand: `--ck-onp` is whichever of white / ink reads better on the
 * primary, and `--ck-pt` is the primary lifted toward white until it clears
 * 4.5:1 on the card base, so a club with a dark or saturated primary still gets
 * readable cards.
 *
 * Inputs are only ever strict hex (see `normaliseBrandHex`), so the output is
 * safe to place inside an inline style.
 */

import { JUNIOR_PANEL, type PackCardData, type PackTokens } from "./types";
import { contrastRatio, MIN_TEXT_CONTRAST, normaliseBrandHex } from "./tokens";

/** Fixed dark base (the handoff's `ink`). */
export const CK_INK = "#10151B";
/** Secondary used when a club has no background colour. */
export const CK_SECONDARY_FALLBACK = "#333F48";

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** Linear RGB interpolation from `a` toward `b` by `t` (0–1). */
export function mixHex(a: string, b: string, t: number): string {
  const A = rgb(a);
  const B = rgb(b);
  return (
    "#" +
    A.map((v, i) =>
      Math.round(v + (B[i] - v) * t)
        .toString(16)
        .padStart(2, "0"),
    )
      .join("")
      .toUpperCase()
  );
}

export function rgbaHex(hex: string, alpha: number): string {
  return `rgba(${rgb(hex).join(",")},${alpha})`;
}

export interface ClubKitPalette {
  base: string;
  base2: string;
  p: string;
  s: string;
  onp: string;
  pt: string;
  chalk: string;
}

/** The handoff's derived palette for a primary / secondary / juniors set. */
export function deriveClubKitPalette(input: {
  primary: string;
  secondary: string;
  juniors: string;
  chalk: string;
  junior: boolean;
}): ClubKitPalette {
  const { primary, chalk, junior } = input;
  const base = junior ? mixHex(input.juniors, "#000000", 0.45) : CK_INK;
  const s = junior ? input.juniors : input.secondary;
  const base2 = mixHex(base, s, 0.35);
  const onp =
    contrastRatio(primary, "#FFFFFF") >= contrastRatio(primary, CK_INK) ? "#FFFFFF" : CK_INK;
  let pt = primary;
  for (let i = 0; i < 6 && contrastRatio(pt, base) < MIN_TEXT_CONTRAST; i++) {
    pt = mixHex(pt, "#FFFFFF", 0.22);
  }
  return { base, base2, p: primary, s, onp, pt, chalk };
}

/**
 * The palette for a render: the resolved accent (so themes and per-card
 * overrides still apply) as the primary, the club's background colour as the
 * secondary, and its juniors colour for junior cards.
 */
export function clubKitPaletteFor(
  tokens: PackTokens,
  brand: PackCardData["brand"] | null | undefined,
  junior: boolean,
): ClubKitPalette {
  const primary = normaliseBrandHex(tokens.accent) ?? "#FBAC27";
  const secondary = normaliseBrandHex(brand?.backgroundColour) ?? CK_SECONDARY_FALLBACK;
  const juniors = normaliseBrandHex(brand?.juniorsColour) ?? JUNIOR_PANEL;
  const chalk = normaliseBrandHex(tokens.textLight) ?? "#F2F5F8";
  return deriveClubKitPalette({ primary, secondary, juniors, chalk, junior });
}

/** `--ck-*` declarations for a palette (no leading `;`). */
export function clubKitVars(p: ClubKitPalette): string {
  return [
    `--ck-base:${p.base}`,
    `--ck-base2:${p.base2}`,
    `--ck-p:${p.p}`,
    `--ck-s:${p.s}`,
    `--ck-onp:${p.onp}`,
    `--ck-pt:${p.pt}`,
    `--ck-glowc:${rgbaHex(p.p, 0.16)}`,
    `--ck-chalk:${p.chalk}`,
    `--ck-chalk2:${rgbaHex(p.chalk, 0.68)}`,
    `--ck-panel:${rgbaHex(p.chalk, 0.07)}`,
    `--ck-line:${rgbaHex(p.chalk, 0.14)}`,
    `--ck-base-35:${rgbaHex(p.base, 0.35)}`,
    `--ck-base-55:${rgbaHex(p.base, 0.55)}`,
    `--ck-base-70:${rgbaHex(p.base, 0.7)}`,
    `--ck-p-22:${rgbaHex(p.p, 0.22)}`,
  ].join(";");
}
