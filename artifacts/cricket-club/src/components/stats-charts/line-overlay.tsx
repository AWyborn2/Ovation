import type { ReactElement } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import { AXIS_TICK, BarMark, GRID_STROKE, toneFill, type BarTone } from "./bar-chart";
import {
  ChartTooltip,
  SERIES_TOKENS,
  chartColor,
  useChartTooltip,
  usePrefersReducedMotion,
} from "./chart-tooltip";

export interface OverlayBars<T> {
  key: keyof T & string;
  name: string;
  token?: string;
  tone?: (row: T, index: number) => BarTone;
  valueLabels?: boolean;
}

export interface OverlayLine {
  key: string;
  name: string;
  /** Series colour token; defaults to --line-b with bars, else --chart-a/-b/-c. */
  token?: string;
  strokeWidth?: number;
  /**
   * Which points get a focusable ring dot: every point (career arc), only the
   * last one with its value as an end label (career race), or none.
   */
  dots?: "all" | "end" | "none";
}

interface DotProps {
  cx?: number | null;
  cy?: number | null;
  index?: number;
  value?: number | null;
}

/**
 * Bars with one or more line series over them (career arc: runs bars + average
 * line), or lines alone (career race: cumulative runs by games played, one line
 * per player with an end label). Bars and lines have independent hidden Y
 * scales. Every rendered bar and dot is focusable and shows its tooltip.
 */
export function LineOverlay<T extends Record<string, unknown>>({
  data,
  xKey,
  bars,
  lines,
  tooltip,
  formatValue = (v) => v.toLocaleString("en-AU"),
  height = 230,
  width,
  className,
}: {
  data: T[];
  xKey: keyof T & string;
  bars?: OverlayBars<T>;
  lines: OverlayLine[];
  /** Tooltip for a mark; `seriesKey` is the bar or line key it belongs to. */
  tooltip: (row: T, seriesKey: string) => string;
  formatValue?: (v: number) => string;
  height?: number;
  width?: number;
  className?: string;
}) {
  const { containerRef, tip, markProps } = useChartTooltip();
  const reduced = usePrefersReducedMotion();

  const chart = (
    <ComposedChart
      data={data}
      width={width}
      height={height}
      margin={{ top: 18, right: lines.some((l) => l.dots === "end") ? 44 : 8, bottom: 0, left: 8 }}
      barCategoryGap="10%"
    >
      <CartesianGrid vertical={false} stroke={GRID_STROKE} strokeDasharray="3 4" />
      <XAxis
        dataKey={xKey}
        tickLine={false}
        axisLine={{ stroke: GRID_STROKE }}
        tick={AXIS_TICK}
        interval="preserveStartEnd"
      />
      <YAxis yAxisId="bars" hide domain={[0, (max: number) => Math.max(1, max * 1.12)]} />
      <YAxis yAxisId="lines" hide domain={[0, (max: number) => Math.max(1, max * 1.08)]} />
      {bars && (
        <Bar
          yAxisId="bars"
          dataKey={bars.key}
          name={bars.name}
          isAnimationActive={!reduced}
          animationDuration={500}
          shape={(shapeProps: unknown) => {
            const props = shapeProps as { index?: number };
            const i = props.index ?? 0;
            const row = data[i];
            const t = bars.tone?.(row, i) ?? "base";
            const token: string = bars.token ?? SERIES_TOKENS[0];
            const raw = row?.[bars.key];
            const v = typeof raw === "number" ? raw : null;
            return (
              <g style={{ ["--bar-hover" as string]: chartColor(token) }}>
                <BarMark
                  shape={props}
                  fill={toneFill(t, token)}
                  label={bars.valueLabels && v != null ? formatValue(v) : undefined}
                  labelColor={
                    t === "best" ? "hsl(var(--primary-foreground))" : "hsl(var(--foreground))"
                  }
                  mark={markProps(tooltip(row, bars.key))}
                  tone={t}
                />
              </g>
            );
          }}
        />
      )}
      {lines.map((l, li) => {
        const token = l.token ?? (bars ? "--line-b" : SERIES_TOKENS[li % SERIES_TOKENS.length]);
        const stroke = chartColor(token);
        const mode = l.dots ?? (bars ? "all" : "end");
        const endIndex = lastDefined(data, l.key);
        const renderDot = (p: DotProps): ReactElement<SVGElement> => {
          const i = p.index ?? 0;
          if (p.cx == null || p.cy == null || p.value == null) return <g key={`${l.key}-${i}`} />;
          if (mode === "none" || (mode === "end" && i !== endIndex)) {
            return <g key={`${l.key}-${i}`} />;
          }
          return (
            <g key={`${l.key}-${i}`}>
              <circle
                {...markProps(tooltip(data[i], l.key))}
                role="img"
                data-testid="chart-dot"
                cx={p.cx}
                cy={p.cy}
                r={5}
                fill="hsl(var(--card))"
                stroke={stroke}
                strokeWidth={2.5}
                className="outline-none focus-visible:[stroke:hsl(var(--ring))]"
              />
              {mode === "end" && (
                <text
                  x={p.cx + 9}
                  y={p.cy + 4}
                  fontSize={12}
                  fontWeight={700}
                  fontFamily="var(--app-font-serif)"
                  fill={stroke}
                  aria-hidden
                >
                  {formatValue(p.value)}
                </text>
              )}
            </g>
          );
        };
        return (
          <Line
            key={l.key}
            yAxisId="lines"
            type="linear"
            dataKey={l.key}
            name={l.name}
            stroke={stroke}
            strokeWidth={l.strokeWidth ?? (bars ? 2.5 : 3)}
            strokeLinejoin="round"
            connectNulls={false}
            isAnimationActive={!reduced}
            animationDuration={500}
            dot={renderDot}
            activeDot={false}
          />
        );
      })}
    </ComposedChart>
  );

  return (
    <div ref={containerRef} className={cn("relative", className)} data-testid="line-overlay">
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

/** Index of the last row with a numeric value for `key` (a line's end point). */
export function lastDefined<T extends Record<string, unknown>>(data: T[], key: string): number {
  for (let i = data.length - 1; i >= 0; i--) {
    if (typeof data[i]?.[key] === "number") return i;
  }
  return -1;
}
