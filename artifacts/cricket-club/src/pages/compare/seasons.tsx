import { BarChart } from "@/components/stats-charts/bar-chart";
import { ChartCard } from "@/components/stats-charts/chart-card";
import type { Discipline } from "@/lib/use-stats-view";
import type { SeasonBarRow } from "./compare-data";
import { PlayerLegend, type ComparedPlayer } from "./shared";

/** Season by season: grouped runs or wickets bars over the last six seasons. */
export function SeasonBySeason({
  players,
  rows,
  d,
  loading,
}: {
  players: ReadonlyArray<ComparedPlayer>;
  rows: ReadonlyArray<SeasonBarRow>;
  d: Discipline;
  loading: boolean;
}) {
  const unit = d === "bowl" ? "wickets" : "runs";
  const noBowling =
    d === "bowl" && rows.every((r) => players.every((_, i) => !(Number(r[`p${i}`]) > 0)));

  return (
    <ChartCard
      eyebrow={`Last ${rows.length === 1 ? "season" : `${rows.length} seasons`} · ${d === "bowl" ? "Wickets" : "Runs"}`}
      title="Season by season"
      loading={loading}
      points={rows.length}
      minPoints={1}
      empty={noBowling}
      emptyReason={noBowling ? "No bowling recorded in this range" : "No seasons in this range"}
      table={{
        columns: ["Season", ...players.map((p) => p.name)],
        rows: rows.map((r) => [
          r.season,
          ...players.map((_, i) => {
            const v = r[`p${i}`];
            return typeof v === "number" ? `${v.toLocaleString("en-AU")} ${unit}` : null;
          }),
        ]),
      }}
    >
      <BarChart
        data={[...rows] as Array<Record<string, unknown>>}
        xKey="season"
        series={players.map((p, i) => ({ key: `p${i}`, name: p.name, token: p.token }))}
        tooltip={(row, s) => {
          const v = row[s.key];
          return `${s.name} ${String(row.season)}: ${typeof v === "number" ? v.toLocaleString("en-AU") : "did not play"}${typeof v === "number" ? ` ${unit}` : ""}`;
        }}
        height={240}
      />
      <PlayerLegend players={players} className="mt-2" />
    </ChartCard>
  );
}
