import { useState } from "react";
import type { GradeDistribution } from "@workspace/api-client-react";
import { SegmentedControl, type Option } from "@/components/broadcast";
import {
  ChartCard,
  Radar,
  chartColor,
  useChartTooltip,
  ChartTooltip,
} from "@/components/stats-charts";
import {
  BATTING_RANK_METRICS,
  BOWLING_RANK_METRICS,
  playerRanks,
  type RankRow,
} from "@/lib/stats-analytics";
import { seasonLabel, type Discipline } from "@/lib/use-stats-view";
import { cn } from "@/lib/utils";

type RankView = "radar" | "bars";
const VIEWS: Option<RankView>[] = [
  { value: "radar", label: "Radar" },
  { value: "bars", label: "Bars" },
];

const fmtValue = (r: RankRow) =>
  r.value == null
    ? "–"
    : Number.isInteger(r.value)
      ? r.value.toLocaleString("en-AU")
      : r.value.toFixed(r.key === "economy" ? 2 : 1);

const ordinal = (n: number) => {
  const r = Math.round(n);
  const teen = r % 100 >= 11 && r % 100 <= 13;
  return `${r}${teen ? "th" : (["th", "st", "nd", "rd"][r % 10] ?? "th")}`;
};

/**
 * "Where they rank": percentile against the grade's qualifiers (U5 grade
 * distribution, U4 percentiles), as a radar (player polygon, dashed club
 * median at 50, outline of the club best at 100) or percentile bars with a
 * median tick. The toggle is local view state — switching never refetches.
 */
export function RanksCard({
  distribution,
  playerId,
  discipline,
  grade,
  span,
  loading,
  playerName,
}: {
  distribution: GradeDistribution | undefined;
  playerId: number;
  discipline: Discipline;
  grade: string | null;
  span: { from: number; to: number } | null;
  loading: boolean;
  playerName: string;
}) {
  const [view, setView] = useState<RankView>("radar");
  const metrics = discipline === "bowl" ? BOWLING_RANK_METRICS : BATTING_RANK_METRICS;
  const result = distribution
    ? playerRanks(distribution, playerId, metrics)
    : ({ ok: false, reason: "No grade to rank against in this range" } as const);
  const rows = result.ok ? result.data : [];
  const spanText = span
    ? span.from === span.to
      ? seasonLabel(span.from)
      : `${seasonLabel(span.from)} to ${seasonLabel(span.to)}`
    : null;
  const qualifier = distribution
    ? `Qualifier: ${distribution.minInnings} innings or ${distribution.minOvers} overs.`
    : null;

  return (
    <ChartCard
      eyebrow={["Percentile rank", grade, spanText].filter(Boolean).join(" · ")}
      title="Where they rank"
      loading={loading}
      empty={!result.ok}
      emptyReason={result.ok ? undefined : result.reason}
      emptyMessage={qualifier ?? undefined}
      actions={
        <SegmentedControl label="Ranks view" options={VIEWS} value={view} onChange={setView} />
      }
      table={{
        columns: ["Metric", "Value", "Percentile", "Club best"],
        rows: rows.map((r) => [
          r.label,
          fmtValue(r),
          r.percentile == null ? null : Math.round(r.percentile),
          r.best == null ? null : r.best,
        ]),
      }}
    >
      <div data-testid="ranks" data-view={view}>
        {view === "radar" ? (
          <Radar
            axes={rows.map((r) => ({
              key: r.key,
              label: `${r.label} ${r.percentile == null ? "–" : Math.round(r.percentile)}`,
            }))}
            series={[
              {
                name: "Club best",
                values: Object.fromEntries(rows.map((r) => [r.key, 100])),
                variant: "outline",
                token: "--chart-b",
              },
              {
                name: "Club median",
                values: Object.fromEntries(rows.map((r) => [r.key, 50])),
                variant: "dashed",
                token: "--line-b",
              },
              {
                name: playerName,
                values: Object.fromEntries(rows.map((r) => [r.key, r.percentile])),
                variant: "fill",
                token: "--chart-a",
              },
            ]}
            tooltip={(axis, _s, v) => {
              const r = rows.find((x) => x.key === axis.key);
              return `${r?.label ?? axis.label}: ${r ? fmtValue(r) : ""}, ${ordinal(v)} percentile`;
            }}
            height={300}
          />
        ) : (
          <PercentileBars rows={rows} />
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {view === "radar"
          ? "Dashed line marks the club median; the outline is the club's best."
          : "The tick marks the club median (50th percentile)."}{" "}
        {qualifier}
      </p>
    </ChartCard>
  );
}

function PercentileBars({ rows }: { rows: RankRow[] }) {
  const { containerRef, tip, markProps } = useChartTooltip();
  return (
    <div ref={containerRef} className="relative">
      <ul className="flex flex-col gap-3" aria-label="Percentile bars">
        {rows.map((r) => {
          const p = r.percentile;
          const text = `${r.label}: ${fmtValue(r)}, ${p == null ? "not ranked" : `${ordinal(p)} percentile`}`;
          return (
            <li
              key={r.key}
              {...markProps(text)}
              data-testid="percentile-bar"
              className="grid grid-cols-[minmax(0,9rem)_1fr_2.5rem] items-center gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="truncate text-[13px] font-semibold">{r.label}</span>
              <span className="relative h-2.5 rounded-full bg-muted">
                <span
                  className="block h-full rounded-full motion-safe:transition-[width] motion-safe:duration-500"
                  style={{ width: `${p ?? 0}%`, background: chartColor("--chart-a") }}
                />
                <span
                  aria-hidden
                  className="absolute -top-1 left-1/2 h-[18px] w-0.5 bg-foreground/60"
                />
              </span>
              <span
                className={cn(
                  "text-right font-serif text-[18px] font-bold tabular-nums",
                  p == null && "text-muted-foreground",
                )}
              >
                {p == null ? "–" : Math.round(p)}
              </span>
            </li>
          );
        })}
      </ul>
      <ChartTooltip tip={tip} />
    </div>
  );
}
