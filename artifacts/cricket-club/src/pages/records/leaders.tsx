import type { RecordLeaderMetric, RecordLeaderRow } from "@workspace/api-client-react";
import { FilterChips } from "@/components/broadcast";
import { ChartCard, HBarList, type HBarItem } from "@/components/stats-charts";
import { LEADER_METRICS, fullName, isActive, metricMeta } from "./model";

/**
 * Career leaders for one metric (Runs / Wickets / Catches / 100s / Games),
 * filtered by grade and season range: top 8 horizontal bars, the leader solid
 * and the rest at 35%, a green dot for players still playing.
 */
export function CareerLeaders({
  metric,
  onMetric,
  rows,
  loading,
  error,
  currentSeason,
  scope,
  range,
}: {
  metric: RecordLeaderMetric;
  onMetric: (m: RecordLeaderMetric) => void;
  rows: RecordLeaderRow[];
  loading: boolean;
  error: boolean;
  currentSeason: number | null;
  scope: string;
  range: string;
}) {
  const meta = metricMeta(metric);
  const items: HBarItem[] = rows.slice(0, 8).map((r) => {
    const name = fullName(r.givenName, r.surname);
    const active = isActive(r.lastSeason, currentSeason);
    return {
      id: r.playerId || name,
      label: (
        <span className="flex min-w-0 items-center gap-2">
          <span className="w-5 shrink-0 font-serif text-[18px] font-extrabold text-muted-foreground">
            {r.rank}
          </span>
          <span className="truncate">{name}</span>
        </span>
      ),
      value: r.value,
      tip: `${name}: ${r.value.toLocaleString("en-AU")} ${r.value === 1 ? meta.one : meta.unit}${active ? " · still playing" : ""}`,
      active,
    };
  });

  return (
    <ChartCard
      eyebrow={`Career leaders · ${scope} · ${range}`}
      title={meta.title}
      actions={
        <FilterChips
          label="Leaderboard metric"
          options={LEADER_METRICS.map((m) => ({ value: m.key, label: m.label }))}
          value={metric}
          onChange={onMetric}
          className="gap-1.5 [&>button]:h-[30px] [&>button]:px-3 [&>button]:text-[12.5px]"
        />
      }
      loading={loading}
      points={items.length}
      minPoints={1}
      empty={error}
      emptyReason={
        error ? "Career leaders aren't available" : `No ${meta.unit} recorded in this range`
      }
      table={{
        columns: ["Rank", "Player", meta.label, "Still playing"],
        rows: rows
          .slice(0, 8)
          .map((r) => [
            r.rank,
            fullName(r.givenName, r.surname),
            r.value,
            isActive(r.lastSeason, currentSeason) ? "Yes" : "No",
          ]),
      }}
    >
      <div data-testid="career-leaders" className="flex flex-col gap-3">
        <HBarList items={items} label={`${meta.title}, ${scope}, ${range}`} />
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span aria-hidden className="h-[7px] w-[7px] rounded-full bg-[var(--win-fg)]" />
          Still playing
        </span>
      </div>
    </ChartCard>
  );
}
