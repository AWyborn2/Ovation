/**
 * Row capacity for format v2 pages (ADR-011 §1 Capacity, T1.10): how many
 * rows of a repeat a page holds at a size, read from its rows layer's
 * geometry. It replaces `CONTENT_LAYOUTS[...].capacity`, so the Weekend
 * Carousel's day capacity and the slide planner read the template.
 *
 * A rows layer inside a stack group keeps its own height (stacks only place
 * children), so its capacity is read from its own box, and it is only on the
 * sizes its groups are on.
 */
import { rowsCapacity, TEMPLATE_SIZE_ORDER, type TemplateSize } from "./document";
import type { PageKey, TemplateDocumentV2, TemplateLayerV2 } from "./format";

const onSize = (layer: TemplateLayerV2, size: TemplateSize) =>
  !layer.hidden && (!layer.sizes || layer.sizes.includes(size));

/** The first rows layer bound to `repeat` that is drawn on `size`, groups searched depth first. */
function findRowsLayer(
  layers: readonly TemplateLayerV2[],
  size: TemplateSize,
  repeat: string,
): TemplateLayerV2 | null {
  for (const layer of layers) {
    if (!onSize(layer, size)) continue;
    if (layer.kind === "rows" && layer.rows?.repeat === repeat) return layer;
    if (layer.kind === "group" && Array.isArray(layer.children)) {
      const inner = findRowsLayer(layer.children, size, repeat);
      if (inner) return inner;
    }
  }
  return null;
}

/**
 * How many rows of `repeat` the document's `page` holds on `size`: the first
 * rows layer bound to it. Null when the page has no such layer on that size.
 */
export function pageRowsCapacity(
  doc: TemplateDocumentV2,
  page: PageKey,
  size: TemplateSize,
  repeat: string,
): number | null {
  const layer = findRowsLayer(doc.pages[page]?.layers ?? [], size, repeat);
  return layer ? rowsCapacity(layer, size) : null;
}

/** A page's capacity for `repeat` at every size it has a rows layer on. */
export function pageRowsCapacities(
  doc: TemplateDocumentV2,
  page: PageKey,
  repeat: string,
): Partial<Record<TemplateSize, number>> {
  const out: Partial<Record<TemplateSize, number>> = {};
  for (const size of TEMPLATE_SIZE_ORDER) {
    const n = pageRowsCapacity(doc, page, size, repeat);
    if (n !== null) out[size] = n;
  }
  return out;
}
