/**
 * Edits to a layer's clip polygon (`style.clip`) for the clip editor (B2):
 * the preset shapes the looks use (slash, chevron, band, cut corner), each
 * with an amount and flippable, and point-by-point edits within the format's
 * limits (3 to `MAX_CLIP_POINTS` points, each −100–200 % of the box).
 */
import { MAX_CLIP_POINTS, type TemplateClip } from "@workspace/scorecard/kind-templates";

export type ClipPoint = [number, number];
export type ClipPolygon = ClipPoint[];

export const CLIP_PRESETS = ["slash", "chevron", "band", "corner"] as const;
export type ClipPreset = (typeof CLIP_PRESETS)[number];

export const CLIP_PRESET_LABEL: Record<ClipPreset, string> = {
  slash: "Slash",
  chevron: "Chevron",
  band: "Angled band",
  corner: "Cut corner",
};

/** Each preset's amount when first picked, in percent of the box. */
export const CLIP_PRESET_AMOUNT: Record<ClipPreset, number> = {
  slash: 20,
  chevron: 15,
  band: 15,
  corner: 15,
};

/** The box itself: where a custom shape starts. */
export const RECTANGLE: ClipPolygon = [
  [0, 0],
  [100, 0],
  [100, 100],
  [0, 100],
];

const round = (n: number) => Math.round(n * 100) / 100;
const clampPoint = (n: number) => round(Math.min(200, Math.max(-100, n)));

/** A preset's polygon at an amount (0–50 % of the box). */
export function presetPolygon(preset: ClipPreset, amount: number): ClipPolygon {
  const a = round(Math.min(50, Math.max(0, amount)));
  switch (preset) {
    // Leaning right, as "/" does: Broadcast's slashes.
    case "slash":
      return [
        [a, 0],
        [100, 0],
        [round(100 - a), 100],
        [0, 100],
      ];
    // Pointing right, notched on the left.
    case "chevron":
      return [
        [0, 0],
        [round(100 - a), 0],
        [100, 50],
        [round(100 - a), 100],
        [0, 100],
        [a, 50],
      ];
    // Top and bottom edges rising to the right.
    case "band":
      return [
        [0, a],
        [100, 0],
        [100, round(100 - a)],
        [0, 100],
      ];
    case "corner":
      return [
        [0, 0],
        [round(100 - a), 0],
        [100, a],
        [100, 100],
        [0, 100],
      ];
  }
}

/** The polygon mirrored left to right. */
export function flipX(polygon: ClipPolygon): ClipPolygon {
  return polygon.map(([x, y]) => [round(100 - x), y]);
}

/** Where each preset's amount can be read back from its polygon. */
const AMOUNT_AT: Record<ClipPreset, (p: ClipPolygon) => number | undefined> = {
  slash: (p) => p[0]?.[0],
  chevron: (p) => p[5]?.[0],
  band: (p) => p[0]?.[1],
  corner: (p) => p[2]?.[1],
};

const same = (a: ClipPolygon, b: ClipPolygon) =>
  a.length === b.length &&
  a.every(([x, y], i) => Math.abs(x - b[i]![0]) < 0.01 && Math.abs(y - b[i]![1]) < 0.01);

/**
 * The preset a polygon is (at what amount, flipped or not), or null for a
 * custom shape. At amount 0 a preset is the box itself, which is custom.
 */
export function presetOf(
  polygon: ClipPolygon,
): { preset: ClipPreset; amount: number; flipped: boolean } | null {
  for (const flipped of [false, true]) {
    const p = flipped ? flipX(polygon) : polygon;
    for (const preset of CLIP_PRESETS) {
      const amount = AMOUNT_AT[preset](p);
      if (amount === undefined || amount <= 0 || amount > 50) continue;
      if (same(p, presetPolygon(preset, amount))) return { preset, amount, flipped };
    }
  }
  return null;
}

/** A clip's points, or null when it isn't a polygon of numbers. */
export function clipPolygon(clip: TemplateClip | undefined): ClipPolygon | null {
  const points = clip?.polygon;
  if (!Array.isArray(points)) return null;
  const out: ClipPolygon = [];
  for (const p of points) {
    if (!Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return null;
    out.push([p[0], p[1]]);
  }
  return out;
}

/** A new point halfway along the edge after point `after`; no change at the most points. */
export function addPoint(polygon: ClipPolygon, after: number): ClipPolygon {
  if (polygon.length >= MAX_CLIP_POINTS || !polygon[after]) return polygon;
  const [x1, y1] = polygon[after]!;
  const [x2, y2] = polygon[(after + 1) % polygon.length]!;
  const mid: ClipPoint = [round((x1 + x2) / 2), round((y1 + y2) / 2)];
  return [...polygon.slice(0, after + 1), mid, ...polygon.slice(after + 1)];
}

/** The polygon without one point; no change at three. */
export function removePoint(polygon: ClipPolygon, index: number): ClipPolygon {
  if (polygon.length <= 3 || !polygon[index]) return polygon;
  return polygon.filter((_, i) => i !== index);
}

/** One point moved, kept within −100–200 % of the box. */
export function movePoint(polygon: ClipPolygon, index: number, to: ClipPoint): ClipPolygon {
  if (!polygon[index]) return polygon;
  return polygon.map((p, i) => (i === index ? [clampPoint(to[0]), clampPoint(to[1])] : p));
}
