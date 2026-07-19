import { Link, useParams } from "wouter";
import { useGetJuniorPlayer, getGetJuniorPlayerQueryKey, useGetPlayer, getGetPlayerQueryKey } from "@workspace/api-client-react";
import { ArrowLeft } from "lucide-react";
import { fmtJuniorDate, fmtNum } from "@/lib/juniors";
import { LoadingState, QueryError, EmptyState } from "@/components/data-states";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-card border border-border rounded-md p-3 text-center">
      <div className="text-xl font-serif font-bold text-primary">{value}</div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

export default function JuniorsPlayerDetail() {
  const params = useParams();
  const id = params.id ?? "";
  const { data: player, isLoading, isError, refetch } = useGetJuniorPlayer(id, {
    query: { enabled: !!id, queryKey: getGetJuniorPlayerQueryKey(id) },
  });

  return (
    <div className="space-y-6">
      <Link href="/juniors/players">
        <span className="inline-flex items-center gap-1 text-sm text-primary hover:underline cursor-pointer">
          <ArrowLeft className="h-4 w-4" /> Back to junior players
        </span>
      </Link>

      {isLoading ? (
        <LoadingState label="Loading player…" />
      ) : isError ? (
        <QueryError onRetry={() => refetch()} />
      ) : !player ? (
        <EmptyState title="Player not found" message="We couldn't find this junior player." />
      ) : (
        <>
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-primary mb-2">
              Junior Player
            </div>
            <h1 className="text-3xl font-serif font-bold text-primary">{player.displayName}</h1>
            <div className="text-sm text-muted-foreground mt-1">
              {player.firstSeason && player.lastSeason
                ? `${player.firstSeason} – ${player.lastSeason}`
                : player.firstSeason ?? ""}
              {player.teams ? ` · ${player.teams}` : ""}
            </div>
          </div>

          {/* Batting */}
          <section className="space-y-2">
            <h2 className="text-lg font-serif font-bold text-primary">Batting</h2>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
              <Stat label="Matches" value={player.batting.matches} />
              <Stat label="Innings" value={player.batting.innings} />
              <Stat label="Runs" value={player.batting.runs} />
              <Stat label="Not Outs" value={player.batting.notOuts} />
              <Stat label="High Score" value={player.batting.highScore ?? "—"} />
              <Stat label="Average" value={fmtNum(player.batting.average, 2)} />
            </div>
          </section>

          {/* Bowling */}
          <section className="space-y-2">
            <h2 className="text-lg font-serif font-bold text-primary">Bowling</h2>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
              <Stat label="Matches" value={player.bowling.matches} />
              <Stat label="Wickets" value={player.bowling.wickets} />
              <Stat label="Runs" value={player.bowling.runs} />
              <Stat label="Maidens" value={player.bowling.maidens} />
              <Stat
                label="Best"
                value={player.bowling.bestWickets != null ? `${player.bowling.bestWickets}/${player.bowling.bestRuns ?? "—"}` : "—"}
              />
              <Stat label="Economy" value={fmtNum(player.bowling.economy, 2)} />
            </div>
          </section>

          {/* Seasons */}
          {player.seasons.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-lg font-serif font-bold text-primary">By Season</h2>
              <div className="overflow-x-auto bg-card border border-border rounded-md">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-3 py-2">Season</th>
                      <th className="px-3 py-2">Teams</th>
                      <th className="px-3 py-2 text-right">Matches</th>
                      <th className="px-3 py-2 text-right">Runs</th>
                      <th className="px-3 py-2 text-right">Wickets</th>
                    </tr>
                  </thead>
                  <tbody>
                    {player.seasons.map((s, i) => (
                      <tr key={i} className="border-b border-border/60 last:border-0">
                        <td className="px-3 py-2 font-medium">{s.season}</td>
                        <td className="px-3 py-2 text-muted-foreground">{s.teams ?? "—"}</td>
                        <td className="px-3 py-2 text-right font-mono">{s.matches}</td>
                        <td className="px-3 py-2 text-right font-mono">{s.runs}</td>
                        <td className="px-3 py-2 text-right font-mono">{s.wickets}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Match log */}
          {player.matches.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-lg font-serif font-bold text-primary">Match Log</h2>
              <div className="space-y-2">
                {player.matches.map((m) => (
                  <Link key={m.matchId} href={`/juniors/matches/${m.matchId}`}>
                    <div className="bg-card border border-border rounded-md p-3 shadow-sm cursor-pointer hover:border-primary transition-colors flex flex-wrap items-center gap-x-4 gap-y-1">
                      <div className="font-medium text-primary min-w-0">
                        vs {m.opponentName ?? "Unknown"}
                      </div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wider">
                        {m.season ?? ""}{m.ageGroup ? ` · ${m.ageGroup}` : ""}{m.round ? ` · ${m.round}` : ""}
                      </div>
                      {fmtJuniorDate(m.matchDate) && (
                        <div className="text-xs text-muted-foreground">{fmtJuniorDate(m.matchDate)}</div>
                      )}
                      <div className="ml-auto flex items-center gap-3 text-xs font-mono">
                        {m.batting && (m.batting.runs != null) && (
                          <span title="Batting">{m.batting.runs}{m.batting.dismissal && /not out/i.test(m.batting.dismissal) ? "*" : ""} runs</span>
                        )}
                        {m.bowling && (m.bowling.wickets != null) && (
                          <span title="Bowling">{m.bowling.wickets}/{m.bowling.runs ?? "—"}</span>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {player.seniorPlayerId != null && (
            <SeniorCareerSection seniorPlayerId={player.seniorPlayerId} />
          )}
        </>
      )}
    </div>
  );
}

/**
 * Senior career cross-section, shown only when an admin has linked this junior
 * participant to a senior player profile. Senior figures come from the senior
 * API in the browser (no junior endpoint reads a senior table) and render as a
 * clearly-labelled SEPARATE section — junior and senior records never combine.
 */
function SeniorCareerSection({ seniorPlayerId }: { seniorPlayerId: number }) {
  const { data: senior } = useGetPlayer(seniorPlayerId, {
    query: { queryKey: getGetPlayerQueryKey(seniorPlayerId) },
  });
  if (!senior) return null;
  const clubTotal = senior.stats.find((s) => s.grade === "CLUB TOTAL");
  const gradeRows = senior.stats.filter((s) => s.grade !== "CLUB TOTAL");
  const sum = (pick: (s: (typeof gradeRows)[number]) => number | null | undefined): number =>
    gradeRows.reduce((acc, s) => acc + (pick(s) ?? 0), 0);
  const games = clubTotal?.games ?? sum((s) => s.games);
  const runs = clubTotal?.runs ?? sum((s) => s.runs);
  const wickets = clubTotal?.wickets ?? sum((s) => s.wickets);
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-serif font-bold text-primary">Senior Career</h2>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Kept separate from junior records</span>
      </div>
      <div className="bg-card border border-border rounded-md p-4 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <span className="font-semibold text-primary">
            {senior.givenName} {senior.surname}
          </span>
          <Link href={`/players/${senior.id}`} className="text-sm text-primary hover:underline">
            View senior profile →
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Games" value={games} />
          <Stat label="Runs" value={runs} />
          <Stat label="Wickets" value={wickets} />
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Senior records are kept completely separate from junior records and
          are never combined into any career figure.
        </p>
      </div>
    </section>
  );
}
