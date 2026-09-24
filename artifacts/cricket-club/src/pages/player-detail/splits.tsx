import type { PlayerMatchLine } from "@workspace/api-client-react";
import { ChartCard, HBarList } from "@/components/stats-charts";
import {
  battingSplits,
  bowlingSplits,
  type BattingSplitRow,
  type BowlingSplitRow,
  type SplitGroup,
} from "@/lib/stats-analytics";
import type { Discipline } from "@/lib/use-stats-view";
import { fmt1 } from "./season-stats";

/**
 * Splits ("Where they score" / "Where they strike"). Groups only appear where
 * their key is recorded (home/away is null on the native path, so that group
 * is simply absent there). Innings whose key is unknown are counted, not
 * guessed, so each group plus its "not recorded" line sums to the range.
 * Bowling has no role/spell group: there is no over-by-over data.
 */
export function SplitsCard({
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
  const result = bowl ? bowlingSplits(matches) : battingSplits(matches);
  const groups = result.ok
    ? (result.data as Array<SplitGroup<BattingSplitRow> | SplitGroup<BowlingSplitRow>>)
    : [];

  return (
    <ChartCard
      eyebrow={bowl ? "Bowling average by split" : "Batting average by split"}
      title={bowl ? "Where they strike" : "Where they score"}
      note={coverageNote ?? undefined}
      loading={loading}
      empty={!result.ok}
      emptyReason={result.ok ? undefined : result.reason}
      table={{
        columns: ["Split", bowl ? "Matches" : "Innings", "Average"],
        rows: groups.flatMap((g) =>
          g.rows.map((r) => [
            `${g.title}: ${r.label}`,
            "innings" in r ? r.innings : r.matches,
            fmt1(r.average),
          ]),
        ),
      }}
    >
      <div className="flex flex-col gap-5" data-testid="splits">
        {groups.map((g) => (
          <div key={g.key} data-testid={`split-${g.key}`}>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {g.title}
            </div>
            <HBarList
              label={g.title}
              lowerIsBetter={bowl}
              items={g.rows.map((r) => {
                const n = "innings" in r ? r.innings : r.matches;
                const unit = bowl ? "mat" : "inns";
                const avg = fmt1(r.average);
                return {
                  id: r.key,
                  label: r.label,
                  value: r.average,
                  display: avg ?? "–",
                  sub: `${n} ${unit}`,
                  tip: `${g.title}, ${r.label}: average ${avg ?? "–"} in ${n} ${bowl ? "matches" : "innings"}`,
                };
              })}
            />
            {g.unassigned > 0 && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {g.unassigned} {bowl ? "matches" : "innings"} not recorded
              </p>
            )}
          </div>
        ))}
      </div>
    </ChartCard>
  );
}
