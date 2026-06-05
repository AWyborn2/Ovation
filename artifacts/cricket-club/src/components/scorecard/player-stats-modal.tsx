import { useGetPlayer, getGetPlayerQueryKey, type Stat } from "@workspace/api-client-react";
import { Link } from "wouter";

interface PlayerStatsModalProps {
  playerId: number | null;
  fallbackName?: string;
  onClose: () => void;
}

const num = (n: number | null | undefined) => n ?? 0;

/** Highest numeric high-score across grade rows (strips the trailing "*"). */
function bestHighScore(stats: Stat[]): string | null {
  let best = -1;
  let label: string | null = null;
  for (const s of stats) {
    if (!s.highScore) continue;
    const v = parseInt(s.highScore.replace(/[^0-9]/g, ""), 10);
    if (Number.isFinite(v) && v > best) {
      best = v;
      label = s.highScore;
    }
  }
  return label;
}

/** Best bowling (most wickets, then fewest runs) across grade rows. */
function bestBowling(stats: Stat[]): string | null {
  let bestW = -1;
  let bestR = Infinity;
  let label: string | null = null;
  for (const s of stats) {
    if (!s.bestBowling) continue;
    const m = /(\d+)\s*\/\s*(\d+)/.exec(s.bestBowling);
    if (!m) continue;
    const w = parseInt(m[1], 10);
    const r = parseInt(m[2], 10);
    if (w > bestW || (w === bestW && r < bestR)) {
      bestW = w;
      bestR = r;
      label = s.bestBowling;
    }
  }
  return label;
}

export function PlayerStatsModal({ playerId, fallbackName, onClose }: PlayerStatsModalProps) {
  const { data, isLoading } = useGetPlayer(playerId ?? 0, {
    query: { enabled: playerId != null, queryKey: getGetPlayerQueryKey(playerId ?? 0) },
  });

  if (playerId == null) return null;

  const stats = data?.stats ?? [];
  const games = stats.reduce((a, s) => a + num(s.games), 0);
  const innings = stats.reduce((a, s) => a + num(s.innings), 0);
  const notOuts = stats.reduce((a, s) => a + num(s.notOuts), 0);
  const runs = stats.reduce((a, s) => a + num(s.runs), 0);
  const fifties = stats.reduce((a, s) => a + num(s.fifties), 0);
  const hundreds = stats.reduce((a, s) => a + num(s.hundreds), 0);
  const wickets = stats.reduce((a, s) => a + num(s.wickets), 0);
  const runsConceded = stats.reduce((a, s) => a + num(s.runsConceded), 0);
  const fiveWickets = stats.reduce((a, s) => a + num(s.fiveWickets), 0);
  const catches = stats.reduce((a, s) => a + num(s.catches), 0);
  const stumpings = stats.reduce((a, s) => a + num(s.stumpings), 0);
  const runOuts = stats.reduce((a, s) => a + num(s.runOuts), 0);

  const dismissals = innings - notOuts;
  const batAvg = dismissals > 0 ? runs / dismissals : null;
  const bowlAvg = wickets > 0 ? runsConceded / wickets : null;
  const hasBatting = innings > 0 || runs > 0;
  const hasBowling = wickets > 0 || runsConceded > 0;
  const hasFielding = catches + stumpings + runOuts > 0;

  const name = data ? `${data.givenName} ${data.surname}`.trim() : (fallbackName ?? "Player");

  const Cell = ({ label, value }: { label: string; value: string | number | null }) => (
    <div className="rounded p-2 text-center" style={{ background: "rgba(255,255,255,0.04)" }}>
      <p style={{ color: "#e5e7eb", fontSize: 18, fontWeight: 800 }}>{value ?? "—"}</p>
      <p style={{ color: "#6b7280", fontSize: 9, fontWeight: 600, letterSpacing: "0.06em" }}>{label.toUpperCase()}</p>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg overflow-hidden shadow-2xl"
        style={{ background: "#0c1c33", border: "1px solid rgba(255,255,255,0.12)" }}
        onClick={(e) => e.stopPropagation()}
        data-testid="modal-player-stats"
      >
        <div className="flex items-center justify-between px-5 py-4" style={{ background: "#00305c", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="min-w-0">
            <p className="uppercase truncate" style={{ color: "#f5a623", fontSize: 18, fontWeight: 800, letterSpacing: "0.06em" }}>
              {name}
            </p>
            {data?.gradesPlayed && <p style={{ color: "#9ca3af", fontSize: 12, marginTop: 2 }} className="truncate">{data.gradesPlayed}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ color: "#9ca3af", background: "none", border: "none", fontSize: 22, cursor: "pointer", lineHeight: 1 }}
            data-testid="button-close-modal"
          >
            ×
          </button>
        </div>

        <div className="p-5">
          {isLoading ? (
            <p style={{ color: "#9ca3af", fontSize: 13 }}>Loading career stats…</p>
          ) : stats.length === 0 ? (
            <p style={{ color: "#9ca3af", fontSize: 13 }}>No career stats recorded.</p>
          ) : (
            <>
              <p className="uppercase mb-3" style={{ color: "#6b7280", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em" }}>
                Career • {games} {games === 1 ? "Game" : "Games"}
              </p>

              {hasBatting && (
                <>
                  <p className="uppercase mb-2" style={{ color: "#4b5563", fontSize: 9, fontWeight: 700, letterSpacing: "0.1em" }}>Batting</p>
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    <Cell label="Runs" value={runs.toLocaleString()} />
                    <Cell label="Average" value={batAvg != null ? batAvg.toFixed(1) : null} />
                    <Cell label="High Score" value={bestHighScore(stats)} />
                    <Cell label="50s" value={fifties} />
                    <Cell label="100s" value={hundreds} />
                    <Cell label="Innings" value={innings} />
                  </div>
                </>
              )}

              {hasBowling && (
                <>
                  <p className="uppercase mb-2" style={{ color: "#4b5563", fontSize: 9, fontWeight: 700, letterSpacing: "0.1em" }}>Bowling</p>
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    <Cell label="Wickets" value={wickets} />
                    <Cell label="Average" value={bowlAvg != null ? bowlAvg.toFixed(1) : null} />
                    <Cell label="Best" value={bestBowling(stats)} />
                    <Cell label="5 Wkts" value={fiveWickets} />
                  </div>
                </>
              )}

              {hasFielding && (
                <>
                  <p className="uppercase mb-2" style={{ color: "#4b5563", fontSize: 9, fontWeight: 700, letterSpacing: "0.1em" }}>Fielding</p>
                  <div className="grid grid-cols-3 gap-2">
                    <Cell label="Catches" value={catches} />
                    <Cell label="Stumpings" value={stumpings} />
                    <Cell label="Run Outs" value={runOuts} />
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <div className="px-5 py-3 text-center" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <Link
            href={`/players/${playerId}`}
            onClick={onClose}
            style={{ color: "#f5a623", fontSize: 12, fontWeight: 600 }}
            className="hover:underline"
            data-testid="link-player-profile"
          >
            View full profile →
          </Link>
        </div>
      </div>
    </div>
  );
}
