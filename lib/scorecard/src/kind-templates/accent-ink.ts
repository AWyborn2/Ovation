/**
 * Where `--accent-ink` belongs (Halls Head, Oct 2026): it is the readable
 * colour for type set ON the club's accent, near-black on a light accent
 * (Halls Head's gold) and white on a dark one (`accentInk` in the web
 * renderer). Text in it must sit on a chip: a filled shape under the text, not
 * the page's dark base, or a light-accent club gets near-black on near-black.
 */
import type { LayerBox, TemplateSize } from "./document";
import type { TemplateLayerV2 } from "./format";

/** The page's own dark base colours: accent ink on these is unreadable. */
const BASE = /var\(--(?:ink|panel|panel-2|dt-ink[\w-]*)\)/;

const fillOf = (l: TemplateLayerV2): unknown => {
  const s = (l.style ?? {}) as Record<string, unknown>;
  return s.fill ?? s.background;
};

/** Whether a fill paints something: a gradient, or a colour that isn't see-through. */
function paints(fill: unknown): boolean {
  if (fill && typeof fill === "object") return true;
  if (typeof fill !== "string" || !fill.trim() || fill === "transparent") return false;
  const alpha = /^#[0-9a-f]{6}([0-9a-f]{2})$/i.exec(fill.trim());
  return !alpha || parseInt(alpha[1]!, 16) >= 0x80;
}

/** A shape or group that paints its box on `size`, else null. */
function paintedBox(l: TemplateLayerV2, size: TemplateSize): LayerBox | null {
  if (l.kind !== "shape" && l.kind !== "group") return null;
  if (l.hidden || (l.sizes && !l.sizes.includes(size))) return null;
  const g = l.geometry[size];
  if (!g) return null;
  const opacity = (l.style as { opacity?: number } | undefined)?.opacity;
  if (typeof opacity === "number" && opacity < 0.5) return null;
  return paints(fillOf(l)) ? g : null;
}

/** A solid colour of a chip's own: the accent, or a literal opaque colour. */
const chipColour = (c: unknown) =>
  typeof c === "string" && (c.includes("--gold") || /^#[0-9a-f]{6}(?:[89a-f][0-9a-f])?$/i.test(c));

/**
 * A chip: painted, not in one of the page's dark base colours; a gradient
 * only when a stop is a chip colour (a dark scrim over the photo isn't one).
 */
const isChip = (l: TemplateLayerV2) => {
  const fill = fillOf(l);
  if (fill && typeof fill === "object") {
    const stops = (fill as { stops?: Array<{ color?: unknown }> }).stops ?? [];
    return stops.some((st) => chipColour(st.color));
  }
  return !(typeof fill === "string" && BASE.test(fill));
};

/** Whether a layer's painted area holds a point: its box, inside its clip polygon if it has one. */
function covers(l: TemplateLayerV2, g: LayerBox, x: number, y: number): boolean {
  if (!(g.x <= x && x <= g.x + g.w && g.y <= y && y <= g.y + g.h)) return false;
  const poly = (l.style as { clip?: { polygon?: Array<[number, number]> } } | undefined)?.clip
    ?.polygon;
  if (!poly || poly.length < 3) return true;
  // The polygon is in percent of the layer's box.
  const px = ((x - g.x) / g.w) * 100;
  const py = ((y - g.y) / g.h) * 100;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const holds = (g: LayerBox, x: number, y: number) =>
  g.x <= x && x <= g.x + g.w && g.y <= y && y <= g.y + g.h;

/**
 * Whether `text` sits on a chip on `size`: the topmost painted shape drawn
 * before it under its centre is the accent (or a chip's own colour), not the
 * dark base. If not, `partly` is the chip it overlaps most in its own row
 * (text that ran past its plate), else null.
 */
export function accentInkChip(
  layers: readonly TemplateLayerV2[],
  text: TemplateLayerV2,
  size: TemplateSize,
  /** The card with (true) or without (false) its photo; shapes shown only in the other state don't count. */
  photo?: boolean,
): { on: boolean; partly: LayerBox | null } {
  const t = text.geometry[size];
  if (!t) return { on: true, partly: null };
  // Where the glyphs are sure to be: the start of left-aligned text, the end
  // of right-aligned text, the middle of centred text.
  const align = (text.style as { align?: string } | undefined)?.align;
  const cx = align === "left" ? t.x + 1 : align === "right" ? t.x + t.w - 1 : t.x + t.w / 2;
  const cy = t.y + t.h / 2;
  const before = layers
    .slice(0, Math.max(0, layers.indexOf(text)))
    .filter(
      (l) => photo === undefined || l.showWhen?.photo === undefined || l.showWhen.photo === photo,
    );
  let top: TemplateLayerV2 | null = null;
  for (const l of before) {
    const g = paintedBox(l, size);
    if (g && covers(l, g, cx, cy)) top = l;
  }
  const on = !!top && isChip(top);
  let partly: LayerBox | null = null;
  let best = 0;
  for (const l of before) {
    const g = paintedBox(l, size);
    if (!g || !isChip(l) || g.w > 80 || holds(g, cx, cy)) continue;
    const w = Math.min(t.x + t.w, g.x + g.w) - Math.max(t.x, g.x);
    const h = Math.min(t.y + t.h, g.y + g.h) - Math.max(t.y, g.y);
    // In its row: the chip holds the text's middle line.
    if (w > 0 && h > 0 && g.y <= cy && cy <= g.y + g.h && w * h > best) {
      best = w * h;
      partly = g;
    }
  }
  return { on, partly: on ? null : partly };
}

/**
 * A hashtag on a gold plate whose box has been widened past the plate (Club
 * Kit's sponsors page): the plate in its row, when the text runs more than a
 * little past it, else null.
 */
export function hashtagPastPlate(
  layers: readonly TemplateLayerV2[],
  text: TemplateLayerV2,
  size: TemplateSize,
): LayerBox | null {
  const t = text.geometry[size];
  const content = "content" in text ? String(text.content ?? "") : "";
  if (!t || !/\{\{(?:clubHashtag|hashtags)\}\}/.test(content)) return null;
  const cy = t.y + t.h / 2;
  for (const l of layers) {
    const g = paintedBox(l, size);
    const fill = fillOf(l);
    if (!g || l === text || typeof fill !== "string" || !fill.includes("--gold") || g.w > 80)
      continue;
    const across = Math.min(t.x + t.w, g.x + g.w) - Math.max(t.x, g.x);
    if (across > 0 && g.y <= cy && cy <= g.y + g.h && (t.x < g.x - 1 || t.x + t.w > g.x + g.w + 1))
      return g;
  }
  return null;
}

/**
 * The photo states `text` can show in: its own condition, else both. A
 * layer under it shown only with (or only without) the photo can make it sit
 * on a chip in one state and on the dark base in the other.
 */
export function photoStates(text: TemplateLayerV2): boolean[] {
  const own = text.showWhen?.photo;
  return own === undefined ? [true, false] : [own];
}
