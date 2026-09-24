import {
  ChartCard,
  ChartTooltip,
  SERIES_TOKENS,
  chartColor,
  useChartTooltip,
} from "@/components/stats-charts";
import { seasonLabel } from "@/lib/use-stats-view";
import { shortSeason, type FiveForsModel } from "./model";
import { SCROLLER_STYLE, useScrollToEnd } from "./use-scroll-to-end";

const ACCENT = SERIES_TOKENS[0];

/**
 * Five-fors timeline: a column per season with one dot per five-wicket haul.
 * Solid dots are 7+ wickets; ringed soft dots are 5–6. Tooltips carry the
 * figures, bowler and grade. Built client-side from the five-wicket-hauls list,
 * filtered by the grade tab and season range.
 */
export function FiveForsTimeline({
  model,
  loading,
  error,
}: {
  model: FiveForsModel;
  loading: boolean;
  error: boolean;
}) {
  const { containerRef, tip, markProps } = useChartTooltip();
  const minWidth = model.columns.length * 28;
  const scroller = useScrollToEnd<HTMLDivElement>(model.columns.length);

  return (
    <ChartCard
      eyebrow="5-wicket hauls · each dot is one haul"
      title="Five-fors timeline"
      loading={loading}
      points={model.total}
      minPoints={1}
      empty={error}
      emptyReason={
        error ? "Five-wicket hauls aren't available" : "No five-wicket hauls recorded in this range"
      }
      table={{
        columns: ["Season", "Hauls", "Figures"],
        rows: model.columns
          .filter((c) => c.hauls.length > 0)
          .map((c) => [
            seasonLabel(c.season),
            c.hauls.length,
            c.hauls.map((h) => h.tip.split(" · ")[0]).join(", "),
          ]),
      }}
    >
      <div ref={containerRef} className="relative">
        <div ref={scroller} className="overflow-x-auto pb-1" style={SCROLLER_STYLE}>
          <div style={{ minWidth }}>
            <div data-testid="five-fors" className="flex min-h-[180px] items-end gap-1.5 border-b">
              {model.columns.map((c) => (
                <div
                  key={c.season}
                  className="flex flex-1 flex-col-reverse items-center gap-1 pb-1"
                >
                  {c.hauls.map((h) => (
                    <span
                      key={h.id}
                      {...markProps(h.tip)}
                      role="img"
                      data-testid="haul-dot"
                      data-haul={h.solid ? "solid" : "ring"}
                      className="h-4 w-4 shrink-0 rounded-full border-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      style={{
                        borderColor: chartColor(ACCENT),
                        background: h.solid ? chartColor(ACCENT) : chartColor(ACCENT, 0.18),
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
            <div className="mt-1.5 flex gap-1.5" aria-hidden>
              {model.columns.map((c) => (
                <span
                  key={c.season}
                  className="flex-1 text-center font-mono text-[10px] text-muted-foreground"
                >
                  {shortSeason(c.season)}
                </span>
              ))}
            </div>
          </div>
        </div>
        <ChartTooltip tip={tip} />
      </div>
      <div className="mt-3 flex flex-wrap gap-3.5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-3 w-3 rounded-full"
            style={{ background: chartColor(ACCENT) }}
          />
          7+ wickets
        </span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-3 w-3 rounded-full border-2"
            style={{ borderColor: chartColor(ACCENT), background: chartColor(ACCENT, 0.18) }}
          />
          5–6 wickets
        </span>
      </div>
    </ChartCard>
  );
}
