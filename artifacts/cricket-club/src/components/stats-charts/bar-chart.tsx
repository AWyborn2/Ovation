import type { ReactElement, ReactNode } from "react";
import {
  Bar,
  BarChart as RBarChart,
  CartesianGrid,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";
import {
  ChartTooltip,
  SERIES_TOKENS,
  chartColor,
  useChartTooltip,
  usePrefersReducedMotion,
  type MarkProps,
} from "./chart-tooltip";

/**
 * How a single-series bar is painted:
 * - `best`  solid accent (e.g. best season in range);
 * - `base`  38% accent (the default);
 * - `faded` surface track (outside the selected range);
 * - `mute`  the neutral `--bar-mute` (non-highlighted comparison bars).
 */
export type BarTone = "best" | "base" | "faded" | "mute";

export interface BarSeries {
  key: string;
  name: string;
  /** CSS token for the series colour; defaults to --chart-a / -b / -c by index. */
  token?: string;
}

export const AXIS_TICK = {
  fill: "hsl(var(--muted-foreground))",
  fontSize: 11,
  fontFamily: "var(--app-font-mono)",
};
export const GRID_STROKE = "hsl(var(--border))";

export function toneFill(tone: BarTone, token: string = SERIES_TOKENS[0]): string {
  switch (tone) {
    case "best":
      return chartColor(token);
    case "faded":
      return "hsl(var(--muted))";
    case "mute":
      return chartColor("--bar-mute");
    default:
      return chartColor(token, 0.38);
  }
}

function toneText(tone: BarTone): string {
  if (tone === "best") return "hsl(var(--primary-foreground))";
  if (tone === "faded") return "hsl(var(--muted-foreground))";
  return "hsl(var(--foreground))";
}

/** Bar outline with a 6px top radius and 2px bottom radius (handoff shape). */
export function barPath(x: number, y: number, w: number, h: number, rt = 6, rb = 2): string {
  if (w <= 0 || h <= 0) return `M${x},${y + Math.max(h, 0)}h${Math.max(w, 0)}`;
  const t = Math.min(rt, w / 2, h);
  const b = Math.min(rb, w / 2, Math.max(h - t, 0));
  return [
    `M${x},${y + t}`,
    `a${t},${t} 0 0 1 ${t},${-t}`,
    `h${w - 2 * t}`,
    `a${t},${t} 0 0 1 ${t},${t}`,
    `v${h - t - b}`,
    `a${b},${b} 0 0 1 ${-b},${b}`,
    `h${-(w - 2 * b)}`,
    `a${b},${b} 0 0 1 ${-b},${-b}`,
    "Z",
  ].join("");
}

interface ShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  index?: number;
  value?: number | [number, number];
}

/** One focusable bar mark (+ optional value label inside the bar top). */
export function BarMark({
  shape,
  fill,
  label,
  labelColor,
  mark,
  tone,
}: {
  shape: ShapeProps;
  fill: string;
  label?: ReactNode;
  labelColor?: string;
  mark: MarkProps;
  /** Exposed as `data-tone` so tests and styles can tell faded bars apart. */
  tone?: BarTone;
}): ReactElement {
  const x = shape.x ?? 0;
  const y = shape.y ?? 0;
  const w = shape.width ?? 0;
  const h = shape.height ?? 0;
  return (
    <g>
      <path
        {...mark}
        role="img"
        d={barPath(x, y, w, h)}
        fill={fill}
        data-testid="chart-bar"
        data-tone={tone}
        className="cursor-default outline-none transition-[fill] duration-200 hover:[fill:var(--bar-hover)] focus-visible:stroke-[hsl(var(--ring))] focus-visible:[stroke-width:2]"
      />
      {label != null && h >= 18 && (
        <text
          x={x + w / 2}
          y={y + 14}
          textAnchor="middle"
          fontSize={11}
          fontWeight={600}
          fontFamily="var(--app-font-mono)"
          fill={labelColor}
          pointerEvents="none"
          aria-hidden
        >
          {label}
        </text>
      )}
    </g>
  );
}

/**
 * Themed vertical bar chart. One series paints each bar by `tone` (best
 * season solid, others 38%, out-of-range faded); several series render grouped
 * bars in the --chart-a/-b/-c colours (Compare season bars). Every bar is
 * focusable and shows `tooltip(row, series)` on hover and focus.
 */
export function BarChart<T extends Record<string, unknown>>({
  data,
  xKey,
  series,
  tooltip,
  tone,
  valueLabels,
  formatValue = (v) => v.toLocaleString("en-AU"),
  height = 230,
  width,
  className,
}: {
  data: T[];
  xKey: keyof T & string;
  series: BarSeries[];
  tooltip: (row: T, series: BarSeries) => string;
  tone?: (row: T, index: number) => BarTone;
  valueLabels?: boolean;
  formatValue?: (v: number) => string;
  height?: number;
  /** Fixed width (tests / fixed layouts); omitted → fills its container. */
  width?: number;
  className?: string;
}) {
  const { containerRef, tip, markProps } = useChartTooltip();
  const reduced = usePrefersReducedMotion();
  const grouped = series.length > 1;

  const chart = (
    <RBarChart
      data={data}
      width={width}
      height={height}
      margin={{ top: 8, right: 4, bottom: 0, left: 4 }}
      barCategoryGap={grouped ? "18%" : "10%"}
      barGap={2}
      accessibilityLayer={false}
    >
      <CartesianGrid vertical={false} stroke={GRID_STROKE} strokeDasharray="3 4" />
      <XAxis
        dataKey={xKey}
        tickLine={false}
        axisLine={{ stroke: GRID_STROKE }}
        tick={AXIS_TICK}
        interval="preserveStartEnd"
      />
      <YAxis hide domain={[0, (max: number) => Math.max(1, max * 1.12)]} />
      {series.map((s, si) => {
        const token = s.token ?? SERIES_TOKENS[si % SERIES_TOKENS.length];
        return (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.name}
            isAnimationActive={!reduced}
            animationDuration={500}
            shape={(shapeProps: unknown) => {
              const props = shapeProps as ShapeProps;
              const i = props.index ?? 0;
              const row = data[i];
              const t: BarTone = grouped ? "best" : (tone?.(row, i) ?? "base");
              const raw = row?.[s.key];
              const v = typeof raw === "number" ? raw : null;
              return (
                <g style={{ ["--bar-hover" as string]: chartColor(token) }}>
                  <BarMark
                    shape={props}
                    fill={toneFill(t, token)}
                    label={valueLabels && !grouped && v != null ? formatValue(v) : undefined}
                    labelColor={toneText(t)}
                    mark={markProps(tooltip(row, s))}
                    tone={t}
                  />
                </g>
              );
            }}
          />
        );
      })}
    </RBarChart>
  );

  return (
    <div ref={containerRef} className={cn("relative", className)} data-testid="bar-chart">
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
