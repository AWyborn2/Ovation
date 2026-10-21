/**
 * Vector layers (ADR-011 §1): sanitised SVG markup with token fills.
 *
 * Seam for L1-D (T1.22), which draws the layer from the sanitiser's output
 * (L1-B, T1.9). Until then a vector layer draws nothing.
 */
import type { VectorLayerV2 } from "@workspace/scorecard/kind-templates";
import type { PackTokens } from "./types";

export interface VectorContext {
  tokens?: PackTokens;
}

/** A vector layer's inner markup; null when it isn't drawn. */
export function renderVector(_layer: VectorLayerV2, _ctx: VectorContext): string | null {
  return null;
}
