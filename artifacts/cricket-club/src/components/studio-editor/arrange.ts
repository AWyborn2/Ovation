/**
 * Arranging several layers at once (studio-editor-multiselect): match size,
 * align, distribute, and the group resize the canvas drives. Pure functions
 * over the editor document at one size: only that size's boxes change, as
 * every geometry edit does. Locked and hidden layers, and layers not on the
 * size, are left where they are.
 *
 * A group counts as one unit unless the admin is editing inside it, so
 * aligning a group with a text box moves the group as a block.
 */
import { layerOnSize } from "@workspace/scorecard/kind-templates";
import type { FreeLayer, LayerBox } from "@/lib/pack-render";
import type { CardSize } from "@/lib/share-card";
import { boxOf, clamp, layersOf, setBoxes, type EditorDoc } from "./document";
import { boundsOf } from "./guides";

type Rect = Pick<LayerBox, "x" | "y" | "w" | "h">;

/** The selected layers an arrange action may move at `size`, in selection order. */
export function arrangeable(doc: EditorDoc, size: CardSize, ids: string[]): FreeLayer[] {
  const byId = new Map(layersOf(doc).map((l) => [l.id, l]));
  return ids
    .map((id) => byId.get(id))
    .filter(
      (l): l is FreeLayer =>
        !!l && !l.locked && !l.hidden && layerOnSize(l, size) && boxOf(l, size) !== null,
    );
}

type Unit = { ids: string[]; box: Rect };

/** Selected layers as units: a group (unless editing inside it) or a single layer. */
function unitsOf(
  doc: EditorDoc,
  size: CardSize,
  ids: string[],
  inside: string | null = null,
): Unit[] {
  const units = new Map<string, string[]>();
  for (const l of arrangeable(doc, size, ids)) {
    const key = l.group && l.group !== inside ? `g:${l.group}` : `l:${l.id}`;
    units.set(key, [...(units.get(key) ?? []), l.id]);
  }
  const layers = new Map(layersOf(doc).map((l) => [l.id, l]));
  return [...units.values()].map((unitIds) => ({
    ids: unitIds,
    box: boundsOf(unitIds.map((id) => boxOf(layers.get(id)!, size)!)),
  }));
}

/** How many units (groups count once) an arrange action would move. */
export const unitCount = (
  doc: EditorDoc,
  size: CardSize,
  ids: string[],
  inside: string | null = null,
): number => unitsOf(doc, size, ids, inside).length;

/** Where a box inside `from` lands when `from` becomes `to` (each axis scaled). */
export function mapBox(box: LayerBox, from: Rect, to: Rect): LayerBox {
  const sx = from.w > 0 ? to.w / from.w : 1;
  const sy = from.h > 0 ? to.h / from.h : 1;
  return {
    ...box,
    x: to.x + (box.x - from.x) * sx,
    y: to.y + (box.y - from.y) * sy,
    w: box.w * sx,
    h: box.h * sy,
  };
}

/** Move and scale a unit's layers from its box to `to`. */
function placeUnit(
  doc: EditorDoc,
  size: CardSize,
  unit: Unit,
  to: Rect,
  boxes: Record<string, LayerBox>,
): void {
  const layers = new Map(layersOf(doc).map((l) => [l.id, l]));
  for (const id of unit.ids) boxes[id] = mapBox(boxOf(layers.get(id)!, size)!, unit.box, to);
}

const scaleNum = (v: number | undefined, s: number, lo: number, hi: number) =>
  v === undefined ? undefined : Math.round(clamp(v * s, lo, hi) * 100) / 100;

/**
 * A layer's type scaled by `s` (a corner group resize). Font sizes are one
 * setting for every size, so the text changes wherever the layer is. List
 * rows scale their height and gap with their cells' type. Limits match the
 * template validator.
 */
export function scaleLayerType(layer: FreeLayer, s: number): FreeLayer {
  if (s === 1) return layer;
  const next: FreeLayer = { ...layer };
  if (layer.style?.fontSize !== undefined) {
    next.style = { ...layer.style, fontSize: scaleNum(layer.style.fontSize, s, 0.2, 80) };
  }
  if (layer.rows) {
    const scaleStyle = <T extends { fontSize?: number } | undefined>(st: T): T =>
      st?.fontSize === undefined
        ? st
        : ({ ...st, fontSize: scaleNum(st.fontSize, s, 0.2, 80) } as T);
    next.rows = {
      ...layer.rows,
      rowHeight: scaleNum(layer.rows.rowHeight, s, 0.5, 100)!,
      ...(layer.rows.gap !== undefined ? { gap: scaleNum(layer.rows.gap, s, 0, 50) } : {}),
      cells: layer.rows.cells.map((c) => ({ ...c, style: scaleStyle(c.style) })),
      ...(layer.rows.variants
        ? {
            variants: Object.fromEntries(
              Object.entries(layer.rows.variants).map(([v, cells]) => [
                v,
                Object.fromEntries(
                  Object.entries(cells ?? {}).map(([f, st]) => [f, scaleStyle(st)]),
                ),
              ]),
            ),
          }
        : {}),
    };
  }
  return next;
}

/**
 * The group resize the canvas drives: `start` holds the layers as they were
 * when the gesture began (so type never compounds), scaled from their
 * bounds `from` to `to`. With `scaleType`, the type scales by the width
 * ratio too (corner handles keep proportions, so both ratios agree).
 */
export function resizeGroup(
  doc: EditorDoc,
  size: CardSize,
  start: FreeLayer[],
  from: Rect,
  to: Rect,
  scaleType: boolean,
  now = Date.now(),
): EditorDoc {
  const s = from.w > 0 ? to.w / from.w : 1;
  const byId = new Map(start.map((l) => [l.id, l]));
  return {
    ...doc,
    layers: layersOf(doc).map((l) => {
      const base = byId.get(l.id);
      const box = base && boxOf(base, size);
      if (!base || !box) return l;
      const typed = scaleType ? scaleLayerType(base, s) : base;
      return {
        ...l,
        style: typed.style,
        rows: typed.rows,
        geometry: { ...l.geometry, [size]: mapBox(box, from, to) },
        editedAt: { ...l.editedAt, [size]: now },
      };
    }),
  };
}

export type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

/**
 * The bounds after dragging `handle` by (dx, dy) percent. Corner handles keep
 * the proportions (the larger change wins) and pin the opposite corner; edge
 * handles stretch one axis. Never smaller than `min` on either axis.
 */
export function resizeBounds(
  start: Rect,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  min = 2,
): Rect {
  const east = handle.includes("e");
  const west = handle.includes("w");
  const south = handle.includes("s");
  const north = handle.includes("n");
  let w = start.w + (east ? dx : west ? -dx : 0);
  let h = start.h + (south ? dy : north ? -dy : 0);
  if ((east || west) && (north || south)) {
    const sx = start.w > 0 ? w / start.w : 1;
    const sy = start.h > 0 ? h / start.h : 1;
    const minS = Math.max(start.w > 0 ? min / start.w : 0, start.h > 0 ? min / start.h : 0);
    const s = Math.max(minS, Math.abs(sx - 1) >= Math.abs(sy - 1) ? sx : sy);
    w = start.w * s;
    h = start.h * s;
  } else {
    w = Math.max(min, w);
    h = Math.max(min, h);
  }
  return {
    x: west ? start.x + start.w - w : start.x,
    y: north ? start.y + start.h - h : start.y,
    w,
    h,
  };
}

export type MatchDimension = "width" | "height" | "both";
export type MatchReference = "first" | "largest";

/**
 * Give the selected units the first-selected (or the largest) unit's width,
 * height or both, each keeping its centre. Type is left alone.
 */
export function matchSize(
  doc: EditorDoc,
  size: CardSize,
  ids: string[],
  dim: MatchDimension,
  ref: MatchReference,
  inside: string | null = null,
): EditorDoc {
  const units = unitsOf(doc, size, ids, inside);
  if (units.length < 2) return doc;
  const area = (b: Rect) => (dim === "width" ? b.w : dim === "height" ? b.h : b.w * b.h);
  const target =
    ref === "first"
      ? units[0].box
      : units.reduce((best, u) => (area(u.box) > area(best) ? u.box : best), units[0].box);
  const boxes: Record<string, LayerBox> = {};
  for (const u of units) {
    const w = dim === "height" ? u.box.w : target.w;
    const h = dim === "width" ? u.box.h : target.h;
    const cx = u.box.x + u.box.w / 2;
    const cy = u.box.y + u.box.h / 2;
    placeUnit(doc, size, u, { x: cx - w / 2, y: cy - h / 2, w, h }, boxes);
  }
  return setBoxes(doc, size, boxes);
}

export type Alignment = "left" | "center" | "right" | "top" | "middle" | "bottom";

/**
 * Line the selected units up on one edge or centre of their combined bounds;
 * a single unit lines up with the page instead.
 */
export function align(
  doc: EditorDoc,
  size: CardSize,
  ids: string[],
  to: Alignment,
  inside: string | null = null,
): EditorDoc {
  const units = unitsOf(doc, size, ids, inside);
  if (units.length === 0) return doc;
  const frame: Rect =
    units.length === 1 ? { x: 0, y: 0, w: 100, h: 100 } : boundsOf(units.map((u) => u.box));
  const boxes: Record<string, LayerBox> = {};
  for (const u of units) {
    const b = u.box;
    const x =
      to === "left"
        ? frame.x
        : to === "center"
          ? frame.x + (frame.w - b.w) / 2
          : to === "right"
            ? frame.x + frame.w - b.w
            : b.x;
    const y =
      to === "top"
        ? frame.y
        : to === "middle"
          ? frame.y + (frame.h - b.h) / 2
          : to === "bottom"
            ? frame.y + frame.h - b.h
            : b.y;
    placeUnit(doc, size, u, { ...b, x, y }, boxes);
  }
  return setBoxes(doc, size, boxes);
}

/**
 * Space three or more units evenly across (or down) the span they already
 * cover: the outermost two stay put and the gaps between neighbours match.
 */
export function distribute(
  doc: EditorDoc,
  size: CardSize,
  ids: string[],
  axis: "horizontal" | "vertical",
  inside: string | null = null,
): EditorDoc {
  const units = unitsOf(doc, size, ids, inside);
  if (units.length < 3) return doc;
  const pos = (b: Rect) => (axis === "horizontal" ? b.x : b.y);
  const len = (b: Rect) => (axis === "horizontal" ? b.w : b.h);
  const sorted = [...units].sort((a, b) => pos(a.box) - pos(b.box));
  const first = sorted[0].box;
  const last = sorted[sorted.length - 1].box;
  const span = pos(last) + len(last) - pos(first);
  const total = sorted.reduce((sum, u) => sum + len(u.box), 0);
  const gap = (span - total) / (sorted.length - 1);
  const boxes: Record<string, LayerBox> = {};
  let at = pos(first);
  for (const u of sorted) {
    const b = u.box;
    placeUnit(doc, size, u, axis === "horizontal" ? { ...b, x: at } : { ...b, y: at }, boxes);
    at += len(b) + gap;
  }
  return setBoxes(doc, size, boxes);
}

/** Every layer the admin can pick at `size` (visible, unlocked), whole groups included. */
export function selectAll(doc: EditorDoc, size: CardSize): string[] {
  return layersOf(doc)
    .filter((l) => !l.locked && !l.hidden && layerOnSize(l, size) && boxOf(l, size))
    .map((l) => l.id);
}

/** Whether `inner` lies wholly inside `outer` (rotation ignored), for the marquee. */
export function contains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}
