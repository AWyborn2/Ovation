/**
 * Library elements (editable-elements plan, Stream D): reusable decorations
 * shared by every club, in the shared `library_elements` table.
 *
 * An element's document is a fragment of format v2 layers, not a template:
 * `{ formatVersion: 2, layers, palettes? }`. Its layers keep the geometry they
 * had on the card they came from, per size, so a frame or a band lands where
 * it was designed to sit. Inserting copies them into the card as native layers
 * (E2); nothing links back to the element afterwards. `elementDocumentErrors`
 * (validate.ts) checks a fragment.
 */
import type { DerivedPalette, TemplateLayerV2 } from "./format";

/** The Elements panel's categories, in the panel's order. */
export const ELEMENT_CATEGORIES = [
  "frames",
  "bands",
  "badges",
  "rules",
  "glows",
  "crest-frames",
  "sponsor-strips",
  "data-blocks",
] as const;
export type ElementCategory = (typeof ELEMENT_CATEGORIES)[number];

export const ELEMENT_CATEGORY_LABELS: Record<ElementCategory, string> = {
  frames: "Frames",
  bands: "Bands and slashes",
  badges: "Badges and chips",
  rules: "Rules and dividers",
  glows: "Glows and textures",
  "crest-frames": "Crest frames",
  "sponsor-strips": "Sponsor strips",
  "data-blocks": "Data blocks",
};

export const isElementCategory = (v: unknown): v is ElementCategory =>
  (ELEMENT_CATEGORIES as readonly unknown[]).includes(v);

/** A library element's layers: a fragment of a v2 page. */
export type ElementDocument = {
  formatVersion: 2;
  layers: TemplateLayerV2[];
  /** The derived palettes the layers' colours use, as on a template. */
  palettes?: DerivedPalette[];
};

/** At most this many layers (children included) in one element. */
export const MAX_ELEMENT_LAYERS = 120;

/** An element's name and tags are short labels. */
export const MAX_ELEMENT_NAME = 60;
export const MAX_ELEMENT_TAGS = 12;
export const MAX_ELEMENT_TAG = 24;

/** Below this, an element draws too faintly to see (a 35%-opacity hairline, a clear box). */
export const MIN_ELEMENT_PAINT = 0.2;

/** How opaque a colour is, 0–1: a token counts as solid, `transparent` as none. */
export function colourAlpha(colour: unknown): number {
  if (typeof colour !== "string") return 0;
  const c = colour.trim().toLowerCase();
  if (!c || c === "transparent" || c === "none") return 0;
  const hex = /^#([0-9a-f]{3,8})$/.exec(c)?.[1];
  if (hex) {
    if (hex.length === 8) return parseInt(hex.slice(6), 16) / 255;
    if (hex.length === 4) return parseInt(hex[3]! + hex[3]!, 16) / 255;
    return 1;
  }
  const rgba = /^(?:rgba|hsla)\(.*,\s*([\d.]+%?)\s*\)$/.exec(c)?.[1];
  if (rgba) return rgba.endsWith("%") ? parseFloat(rgba) / 100 : parseFloat(rgba);
  return 1;
}

/** The most opaque a fill paints: a colour, a gradient's strongest stop, or CSS gradient text. */
function fillAlpha(fill: unknown): number {
  if (typeof fill === "string") {
    if (!/gradient\(/i.test(fill)) return colourAlpha(fill);
    const stops = [
      ...fill.matchAll(/(#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|var\([^)]*\)|transparent)/gi),
    ];
    return stops.length ? Math.max(...stops.map((m) => colourAlpha(m[1]))) : 1;
  }
  if (fill && typeof fill === "object" && Array.isArray((fill as { stops?: unknown }).stops))
    return Math.max(
      0,
      ...(fill as { stops: Array<{ color?: unknown }> }).stops.map((s) => colourAlpha(s.color)),
    );
  return 0;
}

type PaintLayer = {
  kind?: string;
  content?: unknown;
  svg?: unknown;
  hidden?: boolean;
  style?: Record<string, unknown>;
  children?: PaintLayer[];
};

/**
 * How strongly an element's layers paint, 0–1: the most visible thing it
 * draws, scaled by its opacity. Text, pictures and photo slots count fully; a
 * border counts by its colour and width (a hairline barely); a shadow or a
 * texture counts half. An element under {@link MIN_ELEMENT_PAINT} draws
 * nothing you'd see.
 */
export function paintStrength(layers: readonly unknown[], opacity = 1): number {
  let best = 0;
  for (const raw of layers as PaintLayer[]) {
    if (!raw || raw.hidden) continue;
    const s = raw.style ?? {};
    const own = typeof s.opacity === "number" ? s.opacity : 1;
    const o = opacity * own;
    let paint = 0;
    if (raw.kind === "text") paint = typeof raw.content === "string" && raw.content.trim() ? 1 : 0;
    else if (raw.kind === "image" || raw.kind === "photo" || raw.kind === "rows") paint = 1;
    else if (raw.kind === "vector")
      paint = typeof raw.svg === "string" && /(fill|stroke)="(?!none)/i.test(raw.svg) ? 1 : 0.5;
    paint = Math.max(paint, fillAlpha(s.fill ?? s.background), fillAlpha(s.textFill));
    const border = s.border as { width?: number; color?: unknown } | undefined;
    if (border && typeof border.width === "number")
      paint = Math.max(paint, colourAlpha(border.color) * Math.min(1, border.width / 0.3));
    if (Array.isArray(s.boxShadow) && s.boxShadow.length > 0) paint = Math.max(paint, 0.5);
    if (s.overlay) paint = Math.max(paint, 0.5);
    best = Math.max(best, paint * o);
    if (raw.children) best = Math.max(best, paintStrength(raw.children, o));
  }
  return Math.min(1, best);
}
