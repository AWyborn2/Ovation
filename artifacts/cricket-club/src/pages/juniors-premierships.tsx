import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useListJuniorPremierships } from "@workspace/api-client-react";
import { Crown, ArrowRight } from "lucide-react";
import { JUNIOR_ACCENT } from "@/lib/juniors";

export default function JuniorsPremierships() {
  const { data, isLoading } = useListJuniorPremierships();
  const [ageGroup, setAgeGroup] = useState("");

  const ageGroups = useMemo(() => {
    const set = new Set<string>();
    for (const p of data ?? []) if (p.ageGroup) set.add(p.ageGroup);
    return Array.from(set).sort();
  }, [data]);

  const filtered = useMemo(
    () => (data ?? []).filter((p) => !ageGroup || p.ageGroup === ageGroup),
    [data, ageGroup],
  );

  return (
    <div className="space-y-6">
      <div>
        <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#bc8c6b] mb-2">
          Juniors
        </div>
        <h1 className="text-3xl font-serif font-bold text-primary flex items-center gap-2">
          <Crown className="h-7 w-7 text-[#bc8c6b]" /> Junior Premierships
        </h1>
        <p className="text-muted-foreground mt-1">Junior honour boards and their winning rosters.</p>
      </div>

      {ageGroups.length > 0 && (
        <div className="flex flex-col gap-1 max-w-xs">
          <label className="text-xs font-bold uppercase tracking-widest text-[#bc8c6b]">Age Group</label>
          <select
            value={ageGroup}
            onChange={(e) => setAgeGroup(e.target.value)}
            className="px-3 py-2 rounded border-2 border-[#bc8c6b] bg-card text-foreground text-sm font-medium"
            data-testid="select-age-group"
          >
            <option value="">All age groups</option>
            {ageGroups.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
      )}

      {isLoading ? (
        <div className="p-8 text-center">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground">No junior premierships recorded.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((p) => (
            <div key={p.id} className="bg-card border border-border rounded-md shadow-sm overflow-hidden">
              <div className="bg-[#42342b] text-white px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-serif font-bold text-lg flex items-center gap-2">
                    <Crown className="h-5 w-5" />
                    {p.ageGroup ?? "Junior"} {p.season ? `· ${p.season}` : ""}
                  </div>
                </div>
                {p.competition && <div className="text-xs uppercase tracking-wider opacity-90 mt-0.5">{p.competition}</div>}
              </div>
              <div className="p-4 space-y-3">
                {(p.opponent || p.hhScore || p.oppScore) && (
                  <div className="text-sm text-foreground/90">
                    {p.opponent && <span className="text-muted-foreground">def. {p.opponent} </span>}
                    {(p.hhScore || p.oppScore) && (
                      <span className="font-mono">{p.hhScore ?? "—"} vs {p.oppScore ?? "—"}</span>
                    )}
                  </div>
                )}
                {p.resultText && <div className="text-sm text-foreground/80">{p.resultText}</div>}

                {p.players.length > 0 && (
                  <div>
                    <div className="text-xs font-bold uppercase tracking-widest text-[#bc8c6b] mb-1">Roster</div>
                    <div className="flex flex-wrap gap-1.5">
                      {p.players.map((pl, i) =>
                        pl.participantId ? (
                          <Link key={i} href={`/juniors/players/${pl.participantId}`}>
                            <span className={`text-xs rounded-full border ${JUNIOR_ACCENT.borderSoft} px-2 py-0.5 cursor-pointer hover:bg-[#bc8c6b]/10`}>
                              {pl.playerName}
                            </span>
                          </Link>
                        ) : (
                          <span key={i} className="text-xs rounded-full border border-border px-2 py-0.5 text-muted-foreground">
                            {pl.playerName}
                          </span>
                        ),
                      )}
                    </div>
                  </div>
                )}

                {p.matchId != null && (
                  <Link href={`/juniors/matches/${p.matchId}`}>
                    <span className="inline-flex items-center gap-1 text-sm text-[#bc8c6b] hover:underline cursor-pointer">
                      View deciding scorecard <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
