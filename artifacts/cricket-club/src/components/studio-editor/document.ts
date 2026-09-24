/**
 * Document operations for the editor (Social Studio U16): pure functions over
 * the card adjustments (U15) for the current format. Geometry edits touch only
 * the current format and stamp its edit time; content edits are shared.
 */
import type { CardAdjustments, FreeLayer, LayerBox } from "@/lib/pack-render";
import { resolveGeometry } from "@/lib/pack-render";
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

/** Delete layers; locked layers survive. */
export function removeLayers(doc: EditorDoc, ids: string[]): EditorDoc {
  return mapLayers(doc, (l) => (ids.includes(l.id) && !l.locked ? null : l));
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
