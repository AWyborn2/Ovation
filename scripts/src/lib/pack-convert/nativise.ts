/**
 * Vectors in a template document as native shapes (editable-elements plan,
 * C1), in place: the converter does this as it maps, and this does it to
 * documents already made (the committed bundles, polished by hand, which a
 * re-conversion would undo). A vector of one simple element becomes a shape
 * layer with the same id and settings, its box on each size cut to the
 * element; any other vector gets a colour per drawn element.
 */
import {
  TEMPLATE_SIZES,
  type LayerBox,
  type TemplateDocumentV2,
  type TemplateLayerV2,
  type TemplateSize,
  type TemplateStyleV2,
} from "@workspace/scorecard/kind-templates";
import { explicitColours, svgToShape, type SvgShape } from "./svg-shape";

const r2 = (v: number) => Math.round(v * 100) / 100;

/** A box given in percent of `outer`, as a box on the artboard (keeping `outer`'s rotation). */
export function within(outer: LayerBox, inner: { x: number; y: number; w: number; h: number }) {
  const whole = inner.x === 0 && inner.y === 0 && inner.w === 100 && inner.h === 100;
  if (whole) return outer;
  return {
    x: r2(outer.x + (inner.x / 100) * outer.w),
    y: r2(outer.y + (inner.y / 100) * outer.h),
    w: r2((inner.w / 100) * outer.w),
    h: r2((inner.h / 100) * outer.h),
  };
}

/** The vector's own style under the shape's: opacities multiply, the shape's paint wins. */
function mergeStyle(own: TemplateStyleV2 | undefined, shape: TemplateStyleV2): TemplateStyleV2 {
  const opacity = (own?.opacity ?? 1) * (shape.opacity ?? 1);
  const { opacity: _a, ...rest } = own ?? {};
  const { opacity: _b, ...paint } = shape;
  return { ...rest, ...paint, ...(opacity < 1 ? { opacity: r2(opacity) } : {}) };
}

/** One vector as a shape, when every size it's on draws one simple element the same way. */
function asShape(layer: TemplateLayerV2 & { kind: "vector" }): TemplateLayerV2 | null {
  const sizes = (layer.sizes ?? (Object.keys(layer.geometry) as TemplateSize[])).filter(
    (s) => layer.geometry[s],
  );
  if (!sizes.length) return null;
  const shapes = new Map<TemplateSize, SvgShape>();
  for (const size of sizes) {
    const box = layer.geometry[size]!;
    const art = TEMPLATE_SIZES[size];
    const shape = svgToShape(
      layer.svg,
      { w: (box.w / 100) * art.w, h: (box.h / 100) * art.h },
      art.w,
    );
    if (!shape) return null;
    const whole =
      shape.box.x === 0 && shape.box.y === 0 && shape.box.w === 100 && shape.box.h === 100;
    // A rotated box turns about its own centre, so only a shape filling it keeps its place.
    if (box.rotate && !whole) return null;
    shapes.set(size, shape);
  }
  const styles = new Set([...shapes.values()].map((s) => JSON.stringify(s.style)));
  if (styles.size !== 1) return null; // the sizes draw it differently (a border's width)
  const style = mergeStyle(layer.style, shapes.get(sizes[0]!)!.style);
  const geometry = { ...layer.geometry };
  for (const [size, shape] of shapes) geometry[size] = within(layer.geometry[size]!, shape.box);
  // The same keys in the same order, the vector's markup out and the shape's style in.
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(layer)) {
    if (k === "svg") continue;
    out[k] = k === "kind" ? "shape" : k === "geometry" ? geometry : k === "style" ? style : v;
  }
  if (!("style" in out)) out.style = style;
  return out as unknown as TemplateLayerV2;
}

export type NativiseResult = { shapes: number; vectors: number; recoloured: number };

/** Every vector in a v2 document, in place; counts what changed. A v1 document is left alone. */
export function nativiseVectors(doc: TemplateDocumentV2): NativiseResult {
  const result: NativiseResult = { shapes: 0, vectors: 0, recoloured: 0 };
  if (!doc.pages) return result;
  const visit = (layers: TemplateLayerV2[]) => {
    for (const [i, layer] of layers.entries()) {
      if (layer.kind === "group") visit(layer.children);
      if (layer.kind !== "vector") continue;
      const shape = asShape(layer);
      if (shape) {
        layers[i] = shape;
        result.shapes++;
        continue;
      }
      result.vectors++;
      const svg = explicitColours(layer.svg);
      if (svg !== layer.svg) {
        layer.svg = svg;
        result.recoloured++;
      }
    }
  };
  for (const page of Object.values(doc.pages)) if (page?.layers) visit(page.layers);
  return result;
}
