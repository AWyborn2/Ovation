import { useMemo } from "react";
import { buildJuniorScorecard, type JuniorMatchDetail } from "@workspace/scorecard";
import { BattingCard } from "./batting-card";
import { BowlingCard } from "./bowling-card";

interface JuniorScorecardProps {
  match: JuniorMatchDetail;
}

/**
 * Branded two-innings digital scorecard for a junior match. Reuses the shared
 * batting/bowling cards via the junior view-model adapter so juniors get the
 * same look as the senior side. Junior participant ids are strings, so player
 * names render as plain text (no career-stats popup); private participants are
 * already masked server-side.
 */
export function JuniorScorecard({ match }: JuniorScorecardProps) {
  const scorecard = useMemo(() => buildJuniorScorecard(match), [match]);

  const hasAnyData = scorecard.innings.some(
    (inn) => inn.batsmen.length + inn.bowlers.length > 0,
  );

  if (!hasAnyData) {
    return (
      <div className="bg-card border border-border rounded-md p-8 text-center text-muted-foreground italic">
        No scorecard recorded for this match.
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-3 p-3 rounded-md overflow-hidden"
      style={{ background: "#0a1626" }}
    >
      {scorecard.innings.map((inn, i) => (
        <div key={i} className="flex flex-col gap-2">
          <BattingCard innings={inn} />
          <BowlingCard innings={inn} />
        </div>
      ))}
    </div>
  );
}
