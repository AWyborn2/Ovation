import { Link } from "wouter";
import { ChartCard, ChartTooltip, useChartTooltip } from "@/components/stats-charts";
import type { WatchItem } from "./model";

const fmt = (n: number) => n.toLocaleString("en-AU");

/**
 * Record watch: active players within reach of a record or a leaderboard place
 * (rules in `buildRecordWatch`). Each card shows the target, the amount still
 * needed, a progress bar and the current / goal figures.
 */
export function RecordWatch({
  items,
  loading,
  scope,
}: {
  items: WatchItem[];
  loading: boolean;
  scope: string;
}) {
  const { containerRef, tip, markProps } = useChartTooltip();
  return (
    <ChartCard
      eyebrow="Active players closing in"
      title="Record watch"
      note={`Career · ${scope}`}
      loading={loading}
      skeleton="cards"
      points={items.length}
      minPoints={1}
      emptyReason="Nobody is within reach of a record right now"
      emptyMessage="Active players appear here when they're within 10% of a leaderboard place or a club first."
      table={{
        columns: ["Player", "Target", "Needs", "Current", "Goal"],
        rows: items.map((w) => [w.name, w.target, w.need, w.current, w.goal]),
      }}
    >
      <div
        ref={containerRef}
        data-testid="record-watch"
        className="relative grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,270px),1fr))]"
      >
        {items.map((w) => (
          <div
            key={w.key}
            data-testid="watch-card"
            className="flex flex-col gap-2.5 rounded-xl bg-muted p-4"
          >
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden
                className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-full border-[1.5px] border-primary bg-card font-serif text-[15px] font-extrabold text-primary-text"
              >
                {w.initials}
              </span>
              <div className="min-w-0">
                <Link
                  href={`/players/${w.playerId}`}
                  className="font-semibold text-foreground hover:underline"
                >
                  {w.name}
                </Link>
                <div className="text-[12.5px] leading-snug text-muted-foreground">{w.target}</div>
              </div>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-serif text-[30px] font-extrabold leading-none text-primary-text">
                {w.need}
              </span>
              <span className="text-right text-xs text-muted-foreground">{w.note}</span>
            </div>
            <div
              {...markProps(`${w.name}: ${fmt(w.current)} of ${fmt(w.goal)}`)}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={w.goal}
              aria-valuenow={w.current}
              className="h-2 overflow-hidden rounded-full bg-card outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div
                className="h-full rounded-full bg-primary motion-safe:transition-[width] motion-safe:duration-500"
                style={{ width: `${Math.min(100, w.progress * 100).toFixed(1)}%` }}
              />
            </div>
            <div className="flex justify-between font-mono text-[11px] text-muted-foreground">
              <span>{fmt(w.current)}</span>
              <span>{fmt(w.goal)}</span>
            </div>
          </div>
        ))}
        <ChartTooltip tip={tip} />
      </div>
    </ChartCard>
  );
}
