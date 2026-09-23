import { useMemo, useState } from "react";
import { buildScorecard, type MatchDetail, type ScorecardInnings } from "@workspace/scorecard";
import { TableCard, Td, Th, UnderlineTabs } from "@/components/broadcast";
import { PlayerStatsModal } from "./player-stats-modal";

type OnPlayer = (id: number, name: string) => void;

/** Short team label for the innings tabs ("Rockingham", not "Rockingham Cricket Club"). */
export function teamLabel(team: { name: string; shortName: string | null }): string {
  return (
    team.shortName?.trim() || team.name.replace(/\s+(cricket club|cc)$/i, "").trim() || team.name
  );
}

function PlayerName({
  id,
  name,
  onPlayer,
}: {
  id: number | null;
  name: string;
  onPlayer: OnPlayer;
}) {
  // Tenant-club players (not fill-ins) open their career popup.
  if (id != null && id < 90000) {
    return (
      <button
        type="button"
        onClick={() => onPlayer(id, name)}
        className="text-left font-semibold hover:text-primary-text hover:underline"
      >
        {name}
      </button>
    );
  }
  return <span className="font-semibold">{name}</span>;
}

const num = (v: number | null | undefined) => (v == null ? "–" : v);
const dec = (v: number | null | undefined) => (v == null ? "–" : v.toFixed(2));

function BattingTable({ inn, onPlayer }: { inn: ScorecardInnings; onPlayer: OnPlayer }) {
  const extras = inn.extras;
  const extrasDetail = [
    extras.wides ? `w ${extras.wides}` : null,
    extras.noBalls ? `nb ${extras.noBalls}` : null,
    extras.other ? `b/lb ${extras.other}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <section className="space-y-2">
      <h2 className="text-[22px] leading-none">Batting</h2>
      <TableCard minWidth={480}>
        <thead>
          <tr>
            <Th>Batter</Th>
            <Th num>R</Th>
            <Th num>B</Th>
            <Th num>4s</Th>
            <Th num>6s</Th>
            <Th num>SR</Th>
          </tr>
        </thead>
        <tbody>
          {inn.batsmen.map((b, i) => (
            <tr key={`${b.name}-${i}`} className="border-t">
              <Td className="whitespace-normal">
                <PlayerName id={b.playerId} name={b.name} onPlayer={onPlayer} />
                <div className="text-[12.5px] text-muted-foreground">
                  {b.notOut ? "not out" : b.dismissal || "–"}
                </div>
              </Td>
              <Td num className="text-base font-bold">
                {num(b.runs)}
                {b.notOut && b.runs != null ? "*" : ""}
              </Td>
              <Td num>{num(b.balls)}</Td>
              <Td num>{num(b.fours)}</Td>
              <Td num>{num(b.sixes)}</Td>
              <Td num>{b.strikeRate == null ? "–" : b.strikeRate.toFixed(1)}</Td>
            </tr>
          ))}
          <tr className="border-t">
            <Td>
              <span className="font-semibold">Extras</span>
              {extrasDetail && (
                <span className="ml-2 text-[12.5px] text-muted-foreground">({extrasDetail})</span>
              )}
            </Td>
            <Td num className="font-semibold">
              {extras.total}
            </Td>
            <Td />
            <Td />
            <Td />
            <Td />
          </tr>
          <tr className="border-t bg-muted">
            <Td>
              <span className="font-semibold">Total</span>
              {inn.oversTotal && (
                <span className="ml-2 text-[12.5px] text-muted-foreground">
                  ({inn.oversTotal} ov)
                </span>
              )}
            </Td>
            <Td num className="font-serif text-lg font-bold">
              {inn.totalRuns == null
                ? "–"
                : inn.wickets != null && inn.wickets < 10
                  ? `${inn.wickets}/${inn.totalRuns}`
                  : inn.totalRuns}
            </Td>
            <Td />
            <Td />
            <Td />
            <Td />
          </tr>
        </tbody>
      </TableCard>
      {inn.didNotBat.length > 0 && (
        <p className="text-[13px] text-muted-foreground">
          <span className="font-semibold text-foreground">Did not bat:</span>{" "}
          {inn.didNotBat.join(", ")}
        </p>
      )}
    </section>
  );
}

function BowlingTable({
  inn,
  onPlayer,
  hatTrickIds,
}: {
  inn: ScorecardInnings;
  onPlayer: OnPlayer;
  hatTrickIds?: Set<number>;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-[22px] leading-none">Bowling</h2>
      <TableCard minWidth={420}>
        <thead>
          <tr>
            <Th>Bowler</Th>
            <Th num>O</Th>
            <Th num>M</Th>
            <Th num>R</Th>
            <Th num>W</Th>
            <Th num>Econ</Th>
          </tr>
        </thead>
        <tbody>
          {inn.bowlers.map((b, i) => (
            <tr key={`${b.name}-${i}`} className="border-t">
              <Td>
                <PlayerName id={b.playerId} name={b.name} onPlayer={onPlayer} />
                {b.playerId != null && hatTrickIds?.has(b.playerId) && (
                  <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary-text">
                    Hat-trick
                  </span>
                )}
              </Td>
              <Td num>{b.overs ?? "–"}</Td>
              <Td num>{num(b.maidens)}</Td>
              <Td num>{num(b.runs)}</Td>
              <Td num className="text-base font-bold text-primary-text">
                {num(b.wickets)}
              </Td>
              <Td num>{dec(b.economy)}</Td>
            </tr>
          ))}
          {inn.bowlers.length === 0 && (
            <tr className="border-t">
              <td colSpan={6} className="p-6 text-center text-sm text-muted-foreground">
                No bowling figures recorded.
              </td>
            </tr>
          )}
        </tbody>
      </TableCard>
    </section>
  );
}

/**
 * Broadcast scorecard: underline tabs per innings, each showing a batting and a
 * bowling card side by side (stacked on narrow screens). Built on the shared
 * `buildScorecard` view-model so web and mobile read the same innings order.
 */
export function BroadcastScorecard({
  match,
  hatTrickIds,
}: {
  match: MatchDetail;
  hatTrickIds?: Set<number>;
}) {
  const scorecard = useMemo(() => buildScorecard(match), [match]);
  const [tab, setTab] = useState("0");
  const [selected, setSelected] = useState<{ id: number; name: string } | null>(null);

  const hasAnyData = scorecard.innings.some(
    (inn) => inn.batsmen.length + inn.bowlers.length + inn.didNotBat.length > 0,
  );
  if (!hasAnyData) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
        {match.abandoned
          ? "Match abandoned — no scorecard recorded."
          : "No scorecard recorded for this match."}
      </div>
    );
  }

  const active = scorecard.innings[Number(tab)] ?? scorecard.innings[0];
  return (
    <div className="space-y-5" data-testid="broadcast-scorecard">
      <UnderlineTabs
        label="Innings"
        value={tab}
        onChange={setTab}
        tabs={scorecard.innings.map((inn, i) => ({
          value: String(i),
          label: `${teamLabel(inn.battingTeam)} innings`,
        }))}
      />
      <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,520px),1fr))]">
        <BattingTable inn={active} onPlayer={(id, name) => setSelected({ id, name })} />
        <BowlingTable
          inn={active}
          hatTrickIds={hatTrickIds}
          onPlayer={(id, name) => setSelected({ id, name })}
        />
      </div>
      {!scorecard.orderKnown && (
        <p className="text-center text-xs text-muted-foreground">
          Batting order not confirmed for this match — innings shown{" "}
          {match.club?.name ?? "home side"} first.
        </p>
      )}
      <PlayerStatsModal
        playerId={selected?.id ?? null}
        fallbackName={selected?.name}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
