import type { ReactElement } from "react";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar as RRadar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";
import {
  ChartTooltip,
  SERIES_TOKENS,
  chartColor,
  useChartTooltip,
  usePrefersReducedMotion,
} from "./chart-tooltip";

export interface RadarAxis {
  key: string;
  label: string;
}

export interface RadarSeries {
  name: string;
  /** Value per axis key, on the chart's 0…`max` scale (e.g. percentile). */
  values: Record<string, number | null | undefined>;
  token?: string;
  /**
   * `fill` — a player polygon (fill + focusable vertex dots);
   * `dashed` — a reference polygon (club median);
   * `outline` — a thin reference outline (club best).
   */
  variant?: "fill" | "dashed" | "outline";
  fillOpacity?: number;
}

interface RadarDotProps {
  cx?: number;
  cy?: number;
  index?: number;
}

/**
 * Themed radar (Profile ranks, Compare "% of club best"). Player polygons are
 * filled with focusable vertex dots; reference polygons (median / best) are
 * drawn dashed or outlined without marks. Values above `max` are clamped so a
 * polygon never escapes the grid.
 */
export function Radar({
  axes,
  series,
  max = 100,
  tooltip,
  height = 300,
  width,
  className,
}: {
  axes: RadarAxis[];
  series: RadarSeries[];
  max?: number;
  tooltip: (axis: RadarAxis, series: RadarSeries, value: number) => string;
  height?: number;
  width?: number;
  className?: string;
}) {
  const { containerRef, tip, markProps } = useChartTooltip();
  const reduced = usePrefersReducedMotion();
  const data = axes.map((a) => {
    const row: Record<string, string | number> = { axis: a.label };
    series.forEach((s, si) => {
      const v = s.values[a.key];
      row[`s${si}`] = v == null ? 0 : Math.max(0, Math.min(max, v));
    });
    return row;
  });

  const chart = (
    <RadarChart data={data} width={width} height={height} outerRadius="72%">
      <PolarGrid stroke="hsl(var(--border))" />
      <PolarAngleAxis
        dataKey="axis"
        tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11, fontWeight: 600 }}
      />
      <PolarRadiusAxis domain={[0, max]} tick={false} axisLine={false} />
      {series.map((s, si) => {
        const variant = s.variant ?? "fill";
        const token = s.token ?? SERIES_TOKENS[si % SERIES_TOKENS.length];
        const stroke = chartColor(token);
        const dot =
          variant === "fill"
            ? (p: RadarDotProps): ReactElement<SVGElement> => {
                const i = p.index ?? 0;
                const axis = axes[i];
                const v = s.values[axis?.key ?? ""];
                if (!axis || p.cx == null || p.cy == null || v == null) {
                  return <g key={`${si}-${i}`} />;
                }
                return (
                  <circle
                    key={`${si}-${i}`}
                    {...markProps(tooltip(axis, s, v))}
                    role="img"
                    data-testid="chart-dot"
                    cx={p.cx}
                    cy={p.cy}
                    r={4}
                    fill={stroke}
                    stroke="hsl(var(--card))"
                    strokeWidth={1.5}
                    className="outline-none focus-visible:[stroke:hsl(var(--ring))]"
                  />
                );
              }
            : false;
        return (
          <RRadar
            key={s.name}
            name={s.name}
            dataKey={`s${si}`}
            stroke={stroke}
            strokeWidth={variant === "outline" ? 1 : 2}
            strokeDasharray={variant === "dashed" ? "4 4" : undefined}
            fill={stroke}
            fillOpacity={variant === "fill" ? (s.fillOpacity ?? 0.25) : 0}
            dot={dot}
            isAnimationActive={!reduced}
            animationDuration={500}
          />
        );
      })}
    </RadarChart>
  );

  return (
    <div ref={containerRef} className={cn("relative", className)} data-testid="radar">
      {width ? (
        chart
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          {chart}
        </ResponsiveContainer>
      )}
      <ChartTooltip tip={tip} />
    </div>
  );
}
