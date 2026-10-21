/**
 * Map one capture (one pack page at one size) to template layers (L4-A2,
 * tasks T4.4–T4.8). Each layer carries a signature, so the same layer is
 * found again in the capture of another size, preset or branch (`merge.ts`).
 *
 * - Text: markers become `{{tokens}}`, static text stays literal; the
 *   computed font, size, weight, spacing, case, alignment, colour, line
 *   height and shadows become the text style; `data-fit` / `data-fit-row`
 *   become the shared name fit.
 * - Slots: an `<img>` whose source is a sentinel image is the slot it names
 *   (`photo` layers for photos, `{{token}}` image layers for logos and crests).
 * - Repeats: a `data-repeat` container, or indexed fields (`day0.*`,
 *   `weekendSponsorName0`), become a rows layer: the first row's cells, its
 *   height and the pitch to the next row.
 * - Shapes: an element with a fill, gradient, border or shadow becomes a
 *   shape with the extended style. A colour equal to a token in both
 *   palettes becomes `var(--token)`.
 * - Vectors: inline SVG becomes a vector layer, `currentColor` resolved.
 * - Motion: `hhPulse` / `hhShine` become `loop` presets.
 *
 * Anything else is listed for polish.
 */

import type { CapturedElement, PackCapture } from "@workspace/scorecard/pack-capture";
import { markerField } from "@workspace/scorecard/pack-capture";
import type {
  LayerBox,
  RowsCell,
  RowsSpec,
  TemplateLayerV2,
  TemplateStyleV2,
  TemplateTextShadow,
  TemplateBoxShadow,
  TemplateFill,
  BlendMode,
} from "@workspace/scorecard/kind-templates";
import {
  parseColour,
  parseGradient,
  parseMatrix,
  parseShadows,
  pureRotation,
  px,
  r2,
  splitTopLevel,
  tokeniseColour,
  transformedCorners,
  type PaletteColours,
} from "./css";

/** A layer found in one capture, before geometry is merged across sizes. */
export interface MappedLayer {
  /** Identity across sizes, presets and branches. */
  sig: string;
  /** The layer without `id` and `geometry` (merge adds both). */
  layer: Omit<TemplateLayerV2, "id" | "geometry">;
  box: LayerBox;
  /** The captured element it came from. */
  element: number;
  /** A `data-drop-if-field` on an ancestor: the field whose absence drops the layer. */
  dropIfField?: string;
}

export interface PolishItem {
  element: number;
  what: string;
}

export interface MapResult {
  layers: MappedLayer[];
  polish: PolishItem[];
  /** Colours that move with the palette but match no token. */
  untokenised: string[];
  /** Animations found: name → what it became (or "unmapped"). */
  motion: Record<string, string>;
}

const PHOTO_SLOTS = new Set(["photo", "squadPhoto", "teamPhoto", "cardPhoto"]);
const DAY_FIELD = /^day(\d+)\.(.+)$/;
const SPONSOR_NAME = /^weekendSponsorName(\d+)$/;
const SPONSOR_IMAGE = /^weekendSponsor(\d+)$/;
const TOKEN_IN_TEXT = /\[\[([A-Za-z0-9_.]+)\]\]/g;
const MOTION: Record<string, { preset: "pulse" | "shine"; periodMs: number }> = {
  hhPulse: { preset: "pulse", periodMs: 1400 },
  hhShine: { preset: "shine", periodMs: 5500 },
};

class Tree {
  readonly byId = new Map<number, CapturedElement>();
  readonly children = new Map<number, CapturedElement[]>();
  constructor(readonly capture: PackCapture) {
    for (const el of capture.elements) {
      this.byId.set(el.id, el);
      if (el.parent !== null) {
        const list = this.children.get(el.parent) ?? [];
        list.push(el);
        this.children.set(el.parent, list);
      }
    }
  }
  ancestors(el: CapturedElement): CapturedElement[] {
    const out: CapturedElement[] = [];
    let p = el.parent === null ? undefined : this.byId.get(el.parent);
    while (p) {
      out.push(p);
      p = p.parent === null ? undefined : this.byId.get(p.parent);
    }
    return out;
  }
  descendants(el: CapturedElement): CapturedElement[] {
    const out: CapturedElement[] = [];
    const walk = (e: CapturedElement) => {
      for (const c of this.children.get(e.id) ?? []) {
        out.push(c);
        walk(c);
      }
    };
    walk(el);
    return out;
  }
  /** A computed property, looking up the tree for inherited ones the capture diffed away. */
  style(el: CapturedElement, prop: string): string | undefined {
    if (el.style[prop] !== undefined) return el.style[prop];
    for (const a of this.ancestors(el)) if (a.style[prop] !== undefined) return a.style[prop];
    return undefined;
  }
}

/** The sentinel slot an image source names (`sentinel:clubLogo`, `sentinel:worst.photo`). */
function slotOf(src: string | undefined, images: Record<string, string>): string | null {
  return slotsOf(src, images)[0] ?? null;
}

/**
 * Every slot an image source fills: one source can fill several (a junior
 * day row's crest is the opposition's crest too), so a caller picks by context.
 */
function slotsOf(src: string | undefined, images: Record<string, string>): string[] {
  if (!src) return [];
  const keys = Object.entries(images)
    .filter(([, url]) => url === src)
    .map(([key]) => key);
  if (keys.length) return keys;
  const m = /^sentinel:(?:worst\.)?([A-Za-z0-9_.-]+)$/.exec(src);
  return m ? [m[1]!] : [];
}

export interface MapOptions {
  /** The palette-B capture of the same render (`colours` detail), element ids aligned. */
  paletteB?: PackCapture | null;
  /** A pack field → the page token it is (a title page's `date` is `dateRange`). */
  aliases?: Record<string, string>;
  /**
   * The worst-case capture of the same page and size: layer boxes come from it
   * (realistic content sizes the boxes; sentinel markers are short), its
   * elements matched by their path in the DOM.
   */
  geometry?: PackCapture | null;
}

/** Each element's path in the DOM (`0/3/1`): stable between two renders of one template. */
function elementPaths(tree: Tree): Map<number, string> {
  const paths = new Map<number, string>();
  for (const el of tree.capture.elements) {
    if (el.parent === null) {
      paths.set(el.id, "0");
      continue;
    }
    const siblings = tree.children.get(el.parent) ?? [];
    paths.set(el.id, `${paths.get(el.parent)}/${siblings.indexOf(el)}`);
  }
  return paths;
}

/**
 * A bound repeat's rows in the DOM: row i is the deepest element holding the
 * text of a value only row i has, and nothing of another row's. Null when the
 * rows can't be told apart (no values unique to each row).
 */
function boundRows(
  tree: Tree,
  cap: PackCapture,
  bound: Array<{ variant?: string; values: Record<string, string> }>,
): { rows: CapturedElement[]; consumed: number[] } | null {
  const norm = (s: string) => s.trim().toLowerCase();
  const counts = new Map<string, number>();
  for (const r of bound)
    for (const v of new Set(Object.values(r.values).map(norm)))
      counts.set(v, (counts.get(v) ?? 0) + 1);
  const texts = cap.elements
    .filter((e) => e.hidden !== "display")
    .flatMap((e) => (e.text ?? []).map((t) => ({ el: e, text: norm(t.text) })));
  const anchors = bound.map((r) => {
    const unique = Object.values(r.values)
      .map(norm)
      .filter((v) => v.length >= 2 && counts.get(v) === 1);
    return texts
      .filter((t) => unique.some((v) => t.text === v || t.text.includes(v)))
      .map((t) => t.el);
  });
  if (anchors.some((a) => a.length === 0)) return null;
  const rows: CapturedElement[] = [];
  const consumed: number[] = [];
  anchors.forEach((own, i) => {
    const others = new Set(
      anchors
        .filter((_, j) => j !== i)
        .flat()
        .map((e) => e.id),
    );
    let row = own[0]!;
    for (const anc of tree.ancestors(own[0]!)) {
      const inside = new Set(tree.descendants(anc).map((d) => d.id));
      if ([...others].some((id) => inside.has(id))) break;
      if (own.every((e) => inside.has(e.id) || e.id === anc.id)) row = anc;
    }
    rows.push(row);
    consumed.push(row.id, ...tree.descendants(row).map((d) => d.id));
  });
  return { rows, consumed };
}

export function mapCapture(cap: PackCapture, opts: MapOptions = {}): MapResult {
  const tree = new Tree(cap);
  // Boxes from the worst-case capture where its element is found by path.
  const gTree = opts.geometry ? new Tree(opts.geometry) : null;
  const ownPaths = gTree ? elementPaths(tree) : null;
  const gByPath = gTree
    ? new Map([...elementPaths(gTree)].map(([id, path]) => [path, gTree.byId.get(id)!]))
    : null;
  const twin = (el: CapturedElement): CapturedElement => {
    const t = gByPath?.get(ownPaths?.get(el.id) ?? "");
    return t && t.tag === el.tag ? t : el;
  };
  /** A repeat's box: its rows in the worst-case capture (filled to capacity), else the rows found. */
  const rowsBox = (rows: CapturedElement[]) => {
    const parent = rows[0]!.parent === null ? undefined : tree.byId.get(rows[0]!.parent);
    const tp = parent ? twin(parent) : undefined;
    if (parent && tp && tp !== parent && gTree) {
      const own = tree.children.get(parent.id) ?? [];
      const first = own.indexOf(rows[0]!);
      const trailing = own.length - 1 - own.indexOf(rows[rows.length - 1]!);
      const theirs = gTree.children.get(tp.id) ?? [];
      const twinRows = theirs.slice(first, theirs.length - trailing).filter((r) => r.box.h > 0);
      if (twinRows.length) return unionBox(twinRows.map((r) => r.box));
    }
    return unionBox(rows.map((r) => r.box));
  };
  const W = cap.native.w;
  const H = cap.native.h;
  const b = opts.paletteB;
  const aligned =
    !!b &&
    b.elements.length === cap.elements.length &&
    b.elements.every((e, i) => e.tag === cap.elements[i]!.tag);
  const bById = new Map((aligned ? b!.elements : []).map((e) => [e.id, e]));
  const bTree = aligned ? new Tree(b!) : null;
  const palette: PaletteColours = { a: cap.rootColours, b: aligned ? b!.rootColours : null };
  const polish: PolishItem[] = [];
  const untokenised = new Set<string>();
  const motion: Record<string, string> = {};
  const layers: MappedLayer[] = [];
  const counts = new Map<string, number>();
  const sigOf = (base: string) => {
    const n = counts.get(base) ?? 0;
    counts.set(base, n + 1);
    return `${base}#${n}`;
  };
  const pct = (box: { x: number; y: number; w: number; h: number }): LayerBox => ({
    x: r2((box.x / W) * 100),
    y: r2((box.y / H) * 100),
    w: r2((box.w / W) * 100),
    h: r2((box.h / H) * 100),
  });
  const wPct = (n: number) => r2((n / W) * 100);
  const colour = (el: CapturedElement, prop: string): string | undefined => {
    const a = tree.style(el, prop);
    const bEl = bById.get(el.id);
    const inB = bEl && bTree ? bTree.style(bEl, prop) : undefined;
    const match = tokeniseColour(a, inB, palette);
    if (!match) return undefined;
    if (match.moved && !match.token) untokenised.add(`${prop} ${a} (element ${el.id})`);
    return match.value;
  };
  const shadowColour = (raw: string, el: CapturedElement, prop: string, i: number) => {
    const bShadow = bById.get(el.id)?.style[prop];
    const twin = bShadow ? parseShadows(bShadow)[i]?.colour : undefined;
    const match = tokeniseColour(raw, twin, palette);
    if (match?.moved && !match.token) untokenised.add(`${prop} ${raw} (element ${el.id})`);
    return match?.value ?? raw;
  };

  // Elements handled as part of a repeat (their rows layer draws them).
  const consumed = new Set<number>();
  // The field an ancestor's `data-drop-if-field` names.
  const dropField = (el: CapturedElement) =>
    [el, ...tree.ancestors(el)].find((a) => a.data?.dropIfField)?.data?.dropIfField;

  const resolveTokens = (text: string) =>
    text.replace(TOKEN_IN_TEXT, (_m, key: string) => {
      const field = markerField(key, Object.keys(cap.markers)) ?? key;
      return `{{${opts.aliases?.[field] ?? field}}}`;
    });

  // ── Rows: indexed fields (day0.*, weekendSponsorName0) ────────────────────
  const indexedList = indexedRepeats(tree, cap, resolveTokens, slotsOf);

  // ── Rows: bound repeats, found by their rows' own values ──────────────────
  // A rendered repeat keeps no container marker, so each bound row is found by
  // the values only it has (sentinel markers are unique per row).
  const done = new Set(indexedList.map((r) => r.repeat));
  for (const [repeat, bound] of Object.entries(cap.rows)) {
    if (done.has(repeat) || bound.length === 0) continue;
    const found = boundRows(tree, cap, bound);
    if (!found) continue;
    for (const id of found.consumed) consumed.add(id);
    const spec = rowsSpec(tree, found.rows, bound, { repeat, W, colour, fit: true });
    if (!spec) {
      polish.push({
        element: found.rows[0]!.id,
        what: `repeat "${repeat}" found but no cells mapped`,
      });
      continue;
    }
    const first = found.rows[0]!;
    layers.push({
      sig: sigOf(`rows:${repeat}`),
      layer: { kind: "rows", rows: spec.spec } as MappedLayer["layer"],
      box: pct(rowsBox(found.rows)),
      element: first.id,
      ...(dropField(first) ? { dropIfField: dropField(first) } : {}),
    });
  }

  for (const indexed of indexedList) {
    for (const id of indexed.consumed) consumed.add(id);
    const spec = rowsSpec(tree, indexed.rows, indexed.values, {
      repeat: indexed.repeat,
      W,
      colour,
      fit: true,
      cellField: indexed.cellField,
    });
    if (!spec) continue;
    const first = indexed.rows[0]!;
    layers.push({
      sig: sigOf(`rows:${indexed.repeat}`),
      layer: { kind: "rows", rows: spec.spec } as MappedLayer["layer"],
      box: pct(rowsBox(indexed.rows)),
      element: first.id,
    });
  }

  // ── Everything else, back to front in document order ──────────────────────
  for (const el of cap.elements) {
    if (consumed.has(el.id) || el.hidden === "display") continue;
    if (el.box.w <= 0 || el.box.h <= 0) continue;
    if (tree.ancestors(el).some((a) => a.tag === "svg")) continue;
    const drop = dropField(el);
    const g = twin(el);
    const add = (base: string, layer: MappedLayer["layer"], box = pct(g.box)) =>
      layers.push({
        sig: sigOf(base),
        layer,
        box,
        element: el.id,
        ...(drop ? { dropIfField: drop } : {}),
      });

    const transform = parseMatrix(el.style.transform);
    const rotate = transform ? pureRotation(transform) : null;
    const skewed = !!transform && rotate === null;
    const withRotate = (box: LayerBox): LayerBox =>
      rotate ? { ...(g.size ? centred(box, g.size, W, H) : box), rotate } : box;

    const anim = el.style["animation-name"];
    const motionFor = (): TemplateLayerV2["motion"] | undefined => {
      if (!anim || anim === "none") return undefined;
      const name = anim.split(",")[0]!.trim();
      const m = MOTION[name];
      motion[name] = m ? `loop: ${m.preset}, ${m.periodMs} ms` : "unmapped";
      if (!m) polish.push({ element: el.id, what: `animation ${name} not mapped` });
      return m ? { loop: { preset: m.preset, periodMs: m.periodMs } } : undefined;
    };

    // Inline SVG: a vector layer.
    if (el.tag === "svg" && el.svg) {
      const current = colour(el, "color");
      const svg = current ? el.svg.replace(/currentColor/gi, current) : el.svg;
      if (/#[0-9a-f]{3,8}\b|rgb\(/i.test(svg))
        untokenised.add(`literal colours in inline SVG (element ${el.id})`);
      add(
        `vector:${hash(svg)}`,
        { kind: "vector", svg } as MappedLayer["layer"],
        withRotate(pct(g.box)),
      );
      continue;
    }

    // Images: slots by their sentinel source.
    if (el.tag === "img") {
      const slot = slotOf(el.src, cap.images);
      if (!slot) {
        polish.push({ element: el.id, what: `image ${el.src ?? ""} is no known slot` });
        continue;
      }
      const style: TemplateStyleV2 = {};
      const radius = radiusOf(tree, el);
      if (radius) style.radius = radius;
      const opacity = num(el.style.opacity);
      if (opacity < 1) style.opacity = r2(opacity);
      if (!PHOTO_SLOTS.has(slot) && slot !== "groundPhoto" && el.style["object-fit"] === "cover")
        polish.push({
          element: el.id,
          what: `${slot}: cropped to fill (object-fit: cover), drawn contained`,
        });
      if (PHOTO_SLOTS.has(slot))
        add(`photo:${slot}`, {
          kind: "photo",
          ...(Object.keys(style).length ? { style } : {}),
        } as MappedLayer["layer"]);
      else
        add(`image:${slot}`, {
          kind: "image",
          content: `{{${slot}}}`,
          ...(Object.keys(style).length ? { style } : {}),
        } as MappedLayer["layer"]);
      continue;
    }

    // The element's own paint: a shape behind its text and children.
    const paint = shapeStyle(tree, el, { colour, shadowColour, wPct, polish, cap });
    const text = el.text ?? [];
    const textStyle = text.length
      ? textStyleOf(tree, el, { colour, shadowColour, wPct, polish, cap })
      : null;
    if (paint && skewed && typeof paint.style.fill === "string" && !text.length) {
      // A skewed panel (Broadcast Dark's slashes): its transformed box as a polygon.
      add(`vector:skew:${paint.key}`, {
        kind: "vector",
        svg: skewPolygon(g, transform!, paint.style.fill, paint.style.opacity),
      } as MappedLayer["layer"]);
      continue;
    }
    if (skewed)
      polish.push({
        element: el.id,
        what: `transform ${el.style.transform} (skew or scale) drawn untransformed`,
      });
    if (paint) {
      const m = motionFor();
      add(
        `shape:${paint.key}`,
        {
          kind: "shape",
          style: paint.style,
          ...(m && !text.length ? { motion: m } : {}),
        } as MappedLayer["layer"],
        withRotate(pct(g.box)),
      );
    }
    // Background images that name a slot (a ground photo behind a panel).
    const bgImage = el.style["background-image"];
    if (bgImage && bgImage !== "none")
      for (const part of splitTopLevel(bgImage)) {
        const url = /^url\("?([^")]*)"?\)$/.exec(part)?.[1];
        if (!url) continue;
        const slot = slotOf(url, cap.images);
        if (slot && PHOTO_SLOTS.has(slot))
          add(`photo:${slot}`, { kind: "photo" } as MappedLayer["layer"]);
        else if (slot)
          add(`image:${slot}`, { kind: "image", content: `{{${slot}}}` } as MappedLayer["layer"]);
        else
          polish.push({ element: el.id, what: `background image ${url.slice(0, 60)} not mapped` });
      }

    for (const which of ["before", "after"] as const) {
      const ps = el[which];
      if (ps)
        polish.push({
          element: el.id,
          what: `::${which} (${(ps.content ?? "").slice(0, 30)}) not mapped`,
        });
    }

    if (!text.length || !textStyle) continue;
    const content = text.map((t) => resolveTokens(t.text)).join(" ");
    const hasChildren = (tree.children.get(el.id) ?? []).some(
      (c) => c.text?.length || c.tag === "br",
    );
    // With element children the runs' own box; else the content box (padding removed).
    const box = hasChildren
      ? unionBox((g.text?.length ? g.text : text).map((t) => t.box))
      : contentBox(g);
    const fit = el.data?.fit !== undefined || el.data?.fitRow !== undefined;
    const m = motionFor();
    add(
      `text:${content}`,
      {
        kind: "text",
        content,
        style: textStyle,
        ...(fit ? { fit: { minScale: 0.6, maxLines: 2, ellipsis: true } } : {}),
        ...(m ? { motion: m } : {}),
      } as MappedLayer["layer"],
      withRotate(pct(box)),
    );
  }

  // Back to front in document order: a repeat sits where its first row is (the sort is stable).
  layers.sort((a, b) => a.element - b.element);
  return { layers, polish, untokenised: [...untokenised], motion };
}

// ── Pieces ──────────────────────────────────────────────────────────────────

/** A skewed box as SVG: its transformed corners, filled with the box's colour. */
function skewPolygon(
  el: CapturedElement,
  m: number[],
  fill: string,
  opacity: number | undefined,
): string {
  const size = el.size ?? { w: el.box.w, h: el.box.h };
  const [ox, oy] = (el.style["transform-origin"] ?? "").split(/\s+/).map((v) => px(v));
  const origin = {
    x: ox !== undefined && Number.isFinite(ox) ? ox : size.w / 2,
    y: oy !== undefined && Number.isFinite(oy) ? oy : size.h / 2,
  };
  const points = transformedCorners(size.w, size.h, m, origin)
    .map((p) => `${p.x},${p.y}`)
    .join(" ");
  const alpha = opacity !== undefined && opacity < 1 ? ` fill-opacity="${opacity}"` : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r2(el.box.w)} ${r2(el.box.h)}" ` +
    `preserveAspectRatio="none"><polygon points="${points}" fill="${fill}"${alpha}/></svg>`
  );
}

const num = (v: string | undefined, fallback = 1) => {
  const n = parseFloat(v ?? "");
  return Number.isFinite(n) ? n : fallback;
};

function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** A rotated element's untransformed box, centred where its bounding box is. */
function centred(box: LayerBox, size: { w: number; h: number }, W: number, H: number): LayerBox {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const w = r2((size.w / W) * 100);
  const h = r2((size.h / H) * 100);
  return { x: r2(cx - w / 2), y: r2(cy - h / 2), w, h };
}

function unionBox(boxes: Array<{ x: number; y: number; w: number; h: number }>) {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.w));
  const bottom = Math.max(...boxes.map((b) => b.y + b.h));
  return { x, y, w: right - x, h: bottom - y };
}

function contentBox(el: CapturedElement) {
  const p = (side: string) => {
    const v = px(el.style[`padding-${side}`]);
    return Number.isFinite(v) ? v : 0;
  };
  const b = (side: string) => {
    const v = px(el.style[`border-${side}-width`]);
    return Number.isFinite(v) ? v : 0;
  };
  const left = p("left") + b("left");
  const top = p("top") + b("top");
  return {
    x: el.box.x + left,
    y: el.box.y + top,
    w: Math.max(1, el.box.w - left - p("right") - b("right")),
    h: Math.max(1, el.box.h - top - p("bottom") - b("bottom")),
  };
}

/** The element's corner radius in px (the largest corner; uneven corners are reported elsewhere). */
function radiusOf(tree: Tree, el: CapturedElement): number | undefined {
  const corners = ["top-left", "top-right", "bottom-right", "bottom-left"].map((c) =>
    px(el.style[`border-${c}-radius`]),
  );
  // A clipping parent's radius rounds an image too.
  const parent = el.parent === null ? undefined : tree.byId.get(el.parent);
  const own = Math.max(0, ...corners.filter(Number.isFinite));
  if (own) return r2(own);
  if (parent && parent.style["overflow-x"] === "hidden") {
    const pr = Math.max(
      0,
      ...["top-left", "top-right", "bottom-right", "bottom-left"]
        .map((c) => px(parent.style[`border-${c}-radius`]))
        .filter(Number.isFinite),
    );
    if (pr) return r2(pr);
  }
  return undefined;
}

interface StyleContext {
  colour: (el: CapturedElement, prop: string) => string | undefined;
  shadowColour: (raw: string, el: CapturedElement, prop: string, i: number) => string;
  wPct: (n: number) => number;
  polish: PolishItem[];
  cap: PackCapture;
}

/** A gradient as the format's fill, its colours tokenised where the twin capture allows. */
function gradientFill(value: string, ctx: StyleContext, el: CapturedElement): TemplateFill | null {
  const g = parseGradient(value);
  if (!g) return null;
  const stops = g.stops.map((s) => {
    const match = tokeniseColour(s.colour, undefined, { a: ctx.cap.rootColours, b: null });
    return { color: match?.value ?? "#00000000", ...(s.at !== undefined ? { at: r2(s.at) } : {}) };
  });
  void el;
  return g.type === "linear"
    ? { type: "linear", ...(g.angle !== undefined ? { angle: g.angle } : {}), stops }
    : {
        type: "radial",
        ...(g.shape ? { shape: g.shape } : {}),
        ...(g.at ? { at: g.at } : {}),
        stops,
      };
}

/** An element's box paint (fill, gradient, border, radius, shadow, opacity, blend), or null. */
function shapeStyle(
  tree: Tree,
  el: CapturedElement,
  ctx: StyleContext,
): { style: TemplateStyleV2; key: string } | null {
  const style: TemplateStyleV2 = {};
  const fill = ctx.colour(el, "background-color");
  if (el.style["background-color"] && fill) style.fill = fill;
  const image = el.style["background-image"];
  if (image && image !== "none") {
    const layers = splitTopLevel(image).filter((p) => !p.startsWith("url("));
    const gradient = layers.length ? gradientFill(layers[0]!, ctx, el) : null;
    if (gradient) style.fill = gradient;
    if (layers.length > 1)
      ctx.polish.push({
        element: el.id,
        what: `${layers.length} layered backgrounds; the first is kept`,
      });
    if (layers.length && !gradient)
      ctx.polish.push({ element: el.id, what: `background ${layers[0]!.slice(0, 50)} not mapped` });
  }
  if (el.style["background-clip"] === "text" || el.style["-webkit-background-clip"] === "text") {
    delete style.fill; // a text fill, handled with the text style
  }
  const sides = ["top", "right", "bottom", "left"].map((s) => ({
    s,
    w: px(el.style[`border-${s}-width`]),
    style: el.style[`border-${s}-style`],
  }));
  const drawn = sides.filter(
    (d) => Number.isFinite(d.w) && d.w > 0 && d.style && d.style !== "none",
  );
  if (drawn.length) {
    const first = drawn[0]!;
    const col = ctx.colour(el, `border-${first.s}-color`) ?? "#000000";
    style.border = {
      width: ctx.wPct(first.w),
      color: col,
      ...(first.style === "dashed" || first.style === "dotted" ? { style: first.style } : {}),
    };
    if (drawn.length < 4)
      ctx.polish.push({
        element: el.id,
        what: `border on ${drawn.map((d) => d.s).join("+")} only, drawn all round`,
      });
  }
  const radius = radiusOf(tree, el);
  if (radius && (style.fill || style.border)) style.radius = radius;
  const shadows = parseShadows(el.style["box-shadow"]);
  if (shadows.length)
    style.boxShadow = shadows.map((s, i): TemplateBoxShadow => ({
      x: ctx.wPct(s.x),
      y: ctx.wPct(s.y),
      blur: ctx.wPct(s.blur),
      ...(s.spread ? { spread: ctx.wPct(s.spread) } : {}),
      color: ctx.shadowColour(s.colour, el, "box-shadow", i),
      ...(s.inset ? { inset: true } : {}),
    }));
  if (!style.fill && !style.border && !style.boxShadow) return null;
  const opacity = num(el.style.opacity);
  if (opacity < 1) style.opacity = r2(opacity);
  const blend = el.style["mix-blend-mode"];
  if (blend && blend !== "normal") style.blend = blend as BlendMode;
  for (const prop of ["filter", "backdrop-filter", "clip-path", "mask-image"])
    if (el.style[prop] && el.style[prop] !== "none")
      ctx.polish.push({
        element: el.id,
        what: `${prop}: ${el.style[prop]!.slice(0, 50)} not mapped`,
      });
  return { style, key: JSON.stringify(style) };
}

const FONT_GENERIC =
  /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-monospace|ui-sans-serif)$/i;

/** The first named family of a computed `font-family`, as the document names it. */
export function fontFamilyOf(value: string | undefined): string | undefined {
  const first = (value ?? "")
    .split(",")[0]
    ?.trim()
    .replace(/^["']|["']$/g, "");
  if (!first || FONT_GENERIC.test(first)) return undefined;
  const generic = /mono/i.test(value ?? "") ? "monospace" : "sans-serif";
  return `'${first}',${generic}`;
}

/** The text style of an element with its own text. */
function textStyleOf(tree: Tree, el: CapturedElement, ctx: StyleContext): TemplateStyleV2 {
  const W = ctx.cap.native.w;
  const scale = scaleOf(tree, el);
  const fontPx = (px(tree.style(el, "font-size")) || 16) * scale;
  const style: TemplateStyleV2 = {};
  const colour = ctx.colour(el, "color");
  if (colour) style.color = colour;
  const family = fontFamilyOf(tree.style(el, "font-family"));
  if (family) style.fontFamily = family;
  style.fontSize = r2((fontPx / W) * 100);
  const weight = parseInt(tree.style(el, "font-weight") ?? "400", 10);
  if (Number.isFinite(weight)) style.fontWeight = weight;
  const spacing = px(tree.style(el, "letter-spacing")) * scale;
  if (Number.isFinite(spacing) && spacing !== 0) style.letterSpacing = r2(spacing / fontPx);
  if (tree.style(el, "text-transform") === "uppercase") style.uppercase = true;
  const align = tree.style(el, "text-align");
  const justify = el.style["justify-content"];
  style.align =
    align === "center" || justify === "center"
      ? "center"
      : align === "right" || align === "end" || justify === "flex-end"
        ? "right"
        : "left";
  const lineHeight = px(tree.style(el, "line-height")) * scale;
  if (Number.isFinite(lineHeight)) style.lineHeight = r2(lineHeight / fontPx);
  const opacity = num(el.style.opacity);
  if (opacity < 1) style.opacity = r2(opacity);
  const shadows = parseShadows(tree.style(el, "text-shadow"));
  if (shadows.length)
    style.textShadow = shadows.map((s, i): TemplateTextShadow => ({
      x: ctx.wPct(s.x),
      y: ctx.wPct(s.y),
      blur: ctx.wPct(s.blur),
      color: ctx.shadowColour(s.colour, el, "text-shadow", i),
    }));
  // Text painted with a gradient (Gold Foil's numbers).
  const clip = el.style["background-clip"] ?? el.style["-webkit-background-clip"];
  const fillColour = el.style["-webkit-text-fill-color"];
  if (clip === "text" && el.style["background-image"]) {
    const gradient = gradientFill(splitTopLevel(el.style["background-image"])[0] ?? "", ctx, el);
    if (gradient) style.textFill = gradient;
  } else if (fillColour && parseColour(fillColour)?.a === 0) {
    ctx.polish.push({ element: el.id, what: "transparent text fill without a gradient" });
  }
  return style;
}

interface RowsOptions {
  repeat: string;
  W: number;
  colour: (el: CapturedElement, prop: string) => string | undefined;
  fit: boolean;
  /** Indexed rows: an element's own field key → the row field. */
  cellField?: (el: CapturedElement) => string | null;
}

/** A rows spec from captured rows: the base row's cells, its height and the pitch. */
function rowsSpec(
  tree: Tree,
  rows: CapturedElement[],
  bound: Array<{ variant?: string; values: Record<string, string> }>,
  opts: RowsOptions,
): { spec: RowsSpec; height: number } | null {
  // The base row is the first without a variant (a ladder's first row may be the club's).
  const baseIndex = Math.max(
    0,
    bound.findIndex((r) => !r.variant),
  );
  const first = rows[baseIndex] ?? rows[0];
  if (!first || first.box.h <= 0) return null;
  const top = rows[0]!;
  const below = rows.find((r) => r.box.y > top.box.y + 0.5 && Math.abs(r.box.x - top.box.x) < 1);
  const columnsX = [...new Set(rows.map((r) => Math.round(r.box.x)))];
  const columns = Math.max(1, Math.min(6, columnsX.length));
  const rowH = first.box.h;
  const pitch = below ? below.box.y - top.box.y : rowH;
  const cellsOf = (row: CapturedElement, values: Record<string, string>) =>
    rowCells(tree, row, values, opts);
  const cells = cellsOf(first, bound[baseIndex]?.values ?? {});
  if (!cells.some((c) => c.show !== "backdrop")) return null;
  // Variant rows (the club's ladder row, a lost result): their cell styles that differ.
  const variants: NonNullable<RowsSpec["variants"]> = {};
  bound.forEach((r, i) => {
    if (!r.variant || variants[r.variant] || !rows[i]) return;
    const own = cellsOf(rows[i]!, r.values);
    const overrides: Record<string, NonNullable<RowsCell["style"]>> = {};
    for (const c of own) {
      const baseCell = cells.find((b) => b.field === c.field && b.show === c.show);
      if (c.style && JSON.stringify(c.style) !== JSON.stringify(baseCell?.style))
        overrides[c.field] = c.style;
    }
    if (Object.keys(overrides).length) variants[r.variant] = overrides;
  });
  const spec: RowsSpec = {
    repeat: opts.repeat,
    rowHeight: r2((rowH / opts.W) * 100),
    ...(pitch > rowH ? { gap: r2(((pitch - rowH) / opts.W) * 100) } : {}),
    cells,
    ...(columns > 1 ? { columns } : {}),
    ...(Object.keys(variants).length ? { variants } : {}),
  };
  return { spec, height: pitch * Math.ceil(rows.length / columns) };
}

/** The row field an image shows: the field whose value is its source (a player's photo). */
function imageField(el: CapturedElement, values: Record<string, string>): string | null {
  // Captured sources are shortened (`sentinel:<name>`); row values hold the full URL.
  const short = (url: string) => {
    const m = /sentinel(?::|%3A)([A-Za-z0-9_.-]+)/.exec(url);
    return m ? `sentinel:${m[1]}` : url;
  };
  const src = el.src ?? "";
  const hit = Object.entries(values).find(([, v]) => v && short(v) === src);
  return hit ? hit[0] : null;
}

/** One row's cells: its text fields, images and backdrops, placed across the row. */
function rowCells(
  tree: Tree,
  row: CapturedElement,
  values: Record<string, string>,
  opts: RowsOptions,
): RowsCell[] {
  const rowH = row.box.h;
  const fieldFor = (el: CapturedElement, text: string): string | null => {
    if (opts.cellField) return opts.cellField(el);
    const t = text.trim().toLowerCase();
    const entries = Object.entries(values).filter(([, v]) => v.trim());
    const exact = entries.find(([, v]) => v.trim().toLowerCase() === t);
    if (exact) return exact[0];
    // A field set inside literal text ("(VC)", "#12"): the longest value the text holds.
    const inside = entries
      .filter(([, v]) => v.trim().length >= 2 && t.includes(v.trim().toLowerCase()))
      .sort((a, b) => b[1].length - a[1].length)[0];
    return inside ? inside[0] : null;
  };
  const at = (el: CapturedElement) => ({
    x: r2(((el.box.x - row.box.x) / row.box.w) * 100),
    w: r2((el.box.w / row.box.w) * 100),
    y: r2(((el.box.y - row.box.y) / rowH) * 100),
    h: r2((el.box.h / rowH) * 100),
  });
  const textStyle = (el: CapturedElement): NonNullable<RowsCell["style"]> => {
    const scale = scaleOf(tree, el);
    const fontPx = (px(tree.style(el, "font-size")) || 16) * scale;
    const st: NonNullable<RowsCell["style"]> = { fontSize: r2((fontPx / opts.W) * 100) };
    const c = opts.colour(el, "color");
    if (c) st.color = c;
    const family = fontFamilyOf(tree.style(el, "font-family"));
    if (family) st.fontFamily = family;
    const weight = parseInt(tree.style(el, "font-weight") ?? "", 10);
    if (Number.isFinite(weight)) st.fontWeight = weight;
    if (tree.style(el, "text-transform") === "uppercase") st.uppercase = true;
    const spacing = px(tree.style(el, "letter-spacing")) * scale;
    if (Number.isFinite(spacing) && spacing) st.letterSpacing = r2(spacing / fontPx);
    const align = tree.style(el, "text-align");
    st.align =
      align === "center" ? "center" : align === "right" || align === "end" ? "right" : "left";
    return st;
  };
  const cells: RowsCell[] = [];
  const rowFill = row.style["background-color"] ? opts.colour(row, "background-color") : undefined;
  for (const el of [row, ...tree.descendants(row)]) {
    if (el.hidden === "display" || el.box.w <= 0) continue;
    if (el !== row && el.style["background-color"] && !(el.text ?? []).length) {
      const bg = opts.colour(el, "background-color");
      if (bg) cells.push({ field: "", ...at(el), show: "backdrop", style: { background: bg } });
    }
    if (el.tag === "img") {
      const field = opts.cellField ? opts.cellField(el) : imageField(el, values);
      if (field) cells.push({ field, ...at(el), show: "image" });
      continue;
    }
    for (const run of el.text ?? []) {
      const field = fieldFor(el, run.text);
      if (field) cells.push({ field, ...at(el), style: textStyle(el) });
    }
  }
  const firstField = cells.find((c) => c.field)?.field ?? "";
  // A backdrop cell needs a field key; it draws whatever the field holds.
  for (const c of cells) if (!c.field) c.field = firstField;
  if (rowFill)
    cells.unshift({
      field: firstField,
      x: 0,
      w: 100,
      show: "backdrop",
      style: { background: rowFill },
    });
  return cells.filter((c) => c.field);
}

/** How much an element is scaled by its own and its ancestors' transforms (the letterboxed landscape card). */
function scaleOf(tree: Tree, el: CapturedElement): number {
  let scale = 1;
  for (const e of [el, ...tree.ancestors(el)]) {
    const m = parseMatrix(e.style.transform);
    if (m) scale *= Math.hypot(m[0]!, m[1]!);
  }
  return scale;
}

/**
 * Repeats a pack draws as indexed fields: a junior day slide's `day0.grade`,
 * `day1.grade`, … become the `dayRows` repeat, a sponsors page's
 * `weekendSponsorName0` / `weekendSponsor0` become `sponsors`.
 */
function indexedRepeats(
  tree: Tree,
  cap: PackCapture,
  resolveTokens: (t: string) => string,
  slots: typeof slotsOf,
): Array<{
  repeat: string;
  rows: CapturedElement[];
  values: Array<{ variant?: string; values: Record<string, string> }>;
  consumed: number[];
  cellField: (el: CapturedElement) => string | null;
}> {
  const keyed = new Map<string, Map<number, CapturedElement[]>>();
  const fieldOf = new Map<number, string>();
  const note = (repeat: string, index: number, el: CapturedElement, field: string) => {
    const byIndex = keyed.get(repeat) ?? new Map<number, CapturedElement[]>();
    const list = byIndex.get(index) ?? [];
    list.push(el);
    byIndex.set(index, list);
    keyed.set(repeat, byIndex);
    fieldOf.set(el.id, field);
  };
  for (const el of cap.elements) {
    if (el.hidden === "display") continue;
    if (el.tag === "img") {
      const filled = slots(el.src, cap.images);
      const day = filled.map((s) => DAY_FIELD.exec(s)).find(Boolean);
      const sponsor = filled.map((s) => SPONSOR_IMAGE.exec(s)).find(Boolean);
      if (day) note("dayRows", +day[1]!, el, day[2]!);
      else if (sponsor) note("sponsors", +sponsor[1]!, el, "logo");
      continue;
    }
    for (const run of el.text ?? []) {
      const tokens = [...resolveTokens(run.text).matchAll(/\{\{([\w.]+)\}\}/g)].map((m) => m[1]!);
      for (const t of tokens) {
        const day = DAY_FIELD.exec(t);
        const sponsor = SPONSOR_NAME.exec(t);
        if (day) note("dayRows", +day[1]!, el, day[2]!);
        else if (sponsor) note("sponsors", +sponsor[1]!, el, "name");
      }
    }
  }
  const out = [];
  for (const [repeat, byIndex] of keyed) {
    const indices = [...byIndex.keys()].sort((a, b) => a - b);
    const rows: CapturedElement[] = [];
    const consumed: number[] = [];
    for (const i of indices) {
      const els = byIndex.get(i)!;
      // The row: the deepest ancestor holding this index's fields and no other index's.
      const others = indices.filter((j) => j !== i).flatMap((j) => byIndex.get(j)!);
      let row: CapturedElement | undefined = els[0];
      for (const anc of tree.ancestors(els[0]!)) {
        const inside = new Set(tree.descendants(anc).map((d) => d.id));
        if (others.some((o) => inside.has(o.id))) break;
        if (els.every((e) => inside.has(e.id))) row = anc;
      }
      if (!row) continue;
      rows.push(row);
      consumed.push(row.id, ...tree.descendants(row).map((d) => d.id));
    }
    if (rows.length === 0) continue;
    out.push({
      repeat,
      rows,
      values: [],
      consumed,
      cellField: (el: CapturedElement) => fieldOf.get(el.id) ?? null,
    });
  }
  return out;
}
