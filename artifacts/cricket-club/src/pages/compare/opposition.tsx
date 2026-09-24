import { SegmentedControl, type Option } from "@/components/broadcast";
import { ChartCard } from "@/components/stats-charts/chart-card";
import { ChartTooltip, useChartTooltip } from "@/components/stats-charts/chart-tooltip";
import type { Analytic, Nemesis } from "@/lib/stats-analytics";
import type { Discipline } from "@/lib/use-stats-view";
import { cn } from "@/lib/utils";
import { OPP_METRICS, OPP_TITLES, type MatrixRow, type OppMetric } from "./compare-data";
import { slotColor, type ComparedPlayer } from "./shared";

const DISCIPLINES: Option<Discipline>[] = [
  { value: "bat", label: "Batting" },
  { value: "bowl", label: "Bowling" },
];

function NemesisCard({ player, result }: { player: ComparedPlayer; result: Analytic<Nemesis> }) {
  const first = player.name.split(" ")[0] || player.name;
  return (
    <div
      data-testid="nemesis-card"
      className="flex min-w-0 items-center gap-4 rounded-xl border bg-muted/40 px-4 py-3"
      style={{ borderLeft: `3px solid ${slotColor(player)}` }}
    >
      {result.ok ? (
        <>
          <span
            className="font-serif text-[40px] font-extrabold leading-none"
            style={{ color: slotColor(player) }}
          >
            {result.data.top.dismissals}
          </span>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {first}'s nemesis
            </div>
            <div className="truncate text-[14px] font-bold">
              {result.data.top.bowler} · {result.data.top.opponent}
            </div>
            <div className="text-[12px] text-muted-foreground">
              Dismissed {first} {result.data.top.dismissals} times in{" "}
              {result.data.top.inningsVsOpponent} innings
            </div>
          </div>
        </>
      ) : (
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {first}'s nemesis
          </div>
          <div className="text-[12.5px] text-muted-foreground">{result.reason}</div>
        </div>
      )}
    </div>
  );
}

/**
 * Against the opposition: clubs × compared players for the chosen metric, from
 * each player's U4 opposition table over the range. Batting adds nemesis cards
 * (the bowler, keyed by club and parsed surname, who has dismissed each player
 * most — shown from 3 dismissals).
 */
export function OppositionMatrix({
  players,
  rows,
  metric,
  onMetric,
  d,
  onDiscipline,
  nemeses,
  rangeLabel,
  coverageNote,
  emptyReason,
  loading,
}: {
  players: ReadonlyArray<ComparedPlayer>;
  rows: ReadonlyArray<MatrixRow>;
  metric: OppMetric;
  onMetric: (m: OppMetric) => void;
  d: Discipline;
  onDiscipline: (d: Discipline) => void;
  nemeses: ReadonlyArray<Analytic<Nemesis>>;
  rangeLabel: string;
  coverageNote: string | null;
  emptyReason: string | null;
  loading: boolean;
}) {
  const { containerRef, tip, markProps } = useChartTooltip();
  const outs = metric === "outs";
  const cols = `minmax(96px,140px) repeat(${players.length}, minmax(0,1fr))`;
  const note =
    d === "bowl"
      ? "Shaded cells show the best bowling return against each club. Lower is better for average and economy."
      : outs
        ? 'Shaded cells mark the club that has dismissed each player most often. Counts come from the scorecard "how out" entries.'
        : "Shaded cells show the best return against each club.";

  return (
    <ChartCard
      eyebrow={`Against the opposition · ${rangeLabel}`}
      title={OPP_TITLES[metric]}
      loading={loading}
      empty={emptyReason != null}
      emptyReason={emptyReason ?? undefined}
      points={rows.length}
      minPoints={1}
      actions={
        <>
          <SegmentedControl
            label="Opposition discipline"
            options={DISCIPLINES}
            value={d}
            onChange={onDiscipline}
          />
          <SegmentedControl
            label="Opposition metric"
            options={OPP_METRICS[d].map((m) => ({ value: m.value, label: m.label }))}
            value={metric}
            onChange={onMetric}
          />
        </>
      }
      table={{
        columns: ["Opponent", ...players.map((p) => p.name)],
        rows: rows.map((r) => [r.opponent, ...r.cells.map((c) => c.tip)]),
      }}
    >
      <div ref={containerRef} className="relative flex flex-col gap-1.5 overflow-x-auto">
        <div className="grid items-center gap-3 pb-1" style={{ gridTemplateColumns: cols }}>
          <span />
          {players.map((p) => (
            <span
              key={p.slot}
              className="flex items-center gap-1.5 truncate text-[12px] font-semibold text-muted-foreground"
            >
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                style={{ background: slotColor(p) }}
              />
              {p.name}
            </span>
          ))}
        </div>
        {rows.map((r) => (
          <div
            key={r.key}
            data-testid="opposition-row"
            className="grid items-center gap-3"
            style={{ gridTemplateColumns: cols }}
          >
            <span className="truncate text-[13px] font-semibold">{r.opponent}</span>
            {r.cells.map((c, i) => {
              const p = players[i];
              const bar = outs ? "var(--loss-fg)" : slotColor(p);
              return (
                <div
                  key={p.slot}
                  {...markProps(c.tip)}
                  data-testid="opposition-cell"
                  data-shaded={c.shaded || undefined}
                  className={cn(
                    "grid grid-cols-[1fr_auto] items-center gap-2 rounded-lg px-2 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    c.shaded && (outs ? "bg-[var(--loss-bg)]" : "bg-[hsl(var(--primary)/0.14)]"),
                  )}
                >
                  <span className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${(c.width * 100).toFixed(2)}%`,
                        background: bar,
                        opacity: c.shaded ? 1 : 0.55,
                      }}
                    />
                  </span>
                  <span className="whitespace-nowrap text-right">
                    <strong
                      className={cn(
                        "font-serif text-[16px]",
                        c.shaded ? "font-black" : "font-bold",
                      )}
                    >
                      {c.display}
                    </strong>
                    {c.sub && <span className="text-[10.5px] text-muted-foreground"> {c.sub}</span>}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
        <ChartTooltip tip={tip} />
      </div>

      {d === "bat" && (
        <div className="mt-4 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr))]">
          {players.map((p, i) => (
            <NemesisCard key={p.slot} player={p} result={nemeses[i]} />
          ))}
        </div>
      )}
      <p className="mt-3 text-[12px] text-muted-foreground">
        {note}
        {coverageNote ? ` ${coverageNote}.` : ""}
      </p>
    </ChartCard>
  );
}
