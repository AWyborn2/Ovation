import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  useListMatches,
  useListGrades,
  useGetMatchDisplaySettings,
  getListMatchesQueryKey,
  type MatchSummary,
} from "@workspace/api-client-react";
import { GradeBadge, sortGradesBySeniority } from "@/components/grade-badge";
import { matchLabel } from "@/lib/utils";
import { CalendarDays, MapPin } from "lucide-react";
import { CardGridSkeleton, QueryError, EmptyState } from "@/components/data-states";

// Compact opposition crest for match cards; falls back silently to nothing
// (the opponent name is always shown beside it).
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
      data-testid="img-match-crest"
    />
  );
}

const fmtSeason = (s: number) => `${s}/${String((s + 1) % 100).padStart(2, "0")}`;

const fmtDate = (d: string | null | undefined) => {
  if (!d) return null;
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return d;
  return `${m[3]}/${m[2]}/${m[1]}`;
};

export default function Matches() {
  // `null` = not yet initialised from saved admin defaults.
  const [grade, setGrade] = useState<string | null>(null);
  const [season, setSeason] = useState<string | null>(null);
  // For "latest" season mode we must wait until we know the newest season
  // before the displayed list query is allowed to run.
  const [seasonReady, setSeasonReady] = useState(false);

  const { data: settings } = useGetMatchDisplaySettings();
  const { data: grades } = useListGrades();

  const initialised = grade !== null;
  const gradeArg = grade || undefined;
  const seasonArg = season && season !== "" ? parseInt(season, 10) : undefined;

  // Grade-only query: drives the season dropdown and "latest" detection so the
  // season list never collapses to the single selected season.
  const { data: gradeMatches } = useListMatches(
    { grade: gradeArg },
    {
      query: {
        enabled: initialised,
        queryKey: getListMatchesQueryKey({ grade: gradeArg }),
      },
    },
  );

  // Displayed list: filtered by grade + season.
  const { data: matches, isLoading, isError, refetch } = useListMatches(
    { grade: gradeArg, season: seasonArg },
    {
      query: {
        enabled: initialised && seasonReady,
        queryKey: getListMatchesQueryKey({ grade: gradeArg, season: seasonArg }),
      },
    },
  );

  // Apply saved admin defaults once, on first load.
  useEffect(() => {
    if (!settings || grade !== null) return;
    setGrade(settings.defaultGrade);
    if (settings.defaultSeasonMode === "specific") {
      setSeason(settings.defaultSeason != null ? String(settings.defaultSeason) : "");
      setSeasonReady(true);
    } else if (settings.defaultSeasonMode === "all") {
      setSeason("");
      setSeasonReady(true);
    } else {
      // "latest" — resolved once gradeMatches loads below.
      setSeason("");
    }
  }, [settings, grade]);

  // Resolve "latest" season once the grade-only matches arrive.
  useEffect(() => {
    if (seasonReady || !settings || settings.defaultSeasonMode !== "latest") return;
    if (!gradeMatches) return;
    const latest = gradeMatches.reduce<number | null>(
      (max, m) => (max === null || m.season > max ? m.season : max),
      null,
    );
    setSeason(latest != null ? String(latest) : "");
    setSeasonReady(true);
  }, [gradeMatches, settings, seasonReady]);

  const gradeOptions = useMemo(() => {
    const available = sortGradesBySeniority(
      (grades ?? []).map((g) => g.grade).filter((g) => g !== "CLUB TOTAL"),
    );
    const configured = (settings?.gradeOrder ?? []).filter((g) => available.includes(g));
    const rest = available.filter((g) => !configured.includes(g));
    return [...configured, ...rest];
  }, [grades, settings]);

  // Season options derived from the grade-only query so they stay complete even
  // when a specific season is selected.
  const seasonOptions = useMemo(() => {
    const set = new Set<number>();
    for (const m of gradeMatches ?? []) set.add(m.season);
    return Array.from(set).sort((a, b) => b - a);
  }, [gradeMatches]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-bold text-primary">Matches</h1>
        <p className="text-muted-foreground mt-1">
          Browse game-by-game scorecards across all grades.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-bold uppercase tracking-widest text-primary">Grade</label>
          <select
            value={grade ?? ""}
            onChange={(e) => setGrade(e.target.value)}
            className="px-3 py-2 rounded border-2 border-primary bg-card text-foreground text-sm font-medium min-w-[10rem]"
          >
            <option value="">All grades</option>
            {gradeOptions.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-bold uppercase tracking-widest text-primary">Season</label>
          <select
            value={season ?? ""}
            onChange={(e) => {
              setSeason(e.target.value);
              setSeasonReady(true);
            }}
            className="px-3 py-2 rounded border-2 border-primary bg-card text-foreground text-sm font-medium min-w-[8rem]"
          >
            <option value="">All seasons</option>
            {seasonOptions.map((s) => (
              <option key={s} value={String(s)}>{fmtSeason(s)}</option>
            ))}
          </select>
        </div>
      </div>

      {isError ? (
        <QueryError onRetry={() => refetch()} />
      ) : isLoading ? (
        <CardGridSkeleton />
      ) : !matches || matches.length === 0 ? (
        <EmptyState
          title="No matches found"
          message="Match scorecards appear here once per-match imports are committed."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {matches.map((m) => (
            <Link key={m.id} href={`/matches/${m.id}`}>
              <div className="bg-card border border-border rounded-md p-4 shadow-sm hover:border-primary transition-colors cursor-pointer group h-full flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <GradeBadge grade={m.grade} size="sm" />
                  <MatchCardCrest club={m.opponentClub} />
                  <div className="flex-1 min-w-0">
                    <div className="font-serif font-bold text-primary group-hover:text-primary truncate">
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
                {m.result && (
                  <div className="text-sm text-foreground/90 leading-snug">{m.result}</div>
                )}
                <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {fmtDate(m.matchDate) && (
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {fmtDate(m.matchDate)}
                    </span>
                  )}
                  {m.venue && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {m.venue}
                    </span>
                  )}
                  <span className="font-mono">{m.playerCount} players</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
