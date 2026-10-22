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
  TemplateFilter,
  BlendMode,
} from "@workspace/scorecard/kind-templates";
import { MAX_BLUR_PX } from "@workspace/scorecard/kind-templates";
import {
  parseColour,
  toHex,
  parseClipPolygon,
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
  /**
   * With a worst-case capture: the share of this capture's text elements that
   * found a twin there. Low means the worst case drew another design.
   */
  geometryCoverage?: number;
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

export class Tree {
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

const normText = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Each element of the sentinel capture → its twin in the worst-case capture.
 * The two renders don't always hold the same elements (a chip one of them
 * fills and the other leaves empty), so children are aligned by how alike
 * they are, not by position: tag, the text they hold (a sentinel's markers
 * read as the worst-case values of their fields) and their data attributes.
 * An element only one render has stays unmatched.
 */
export function alignTrees(a: Tree, b: Tree): Map<number, CapturedElement> {
  const worstFields = new Map(
    Object.entries(b.capture.fields).map(([k, v]) => [k.toLowerCase(), v]),
  );
  const resolve = (text: string) =>
    normText(
      text.replace(
        TOKEN_IN_TEXT,
        (_m, key: string) => worstFields.get(key.toLowerCase()) ?? `[[${key}]]`,
      ),
    );
  const memo = new Map<CapturedElement, Set<string>>();
  const textsOf = (tree: Tree, el: CapturedElement, own: (t: string) => string): Set<string> => {
    let set = memo.get(el);
    if (!set) {
      set = new Set(
        [el, ...tree.descendants(el)].flatMap((e) => (e.text ?? []).map((t) => own(t.text))),
      );
      set.delete("");
      memo.set(el, set);
    }
    return set;
  };
  const dataKeys = (el: CapturedElement) =>
    Object.keys(el.data ?? {})
      .sort()
      .join(",");
  const sim = (x: CapturedElement, y: CapturedElement): number => {
    if (x.tag !== y.tag) return 0;
    let score = 1;
    const tx = textsOf(a, x, resolve);
    const ty = textsOf(b, y, normText);
    for (const t of tx) if (ty.has(t)) score += 3;
    const ownX = (x.text ?? []).map((t) => resolve(t.text)).join(" ");
    const ownY = (y.text ?? []).map((t) => normText(t.text)).join(" ");
    if (ownX && ownY && ownX !== ownY && !ownY.includes(ownX) && !ownX.includes(ownY)) score -= 2;
    if (!!ownX !== !!ownY) score -= 1;
    score += dataKeys(x) === dataKeys(y) ? 1 : -1;
    if ((x.className ?? "") === (y.className ?? "")) score += 0.5;
    if ((x.src ?? "").replace("worst.", "") === (y.src ?? "").replace("worst.", "")) score += 0.5;
    return score;
  };
  const out = new Map<number, CapturedElement>();
  const align = (x: CapturedElement, y: CapturedElement) => {
    out.set(x.id, y);
    const xs = a.children.get(x.id) ?? [];
    const ys = b.children.get(y.id) ?? [];
    // Needleman–Wunsch, gaps free: the pairing with the most similarity.
    const score: number[][] = Array.from({ length: xs.length + 1 }, () =>
      new Array<number>(ys.length + 1).fill(0),
    );
    for (let i = 1; i <= xs.length; i++)
      for (let j = 1; j <= ys.length; j++) {
        const s = sim(xs[i - 1]!, ys[j - 1]!);
        score[i]![j] = Math.max(
          score[i - 1]![j]!,
          score[i]![j - 1]!,
          s > 0 ? score[i - 1]![j - 1]! + s : -Infinity,
        );
      }
    const pairs: Array<[CapturedElement, CapturedElement]> = [];
    for (let i = xs.length, j = ys.length; i > 0 && j > 0;) {
      const s = sim(xs[i - 1]!, ys[j - 1]!);
      if (s > 0 && score[i]![j] === score[i - 1]![j - 1]! + s) {
        pairs.push([xs[i - 1]!, ys[j - 1]!]);
        i--;
        j--;
      } else if (score[i]![j] === score[i - 1]![j]) i--;
      else j--;
    }
    for (const [cx, cy] of pairs.reverse()) align(cx, cy);
  };
  const ra = a.capture.elements.find((e) => e.parent === null);
  const rb = b.capture.elements.find((e) => e.parent === null);
  if (ra && rb) align(ra, rb);
  return out;
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
  const matches = (text: string, v: string) => text === v || text.includes(v);
  const anchors = bound.map((r) => {
    // Values only this row has, that only one text on the card shows: "DEF" is no anchor
    // when another row's "DEF BY" holds it too.
    const unique = Object.values(r.values)
      .map(norm)
      .filter(
        (v) =>
          v.length >= 2 &&
          counts.get(v) === 1 &&
          texts.filter((t) => matches(t.text, v)).length === 1,
      );
    return texts.filter((t) => unique.some((v) => matches(t.text, v))).map((t) => t.el);
  });
  // Rows past the card's room aren't drawn (a landscape ladder shows five of seven):
  // trailing rows may have no anchor, any other row must.
  let drawn = anchors.length;
  while (drawn > 0 && anchors[drawn - 1]!.length === 0) drawn--;
  if (drawn < Math.min(2, anchors.length) || anchors.slice(0, drawn).some((a) => a.length === 0))
    return null;
  anchors.length = drawn;
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
  // Boxes from the worst-case capture, its elements aligned with this one's.
  const gTree = opts.geometry ? new Tree(opts.geometry) : null;
  const twins = gTree ? alignTrees(tree, gTree) : null;
  const twin = (el: CapturedElement): CapturedElement => {
    const t = twins?.get(el.id);
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
  /** A token at partial alpha, for a layer that paints only it (no longer untokenised once used). */
  const translucent = (el: CapturedElement, prop: string) => {
    const a = tree.style(el, prop);
    const bEl = bById.get(el.id);
    const inB = bEl && bTree ? bTree.style(bEl, prop) : undefined;
    const t = tokeniseColour(a, inB, palette)?.translucent;
    if (!t) return undefined;
    return {
      ...t,
      use: () => {
        untokenised.delete(`${prop} ${a} (element ${el.id})`);
        return `var(${t.token})`;
      },
    };
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
    const spec = rowsSpec(tree, found.rows, bound, {
      repeat,
      W,
      colour,
      fit: true,
      twin,
      twinValues: opts.geometry?.rows?.[repeat]?.map((r) => r.values),
    });
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
      twin,
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
    // An ancestor's opacity fades everything inside it: each flat layer carries it.
    const inherited = tree.ancestors(el).reduce((o, a) => o * num(a.style.opacity), 1);
    const add = (base: string, layer: MappedLayer["layer"], box = pct(g.box)) =>
      layers.push({
        sig: sigOf(base),
        layer: inherited < 1 ? withOpacity(layer, inherited) : layer,
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
      const filters = imageFilters(tree, el, polish);
      if (filters.length) style.filter = filters;
      // A blend on a wrapper blends the image inside it (Bold Type's photo screens onto
      // the panel behind it).
      const blend = [el, ...tree.ancestors(el)]
        .map((e) => e.style["mix-blend-mode"])
        .find((b) => b && b !== "normal");
      if (blend) style.blend = blend as BlendMode;
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
    // A clip resolves against the box the layer takes (the worst-case twin's), as its children's do.
    const clipBox = g.size ?? { w: g.box.w, h: g.box.h };
    const paint = shapeStyle(tree, el, {
      colour,
      translucent,
      shadowColour,
      wPct,
      polish,
      cap,
      clipBox,
    });
    const text = el.text ?? [];
    const textStyle = text.length
      ? textStyleOf(tree, el, { colour, translucent, shadowColour, wPct, polish, cap })
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
    if (paint && (paint.style.fill || paint.style.border || paint.style.boxShadow)) {
      // The box's other background layers, beneath it: same box, corners, clip and opacity.
      paint.under.forEach((fill, i) => {
        const s = paint.style;
        add(
          `shape:under:${i}:${paint.key}`,
          {
            kind: "shape",
            style: {
              fill,
              ...(s.radius !== undefined ? { radius: s.radius } : {}),
              ...(s.clip ? { clip: s.clip } : {}),
              ...(s.opacity !== undefined ? { opacity: s.opacity } : {}),
            },
          } as MappedLayer["layer"],
          withRotate(pct(g.box)),
        );
      });
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
    for (const edge of paint?.edges ?? []) {
      const b = g.box;
      const strip =
        edge.side === "top"
          ? { x: b.x, y: b.y, w: b.w, h: edge.px }
          : edge.side === "bottom"
            ? { x: b.x, y: b.y + b.h - edge.px, w: b.w, h: edge.px }
            : edge.side === "left"
              ? { x: b.x, y: b.y, w: edge.px, h: b.h }
              : { x: b.x + b.w - edge.px, y: b.y, w: edge.px, h: b.h };
      const style: TemplateStyleV2 = { fill: edge.color };
      const edgeOpacity = num(el.style.opacity) * (edge.alpha ?? 1);
      if (edgeOpacity < 1) style.opacity = r2(edgeOpacity);
      add(
        `shape:edge:${edge.side}:${edge.color}`,
        { kind: "shape", style } as MappedLayer["layer"],
        pct(strip),
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
    const kids = tree.children.get(el.id) ?? [];
    // Text with inline runs inside it (`{{grade}} · vs {{opponent}}`, `({{balls}})`) is one
    // layer: its runs in reading order, in the element's box.
    const inline = kids.length > 0 && kids.every((k) => isInlineRun(k));
    if (inline) {
      for (const k of kids) consumed.add(k.id);
      if (kids.some((k) => TEXT_LOOK.some((p) => k.style[p] !== undefined)))
        polish.push({
          element: el.id,
          what: "inline runs styled apart, merged into one text style",
        });
    }
    const runs = inline ? [...text, ...kids.flatMap((k) => k.text ?? [])] : text;
    const content = resolveTokens(joinRuns(readingOrder(runs).map((t) => t.text)));
    const hasChildren = !inline && kids.some((c) => c.text?.length || c.tag === "br");
    // The worst-case runs (the text's real extent), else this capture's.
    const runsOf = (e: CapturedElement) => {
      const t = twin(e);
      return (t.text?.length ? t.text : e.text) ?? [];
    };
    const extent = unionBox((inline ? [el, ...kids] : [el]).flatMap(runsOf).map((t) => t.box));
    // With element children the runs' own box. Else the content box across (so the
    // alignment holds) and the runs' glyph box down: a tight line height draws glyphs
    // past the element's box, and the template's box must hold them or fit shrinks them.
    const across = contentBox(g, el);
    // Text its element clips (`overflow: hidden`, often with an ellipsis) keeps the
    // element's width: the runs run on past it.
    const clips = el.style["overflow-x"] === "hidden" || el.style["overflow-x"] === "clip";
    const nowrap = tree.style(el, "white-space") === "nowrap";
    const ellipsis = el.style["text-overflow"] === "ellipsis";
    const left = clips ? across.x : Math.min(across.x, extent.x);
    const right = clips ? across.x + across.w : Math.max(across.x + across.w, extent.x + extent.w);
    const raw = hasChildren ? extent : { x: left, y: extent.y, w: right - left, h: extent.h };
    // The lines the worst case takes: from its height, as several runs (a label, a field,
    // a separator) each report one line while together they wrap onto two.
    const scale = scaleOf(tree, el);
    const fontPx = (px(tree.style(el, "font-size")) || 16) * scale;
    const linePx = (px(tree.style(el, "line-height")) || (fontPx * 1.2) / scale) * scale;
    const worstLines = Math.max(
      1,
      ...(inline ? [el, ...kids] : [el]).flatMap(runsOf).map((t) => t.lines ?? 1),
      Math.round(extent.h / Math.max(1, linePx)),
    );
    // Text that wraps keeps the pack's width, so its lines break where the pack's do;
    // one line gets room for font rendering differences.
    const wraps = !nowrap && worstLines > 1;
    const box = clips ? raw : wraps ? { ...raw, w: raw.w + 1 } : textBox(raw, textStyle.align, W);
    // The pack's own fit (`data-fit`) shrinks then wraps; clipped text ends in an ellipsis,
    // after a second line unless it's kept to one (`white-space: nowrap`). Other live text
    // the worst case keeps to one line shrinks, then ends in an ellipsis, so content longer
    // than the worst case still fits. Text the worst case wraps keeps live text's own fit
    // (it wraps as the pack does, and shrinks only to fit its box): the v2 fit would try
    // it on one line first and draw fewer, smaller lines than the pack.
    const fit =
      el.data?.fit !== undefined || el.data?.fitRow !== undefined
        ? { minScale: 0.6, maxLines: nowrap ? 1 : 2, ellipsis: true }
        : clips && ellipsis
          ? { minScale: 1, maxLines: nowrap ? 1 : 2, ellipsis: true }
          : /\{\{/.test(content) && (nowrap || worstLines < 2)
            ? { minScale: 0.6, maxLines: 1 as const, ellipsis: true }
            : null;
    const m = motionFor();
    add(
      `text:${content}`,
      {
        kind: "text",
        content,
        style: fillOverBox(textStyle, g.box, raw),
        ...(fit ? { fit } : {}),
        ...(m ? { motion: m } : {}),
      } as MappedLayer["layer"],
      withRotate(pct(box)),
    );
  }

  // A row's own value drawn as fixed text means its repeat wasn't found: the
  // template would print the sample ("QH") on every card.
  const rowValues = new Set(
    Object.values(cap.rows)
      .flat()
      .flatMap((r) => Object.values(r.values))
      .map((v) => v.trim())
      .filter((v) => /^[A-Z]{2}(?: [A-Z]{2})*$/.test(v)),
  );
  for (const l of layers) {
    if (l.layer.kind !== "text") continue;
    const content = (l.layer as { content?: string }).content ?? "";
    const leaked = [...rowValues].find((v) =>
      new RegExp(`(^|[^A-Za-z])${v}([^A-Za-z]|$)`).test(content),
    );
    if (leaked)
      polish.push({
        element: l.element,
        what: `row value "${leaked}" left as fixed text: its repeat wasn't found`,
      });
  }

  // An ancestor's polygon clip cuts what's inside it too (the photo in Club Kit's angled band).
  for (const l of layers) {
    const kind = l.layer.kind;
    if (kind !== "shape" && kind !== "photo" && kind !== "image") continue;
    const style = (l.layer as { style?: TemplateStyleV2 }).style;
    if (style?.clip || l.box.rotate) continue;
    const el = tree.byId.get(l.element);
    const clipper =
      el && tree.ancestors(el).find((a) => (a.style["clip-path"] ?? "none") !== "none");
    if (!clipper) continue;
    const c = twin(clipper);
    const polygon = parseClipPolygon(clipper.style["clip-path"]!, c.box.w, c.box.h);
    if (!polygon) continue;
    const [lx, ly, lw, lh] = [
      (l.box.x / 100) * W,
      (l.box.y / 100) * H,
      (l.box.w / 100) * W,
      (l.box.h / 100) * H,
    ];
    const inLayer = polygon.map(([x, y]): [number, number] => [
      r2(((c.box.x + (x / 100) * c.box.w - lx) / lw) * 100),
      r2(((c.box.y + (y / 100) * c.box.h - ly) / lh) * 100),
    ]);
    if (inLayer.some((p) => p.some((v) => v < -100 || v > 200))) continue;
    l.layer = {
      ...l.layer,
      style: { ...style, clip: { polygon: inLayer } },
    } as MappedLayer["layer"];
  }

  // Back to front in paint order: a repeat sits where its first row is (the sort is stable).
  const paint = paintKeys(tree);
  layers.sort((a, b) => comparePaint(paint.get(a.element), paint.get(b.element)));
  const texts = cap.elements.filter((e) => e.text?.length && e.hidden !== "display");
  const geometryCoverage = twins
    ? texts.filter((e) => twins.get(e.id)?.text?.length).length / Math.max(1, texts.length)
    : undefined;
  return {
    layers,
    polish,
    untokenised: [...untokenised],
    motion,
    ...(geometryCoverage !== undefined ? { geometryCoverage } : {}),
  };
}

// ── Pieces ──────────────────────────────────────────────────────────────────

/** An element's z-index where it applies (a positioned element or a flex or grid item), else null. */
function zIndex(tree: Tree, el: CapturedElement): number | null {
  const z = Number(el.style["z-index"]);
  if (el.style["z-index"] === undefined || !Number.isFinite(z)) return null;
  const parent = el.parent === null ? undefined : tree.byId.get(el.parent);
  const positioned = (el.style.position ?? "static") !== "static";
  return positioned || /flex|grid/.test(parent?.style.display ?? "") ? z : null;
}

/**
 * Each element's place in the paint order: `[z, document order]` for every
 * stacking context it sits in, then its own. A header the pack lifts with
 * `z-index: 1` paints over the art after it in the document, as in CSS.
 * (Positioned versus in-flow order within a context isn't modelled: the
 * packs lift what must sit on top with a z-index.)
 */
export function paintKeys(tree: Tree): Map<number, number[]> {
  const keys = new Map<number, number[]>();
  const contexts = new Map<number, number[]>();
  for (const el of tree.capture.elements) {
    const ctx = el.parent === null ? [] : (contexts.get(el.parent) ?? []);
    const z = zIndex(tree, el);
    const key = [...ctx, z ?? 0, el.id];
    keys.set(el.id, key);
    contexts.set(el.id, z === null ? ctx : key);
  }
  return keys;
}

export function comparePaint(a: number[] | undefined, b: number[] | undefined): number {
  if (!a || !b) return 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
  return a.length - b.length;
}

/**
 * A text fill gradient painted over the element's box, as the pack paints it,
 * when the text layer's box is taller (it holds the glyphs): a vertical
 * gradient's stops move into the element's band of the layer box.
 */
export function fillOverBox(
  style: TemplateStyleV2,
  element: { y: number; h: number },
  box: { y: number; h: number },
): TemplateStyleV2 {
  const fill = style.textFill;
  if (!fill || typeof fill !== "object" || fill.type !== "linear" || box.h <= 0) return style;
  const angle = fill.angle ?? 180;
  if (angle !== 180 && angle !== 0) return style;
  if (fill.stops.some((s) => s.at === undefined)) return style;
  const start = angle === 180 ? element.y - box.y : box.y + box.h - (element.y + element.h);
  if (Math.abs(start) < 0.5 && Math.abs(element.h - box.h) < 0.5) return style;
  const span = element.h / box.h;
  return {
    ...style,
    textFill: {
      ...fill,
      stops: fill.stops.map((s) => ({
        ...s,
        at: Math.min(100, Math.max(0, r2((start / box.h + (s.at! / 100) * span) * 100))),
      })),
    },
  };
}

/** A fill that paints nothing. */
const TRANSPARENT = "#00000000";

/** Outlined text's stand-in fill: this share of the stroke's own opacity. */
const OUTLINE_FILL = 0.5;

/**
 * The part of a vertical gradient a box shows when the gradient is taller than
 * the box (`background-size: 100% 220%`, Gold Foil's foil, positioned by its
 * shine): stops moved into box coordinates, the ends interpolated, the rest cut.
 */
export function sizedGradient(
  fill: TemplateFill,
  size: string | undefined,
  position: string | undefined,
): TemplateFill {
  if (typeof fill !== "object" || fill.type !== "linear") return fill;
  const angle = fill.angle ?? 180;
  if (angle !== 180 && angle !== 0) return fill;
  const h = parseFloat((size ?? "").trim().split(/\s+/)[1] ?? "");
  if (!Number.isFinite(h) || !/%$/.test((size ?? "").trim()) || h <= 100) return fill;
  const posY = parseFloat((position ?? "").trim().split(/\s+/)[1] ?? "0");
  const p = Number.isFinite(posY) ? posY : 0;
  if (fill.stops.some((s) => s.at === undefined)) return fill;
  // A stop at s % of the gradient lands at s·h − (h − 100)·p (percent of the box).
  const at = (s: number) => (s * h) / 100 - ((h - 100) * p) / 100;
  const moved = fill.stops.map((s) => ({ color: s.color, at: at(s.at!) }));
  const colourAt = (y: number) => {
    const after = moved.findIndex((s) => s.at >= y);
    if (after <= 0) return moved[Math.max(0, after)]!.color;
    if (after < 0) return moved[moved.length - 1]!.color;
    const a = moved[after - 1]!;
    const b = moved[after]!;
    return mixHex(a.color, b.color, (y - a.at) / Math.max(1e-6, b.at - a.at));
  };
  const inside = moved.filter((s) => s.at > 0 && s.at < 100);
  const stops = [
    { color: colourAt(0), at: 0 },
    ...inside.map((s) => ({ color: s.color, at: r2(s.at) })),
    { color: colourAt(100), at: 100 },
  ];
  return { ...fill, stops };
}

/** Two hex colours mixed (`t` of the way to `b`); a token can't be mixed, so the nearer one. */
function mixHex(a: string, b: string, t: number): string {
  const pa = parseColour(a);
  const pb = parseColour(b);
  if (!pa || !pb || !a.startsWith("#") || !b.startsWith("#")) return t < 0.5 ? a : b;
  const k = Math.min(1, Math.max(0, t));
  return toHex({
    r: pa.r + (pb.r - pa.r) * k,
    g: pa.g + (pb.g - pa.g) * k,
    b: pa.b + (pb.b - pa.b) * k,
    a: pa.a + (pb.a - pa.a) * k,
  });
}

/** One side of a border drawn on fewer than four sides. */
type Edge = {
  side: "top" | "right" | "bottom" | "left";
  px: number;
  color: string;
  alpha?: number;
};

/** A layer with `factor` multiplied into its opacity. */
function withOpacity(layer: MappedLayer["layer"], factor: number): MappedLayer["layer"] {
  const style = (layer as { style?: TemplateStyleV2 }).style ?? {};
  return {
    ...layer,
    style: { ...style, opacity: r2((style.opacity ?? 1) * factor) },
  } as MappedLayer["layer"];
}

/**
 * An image's filters, its ancestors' included (a filter on a wrapper filters
 * the photo inside it): grayscale and blur map; the rest are reported.
 */
function imageFilters(tree: Tree, el: CapturedElement, polish: PolishItem[]): TemplateFilter[] {
  const out: TemplateFilter[] = [];
  let brightness: number | null = null;
  for (const e of [el, ...tree.ancestors(el)]) {
    const value = e.style.filter;
    if (!value || value === "none") continue;
    for (const [, name, arg] of value.matchAll(/([a-z-]+)\(([^)]*)\)/g)) {
      const n = parseFloat(arg!);
      const amount = arg!.endsWith("%") ? n / 100 : n;
      if (name === "grayscale" && Number.isFinite(n))
        out.push({ preset: "grayscale", amount: r2(amount) });
      else if (name === "blur" && Number.isFinite(n))
        out.push({ preset: "blur", px: Math.min(MAX_BLUR_PX, r2(n)) });
      // A darkened photo (a scrimmed hero): nested brightness() filters multiply.
      else if (name === "brightness" && Number.isFinite(n)) brightness = (brightness ?? 1) * amount;
      // The Duotone pack's gradient map (an SVG filter built from the club's colours):
      // the format's duotone preset from the Duotone palette, which draws exactly it.
      else if (name === "url" && /#dt-duo-/.test(arg!))
        out.push({ preset: "duotone", dark: "var(--dt-ink)", light: "var(--dt-p)" });
      else polish.push({ element: el.id, what: `filter ${name}(${arg}) not mapped` });
    }
  }
  if (brightness !== null)
    out.push({ preset: "brightness", amount: r2(Math.min(3, Math.max(0, brightness))) });
  return out;
}

const INLINE_TAGS = new Set(["span", "b", "strong", "em", "i", "small", "a", "sup", "sub", "u"]);
/** Text props a run may set apart from its parent's (reported when merged). */
const TEXT_LOOK = ["color", "font-family", "font-size", "font-weight", "letter-spacing"];
const NO_PAINT = /^(none|0px|transparent|rgba\(0, 0, 0, 0\))$/;

/** A text-only inline child with no paint of its own: part of its parent's text. */
function isInlineRun(k: CapturedElement): boolean {
  if (!k.text?.length) return false;
  const display = k.style.display ?? (INLINE_TAGS.has(k.tag) ? "inline" : "block");
  if (display !== "inline") return false;
  return ["background-color", "background-image", "border-top-width", "box-shadow"].every(
    (p) => k.style[p] === undefined || NO_PAINT.test(k.style[p]!),
  );
}

/** Text runs in reading order: lines top to bottom, each left to right. */
export function readingOrder<T extends { box: { x: number; y: number; w: number; h: number } }>(
  runs: readonly T[],
): T[] {
  const mid = (r: T) => r.box.y + r.box.h / 2;
  const lines: T[][] = [];
  for (const r of [...runs].sort((p, q) => mid(p) - mid(q))) {
    const line = lines.find(
      (l) => Math.abs(mid(l[0]!) - mid(r)) < Math.min(l[0]!.box.h, r.box.h) / 2,
    );
    if (line) line.push(r);
    else lines.push([r]);
  }
  return lines.flatMap((l) => l.sort((p, q) => p.box.x - q.box.x));
}

/** Runs joined with spaces, except inside brackets and before punctuation (`(199)`, `12,`). */
export function joinRuns(texts: readonly string[]): string {
  return texts.reduce((acc, raw) => {
    const t = raw.trim();
    if (!t) return acc;
    if (!acc) return t;
    return /[([{#@/]$/.test(acc) || /^[)\]},.:;!?%/]/.test(t) ? acc + t : `${acc} ${t}`;
  }, "");
}

/**
 * A text box with room to spare: the pack's box is exactly as wide as its
 * text, and the template's metrics (rounded size and spacing) can need a
 * hair more, which would wrap the line. It grows away from the alignment.
 */
function textBox(
  box: { x: number; y: number; w: number; h: number },
  align: TemplateStyleV2["align"],
  W: number,
) {
  const extra = Math.max(W * 0.01, box.w * 0.03);
  if (align === "right") return { ...box, x: box.x - extra, w: box.w + extra };
  if (align === "center") return { ...box, x: box.x - extra / 2, w: box.w + extra };
  return { ...box, w: box.w + extra };
}

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

/** `el`'s box less its padding and border, read from `styled` (a worst-case twin keeps no styles). */
function contentBox(el: CapturedElement, styled: CapturedElement = el) {
  const p = (side: string) => {
    const v = px(styled.style[`padding-${side}`]);
    return Number.isFinite(v) ? v : 0;
  };
  const b = (side: string) => {
    const v = px(styled.style[`border-${side}-width`]);
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
  translucent: (
    el: CapturedElement,
    prop: string,
  ) => { token: string; alpha: number; use: () => string } | undefined;
  shadowColour: (raw: string, el: CapturedElement, prop: string, i: number) => string;
  wPct: (n: number) => number;
  polish: PolishItem[];
  cap: PackCapture;
  /** The box a polygon clip's lengths resolve against, when not the element's own. */
  clipBox?: { w: number; h: number };
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
): { style: TemplateStyleV2; key: string; edges: Edge[]; under: TemplateFill[] } | null {
  const style: TemplateStyleV2 = {};
  // CSS paints its background images top first, over the background colour.
  // The top one is the box's fill; the others are drawn beneath as shapes of
  // their own (`under`, bottom first), so layered stages keep every layer.
  const fills: TemplateFill[] = [];
  const image = el.style["background-image"];
  if (image && image !== "none") {
    for (const layer of splitTopLevel(image).filter((p) => !p.startsWith("url("))) {
      const gradient = gradientFill(layer, ctx, el);
      if (gradient) fills.push(gradient);
      else ctx.polish.push({ element: el.id, what: `background ${layer.slice(0, 50)} not mapped` });
    }
  }
  const colour = ctx.colour(el, "background-color");
  if (el.style["background-color"] && colour) fills.push(colour);
  let under: TemplateFill[] = [];
  if (fills.length) {
    style.fill = fills[0]!;
    under = fills.slice(1).reverse();
  }
  if (el.style["background-clip"] === "text" || el.style["-webkit-background-clip"] === "text") {
    delete style.fill; // a text fill, handled with the text style
    under = [];
  }
  const sides = ["top", "right", "bottom", "left"].map((s) => ({
    s,
    w: px(el.style[`border-${s}-width`]),
    style: el.style[`border-${s}-style`],
  }));
  // The app's base styles (Tailwind's preflight) make every border solid, so the
  // capture's diff leaves a solid border's style out: missing means solid.
  const drawn = sides.filter(
    (d) => Number.isFinite(d.w) && d.w > 0 && d.style !== "none" && d.style !== "hidden",
  );
  // A border all round is the box's border; one on some sides only (a divider
  // above a footer) is a thin strip per side, drawn as its own shape.
  const edges: Edge[] = [];
  if (drawn.length === 4) {
    const first = drawn[0]!;
    const col = ctx.colour(el, `border-${first.s}-color`) ?? "#000000";
    style.border = {
      width: ctx.wPct(first.w),
      color: col,
      ...(first.style === "dashed" || first.style === "dotted" ? { style: first.style } : {}),
    };
  } else
    for (const d of drawn) {
      const t = ctx.translucent(el, `border-${d.s}-color`);
      edges.push({
        side: d.s as Edge["side"],
        px: d.w,
        color: t ? t.use() : (ctx.colour(el, `border-${d.s}-color`) ?? "#000000"),
        ...(t ? { alpha: t.alpha } : {}),
      });
      if (d.style === "dashed" || d.style === "dotted")
        ctx.polish.push({ element: el.id, what: `${d.style} ${d.s} border drawn solid` });
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
  if (!style.fill && !style.border && !style.boxShadow && !edges.length) return null;
  let opacity = num(el.style.opacity);
  // A box that paints one translucent token (a frame line at 45 % accent) draws the token,
  // its alpha moved to the layer.
  if (style.border && !style.fill && !style.boxShadow) {
    const t = ctx.translucent(el, `border-${drawn[0]!.s}-color`);
    if (t) {
      style.border = { ...style.border, color: t.use() };
      opacity *= t.alpha;
    }
  } else if (typeof style.fill === "string" && !style.border && !style.boxShadow) {
    const t = ctx.translucent(el, "background-color");
    if (t) {
      style.fill = t.use();
      opacity *= t.alpha;
    }
  }
  if (opacity < 1) style.opacity = r2(opacity);
  // A box with only a border or a shadow paints nothing inside: said outright, because the
  // renderer fills a shape without a fill with the accent (v1's default).
  if (!style.fill && (style.border || style.boxShadow)) style.fill = TRANSPARENT;
  const blend = el.style["mix-blend-mode"];
  if (blend && blend !== "normal") style.blend = blend as BlendMode;
  // A polygon clip (Club Kit's angled bands) cuts the box to that shape.
  const clipValue = el.style["clip-path"];
  let clipped = false;
  if (clipValue && clipValue !== "none") {
    const size = ctx.clipBox ?? el.size ?? { w: el.box.w, h: el.box.h };
    const polygon = parseClipPolygon(clipValue, size.w, size.h);
    if (polygon) {
      style.clip = { polygon };
      clipped = true;
    }
  }
  for (const prop of ["filter", "backdrop-filter", "clip-path", "mask-image"])
    if (el.style[prop] && el.style[prop] !== "none" && !(prop === "clip-path" && clipped))
      ctx.polish.push({
        element: el.id,
        what: `${prop}: ${el.style[prop]!.slice(0, 50)} not mapped`,
      });
  // The signature that matches this paint across sizes: its colours, not its lengths
  // (a radius, shadow or clip in px differs per size; the merge splits styles that differ).
  const key = JSON.stringify([
    style.fill ?? null,
    style.border?.color ?? null,
    !!style.boxShadow,
    !!style.clip,
  ]);
  return { style, key, edges, under };
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
  let opacity = num(el.style.opacity);
  const shadows = parseShadows(tree.style(el, "text-shadow"));
  // Text in a translucent token (the accent at 70 %) draws the token, its alpha on the layer.
  const see = !shadows.length ? ctx.translucent(el, "color") : undefined;
  if (see) {
    style.color = see.use();
    opacity *= see.alpha;
  }
  if (opacity < 1) style.opacity = r2(opacity);
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
    if (gradient)
      style.textFill = sizedGradient(
        gradient,
        el.style["background-size"],
        el.style["background-position"],
      );
  } else if (
    (fillColour && parseColour(fillColour)?.a === 0) ||
    parseColour(tree.style(el, "color"))?.a === 0
  ) {
    // Outlined text (Bold Type's watermark numbers): v2 has no text stroke, so it's a
    // faint fill in the stroke's colour, at half the stroke's strength.
    const strokePx = px(tree.style(el, "-webkit-text-stroke-width"));
    const stroke = ctx.colour(el, "-webkit-text-stroke-color");
    if (Number.isFinite(strokePx) && strokePx > 0 && stroke) {
      style.color = stroke;
      style.opacity = r2((style.opacity ?? 1) * OUTLINE_FILL);
      ctx.polish.push({
        element: el.id,
        what: "outlined text drawn as a faint fill (no text stroke in v2)",
      });
    } else ctx.polish.push({ element: el.id, what: "transparent text fill without a gradient" });
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
  /**
   * The other rows, to tell apart fields that hold the same value in this one
   * (a ladder row's position and losses both "2").
   */
  others?: Array<{ row: CapturedElement; values: Record<string, string> }>;
  /**
   * An element's worst-case twin: rows, gaps and cells are measured there, where
   * real content lays the row out (short sentinel markers lay it out differently).
   */
  twin?: (el: CapturedElement) => CapturedElement;
  /** The worst case's row values, in row order (it shows real-looking content). */
  twinValues?: Array<Record<string, string>>;
  /** This row's worst-case values, to tell apart fields the sentinel gave one marker. */
  rowTwinValues?: Record<string, string>;
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
  // Geometry from the worst-case twins when every row has one.
  const twinned = rows.map((r) => opts.twin?.(r));
  const geo = twinned.every((t, i) => t && t !== rows[i] && t.box.h > 0)
    ? (twinned as CapturedElement[])
    : rows;
  const columnsX = [...new Set(geo.map((r) => Math.round(r.box.x)))];
  const columns = Math.max(1, Math.min(6, columnsX.length));
  const rowH = geo[rows.indexOf(first)]!.box.h;
  // The space between each row and the next one down its column: rows can differ in
  // height (a no-result row is shorter), so the pitch is the base row's plus that gap.
  const gaps = geo.flatMap((r) => {
    const next = geo
      .filter((n) => n.box.y > r.box.y + 0.5 && Math.abs(n.box.x - r.box.x) < 1)
      .sort((a, b) => a.box.y - b.box.y)[0];
    const gap = next ? next.box.y - (r.box.y + r.box.h) : -1;
    return gap >= 0 ? [gap] : [];
  });
  const pitch = rowH + (gaps.length ? Math.min(...gaps) : 0);
  const others = rows
    .map((row, i) => ({ row, values: bound[i]?.values ?? {} }))
    .filter((o) => o.row !== first);
  const cellsOf = (row: CapturedElement, values: Record<string, string>) =>
    rowCells(tree, row, values, {
      ...opts,
      others,
      rowTwinValues: opts.twinValues?.[rows.indexOf(row)],
      ...(geo === rows ? { twin: undefined } : {}),
    });
  const cells = cellsOf(first, bound[baseIndex]?.values ?? {});
  if (!cells.some((c) => c.show !== "backdrop")) return null;
  // A field the base row leaves empty but other rows draw (a captain's "(C)", an
  // overseas mark): its cell from the first row that has it, drawn when the row has it.
  const fieldsHere = new Set(cells.filter((c) => c.show !== "backdrop").map((c) => c.field));
  rows.forEach((row, i) => {
    if (row === first) return;
    for (const c of cellsOf(row, bound[i]?.values ?? {}))
      if (
        c.show !== "backdrop" &&
        c.field &&
        !fieldsHere.has(c.field) &&
        // Not a field this row gives the same value as one already bound (the sentinel's
        // surname and broadcast name are one marker), nor a cell the base row already has.
        ![...fieldsHere].some(
          (f) => (bound[i]?.values[f] ?? "").trim() === (bound[i]?.values[c.field] ?? "").trim(),
        ) &&
        !cells.some(
          (b) =>
            b.show !== "backdrop" &&
            Math.abs(b.x - c.x) < 1 &&
            Math.abs((b.y ?? 0) - (c.y ?? 0)) < 5,
        )
      ) {
        fieldsHere.add(c.field);
        cells.push(c);
      }
  });
  // Variant rows (the club's ladder row, a lost result): their cell styles that differ.
  const variants: NonNullable<RowsSpec["variants"]> = {};
  bound.forEach((r, i) => {
    if (!r.variant || variants[r.variant] || !rows[i]) return;
    const own = cellsOf(rows[i]!, r.values);
    const overrides: Record<string, NonNullable<RowsCell["style"]>> = {};
    for (const c of own) {
      const baseCell = cells.find((b) => b.field === c.field && b.show === c.show);
      if (!c.style || JSON.stringify(c.style) === JSON.stringify(baseCell?.style)) continue;
      // A backdrop and a text cell can share a field key: merge, so neither's change is lost.
      overrides[c.field] =
        c.show === "backdrop"
          ? {
              ...overrides[c.field],
              ...(c.style.background ? { background: c.style.background } : {}),
            }
          : { ...c.style, ...overrides[c.field] };
    }
    if (Object.keys(overrides).length) variants[r.variant] = overrides;
  });
  const spec: RowsSpec = {
    repeat: opts.repeat,
    rowHeight: r2((rowH / opts.W) * 100),
    ...(pitch > rowH ? { gap: r2(((pitch - rowH) / opts.W) * 100) } : {}),
    cells,
    ...(columns > 1 ? { columns, columnGap: columnGapOf(geo) } : {}),
    // Tiles that fill a line before the next (the second row beside the first).
    ...(columns > 1 && geo[1] && Math.abs(geo[1].box.y - geo[0]!.box.y) < 1
      ? { flow: "across" as const }
      : {}),
    ...(Object.keys(variants).length ? { variants } : {}),
  };
  return { spec, height: pitch * Math.ceil(rows.length / columns) };
}

/** The gap between side-by-side rows, in percent of the list's width (the renderer's default is 4). */
function columnGapOf(rows: CapturedElement[]): number {
  const left = Math.min(...rows.map((r) => r.box.x));
  const right = Math.max(...rows.map((r) => r.box.x + r.box.w));
  const first = rows.filter((r) => Math.abs(r.box.x - left) < 1)[0]!;
  const next = rows
    .filter((r) => r.box.x > first.box.x + first.box.w - 1)
    .sort((a, b) => a.box.x - b.box.x)[0];
  const gap = next ? next.box.x - (first.box.x + first.box.w) : 0;
  return r2(Math.min(50, Math.max(0, (gap / Math.max(1, right - left)) * 100)));
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
  // Cells sit where the worst case puts them in its twin row (else in this one).
  const rowTwin = opts.twin?.(row);
  const useTwin = !!rowTwin && rowTwin !== row && rowTwin.box.h > 0;
  const rowBox = useTwin ? rowTwin!.box : row.box;
  // A text cell at least one line of its font tall, centred where it was: an inline span's
  // box is shorter than its line, and the template draws the line (1.05 of the font).
  const lineTall = <C extends { y?: number; h?: number }>(
    cell: C,
    style: NonNullable<RowsCell["style"]>,
  ): C => {
    const linePx = ((style.fontSize ?? 0) / 100) * opts.W * 1.15;
    const minH = Math.min(100, r2((linePx / rowBox.h) * 100));
    const y = cell.y ?? 0;
    const h = cell.h ?? 100;
    if (h >= minH) return cell;
    return { ...cell, y: Math.min(100 - minH, Math.max(0, r2(y + h / 2 - minH / 2))), h: minH };
  };
  const flat = [row, ...tree.descendants(row)];
  const norm = (v: string) => v.trim().toLowerCase();
  const fieldFor = (el: CapturedElement, text: string, run: number): string | null => {
    if (opts.cellField) return opts.cellField(el);
    const t = norm(text);
    const entries = Object.entries(values).filter(([, v]) => v.trim());
    const exact = entries.filter(([, v]) => norm(v) === t);
    if (exact.length > 1) {
      // Several fields hold this value here: those that match the same cell in the other
      // rows, then one no other cell has taken (a ladder's position and losses).
      const at = flat.indexOf(el);
      const fits = exact.filter(([k]) =>
        (opts.others ?? []).every((o) => {
          const twin = [o.row, ...tree.descendants(o.row)][at];
          const said = twin?.text?.[run]?.text;
          return said === undefined || norm(o.values[k] ?? "") === norm(said);
        }),
      );
      // The worst case shows real-looking content: the one field whose worst-case value
      // is what its twin of this cell says ("M. SURNAME" is the broadcast name, not the surname).
      const said = opts.twin?.(el)?.text?.[run]?.text;
      const twinPick =
        said && opts.rowTwinValues
          ? fits.filter(([k]) => norm(opts.rowTwinValues![k] ?? "") === norm(said))
          : [];
      const taken = new Set(cells.filter((c) => c.show !== "backdrop").map((c) => c.field));
      const pick =
        (twinPick.length === 1 ? twinPick[0] : undefined) ??
        fits.find(([k]) => !taken.has(k)) ??
        fits[0] ??
        exact.find(([k]) => !taken.has(k));
      if (pick) return pick[0];
    }
    if (exact[0]) return exact[0][0];
    // A field set inside literal text ("(VC)", "#12"): the longest value the text holds.
    const inside = entries
      .filter(([, v]) => v.trim().length >= 2 && t.includes(v.trim().toLowerCase()))
      .sort((a, b) => b[1].length - a[1].length)[0];
    return inside ? inside[0] : null;
  };
  const at = (el: CapturedElement) => {
    const t = useTwin ? opts.twin!(el) : el;
    const box = t !== el || !useTwin ? t.box : el.box;
    const from = t !== el || !useTwin ? rowBox : row.box;
    return {
      x: r2(((box.x - from.x) / from.w) * 100),
      w: r2((box.w / from.w) * 100),
      y: r2(((box.y - from.y) / from.h) * 100),
      h: r2((box.h / from.h) * 100),
    };
  };
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
    // A box behind the row's content, or a text's own (an outcome pill): a backdrop.
    if (el !== row && el.style["background-color"]) {
      const bg = opts.colour(el, "background-color");
      const r = cornerPx(el);
      if (bg)
        cells.push({
          field: "",
          ...at(el),
          show: "backdrop",
          style: { background: bg, ...(r ? { radius: r } : {}) },
        });
    }
    // A solid border edge (a highlight row's accent bar) is a backdrop strip along that side.
    for (const side of ["left", "right", "top", "bottom"] as const) {
      const bw = px(el.style[`border-${side}-width`]);
      if (!(bw > 0)) continue;
      const bc = opts.colour(el, `border-${side}-color`);
      if (!bc) continue;
      const box = at(el);
      const across = (bw / rowBox.w) * 100;
      const down = (bw / rowBox.h) * 100;
      const strip =
        side === "left"
          ? { ...box, w: r2(across) }
          : side === "right"
            ? { ...box, x: r2(box.x + box.w - across), w: r2(across) }
            : side === "top"
              ? { ...box, h: r2(down) }
              : { ...box, y: r2(box.y + box.h - down), h: r2(down) };
      cells.push({ field: "", ...strip, show: "backdrop", style: { background: bc } });
    }
    if (el.tag === "img") {
      const field = opts.cellField ? opts.cellField(el) : imageField(el, values);
      // A round photo: its own corners, or a clipping frame's.
      const frame = el.parent === null ? undefined : tree.byId.get(el.parent);
      const r =
        cornerPx(el) ??
        (frame && frame.style["overflow-x"] === "hidden" ? cornerPx(frame) : undefined);
      if (field)
        cells.push({ field, ...at(el), show: "image", ...(r ? { style: { radius: r } } : {}) });
      continue;
    }
    for (const [i, run] of (el.text ?? []).entries()) {
      const field = fieldFor(el, run.text, i);
      if (!field) continue;
      cells.push({ field, ...at(el), style: textStyle(el) });
    }
  }
  const firstField = cells.find((c) => c.field)?.field ?? "";
  // A backdrop draws whatever its row holds, but needs a field key, and a row style
  // (a lost result's badge colour) overrides by key: each backdrop takes its own.
  // Keys from the cells as the pack drew them (before widening, so a pill still holds its text).
  const keys = backdropKeys(cells, rowFill !== undefined);
  // Then each text cell is at least a line tall (a pill held its text as drawn).
  for (const [i, c] of cells.entries())
    if (c.field && c.show === undefined) cells[i] = lineTall(c, c.style ?? {});
  widenTextCells(cells, {
    left: ((px(row.style["padding-left"]) || 0) / row.box.w) * 100,
    right: 100 - ((px(row.style["padding-right"]) || 0) / row.box.w) * 100,
  });
  for (const c of cells) if (!c.field) c.field = keys.get(c) ?? firstField;
  if (rowFill)
    cells.unshift({
      field: keys.get(null) ?? firstField,
      x: 0,
      w: 100,
      show: "backdrop",
      style: { background: rowFill },
    });
  return cells.filter((c) => c.field);
}

/**
 * Field keys for a row's backdrops (`null`: the row's own fill): the field of
 * the content a backdrop holds (a grade badge holds the grade), else one no
 * other backdrop has; holders choose first, smallest first; the row's fill last.
 */
export function backdropKeys(cells: RowsCell[], rowFill: boolean): Map<RowsCell | null, string> {
  const content = cells.filter((c) => c.field && c.show !== "backdrop");
  const fields = [...new Set(content.map((c) => c.field))];
  const top = (c: RowsCell) => c.y ?? 0;
  const bottom = (c: RowsCell) => (c.y ?? 0) + (c.h ?? 100);
  const holds = (outer: RowsCell, inner: RowsCell) =>
    inner.x >= outer.x - 0.5 &&
    inner.x + inner.w <= outer.x + outer.w + 0.5 &&
    top(inner) >= top(outer) - 0.5 &&
    bottom(inner) <= bottom(outer) + 0.5;
  const taken = new Set<string>();
  const out = new Map<RowsCell | null, string>();
  const area = (c: RowsCell) => c.w * (c.h ?? 100);
  const heldBy = (b: RowsCell) => content.filter((c) => holds(b, c)).map((c) => c.field);
  // Backdrops that hold content claim it first; the rest take what's left.
  const backdrops = cells
    .filter((c) => !c.field)
    .sort((a, b) => Number(!heldBy(a).length) - Number(!heldBy(b).length) || area(a) - area(b));
  for (const b of backdrops) {
    const key =
      heldBy(b).find((f) => !taken.has(f)) ?? fields.find((f) => !taken.has(f)) ?? fields[0];
    if (!key) continue;
    out.set(b, key);
    taken.add(key);
  }
  if (rowFill) {
    const key = fields.find((f) => !taken.has(f)) ?? fields[0];
    if (key) out.set(null, key);
  }
  return out;
}

/** An element's corner radius in px (`50%` of its shorter side for a circle), if it has one. */
function cornerPx(el: CapturedElement): number | undefined {
  const raw = el.style["border-top-left-radius"];
  if (!raw) return undefined;
  const n = raw.trim().endsWith("%")
    ? (parseFloat(raw) / 100) * Math.min(el.box.w, el.box.h)
    : px(raw);
  return Number.isFinite(n) && n > 0 ? r2(n) : undefined;
}

/**
 * Text cells hug the sentinel's short values; a real value ("10/123") is
 * longer. Each widens away from its alignment edge, up to its neighbour on
 * the same line or the row's padding, so longer values have room and short
 * ones sit where they did.
 */
export function widenTextCells(cells: RowsCell[], inner: { left: number; right: number }): void {
  const text = cells.filter(
    (c) => c.show !== "backdrop" && c.show !== "image" && c.show !== "logo",
  );
  const lineOf = (c: RowsCell) => [c.y ?? 0, (c.y ?? 0) + (c.h ?? 100)];
  const sameLine = (a: RowsCell, b: RowsCell) => {
    const [a0, a1] = lineOf(a);
    const [b0, b1] = lineOf(b);
    return Math.min(a1!, b1!) - Math.max(a0!, b0!) > 0;
  };
  // A cell pushed to the row's right edge (flex-end, an auto margin) with cells
  // before it reads right to left, whatever its text-align says: it grows leftward.
  const pushedRight = new Set(
    text.filter(
      (c) =>
        (c.style?.align ?? "left") === "left" &&
        Math.abs(c.x + c.w - inner.right) < 1.5 &&
        text.some((o) => o !== c && sameLine(c, o) && o.x + o.w <= c.x + 0.01),
    ),
  );
  const alignOf = (c: RowsCell) => (pushedRight.has(c) ? "right" : (c.style?.align ?? "left"));
  // How a neighbour grows: an image doesn't, so the whole gap is this cell's.
  const grows = (c: RowsCell) => (c.show === "image" ? "none" : alignOf(c));
  const widened = text.map((c) => {
    const others = cells.filter((o) => o !== c && o.show !== "backdrop" && sameLine(c, o));
    // A gap goes wholly to this cell when the neighbour grows away from it, else half each.
    const leftLimit = Math.max(
      inner.left,
      ...others
        .filter((o) => o.x + o.w <= c.x + 0.01)
        .map((o) =>
          grows(o) === "right" || grows(o) === "none" ? o.x + o.w : (o.x + o.w + c.x) / 2,
        ),
    );
    const rightLimit = Math.min(
      inner.right,
      ...others
        .filter((o) => o.x >= c.x + c.w - 0.01)
        .map((o) => (grows(o) === "left" || grows(o) === "none" ? o.x : (c.x + c.w + o.x) / 2)),
    );
    const align = alignOf(c);
    if (align === "right")
      return { x: r2(Math.min(c.x, leftLimit)), w: r2(c.x + c.w - Math.min(c.x, leftLimit)) };
    if (align === "center") {
      const room = Math.max(0, Math.min(c.x - leftLimit, rightLimit - (c.x + c.w)));
      return { x: r2(c.x - room), w: r2(c.w + 2 * room) };
    }
    return { x: c.x, w: r2(Math.max(c.w, rightLimit - c.x)) };
  });
  text.forEach((c, i) => Object.assign(c, widened[i]));
  for (const c of pushedRight) c.style = { ...c.style, align: "right" };
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
