import type { ReactElement } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { cn } from "@/lib/utils";
import { AXIS_TICK, GRID_STROKE } from "./bar-chart";
import {
  ChartTooltip,
  SERIES_TOKENS,
  chartColor,
  useChartTooltip,
  usePrefersReducedMotion,
} from "./chart-tooltip";

export interface StepPoint {
  /** X-axis label (a season, a year). */
  x: string;
  value: number;
  /** Label drawn above the dot (defaults to the value). */
  label?: string;
  tip: string;
  /** The current record: solid dot and a `*` after its label. */
  final?: boolean;
}

/** The final (current) record gets a `*` — unless its label already ends in one ("187*"). */
const finalLabel = (label: string, final: boolean) =>
  final && !label.endsWith("*") ? `${label}*` : label;

interface StepDotProps {
  cx?: number;
  cy?: number;
  index?: number;
}

/**
 * Record progression step chart: a 3px step line with a 12% fill below, a
 * ringed dot at each record-breaking point with its value above it, and the
 * final (current) record solid with `*`. Serves highest score, best bowling
 * and highest stand alike. Dots are focusable and show their tooltip.
 */
export function StepLine({
  points,
  token = SERIES_TOKENS[0],
  height = 260,
  width,
  className,
}: {
  points: StepPoint[];
  token?: string;
  height?: number;
  width?: number;
  className?: string;
}) {
  const { containerRef, tip, markProps } = useChartTooltip();
  const reduced = usePrefersReducedMotion();
  const stroke = chartColor(token);
  const data = points.map((p) => ({ x: p.x, value: p.value }));

  const dot = (p: StepDotProps): ReactElement<SVGElement> => {
    const i = p.index ?? 0;
    const pt = points[i];
    if (!pt || p.cx == null || p.cy == null) return <g key={i} />;
    const final = pt.final ?? i === points.length - 1;
    return (
      <g key={i}>
        <circle
          {...markProps(pt.tip)}
          role="img"
          data-testid="chart-dot"
          cx={p.cx}
          cy={p.cy}
          r={6}
          fill={final ? stroke : "hsl(var(--card))"}
          stroke={stroke}
          strokeWidth={2.5}
          className="outline-none focus-visible:[stroke:hsl(var(--ring))]"
        />
        <text
          x={p.cx}
          y={p.cy - 12}
          textAnchor="middle"
          fontSize={13}
          fontWeight={800}
          fontFamily="var(--app-font-serif)"
          fill="hsl(var(--foreground))"
          aria-hidden
        >
          {finalLabel(pt.label ?? String(pt.value), final)}
        </text>
      </g>
    );
  };

  const chart = (
    <AreaChart
      data={data}
      width={width}
      height={height}
      margin={{ top: 28, right: 16, bottom: 0, left: 16 }}
    >
      <CartesianGrid vertical={false} stroke={GRID_STROKE} strokeDasharray="3 4" />
      <XAxis
        dataKey="x"
        tickLine={false}
        axisLine={{ stroke: GRID_STROKE }}
        tick={AXIS_TICK}
        interval="preserveStartEnd"
      />
      <YAxis hide domain={[0, (max: number) => Math.max(1, max * 1.1)]} />
      <Area
        type="stepAfter"
        dataKey="value"
        stroke={stroke}
        strokeWidth={3}
        fill={stroke}
        fillOpacity={0.12}
        dot={dot}
        activeDot={false}
        isAnimationActive={!reduced}
        animationDuration={500}
      />
    </AreaChart>
  );

  return (
    <div ref={containerRef} className={cn("relative", className)} data-testid="step-line">
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
