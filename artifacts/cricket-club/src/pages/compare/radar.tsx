import type { GradeDistributionBest } from "@workspace/api-client-react";
import { ChartCard } from "@/components/stats-charts/chart-card";
import { Radar, type RadarSeries } from "@/components/stats-charts/radar";
import type { Discipline } from "@/lib/use-stats-view";
import {
  COMPARE_RADAR_BATTING,
  COMPARE_RADAR_BOWLING,
  RADAR_LABELS,
  radarValues,
  type SeasonTotals,
} from "./compare-data";
import { PlayerLegend, type ComparedPlayer } from "./shared";

/**
 * "% of club best" radar: six axes, each player's figure in the radar grade
 * over the range as a share of the club's best qualifier (grade distribution,
 * U5). Lower-is-better axes are inverted by `pctOfBest`, so bigger is better.
 */
export function CompareRadar({
  players,
  totals,
  best,
  grade,
  rangeLabel,
  d,
  loading,
  error,
}: {
  players: ReadonlyArray<ComparedPlayer>;
  /** Per player, their season totals in `grade` over the range. */
  totals: ReadonlyArray<SeasonTotals>;
  best: GradeDistributionBest | undefined;
  grade: string | null;
  rangeLabel: string;
  d: Discipline;
  loading: boolean;
  error: boolean;
}) {
  const metrics = d === "bowl" ? COMPARE_RADAR_BOWLING : COMPARE_RADAR_BATTING;
  const axes = metrics.map((key) => ({ key, label: RADAR_LABELS[key] }));
  const values = best ? totals.map((t) => radarValues(t, best, metrics)) : [];
  const series: RadarSeries[] = players.map((p, i) => ({
    name: p.name,
    values: values[i] ?? {},
    token: p.token,
    fillOpacity: 0.18,
  }));
  const plotted = axes.filter((a) => values.some((v) => v[a.key] != null)).length;
  const reason = error
    ? "Club bests couldn't be loaded"
    : !grade
      ? "No senior games in this range"
      : d === "bowl" && totals.every((t) => t.wickets === 0)
        ? "No bowling recorded in this range"
        : "No club bests recorded for this grade and range";

  return (
    <ChartCard
      eyebrow="Player shape · % of club best"
      title="Radar"
      note={grade ? `${grade} · ${rangeLabel}` : rangeLabel}
      loading={loading}
      points={plotted}
      empty={error || !grade}
      emptyReason={reason}
      table={{
        columns: ["Metric", ...players.map((p) => p.name)],
        rows: axes.map((a) => [
          a.label,
          ...values.map((v) =>
            v[a.key] == null ? null : `${Math.round(v[a.key]!)}% of club best`,
          ),
        ]),
      }}
    >
      <Radar
        axes={axes}
        series={series}
        tooltip={(axis, s, v) => `${s.name}: ${axis.label} ${Math.round(v)}% of club best`}
      />
      <PlayerLegend players={players} className="mt-2 justify-center" />
    </ChartCard>
  );
}
