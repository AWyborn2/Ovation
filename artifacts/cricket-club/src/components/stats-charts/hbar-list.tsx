import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ChartTooltip, SERIES_TOKENS, chartColor, useChartTooltip } from "./chart-tooltip";

export interface HBarItem {
  id: string | number;
  label: ReactNode;
  value: number | null | undefined;
  /** Formatted figure shown at the row end (defaults to the value). */
  display?: ReactNode;
  /** Small secondary text after the figure ("in 25 inns"). */
  sub?: ReactNode;
  /** Tooltip + accessible name for the row. */
  tip: string;
  /** Green "still playing" dot after the label. */
  active?: boolean;
  /** Series colour token for this row's bar (defaults to --chart-a). */
  token?: string;
}

/**
 * Bar widths as fractions of the longest bar. Higher-is-better: value ÷ max.
 * Lower-is-better (bowling average, economy): min ÷ value, so the SMALLEST
 * value gets the longest bar; a zero or negative value there is the best
 * possible and gets a full bar. Missing values get no bar.
 */
export function hbarWidths(
  values: ReadonlyArray<number | null | undefined>,
  lowerIsBetter = false,
): number[] {
  const nums = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (nums.length === 0) return values.map(() => 0);
  if (lowerIsBetter) {
    const positive = nums.filter((v) => v > 0);
    const min = positive.length ? Math.min(...positive) : 0;
    return values.map((v) => {
      if (typeof v !== "number" || !Number.isFinite(v)) return 0;
      if (v <= 0) return 1;
      return min > 0 ? min / v : 0;
    });
  }
  const max = Math.max(...nums);
  return values.map((v) => (typeof v === "number" && max > 0 ? Math.max(0, v) / max : 0));
}

/** Index of the best value (max, or min when lower is better); -1 when none. */
export function bestIndex(
  values: ReadonlyArray<number | null | undefined>,
  lowerIsBetter = false,
): number {
  let best = -1;
  values.forEach((v, i) => {
    if (typeof v !== "number" || !Number.isFinite(v)) return;
    const cur = best === -1 ? null : (values[best] as number);
    if (cur == null || (lowerIsBetter ? v < cur : v > cur)) best = i;
  });
  return best;
}

/**
 * Horizontal bar list (career leaders, splits, tale-of-the-tape rows). Plain
 * elements rather than an SVG chart: each row is a focusable list item with its
 * figure as tooltip and accessible name. The leader (best value) is solid; the
 * rest sit at 35% (`emphasis="leader"`). Widths animate unless the viewer
 * prefers reduced motion.
 */
export function HBarList({
  items,
  lowerIsBetter,
  emphasis = "leader",
  label,
  className,
}: {
  items: HBarItem[];
  lowerIsBetter?: boolean;
  emphasis?: "leader" | "none";
  /** Accessible name for the list. */
  label: string;
  className?: string;
}) {
  const { containerRef, tip, markProps } = useChartTooltip();
  const values = items.map((i) => i.value);
  const widths = hbarWidths(values, lowerIsBetter);
  const leader = bestIndex(values, lowerIsBetter);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <ul aria-label={label} className="flex flex-col gap-2" data-testid="hbar-list">
        {items.map((item, i) => {
          const token = item.token ?? SERIES_TOKENS[0];
          const lead = emphasis === "none" || i === leader;
          return (
            <li
              key={item.id}
              {...markProps(item.tip)}
              data-testid="hbar-row"
              data-leader={i === leader || undefined}
              className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold text-foreground">
                <span className="truncate">{item.label}</span>
                {item.active && (
                  <span
                    aria-hidden
                    title="Still playing"
                    className="h-[7px] w-[7px] shrink-0 rounded-full bg-[var(--win-fg)]"
                  />
                )}
              </span>
              <span className="h-2.5 overflow-hidden rounded-full bg-muted">
                <span
                  data-testid="hbar-fill"
                  className="block h-full rounded-full motion-safe:transition-[width] motion-safe:duration-500 motion-safe:ease-[cubic-bezier(.2,.8,.2,1)]"
                  style={{
                    width: `${(widths[i] * 100).toFixed(2)}%`,
                    background: chartColor(token),
                    opacity: lead ? 1 : 0.35,
                  }}
                />
              </span>
              <span className="whitespace-nowrap text-right">
                <strong
                  className={cn(
                    "font-serif text-[18px]",
                    lead ? "font-extrabold text-foreground" : "font-medium text-muted-foreground",
                  )}
                >
                  {item.display ?? item.value?.toLocaleString("en-AU") ?? "—"}
                </strong>
                {item.sub && <span className="text-[11px] text-muted-foreground"> {item.sub}</span>}
              </span>
            </li>
          );
        })}
      </ul>
      <ChartTooltip tip={tip} />
    </div>
  );
}
