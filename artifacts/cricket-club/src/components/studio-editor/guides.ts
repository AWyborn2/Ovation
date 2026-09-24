/**
 * Smart guides and rotation snapping for the editor canvas (Social Studio
 * U16). Everything is in percent of the artboard.
 */
import type { LayerBox } from "@/lib/pack-render";

export const SNAP_THRESHOLD = 0.8;
export const ROTATE_SNAP_DEGREES = 5;

export type Guide = { axis: "x" | "y"; at: number };

type Rect = Pick<LayerBox, "x" | "y" | "w" | "h">;

const xStops = (r: Rect) => [r.x, r.x + r.w / 2, r.x + r.w];
const yStops = (r: Rect) => [r.y, r.y + r.h / 2, r.y + r.h];

function snapAxis(moving: number[], targets: number[]): { delta: number; at: number } | null {
  let best: { delta: number; at: number } | null = null;
  for (const m of moving) {
    for (const t of targets) {
      const d = t - m;
      if (Math.abs(d) <= SNAP_THRESHOLD && (!best || Math.abs(d) < Math.abs(best.delta))) {
        best = { delta: d, at: t };
      }
    }
  }
  return best;
}

/**
 * Snap a moving box's left/centre/right (and top/middle/bottom) to the page
 * centre and edges, and to other boxes' edges and centres, within 0.8%.
 * Returns the adjusted position and the guide lines to draw.
 */
export function snapMove(box: Rect, others: Rect[]): { x: number; y: number; guides: Guide[] } {
  const xTargets = [0, 50, 100, ...others.flatMap(xStops)];
  const yTargets = [0, 50, 100, ...others.flatMap(yStops)];
  const sx = snapAxis(xStops(box), xTargets);
  const sy = snapAxis(yStops(box), yTargets);
  const guides: Guide[] = [];
  if (sx) guides.push({ axis: "x", at: sx.at });
  if (sy) guides.push({ axis: "y", at: sy.at });
  return { x: box.x + (sx?.delta ?? 0), y: box.y + (sy?.delta ?? 0), guides };
}

/** Snap a rotation to 0, ±90 and 180 degrees when within 5°. */
export function snapRotation(deg: number): number {
  const norm = ((((deg + 180) % 360) + 360) % 360) - 180;
  for (const target of [0, 90, -90, 180, -180]) {
    if (Math.abs(norm - target) <= ROTATE_SNAP_DEGREES) return target === -180 ? 180 : target;
  }
  return Math.round(norm * 10) / 10;
}

/** The bounding box of several boxes. */
export function boundsOf(boxes: Rect[]): Rect {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const r = Math.max(...boxes.map((b) => b.x + b.w));
  const bt = Math.max(...boxes.map((b) => b.y + b.h));
  return { x, y, w: r - x, h: bt - y };
}
