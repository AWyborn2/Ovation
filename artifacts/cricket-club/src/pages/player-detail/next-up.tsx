import { ChartCard, chartColor } from "@/components/stats-charts";
import type { NextMilestone } from "@/lib/stats-analytics";

const NOUN = { games: "senior games", runs: "career runs", wickets: "career wickets" } as const;

/**
 * "Next up": progress bars toward the next tier on the milestones-board
 * ladders (same ladders as the board, U4), with an ETA from the current rate.
 * Stats the player has never contributed to (e.g. wickets for a non-bowler)
 * are left out rather than shown as an endless 0%.
 */
export function NextUpCard({
  milestones,
  loading,
}: {
  milestones: NextMilestone[];
  loading: boolean;
}) {
  const shown = milestones.filter((m) => m.current > 0 || m.perMatch > 0);
  return (
    <ChartCard
      eyebrow="Milestone tracker"
      title="Next up"
      loading={loading}
      skeleton="cards"
      points={shown.length}
      minPoints={1}
      emptyReason="Every milestone on the board is already reached"
      table={{
        columns: ["Milestone", "Current", "Target", "ETA"],
        rows: shown.map((m) => [NOUN[m.stat], m.current, m.target, m.eta?.label ?? null]),
      }}
    >
      <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr))]">
        {shown.map((m) => {
          const pct = Math.round(m.progress * 100);
          const label = `${m.target.toLocaleString("en-AU")} ${NOUN[m.stat]}`;
          const eta = m.eta ? `${m.eta.label} at the current rate` : "No recent rate to project";
          return (
            <div key={m.stat} data-testid="next-up">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] font-semibold">{label}</span>
                <span className="font-serif text-[22px] font-bold tabular-nums">
                  {m.current.toLocaleString("en-AU")}
                  <span className="text-[12px] font-medium text-muted-foreground">
                    {" "}
                    / {m.target.toLocaleString("en-AU")}
                  </span>
                </span>
              </div>
              <div
                role="progressbar"
                aria-label={label}
                aria-valuemin={0}
                aria-valuemax={m.target}
                aria-valuenow={m.current}
                aria-valuetext={`${m.current.toLocaleString("en-AU")} of ${m.target.toLocaleString("en-AU")}`}
                className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted"
              >
                <div
                  className="h-full rounded-full motion-safe:transition-[width] motion-safe:duration-500"
                  style={{
                    width: `${pct}%`,
                    background: `linear-gradient(90deg, ${chartColor("--chart-a", 0.7)}, ${chartColor("--chart-a")})`,
                  }}
                />
              </div>
              <p className="mt-1.5 text-[12px] text-muted-foreground">
                {m.remaining.toLocaleString("en-AU")} to go · {eta}
              </p>
            </div>
          );
        })}
      </div>
    </ChartCard>
  );
}
