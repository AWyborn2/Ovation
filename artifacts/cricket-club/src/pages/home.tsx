import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  useGetSeniorOverview,
  useGetSeniorSeasonTopPerformers,
  type MatchSummary,
  type SeasonLeader,
} from "@workspace/api-client-react";
import { Trophy, TrendingUp, CalendarDays, MapPin } from "lucide-react";
import { GradeBadge, sortGradesBySeniority } from "@/components/grade-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { matchLabel } from "@/lib/utils";
import { useNavSurface, type ResolvedNavItem } from "@/lib/use-nav";
import { navIcon } from "@/lib/nav-icons";
import { CardGridSkeleton, QueryError, EmptyState } from "@/components/data-states";

const SENIOR_QUICK_LINKS_FALLBACK: ResolvedNavItem[] = [
  { label: "Honour Boards", target: "/honour-boards", isExternal: false, iconKey: "scrollText", description: "Premierships, life members, awards and records." },
  { label: "Players", target: "/players", isExternal: false, iconKey: "users", description: "Searchable directory of every club player." },
  { label: "Matches", target: "/matches", isExternal: false, iconKey: "clipboardList", description: "Game-by-game results and full scorecards." },
  { label: "Grades", target: "/grades", isExternal: false, iconKey: "trophy", description: "Per-grade leaderboards and summaries." },
  { label: "Records", target: "/records", isExternal: false, iconKey: "award", description: "All-time club records and milestones." },
  { label: "Premierships", target: "/premierships", isExternal: false, iconKey: "crown", description: "Premiership honour boards and squads." },
];

const fmtSeason = (s: number) => `${s}/${String((s + 1) % 100).padStart(2, "0")}`;

const fmtDate = (d: string | null | undefined) => {
  if (!d) return null;
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return d;
  return `${m[3]}/${m[2]}/${m[1]}`;
};

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

function MatchCardCrest({ club }: { club: MatchSummary["opponentClub"] }) {
  const [errored, setErrored] = useState(false);
  const src = club?.logoUrl128 || club?.logoUrl;
  if (!club || !src || errored) return null;
  return (
    <img
      src={src}
      alt={`${club.name} logo`}
      title={club.name}
      width={28}
      height={28}
      onError={() => setErrored(true)}
      className="h-7 w-7 shrink-0 rounded-sm object-contain bg-white/90 p-0.5 shadow-sm"
    />
  );
}

function RecentMatchCard({ m }: { m: MatchSummary }) {
  return (
    <Link href={`/matches/${m.id}`}>
      <div className="bg-card border border-border rounded-md p-4 shadow-sm hover:border-primary transition-colors cursor-pointer group h-full flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <GradeBadge grade={m.grade} size="sm" />
          <MatchCardCrest club={m.opponentClub} />
          <div className="flex-1 min-w-0">
            <div className="font-serif font-bold text-primary truncate">
              vs {m.opponent ?? "Unknown"}
            </div>
            <div className="text-xs text-muted-foreground uppercase tracking-wider">
              {fmtSeason(m.season)}
              {matchLabel(m.round, m.stage) ? ` · ${matchLabel(m.round, m.stage)}` : ""}
            </div>
          </div>
          {m.abandoned && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-500/15 border border-amber-600/40 rounded px-2 py-0.5">
              Abandoned
            </span>
          )}
        </div>
        {(m.hhccScore || m.opponentScore) && (
          <div className="text-sm font-mono text-foreground/90">
            {m.hhccScore ?? "—"} <span className="text-muted-foreground">vs</span> {m.opponentScore ?? "—"}
          </div>
        )}
        {m.result && (
          <div className="text-sm text-foreground/80 leading-snug">{m.result}</div>
        )}
        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {fmtDate(m.matchDate) && (
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" /> {fmtDate(m.matchDate)}
            </span>
          )}
          {m.venue && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" /> {m.venue}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function LeaderList({ title, leaders }: { title: string; leaders: SeasonLeader[] }) {
  return (
    <section className="bg-card border border-border rounded-md p-4 shadow-sm">
      <h3 className="font-serif font-bold text-primary flex items-center gap-2 mb-3">
        <TrendingUp className="h-4 w-4 text-primary" /> {title}
      </h3>
      {leaders.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">No data for this season yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {leaders.map((p) => (
            <li key={p.playerId}>
              <Link href={`/players/${p.playerId}`}>
                <div className="flex items-center justify-between py-2 cursor-pointer hover:text-primary">
                  <span className="font-medium">{p.givenName} {p.surname}</span>
                  <span className="font-mono text-sm">{p.value}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Season picker value: "latest" (default), "all" (all-time), or a season year.
type SeasonChoice = "latest" | "all" | number;

export default function Home() {
  const { data, isLoading, isError, refetch } = useGetSeniorOverview();
  const quickLinks = useNavSurface("senior_menu", SENIOR_QUICK_LINKS_FALLBACK);
  const [gradeFilter, setGradeFilter] = useState<string>("");
  const [season, setSeason] = useState<SeasonChoice>("latest");

  // Top performers drive BOTH the leader lists AND the grade chips: the response
  // carries availableGrades for the resolved season (or all grades, all-time).
  const seasonParams =
    season === "all" ? { allTime: true } : season === "latest" ? {} : { season };
  const { data: tp } = useGetSeniorSeasonTopPerformers({
    ...(gradeFilter ? { grade: gradeFilter } : {}),
    ...seasonParams,
  });

  const gradeOptions = useMemo(
    () => sortGradesBySeniority(tp?.availableGrades ?? []),
    [tp?.availableGrades],
  );

  // If the chosen grade has no records in the newly-selected season, fall back
  // to the club-wide list so we never show an empty, stale grade filter.
  useEffect(() => {
    if (gradeFilter && tp && !tp.availableGrades.includes(gradeFilter)) {
      setGradeFilter("");
    }
  }, [tp, gradeFilter]);

  const topRunScorers = tp?.topRunScorers ?? [];
  const topWicketTakers = tp?.topWicketTakers ?? [];

  // Header label for the resolved season ("All time" when aggregating).
  const seasonLabel = season === "all" ? "All time" : tp?.seasonLabel ?? null;
  const seasonValue =
    season === "latest"
      ? data?.latestSeason != null
        ? String(data.latestSeason)
        : "latest"
      : season === "all"
        ? "all"
        : String(season);

  return (
    <div className="space-y-8">
      <div>
        <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-primary mb-2">
          <Trophy className="h-4 w-4" /> Seniors
        </div>
        <h1 className="text-3xl font-serif font-bold text-primary">Senior Cricket</h1>
        <p className="text-muted-foreground mt-1">
          Results, scorecards, records and player stats for Halls Head's senior grades.
        </p>
      </div>

      {isError ? (
        <QueryError onRetry={() => refetch()} />
      ) : isLoading ? (
        <CardGridSkeleton />
      ) : !data ? (
        <EmptyState
          title="No senior data yet"
          message="Senior stats appear here once imports are committed."
        />
      ) : (
        <>
          {/* Totals */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <StatCard label="Players" value={data.totals.players.toLocaleString()} />
            <StatCard label="Games" value={data.totals.games.toLocaleString()} />
            <StatCard label="Runs" value={data.totals.runs.toLocaleString()} />
            <StatCard label="Wickets" value={data.totals.wickets.toLocaleString()} />
            <StatCard label="Grades" value={data.totals.grades} />
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
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <h2 className="text-xl font-serif font-bold text-primary">Recent Matches</h2>
                {data.latestSeasonLabel && (
                  <span className="text-xs uppercase tracking-widest text-muted-foreground">
                    {data.latestSeasonLabel} season
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {data.recentMatches.map((m) => (
                  <RecentMatchCard key={m.id} m={m} />
                ))}
              </div>
            </section>
          )}

          {/* Top performers with season picker + grade filter */}
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="text-xl font-serif font-bold text-primary">Top Performers</h2>
              <Select
                value={seasonValue}
                onValueChange={(v) =>
                  setSeason(v === "all" ? "all" : Number(v))
                }
              >
                <SelectTrigger className="w-[150px] h-9" data-testid="season-select">
                  <SelectValue placeholder="Season" />
                </SelectTrigger>
                <SelectContent>
                  {data.availableSeasons.map((s) => (
                    <SelectItem key={s.season} value={String(s.season)}>
                      {s.label}
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
                onClick={() => setGradeFilter("")}
                className={`text-xs font-semibold uppercase tracking-wider rounded-full px-3 py-1.5 border transition-colors ${
                  gradeFilter === ""
                    ? "bg-primary text-primary-foreground border-primary"
                    : "text-muted-foreground border-border hover:border-primary/50"
                }`}
                data-testid="filter-grade-all"
              >
                All Grades
              </button>
              {gradeOptions.map((g) => (
                <button
                  key={g}
                  onClick={() => setGradeFilter(g)}
                  className={`text-xs font-semibold uppercase tracking-wider rounded-full px-3 py-1.5 border transition-colors ${
                    gradeFilter === g
                      ? "bg-primary text-primary-foreground border-primary"
                      : "text-muted-foreground border-border hover:border-primary/50"
                  }`}
                  data-testid={`filter-grade-${g}`}
                >
                  {g}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <LeaderList title="Top Run Scorers" leaders={topRunScorers} />
              <LeaderList title="Top Wicket Takers" leaders={topWicketTakers} />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
