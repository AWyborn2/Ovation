import { TEMPLATE_SIZES, type TemplateSize } from "./document";
import type { TemplateLayerV2 } from "./format";
import { documentPageLayers, normaliseDocument } from "./normalise";
import { primaryPage } from "./pages";

type Box = { x?: unknown; y?: unknown; w?: unknown; h?: unknown };

/** A layer's box at `size`: its own, else the first size it has one for. */
function boxAt(layer: TemplateLayerV2, size: TemplateSize): Box | null {
  const geometry = (layer as { geometry?: Partial<Record<string, Box>> }).geometry;
  if (!geometry) return null;
  return geometry[size] ?? Object.values(geometry).find((b) => b != null) ?? null;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/**
 * The aspect ratio (width / height) of the frame a design draws the card photo
 * in at `size`: the largest visible `photo` layer on the kind's primary page,
 * measured through any groups it sits in. Null when the design draws no photo
 * at that size. The automatic photo picker uses it to prefer photos whose
 * focus box fits the frame (photo focus areas).
 */
export function photoFrameAspect(doc: unknown, kind: string, size: TemplateSize): number | null {
  const normalised = normaliseDocument(doc, kind);
  let best: { w: number; h: number } | null = null;
  const walk = (layers: readonly TemplateLayerV2[], parent: { w: number; h: number }) => {
    for (const layer of layers) {
      if (layer.hidden) continue;
      const sizes = (layer as { sizes?: readonly string[] }).sizes;
      if (sizes && !sizes.includes(size)) continue;
      const box = boxAt(layer, size);
      if (!box) continue;
      const px = { w: (num(box.w) / 100) * parent.w, h: (num(box.h) / 100) * parent.h };
      if (layer.kind === "group") {
        const children = (layer as { children?: unknown }).children;
        if (Array.isArray(children)) walk(children as TemplateLayerV2[], px);
      } else if (layer.kind === "photo" && px.w > 0 && px.h > 0) {
        if (!best || px.w * px.h > best.w * best.h) best = px;
      }
    }
  };
  walk(documentPageLayers(normalised, primaryPage(kind)), TEMPLATE_SIZES[size]);
  const frame = best as { w: number; h: number } | null;
  return frame ? frame.w / frame.h : null;
}
