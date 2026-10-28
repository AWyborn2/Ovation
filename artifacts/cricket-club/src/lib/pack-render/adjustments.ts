/**
 * Card adjustments (Social Studio U15, KTD12): the editor's edits, stored as
 * data and applied over a pack template at bind time, identically in the
 * browser and the render harness.
 *
 * Content is shared across formats: field overrides, hidden template
 * elements, and each free layer's content, style and animation. Geometry is
 * per format: the photo transform and each free layer's box. A format with no
 * geometry of its own inherits the most recently edited format's, and is
 * reported as inherited so the editor and post pack can flag it for review.
 */

import {
  documentPageLayers,
  flattenLayers,
  isBundledImage,
  isDocumentV2,
  layerDropped,
  LOGO_ROW_FIELDS,
  pickRowIndexes,
  normaliseDocument,
  PHOTO_TOKEN,
  photoLayerKey,
  primaryPage,
  rowsColumns,
  type DerivedPalette,
  type GroupLayerV2,
  type LayerPhotos,
  type PageKey,
  type RowsSpec,
  type TemplateDocumentV2,
  type TemplateLayerV2,
  type TemplateStyleV2,
  type TemplateTextStyle,
  type TemplateTimeline,
  type TextLayerV2,
  type VectorLayerV2,
} from "@workspace/scorecard/kind-templates";
import type { CardSize } from "../share-card";
import { SIZES } from "../share-card/types";
import { focusTransform, type PhotoFocus } from "@workspace/scorecard/photo-focus";
import { escapeHtml } from "./html-utils";
import { FIT_ATTR, FIT_TEXT_ATTR, FIT_WORDS_ATTR, textFitAttrs } from "./layer-fit";
import { renderChart, renderMedal, renderSticker, type ChartSpec } from "./layer-kinds";
import {
  groupDepthAllowed,
  layerShows,
  renderGroup,
  type DrawnLayer,
  type LayoutContext,
} from "./layer-layout";
import { hasLoops, LOOP_KEYFRAMES, MOTION_KEYFRAMES, motionCss } from "./layer-motion";
import {
  clippedGlowCss,
  colourResolver,
  layerBoxCss,
  layerNeedsV2,
  overlayHtml,
  paletteVars,
  shapeFillCss,
  skewCss,
  textStyleCss,
  type StyleContext,
} from "./layer-style";
import { duotonePaletteFor } from "./duotone-vars";
import { renderVector } from "./layer-vector";
import { renderElement, type ElementLayerState } from "../studio-elements/registry";
import type { PackCardData, PackTokens } from "./types";
import type { MatchColours } from "@workspace/scorecard/match-palette";

export type PhotoAdjust = { focalX: number; focalY: number; zoom: number };

/** A free layer's box, in percent of the artboard; rotation in degrees. */
export type LayerBox = { x: number; y: number; w: number; h: number; rotate?: number };

export type LayerAnimation = {
  kind: "none" | "rise" | "fade" | "pop";
  delayMs?: number;
};

export type FreeLayerKind =
  | "text"
  | "shape"
  | "image"
  | "medal"
  | "sticker"
  | "chart"
  /** A Studio library element (`lib/studio-elements`), e.g. Club Kit score bars. */
  | "element"
  /** The card's photo (kind templates, ADR-001); never drawn on junior cards. */
  | "photo"
  /** One styled list row repeated per data row (kind templates, ADR-001). */
  | "rows"
  /** An inline SVG decoration (format v2, ADR-011). */
  | "vector"
  /** A group or stack of child layers (format v2, ADR-011). */
  | "group";

export type FreeLayer = {
  id: string;
  kind: FreeLayerKind;
  /** Display name in the layers drawer. */
  name?: string;
  /** Hidden layers stay in the document but don't render. */
  hidden?: boolean;
  /** Locked layers can't be selected on the canvas or deleted. */
  locked?: boolean;
  /** Layers sharing a group id select and move together. */
  group?: string;
  /** Layers sharing a link are one element drawn per size (format v2, Stream C). */
  link?: string;
  /**
   * Text for `text` and `sticker`; image url for `image`; the milestone
   * (e.g. "100") for `medal`; unused for `shape` and `chart`.
   */
  content?: string;
  /** Medal sub-line (e.g. "Career runs"). */
  sub?: string;
  /** A live text layer shows this card field's current value (U17 live stats). */
  bind?: string;
  /** Chart data captured from the card's scorecard when the chart was added. */
  chart?: ChartSpec;
  /** The player a player-block layer belongs to. */
  playerId?: number;
  /** A library element's id and edited props (`kind: "element"`). */
  element?: ElementLayerState;
  /** The list row a `rows` layer repeats. */
  rows?: RowsSpec;
  /** The photo's focal point and zoom per size (`kind: "photo"`). */
  photo?: Partial<Record<CardSize, PhotoAdjust>>;
  style?: TemplateTextStyle;
  animation?: LayerAnimation;
  /** The sizes this layer is on; absent means every size (kind templates). */
  sizes?: CardSize[];
  /** Per-format boxes. */
  geometry: Partial<Record<CardSize, LayerBox>>;
  /** When each format's box was last edited (ms since epoch). */
  editedAt?: Partial<Record<CardSize, number>>;
};

export type CardAdjustments = {
  /** Field overrides by template field key (e.g. `headline`). */
  fields?: Record<string, string>;
  /** Hidden template elements: `slot:<key>` or `field:<key>`. */
  hidden?: string[];
  /** Photo transform per format. */
  photo?: Partial<Record<CardSize, PhotoAdjust>>;
  /** When each format's photo transform was last edited. */
  photoEditedAt?: Partial<Record<CardSize, number>>;
  layers?: FreeLayer[];
  /** Image overrides by slot key (e.g. `photo` set from the club library). */
  images?: Record<string, string>;
  /** Keep the sponsor strip on the card: its slots can't be hidden while on. */
  sponsorLock?: boolean;
  /** The editor's page on show: the colour behind its layers (`TemplatePage.background`). */
  background?: string;
  /**
   * Balanced card sets (plan 2026-10-01-001): the set's options (cover,
   * grouping), stored on the card's root adjustments only.
   */
  set?: { cover?: boolean; grouping?: "auto" | "none" };
  /** Per-slide edits for a set, by slide key (`cover`, `detail:<section>:<row>`). */
  slides?: Record<string, CardAdjustments>;
  /**
   * Format v2 (ADR-011): a v2 document's pages, in place of `layers`. The
   * renderer reads every document through `normaliseDocument`, so a v1
   * `layers` list is the kind's primary page.
   */
  formatVersion?: TemplateDocumentV2["formatVersion"];
  pages?: TemplateDocumentV2["pages"];
  timeline?: TemplateTimeline;
  palettes?: DerivedPalette[];
};

/**
 * A slide's own adjustments. The single card of a non-set input uses the
 * root; every slide of a set has its own (unedited slides get none).
 */
export function slideAdjustments(
  root: CardAdjustments | null | undefined,
  key: string,
): CardAdjustments | null {
  if (!root) return null;
  if (key === "single") return root;
  return root.slides?.[key] ?? null;
}

/** The root adjustments with one slide's adjustments replaced. */
export function withSlideAdjustments(
  root: CardAdjustments,
  key: string,
  next: CardAdjustments,
): CardAdjustments {
  if (key === "single") return { ...next, set: root.set, slides: root.slides };
  return { ...root, slides: { ...root.slides, [key]: next } };
}

/** Sponsor strip slot keys (`sponsor1`…). */
export const isSponsorSlot = (key: string) => /^sponsor[0-9]+$/.test(key);

/** A resolved per-format value and whether it was inherited from another format. */
export type Resolved<T> = { value: T; inherited: boolean; from: CardSize } | null;

/**
 * The geometry for `size`: its own if set, else the most recently edited
 * format's (ties go to the first format in `map` order), flagged inherited.
 */
export function resolveGeometry<T>(
  map: Partial<Record<CardSize, T>> | undefined,
  editedAt: Partial<Record<CardSize, number>> | undefined,
  size: CardSize,
): Resolved<T> {
  if (!map) return null;
  const own = map[size];
  if (own !== undefined) return { value: own, inherited: false, from: size };
  let best: CardSize | null = null;
  for (const f of Object.keys(map) as CardSize[]) {
    if (map[f] === undefined) continue;
    if (best === null || (editedAt?.[f] ?? 0) > (editedAt?.[best] ?? 0)) best = f;
  }
  return best ? { value: map[best] as T, inherited: true, from: best } : null;
}

/** The photo transform to render at `size`, own or inherited. */
export function photoFor(
  adj: CardAdjustments | null | undefined,
  size: CardSize,
): Resolved<PhotoAdjust> {
  return resolveGeometry(adj?.photo, adj?.photoEditedAt, size);
}

/** Formats whose rendering relies on inherited geometry (for review flags). */
export function inheritedFormats(
  adj: CardAdjustments | null | undefined,
  sizes: readonly CardSize[],
): CardSize[] {
  if (!adj) return [];
  return sizes.filter((size) => {
    if (photoFor(adj, size)?.inherited) return true;
    return (adj.layers ?? []).some((l) => resolveGeometry(l.geometry, l.editedAt, size)?.inherited);
  });
}

/** Whether a v2 document has a layer on any page. */
/** A page-based document with something on a page: layers, or the page's own colour. */
const hasPageLayers = (adj: CardAdjustments): boolean =>
  isDocumentV2(adj) &&
  Object.values(adj.pages).some(
    (page) => (Array.isArray(page?.layers) && page.layers.length > 0) || !!page?.background,
  );

/** True when the adjustments change nothing, so the render stays byte-identical. */
export function isEmptyAdjustments(adj: CardAdjustments | null | undefined): boolean {
  if (!adj) return true;
  return (
    Object.keys(adj.fields ?? {}).length === 0 &&
    (adj.hidden ?? []).length === 0 &&
    Object.keys(adj.photo ?? {}).length === 0 &&
    Object.keys(adj.images ?? {}).length === 0 &&
    (adj.layers ?? []).length === 0 &&
    !hasPageLayers(adj)
  );
}

/** Apply field overrides onto the bound values (before template substitution). */
export function applyFieldOverrides(
  values: Record<string, string>,
  adj: CardAdjustments | null | undefined,
): Record<string, string> {
  if (!adj?.fields || Object.keys(adj.fields).length === 0) return values;
  return { ...values, ...adj.fields };
}

const hiddenKeys = (adj: CardAdjustments | null | undefined, prefix: "slot:" | "field:") =>
  new Set(
    (adj?.hidden ?? [])
      .filter((h) => h.startsWith(prefix))
      .map((h) => h.slice(prefix.length))
      // While the sponsor strip is locked, its slots always render.
      .filter((k) => !(adj?.sponsorLock && prefix === "slot:" && isSponsorSlot(k))),
  );

/**
 * Hide template slots, keeping their box so the layout doesn't shift. Runs on
 * the template html before slots resolve.
 */
export function hideSlots(html: string, adj: CardAdjustments | null | undefined): string {
  const keys = hiddenKeys(adj, "slot:");
  if (keys.size === 0) return html;
  return html.replace(
    /<div data-slot="([^"]+)" data-slot-type="[^"]+"[^>]*><\/div>/g,
    (all, key: string) =>
      keys.has(key)
        ? `<div data-hidden-slot="${escapeHtml(key)}" style="width:100%;height:100%;visibility:hidden"></div>`
        : all,
  );
}

/**
 * Hide template fields: the value still takes up its space (so the layout
 * holds) but is invisible. Runs on the template html before substitution;
 * placeholders only ever appear in text content, never inside attributes.
 */
export function hideFields(html: string, adj: CardAdjustments | null | undefined): string {
  const keys = hiddenKeys(adj, "field:");
  if (keys.size === 0) return html;
  return html.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (all, key: string) =>
    keys.has(key)
      ? `<span data-hidden-field="${escapeHtml(key)}" style="visibility:hidden">${all}</span>`
      : all,
  );
}

/** CSS a card needs for free-layer animations (inlined so exports carry it). */
export const LAYER_KEYFRAMES = MOTION_KEYFRAMES;

/** A style value safe to place inside a style attribute. */
const cssValue = (v: string | undefined): string | undefined =>
  v == null ? undefined : String(v).replace(/[";<>{}]/g, "");

/**
 * A number safe to place in markup: documents are admin-authored JSON, so a
 * "number" may be any value. Non-finite values fall back; valid numbers print
 * exactly as before.
 */
const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const ALIGN = new Set(["left", "center", "right"]);
const alignOf = (v: unknown): "left" | "center" | "right" =>
  typeof v === "string" && ALIGN.has(v) ? (v as "left" | "center" | "right") : "center";

/** Per-render context for library elements (club colours, crest, live rows). */
export interface FreeLayerContext {
  tokens?: PackTokens;
  brand?: PackCardData["brand"] | null;
  junior?: boolean;
  /**
   * The server's positive marker that this junior card may show its photo — a junior
   * player's own photo the family allows (ADR-007). Without it a junior card never
   * draws a photo, whatever the document or data hold.
   */
  juniorPhotoAllowed?: boolean;
  rows?: Record<string, Array<Record<string, string>>>;
  /** Each repeat row's variant, parallel to `rows` (for `rows` layers). */
  rowVariants?: Record<string, Array<string | undefined>>;
  /** The card photo for `photo` layers; null/absent draws nothing. */
  photoUrl?: string | null;
  /**
   * The card's photo placement sliders (focal point 0–1, zoom). Once moved off
   * the centre they win over a `photo` layer's own focal point and zoom; left
   * centred, the layer's own are kept, as in the pack path.
   */
  photoTransform?: { focalX: number; focalY: number; zoom?: number } | null;
  /**
   * The photo's focus box and size (photo focus areas): a `photo` layer whose
   * position nobody set by hand crops to it, for its own frame's shape.
   */
  photoFocus?: PhotoFocus | null;
  /**
   * Sourced photo layers' own photos (photo layer sources, a draft's
   * `layerPhotos`), by `photoLayerKey`. A `photo` layer with an entry shows
   * that photo, cropped to its focus; one without shows `photoUrl`.
   */
  layerPhotos?: LayerPhotos | null;
  /**
   * The size in pixels of the frame being drawn (set by `renderFreeLayers` for
   * a `photo` layer), so a focus box crops to the frame's shape.
   */
  framePx?: { w: number; h: number };
  /**
   * The card's bound images (crests, sponsor logos, the club logo), for v2
   * image tokens and conditions. Photos are already left out of a junior
   * card the server hasn't cleared.
   */
  images?: Record<string, string>;
  /** The card's kind and the page to draw (format v2); absent → the kind's primary page. */
  kind?: string;
  page?: PageKey;
  /** The format of the document being drawn; v2-only rules apply to 2. Set by `renderFreeLayers`. */
  formatVersion?: 1 | 2;
  /** Whether the card is animated (loops that run on the text need it). Set by `renderFreeLayers`. */
  animate?: boolean;
  /** Both teams' colours, for the match palette (`--mt-*`); absent → the club against a neutral side. */
  match?: MatchColours;
}

const TOKEN = /\{\{\s*([\w.]+)\s*\}\}/g;

/** Whether text carries `{{field}}` tokens. */
export const hasFieldTokens = (text: string | undefined): boolean =>
  !!text && /\{\{\s*[\w.]+\s*\}\}/.test(text);

/** Text with each `{{field}}` token replaced by its card value (empty when absent). */
export function substituteTokens(text: string, values: Record<string, string>): string {
  return text.replace(TOKEN, (_all, key: string) => values[key] ?? "");
}

/** A fittable element's designed size in cqw, for `FIT_ATTR`. */
const fitBase = (style: TemplateTextStyle | undefined) => num(style?.fontSize, 5).toFixed(2);

/** A v2 text width as `font-stretch`, or "" (none, or not a number). */
function stretchCss(stretch: unknown): string {
  if (typeof stretch !== "number" || !Number.isFinite(stretch)) return "";
  return `font-stretch:${+Math.min(200, Math.max(50, stretch)).toFixed(1)}%`;
}

/**
 * Inline CSS for a text box (text layers and list-row cells): `extra` before
 * the text settings, `after` once they are set (v2 style additions).
 */
function textCss(
  raw: TemplateTextStyle | undefined,
  extra: string[] = [],
  after: string[] = [],
): string {
  const s = {
    ...(raw ?? {}),
    color: cssValue(raw?.color),
    background: cssValue(raw?.background),
    fontFamily: cssValue(raw?.fontFamily),
  };
  return [
    ...extra,
    "display:flex",
    "align-items:center",
    `justify-content:${alignOf(s.align) === "left" ? "flex-start" : alignOf(s.align) === "right" ? "flex-end" : "center"}`,
    `text-align:${alignOf(s.align)}`,
    `color:${s.color ?? "inherit"}`,
    `font-family:${s.fontFamily ?? "var(--disp,'Anton'),sans-serif"}`,
    `font-size:${num(s.fontSize, 5).toFixed(2)}cqw`,
    `font-weight:${num(s.fontWeight, 700)}`,
    "line-height:1.05",
    "white-space:pre-wrap",
    s.letterSpacing != null ? `letter-spacing:${num(s.letterSpacing)}em` : "",
    s.uppercase === true ? "text-transform:uppercase" : "",
    // v2 only (a v1 style can't hold them): the family's italic and its width.
    (raw as TemplateStyleV2 | undefined)?.italic === true ? "font-style:italic" : "",
    stretchCss((raw as TemplateStyleV2 | undefined)?.stretch),
    s.background ? `background:${s.background}` : "",
    s.radius != null ? `border-radius:${num(s.radius)}px` : "",
    ...after,
  ]
    .filter(Boolean)
    .join(";");
}

/** A `rows` layer: one positioned row per data row, cells placed across it. */
function renderRows(layer: FreeLayer, ctx: FreeLayerContext): string | null {
  const spec = layer.rows;
  if (!spec) return null;
  const own = (o: object | undefined) =>
    o && Object.prototype.hasOwnProperty.call(o, spec.repeat)
      ? (o as Record<string, unknown>)[spec.repeat]
      : undefined;
  const bound = own(ctx.rows);
  if (!Array.isArray(bound) || bound.length === 0 || !Array.isArray(spec.cells)) return null;
  const listed = own(ctx.rowVariants);
  const boundVariants: Array<string | undefined> = Array.isArray(listed) ? listed : [];
  // A result's batting and bowling lists draw the rows their pick chooses
  // (whose, which, sorted how, how many); without one, every row as bound
  // (D4). Any other list draws every row.
  const picked = pickRowIndexes(spec.repeat, bound as Array<Record<string, string>>, spec.pick);
  if (picked.length === 0) return null;
  const rows = picked.map((i) => (bound as Array<Record<string, string>>)[i]!);
  const variants = picked.map((i) => boundVariants[i]);
  const gap = num(spec.gap);
  const rowHeight = num(spec.rowHeight, 7);
  // Several columns: rows fill the first column, then the next, evenly.
  const columns = rowsColumns(spec);
  const perColumn = Math.ceil(rows.length / columns);
  const colGap = columns > 1 ? Math.min(50, Math.max(0, num(spec.columnGap, 4))) : 0;
  const colW = (100 - colGap * (columns - 1)) / columns;
  const out = rows.map((row, i) => {
    const variant = variants[i];
    const cells = spec.cells.map((cell) => {
      const override = variant ? spec.variants?.[variant]?.[cell.field] : undefined;
      // On a v2 list, a row style's background for a key a backdrop holds colours that
      // backdrop, not a text cell sharing the key that had none (a box behind the text).
      const { background: _bg, ...textOverride } = override ?? {};
      const own =
        ctx.formatVersion === 2 &&
        cell.show !== "backdrop" &&
        cell.style?.background == null &&
        spec.cells.some((c) => c.show === "backdrop" && c.field === cell.field)
          ? textOverride
          : override;
      const style = { ...cell.style, ...own };
      const place = [
        "position:absolute",
        `left:${num(cell.x)}%`,
        `width:${num(cell.w)}%`,
        cell.y === undefined ? "top:0" : `top:${num(cell.y)}%`,
        cell.h === undefined ? "height:100%" : `height:${num(cell.h, 100)}%`,
        "overflow:hidden",
      ];
      // A stand-in (a monogram) draws only where the field it stands in for is empty.
      if (cell.fallbackFor && (row[cell.fallbackFor] ?? "").trim()) return "";
      if (cell.show === "logo") {
        // A crest or sponsor logo the row holds, whole, on any card. Only logo
        // fields: a logo cell can never put a photo on a junior card.
        const src = LOGO_ROW_FIELDS.includes(cell.field) ? (row[cell.field] ?? "").trim() : "";
        if (!src) return "";
        const radius = style.radius != null ? `;border-radius:${num(style.radius)}px` : "";
        return `<div data-row-cell="${escapeHtml(cell.field)}" style="${place.join(";")}${radius}"><img src="${escapeHtml(src)}" alt="" style="width:100%;height:100%;object-fit:contain;display:block" /></div>`;
      }
      if (cell.show === "backdrop") {
        const bg = cssValue(style.background);
        return `<div data-row-cell="${escapeHtml(cell.field)}" style="${place.join(";")}${bg ? `;background:${bg}` : ""}${style.radius != null ? `;border-radius:${num(style.radius)}px` : ""}"></div>`;
      }
      if (cell.show === "image") {
        // A photo the row carries (e.g. a player's); a junior card shows one only
        // behind the server's positive marker (ADR-007).
        const src = ctx.junior && !ctx.juniorPhotoAllowed ? "" : (row[cell.field] ?? "").trim();
        if (!src) return "";
        const radius = style.radius != null ? `;border-radius:${num(style.radius)}px` : "";
        return `<div data-row-cell="${escapeHtml(cell.field)}" style="${place.join(";")}${radius}"><img src="${escapeHtml(src)}" alt="" style="width:100%;height:100%;object-fit:cover;display:block" /></div>`;
      }
      // Cells stay on one line so an overflow shows as width, which the fit
      // step shrinks and, failing that, reports (KTD9). In format v2 it then
      // ends the text in "…" after its last whole word that fits.
      // A v2 cell draws its text shadows, stroke, text fill and line height too.
      const after = ctx.formatVersion === 2 ? textStyleCss(style as TemplateStyleV2) : [];
      const css = textCss(style, place, after).replace(
        "white-space:pre-wrap",
        "white-space:nowrap",
      );
      const words = ctx.formatVersion === 2 ? ` ${FIT_WORDS_ATTR}="1"` : "";
      return `<div data-row-cell="${escapeHtml(cell.field)}" ${FIT_ATTR}="${fitBase(style)}"${words} style="${css}">${escapeHtml(row[cell.field] ?? "")}</div>`;
    });
    // `across` fills each line left to right (a grid of tiles); `down` fills a column first.
    const acrossFirst = spec.flow === "across";
    const col = acrossFirst ? i % columns : Math.floor(i / perColumn);
    const top = (acrossFirst ? Math.floor(i / columns) : i % perColumn) * (rowHeight + gap);
    const across =
      columns > 1
        ? `left:${(col * (colW + colGap)).toFixed(3)}%;width:${colW.toFixed(3)}%`
        : "left:0;right:0";
    return `<div data-row-index="${i}"${variant ? ` data-row-variant="${escapeHtml(variant)}"` : ""} style="position:absolute;${across};top:${top.toFixed(3)}cqw;height:${rowHeight.toFixed(3)}cqw">${cells.join("")}</div>`;
  });
  return `<div style="position:relative;width:100%;height:100%;overflow:hidden">${out.join("")}</div>`;
}

/** The card's sliders as a layer's photo adjust (percent focal point); null while untouched. */
function sliderPhoto(t: FreeLayerContext["photoTransform"]): PhotoAdjust | null {
  if (!t) return null;
  const zoom = t.zoom ?? 1;
  const centred = Math.abs(t.focalX - 0.5) < 0.005 && Math.abs(t.focalY - 0.5) < 0.005;
  if (centred && Math.abs(zoom - 1) < 0.005) return null;
  const pct = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 1000) / 10;
  return { focalX: pct(t.focalX), focalY: pct(t.focalY), zoom };
}

/** A photo's focus box as a layer's photo adjust for this frame; null without one. */
function focusPhoto(
  focus: PhotoFocus | null | undefined,
  ctx: FreeLayerContext,
): PhotoAdjust | null {
  const frame = ctx.framePx;
  if (!focus || !frame || !(frame.w > 0) || !(frame.h > 0)) return null;
  const t = focusTransform(focus, frame.w / frame.h);
  const pct = (v: number) => Math.round(v * 1000) / 10;
  return { focalX: pct(t.focalX), focalY: pct(t.focalY), zoom: t.zoom };
}

/** A `photo` layer: the card photo at this size's focal point and zoom. */
function renderPhoto(layer: FreeLayer, size: CardSize, ctx: FreeLayerContext): string | null {
  // A junior card shows a photo only when the server marked it allowed — a junior
  // player's own photo the family consented to (ADR-007); never from the document alone.
  if (ctx.junior && !ctx.juniorPhotoAllowed) return null;
  // A sourced layer's own photo (photo layer sources), else the card's photo.
  const own = ctx.layerPhotos?.[photoLayerKey(layer)];
  const url = own?.url || ctx.photoUrl;
  if (!url) return null;
  // A hand-set position wins (the card's sliders, which move the card's photo
  // only, then the layer's own, which only an edit sets: no bundled design
  // positions its photo); then the photo's focus box; then centred.
  const t = (own ? null : sliderPhoto(ctx.photoTransform)) ??
    resolveGeometry(layer.photo, undefined, size)?.value ??
    focusPhoto(own ? own.focus : ctx.photoFocus, ctx) ?? {
      focalX: 50,
      focalY: 50,
      zoom: 1,
    };
  const radius = layer.style?.radius != null ? `;border-radius:${num(layer.style.radius)}px` : "";
  const fx = num(t.focalX, 50);
  const fy = num(t.focalY, 50);
  // Below 1× the photo shrinks inside its box, toward the focal point, so the
  // sliders place the smaller photo (left/top at 0%, centred at 50%).
  const zoom = Math.max(PHOTO_ZOOM_MIN, Math.min(PHOTO_ZOOM_MAX, num(t.zoom, 1)));
  return `<div style="width:100%;height:100%;overflow:hidden${radius}"><img src="${escapeHtml(url)}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;object-position:${fx}% ${fy}%;transform:scale(${zoom});transform-origin:${fx}% ${fy}%" /></div>`;
}

/** The photo zoom range every control and renderer shares. */
export const PHOTO_ZOOM_MIN = 0.5;
export const PHOTO_ZOOM_MAX = 3;

/**
 * The size in pixels of the box a template draws the card photo in at `size`:
 * the largest `photo` layer on the kind's primary page. The photo controls
 * shape their frame to it, so dragging matches the card. Null when the
 * document draws no photo layer at that size.
 */
export function photoBoxSize(
  adj: unknown,
  kind: string,
  size: CardSize,
  card: { w: number; h: number },
): { w: number; h: number } | null {
  if (!adj) return null;
  const doc = normaliseDocument(adj as CardAdjustments, kind);
  let best: { w: number; h: number } | null = null;
  for (const layer of flattenLayers(documentPageLayers(doc, primaryPage(kind)))) {
    if (layer.kind !== "photo" || layer.hidden) continue;
    if (layer.sizes && !layer.sizes.includes(size)) continue;
    const box = resolveGeometry(layer.geometry, layer.editedAt, size)?.value;
    if (!box) continue;
    const w = (num(box.w) / 100) * card.w;
    const h = (num(box.h) / 100) * card.h;
    if (w > 0 && h > 0 && (!best || w * h > best.w * best.h)) best = { w, h };
  }
  return best;
}

/** A layer's inner markup; null when it should not be drawn at all. */
function layerInner(
  layer: FreeLayer,
  values: Record<string, string>,
  ctx: FreeLayerContext = {},
  size: CardSize = "square",
): string | null {
  const raw = layer.style ?? {};
  const s = {
    ...raw,
    color: cssValue(raw.color),
    background: cssValue(raw.background),
    fontFamily: cssValue(raw.fontFamily),
  };
  switch (layer.kind) {
    case "text": {
      const tokens = !layer.bind && hasFieldTokens(layer.content);
      const text = layer.bind
        ? (values[layer.bind] ?? "")
        : tokens
          ? substituteTokens(layer.content ?? "", values)
          : (layer.content ?? "");
      // A box made only of live fields that are all empty isn't drawn (KTD15).
      if (tokens && text.trim() === "") return null;
      // Live-field text shrinks to fit (KTD9); other text renders as before.
      const fit = tokens ? ` ${FIT_ATTR}="${fitBase(raw)}"` : "";
      // Format v2 text: its fit rule (T1.17) and its style additions (L1-D).
      const v2 = ctx.formatVersion === 2;
      const fitMore = v2 && tokens ? textFitAttrs((layer as unknown as TextLayerV2).fit) : "";
      const after = v2
        ? textStyleCss(layer.style, (layer as unknown as TextLayerV2).motion, ctx.animate === true)
        : [];
      const body = fitMore
        ? `<span ${FIT_TEXT_ATTR} style="min-width:0;max-width:100%">${escapeHtml(text)}</span>`
        : escapeHtml(text);
      return `<div${fit}${fitMore} style="${textCss(raw, ["width:100%", "height:100%"], after)}">${body}</div>`;
    }
    case "photo":
      return renderPhoto(layer, size, ctx);
    case "rows":
      return renderRows(layer, ctx);
    case "shape": {
      // A v2 shape paints its fill (a colour or gradient) in place of v1's background,
      // and nothing when it sets none (a frame line is a border on no fill); a v1
      // shape that sets nothing keeps the accent it always had.
      const v2 = ctx.formatVersion === 2;
      const fill = v2 ? shapeFillCss(layer.style) : null;
      const paint = fill ?? s.background ?? (v2 ? "transparent" : "var(--gold,#fbac27)");
      return `<div style="width:100%;height:100%;background:${paint};border-radius:${num(s.radius)}px"></div>`;
    }
    case "image": {
      // A template's image can be a field token (the club crest, the club's
      // ground photo), resolved from the club's own brand so no template holds
      // a fixed URL (KTD4).
      if (hasFieldTokens(layer.content)) {
        const src = substituteTokens(layer.content ?? "", {
          ...values,
          // v2 images bind any image token the page has (crests, sponsor logos).
          ...(ctx.formatVersion === 2 ? ctx.images : undefined),
          clubLogo: ctx.brand?.logoUrl ?? "",
          groundPhoto: ctx.brand?.groundPhotoUrl ?? "",
        }).trim();
        if (!src) return null;
        // The club's ground photo fills its box; a crest keeps its shape.
        const objectFit = /\{\{\s*groundPhoto\s*\}\}/.test(layer.content ?? "")
          ? "cover"
          : "contain";
        return `<img src="${escapeHtml(src)}" alt="" style="width:100%;height:100%;object-fit:${objectFit};display:block" />`;
      }
      // A library texture or pattern fills its box; another image keeps its shape.
      return layer.content
        ? `<img src="${escapeHtml(layer.content)}" alt="" style="width:100%;height:100%;object-fit:${layer.style?.radius || isBundledImage(layer.content) ? "cover" : "contain"};display:block${layer.style?.radius != null ? `;border-radius:${num(layer.style.radius)}px` : ""}" />`
        : "";
    }
    case "medal":
      return renderMedal(layer.content ?? "100", layer.sub);
    case "sticker":
      return renderSticker(layer.content ?? "Howzat!");
    case "chart":
      return layer.chart ? renderChart(layer.chart) : "";
    case "element":
      return layer.element
        ? renderElement(layer.element, {
            values,
            rows: ctx.rows ?? {},
            crestUrl: ctx.brand?.logoUrl ?? null,
            // Null on junior cards, so a frame bound to the card photo stays empty.
            photoUrl: ctx.photoUrl ?? null,
          })
        : "";
    case "vector":
    case "group":
      // Drawn by `renderFreeLayers` itself (v2 only): a group from its children, a vector from its SVG.
      return null;
  }
}

/** Whether a free-layer context has a value for a token: text, an image or rows. */
function hasToken(token: string, values: Record<string, string>, ctx: FreeLayerContext): boolean {
  if ((values[token] ?? "").trim()) return true;
  if (token === "clubLogo") return !!ctx.brand?.logoUrl;
  if (token === "groundPhoto") return !!ctx.brand?.groundPhotoUrl;
  if (token === PHOTO_TOKEN) return !!ctx.photoUrl && !(ctx.junior && !ctx.juniorPhotoAllowed);
  if ((ctx.images?.[token] ?? "").trim()) return true;
  const rows =
    ctx.rows && Object.prototype.hasOwnProperty.call(ctx.rows, token) ? ctx.rows[token] : null;
  return Array.isArray(rows) && rows.length > 0;
}

/**
 * The free-layer overlay for `size`: an absolutely positioned layer above the
 * template, each layer boxed in percent of the artboard. Returns "" when there
 * are no layers, so unadjusted cards are unchanged.
 *
 * Every document is read through `normaliseDocument` (format v2) and the
 * requested page drawn (`ctx.page`, default the kind's primary page, where a
 * v1 document's layers are). A v1 document draws exactly as it always has;
 * the drop rule, conditions, groups, vectors and v2 styles apply to v2
 * documents only, except that a layer carrying v2-only content (a library
 * element inserted into a v1 draft: a fill, a clip, a group) draws by v2's
 * styles wherever it is. A stored v1 document can't hold those, so its
 * renders are unchanged.
 */
export function renderFreeLayers(
  adj: CardAdjustments | null | undefined,
  size: CardSize,
  opts: { animate?: boolean } = {},
  /** Card field values, for live-bound text layers. */
  values: Record<string, string> = {},
  /** Club colours / crest / live rows for library elements. */
  ctx: FreeLayerContext = {},
): string {
  const kind = ctx.kind ?? "";
  const page = ctx.page ?? primaryPage(kind);
  const doc = normaliseDocument(adj, kind);
  const layers = documentPageLayers(doc, page);
  if (layers.length === 0) return "";
  const v2 = doc.sourceFormat === 2;
  const drawCtx: FreeLayerContext = {
    ...ctx,
    formatVersion: doc.sourceFormat,
    animate: opts.animate === true,
  };
  const v2Ctx: FreeLayerContext = { ...drawCtx, formatVersion: 2 };
  // What v2 styles read: the card's colours (an SVG filter needs real ones)
  // and the filter definitions the overlay carries.
  const tokens = ctx.tokens;
  const styleCtx: StyleContext = {
    colours: colourResolver(tokens, ctx.brand),
    ...(tokens ? { duotone: () => duotonePaletteFor(tokens, ctx.brand) } : {}),
    defs: new Map(),
  };
  // Library elements read the Club Kit palette, derived from the club's
  // brand; only an overlay that uses it gets the extra declarations.
  // Template styles may name the palette directly (`var(--ck-stage)`), with
  // or without an element on the card.
  const palette = paletteVars(doc, layers, ctx);
  const has = (token: string) => hasToken(token, values, ctx);
  // A sourced photo layer with its own photo is drawn even when the card has none.
  const hasLayerPhoto = (layer: TemplateLayerV2) =>
    !(ctx.junior && !ctx.juniorPhotoAllowed) && !!ctx.layerPhotos?.[photoLayerKey(layer)]?.url;
  const layout: LayoutContext = {
    kind,
    page,
    size,
    junior: ctx.junior === true,
    has,
    hasPhoto: has(PHOTO_TOKEN),
    hasSponsors: ["sponsor1", "sponsor2", "sponsor3", "sponsors"].some(has),
  };

  /**
   * One layer, positioned on the artboard; null when it isn't drawn on this
   * card. `depth` is how deep it sits in groups (1 = the page's own layer);
   * `inV2` is true inside a layer drawn by v2's styles.
   */
  const draw = (
    layer: TemplateLayerV2,
    depth: number,
    inV2 = false,
    /** The parent's size in pixels (the card, or the group the layer sits in). */
    parentPx: { w: number; h: number } = SIZES[size],
  ): DrawnLayer | null => {
    if (layer.hidden) return null;
    if (layer.sizes && !layer.sizes.includes(size)) return null;
    const box = resolveGeometry(layer.geometry, layer.editedAt, size);
    if (!box) return null;
    if (
      v2 &&
      (!layerShows(layer, layout) || layerDropped(layer, { kind, page, has, hasLayerPhoto }))
    )
      return null;
    // Its styles are v2's in a v2 document, or when it carries v2-only content.
    const styled = v2 || inV2 || layerNeedsV2(layer);
    let inner: string | null;
    if (layer.kind === "group") {
      // Groups nest to MAX_STACK_DEPTH; a deeper one isn't drawn.
      if (!groupDepthAllowed(depth)) return null;
      const children = (Array.isArray(layer.children) ? layer.children : [])
        .map((child) =>
          draw(child, depth + 1, styled, {
            w: (num(box.value.w) / 100) * parentPx.w,
            h: (num(box.value.h) / 100) * parentPx.h,
          }),
        )
        .filter((child): child is DrawnLayer => child !== null);
      inner = renderGroup(layer as GroupLayerV2, box.value, children, layout);
    } else if (layer.kind === "vector") {
      inner = renderVector(layer as VectorLayerV2, { tokens: ctx.tokens });
    } else {
      const layerCtx = styled ? v2Ctx : drawCtx;
      // A photo frame's own size, so a focus box crops to its shape.
      const photoCtx =
        layer.kind === "photo" && (ctx.photoFocus || ctx.layerPhotos)
          ? {
              ...layerCtx,
              framePx: {
                w: (num(box.value.w) / 100) * parentPx.w,
                h: (num(box.value.h) / 100) * parentPx.h,
              },
            }
          : layerCtx;
      inner = layerInner(layer as unknown as FreeLayer, values, photoCtx, size);
    }
    if (inner === null) return null;
    const { x, y, w, h, rotate } = box.value;
    // A v2 skew slants the layer after its rotation.
    const transform = [
      rotate ? `rotate(${num(rotate)}deg)` : "",
      styled ? skewCss(layer.style) : "",
    ]
      .filter(Boolean)
      .join(" ");
    let boxCss = styled ? layerBoxCss(layer, styleCtx) : [];
    // A grain or halftone texture sits over the layer's content (v2).
    if (styled) inner += overlayHtml(layer.style);
    // A clipped layer's glow is drawn round it: its box styles move to an inner wrapper.
    const glow = styled ? clippedGlowCss(layer) : null;
    if (glow) {
      inner = `<div style="position:absolute;inset:0;${boxCss.join(";")}">${inner}</div>`;
      boxCss = glow;
    }
    const style = [
      transform ? `transform:${transform}` : "",
      layer.style?.opacity != null ? `opacity:${num(layer.style.opacity, 1)}` : "",
      ...motionCss(layer.motion, opts.animate === true),
      ...boxCss,
    ].filter(Boolean);
    const css = [
      "position:absolute",
      `left:${num(x)}%`,
      `top:${num(y)}%`,
      `width:${num(w)}%`,
      `height:${num(h)}%`,
      ...style,
    ];
    const attrs = ` data-layer-id="${escapeHtml(layer.id)}"${box.inherited ? ` data-inherited-from="${escapeHtml(String(box.from))}"` : ""}`;
    const html = `<div${attrs} style="${css.join(";")}">${inner}</div>`;
    return { layer, box: box.value, attrs, style, inner, html };
  };

  const parts = layers.map((layer) => draw(layer, 1)?.html ?? "");
  const loops = v2 && hasLoops(flattenLayers(layers)) ? LOOP_KEYFRAMES : "";
  const style = opts.animate ? `<style>${MOTION_KEYFRAMES}${loops}</style>` : "";
  const defs = [...styleCtx.defs.values()].join("");
  return `<div class="pack-free-layers" style="position:absolute;inset:0;pointer-events:none;container-type:inline-size${palette}">${style}${defs}${parts.join("")}</div>`;
}
