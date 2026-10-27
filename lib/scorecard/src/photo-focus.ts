/**
 * Photo focus areas (decisions/product-manager/photo-focus-areas.md).
 *
 * A library photo can carry one focus box (the part that matters) and a box per
 * tagged player. Every photo frame on a card crops to keep the box in view:
 * `focusTransform` turns a box, the photo's shape and the frame's shape into the
 * focal point and zoom (`PhotoTransform`: focal 0–1, zoom) every renderer
 * already draws with, so the renderers change only where the default comes from.
 *
 * The renderers draw a photo with `object-fit: cover` at `object-position:
 * focal` and then scale it by `zoom` about that same point. Along one axis that
 * shows the window `[p(1 − w), p(1 − w) + w]` of the photo, where `p` is the
 * focal point and `w = v / zoom`, with `v` the share of the photo `cover`
 * leaves visible on that axis (1 on the axis that fits). The functions here
 * solve that for the box.
 */

/** A box on a photo, in fractions (0–1) of its width and height. */
export interface FocusBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A photo's focus box with the photo's own size, as a renderer needs it. */
export interface PhotoFocus {
  box: FocusBox;
  /** The photo's pixel size (only its shape matters). */
  width: number;
  height: number;
}

/** The focal point (0–1) and zoom a renderer draws a photo with. */
export interface FocusTransform {
  focalX: number;
  focalY: number;
  zoom: number;
}

/** The frame shapes an admin can turn off for a photo. */
export const FRAME_SHAPES = ["tall", "square", "wide"] as const;
export type FrameShape = (typeof FRAME_SHAPES)[number];

export function isFrameShape(v: unknown): v is FrameShape {
  return typeof v === "string" && (FRAME_SHAPES as readonly string[]).includes(v);
}

/** The shape a frame of this aspect ratio (width / height) counts as. */
export function frameShapeOf(aspect: number): FrameShape {
  if (aspect < 0.9) return "tall";
  if (aspect > 1.15) return "wide";
  return "square";
}

/** A representative aspect ratio per shape, for previews and suitability. */
export const FRAME_SHAPE_ASPECTS: Record<FrameShape, readonly number[]> = {
  tall: [4 / 5, 9 / 16],
  square: [1],
  wide: [16 / 9, 1200 / 630],
};

/** Room left round the box, as a share of the box, when it fits. */
export const FOCUS_MARGIN = 0.12;
/** The most a focus box zooms a photo in (a small face shouldn't fill a banner). */
export const FOCUS_ZOOM_MAX = 2.5;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** A box clamped to the photo, or null when it isn't a usable box. */
export function normaliseFocusBox(raw: unknown): FocusBox | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const nums = [r.x, r.y, r.w, r.h];
  if (!nums.every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  const x = clamp01(r.x as number);
  const y = clamp01(r.y as number);
  const w = Math.min(1 - x, Math.max(0, r.w as number));
  const h = Math.min(1 - y, Math.max(0, r.h as number));
  // Too small to mean anything (under 1% of the photo either way).
  if (w < 0.01 || h < 0.01) return null;
  const round = (v: number) => Math.round(v * 10000) / 10000;
  return { x: round(x), y: round(y), w: round(w), h: round(h) };
}

/** The share of the photo `object-fit: cover` shows on each axis in this frame. */
function coverVisible(photoAspect: number, frameAspect: number): { vx: number; vy: number } {
  // A photo wider than the frame overflows across; a taller one overflows down.
  return photoAspect > frameAspect
    ? { vx: frameAspect / photoAspect, vy: 1 }
    : { vx: 1, vy: photoAspect / frameAspect };
}

/** The focal point that centres a window of width `w` on `centre` (0–1). */
function focalFor(centre: number, w: number): number {
  if (w >= 1) return 0.5;
  return clamp01((centre - w / 2) / (1 - w));
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;

/**
 * The focal point and zoom that keep the whole box in view in a frame of
 * `frameAspect` (width / height), centred, with a little room, zoomed in as
 * far as the box allows (never past `FOCUS_ZOOM_MAX`, never below 1). When the
 * box can't fit the frame's shape it is centred at zoom 1 and its edges are
 * cut; `focusFit` says how much.
 */
export function focusTransform(focus: PhotoFocus, frameAspect: number): FocusTransform {
  const photoAspect = focus.width / focus.height;
  if (!(photoAspect > 0) || !(frameAspect > 0)) return { focalX: 0.5, focalY: 0.5, zoom: 1 };
  const { box } = focus;
  const { vx, vy } = coverVisible(photoAspect, frameAspect);
  const bw = Math.min(1, box.w * (1 + FOCUS_MARGIN * 2));
  const bh = Math.min(1, box.h * (1 + FOCUS_MARGIN * 2));
  const zoom = Math.max(1, Math.min(FOCUS_ZOOM_MAX, vx / bw, vy / bh));
  return {
    focalX: round3(focalFor(box.x + box.w / 2, vx / zoom)),
    focalY: round3(focalFor(box.y + box.h / 2, vy / zoom)),
    zoom: round3(zoom),
  };
}

/** How well a box suits a frame shape: in full, losing a little, or not at all. */
export type FocusFit = "good" | "tight" | "none";

/**
 * The share of the box a tight fit keeps, at least, on its worse axis. The
 * photo picker's SQL ranking (`draft-enrich.ts`) uses the same threshold.
 */
export const FOCUS_TIGHT_KEEP = 0.8;

/** How well the box suits a frame of `frameAspect` (no margin counted). */
export function focusFit(focus: PhotoFocus, frameAspect: number): FocusFit {
  const photoAspect = focus.width / focus.height;
  if (!(photoAspect > 0) || !(frameAspect > 0)) return "good";
  const { vx, vy } = coverVisible(photoAspect, frameAspect);
  // The share of the box the frame keeps on its tighter axis at zoom 1.
  const kept = Math.min(1, vx / focus.box.w, vy / focus.box.h);
  if (kept >= 0.999) return "good";
  return kept >= FOCUS_TIGHT_KEEP ? "tight" : "none";
}

/** A box's fit for a shape: the worst over the shape's representative frames. */
export function shapeFit(focus: PhotoFocus, shape: FrameShape): FocusFit {
  const order: FocusFit[] = ["good", "tight", "none"];
  let worst: FocusFit = "good";
  for (const aspect of FRAME_SHAPE_ASPECTS[shape]) {
    const fit = focusFit(focus, aspect);
    if (order.indexOf(fit) > order.indexOf(worst)) worst = fit;
  }
  return worst;
}

/**
 * How well a photo suits a frame shape, from its focus box and the shapes the
 * admin switched off: "none" when switched off, else the box's fit, and
 * "good" when there is no box (a centred crop, as today).
 */
export function photoShapeFit(
  photo: {
    width: number;
    height: number;
    focusBox: FocusBox | null;
    offShapes?: readonly string[];
  },
  shape: FrameShape,
): FocusFit {
  if (photo.offShapes?.includes(shape)) return "none";
  if (!photo.focusBox) return "good";
  return shapeFit({ box: photo.focusBox, width: photo.width, height: photo.height }, shape);
}
