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

import type { CardSize } from "../share-card";
import { escapeHtml } from "./html-utils";
import { renderChart, renderMedal, renderSticker, type ChartSpec } from "./layer-kinds";

export type PhotoAdjust = { focalX: number; focalY: number; zoom: number };

/** A free layer's box, in percent of the artboard; rotation in degrees. */
export type LayerBox = { x: number; y: number; w: number; h: number; rotate?: number };

export type LayerAnimation = {
  kind: "none" | "rise" | "fade" | "pop";
  delayMs?: number;
};

export type FreeLayerKind = "text" | "shape" | "image" | "medal" | "sticker" | "chart";

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
  style?: {
    color?: string;
    background?: string;
    fontFamily?: string;
    /** Font size in percent of the artboard width. */
    fontSize?: number;
    fontWeight?: number;
    align?: "left" | "center" | "right";
    radius?: number;
    opacity?: number;
  };
  animation?: LayerAnimation;
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
};

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

/** True when the adjustments change nothing, so the render stays byte-identical. */
export function isEmptyAdjustments(adj: CardAdjustments | null | undefined): boolean {
  if (!adj) return true;
  return (
    Object.keys(adj.fields ?? {}).length === 0 &&
    (adj.hidden ?? []).length === 0 &&
    Object.keys(adj.photo ?? {}).length === 0 &&
    Object.keys(adj.images ?? {}).length === 0 &&
    (adj.layers ?? []).length === 0
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

const ANIMATION: Record<LayerAnimation["kind"], string | null> = {
  none: null,
  rise: "packLayerRise .7s cubic-bezier(.2,.8,.2,1) both",
  fade: "packLayerFade .6s ease-out both",
  pop: "packLayerPop .5s cubic-bezier(.2,1.4,.4,1) both",
};

/** CSS a card needs for free-layer animations (inlined so exports carry it). */
export const LAYER_KEYFRAMES =
  "@keyframes packLayerRise{from{opacity:0;transform:translateY(8%)}to{opacity:1;transform:none}}" +
  "@keyframes packLayerFade{from{opacity:0}to{opacity:1}}" +
  "@keyframes packLayerPop{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:none}}";

/** A style value safe to place inside a style attribute. */
const cssValue = (v: string | undefined): string | undefined =>
  v == null ? undefined : v.replace(/[";<>{}]/g, "");

function layerInner(layer: FreeLayer, values: Record<string, string>): string {
  const raw = layer.style ?? {};
  const s = {
    ...raw,
    color: cssValue(raw.color),
    background: cssValue(raw.background),
    fontFamily: cssValue(raw.fontFamily),
  };
  switch (layer.kind) {
    case "text": {
      const css = [
        "width:100%",
        "height:100%",
        "display:flex",
        "align-items:center",
        `justify-content:${s.align === "left" ? "flex-start" : s.align === "right" ? "flex-end" : "center"}`,
        `text-align:${s.align ?? "center"}`,
        `color:${s.color ?? "inherit"}`,
        `font-family:${s.fontFamily ?? "var(--disp,'Anton'),sans-serif"}`,
        `font-size:${(s.fontSize ?? 5).toFixed(2)}cqw`,
        `font-weight:${s.fontWeight ?? 700}`,
        "line-height:1.05",
        "white-space:pre-wrap",
        s.background ? `background:${s.background}` : "",
        s.radius != null ? `border-radius:${s.radius}px` : "",
      ].filter(Boolean);
      const text = layer.bind ? (values[layer.bind] ?? "") : (layer.content ?? "");
      return `<div style="${css.join(";")}">${escapeHtml(text)}</div>`;
    }
    case "shape":
      return `<div style="width:100%;height:100%;background:${s.background ?? "var(--gold,#fbac27)"};border-radius:${s.radius ?? 0}px"></div>`;
    case "image":
      return layer.content
        ? `<img src="${escapeHtml(layer.content)}" alt="" style="width:100%;height:100%;object-fit:${layer.style?.radius ? "cover" : "contain"};display:block${layer.style?.radius != null ? `;border-radius:${layer.style.radius}px` : ""}" />`
        : "";
    case "medal":
      return renderMedal(layer.content ?? "100", layer.sub);
    case "sticker":
      return renderSticker(layer.content ?? "Howzat!");
    case "chart":
      return layer.chart ? renderChart(layer.chart) : "";
  }
}

/**
 * The free-layer overlay for `size`: an absolutely positioned layer above the
 * template, each layer boxed in percent of the artboard. Returns "" when there
 * are no layers, so unadjusted cards are unchanged.
 */
export function renderFreeLayers(
  adj: CardAdjustments | null | undefined,
  size: CardSize,
  opts: { animate?: boolean } = {},
  /** Card field values, for live-bound text layers. */
  values: Record<string, string> = {},
): string {
  const layers = adj?.layers ?? [];
  if (layers.length === 0) return "";
  const parts = layers.map((layer) => {
    if (layer.hidden) return "";
    const box = resolveGeometry(layer.geometry, layer.editedAt, size);
    if (!box) return "";
    const { x, y, w, h, rotate } = box.value;
    const anim = opts.animate ? ANIMATION[layer.animation?.kind ?? "none"] : null;
    const css = [
      "position:absolute",
      `left:${x}%`,
      `top:${y}%`,
      `width:${w}%`,
      `height:${h}%`,
      rotate ? `transform:rotate(${rotate}deg)` : "",
      layer.style?.opacity != null ? `opacity:${layer.style.opacity}` : "",
      anim ? `animation:${anim}` : "",
      anim && layer.animation?.delayMs ? `animation-delay:${layer.animation.delayMs}ms` : "",
    ].filter(Boolean);
    return `<div data-layer-id="${escapeHtml(layer.id)}"${box.inherited ? ` data-inherited-from="${box.from}"` : ""} style="${css.join(";")}">${layerInner(layer, values)}</div>`;
  });
  const style = opts.animate ? `<style>${LAYER_KEYFRAMES}</style>` : "";
  return `<div class="pack-free-layers" style="position:absolute;inset:0;pointer-events:none;container-type:inline-size">${style}${parts.join("")}</div>`;
}
