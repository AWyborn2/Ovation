import type { ScorecardInnings } from "@workspace/scorecard";
import { CardHeader, extrasParts } from "./card-header";

interface BattingCardProps {
  innings: ScorecardInnings;
  onPlayerClick?: (playerId: number, name: string) => void;
}

const GRID = "3fr 4fr 40px 40px 52px";

export function BattingCard({ innings, onPlayerClick }: BattingCardProps) {
  const team = innings.battingTeam;
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
        {["BATSMAN", "DISMISSAL", "R", "B", "SR"].map((h, i) => (
          <div
            key={h}
            className="py-1 px-2"
            style={{
              color: c.text,
              fontSize: "clamp(8px, 1.2vw, 11px)",
              fontWeight: 700,
              textAlign: i === 0 ? "left" : i === 1 ? "center" : i >= 2 ? "center" : "left",
              letterSpacing: "0.06em",
              opacity: 0.8,
            }}
          >
            {h}
          </div>
        ))}
      </div>

      {/* Batsmen */}
      {innings.batsmen.length === 0 ? (
        <div className="px-3 py-3" style={{ background: c.rowOdd }}>
          <span style={{ color: c.rowText, fontSize: 12, opacity: 0.6, fontStyle: "italic" }}>No batting recorded.</span>
        </div>
      ) : (
        innings.batsmen.map((row, idx) => {
          const rowBg = idx % 2 === 0 ? c.rowOdd : c.rowEven;
          const clickable = row.playerId != null && onPlayerClick;
          return (
            <div
              key={`${row.name}-${idx}`}
              className="grid items-center"
              style={{ gridTemplateColumns: GRID, background: rowBg, borderBottom: `1px solid ${c.borderColor}` }}
            >
              <div className="px-2 py-[5px]">
                {clickable ? (
                  <button
                    onClick={() => onPlayerClick!(row.playerId!, row.name)}
                    className="text-left uppercase hover:underline focus:outline-none transition-opacity hover:opacity-80"
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
                    className="uppercase"
                    style={{ color: c.rowText, fontSize: "clamp(10px, 1.8vw, 14px)", fontWeight: 700, letterSpacing: "0.04em" }}
                  >
                    {row.name}
                  </span>
                )}
                {row.notOut && <span style={{ color: c.secondary, fontWeight: 800 }}> *</span>}
              </div>

              <div
                className="px-2 py-[5px] text-center"
                style={{ color: c.rowText, fontSize: "clamp(9px, 1.5vw, 12px)", fontWeight: 400, opacity: 0.9 }}
              >
                {row.dismissal ? (
                  <span style={{ fontStyle: row.notOut ? "italic" : "normal" }}>{row.dismissal}</span>
                ) : (
                  <span style={{ opacity: 0.5 }}>—</span>
                )}
              </div>

              <div className="text-center py-[5px]" style={{ color: c.rowText, fontSize: "clamp(11px, 2vw, 15px)", fontWeight: 800 }}>
                {row.runs ?? 0}
              </div>
              <div className="text-center py-[5px]" style={{ color: c.rowText, fontSize: "clamp(10px, 1.6vw, 13px)", fontWeight: 400, opacity: 0.7 }}>
                {row.balls ?? "—"}
              </div>
              <div className="text-center py-[5px]" style={{ color: c.rowText, fontSize: "clamp(10px, 1.6vw, 13px)", fontWeight: 400, opacity: 0.7 }}>
                {row.strikeRate != null ? row.strikeRate.toFixed(1) : "—"}
              </div>
            </div>
          );
        })
      )}

      {/* DNB */}
      {innings.didNotBat.length > 0 && (
        <div className="px-2 py-[4px]" style={{ background: c.rowEven, borderBottom: `1px solid ${c.borderColor}` }}>
          <span style={{ color: c.rowText, fontSize: "clamp(9px, 1.4vw, 12px)", opacity: 0.6, fontStyle: "italic" }}>
            Did not bat: {innings.didNotBat.join(", ")}
          </span>
        </div>
      )}

      {/* Totals */}
      <div
        className="grid items-center"
        style={{ gridTemplateColumns: "1fr 1fr 1fr", background: c.totalBg, borderTop: `2px solid ${c.secondary}`, padding: "6px 8px" }}
      >
        <div style={{ color: c.totalText, fontSize: "clamp(9px, 1.5vw, 12px)", fontWeight: 700 }}>
          OVERS {innings.oversTotal ?? "—"}
        </div>
        <div className="text-center" style={{ color: c.totalText, fontSize: "clamp(9px, 1.5vw, 12px)", fontWeight: 400 }}>
          EXTRAS {innings.extras.total}
          {parts.length > 0 && <span style={{ opacity: 0.7, fontSize: "clamp(7px, 1.1vw, 10px)" }}> ({parts.join(" ")})</span>}
        </div>
        <div className="text-right" style={{ color: c.totalText, fontSize: "clamp(16px, 3vw, 24px)", fontWeight: 900, letterSpacing: "0.02em" }}>
          {innings.totalRuns != null ? `${innings.totalRuns}/${innings.wickets ?? 0}` : "—"}
        </div>
      </div>
    </div>
  );
}
