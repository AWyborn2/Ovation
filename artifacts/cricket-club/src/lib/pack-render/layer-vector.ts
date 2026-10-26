/**
 * Vector layers (ADR-011 §1, L1-D T1.22): SVG markup drawn from L1-B's
 * sanitiser, so only allowlisted elements and attributes reach the card,
 * whatever was stored. Fills and strokes may be colour tokens
 * (`fill="var(--gold)"`), which resolve against the card's palette.
 *
 * The SVG fills the layer's box, and its ids are namespaced per layer: a
 * library page draws many templates at once, and two `url(#grad)` must never
 * point at each other's gradients.
 */
import { sanitiseSvg, type VectorLayerV2 } from "@workspace/scorecard/kind-templates";
import type { PackTokens } from "./types";

export interface VectorContext {
  tokens?: PackTokens;
}

/** Ids namespaced by layer: `id="x"` → `id="v-<layer>-x"`, and every `url(#x)` with it. */
function namespaceIds(svg: string, layerId: string): string {
  const prefix = `v-${layerId.replace(/[^\w-]/g, "_")}-`;
  return svg
    .replace(/(\sid=")([\w.-]+)"/g, (_all, head: string, id: string) => `${head}${prefix}${id}"`)
    .replace(/url\(\s*#([\w.-]+)\s*\)/g, (_all, id: string) => `url(#${prefix}${id})`);
}

/** The root <svg> sized to the layer's box (its own width and height dropped). */
function fillBox(svg: string): string {
  return svg.replace(/^<svg\b([^>]*?)(\/?)>/, (_all, attrs: string, close: string) => {
    const rest = attrs.replace(/\s(?:width|height)="[^"]*"/g, "");
    const aspect = /\spreserveAspectRatio=/.test(rest)
      ? ""
      : ' preserveAspectRatio="xMidYMid meet"';
    return `<svg${rest} width="100%" height="100%"${aspect} style="display:block;overflow:visible"${close}>`;
  });
}

/** A vector layer's inner markup; null when its markup doesn't pass the sanitiser. */
export function renderVector(layer: VectorLayerV2, _ctx: VectorContext): string | null {
  const result = sanitiseSvg(layer.svg);
  if (!result.svg) return null;
  return `<div data-vector style="width:100%;height:100%">${fillBox(namespaceIds(result.svg, layer.id))}</div>`;
}
