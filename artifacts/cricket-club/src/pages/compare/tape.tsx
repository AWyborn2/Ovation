import { ChartCard } from "@/components/stats-charts/chart-card";
import { ChartTooltip, useChartTooltip } from "@/components/stats-charts/chart-tooltip";
import { cn } from "@/lib/utils";
import type { TapeRow } from "./compare-data";
import { slotColor, type ComparedPlayer } from "./shared";

/**
 * Tale of the tape: one row per metric, one thin bar per player. The leader is
 * bold at full opacity, the others at 45%. Lower-is-better rows (bowling
 * average, economy, strike rate) size bars min ÷ value so the best is longest.
 */
export function TaleOfTheTape({
  rows,
  players,
  rangeLabel,
  loading,
}: {
  rows: ReadonlyArray<TapeRow>;
  players: ReadonlyArray<ComparedPlayer>;
  rangeLabel: string;
  loading: boolean;
}) {
  const { containerRef, tip, markProps } = useChartTooltip();
  const hasData = rows.some((r) => r.best.length > 0);

  return (
    <ChartCard
      eyebrow={`Career numbers · ${rangeLabel}`}
      title="Tale of the tape"
      loading={loading}
      empty={!hasData}
      emptyReason="No games recorded in this range"
      table={{
        columns: ["Metric", ...players.map((p) => p.name)],
        rows: rows.map((r) => [r.label, ...r.displays]),
      }}
    >
      <div ref={containerRef} className="relative">
        <ul className="flex flex-col" aria-label="Tale of the tape">
          {rows.map((r) => (
            <li
              key={r.key}
              data-testid="tape-row"
              data-metric={r.key}
              className="grid grid-cols-[minmax(84px,120px)_1fr] items-center gap-3 border-b py-2.5 last:border-0"
            >
              <span className="text-[13px] font-semibold text-foreground">
                {r.label}
                {r.lowerIsBetter && (
                  <span className="block text-[10.5px] font-normal text-muted-foreground">
                    lower is better
                  </span>
                )}
              </span>
              <div className="flex flex-col gap-1.5">
                {players.map((p, i) => {
                  const lead = r.leader === i;
                  return (
                    <div
                      key={p.slot}
                      {...markProps(`${p.name}: ${r.label} ${r.displays[i]}`)}
                      data-testid="tape-bar"
                      data-leader={lead || undefined}
                      className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <span
                          data-testid="tape-fill"
                          className="block h-full rounded-full motion-safe:transition-[width] motion-safe:duration-500 motion-safe:ease-[cubic-bezier(.2,.8,.2,1)]"
                          style={{
                            width: `${(r.widths[i] * 100).toFixed(2)}%`,
                            background: slotColor(p),
                            opacity: lead ? 1 : 0.45,
                          }}
                        />
                      </span>
                      <span
                        className={cn(
                          "min-w-[3.5rem] text-right font-serif text-[15px] tabular-nums",
                          lead
                            ? "font-extrabold text-foreground"
                            : "font-medium text-muted-foreground",
                        )}
                      >
                        {r.displays[i]}
                      </span>
                    </div>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
        <ChartTooltip tip={tip} />
      </div>
    </ChartCard>
  );
}
