/**
 * Layer styles beyond v1 (ADR-011 §1 Styles): fills and gradients, text
 * fills, borders, shadows, blend modes, photo filters and the derived
 * palettes a document uses.
 *
 * Seam for L1-D (T1.18–T1.21). The renderer calls `layerBoxCss` and
 * `textStyleCss` for v2 documents only, so v1 documents are untouched
 * whatever is added here; both draw nothing yet. `paletteVars` is the
 * derived-palette rule every document already follows (Club Kit's `--ck-*`
 * when an element or a style uses it); L1-D adds Duotone's `--dt-*` and the
 * document's declared `palettes`.
 */
import type {
  NormalisedDocument,
  TemplateLayerV2,
  TemplateStyleV2,
} from "@workspace/scorecard/kind-templates";
import {
  clubKitPaletteFor,
  clubKitVars,
  clubStageVars,
  type ClubKitPalette,
} from "./club-kit-vars";
import type { PackCardData, PackTokens } from "./types";

/** Declarations a v2 layer's style adds to its box (fill, border, shadow, blend, filter). */
export function layerBoxCss(_layer: TemplateLayerV2): string[] {
  return [];
}

/** Declarations a v2 text style adds after v1's text CSS (text fill, text shadow, line height). */
export function textStyleCss(_style: TemplateStyleV2 | undefined): string[] {
  return [];
}

/** The palette a template overlay carries: Club Kit's, plus the club stage. */
const templatePaletteVars = (p: ClubKitPalette) => `${clubKitVars(p)};${clubStageVars(p)}`;

/**
 * Derived-palette variables for the free-layer overlay, as `;name:value…`
 * (empty when none is used). Library elements read the Club Kit palette, so
 * an overlay with an element gets it, as does one whose styles name it
 * (`var(--ck-stage)`).
 */
export function paletteVars(
  _doc: NormalisedDocument,
  layers: readonly TemplateLayerV2[],
  ctx: { tokens?: PackTokens; brand?: PackCardData["brand"] | null },
): string {
  const usesClubKit =
    layers.some((l) => l.kind === "element" && !l.hidden) ||
    JSON.stringify(layers).includes("var(--ck-");
  return usesClubKit && ctx.tokens
    ? `;${templatePaletteVars(clubKitPaletteFor(ctx.tokens, ctx.brand))}`
    : "";
}
