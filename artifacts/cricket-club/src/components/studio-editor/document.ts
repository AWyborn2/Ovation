/**
 * Document operations for the editor (Social Studio U16): pure functions over
 * the card adjustments (U15) for the current format. Geometry edits touch only
 * the current format and stamp its edit time; content edits are shared.
 */
import type { CardAdjustments, FreeLayer, LayerBox } from "@/lib/pack-render";
import { resolveGeometry } from "@/lib/pack-render";
import { isSponsorSlot } from "@/lib/pack-render/adjustments";
import type { CardSize } from "@/lib/share-card";

export type EditorDoc = CardAdjustments;

export const layersOf = (doc: EditorDoc): FreeLayer[] => doc.layers ?? [];

/** The box a layer renders with at `size` (own or inherited). */
export function boxOf(layer: FreeLayer, size: CardSize): LayerBox | null {
  return resolveGeometry(layer.geometry, layer.editedAt, size)?.value ?? null;
}

let counter = 0;
export function newId(prefix = "l"): string {
  counter += 1;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}`;
}

function mapLayers(doc: EditorDoc, fn: (l: FreeLayer) => FreeLayer | null): EditorDoc {
  const layers = layersOf(doc)
    .map(fn)
    .filter((l): l is FreeLayer => l !== null);
  return { ...doc, layers };
}

/** A group's child layers (format v2); none for any other layer. */
export const childrenOf = (l: FreeLayer): FreeLayer[] =>
  (l as FreeLayer & { children?: FreeLayer[] }).children ?? [];

/**
 * A layer with its box at `size` set to `to`. A group's children are in
 * artboard coordinates, so they are moved and scaled with it (at every depth)
 * from where the group was, or they would stay behind when it moves.
 */
export function placeBox(
  layer: FreeLayer,
  size: CardSize,
  to: LayerBox,
  now = Date.now(),
): FreeLayer {
  const next: FreeLayer = {
    ...layer,
    geometry: { ...layer.geometry, [size]: to },
    editedAt: { ...layer.editedAt, [size]: now },
  };
  const from = boxOf(layer, size);
  const kids = childrenOf(layer);
  if (!from || !kids.length) return next;
  const sx = from.w > 0 ? to.w / from.w : 1;
  const sy = from.h > 0 ? to.h / from.h : 1;
  const children = kids.map((c) => {
    const b = boxOf(c, size);
    if (!b) return c;
    return placeBox(
      c,
      size,
      {
        ...b,
        x: to.x + (b.x - from.x) * sx,
        y: to.y + (b.y - from.y) * sy,
        w: b.w * sx,
        h: b.h * sy,
      },
      now,
    );
  });
  return { ...next, children } as FreeLayer;
}

/**
 * A copy of a layer with new ids for it and, in a group, every layer inside
 * it. Links are re-keyed through `links`, so copies made together stay linked
 * to each other and never to the originals.
 */
export function withNewIds(layer: FreeLayer, links = new Map<string, string>()): FreeLayer {
  const kids = childrenOf(layer);
  const copy: FreeLayer = { ...layer, id: newId() };
  if (layer.link) {
    copy.link = links.get(layer.link) ?? newId("k");
    links.set(layer.link, copy.link);
  }
  return kids.length
    ? ({ ...copy, children: kids.map((k) => withNewIds(k, links)) } as FreeLayer)
    : copy;
}

/** Set boxes for some layers at `size` (other formats untouched). */
export function setBoxes(
  doc: EditorDoc,
  size: CardSize,
  boxes: Record<string, LayerBox>,
  now = Date.now(),
): EditorDoc {
  return mapLayers(doc, (l) => (boxes[l.id] ? placeBox(l, size, boxes[l.id], now) : l));
}

/** Move layers by (dx, dy) percent at `size`, keeping each box on the page. */
export function nudge(
  doc: EditorDoc,
  size: CardSize,
  ids: string[],
  dx: number,
  dy: number,
): EditorDoc {
  const boxes: Record<string, LayerBox> = {};
  for (const l of layersOf(doc)) {
    if (!ids.includes(l.id) || l.locked) continue;
    const b = boxOf(l, size);
    if (!b) continue;
    boxes[l.id] = {
      ...b,
      x: clamp(b.x + dx, -b.w + 2, 98),
      y: clamp(b.y + dy, -b.h + 2, 98),
    };
  }
  return setBoxes(doc, size, boxes);
}

export function updateLayer(doc: EditorDoc, id: string, patch: Partial<FreeLayer>): EditorDoc {
  return mapLayers(doc, (l) => (l.id === id ? { ...l, ...patch } : l));
}

export function addLayer(doc: EditorDoc, layer: FreeLayer): EditorDoc {
  return { ...doc, layers: [...layersOf(doc), layer] };
}

export function addLayers(doc: EditorDoc, layers: FreeLayer[]): EditorDoc {
  return { ...doc, layers: [...layersOf(doc), ...layers] };
}

/** Point an image slot (e.g. `photo`) at a new image. */
export function setImage(doc: EditorDoc, slot: string, url: string): EditorDoc {
  return { ...doc, images: { ...(doc.images ?? {}), [slot]: url } };
}

/** A sponsor-strip library element, which the sponsor lock protects. */
export const isSponsorElement = (l: FreeLayer): boolean =>
  l.kind === "element" && l.element?.id === "ck.sponsor-strip";

/** Delete layers; locked layers (and a locked sponsor strip) survive. */
export function removeLayers(doc: EditorDoc, ids: string[]): EditorDoc {
  return mapLayers(doc, (l) =>
    ids.includes(l.id) && !l.locked && !(doc.sponsorLock && isSponsorElement(l)) ? null : l,
  );
}

/** Stacking moves for the selected layers (later in the list = drawn on top). */
export type ReorderMove = "forward" | "backward" | "front" | "back";

/** Move layers up / down the stack, keeping their relative order. */
export function reorderLayers(doc: EditorDoc, ids: string[], move: ReorderMove): EditorDoc {
  const layers = [...layersOf(doc)];
  const picked = layers.filter((l) => ids.includes(l.id));
  if (picked.length === 0) return doc;
  if (move === "front" || move === "back") {
    const rest = layers.filter((l) => !ids.includes(l.id));
    return { ...doc, layers: move === "front" ? [...rest, ...picked] : [...picked, ...rest] };
  }
  const order = move === "forward" ? [...layers.keys()].reverse() : [...layers.keys()];
  for (const i of order) {
    if (!ids.includes(layers[i].id)) continue;
    const j = move === "forward" ? i + 1 : i - 1;
    if (j < 0 || j >= layers.length || ids.includes(layers[j].id)) continue;
    [layers[i], layers[j]] = [layers[j], layers[i]];
  }
  return { ...doc, layers };
}

/** Set (or clear, with `null`) one edited prop on a library element layer. */
export function setElementProp(
  doc: EditorDoc,
  id: string,
  key: string,
  value: string | null,
): EditorDoc {
  return mapLayers(doc, (l) => {
    if (l.id !== id || l.kind !== "element" || !l.element) return l;
    const props = { ...(l.element.props ?? {}) };
    if (value === null) delete props[key];
    else props[key] = value;
    return { ...l, element: { ...l.element, props } };
  });
}

/** Duplicate layers, offset by 2% at `size`; returns the new ids. */
export function duplicate(
  doc: EditorDoc,
  size: CardSize,
  ids: string[],
): { doc: EditorDoc; ids: string[] } {
  const copies: FreeLayer[] = [];
  const groupMap = new Map<string, string>();
  const links = new Map<string, string>();
  for (const l of layersOf(doc)) {
    if (!ids.includes(l.id)) continue;
    const b = boxOf(l, size);
    const group = l.group ? (groupMap.get(l.group) ?? newId("g")) : undefined;
    if (l.group && group) groupMap.set(l.group, group);
    const copy: FreeLayer = { ...withNewIds(structuredClone(l), links), group, locked: false };
    // A group's children move with it, so the copy's contents sit inside the copy.
    const placed = b ? placeBox(copy, size, { ...b, x: b.x + 2, y: b.y + 2 }) : copy;
    copies.push({
      ...placed,
      geometry: b ? { [size]: placed.geometry[size]! } : {},
      editedAt: { [size]: Date.now() },
    });
  }
  return { doc: { ...doc, layers: [...layersOf(doc), ...copies] }, ids: copies.map((c) => c.id) };
}

export function group(doc: EditorDoc, ids: string[]): { doc: EditorDoc; group: string | null } {
  if (ids.length < 2) return { doc, group: null };
  const g = newId("g");
  return { doc: mapLayers(doc, (l) => (ids.includes(l.id) ? { ...l, group: g } : l)), group: g };
}

export function ungroup(doc: EditorDoc, ids: string[]): EditorDoc {
  return mapLayers(doc, (l) => (ids.includes(l.id) ? { ...l, group: undefined } : l));
}

/** Ids selected by clicking `id`: its whole group unless editing inside that group. */
export function selectionFor(doc: EditorDoc, id: string, inside: string | null): string[] {
  const layer = layersOf(doc).find((l) => l.id === id);
  if (!layer?.group || layer.group === inside) return [id];
  return layersOf(doc)
    .filter((l) => l.group === layer.group)
    .map((l) => l.id);
}

/**
 * Add `ids` (each with its whole group, unless editing inside it) to the
 * selection, or replace it; keeps first-selected order for "match to first".
 */
export function selectMany(
  doc: EditorDoc,
  selection: string[],
  ids: string[],
  inside: string | null,
  additive: boolean,
): string[] {
  const picked = ids.flatMap((id) => selectionFor(doc, id, inside));
  return [...new Set([...(additive ? selection : []), ...picked])];
}

/** Shift-click: toggle `id` (and its group) in the selection. */
export function toggleSelection(
  doc: EditorDoc,
  selection: string[],
  id: string,
  inside: string | null,
): string[] {
  const ids = selectionFor(doc, id, inside);
  const allIn = ids.every((i) => selection.includes(i));
  return allIn ? selection.filter((s) => !ids.includes(s)) : [...new Set([...selection, ...ids])];
}

export function setField(doc: EditorDoc, key: string, value: string | null): EditorDoc {
  const fields = { ...(doc.fields ?? {}) };
  if (value === null) delete fields[key];
  else fields[key] = value;
  return { ...doc, fields };
}

export function toggleHidden(doc: EditorDoc, key: string): EditorDoc {
  // A locked sponsor strip can't be hidden (U17).
  if (doc.sponsorLock && key.startsWith("slot:") && isSponsorSlot(key.slice(5))) return doc;
  const hidden = doc.hidden ?? [];
  return {
    ...doc,
    hidden: hidden.includes(key) ? hidden.filter((h) => h !== key) : [...hidden, key],
  };
}

export function setPhoto(
  doc: EditorDoc,
  size: CardSize,
  photo: { focalX: number; focalY: number; zoom: number },
  now = Date.now(),
): EditorDoc {
  return {
    ...doc,
    photo: { ...doc.photo, [size]: photo },
    photoEditedAt: { ...doc.photoEditedAt, [size]: now },
  };
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
