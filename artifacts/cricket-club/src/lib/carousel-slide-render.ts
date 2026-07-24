/**
 * Carousel slide render-path decision (C2).
 *
 * A carousel (`card_sets`) slide should render through the same Broadcast Dark
 * pack the single-card modal uses — so batched slides look identical to single
 * cards and pick up the tenant logo + sponsors — whenever the pack supports the
 * slide's kind. A slide the pack cannot express keeps the legacy client-side
 * canvas renderer.
 *
 * The single-card modal treats a card as a "pack card" when no BYO template is
 * selected and `packSupportsKind(kind)` (see `share-card-modal.tsx`'s
 * `isPackCard`). Carousel slides never carry a BYO template, so the only extra
 * gate is the per-slide custom layout: a saved layout is a canvas-only feature
 * (the pack renderer has no layer pipeline), so a slide the admin has customised
 * stays on the canvas path to honour those edits.
 */

import { packSupportsKind } from "./pack-render";
import type { CardLayoutLayer } from "@workspace/api-client-react";

/**
 * True when a carousel slide of this `kind` should render through the pack
 * (matching the single-card path). Returns false — keep the canvas renderer —
 * when the pack has no design for the kind, or when the slide carries an admin
 * custom layout the pack cannot reproduce.
 */
export function slideRendersViaPack(
  kind: string,
  layout?: CardLayoutLayer[] | null,
): boolean {
  if (layout && layout.length > 0) return false;
  return packSupportsKind(kind);
}
