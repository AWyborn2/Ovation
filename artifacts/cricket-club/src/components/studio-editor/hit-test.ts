/**
 * What a click on the canvas picks (editor layout fixes, Nov 2026).
 *
 * The overlay under the pointer is only where the search starts. From there:
 *
 * - The page's base (a full-bleed shape, image or vector at the bottom of the
 *   stack, one named as the background, or full-bleed shading such as a
 *   whole-card scrim, wherever it sits) is the page itself: a click on it
 *   opens Edit page, never the shape. The shape stays reachable from Layers.
 * - A decorative layer over a photo (a scrim, gradient or shading, a
 *   `showWhen: photo` panel, a see-through or full-size shape over it) doesn't
 *   take the first click: the photo under it does. A second click on the same
 *   spot cycles down the stack, so the overlay is still reachable on the
 *   canvas as well as from Layers.
 *
 * Boxes are in percent of the artboard, as the canvas places its overlays.
 */
import type { FreeLayer, LayerBox } from "@/lib/pack-render";

export type Point = { x: number; y: number };

/** Box edges within this much (percent) of the artboard's count as full-bleed. */
const BLEED = 0.5;
/** An overlay covering this share of a photo's box counts as full-size over it. */
const COVERS = 0.9;

const BACKGROUND_NAME = /^\s*(page\s+)?(background|backdrop|bg)\b/i;
const DECORATIVE_NAME =
  /scrim|shad(e|ing|ow)|gradient|overlay|tint|fade|vignette|glow|wash|darken|lighten/i;

/** Kinds that can be a page base or a decorative overlay: never text, a photo, a list or a group. */
const PLAIN_KINDS = new Set<FreeLayer["kind"]>(["shape", "vector", "image"]);

/** Whether a box (any rotation ignored) covers the whole artboard. */
export function isFullBleed(b: LayerBox | null | undefined): boolean {
  return (
    !!b && b.x <= BLEED && b.y <= BLEED && b.x + b.w >= 100 - BLEED && b.y + b.h >= 100 - BLEED
  );
}

/** Whether a point is inside a box, rotation included. */
export function boxContains(b: LayerBox, p: Point): boolean {
  let { x, y } = p;
  if (b.rotate) {
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const a = (-b.rotate * Math.PI) / 180;
    const dx = x - cx;
    const dy = y - cy;
    x = cx + dx * Math.cos(a) - dy * Math.sin(a);
    y = cy + dx * Math.sin(a) + dy * Math.cos(a);
  }
  return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
}

type BoxFn = (l: FreeLayer) => LayerBox | null;

/**
 * The page's base layers: the run of full-bleed plain layers at the bottom of
 * the stack (`layers` bottom first, as they draw), any plain layer named as
 * the background, and any full-bleed shading wherever it sits (a whole-card
 * scrim over the photo, as Broadcast Dark's team page has): a click on it
 * off the photo is a click on the page, and on the photo picks the photo.
 */
export function pageBackgroundIds(layers: readonly FreeLayer[], box: BoxFn): Set<string> {
  const ids = new Set<string>();
  let run = true;
  for (const l of layers) {
    const plain = PLAIN_KINDS.has(l.kind);
    const bleed = plain && isFullBleed(box(l));
    if (run && bleed) ids.add(l.id);
    else run = false;
    if (plain && l.name && BACKGROUND_NAME.test(l.name)) ids.add(l.id);
    if (bleed && looksDecorative(l)) ids.add(l.id);
  }
  return ids;
}

type Styled = FreeLayer & {
  style?: { opacity?: unknown; fill?: unknown; background?: unknown };
  showWhen?: { photo?: boolean };
};

const isGradient = (v: unknown): boolean =>
  (typeof v === "string" && /gradient\(/i.test(v)) ||
  (!!v && typeof v === "object" && "stops" in (v as object));

/** How much of `photo`'s box `over` covers, 0–1. */
function coverage(over: LayerBox, photo: LayerBox): number {
  const w = Math.min(over.x + over.w, photo.x + photo.w) - Math.max(over.x, photo.x);
  const h = Math.min(over.y + over.h, photo.y + photo.h) - Math.max(over.y, photo.y);
  const area = photo.w * photo.h;
  return w > 0 && h > 0 && area > 0 ? (w * h) / area : 0;
}

/**
 * Whether a layer over a photo is decoration for it (so the photo takes the
 * first click): a plain layer named as shading (scrim, gradient, overlay,
 * tint…), drawn only with a photo (`showWhen: { photo: true }`), filled with
 * a gradient, see-through, or covering (nearly) all of the photo's box.
 */
export function isDecorativeOver(
  layer: FreeLayer,
  layerBox: LayerBox | null,
  photoBox: LayerBox | null,
): boolean {
  if (!PLAIN_KINDS.has(layer.kind)) return false;
  if (looksDecorative(layer)) return true;
  return !!layerBox && !!photoBox && coverage(layerBox, photoBox) >= COVERS;
}

/**
 * Shading by its look alone: a plain layer named as shading, drawn only with
 * a photo, filled with a gradient, or see-through.
 */
function looksDecorative(layer: FreeLayer): boolean {
  if (!PLAIN_KINDS.has(layer.kind)) return false;
  const l = layer as Styled;
  if (l.name && DECORATIVE_NAME.test(l.name)) return true;
  if (l.showWhen?.photo === true) return true;
  const style = l.style ?? {};
  if (isGradient(style.fill) || isGradient(style.background)) return true;
  return typeof style.opacity === "number" && style.opacity < 1;
}

/**
 * The layers a click at `p` can pick, in the order clicks take them: the
 * first is what a first click selects, and a repeat click on the same spot
 * moves to the next. `hit` is the overlay the pointer landed on (the
 * top-most there); layers above it are left out, as are locked layers and
 * (with `backgrounds`) the page's base. Empty: the click is on the page.
 *
 * Decorative layers above the top-most photo at the point go after it, so
 * the photo comes first and its overlays follow it in stack order.
 */
export function clickOrder(
  layers: readonly FreeLayer[],
  box: BoxFn,
  hit: string,
  p: Point,
  { backgrounds = true }: { backgrounds?: boolean } = {},
): string[] {
  const base = backgrounds ? pageBackgroundIds(layers, box) : new Set<string>();
  const top = layers.findIndex((l) => l.id === hit);
  if (top < 0) return [];
  const stack: FreeLayer[] = [];
  for (let i = top; i >= 0; i--) {
    const l = layers[i]!;
    if (l.locked || base.has(l.id)) continue;
    const b = box(l);
    if (l.id === hit || (b && boxContains(b, p))) stack.push(l);
  }
  const photoAt = stack.findIndex((l) => l.kind === "photo");
  if (photoAt <= 0) return stack.map((l) => l.id);
  const photo = stack[photoAt]!;
  const photoBox = box(photo);
  const order: string[] = [];
  const later: string[] = [];
  stack.forEach((l, i) => {
    if (i < photoAt && isDecorativeOver(l, box(l), photoBox)) later.push(l.id);
    else order.push(l.id);
    if (l === photo) order.push(...later.splice(0));
  });
  return order;
}
