/**
 * Helpers for authoring starter designs in code (plan U6, design track D1–D2).
 *
 * Starters are authored on each size's own grid in card cqmin (1 = 1% of the
 * card's shorter side — the unit the Club Kit handoff uses), then converted to
 * the template document's units: boxes in percent of the artboard, font sizes
 * in percent of its width. A layer that has no box on a size isn't on it.
 */
import { TEMPLATE_SIZE_ORDER, type TemplateSize, type TemplateTextStyle } from "../document";

/** Each size's artboard in card cqmin. */
export const CARD: Record<TemplateSize, { w: number; h: number }> = {
  square: { w: 100, h: 100 },
  portrait: { w: 100, h: 125 },
  story: { w: 100, h: 177.78 },
  landscape: { w: 190.48, h: 100 },
};

/** A box on one size, in card cqmin from the top-left corner. */
export type Box = { x: number; y: number; w: number; h: number };
export type PerSize<T> = Partial<Record<TemplateSize, T>>;

const r2 = (n: number) => Math.round(n * 100) / 100;

/** A cqmin box as percent of the artboard. */
export function pct(b: Box, s: TemplateSize) {
  const c = CARD[s];
  return {
    x: r2((b.x / c.w) * 100),
    y: r2((b.y / c.h) * 100),
    w: r2((b.w / c.w) * 100),
    h: r2((b.h / c.h) * 100),
  };
}

/** A cqmin length as percent of the artboard width (font sizes, row heights). */
export const vw = (n: number, s: TemplateSize) => r2((n / CARD[s].w) * 100);

/** Same value on every size. */
export const every = <T>(f: (s: TemplateSize) => T): Record<TemplateSize, T> =>
  Object.fromEntries(TEMPLATE_SIZE_ORDER.map((s) => [s, f(s)])) as Record<TemplateSize, T>;

export type StarterLayer = Record<string, unknown> & {
  id: string;
  kind: string;
  sizes?: TemplateSize[];
  geometry: PerSize<ReturnType<typeof pct>>;
};

/** Geometry (and size presence) from per-size boxes. */
function placed(boxes: PerSize<Box | null>) {
  const geometry: PerSize<ReturnType<typeof pct>> = {};
  const sizes: TemplateSize[] = [];
  for (const s of TEMPLATE_SIZE_ORDER) {
    const b = boxes[s];
    if (!b) continue;
    geometry[s] = pct(b, s);
    sizes.push(s);
  }
  return sizes.length === TEMPLATE_SIZE_ORDER.length ? { geometry } : { geometry, sizes };
}

/**
 * A text box. `style` is given in cqmin per size; its font size is converted.
 * Text with only `{{field}}` tokens disappears when they're all empty.
 */
export function text(
  id: string,
  name: string,
  content: string,
  boxes: PerSize<Box | null>,
  style: (s: TemplateSize) => TemplateTextStyle & { fontSize: number },
): StarterLayer[] {
  // One layer per distinct converted style: a style is shared by every size.
  const groups = new Map<string, { style: TemplateTextStyle; boxes: PerSize<Box> }>();
  for (const s of TEMPLATE_SIZE_ORDER) {
    const b = boxes[s];
    if (!b) continue;
    const raw = style(s);
    const st: TemplateTextStyle = { ...raw, fontSize: vw(raw.fontSize, s) };
    const key = JSON.stringify(st);
    const g = groups.get(key) ?? { style: st, boxes: {} };
    g.boxes[s] = b;
    groups.set(key, g);
  }
  return [...groups.values()].map((g, i) => ({
    id: groups.size === 1 ? id : `${id}-${i + 1}`,
    kind: "text",
    name,
    content,
    style: g.style,
    ...placed(g.boxes),
  }));
}

/** A Studio library element (decoration). */
export function element(
  id: string,
  name: string,
  elementId: string,
  boxes: PerSize<Box | null>,
  props?: Record<string, string>,
): StarterLayer {
  return {
    id,
    kind: "element",
    name,
    element: props ? { id: elementId, props } : { id: elementId },
    ...placed(boxes),
  };
}

/** A filled shape. */
export function shape(
  id: string,
  name: string,
  boxes: PerSize<Box | null>,
  background: string,
  radius?: number,
): StarterLayer {
  return {
    id,
    kind: "shape",
    name,
    style: radius === undefined ? { background } : { background, radius },
    ...placed(boxes),
  };
}

/** A list, one styled row repeated per data row (styles in cqmin per size group). */
export function rows(
  id: string,
  name: string,
  boxes: PerSize<Box | null>,
  spec: (s: TemplateSize) => {
    repeat: string;
    rowHeight: number;
    gap: number;
    cells: Array<{
      field: string;
      x: number;
      w: number;
      style: TemplateTextStyle & { fontSize: number };
    }>;
    variants?: Record<string, Record<string, TemplateTextStyle>>;
  },
): StarterLayer[] {
  const groups = new Map<string, { rows: unknown; boxes: PerSize<Box> }>();
  for (const s of TEMPLATE_SIZE_ORDER) {
    const b = boxes[s];
    if (!b) continue;
    const raw = spec(s);
    const conv = (st: TemplateTextStyle) =>
      st.fontSize === undefined ? st : { ...st, fontSize: vw(st.fontSize, s) };
    const converted = {
      repeat: raw.repeat,
      rowHeight: vw(raw.rowHeight, s),
      gap: vw(raw.gap, s),
      cells: raw.cells.map((c) => ({ ...c, style: conv(c.style) })),
      ...(raw.variants
        ? {
            variants: Object.fromEntries(
              Object.entries(raw.variants).map(([v, cells]) => [
                v,
                Object.fromEntries(Object.entries(cells).map(([f, st]) => [f, conv(st)])),
              ]),
            ),
          }
        : {}),
    };
    const key = JSON.stringify(converted);
    const g = groups.get(key) ?? { rows: converted, boxes: {} };
    g.boxes[s] = b;
    groups.set(key, g);
  }
  return [...groups.values()].map((g, i) => ({
    id: groups.size === 1 ? id : `${id}-${i + 1}`,
    kind: "rows",
    name,
    rows: g.rows,
    ...placed(g.boxes),
  }));
}

/**
 * Stack blocks down a column on one size. Returns each block's box, top to
 * bottom; `anchor` places the stack's centre (`center`) or its bottom edge
 * (`bottom`) at `at`.
 */
export function stack(
  col: { x: number; w: number; at: number; anchor: "center" | "bottom" },
  blocks: Array<{ h: number; gap?: number; w?: number; dx?: number }>,
): Box[] {
  const total = blocks.reduce((t, b, i) => t + b.h + (i > 0 ? (b.gap ?? 0) : 0), 0);
  let y = col.anchor === "center" ? col.at - total / 2 : col.at - total;
  return blocks.map((b, i) => {
    if (i > 0) y += b.gap ?? 0;
    const box = { x: col.x + (b.dx ?? 0), y, w: b.w ?? col.w, h: b.h };
    y += b.h;
    return box;
  });
}
