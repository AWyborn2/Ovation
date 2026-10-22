/**
 * Library elements as native layers (editable-elements plan, C3): the pure
 * half of `split-starter-elements.ts`. An element layer (`kind: "element"`,
 * one of the Studio's `ck.*` pieces drawn as trusted HTML) is captured on
 * its own at each size it's on, mapped like a pack, and its native layers
 * take its place: one layer as it is, several as a group named for the
 * element. A v1 document comes out as format v2, its layers on the kind's
 * primary page.
 */
import {
  primaryPage,
  type GroupLayerV2,
  type LayerBox,
  type TemplateDocumentV2,
  type TemplateLayerV2,
  type TemplateSize,
} from "@workspace/scorecard/kind-templates";
import type { CapturedElement } from "@workspace/scorecard/pack-capture";
import type { MappedLayer, MapResult, Tree } from "./map";
import { mergeSizes } from "./merge";

const r2 = (v: number) => Math.round(v * 100) / 100;

/** The Studio's names for the elements the starters use (`lib/studio-elements/registry.ts`). */
export const ELEMENT_NAMES: Record<string, string> = {
  "ck.background": "Club background",
  "ck.watermark": "Crest watermark",
  "ck.frame-side": "Photo frame (side)",
  "ck.frame-top": "Photo frame (top)",
  "ck.crest": "Crest",
  "ck.kind-chip": "Card-type chip",
  "ck.tricolour-rule": "Tricolour rule",
};

export type ElementLayer = TemplateLayerV2 & { kind: "element" };

/** The sizes an element layer is drawn on. */
export const elementSizes = (layer: TemplateLayerV2): TemplateSize[] =>
  (layer.sizes ?? (Object.keys(layer.geometry) as TemplateSize[])).filter((s) => layer.geometry[s]);

/**
 * The layers a capture maps that the element layer `layerId` draws: those
 * whose element is its wrapper (`data-layer-id`) or inside it. The card's
 * own base is left out.
 */
export function elementLayers(map: MapResult, tree: Tree, layerId: string): MappedLayer[] {
  const wrapper = tree.capture.elements.find((e) => e.data?.layerId === layerId);
  if (!wrapper) return [];
  const inside = new Set<number>([wrapper.id, ...tree.descendants(wrapper).map((e) => e.id)]);
  return map.layers.filter((l) => inside.has(l.element));
}

/** The union of boxes, size by size, for a group around `children`. */
function unionGeometry(children: TemplateLayerV2[]): Partial<Record<TemplateSize, LayerBox>> {
  const out: Partial<Record<TemplateSize, LayerBox>> = {};
  const sizes = new Set(children.flatMap((c) => Object.keys(c.geometry) as TemplateSize[]));
  for (const size of sizes) {
    const boxes = children.map((c) => c.geometry[size]).filter((b): b is LayerBox => !!b);
    const x = Math.min(...boxes.map((b) => b.x));
    const y = Math.min(...boxes.map((b) => b.y));
    out[size] = {
      x: r2(x),
      y: r2(y),
      w: r2(Math.max(...boxes.map((b) => b.x + b.w)) - x),
      h: r2(Math.max(...boxes.map((b) => b.y + b.h)) - y),
    };
  }
  return out;
}

/** What an element layer carries over to its replacement. */
const KEPT = ["hidden", "locked", "showWhen", "motion", "animation", "group"] as const;

/**
 * The native layers for one element layer, from its per-size mapped layers:
 * merged across sizes (ids prefixed with the element's), then the single
 * layer itself or a group named for the element.
 */
export function nativeElement(
  layer: ElementLayer,
  perSize: Array<{ size: TemplateSize; layers: MappedLayer[] }>,
): TemplateLayerV2[] {
  const merged = mergeSizes(
    perSize.map(({ size, layers }) => ({
      size,
      layers: layers.map((l) => ({ sig: l.sig, layer: l.layer, box: l.box, element: l.element })),
    })),
    `${layer.id}-`,
  );
  if (!merged.length) return [];
  const sizes = elementSizes(layer);
  const allSizes = sizes.length === 4;
  const name = layer.name ?? ELEMENT_NAMES[layer.element.id] ?? layer.element.id;
  const carried = Object.fromEntries(
    KEPT.filter((k) => layer[k] !== undefined).map((k) => [k, layer[k]]),
  );
  if (merged.length === 1)
    return [
      {
        ...merged[0]!,
        id: layer.id,
        name,
        ...carried,
        ...(allSizes ? {} : { sizes }),
      } as TemplateLayerV2,
    ];
  const group: GroupLayerV2 = {
    id: layer.id,
    name,
    kind: "group",
    ...carried,
    ...(allSizes ? {} : { sizes }),
    geometry: unionGeometry(merged),
    children: merged,
  };
  return [group];
}

/**
 * A starter document with each element layer replaced by `split(layer)` (in
 * place, in paint order), as format v2: a v1 document's layers become the
 * kind's primary page. Declares the Club Kit palette when the result uses it.
 */
export async function splitDocument(
  doc: TemplateDocumentV2 | { layers: TemplateLayerV2[] },
  kind: string,
  split: (layer: ElementLayer) => Promise<TemplateLayerV2[]>,
): Promise<{ document: TemplateDocumentV2; split: number }> {
  const v2 = "pages" in doc && doc.pages;
  const page = primaryPage(kind);
  const layers: TemplateLayerV2[] = v2
    ? ((doc as TemplateDocumentV2).pages[page]?.layers ?? [])
    : (doc as { layers: TemplateLayerV2[] }).layers;
  const out: TemplateLayerV2[] = [];
  let n = 0;
  for (const layer of layers) {
    if (layer.kind !== "element") {
      out.push(layer);
      continue;
    }
    const native = await split(layer as ElementLayer);
    if (!native.length) {
      out.push(layer); // nothing captured: the element stays as it was
      continue;
    }
    out.push(...native);
    n++;
  }
  const document: TemplateDocumentV2 = v2
    ? {
        ...(doc as TemplateDocumentV2),
        pages: { ...(doc as TemplateDocumentV2).pages, [page]: { layers: out } },
      }
    : ({
        ...Object.fromEntries(Object.entries(doc).filter(([k]) => k !== "layers")),
        formatVersion: 2,
        pages: { [page]: { layers: out } },
      } as TemplateDocumentV2);
  if (JSON.stringify(document).includes("var(--ck-")) {
    const palettes = new Set(document.palettes ?? []);
    palettes.add("club-kit");
    document.palettes = [...palettes];
  }
  return { document, split: n };
}

/** Whether a captured element is a layer's wrapper (for tests and reports). */
export const isWrapper = (el: CapturedElement, layerId: string) => el.data?.layerId === layerId;
