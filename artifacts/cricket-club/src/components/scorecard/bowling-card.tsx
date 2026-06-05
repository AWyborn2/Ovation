import type { ScorecardInnings } from "@workspace/scorecard";
import { Flame } from "lucide-react";
import { CardHeader, extrasParts } from "./card-header";

interface BowlingCardProps {
  innings: ScorecardInnings;
  hatTrickIds?: Set<number>;
  onPlayerClick?: (playerId: number, name: string) => void;
}

const GRID = "3fr 56px 60px 52px 64px 56px";

export function BowlingCard({ innings, hatTrickIds, onPlayerClick }: BowlingCardProps) {
  const team = innings.bowlingTeam;
  const c = team.colors;
  const parts = extrasParts(innings.extras);

  return (
    <div className="w-full overflow-hidden rounded-sm shadow-lg" style={{ fontFamily: "'Arial Narrow', Arial, sans-serif" }}>
      <CardHeader team={team} inningsLabel={innings.inningsLabel} />

      {/* Column headers */}
      <div
        className="grid"
        style={{ gridTemplateColumns: GRID, background: c.primary, borderBottom: `1px solid ${c.borderColor}`, opacity: 0.85 }}
      >
        {["BOWLER", "OVERS", "MAIDENS", "RUNS", "WICKETS", "ECON"].map((h, i) => (
          <div
            key={h}
            className="py-1 px-2"
            style={{
              color: c.text,
              fontSize: "clamp(7px, 1.1vw, 10px)",
              fontWeight: 700,
              textAlign: i === 0 ? "left" : "center",
              letterSpacing: "0.05em",
              opacity: 0.8,
            }}
          >
            {h}
          </div>
        ))}
      </div>

      {/* Bowlers */}
      {innings.bowlers.length === 0 ? (
        <div className="px-3 py-3" style={{ background: c.rowOdd }}>
          <span style={{ color: c.rowText, fontSize: 12, opacity: 0.6, fontStyle: "italic" }}>No bowling recorded.</span>
        </div>
      ) : (
        innings.bowlers.map((row, idx) => {
          const rowBg = idx % 2 === 0 ? c.rowOdd : c.rowEven;
          const clickable = row.playerId != null && onPlayerClick;
          const hasHatTrick = row.playerId != null && hatTrickIds?.has(row.playerId);
          return (
            <div
              key={`${row.name}-${idx}`}
              className="grid items-center"
              style={{ gridTemplateColumns: GRID, background: rowBg, borderBottom: `1px solid ${c.borderColor}` }}
            >
              <div className="px-2 py-[5px] flex items-center gap-1.5 min-w-0">
                {clickable ? (
                  <button
                    onClick={() => onPlayerClick!(row.playerId!, row.name)}
                    className="text-left uppercase hover:underline focus:outline-none transition-opacity hover:opacity-80 truncate"
                    style={{
                      color: c.rowText,
                      fontSize: "clamp(10px, 1.8vw, 14px)",
                      fontWeight: 700,
                      letterSpacing: "0.04em",
                      background: "none",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                    }}
                    data-testid={`button-player-${row.playerId}`}
                  >
                    {row.name}
                  </button>
                ) : (
                  <span
                    className="uppercase truncate"
                    style={{ color: c.rowText, fontSize: "clamp(10px, 1.8vw, 14px)", fontWeight: 700, letterSpacing: "0.04em" }}
                  >
                    {row.name}
                  </span>
                )}
                {hasHatTrick && (
                  <Flame className="h-3 w-3 shrink-0" style={{ color: c.secondary }} aria-label="Hat-trick" />
                )}
              </div>

              {[
                row.overs ?? "—",
                row.maidens ?? "—",
                row.runs ?? "—",
                row.wickets ?? 0,
                row.economy != null ? row.economy.toFixed(2) : "—",
              ].map((val, i) => (
                <div
                  key={i}
                  className="text-center py-[5px]"
                  style={{
                    color: c.rowText,
                    fontSize: i === 3 ? "clamp(11px, 2vw, 15px)" : "clamp(10px, 1.7vw, 13px)",
                    fontWeight: i === 3 ? 800 : 400,
                    opacity: i === 3 ? 1 : 0.85,
                  }}
                >
                  {val}
                </div>
              ))}
            </div>
          );
        })
      )}

      {/* Bottom: extras conceded + total */}
      <div style={{ background: c.totalBg, borderTop: `2px solid ${c.secondary}` }}>
        <div className="flex items-center justify-between px-2 py-[6px]">
          <div style={{ color: c.totalText, fontSize: "clamp(9px, 1.4vw, 12px)", fontWeight: 700 }}>
            EXTRAS {innings.extras.total}
            {parts.length > 0 && <span style={{ opacity: 0.7, fontSize: "clamp(7px, 1.1vw, 10px)" }}> ({parts.join(" ")})</span>}
          </div>
          <div style={{ color: c.totalText, fontSize: "clamp(9px, 1.5vw, 12px)", fontWeight: 700 }}>
            OVERS {innings.oversTotal ?? "—"}
          </div>
          <div style={{ color: c.totalText, fontSize: "clamp(16px, 3vw, 24px)", fontWeight: 900, letterSpacing: "0.02em" }}>
            {innings.totalRuns != null ? `${innings.totalRuns}/${innings.wickets ?? 0}` : "—"}
          </div>
        </div>
      </div>
    </div>
  );
}
