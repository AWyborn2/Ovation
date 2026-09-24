import type { ReactNode } from "react";
import {
  ChartCard,
  ChartTooltip,
  HeatCell,
  heatStep,
  heatStepBg,
  useChartTooltip,
  type HeatStep,
} from "@/components/stats-charts";
import { seasonLabel } from "@/lib/use-stats-view";
import { shortSeason, type HeatmapModel } from "./model";
import { SCROLLER_STYLE, useScrollToEnd } from "./use-scroll-to-end";

const STEPS: HeatStep[] = [0, 1, 2, 3];

/**
 * Hundreds heatmap: seasons × grades grid of century counts, 38px cells on the
 * 4-step scale (0 / 1 / 2 / 3+). Built client-side from the centuries list,
 * filtered by the grade tab and season range. Scrolls sideways on narrow
 * screens rather than squashing the cells.
 */
export function HundredsHeatmap({
  model,
  loading,
  error,
}: {
  model: HeatmapModel;
  loading: boolean;
  error: boolean;
}) {
  const { containerRef, tip, markProps } = useChartTooltip();
  const scroller = useScrollToEnd<HTMLDivElement>(model.seasons.join());
  const cols = `104px repeat(${model.seasons.length}, minmax(34px, 1fr))`;
  const count = (g: string, s: number) => model.counts.get(g)?.get(s) ?? 0;

  return (
    <ChartCard
      eyebrow="Centuries by season and grade"
      title="Hundreds heatmap"
      loading={loading}
      points={model.total}
      minPoints={1}
      empty={error}
      emptyReason={error ? "Centuries aren't available" : "No hundreds recorded in this range"}
      table={{
        columns: ["Grade", ...model.seasons.map(seasonLabel)],
        rows: model.grades.map((g) => [g, ...model.seasons.map((s) => count(g, s))]),
      }}
    >
      <div ref={containerRef} className="relative">
        <div ref={scroller} className="overflow-x-auto pb-1" style={SCROLLER_STYLE}>
          <div
            data-testid="hundreds-heatmap"
            className="grid gap-1"
            style={{
              gridTemplateColumns: cols,
              minWidth: 104 + model.seasons.length * 38,
            }}
          >
            <span aria-hidden />
            {model.seasons.map((s) => (
              <span
                key={s}
                aria-hidden
                className="h-5 text-center font-mono text-[10px] text-muted-foreground"
              >
                {shortSeason(s)}
              </span>
            ))}
            {model.grades.map((g) => (
              <Row key={g} grade={g}>
                {model.seasons.map((s) => {
                  const n = count(g, s);
                  const tip = `${g} · ${seasonLabel(s)}: ${n} ${n === 1 ? "hundred" : "hundreds"}`;
                  return (
                    <HeatCell
                      key={s}
                      tip={tip}
                      step={heatStep(n)}
                      mark={markProps(tip)}
                      className="h-[38px] text-base"
                    >
                      {n || ""}
                    </HeatCell>
                  );
                })}
              </Row>
            ))}
          </div>
        </div>
        <ChartTooltip tip={tip} />
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        0
        <span className="flex gap-[3px]" aria-hidden>
          {STEPS.map((s) => (
            <span
              key={s}
              className="h-3 w-[22px] rounded-[3px]"
              style={{ background: heatStepBg(s) }}
            />
          ))}
        </span>
        3+ hundreds
      </div>
    </ChartCard>
  );
}

function Row({ grade, children }: { grade: string; children: ReactNode }) {
  return (
    <>
      <span className="flex h-[38px] items-center truncate text-xs font-semibold text-foreground">
        {grade}
      </span>
      {children}
    </>
  );
}
