import type { PlayerMatchLine } from "@workspace/api-client-react";
import {
  ChartCard,
  ChartTooltip,
  HeatCell,
  heatAlpha,
  useChartTooltip,
} from "@/components/stats-charts";
import { NO_BOWLING_REASON, oppositionTable, type OppositionRow } from "@/lib/stats-analytics";
import type { Discipline } from "@/lib/use-stats-view";
import { fmt1 } from "./season-stats";

/** Rows shown before the "N more opponents" line. */
export const OPPONENT_ROWS = 8;

const cell = "flex h-9 items-center justify-end rounded-md bg-muted px-2.5 tabular-nums";

/**
 * Favourite opponents heat table. Every row comes from the same per-innings
 * series as the other per-match charts, so the full table sums to the range
 * totals (R5); unresolved opponents stay in their own "Unknown opponent" row.
 * The average column is heat-shaded (bowling inverts: lower = darker).
 */
export function OpponentsCard({
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
  const { containerRef, tip, markProps } = useChartTooltip();
  const all = oppositionTable(matches).filter((r) => (bowl ? r.bowlingMatches > 0 : r.innings > 0));
  const rows = all.slice(0, OPPONENT_ROWS);
  const avg = (r: OppositionRow) => (bowl ? r.bowlingAverage : r.average);
  const avgs = rows.map(avg).filter((v): v is number => v != null);
  const min = avgs.length ? Math.min(...avgs) : 0;
  const max = avgs.length ? Math.max(...avgs) : 0;
  const emptyReason = bowl ? NO_BOWLING_REASON : "No batting recorded in this range";
  const columns = bowl
    ? ["Opponent", "Mat", "Wkts", "Conceded", "Avg", "Best"]
    : ["Opponent", "Inns", "Out", "Runs", "Avg", "HS"];

  const figures = (r: OppositionRow) =>
    bowl
      ? [
          r.bowlingMatches,
          r.wickets,
          r.runsConceded,
          fmt1(r.bowlingAverage),
          r.bestBowling ? `${r.bestBowling.wickets}/${r.bestBowling.runsConceded}` : null,
        ]
      : [
          r.innings,
          r.outs,
          r.runs,
          fmt1(r.average),
          r.highScore ? `${r.highScore.runs}${r.highScore.notOut ? "*" : ""}` : null,
        ];

  return (
    <ChartCard
      eyebrow="Versus opposition"
      title="Favourite opponents"
      note={coverageNote ?? undefined}
      loading={loading}
      points={all.length}
      minPoints={1}
      emptyReason={emptyReason}
      table={{ columns, rows: all.map((r) => [r.opponent, ...figures(r)]) }}
    >
      <div ref={containerRef} className="relative overflow-x-auto">
        <table className="w-full min-w-[420px] border-separate border-spacing-1 text-[13px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {columns.map((c, i) => (
                <th key={c} scope="col" className={i === 0 ? "text-left" : "text-right"}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const a = avg(r);
              const [n, key, third, avgText, best] = figures(r);
              const text = bowl
                ? `${r.opponent}: ${r.wickets} wickets at ${avgText ?? "–"} in ${r.bowlingMatches} matches`
                : `${r.opponent}: out ${r.outs} times in ${r.innings} innings, ${r.runs} runs at ${avgText ?? "–"}`;
              return (
                <tr key={r.key} data-testid="opponent-row">
                  <th
                    scope="row"
                    className="max-w-[10rem] truncate rounded-md bg-muted px-2.5 text-left font-semibold"
                  >
                    {r.opponent}
                  </th>
                  <td>
                    <div className={cell}>{n}</div>
                  </td>
                  <td>
                    <div
                      className={cell}
                      style={{ color: bowl ? "var(--win-fg)" : "var(--loss-fg)" }}
                    >
                      {key}
                    </div>
                  </td>
                  <td>
                    <div className={cell}>{third?.toLocaleString("en-AU")}</div>
                  </td>
                  <td>
                    {a == null ? (
                      <div className={cell}>–</div>
                    ) : (
                      <HeatCell
                        tip={text}
                        mark={markProps(text)}
                        alpha={heatAlpha(a, min, max, bowl)}
                        className="h-9 justify-end px-2.5 text-[14px]"
                      >
                        {avgText}
                      </HeatCell>
                    )}
                  </td>
                  <td>
                    <div className={cell}>{best ?? "–"}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <ChartTooltip tip={tip} />
      </div>
      <p className="text-[11px] text-muted-foreground">
        Cell shade shows {bowl ? "bowling" : "batting"} average against that club
        {bowl ? " (darker is better)" : ""}.
        {all.length > rows.length && ` Top ${rows.length} of ${all.length} opponents.`}
      </p>
    </ChartCard>
  );
}
