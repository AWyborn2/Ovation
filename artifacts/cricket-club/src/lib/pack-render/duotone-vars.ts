/**
 * Duotone colour derivation (new pack brief §2.3, `docs/plans/2026-10-20-new-social-pack-brief.md`).
 *
 * Every Duotone colour comes from the club's tokens, computed once per card
 * and emitted as `--dt-*` custom properties on the card root, like Club Kit's
 * `--ck-*` palette. The photo's tones are remapped to the club's colours by an
 * inline SVG gradient map (`duotoneFilterSvg`): shadows → ink, mid-tones →
 * secondary, highlights → primary. It renders the same in the browser and in
 * the server's headless Chromium.
 *
 * Inputs are only ever strict hex (see `normaliseBrandHex`), so the output is
 * safe to place inside an inline style or attribute.
 */

import type { PackCardData, PackTokens } from "./types";
import { contrastRatio, normaliseBrandHex, relativeLuminance } from "./tokens";
import { mixHex, rgbaHex } from "./club-kit-vars";

/** Base used when a club has no usable ink. */
export const DT_INK_FALLBACK = "#10151B";
/** Secondary used when a club has no background colour. */
export const DT_SECONDARY_FALLBACK = "#333F48";
/** Primary used when a club has no accent. */
export const DT_PRIMARY_FALLBACK = "#FBAC27";

/** White type on the ink must clear this (the brief's 7:1). */
const INK_CONTRAST = 7;
/** The "v" and other primary type on the white sheet. */
const ON_LIGHT_CONTRAST = 3;
/** The round number over a dark photo. */
const ON_DARK_CONTRAST = 4.5;
/** The smallest luminance gap between the duotone's shadows and highlights. */
const MIN_DUOTONE_GAP = 0.35;

export interface DuotonePalette {
  ink: string;
  /** Secondary (duotone mid-tones, grade chip, no-photo glow). */
  s: string;
  /** Primary (duotone highlights, round number, Home chip, "v"). */
  p: string;
  /** White or ink, whichever reads better on the primary. */
  onP: string;
  /** White or ink, whichever reads better on the secondary. */
  onS: string;
  /** The primary darkened toward ink until it clears 3:1 on white. */
  pOnLight: string;
  /** The primary lifted toward white until it clears 4.5:1 on the ink. */
  pOnDark: string;
  /** Gradient-map stops, darkest first: [shadows, mid-tones, highlights]. */
  stops: [string, string, string];
}

const lum = (hex: string) => relativeLuminance(hex) ?? 0;

const better = (bg: string, ink: string) =>
  contrastRatio(bg, "#FFFFFF") >= contrastRatio(bg, ink) ? "#FFFFFF" : ink;

/** The derived palette for a primary / secondary / ink set. */
export function deriveDuotonePalette(input: {
  primary: string;
  secondary: string;
  ink?: string | null;
}): DuotonePalette {
  const p = input.primary;
  const s = input.secondary;
  // The ink: the club's own stage colour, else its secondary, darkened until
  // white type clears 7:1 on it.
  let ink = input.ink ?? s;
  for (let i = 0; i < 12 && contrastRatio(ink, "#FFFFFF") < INK_CONTRAST; i++) {
    ink = mixHex(ink, "#000000", 0.2);
  }
  let pOnLight = p;
  for (let i = 0; i < 12 && contrastRatio(pOnLight, "#FFFFFF") < ON_LIGHT_CONTRAST; i++) {
    pOnLight = mixHex(pOnLight, ink, 0.18);
  }
  let pOnDark = p;
  for (let i = 0; i < 12 && contrastRatio(pOnDark, ink) < ON_DARK_CONTRAST; i++) {
    pOnDark = mixHex(pOnDark, "#FFFFFF", 0.2);
  }
  // The lightest colour is always the highlights; a dark-on-dark club gets its
  // highlight lifted toward white so the photo still reads.
  let [mid, high] = lum(p) >= lum(s) ? [s, p] : [p, s];
  for (let i = 0; i < 12 && lum(high) - lum(ink) < MIN_DUOTONE_GAP; i++) {
    high = mixHex(high, "#FFFFFF", 0.2);
  }
  if (lum(mid) < lum(ink)) mid = ink;
  return {
    ink,
    s,
    p,
    onP: better(p, ink),
    onS: better(s, ink),
    pOnLight,
    pOnDark,
    stops: [ink, mid, high],
  };
}

/**
 * The palette for a render: the resolved accent as the primary (so themes and
 * per-card overrides still apply), the club's background colour as the
 * secondary, and the resolved stage as the ink. Junior cards wear the same.
 */
export function duotonePaletteFor(
  tokens: PackTokens,
  brand: PackCardData["brand"] | null | undefined,
): DuotonePalette {
  const primary = normaliseBrandHex(tokens.accent) ?? DT_PRIMARY_FALLBACK;
  const secondary = normaliseBrandHex(brand?.backgroundColour) ?? DT_SECONDARY_FALLBACK;
  const ink = normaliseBrandHex(tokens.ink) ?? DT_INK_FALLBACK;
  return deriveDuotonePalette({ primary, secondary, ink });
}

/** The gradient map's element id: one per palette, so cards of two palettes on a page never clash. */
export function duotoneFilterId(p: DuotonePalette): string {
  return `dt-duo-${p.stops.map((c) => c.slice(1).toLowerCase()).join("-")}`;
}

/** `--dt-*` declarations for a palette (no leading `;`). */
export function duotoneVars(p: DuotonePalette): string {
  return [
    `--dt-ink:${p.ink}`,
    `--dt-s:${p.s}`,
    `--dt-p:${p.p}`,
    `--dt-on-p:${p.onP}`,
    `--dt-on-s:${p.onS}`,
    `--dt-p-on-light:${p.pOnLight}`,
    `--dt-p-on-dark:${p.pOnDark}`,
    `--dt-ink-0:${rgbaHex(p.ink, 0)}`,
    `--dt-ink-55:${rgbaHex(p.ink, 0.55)}`,
    `--dt-ink-80:${rgbaHex(p.ink, 0.8)}`,
    `--dt-p-22:${rgbaHex(p.p, 0.22)}`,
    `--dt-filter:url(#${duotoneFilterId(p)})`,
  ].join(";");
}

function channel(hex: string, shift: number): string {
  return String(+(((parseInt(hex.slice(1), 16) >> shift) & 0xff) / 255).toFixed(4));
}

/**
 * The gradient map as an inline SVG filter: the photo to luminance, then each
 * channel through a three-stop table. Photo layers reference it by
 * `filter:var(--dt-filter)`.
 */
export function duotoneFilterSvg(p: DuotonePalette): string {
  const table = (shift: number) => p.stops.map((c) => channel(c, shift)).join(" ");
  return (
    `<svg data-dt-defs="1" aria-hidden="true" width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden">` +
    `<filter id="${duotoneFilterId(p)}" color-interpolation-filters="sRGB" x="0" y="0" width="100%" height="100%">` +
    `<feColorMatrix type="matrix" values=".2126 .7152 .0722 0 0 .2126 .7152 .0722 0 0 .2126 .7152 .0722 0 0 0 0 0 1 0"/>` +
    `<feComponentTransfer>` +
    `<feFuncR type="table" tableValues="${table(16)}"/>` +
    `<feFuncG type="table" tableValues="${table(8)}"/>` +
    `<feFuncB type="table" tableValues="${table(0)}"/>` +
    `</feComponentTransfer></filter></svg>`
  );
}
