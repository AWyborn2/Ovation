/**
 * Editing inside a group (editable-elements plan, A2): the editor works on
 * one level of a page at a time, its "scope". At the top the scope is the
 * page; double-clicking a group (or a stack) enters it, and Esc goes back up.
 *
 * A scope is shown to the rest of the editor as a flat document whose layers
 * are the group's children, so every editing operation (move, resize, delete,
 * arrange, clipboard, undo) works on nested layers unchanged, and its result
 * is written back into the group.
 *
 * A list (`rows` layer) can be entered too (A3). Its cells — the text, photos
 * and backdrops (badges, highlights) each row draws — show as layers on the
 * first row, and an edit to one is written back to the row template, so every
 * row follows. A cell's place is a share of the row, the same on every size.
 */
import { rowsColumns, type RowsCell, type StackSpec } from "@workspace/scorecard/kind-templates";
import { packNativeSize, type FreeLayer, type LayerBox } from "@/lib/pack-render";
import type { CardSize } from "@/lib/share-card";
import { boxOf, childrenOf, type EditorDoc } from "./document";
import { findLayer, updateDeep, type EditorLayer } from "./template-doc";

/** A list's row cell, shown as a layer while editing the list. */
export type RowCellLayer = FreeLayer & { rowCell: RowsCell };

/** Whether a layer stands for a list's row cell. */
export const isRowCell = (l: FreeLayer | EditorLayer): l is RowCellLayer =>
  !!(l as { rowCell?: RowsCell }).rowCell;

const isList = (l: FreeLayer | EditorLayer): boolean =>
  l.kind === "rows" && (l.rows?.cells.length ?? 0) > 0;

/** A layer the editor can enter: a group or stack with children, or a list with cells. */
export const isContainer = (l: FreeLayer | EditorLayer): boolean =>
  (l.kind === "group" && childrenOf(l as FreeLayer).length > 0) || isList(l);

/** Whether a layer lays its children out as a stack (their positions come from the stack). */
export const isStack = (l: FreeLayer | EditorLayer | null | undefined): boolean =>
  !!(l as { stack?: StackSpec } | null | undefined)?.stack;

/** The group or list a scope id names, or null when it's the page or no longer there. */
export function scopeLayer(doc: EditorDoc, scope: string | null): EditorLayer | null {
  if (!scope) return null;
  const hit = findLayer(doc, scope)?.layer ?? null;
  return hit && (hit.kind === "group" || hit.kind === "rows") ? hit : null;
}

// ── A list's first row ───────────────────────────────────────────────────

const num = (v: unknown, fallback = 0) =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Where a list's first row sits on the artboard at `size`, as the renderer lays it out. */
type RowFrame = {
  /** The list's box. */
  box: LayerBox;
  /** A column's width and the gap after it, in percent of the list's width. */
  colW: number;
  colGap: number;
  /** A row's height, and the step from one row to the next, in percent of the artboard height. */
  rowH: number;
  pitch: number;
};

function rowFrame(layer: FreeLayer, size: CardSize): RowFrame | null {
  const spec = layer.rows;
  const box = boxOf(layer, size);
  if (!spec || !box) return null;
  const columns = rowsColumns(spec);
  const colGap = columns > 1 ? Math.min(50, Math.max(0, num(spec.columnGap, 4))) : 0;
  const colW = (100 - colGap * (columns - 1)) / columns;
  // Row height and gap are in percent of the artboard width.
  const native = packNativeSize(size);
  const toH = native.w / native.h;
  const rowH = num(spec.rowHeight, 7) * toH;
  return { box, colW, colGap, rowH, pitch: rowH + num(spec.gap) * toH };
}

function cellBox(cell: RowsCell, f: RowFrame): LayerBox {
  const across = (f.box.w * f.colW) / 100;
  return {
    x: f.box.x + (num(cell.x) / 100) * across,
    w: (num(cell.w) / 100) * across,
    y: f.box.y + (num(cell.y) / 100) * f.rowH,
    h: (num(cell.h, 100) / 100) * f.rowH,
  };
}

const near = (a: LayerBox, b: LayerBox) =>
  Math.abs(a.x - b.x) < 0.001 &&
  Math.abs(a.y - b.y) < 0.001 &&
  Math.abs(a.w - b.w) < 0.001 &&
  Math.abs(a.h - b.h) < 0.001;

/** The id a list's cell has while the list is being edited. */
export const cellId = (listId: string, index: number) => `${listId}::cell${index}`;

const cellName = (cell: RowsCell): string =>
  cell.show === "backdrop"
    ? cell.field
      ? `${cell.field} backdrop`
      : "Backdrop"
    : cell.show === "image"
      ? `${cell.field} photo`
      : cell.show === "logo"
        ? `${cell.field} logo`
        : cell.field;

/** A list's cells as layers, placed on its first row at `size` (no boxes without a size). */
export function rowCellLayers(layer: FreeLayer | EditorLayer, size?: CardSize): RowCellLayer[] {
  const spec = layer.rows;
  if (!spec) return [];
  const f = size ? rowFrame(layer as FreeLayer, size) : null;
  return spec.cells.map((cell, i) => ({
    id: cellId(layer.id, i),
    kind: cell.show === "backdrop" ? "shape" : cell.show ? "image" : "text",
    name: cellName(cell),
    ...(cell.show === "backdrop" ? {} : { content: `{{${cell.field}}}` }),
    ...(cell.style ? { style: cell.style } : {}),
    geometry: f && size ? { [size]: cellBox(cell, f) } : {},
    rowCell: cell,
  }));
}

/** A cell back from its layer: its style, and its place in the row if it moved. */
function cellFrom(l: RowCellLayer, f: RowFrame | null, size: CardSize | undefined): RowsCell {
  const was = l.rowCell;
  const { style: _style, ...base } = was;
  const cell: RowsCell = { ...base, ...(l.style ? { style: l.style } : {}) };
  const b = size ? l.geometry[size] : undefined;
  if (!f || !b || near(b, cellBox(was, f))) return cell;
  const across = (f.box.w * f.colW) / 100;
  return {
    ...cell,
    x: r2(((b.x - f.box.x) / across) * 100),
    w: r2((b.w / across) * 100),
    y: r2(((b.y - f.box.y) / f.rowH) * 100),
    h: r2((b.h / f.rowH) * 100),
  };
}

/**
 * The cell of a list under a point on the artboard (percent), in any row or
 * column, top-most first; null when the point is on none.
 */
export function cellAt(
  layer: FreeLayer,
  size: CardSize,
  p: { x: number; y: number },
): string | null {
  const f = rowFrame(layer, size);
  const cells = layer.rows?.cells ?? [];
  if (!f || f.box.w <= 0 || f.rowH <= 0) return null;
  const xRel = ((p.x - f.box.x) / f.box.w) * 100;
  const step = f.colW + f.colGap;
  const col = Math.max(0, Math.floor(xRel / step));
  const x = ((xRel - col * step) / f.colW) * 100;
  const yRel = p.y - f.box.y;
  if (xRel < 0 || yRel < 0) return null;
  const y = ((yRel % f.pitch) / f.rowH) * 100;
  for (let i = cells.length - 1; i >= 0; i--) {
    const c = cells[i]!;
    const top = num(c.y);
    if (x >= num(c.x) && x <= num(c.x) + num(c.w) && y >= top && y <= top + num(c.h, 100)) {
      return cellId(layer.id, i);
    }
  }
  return null;
}

// ── Scopes ────────────────────────────────────────────────────────────────

/**
 * One level of a page as a flat document: the page itself, a group's
 * children, or a list's cells (placed at `size`).
 */
export function scopeDoc(doc: EditorDoc, scope: string | null, size?: CardSize): EditorDoc {
  const at = scopeLayer(doc, scope);
  if (!at) return doc;
  if (at.kind === "rows") return { ...doc, layers: rowCellLayers(at, size) };
  return { ...doc, layers: (at.children ?? []) as FreeLayer[] };
}

/**
 * The page with one level replaced by an edited copy of it. A list keeps the
 * cells that are still on `size` (taking a cell off its size deletes it, as a
 * cell is on every size), in their new order.
 */
export function withScope(
  doc: EditorDoc,
  scope: string | null,
  view: EditorDoc,
  size?: CardSize,
): EditorDoc {
  const at = scopeLayer(doc, scope);
  if (!at) return view;
  const { layers: _layers, ...rest } = view;
  const kept = view.layers ?? [];
  if (at.kind === "rows" && at.rows) {
    const f = size ? rowFrame(at as FreeLayer, size) : null;
    const cells = kept
      .filter(isRowCell)
      .filter((l) => !size || !l.sizes || l.sizes.includes(size))
      .map((l) => cellFrom(l, f, size));
    return { ...updateDeep(doc, at.id, { rows: { ...at.rows, cells } }), ...rest };
  }
  return { ...updateDeep(doc, at.id, { children: kept as EditorLayer[] }), ...rest };
}

/** The group a layer sits in (null at the top of the page or when it isn't there). */
export function parentOf(doc: EditorDoc, id: string): string | null {
  return findLayer(doc, id)?.parent?.id ?? null;
}

/** The groups (and list) from the top of the page down to `scope`, outermost first. */
export function scopePath(doc: EditorDoc, scope: string | null): EditorLayer[] {
  const path: EditorLayer[] = [];
  let at = scopeLayer(doc, scope);
  while (at) {
    path.unshift(at);
    const up = parentOf(doc, at.id);
    at = up ? scopeLayer(doc, up) : null;
  }
  return path;
}

/** Whether a scope's children are placed by a stack, at its level or any level above. */
export const scopeInStack = (doc: EditorDoc, scope: string | null): boolean =>
  scopePath(doc, scope).some(isStack);
