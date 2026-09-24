import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SERIES_TOKENS, chartColor, type MarkProps } from "./chart-tooltip";

/** Continuous heat-table opacity range (handoff: .06 → .85). */
export const HEAT_MIN_ALPHA = 0.06;
export const HEAT_MAX_ALPHA = 0.85;

/**
 * Accent opacity for a heat-table cell: `value` placed within [min, max] and
 * mapped onto .06–.85. Lower-is-better metrics (bowling average) invert, so the
 * smallest value is darkest. A flat range reads as mid-heat.
 */
export function heatAlpha(value: number, min: number, max: number, lowerIsBetter = false): number {
  const span = max - min;
  let t = span > 0 ? (value - min) / span : 0.5;
  t = Math.max(0, Math.min(1, t));
  if (lowerIsBetter) t = 1 - t;
  return Number((HEAT_MIN_ALPHA + t * (HEAT_MAX_ALPHA - HEAT_MIN_ALPHA)).toFixed(2));
}

/** 4-step count scale (hundreds heatmap): 0, 1, 2, 3+. */
export type HeatStep = 0 | 1 | 2 | 3;
export const heatStep = (count: number): HeatStep =>
  count <= 0 ? 0 : count >= 3 ? 3 : (count as HeatStep);

/** Background for each step: surface track, 30%, 60%, solid accent. */
export function heatStepBg(step: HeatStep, token: string = SERIES_TOKENS[0]): string {
  if (step === 0) return "hsl(var(--muted))";
  if (step === 1) return chartColor(token, 0.3);
  if (step === 2) return chartColor(token, 0.6);
  return chartColor(token);
}

/**
 * One heat-table / heatmap cell, painted either by a continuous `alpha` or a
 * 4-step `step`. Strong cells switch to the on-accent text colour. Pass `mark`
 * (from the table's `useChartTooltip`) for the shared hover/focus tooltip;
 * without it the cell is still focusable with the figure as its name.
 */
export function HeatCell({
  tip,
  alpha,
  step,
  token = SERIES_TOKENS[0],
  mark,
  children,
  className,
}: {
  tip: string;
  alpha?: number;
  step?: HeatStep;
  token?: string;
  mark?: MarkProps;
  children?: ReactNode;
  className?: string;
}) {
  const background =
    step != null ? heatStepBg(step, token) : alpha != null ? chartColor(token, alpha) : undefined;
  const strong = step === 3 || (alpha != null && alpha > 0.55);
  const a11y = mark ?? { tabIndex: 0 as const, "aria-label": tip, title: tip };
  return (
    <div
      {...a11y}
      data-testid="heat-cell"
      data-step={step}
      className={cn(
        "flex items-center justify-center rounded-md font-serif font-extrabold outline-none focus-visible:ring-2 focus-visible:ring-ring",
        strong ? "text-primary-foreground" : "text-foreground",
        className,
      )}
      style={{ background }}
    >
      {children}
    </div>
  );
}
