import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useBrand } from "@/lib/brand-context";
import {
  useGetJuniorsOverview,
  useGetJuniorSeasonTopPerformers,
  useGetJuniorsFilters,
} from "@workspace/api-client-react";
import { CalendarDays, ScrollText, TrendingUp } from "lucide-react";
import { fmtJuniorDate } from "@/lib/juniors";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useNavSurface, type ResolvedNavItem } from "@/lib/use-nav";
import { navIcon } from "@/lib/nav-icons";
import { CardGridSkeleton, QueryError, EmptyState } from "@/components/data-states";

const JUNIOR_QUICK_LINKS_FALLBACK: ResolvedNavItem[] = [
  { label: "Matches", target: "/juniors/matches", isExternal: false, iconKey: "clipboardList", description: "Browse junior games and full scorecards." },
  { label: "Premierships", target: "/juniors/premierships", isExternal: false, iconKey: "crown", description: "Junior honour boards and winning rosters." },
  { label: "Players & Leaders", target: "/juniors/players", isExternal: false, iconKey: "users", description: "Runs, wickets and games leaderboards." },
];

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-card border border-border rounded-md p-4 text-center shadow-sm">
      <div className="text-3xl font-serif font-bold text-primary" data-testid={`stat-${label}`}>
        {value}
      </div>
      <div className="text-xs uppercase tracking-widest text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

function QuickLink({ item }: { item: ResolvedNavItem }) {
  const Icon = navIcon(item.iconKey);
  const inner = (
    <div className="bg-card border border-border rounded-md p-5 shadow-sm cursor-pointer h-full hover:border-primary transition-colors group">
      {Icon && <Icon className="h-7 w-7 text-primary mb-3" />}
      <div className="font-serif font-bold text-lg text-foreground group-hover:text-primary">{item.label}</div>
      {item.description && <p className="text-sm text-muted-foreground mt-1">{item.description}</p>}
    </div>
  );
  return item.isExternal ? (
    <a href={item.target} target="_blank" rel="noopener noreferrer">{inner}</a>
  ) : (
    <Link href={item.target}>{inner}</Link>
  );
}

// Season picker value: "latest" (default), "all" (all-time), or a season string.
type SeasonChoice = "latest" | "all" | string;

export default function JuniorsDashboard() {
  const brand = useBrand();
  const { data, isLoading, isError, refetch } = useGetJuniorsOverview();
  const quickLinks = useNavSurface("junior_quick_links", JUNIOR_QUICK_LINKS_FALLBACK);
  const { data: filters } = useGetJuniorsFilters();
  const [ageFilter, setAgeFilter] = useState<string>("");
  const [season, setSeason] = useState<SeasonChoice>("latest");

  const seasonOptions = useMemo(() => filters?.seasons ?? [], [filters?.seasons]);

  // Top performers drive BOTH the leader lists AND the age-group chips: the
  // response carries availableAgeGroups for the resolved season (or all-time).
  const seasonParams =
    season === "all"
      ? { allTime: true }
      : season === "latest"
        ? {}
        : { season };
  const { data: tp } = useGetJuniorSeasonTopPerformers({
    ...(ageFilter ? { ageGroup: ageFilter } : {}),
    ...seasonParams,
  });

  const ageOptions = useMemo(() => tp?.availableAgeGroups ?? [], [tp?.availableAgeGroups]);

  // If the chosen age group has no records in the newly-selected season, fall
  // back to the club-wide list so we never show an empty, stale age filter.
  useEffect(() => {
    if (ageFilter && tp && !tp.availableAgeGroups.includes(ageFilter)) {
      setAgeFilter("");
    }
  }, [tp, ageFilter]);

  const topRunScorers = tp?.topRunScorers ?? [];
  const topWicketTakers = tp?.topWicketTakers ?? [];

  // Header label for the resolved season ("All time" when aggregating).
  const seasonLabel = season === "all" ? "All time" : tp?.season ?? null;
  const seasonValue =
    season === "latest"
      ? data?.latestSeason ?? "latest"
      : season === "all"
        ? "all"
        : season;

  return (
    <div className="space-y-8">
      <div>
        <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-primary mb-2">
          <ScrollText className="h-4 w-4" /> Juniors
        </div>
        <h1 className="text-3xl font-serif font-bold text-primary">Junior Cricket</h1>
        <p className="text-muted-foreground mt-1">
          Match results, scorecards, premierships and player stats for {brand.name}'s junior grades.
        </p>
      </div>

      {isError ? (
        <QueryError onRetry={() => refetch()} />
      ) : isLoading ? (
        <CardGridSkeleton />
      ) : !data ? (
        <EmptyState title="No junior data yet" message="There's no junior data available to show yet." />
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
            {quickLinks.map((item, idx) => (
              <QuickLink key={`${item.target}-${idx}`} item={item} />
            ))}
          </div>

          {/* Recent matches */}
          {data.recentMatches.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xl font-serif font-bold text-primary">Recent Matches</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {data.recentMatches.map((m) => (
                  <Link key={m.id} href={`/juniors/matches/${m.id}`}>
                    <div className="bg-card border border-border rounded-md p-4 shadow-sm cursor-pointer h-full flex flex-col gap-2 hover:border-primary transition-colors group">
                      <div className="flex items-center gap-2">
                        {m.ageGroup && (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/15 border border-primary/40 rounded px-2 py-0.5">
                            {m.ageGroup}
                          </span>
                        )}
                        <div className="font-serif font-bold text-foreground group-hover:text-primary truncate">
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

          {/* Top performers with season picker */}
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="text-xl font-serif font-bold text-primary">Top Performers</h2>
              <Select
                value={seasonValue}
                onValueChange={(v) => setSeason(v)}
              >
                <SelectTrigger className="w-[150px] h-9" data-testid="season-select">
                  <SelectValue placeholder="Season" />
                </SelectTrigger>
                <SelectContent>
                  {seasonOptions.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                  <SelectItem value="all">All time</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {seasonLabel && (
              <p className="text-xs uppercase tracking-widest text-muted-foreground">
                {season === "all" ? "All time" : `${seasonLabel} season`}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setAgeFilter("")}
                className={`text-xs font-semibold uppercase tracking-wider rounded-full px-3 py-1.5 border transition-colors ${
                  ageFilter === ""
                    ? "bg-primary text-primary-foreground border-primary"
                    : "text-muted-foreground border-border hover:border-primary/50"
                }`}
                data-testid="filter-age-all"
              >
                All Ages
              </button>
              {ageOptions.map((a) => (
                <button
                  key={a}
                  onClick={() => setAgeFilter(a)}
                  className={`text-xs font-semibold uppercase tracking-wider rounded-full px-3 py-1.5 border transition-colors ${
                    ageFilter === a
                      ? "bg-primary text-primary-foreground border-primary"
                      : "text-muted-foreground border-border hover:border-primary/50"
                  }`}
                  data-testid={`filter-age-${a}`}
                >
                  {a}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <section className="bg-card border border-border rounded-md p-4 shadow-sm">
                <h3 className="font-serif font-bold text-primary flex items-center gap-2 mb-3">
                  <TrendingUp className="h-4 w-4 text-primary" /> Top Run Scorers
                </h3>
                {topRunScorers.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">No data for this season yet.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {topRunScorers.map((p) => (
                      <li key={p.participantId}>
                        <Link href={`/juniors/players/${p.participantId}`}>
                          <div className="flex items-center justify-between py-2 cursor-pointer hover:text-primary">
                            <span className="font-medium">{p.displayName}</span>
                            <span className="font-mono text-sm">{p.runs}</span>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section className="bg-card border border-border rounded-md p-4 shadow-sm">
                <h3 className="font-serif font-bold text-primary flex items-center gap-2 mb-3">
                  <TrendingUp className="h-4 w-4 text-primary" /> Top Wicket Takers
                </h3>
                {topWicketTakers.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">No data for this season yet.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {topWicketTakers.map((p) => (
                      <li key={p.participantId}>
                        <Link href={`/juniors/players/${p.participantId}`}>
                          <div className="flex items-center justify-between py-2 cursor-pointer hover:text-primary">
                            <span className="font-medium">{p.displayName}</span>
                            <span className="font-mono text-sm">{p.wickets}</span>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
