import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ChartTooltip, DONUT_TOKENS, chartColor, useChartTooltip } from "./chart-tooltip";

export interface DonutSegment {
  label: string;
  value: number;
}

/**
 * Whole-number percentages that always sum to exactly `total` (100): floor
 * each share, then hand the leftover points to the largest remainders (ties go
 * to the earlier item). All-zero input returns all zeros.
 */
export function largestRemainderPercents(values: number[], total = 100): number[] {
  const sum = values.reduce((a, v) => a + Math.max(0, v), 0);
  if (sum <= 0) return values.map(() => 0);
  const exact = values.map((v) => (Math.max(0, v) / sum) * total);
  const floors = exact.map(Math.floor);
  let left = total - floors.reduce((a, v) => a + v, 0);
  const order = exact
    .map((v, i) => ({ i, r: v - Math.floor(v) }))
    .sort((a, b) => b.r - a.r || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    floors[i] += 1;
    left -= 1;
  }
  return floors;
}

/**
 * Dismissal-style donut: a ring of segments in the --donut-1…6 palette with a
 * headline in the centre, and a legend of rows (swatch, label, thin bar,
 * largest-remainder %) so the legend always adds to 100. Segments are
 * focusable and show `tooltip(segment, pct)` on hover and focus. Hand-drawn
 * SVG rather than a Recharts Pie so every arc can be a real focusable mark.
 */
export function Donut({
  segments,
  centerValue,
  centerLabel,
  tooltip = (s, pct) => `${s.label}: ${s.value.toLocaleString("en-AU")} (${pct}%)`,
  size = 190,
  thickness = 26,
  className,
}: {
  segments: DonutSegment[];
  centerValue?: ReactNode;
  centerLabel?: ReactNode;
  tooltip?: (segment: DonutSegment, pct: number) => string;
  size?: number;
  thickness?: number;
  className?: string;
}) {
  const { containerRef, tip, markProps } = useChartTooltip();
  const pcts = largestRemainderPercents(segments.map((s) => s.value));
  const total = segments.reduce((a, s) => a + Math.max(0, s.value), 0);
  const maxPct = Math.max(1, ...pcts);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const colour = (i: number) => chartColor(DONUT_TOKENS[i % DONUT_TOKENS.length]);

  let offset = 0;
  const arcs = segments.map((s, i) => {
    const len = total > 0 ? (Math.max(0, s.value) / total) * c : 0;
    const arc = { s, i, len, offset };
    offset += len;
    return arc;
  });

  return (
    <div
      ref={containerRef}
      className={cn("relative flex flex-wrap items-center gap-6", className)}
      data-testid="donut"
    >
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth={thickness}
            aria-hidden
          />
          {arcs.map(({ s, i, len, offset: off }) =>
            len > 0 ? (
              <circle
                key={s.label}
                {...markProps(tooltip(s, pcts[i]))}
                role="img"
                data-testid="donut-segment"
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={colour(i)}
                strokeWidth={thickness}
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-off}
                className="outline-none transition-opacity duration-200 hover:opacity-80 focus-visible:opacity-80"
              />
            ) : null,
          )}
        </svg>
        {(centerValue != null || centerLabel != null) && (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
            {centerValue != null && (
              <div className="font-serif text-[40px] font-extrabold leading-none text-foreground">
                {centerValue}
              </div>
            )}
            {centerLabel != null && (
              <div className="mt-1 text-[11px] leading-tight text-muted-foreground">
                {centerLabel}
              </div>
            )}
          </div>
        )}
      </div>
      <ul className="flex min-w-[180px] flex-1 flex-col gap-2" data-testid="donut-legend">
        {segments.map((s, i) => (
          <li key={s.label} className="grid grid-cols-[10px_1fr_44px] items-center gap-2.5">
            <span
              aria-hidden
              className="h-2.5 w-2.5 rounded-[3px]"
              style={{ background: colour(i) }}
            />
            <div className="min-w-0">
              <div className="truncate text-[13px] font-medium text-foreground">{s.label}</div>
              <div className="mt-1 h-1 rounded-full bg-muted">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${(pcts[i] / maxPct) * 100}%`, background: colour(i) }}
                />
              </div>
            </div>
            <span
              className="text-right font-serif text-[18px] font-bold text-foreground"
              data-testid="donut-pct"
            >
              {pcts[i]}%
            </span>
          </li>
        ))}
      </ul>
      <ChartTooltip tip={tip} />
    </div>
  );
}
