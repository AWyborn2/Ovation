import type { PartnershipRecord } from "@workspace/api-client-react";
import {
  ChartCard,
  ChartTooltip,
  SERIES_TOKENS,
  chartColor,
  useChartTooltip,
} from "@/components/stats-charts";
import { cn } from "@/lib/utils";
import { pairLabel } from "./model";

/**
 * Best stand for each wicket, 1st to 10th: one bar per wicket with the pair and
 * season inside it; the overall record is solid accent. Partnerships are
 * curated club data — central-read tenants have none yet, so they see the
 * empty state rather than another club's stands.
 */
export function Partnerships({
  stands,
  loading,
  error,
}: {
  stands: PartnershipRecord[];
  loading: boolean;
  error: boolean;
}) {
  const { containerRef, tip, markProps } = useChartTooltip();
  const max = Math.max(1, ...stands.map((s) => s.runs));
  const accent = SERIES_TOKENS[0];

  return (
    <ChartCard
      eyebrow="Best stand for each wicket"
      title="Partnerships"
      loading={loading}
      points={stands.length}
      minPoints={1}
      empty={error}
      emptyReason={error ? "Partnerships aren't available" : "No partnerships recorded"}
      emptyMessage={
        error
          ? undefined
          : "Scorecards don't capture partnerships, so stands appear here once the club adds them."
      }
      table={{
        columns: ["Wicket", "Runs", "Batters", "Season", "Grade"],
        rows: stands.map((s) => [s.wicket, s.runs, pairLabel(s.batsmen), s.season, s.grade]),
      }}
    >
      <div ref={containerRef} className="relative">
        <ul
          data-testid="partnerships"
          aria-label="Best stand for each wicket"
          className="flex flex-col gap-[7px]"
        >
          {stands.map((s) => {
            const record = s.runs === max;
            const pair = pairLabel(s.batsmen);
            const label = `${s.wicket} wicket: ${s.runs} by ${pair}${s.season ? ` · ${s.season}` : ""}${s.opposition ? ` v ${s.opposition}` : ""} · ${s.grade}`;
            return (
              <li
                key={s.id}
                {...markProps(label)}
                data-testid="partnership-row"
                data-record={record || undefined}
                className="grid grid-cols-[36px_1fr_44px] items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="font-mono text-xs text-muted-foreground">{s.wicket}</span>
                <span className="relative h-[26px] overflow-hidden rounded-md bg-muted">
                  <span
                    className="absolute inset-y-0 left-0 rounded-md motion-safe:transition-[width] motion-safe:duration-500"
                    style={{
                      width: `${((s.runs / max) * 100).toFixed(1)}%`,
                      background: chartColor(accent, record ? undefined : 0.3),
                    }}
                  />
                  <span
                    className={cn(
                      "absolute inset-y-0 left-2.5 flex items-center whitespace-nowrap text-xs font-semibold",
                      record ? "text-primary-foreground" : "text-foreground",
                    )}
                  >
                    {pair}
                    {s.season ? ` · ${s.season}` : ""}
                  </span>
                </span>
                <span className="text-right font-serif text-[20px] font-extrabold">{s.runs}</span>
              </li>
            );
          })}
        </ul>
        <ChartTooltip tip={tip} />
      </div>
    </ChartCard>
  );
}
