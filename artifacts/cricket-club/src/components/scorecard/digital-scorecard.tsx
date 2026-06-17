import { useMemo, useState } from "react";
import { buildScorecard, type MatchDetail } from "@workspace/scorecard";
import { BattingCard } from "./batting-card";
import { BowlingCard } from "./bowling-card";
import { PlayerStatsModal } from "./player-stats-modal";

interface DigitalScorecardProps {
  match: MatchDetail;
  hatTrickIds?: Set<number>;
}

/**
 * Branded two-innings digital scorecard. Maps the match-detail DTO into the
 * shared view-model and renders, per innings, a batting card (batting team
 * colours) followed by a bowling card (bowling team colours). Tapping a tenant
 * club player opens their career-stats popup; opposition and fill-in players
 * render as plain names.
 */
export function DigitalScorecard({ match, hatTrickIds }: DigitalScorecardProps) {
  const scorecard = useMemo(() => buildScorecard(match), [match]);
  const [selected, setSelected] = useState<{ id: number; name: string } | null>(null);

  const onPlayerClick = (id: number, name: string) => setSelected({ id, name });

  const hasAnyData = scorecard.innings.some(
    (inn) => inn.batsmen.length + inn.bowlers.length + inn.didNotBat.length > 0,
  );

  if (!hasAnyData) {
    return (
      <div className="bg-card border border-border rounded-md p-8 text-center text-muted-foreground italic">
        {match.abandoned ? "Match abandoned — no scorecard recorded." : "No scorecard recorded for this match."}
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-3 p-3 rounded-md overflow-hidden" style={{ background: "#0a1626" }}>
        {scorecard.innings.map((inn, i) => (
          <div key={i} className="flex flex-col gap-2">
            <BattingCard innings={inn} onPlayerClick={onPlayerClick} />
            <BowlingCard innings={inn} hatTrickIds={hatTrickIds} onPlayerClick={onPlayerClick} />
          </div>
        ))}
        {!scorecard.orderKnown && (
          <p className="text-center" style={{ color: "#6b7280", fontSize: 11 }}>
            Batting order not confirmed for this match — innings shown{" "}
            {match.club?.name ?? "home side"} first.
          </p>
        )}
      </div>

      <PlayerStatsModal
        playerId={selected?.id ?? null}
        fallbackName={selected?.name}
        onClose={() => setSelected(null)}
      />
    </>
  );
}
