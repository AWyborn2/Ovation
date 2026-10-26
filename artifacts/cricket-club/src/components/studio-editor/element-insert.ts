/**
 * Inserting a library element (editable-elements plan, D3): its layers are
 * copied into the card as native layers (decision E2), with nothing linking
 * back to the element.
 *
 * Every layer and child gets a fresh id, and a fresh `link` where it had one
 * (Stream C2: per-size copies the editor updates together), as duplicate and
 * paste do. An element keeps the boxes it was designed with, per size; at a
 * size it wasn't designed for, it takes the box of its nearest designed size
 * (boxes are in percent of the card, so a full-width band stays full width).
 *
 * An element drawn per size keeps a copy of each piece for each size group
 * (`sizes`, e.g. one for square/portrait/story and a smaller one for
 * landscape). Only the copies made for the size being edited come in, so the
 * pieces aren't doubled; an element with no copy for that size comes in whole.
 */
import type { FreeLayer, LayerBox } from "@/lib/pack-render";
import type { CardSize } from "@/lib/share-card";
import { newId } from "./document";

/** Where to borrow a missing size's box from, nearest first. */
const NEAREST: Record<CardSize, CardSize[]> = {
  square: ["portrait", "landscape", "story"],
  portrait: ["square", "story", "landscape"],
  story: ["portrait", "square", "landscape"],
  landscape: ["square", "portrait", "story"],
};

/** An element's document, as the library serves it. */
export type ElementDocumentLike = { layers?: unknown[] };

type ElementLayer = FreeLayer & { children?: ElementLayer[]; link?: string; sig?: string };

/** The layer's box at `size`: its own, else its nearest designed size's. */
export function boxAt(layer: Pick<FreeLayer, "geometry">, size: CardSize): LayerBox | null {
  const own = layer.geometry?.[size];
  if (own) return own;
  for (const other of NEAREST[size]) {
    const box = layer.geometry?.[other];
    if (box) return box;
  }
  return null;
}

/**
 * How many layers at the bottom of a page are its full-card background at
 * `size` (boxes covering the whole card): where a texture goes, above them and
 * under the rest of the design.
 */
export function backgroundDepth(layers: readonly FreeLayer[], size: CardSize): number {
  let n = 0;
  for (const layer of layers) {
    const box = boxAt(layer, size);
    if (!box || box.x > 0.5 || box.y > 0.5 || box.x + box.w < 99.5 || box.y + box.h < 99.5) break;
    n += 1;
  }
  return n;
}

/** The layers of one level to copy at `size`: its own size's copies when it has any. */
function forSize(list: ElementLayer[], size: CardSize): ElementLayer[] {
  const designedHere = list.some((l) => l.sizes?.includes(size));
  return designedHere ? list.filter((l) => !l.sizes || l.sizes.includes(size)) : list;
}

function copyLayer(layer: ElementLayer, size: CardSize, links: Map<string, string>, now: number) {
  const box = boxAt(layer, size);
  const copy: ElementLayer = {
    ...layer,
    id: newId(),
    geometry: { ...layer.geometry, ...(box ? { [size]: box } : {}) },
    editedAt: { [size]: now },
  };
  // The library's `sizes` named where the element was designed; the card decides now.
  delete copy.sizes;
  delete copy.sig;
  if (layer.link) {
    if (!links.has(layer.link)) links.set(layer.link, newId("k"));
    copy.link = links.get(layer.link);
  }
  if (layer.children) {
    copy.children = forSize(layer.children, size).map((c) => copyLayer(c, size, links, now));
  }
  return copy;
}

/**
 * The layers to add for an element at `size`: fresh copies, each with a box
 * at that size. A layer with no box at any size is left out.
 */
export function elementLayers(
  document: ElementDocumentLike,
  size: CardSize,
  now = Date.now(),
): FreeLayer[] {
  const links = new Map<string, string>();
  return forSize((document.layers ?? []) as ElementLayer[], size)
    .filter((l) => boxAt(l, size) !== null)
    .map((l) => copyLayer(l, size, links, now));
}

/** The box around an element's layers at `size`, in percent of the card. */
export function elementBounds(layers: FreeLayer[], size: CardSize): LayerBox | null {
  const boxes = layers.map((l) => boxAt(l, size)).filter((b): b is LayerBox => !!b);
  if (boxes.length === 0) return null;
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.w));
  const bottom = Math.max(...boxes.map((b) => b.y + b.h));
  return { x, y, w: right - x, h: bottom - y };
}
