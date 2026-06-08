import { Link } from "wouter";
import { useGetJuniorsOverview } from "@workspace/api-client-react";
import { ClipboardList, Crown, Users, CalendarDays, ScrollText, TrendingUp } from "lucide-react";
import { JUNIOR_ACCENT, fmtJuniorDate } from "@/lib/juniors";

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-card border border-border rounded-md p-4 text-center shadow-sm">
      <div className="text-3xl font-serif font-bold text-emerald-700" data-testid={`stat-${label}`}>
        {value}
      </div>
      <div className="text-xs uppercase tracking-widest text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

function QuickLink({ href, icon: Icon, title, desc }: { href: string; icon: typeof Users; title: string; desc: string }) {
  return (
    <Link href={href}>
      <div className={`bg-card border border-border rounded-md p-5 shadow-sm cursor-pointer h-full ${JUNIOR_ACCENT.hoverBorder} transition-colors group`}>
        <Icon className="h-7 w-7 text-emerald-600 mb-3" />
        <div className="font-serif font-bold text-lg text-foreground group-hover:text-emerald-700">{title}</div>
        <p className="text-sm text-muted-foreground mt-1">{desc}</p>
      </div>
    </Link>
  );
}

export default function JuniorsDashboard() {
  const { data, isLoading } = useGetJuniorsOverview();

  return (
    <div className="space-y-8">
      <div>
        <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-emerald-700 mb-2">
          <ScrollText className="h-4 w-4" /> Juniors
        </div>
        <h1 className="text-3xl font-serif font-bold text-primary">Junior Cricket</h1>
        <p className="text-muted-foreground mt-1">
          Match results, scorecards, premierships and player stats for Halls Head's junior grades.
        </p>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground">Loading...</div>
      ) : !data ? (
        <div className="p-8 text-center text-muted-foreground">No junior data available yet.</div>
      ) : (
        <>
          {/* Totals */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <StatCard label="Matches" value={data.totals.matches} />
            <StatCard label="Players" value={data.totals.players} />
            <StatCard label="Premierships" value={data.totals.premierships} />
            <StatCard label="Seasons" value={data.totals.seasons} />
            <StatCard label="Age Groups" value={data.totals.ageGroups} />
          </div>

          {/* Quick links */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <QuickLink href="/juniors/matches" icon={ClipboardList} title="Matches" desc="Browse junior games and full scorecards." />
            <QuickLink href="/juniors/premierships" icon={Crown} title="Premierships" desc="Junior honour boards and winning rosters." />
            <QuickLink href="/juniors/players" icon={Users} title="Players & Leaders" desc="Runs, wickets and games leaderboards." />
          </div>

          {/* Recent matches */}
          {data.recentMatches.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xl font-serif font-bold text-primary">Recent Matches</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {data.recentMatches.map((m) => (
                  <Link key={m.id} href={`/juniors/matches/${m.id}`}>
                    <div className={`bg-card border border-border rounded-md p-4 shadow-sm cursor-pointer h-full flex flex-col gap-2 ${JUNIOR_ACCENT.hoverBorder} transition-colors group`}>
                      <div className="flex items-center gap-2">
                        {m.ageGroup && (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-500/10 border border-emerald-600/40 rounded px-2 py-0.5">
                            {m.ageGroup}
                          </span>
                        )}
                        <div className="font-serif font-bold text-primary group-hover:text-emerald-700 truncate">
                          vs {m.opponentName ?? "Unknown"}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground uppercase tracking-wider">
                        {m.season ?? ""}{m.round ? ` · ${m.round}` : ""}
                      </div>
                      {(m.hhScore || m.opponentScore) && (
                        <div className="text-sm font-mono text-foreground/90">
                          {m.hhScore ?? "—"} <span className="text-muted-foreground">vs</span> {m.opponentScore ?? "—"}
                        </div>
                      )}
                      {m.hhResult && <div className="text-sm text-foreground/80">{m.hhResult}</div>}
                      {fmtJuniorDate(m.matchDate) && (
                        <span className="mt-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <CalendarDays className="h-3.5 w-3.5" /> {fmtJuniorDate(m.matchDate)}
                        </span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Top performers */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.topRunScorers.length > 0 && (
              <section className="bg-card border border-border rounded-md p-4 shadow-sm">
                <h3 className="font-serif font-bold text-primary flex items-center gap-2 mb-3">
                  <TrendingUp className="h-4 w-4 text-emerald-600" /> Top Run Scorers
                </h3>
                <ul className="divide-y divide-border">
                  {data.topRunScorers.map((p) => (
                    <li key={p.participantId}>
                      <Link href={`/juniors/players/${p.participantId}`}>
                        <div className="flex items-center justify-between py-2 cursor-pointer hover:text-emerald-700">
                          <span className="font-medium">{p.displayName}</span>
                          <span className="font-mono text-sm">{p.runs}</span>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {data.topWicketTakers.length > 0 && (
              <section className="bg-card border border-border rounded-md p-4 shadow-sm">
                <h3 className="font-serif font-bold text-primary flex items-center gap-2 mb-3">
                  <TrendingUp className="h-4 w-4 text-emerald-600" /> Top Wicket Takers
                </h3>
                <ul className="divide-y divide-border">
                  {data.topWicketTakers.map((p) => (
                    <li key={p.participantId}>
                      <Link href={`/juniors/players/${p.participantId}`}>
                        <div className="flex items-center justify-between py-2 cursor-pointer hover:text-emerald-700">
                          <span className="font-medium">{p.displayName}</span>
                          <span className="font-mono text-sm">{p.wickets}</span>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </>
      )}
    </div>
  );
}
