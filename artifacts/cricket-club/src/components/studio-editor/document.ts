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

/** Set boxes for some layers at `size` (other formats untouched). */
export function setBoxes(
  doc: EditorDoc,
  size: CardSize,
  boxes: Record<string, LayerBox>,
  now = Date.now(),
): EditorDoc {
  return mapLayers(doc, (l) =>
    boxes[l.id]
      ? {
          ...l,
          geometry: { ...l.geometry, [size]: boxes[l.id] },
          editedAt: { ...l.editedAt, [size]: now },
        }
      : l,
  );
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
  for (const l of layersOf(doc)) {
    if (!ids.includes(l.id)) continue;
    const b = boxOf(l, size);
    const group = l.group ? (groupMap.get(l.group) ?? newId("g")) : undefined;
    if (l.group && group) groupMap.set(l.group, group);
    copies.push({
      ...structuredClone(l),
      id: newId(),
      group,
      locked: false,
      geometry: b ? { [size]: { ...b, x: b.x + 2, y: b.y + 2 } } : {},
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
