import { SegmentedControl, type Option } from "@/components/broadcast";
import { ChartCard, LineOverlay, type BarTone } from "@/components/stats-charts";
import { NO_BOWLING_REASON } from "@/lib/stats-analytics";
import { inStatsRange, type Discipline, type StatsView } from "@/lib/use-stats-view";
import { fmt1, type ArcSeason } from "./season-stats";

export const DISCIPLINE_TABS: Option<Discipline>[] = [
  { value: "bat", label: "Batting" },
  { value: "bowl", label: "Bowling" },
];

/**
 * Career arc: one bar per season (runs or wickets, value in the bar top) with
 * the season average as a line. The best season in range is solid accent, the
 * rest of the range 38%, and seasons outside the range fade to the surface
 * track (`data-tone="faded"`). The local tabs drive the global discipline.
 */
export function CareerArc({
  seasons,
  view,
  onDiscipline,
  loading,
}: {
  seasons: ArcSeason[];
  view: StatsView;
  onDiscipline: (d: Discipline) => void;
  loading: boolean;
}) {
  const bowl = view.d === "bowl";
  const valueKey = bowl ? "wickets" : "runs";
  const avgKey = bowl ? "bowlingAverage" : "battingAverage";
  const inRange = seasons.filter((s) => inStatsRange(s.season, view));
  const best = inRange.reduce<ArcSeason | null>(
    (b, s) => (s[valueKey] > 0 && (!b || s[valueKey] > b[valueKey]) ? s : b),
    null,
  );
  const noBowling = bowl && inRange.every((s) => s.wickets === 0);
  const data = seasons.map((s) => ({ ...s }));
  const tone = (row: ArcSeason): BarTone =>
    !inStatsRange(row.season, view) ? "faded" : row.season === best?.season ? "best" : "base";
  const unit = bowl ? "wickets" : "runs";
  const tip = (row: ArcSeason, key: string) => {
    if (key === avgKey) {
      const avg = fmt1(row[avgKey]);
      return `${row.label}: ${bowl ? "bowling" : "batting"} average ${avg ?? "–"}`;
    }
    const avg = fmt1(row[avgKey]);
    return `${row.label}: ${row[valueKey].toLocaleString("en-AU")} ${unit}${avg ? ` at ${avg}` : ""}`;
  };

  return (
    <ChartCard
      eyebrow={bowl ? "Wickets by season" : "Runs by season"}
      title="Career arc"
      loading={loading}
      points={seasons.length}
      empty={noBowling}
      emptyReason={noBowling ? NO_BOWLING_REASON : "Fewer than 3 seasons to chart"}
      note={best ? `Best season: ${best.label}` : undefined}
      actions={
        <SegmentedControl
          label="Career arc discipline"
          options={DISCIPLINE_TABS}
          value={view.d}
          onChange={onDiscipline}
        />
      }
      table={{
        columns: ["Season", bowl ? "Wickets" : "Runs", "Average", "In range"],
        rows: seasons.map((s) => [
          s.label,
          s[valueKey],
          fmt1(s[avgKey]),
          inStatsRange(s.season, view) ? "Yes" : "No",
        ]),
      }}
    >
      <div data-testid="career-arc">
        <LineOverlay
          data={data}
          xKey="label"
          bars={{ key: valueKey, name: bowl ? "Wickets" : "Runs", tone, valueLabels: true }}
          lines={[{ key: avgKey, name: "Average", strokeWidth: 2.5, dots: "all" }]}
          tooltip={tip}
          height={240}
        />
      </div>
    </ChartCard>
  );
}
