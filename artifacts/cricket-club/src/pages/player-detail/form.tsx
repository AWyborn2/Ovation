import type { PlayerMatchLine } from "@workspace/api-client-react";
import { BarChart, ChartCard } from "@/components/stats-charts";
import { battingForm, bowlingForm, FORM_LENGTH } from "@/lib/stats-analytics";
import { seasonLabel, type Discipline } from "@/lib/use-stats-view";
import { cn } from "@/lib/utils";
import { fmt1, opponentAbbrev } from "./season-stats";

type FormBar = {
  key: string;
  axis: string;
  value: number;
  highlight: boolean;
  tip: string;
  label: string;
};

/**
 * Form guide: the last 10 innings in range (oldest left, newest right).
 * Batting bars are runs, solid at 50+ (`*` = not out); bowling bars are
 * wickets, solid at 3+, with the figures in the tooltip. The headline is the
 * recent average with its delta against the whole range.
 */
export function FormCard({
  matches,
  discipline,
  loading,
  coverageNote,
}: {
  matches: ReadonlyArray<PlayerMatchLine>;
  discipline: Discipline;
  loading: boolean;
  coverageNote: string | null;
}) {
  const bowl = discipline === "bowl";
  const bat = bowl ? null : battingForm(matches);
  const bw = bowl ? bowlingForm(matches) : null;
  const result = bat ?? bw!;

  let bars: FormBar[] = [];
  let recent: number | null = null;
  let delta: number | null = null;
  if (bat?.ok) {
    bars = bat.data.entries.map((e) => ({
      key: `${e.matchId}-${e.inningsNo}`,
      axis: opponentAbbrev(e.opponent),
      value: e.runs,
      highlight: e.highlight,
      label: e.label,
      tip: `${e.label}${e.balls != null ? ` (${e.balls})` : ""}${e.opponent ? ` v ${e.opponent}` : ""}${e.season != null ? `, ${seasonLabel(e.season)}` : ""}`,
    }));
    recent = bat.data.recentAverage;
    delta = bat.data.delta;
  } else if (bw?.ok) {
    bars = bw.data.entries.map((e) => ({
      key: String(e.matchId),
      axis: opponentAbbrev(e.opponent),
      value: e.wickets,
      highlight: e.highlight,
      label: e.figures,
      tip: `${e.figures}${e.overs ? ` off ${e.overs}` : ""}${e.opponent ? ` v ${e.opponent}` : ""}${e.season != null ? `, ${seasonLabel(e.season)}` : ""}`,
    }));
    recent = bw.data.recentAverage;
    delta = bw.data.delta;
  }
  const ordered = [...bars].reverse();
  const deltaText = delta == null ? null : `${delta >= 0 ? "+" : "−"}${Math.abs(delta).toFixed(1)}`;

  return (
    <ChartCard
      eyebrow={`Last ${FORM_LENGTH} ${bowl ? "bowling innings" : "innings"}`}
      title="Form guide"
      note={coverageNote ?? undefined}
      loading={loading}
      empty={!result.ok}
      emptyReason={result.ok ? undefined : result.reason}
      table={{
        columns: ["Innings", bowl ? "Figures" : "Score", "Opponent"],
        rows: bars.map((b, i) => [`${i + 1} (newest first)`, b.label, b.tip]),
      }}
    >
      <div className="flex items-baseline gap-2">
        <span className="font-serif text-[40px] font-extrabold leading-none tabular-nums">
          {fmt1(recent) ?? "–"}
        </span>
        <span className="text-[12px] text-muted-foreground">recent average</span>
        {deltaText && (
          <span
            data-testid="form-delta"
            className={cn(
              "ml-auto text-[13px] font-semibold tabular-nums",
              delta! >= 0 ? "text-[var(--win-fg)]" : "text-[var(--loss-fg)]",
            )}
          >
            {deltaText} vs range
          </span>
        )}
      </div>
      <BarChart
        data={ordered}
        xKey="axis"
        series={[{ key: "value", name: bowl ? "Wickets" : "Runs" }]}
        tone={(row) => (row.highlight ? "best" : "mute")}
        tooltip={(row) => row.tip}
        valueLabels
        height={180}
      />
      <p className="text-[11px] text-muted-foreground">
        Solid bars: {bowl ? "3+ wickets" : "50 or more"}.{!bowl && " * not out."}
      </p>
    </ChartCard>
  );
}
