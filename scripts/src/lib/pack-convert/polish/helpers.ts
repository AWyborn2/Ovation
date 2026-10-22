/**
 * Building blocks for a look's polish (L4-C): edits to its converted
 * documents that format v2 can't get from the converter alone.
 */
import {
  TEMPLATE_SIZES,
  TEMPLATE_SIZE_ORDER,
  flattenLayers,
  isGroupLayer,
  type LayerBox,
  type PageKey,
  type RowsLayerV2,
  type TemplateDocumentV2,
  type TemplateLayerV2,
  type TemplateSize,
  type VectorLayerV2,
} from "@workspace/scorecard/kind-templates";

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Each page of a document, with its layer list (edit it in place). */
export function pagesOf(doc: TemplateDocumentV2): Array<[PageKey, TemplateLayerV2[]]> {
  return Object.entries(doc.pages).map(([page, p]) => [page as PageKey, p!.layers]);
}

/** The sizes a layer is on. */
export const sizesOf = (layer: TemplateLayerV2): TemplateSize[] =>
  layer.sizes ?? [...TEMPLATE_SIZE_ORDER];

/** Whether a layer's box covers the whole artboard on every size it's on. */
export function fullBleed(layer: TemplateLayerV2): boolean {
  return sizesOf(layer).every((s) => {
    const b = layer.geometry[s];
    return !!b && b.x <= 0.5 && b.y <= 0.5 && b.w >= 99 && b.h >= 99;
  });
}

/** A layer id not yet used in the document: `<page>-<stem><n>`. */
export function freshId(doc: TemplateDocumentV2, page: PageKey, stem: string): string {
  const used = new Set(
    Object.values(doc.pages).flatMap((p) => flattenLayers(p!.layers).map((l) => l.id)),
  );
  for (let n = 1; ; n++) {
    const id = `${page}-${stem}${n}`;
    if (!used.has(id)) return id;
  }
}

/** Removes layers (at any depth) matching `drop`; returns how many went. */
export function removeLayers(
  layers: TemplateLayerV2[],
  drop: (l: TemplateLayerV2) => boolean,
): number {
  let n = 0;
  for (let i = layers.length - 1; i >= 0; i--) {
    const l = layers[i]!;
    if (drop(l)) {
      layers.splice(i, 1);
      n++;
    } else if (isGroupLayer(l)) n += removeLayers(l.children, drop);
  }
  return n;
}

/**
 * Diagonal stripes as SVG lines (a repeating-linear-gradient at 135°, which
 * v2 fills can't express): bands `width` px wide every `period` px, measured
 * across the stripes, in a `w` × `h` px box.
 */
export function stripesSvg(
  w: number,
  h: number,
  opts: { period: number; width: number; colour: string; opacity: number },
): string {
  const step = opts.period * Math.SQRT2;
  const first = (opts.width / 2) * Math.SQRT2;
  const d: string[] = [];
  for (let c = first; c < w + h + step; c += step) d.push(`M${r2(c)} 0L0 ${r2(c)}`);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r2(w)} ${r2(h)}" ` +
    `preserveAspectRatio="none"><path d="${d.join("")}" fill="none" stroke="${opts.colour}" ` +
    `stroke-width="${opts.width}" stroke-opacity="${opts.opacity}"/></svg>`
  );
}

/** The last of a page's leading full-bleed layers (the stage, its gradient, the backdrop photo). */
export function stageEnd(layers: readonly TemplateLayerV2[]): number {
  let end = -1;
  for (const [i, l] of layers.entries()) {
    if (!fullBleed(l) && !(l.kind === "photo" && i <= end + 1)) break;
    end = i;
  }
  return end;
}

/**
 * Stripes just above the stage on every page: one vector layer per size,
 * each drawn at that size's native pixels so the stripes keep their spacing.
 * `scaleOf(size)` scales period and width (a letterboxed landscape).
 */
export function addStripes(
  doc: TemplateDocumentV2,
  opts: {
    period: number;
    width: number;
    colour: string;
    opacity: number;
    scaleOf?: (size: TemplateSize) => number;
  },
): string[] {
  const notes: string[] = [];
  for (const [page, layers] of pagesOf(doc)) {
    const at = stageEnd(layers);
    if (at < 0) continue;
    // The stage's own box on each size (the first full-bleed layer).
    const stage = layers[0]!;
    const added: VectorLayerV2[] = [];
    for (const size of sizesOf(stage)) {
      const box = stage.geometry[size];
      if (!box) continue;
      const dims = TEMPLATE_SIZES[size];
      const k = opts.scaleOf?.(size) ?? 1;
      added.push({
        id: freshId(doc, page, "stripes"),
        kind: "vector",
        name: "Stripes",
        sizes: [size],
        geometry: { [size]: { ...box } },
        svg: stripesSvg((box.w / 100) * dims.w, (box.h / 100) * dims.h, {
          ...opts,
          period: r2(opts.period * k),
          width: r2(opts.width * k),
        }),
      });
      // Ids are checked against the document, so add as we go.
      layers.splice(at + added.length, 0, added[added.length - 1]!);
    }
    if (added.length) notes.push(`${page}: diagonal stripes over the stage (a vector per size)`);
  }
  return notes;
}

/** A sponsors grid's region on each size, in percent of the artboard. */
export type GridRegion = Partial<Record<TemplateSize, LayerBox>>;

/**
 * The sponsors page's logo grid as one uniform grid (v2 rows can't tier the
 * pack's major / other sponsors): `columns` across, sized so twelve fit the
 * pack's grid region, each tile a backdrop with its logo inset. The converted
 * rows and the leftover tile shapes inside the region go.
 */
export function uniformSponsorGrid(
  doc: TemplateDocumentV2,
  opts: {
    region: GridRegion;
    columns: number;
    rows: number;
    /** Gap between tiles, px at native size (1080 wide). */
    gapPx: number;
    tile: string;
    tileRadiusPx?: number;
    /** The logo's inset in its tile, percent. */
    inset: { x: number; y: number };
  },
): string[] {
  const layers = doc.pages.sponsors?.layers;
  if (!layers) return [];
  const within = (b: LayerBox | undefined, r: LayerBox | undefined) =>
    !!b &&
    !!r &&
    b.x >= r.x - 0.5 &&
    b.y >= r.y - 0.5 &&
    b.x + b.w <= r.x + r.w + 0.5 &&
    b.y + b.h <= r.y + r.h + 0.5;
  const inGrid = (l: TemplateLayerV2) =>
    sizesOf(l).some((s) => within(l.geometry[s], opts.region[s]));
  const at = layers.findIndex(
    (l) => l.kind === "rows" && (l as RowsLayerV2).rows.repeat === "sponsors",
  );
  // Where the grid goes: after the layers that stay and came before the converted grid.
  const before = new Set(at < 0 ? layers : layers.slice(0, at));
  const removed = removeLayers(
    layers,
    (l) =>
      (l.kind === "rows" && (l as RowsLayerV2).rows.repeat === "sponsors") ||
      (l.kind === "shape" && inGrid(l)),
  );
  const sizes = TEMPLATE_SIZE_ORDER.filter((s) => opts.region[s]);
  const grids: RowsLayerV2[] = sizes.map((size) => {
    const box = opts.region[size]!;
    const dims = TEMPLATE_SIZES[size];
    const scale = dims.w / 1080;
    const regionW = (box.w / 100) * dims.w;
    const regionH = (box.h / 100) * dims.h;
    const gap = opts.gapPx * Math.min(1, regionW / 798) * scale;
    const rowPx = (regionH - gap * (opts.rows - 1)) / opts.rows;
    return {
      id: freshId(doc, "sponsors", "grid"),
      kind: "rows",
      name: "Sponsor logos",
      sizes: [size],
      geometry: { [size]: { ...box } },
      rows: {
        repeat: "sponsors",
        rowHeight: r2((rowPx / dims.w) * 100),
        gap: r2((gap / dims.w) * 100),
        columns: opts.columns,
        columnGap: r2((gap / regionW) * 100),
        cells: [
          {
            field: "logo",
            x: 0,
            w: 100,
            show: "backdrop",
            style: {
              background: opts.tile,
              ...(opts.tileRadiusPx ? { radius: opts.tileRadiusPx } : {}),
            },
          },
          {
            field: "logo",
            x: opts.inset.x,
            w: 100 - 2 * opts.inset.x,
            y: opts.inset.y,
            h: 100 - 2 * opts.inset.y,
            show: "image",
          },
        ],
      } as RowsLayerV2["rows"],
    };
  });
  // The ids were taken one by one against the document; keep them unique among the new ones.
  grids.forEach((g, i) => (g.id = `${g.id.replace(/\d+$/, "")}${i + 1}`));
  const insertAt = layers.filter((l) => before.has(l)).length;
  layers.splice(insertAt, 0, ...grids);
  return [
    `sponsors: one ${opts.columns}-column logo grid (${opts.columns * opts.rows} logos) in place of the pack's major / other tiers; ${removed} converted layers replaced`,
  ];
}

/** Edits every rows layer for `repeat`, on every page; returns how many it edited. */
export function editRows(
  doc: TemplateDocumentV2,
  repeat: string,
  edit: (rows: RowsLayerV2["rows"], layer: RowsLayerV2) => void,
): number {
  let n = 0;
  for (const [, layers] of pagesOf(doc))
    for (const l of flattenLayers(layers))
      if (l.kind === "rows" && (l as RowsLayerV2).rows.repeat === repeat) {
        edit((l as RowsLayerV2).rows, l as RowsLayerV2);
        n++;
      }
  return n;
}

/**
 * A text cell runs right to the next cell after it, less `gapPct` (percent of
 * the row), so a long value's first word fits at the fit floor and the row
 * cell can end in "…" after it.
 */
export function widenToNextCell(
  doc: TemplateDocumentV2,
  repeat: string,
  field: string,
  gapPct: number,
): string[] {
  let widened = 0;
  editRows(doc, repeat, (rows) => {
    for (const cell of rows.cells) {
      if (cell.field !== field || cell.show) continue;
      const next = rows.cells
        .filter((o) => o !== cell && o.show !== "backdrop" && o.x >= cell.x + cell.w - 0.01)
        .map((o) => o.x);
      const w = r2((next.length ? Math.min(...next) : 100) - gapPct - cell.x);
      if (w > cell.w) {
        cell.w = w;
        widened++;
      }
    }
  });
  return widened ? [`${repeat}.${field}: runs to the next cell (${widened} cells)`] : [];
}

/**
 * A text cell's font is at most `maxRatio` of the cell's width (both in
 * percent of the artboard, on the layer's narrowest size), so a long first
 * word still fits at the fit floor. Shorter values are shrunk to about the
 * same size by the fit step anyway.
 */
export function capFontToCell(
  doc: TemplateDocumentV2,
  repeat: string,
  field: string,
  maxRatio: number,
): string[] {
  let capped = 0;
  editRows(doc, repeat, (rows, layer) => {
    const widths = Object.values(layer.geometry).map((g) => g?.w ?? 100);
    const layerW = Math.min(...widths);
    for (const cell of rows.cells) {
      if (cell.field !== field || cell.show || cell.style?.fontSize === undefined) continue;
      const max = r2((maxRatio * cell.w * layerW) / 100);
      if (cell.style.fontSize > max) {
        cell.style = { ...cell.style, fontSize: max };
        capped++;
      }
    }
  });
  return capped ? [`${repeat}.${field}: font at most ${maxRatio} of the cell's width`] : [];
}

/**
 * A row cell drawn as a chip: a fill behind the cell's text, a little wider
 * and taller than the text, centred. `plain` variants keep no fill.
 */
export function chipCell(
  doc: TemplateDocumentV2,
  repeat: string,
  field: string,
  opts: { fill: string; radiusPx?: number; padX: number; y: number; h: number; plain?: string[] },
): string[] {
  const n = editRows(doc, repeat, (rows) => {
    const cell = rows.cells.find((c) => c.field === field && !c.show);
    if (!cell) return;
    cell.x = Math.max(0, r2(cell.x - opts.padX));
    cell.w = Math.min(100 - cell.x, r2(cell.w + 2 * opts.padX));
    cell.y = opts.y;
    cell.h = opts.h;
    cell.style = {
      ...cell.style,
      background: opts.fill,
      align: "center",
      ...(opts.radiusPx ? { radius: opts.radiusPx } : {}),
    };
    for (const v of opts.plain ?? []) {
      const variants = (rows.variants ??= {});
      const own = (variants[v] ??= {});
      own[field] = { ...own[field], background: "#00000000", align: "center" };
    }
  });
  return n ? [`${repeat}.${field}: drawn as a chip (${n} rows layer${n > 1 ? "s" : ""})`] : [];
}

/**
 * The Match Day card's round line also prints the grade, a core field the
 * pack's card leaves out: `{{grade}} · {{roundLabel}}`, fitted to two lines.
 */
export function gradeOnRoundLine(doc: TemplateDocumentV2): string[] {
  const layers = doc.pages.fixture?.layers;
  if (!layers) return [];
  let n = 0;
  for (const l of flattenLayers(layers)) {
    if (l.kind !== "text" || l.content?.trim() !== "{{roundLabel}}") continue;
    l.content = "{{grade}} · {{roundLabel}}";
    l.fit = { minScale: 0.6, maxLines: 2, ellipsis: true };
    if (l.showWhen?.field === "roundLabel") {
      const { field: _field, ...rest } = l.showWhen;
      if (Object.keys(rest).length) l.showWhen = rest;
      else delete l.showWhen;
    }
    n++;
  }
  return n
    ? ["fixture: the round line prints the grade too (a core field the pack's card leaves out)"]
    : [];
}

type Point = [number, number];

const offArtboard = (b: LayerBox) =>
  b.x < -0.01 || b.y < -0.01 || b.x + b.w > 100.01 || b.y + b.h > 100.01;

/**
 * A photo that bleeds off the card (Bold Type's slanted panel runs past the
 * edge) kept on it: the fit check keeps live layers on the artboard. The
 * photo becomes one layer per size, each with its box clamped to the card
 * and its clip polygon moved into that box, so the slant stays where the
 * panel's is. The panel behind it (no field) still bleeds.
 */
export function clampPhotoToArtboard(doc: TemplateDocumentV2): string[] {
  let n = 0;
  const visit = (layers: TemplateLayerV2[]) => {
    for (let i = layers.length - 1; i >= 0; i--) {
      const l = layers[i]!;
      if (isGroupLayer(l)) visit(l.children);
      if (l.kind !== "photo") continue;
      const sizes = sizesOf(l).filter((s) => l.geometry[s]);
      if (!sizes.some((s) => offArtboard(l.geometry[s]!))) continue;
      const copies = sizes.map((size): TemplateLayerV2 => {
        const box = l.geometry[size]!;
        const x0 = Math.max(0, box.x);
        const y0 = Math.max(0, box.y);
        const x1 = Math.min(100, box.x + box.w);
        const y1 = Math.min(100, box.y + box.h);
        const polygon = l.style?.clip?.polygon?.map(([px, py]): Point => {
          const ax = box.x + (px / 100) * box.w;
          const ay = box.y + (py / 100) * box.h;
          const at = (v: number) => Math.min(200, Math.max(-100, r2(v)));
          return [at(((ax - x0) / (x1 - x0)) * 100), at(((ay - y0) / (y1 - y0)) * 100)];
        });
        return {
          ...l,
          id: `${l.id}-${size}`,
          // One photo, drawn per size: the editor edits the copies together.
          link: l.link ?? l.id,
          sizes: [size],
          geometry: { [size]: { x: r2(x0), y: r2(y0), w: r2(x1 - x0), h: r2(y1 - y0) } },
          ...(polygon ? { style: { ...l.style, clip: { polygon } } } : {}),
        } as TemplateLayerV2;
      });
      layers.splice(i, 1, ...copies);
      n++;
    }
  };
  for (const [, layers] of pagesOf(doc)) visit(layers);
  return n
    ? [`the photo kept on the card: one layer per size, clamped, its clip moved in (${n})`]
    : [];
}
