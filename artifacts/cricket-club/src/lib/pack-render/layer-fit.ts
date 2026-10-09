/**
 * Shrink-to-fit for card kind templates (plan KTD9, U2): live text that
 * doesn't fit its box steps its font size down to `MIN_TEXT_FIT` of its
 * designed size; if it still doesn't fit, the card gets an overflow warning
 * instead of being cut off silently.
 *
 * The step-down loop is pure and takes an injected `overflows` check, so it
 * is unit-tested without layout (jsdom does none). `fitLayersInDom` is the
 * thin browser adapter used by the render harness and the editor.
 */
import { MIN_TEXT_FIT, type LayoutWarning } from "@workspace/scorecard/kind-templates";
import type { CardSize } from "../share-card";

/** One fittable text element: its designed size and how to apply a scale. */
export interface FitTarget {
  /** Designed font size (any unit; only the ratio matters). */
  base: number;
  apply(scale: number): void;
  overflows(): boolean;
}

/** Scale steps tried, largest first, ending at the floor. */
export function fitScales(floor = MIN_TEXT_FIT, step = 0.05): number[] {
  const out: number[] = [];
  for (let s = 1; s > floor + 1e-9; s = Math.round((s - step) * 1000) / 1000) out.push(s);
  out.push(floor);
  return out;
}

/**
 * Fit one target: the largest scale at which it no longer overflows, or the
 * floor (and `fits: false`) when none does.
 */
export function fitTarget(
  target: FitTarget,
  floor = MIN_TEXT_FIT,
  step = 0.05,
): { scale: number; fits: boolean } {
  target.apply(1);
  if (!target.overflows()) return { scale: 1, fits: true };
  for (const scale of fitScales(floor, step).slice(1)) {
    target.apply(scale);
    if (!target.overflows()) return { scale, fits: true };
  }
  return { scale: floor, fits: false };
}

/** Attribute marking a fittable element; its value is the designed size in cqw. */
export const FIT_ATTR = "data-fit";
/** Attribute recording the scale the fit step settled on (1 = designed size). */
export const FIT_SCALE_ATTR = "data-fit-scale";

const overflowsBox = (el: HTMLElement) =>
  el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;

/**
 * Fit every marked element under `root` and return the overflow warnings for
 * `size`. Elements are text layers with live fields and list-row cells.
 */
export function fitLayersInDom(
  root: HTMLElement,
  size: CardSize,
  floor = MIN_TEXT_FIT,
): LayoutWarning[] {
  const warnings: LayoutWarning[] = [];
  for (const el of Array.from(root.querySelectorAll<HTMLElement>(`[${FIT_ATTR}]`))) {
    const base = Number(el.getAttribute(FIT_ATTR));
    if (!Number.isFinite(base) || base <= 0) continue;
    const result = fitTarget(
      {
        base,
        apply: (scale) => {
          el.style.fontSize = `${(base * scale).toFixed(3)}cqw`;
          el.setAttribute(FIT_SCALE_ATTR, String(scale));
        },
        overflows: () => overflowsBox(el),
      },
      floor,
    );
    if (result.fits) continue;
    const layer = el.closest<HTMLElement>("[data-layer-id]");
    const row = el.closest<HTMLElement>("[data-row-index]");
    const warning: LayoutWarning = { reason: "overflow", size };
    if (layer) warning.layerId = layer.getAttribute("data-layer-id") ?? undefined;
    if (row) warning.row = Number(row.getAttribute("data-row-index"));
    const field = el.getAttribute("data-row-cell");
    if (field) warning.field = field;
    warnings.push(warning);
  }
  return warnings;
}
