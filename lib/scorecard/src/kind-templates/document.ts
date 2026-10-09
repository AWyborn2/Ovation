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
  style?: TemplateTextStyle;
};

/** A repeating list row (`kind: "rows"`): one styled row per data row. */
export type RowsSpec = {
  /** The card's repeat key (e.g. `rows`, `matches`, `leaders`, `players`). */
  repeat: string;
  /** Row height, in percent of the artboard width (so it scales like text). */
  rowHeight: number;
  /** Gap between rows, in percent of the artboard width. */
  gap?: number;
  cells: RowsCell[];
  /** Per-variant cell style overrides (e.g. the club's own ladder row). */
  variants?: Record<string, Partial<Record<string, TemplateTextStyle>>>;
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
  const dims = TEMPLATE_SIZES[size];
  const boxPx = (box.h / 100) * dims.h;
  const rowPx = (rows.rowHeight / 100) * dims.w;
  const gapPx = ((rows.gap ?? 0) / 100) * dims.w;
  return Math.max(0, Math.floor((boxPx + gapPx) / (rowPx + gapPx)));
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
