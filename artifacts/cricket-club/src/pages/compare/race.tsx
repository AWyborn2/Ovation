import { SegmentedControl, type Option } from "@/components/broadcast";
import { ChartCard } from "@/components/stats-charts/chart-card";
import { LineOverlay } from "@/components/stats-charts/line-overlay";
import type { Analytic, Race } from "@/lib/stats-analytics";
import type { Discipline } from "@/lib/use-stats-view";
import { raceChartRows } from "./compare-data";
import { PlayerLegend, type ComparedPlayer } from "./shared";

const RACE_TABS: Option<Discipline>[] = [
  { value: "bat", label: "Runs" },
  { value: "bowl", label: "Wickets" },
];

/**
 * Career race: cumulative runs or wickets by GAMES PLAYED (not date), one line
 * per player with its final total at the line end. On Career each line starts
 * from the player's pre-scorecard baseline (KTD3).
 */
export function CareerRace({
  players,
  race,
  d,
  onDiscipline,
  isCareer,
  coverageNote,
  loading,
}: {
  players: ReadonlyArray<ComparedPlayer>;
  race: Analytic<Race>;
  d: Discipline;
  onDiscipline: (d: Discipline) => void;
  isCareer: boolean;
  coverageNote: string | null;
  loading: boolean;
}) {
  const unit = d === "bowl" ? "wickets" : "runs";
  const rows = race.ok ? raceChartRows(race.data) : [];
  const ahead = race.ok ? race.data.aheadAfter : null;
  const aheadText = ahead
    ? ahead.leader == null
      ? `After ${ahead.games} games they were level on ${unit}.`
      : `After ${ahead.games} games, ${players[ahead.leader]?.name} was ahead on ${unit}.`
    : null;
  const note = [isCareer ? "Full careers." : "Within the selected range.", aheadText, coverageNote]
    .filter(Boolean)
    .join(" ");

  return (
    <ChartCard
      eyebrow="Career race · cumulative by game played"
      title={d === "bowl" ? "Wickets race" : "Runs race"}
      loading={loading}
      empty={!race.ok}
      emptyReason={race.ok ? undefined : race.reason}
      actions={
        <SegmentedControl label="Race stat" options={RACE_TABS} value={d} onChange={onDiscipline} />
      }
      table={
        race.ok
          ? {
              columns: ["Player", "Games", d === "bowl" ? "Wickets" : "Runs"],
              rows: race.data.series.map((s, i) => [
                players[i]?.name ?? s.key,
                s.final.games,
                s.final.value.toLocaleString("en-AU"),
              ]),
            }
          : undefined
      }
    >
      <LineOverlay
        data={rows}
        xKey="games"
        lines={players.map((p, i) => ({ key: `p${i}`, name: p.name, token: p.token, dots: "end" }))}
        tooltip={(row, key) => {
          const i = Number(key.slice(1));
          const v = row[key];
          return `${players[i]?.name}: ${typeof v === "number" ? v.toLocaleString("en-AU") : "–"} ${unit} after ${row.games} games`;
        }}
        height={260}
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <PlayerLegend players={players} />
        <span className="font-mono text-[11px] text-muted-foreground">x-axis: games played</span>
      </div>
      <p className="mt-2 text-[12px] text-muted-foreground">{note}</p>
    </ChartCard>
  );
}
