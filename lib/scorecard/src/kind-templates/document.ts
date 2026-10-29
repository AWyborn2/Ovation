/**
 * Card kind templates (plan 2026-10-07-002, ADR-001): a club's design for a
 * card kind is the Studio editor's layer document rendered on the blank base.
 *
 * This module is the single owner of the document's size rules: which sizes
 * an element is on, where an element lands when it is added to other sizes,
 * and how many list rows fit a rows layer. It is shared by the web editor,
 * the render path and the API's set planner, so it has no DOM or database
 * dependencies.
 */

import { SPONSOR_TILES_PER_PAGE } from "./tile-grid";

/** Card sizes in pixels, matching the web renderer's `SIZES`. */
export const TEMPLATE_SIZES = {
  square: { w: 1080, h: 1080 },
  portrait: { w: 1080, h: 1350 },
  story: { w: 1080, h: 1920 },
  landscape: { w: 1200, h: 630 },
} as const;

export type TemplateSize = keyof typeof TEMPLATE_SIZES;

export const TEMPLATE_SIZE_ORDER: readonly TemplateSize[] = [
  "square",
  "portrait",
  "story",
  "landscape",
];

/** A layer's box, in percent of the artboard; rotation in degrees. */
export type LayerBox = { x: number; y: number; w: number; h: number; rotate?: number };

/** Text styling shared by text layers and list-row cells. */
export type TemplateTextStyle = {
  color?: string;
  background?: string;
  fontFamily?: string;
  /** Font size in percent of the artboard width. */
  fontSize?: number;
  fontWeight?: number;
  /** Letter spacing in em. */
  letterSpacing?: number;
  /** Set the text in capitals (the data keeps its own case). */
  uppercase?: boolean;
  align?: "left" | "center" | "right";
  radius?: number;
  opacity?: number;
};

/** One cell of a list row: a card field placed across part of the row. */
export type RowsCell = {
  /** The row field key (e.g. `team`, `points`). */
  field: string;
  /** Left edge, in percent of the layer width. */
  x: number;
  /** Width, in percent of the layer width. */
  w: number;
  /** Top edge and height, in percent of the row (default: the whole row). */
  y?: number;
  h?: number;
  /**
   * How the cell shows its field: as text (default), as an image whose URL
   * the field holds (a player photo; never on a junior card), or as a
   * backdrop — the cell's background only, no content (a panel behind
   * other cells). Format v2 adds `logo`: a crest or sponsor logo the row
   * holds (`LOGO_ROW_FIELDS` only), drawn whole on any card.
   */
  show?: "text" | "image" | "backdrop" | "logo";
  /**
   * Format v2: a stand-in for another cell, drawn only when that row field
   * is empty (the opposition's monogram where its crest is missing).
   */
  fallbackFor?: string;
  style?: TemplateTextStyle;
};

/**
 * The row fields a `logo` cell may show: crests and sponsor logos, never a
 * photo, so a logo cell can't put a junior's photo on a card.
 */
export const LOGO_ROW_FIELDS: readonly string[] = ["crest", "logo"];

/** A repeating list row (`kind: "rows"`): one styled row per data row. */
export type RowsSpec = {
  /** The card's repeat key (e.g. `rows`, `matches`, `leaders`, `players`). */
  repeat: string;
  /** Row height, in percent of the artboard width (so it scales like text). */
  rowHeight: number;
  /** Gap between rows, in percent of the artboard width. */
  gap?: number;
  cells: RowsCell[];
  /**
   * Columns the rows flow down, side by side (default 1): an XI as two
   * columns of six. Rows fill the first column, then the next.
   */
  columns?: number;
  /** Gap between columns, in percent of the layer width. */
  columnGap?: number;
  /**
   * With columns, how rows fill them (format v2): `down` (default) fills the
   * first column, then the next; `across` fills each line left to right, as a
   * grid of tiles reads (Team of the Week).
   */
  flow?: "down" | "across";
  /**
   * Format v2, the sponsors list only: `tiles` draws the rows as logo tiles
   * that fill the layer's box (`tile-grid.ts`): `major` rows larger, in their
   * own lines above, every line centred. `rowHeight` is then the tallest a
   * standard tile may be, `gap` the space between tiles; `columns`, `flow`
   * and `columnGap` don't apply. It holds `SPONSOR_TILES_PER_PAGE` rows.
   */
  layout?: "tiles";
  /** Per-variant cell style overrides (e.g. the club's own ladder row). */
  variants?: Record<string, Partial<Record<string, TemplateTextStyle>>>;
  /**
   * Which rows the list draws (format v2; a result's performance and innings
   * lists, `rows-pick.ts`): whose, sorted how, and how many.
   */
  pick?: RowsPick;
};

/**
 * A list's row choice (full draft editor plan, stages 4 and 5). `side` is
 * whose performances (a performance list only: an innings list is one
 * side's; none is both); `sort` orders them best first; `count` keeps that
 * many (0 is all, 1 the best); `minRuns`, `minWickets` and `notOutOnly`
 * filter a batting or bowling list. A list without one draws every row in
 * scorecard order (D4).
 */
export type RowsPick = {
  side?: "club" | "opposition" | "both";
  count?: number;
  sort?: "runs" | "balls" | "strikeRate" | "wickets" | "figures" | "economy";
  /** A batting list: only innings of at least this many runs. */
  minRuns?: number;
  /** A bowling list: only spells of at least this many wickets. */
  minWickets?: number;
  /** A batting list: only not-out innings. */
  notOutOnly?: boolean;
};

/** The size-related shape every template layer shares. */
export type TemplateLayerBase = {
  id: string;
  kind: string;
  /** The sizes this layer is on; absent means every size. */
  sizes?: TemplateSize[];
  /** Per-size boxes. */
  geometry: Partial<Record<TemplateSize, LayerBox>>;
  rows?: RowsSpec;
};

/** A document holding layers (a kind template or a draft's adjustments). */
export type LayerDocument<L extends TemplateLayerBase = TemplateLayerBase> = {
  layers?: L[];
};

/** Whether a layer is on `size`. */
export function layerOnSize(layer: TemplateLayerBase, size: TemplateSize): boolean {
  return !layer.sizes || layer.sizes.includes(size);
}

/** The layers on `size`, in document (back-to-front) order. */
export function layersForSize<L extends TemplateLayerBase>(
  doc: LayerDocument<L>,
  size: TemplateSize,
): L[] {
  return (doc.layers ?? []).filter((l) => layerOnSize(l, size));
}

/** The sizes with at least one layer, in standard order. */
export function sizesWithLayers(doc: LayerDocument): TemplateSize[] {
  return TEMPLATE_SIZE_ORDER.filter((size) => layersForSize(doc, size).length > 0);
}

/** The sizes with no layers at all — a template can't be saved with any (KTD15). */
export function emptySizes(doc: LayerDocument): TemplateSize[] {
  return TEMPLATE_SIZE_ORDER.filter((size) => layersForSize(doc, size).length === 0);
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/**
 * Where a box from `from` lands on `to` (KTD16): the same centre, as a
 * fraction of each canvas, and the same pixel aspect ratio, scaled by the
 * smaller of the two axis ratios and clamped inside the canvas.
 */
export function placeBoxOnSize(box: LayerBox, from: TemplateSize, to: TemplateSize): LayerBox {
  if (from === to) return { ...box };
  const a = TEMPLATE_SIZES[from];
  const b = TEMPLATE_SIZES[to];
  const scale = Math.min(b.w / a.w, b.h / a.h);
  const pxW = (box.w / 100) * a.w * scale;
  const pxH = (box.h / 100) * a.h * scale;
  const w = clamp((pxW / b.w) * 100, 0, 100);
  const h = clamp((pxH / b.h) * 100, 0, 100);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const next: LayerBox = {
    x: clamp(cx - w / 2, 0, 100 - w),
    y: clamp(cy - h / 2, 0, 100 - h),
    w,
    h,
  };
  if (box.rotate !== undefined) next.rotate = box.rotate;
  return next;
}

/**
 * A layer added to more sizes (R10): each target size without the layer gets
 * a box placed from `from`; sizes that already have the layer are left alone.
 */
export function addLayerToSizes<L extends TemplateLayerBase>(
  layer: L,
  from: TemplateSize,
  targets: readonly TemplateSize[],
): L {
  const source = layer.geometry[from];
  if (!source) return layer;
  const present = new Set<TemplateSize>(layer.sizes ?? TEMPLATE_SIZE_ORDER);
  const geometry = { ...layer.geometry };
  for (const size of targets) {
    if (layer.sizes && present.has(size)) continue;
    if (!layer.sizes && geometry[size]) continue;
    geometry[size] = placeBoxOnSize(source, from, size);
    present.add(size);
  }
  const sizes = TEMPLATE_SIZE_ORDER.filter((s) => present.has(s));
  const next: L = { ...layer, geometry };
  if (sizes.length === TEMPLATE_SIZE_ORDER.length) delete next.sizes;
  else next.sizes = sizes;
  return next;
}

/** How many rows a rows layer holds on `size` (KTD13); 0 when it isn't on that size. */
export function rowsCapacity(layer: TemplateLayerBase, size: TemplateSize): number {
  const rows = layer.rows;
  const box = layer.geometry[size];
  if (!rows || !box || !layerOnSize(layer, size) || rows.rowHeight <= 0) return 0;
  if (rows.layout === "tiles") return SPONSOR_TILES_PER_PAGE;
  const dims = TEMPLATE_SIZES[size];
  const boxPx = (box.h / 100) * dims.h;
  const rowPx = (rows.rowHeight / 100) * dims.w;
  const gapPx = ((rows.gap ?? 0) / 100) * dims.w;
  const perColumn = Math.max(0, Math.floor((boxPx + gapPx) / (rowPx + gapPx)));
  return perColumn * rowsColumns(rows);
}

/** How many columns a list flows down (1–6; anything else counts as 1). */
export function rowsColumns(rows: Pick<RowsSpec, "columns">): number {
  const n = rows.columns;
  return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 6 ? n : 1;
}

/** A document's row capacity on `size`: the first rows layer bound to `repeat`. */
export function documentRowsCapacity(
  doc: LayerDocument,
  size: TemplateSize,
  repeat: string,
): number | null {
  const layer = layersForSize(doc, size).find(
    (l) => l.kind === "rows" && l.rows?.repeat === repeat,
  );
  return layer ? rowsCapacity(layer, size) : null;
}
