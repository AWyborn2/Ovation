import type { PlayerMatchLine } from "@workspace/api-client-react";
import { ChartCard, Donut, largestRemainderPercents } from "@/components/stats-charts";
import { dismissalBreakdown } from "@/lib/stats-analytics";
import type { Discipline } from "@/lib/use-stats-view";

/**
 * "How they get out" donut from the per-innings dismissal types in range.
 * Bowling mode renders its empty state honestly: the per-match read carries
 * the player's own batting lines, not the opposition's, so how his wickets
 * fell isn't known (U4 always returns "insufficient" there).
 */
export function DismissalsCard({
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
  const result = dismissalBreakdown(matches, discipline);
  const bowl = discipline === "bowl";
  const data = result.ok ? result.data : null;
  const shown = data ? data.slices.filter((s) => s.count > 0) : [];
  const pcts = largestRemainderPercents(shown.map((s) => s.count));
  const topIndex = data ? shown.findIndex((s) => s.key === data.top.key) : -1;

  return (
    <ChartCard
      eyebrow={data ? `Dismissals · ${data.outs} of ${data.innings} innings` : "Dismissals"}
      title={bowl ? "How they take wickets" : "How they get out"}
      note={coverageNote ?? undefined}
      loading={loading}
      empty={!result.ok}
      emptyReason={result.ok ? undefined : result.reason}
      table={
        data
          ? {
              columns: ["Dismissal", "Count", "Share"],
              rows: shown.map((s, i) => [s.label, s.count, `${pcts[i]}%`]),
            }
          : undefined
      }
    >
      {data && (
        <Donut
          segments={shown.map((s) => ({ label: s.label, value: s.count }))}
          centerValue={topIndex >= 0 ? `${pcts[topIndex]}%` : undefined}
          centerLabel={data.top.label.toLowerCase()}
          tooltip={(s, pct) => `${s.label}: ${s.value} of ${data.outs} dismissals (${pct}%)`}
        />
      )}
    </ChartCard>
  );
}
