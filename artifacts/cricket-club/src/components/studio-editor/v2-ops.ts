/**
 * Format v2 operations for the template editor (ADR-011, L5-B): pure
 * functions over a template document's pages and its stack groups.
 *
 * The editor edits one page at a time. A page's layers are handed to the
 * existing canvas and operations as an `EditorDoc` (`pageDoc`) and written
 * back with `withPage`, so moving, resizing, text and rows editing work on
 * v2 pages unchanged. Stack groups hold their children inline: these
 * functions find, change, wrap and unwrap layers wherever they sit.
 */
import {
  MAX_STACK_DEPTH,
  TEMPLATE_SIZE_ORDER,
  type GroupLayerV2,
  type LayerBox,
  type PageKey,
  type TemplateDocumentV2,
  type TemplateLayerV2,
  type TemplateSize,
} from "@workspace/scorecard/kind-templates";
import type { FreeLayer } from "@/lib/pack-render";
import { boxOf, layersOf, newId, type EditorDoc } from "./document";

/** A page's layers, as the document the canvas and v1 operations edit. */
export function pageDoc(doc: TemplateDocumentV2, page: PageKey): EditorDoc {
  return { layers: (doc.pages[page]?.layers ?? []) as unknown as FreeLayer[] };
}

/** The document with `page`'s layers replaced by the page document's. */
export function withPage(
  doc: TemplateDocumentV2,
  page: PageKey,
  next: EditorDoc,
): TemplateDocumentV2 {
  return {
    ...doc,
    pages: { ...doc.pages, [page]: { layers: layersOf(next) as unknown as TemplateLayerV2[] } },
  };
}

const children = (l: TemplateLayerV2): TemplateLayerV2[] =>
  l.kind === "group" && Array.isArray(l.children) ? l.children : [];

/** Where a layer sits: the layer, its group (null at the top of the page) and its depth (1 at the top). */
export type Found = { layer: TemplateLayerV2; parent: GroupLayerV2 | null; depth: number };

export function findLayer(layers: readonly TemplateLayerV2[], id: string, depth = 1, parent: GroupLayerV2 | null = null): Found | null {
  for (const l of layers) {
    if (l.id === id) return { layer: l, parent, depth };
    const inner = findLayer(children(l), id, depth + 1, l as GroupLayerV2);
    if (inner) return inner;
  }
  return null;
}

/** Change one layer wherever it sits (a group's children included). */
export function updateDeep(
  layers: readonly TemplateLayerV2[],
  id: string,
  fn: (l: TemplateLayerV2) => TemplateLayerV2,
): TemplateLayerV2[] {
  return layers.map((l) => {
    if (l.id === id) return fn(l);
    if (l.kind === "group" && Array.isArray(l.children))
      return { ...l, children: updateDeep(l.children, id, fn) } as TemplateLayerV2;
    return l;
  });
}

/** Change one layer of a page document wherever it sits. */
export function updatePageLayer(
  doc: EditorDoc,
  id: string,
  patch: Partial<TemplateLayerV2> | ((l: TemplateLayerV2) => TemplateLayerV2),
): EditorDoc {
  const fn =
    typeof patch === "function" ? patch : (l: TemplateLayerV2) => ({ ...l, ...patch }) as TemplateLayerV2;
  return { ...doc, layers: updateDeep(layersOf(doc) as unknown as TemplateLayerV2[], id, fn) as unknown as FreeLayer[] };
}

/** How many levels of groups a layer is, counting itself (0 for a plain layer). */
export function groupLevels(layer: TemplateLayerV2): number {
  if (layer.kind !== "group") return 0;
  return 1 + Math.max(0, ...children(layer).map(groupLevels));
}

/** The smallest box around some boxes. */
function union(boxes: LayerBox[]): LayerBox {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const r = Math.max(...boxes.map((b) => b.x + b.w));
  const bt = Math.max(...boxes.map((b) => b.y + b.h));
  return { x, y, w: r - x, h: bt - y };
}

export type WrapResult = { doc: EditorDoc; id: string } | { doc: null; reason: string };

/**
 * Put layers of the page (top level only) in a new stack group, at the
 * place of the first of them. The group's box on each size is the smallest
 * box around its children there, and it is on the sizes they're on.
 * Refused when it would nest groups deeper than `MAX_STACK_DEPTH`.
 */
export function wrapInGroup(doc: EditorDoc, ids: string[]): WrapResult {
  const layers = layersOf(doc) as unknown as TemplateLayerV2[];
  const picked = layers.filter((l) => ids.includes(l.id));
  if (picked.length === 0) return { doc: null, reason: "Select layers to group." };
  if (1 + Math.max(0, ...picked.map(groupLevels)) > MAX_STACK_DEPTH)
    return { doc: null, reason: `Groups can nest at most ${MAX_STACK_DEPTH} deep.` };
  const geometry: Partial<Record<TemplateSize, LayerBox>> = {};
  const sizes: TemplateSize[] = [];
  for (const size of TEMPLATE_SIZE_ORDER) {
    const boxes = picked
      .filter((l) => !l.sizes || l.sizes.includes(size))
      .map((l) => boxOf(l as unknown as FreeLayer, size))
      .filter((b): b is LayerBox => b !== null);
    if (boxes.length === 0) continue;
    geometry[size] = union(boxes);
    sizes.push(size);
  }
  const id = newId("g");
  const group: GroupLayerV2 = {
    id,
    kind: "group",
    name: "Group",
    geometry,
    ...(sizes.length < TEMPLATE_SIZE_ORDER.length ? { sizes } : {}),
    stack: { direction: "column", gap: 1, align: "start", justify: "start" },
    children: picked,
  };
  const at = layers.findIndex((l) => ids.includes(l.id));
  const rest = layers.filter((l) => !ids.includes(l.id));
  const before = layers.slice(0, at).filter((l) => !ids.includes(l.id)).length;
  const next = [...rest.slice(0, before), group, ...rest.slice(before)];
  return { doc: { ...doc, layers: next as unknown as FreeLayer[] }, id };
}

/** Replace a group with its children, where it was (a child group's group if nested). */
export function unwrapGroup(doc: EditorDoc, id: string): EditorDoc {
  const spill = (list: TemplateLayerV2[]): TemplateLayerV2[] =>
    list.flatMap((l) => {
      if (l.id === id && l.kind === "group") return children(l);
      if (l.kind === "group") return [{ ...l, children: spill(children(l)) } as TemplateLayerV2];
      return [l];
    });
  return { ...doc, layers: spill(layersOf(doc) as unknown as TemplateLayerV2[]) as unknown as FreeLayer[] };
}

/** Move a group's child one place earlier (-1) or later (+1) in its stack. */
export function moveChild(doc: EditorDoc, groupId: string, childId: string, delta: -1 | 1): EditorDoc {
  return updatePageLayer(doc, groupId, (g) => {
    const list = [...children(g)];
    const i = list.findIndex((c) => c.id === childId);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= list.length) return g;
    [list[i], list[j]] = [list[j]!, list[i]!];
    return { ...g, children: list } as TemplateLayerV2;
  });
}

/** Take a child out of its group, to just after the group. */
export function takeOutOfGroup(doc: EditorDoc, childId: string): EditorDoc {
  const found = findLayer(layersOf(doc) as unknown as TemplateLayerV2[], childId);
  if (!found?.parent) return doc;
  const parentId = found.parent.id;
  const lift = (list: TemplateLayerV2[]): TemplateLayerV2[] =>
    list.flatMap((l) => {
      if (l.id === parentId) {
        const kept = { ...l, children: children(l).filter((c) => c.id !== childId) } as TemplateLayerV2;
        return [kept, found.layer];
      }
      if (l.kind === "group") return [{ ...l, children: lift(children(l)) } as TemplateLayerV2];
      return [l];
    });
  return { ...doc, layers: lift(layersOf(doc) as unknown as TemplateLayerV2[]) as unknown as FreeLayer[] };
}

// ── vectors ────────────────────────────────────────────────────────────────

const TOKEN_REF = /var\(\s*(--[\w-]+)\s*(?:,\s*#[0-9a-fA-F]{3,8}\s*)?\)/g;

/** The colour tokens a vector's markup uses, in first-use order. */
export function svgTokens(svg: string): string[] {
  return [...new Set([...svg.matchAll(TOKEN_REF)].map((m) => m[1]!))];
}

/** A vector's markup with one colour token swapped for another (fallbacks dropped). */
export function swapSvgToken(svg: string, from: string, to: string): string {
  return svg.replace(TOKEN_REF, (all, token: string) => (token === from ? `var(${to})` : all));
}
