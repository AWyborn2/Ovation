/**
 * Layout for v2 documents (ADR-011 §1): stack groups, collapse and
 * `showWhen` conditions.
 *
 * Seam for L1-C (T1.13–T1.16). The renderer calls these for v2 documents
 * only, after its own rules (hidden layers, sizes, the drop rule), so v1
 * documents are untouched. Today every layer shows and groups draw nothing.
 */
import type {
  GroupLayerV2,
  LayerBox,
  PageKey,
  TemplateLayerV2,
} from "@workspace/scorecard/kind-templates";
import type { CardSize } from "../share-card";

/** What layout and conditions read about the card being drawn. */
export interface LayoutContext {
  kind: string;
  page: PageKey;
  size: CardSize;
  /** A junior card (the render path's junior rules have already run). */
  junior: boolean;
  /** Whether the card has a value for a token (text, image or rows). */
  has: (token: string) => boolean;
  /** Whether the card's photo is drawn (never on a junior card without the server's marker). */
  hasPhoto: boolean;
  /** Whether the card has sponsor logos. */
  hasSponsors: boolean;
}

/** A layer the renderer drew: its box on this size and its positioned markup. */
export interface DrawnLayer {
  layer: TemplateLayerV2;
  box: LayerBox;
  /** The layer's absolutely positioned wrapper, as the renderer emits it. */
  html: string;
}

/** Whether a layer's `showWhen` conditions hold on this card (T1.15). */
export function layerShows(_layer: TemplateLayerV2, _ctx: LayoutContext): boolean {
  return true;
}

/**
 * A group's inner markup from its drawn children (T1.13, T1.14): the
 * children that survived the renderer's rules, in document order. Null
 * draws nothing.
 */
export function renderGroup(
  _group: GroupLayerV2,
  _box: LayerBox,
  _children: readonly DrawnLayer[],
  _ctx: LayoutContext,
): string | null {
  return null;
}
