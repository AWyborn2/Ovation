import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  useListMatches,
  useListGrades,
  type MatchSummary,
} from "@workspace/api-client-react";
import { GradeBadge, sortGradesBySeniority } from "@/components/grade-badge";
import { matchLabel } from "@/lib/utils";
import { CalendarDays, MapPin } from "lucide-react";

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
  const [grade, setGrade] = useState<string>("");
  const [season, setSeason] = useState<string>("");

  const { data: matches, isLoading } = useListMatches({
    grade: grade || undefined,
    season: season ? parseInt(season, 10) : undefined,
  });
  const { data: grades } = useListGrades();

  const gradeOptions = useMemo(
    () =>
      sortGradesBySeniority(
        (grades ?? []).map((g) => g.grade).filter((g) => g !== "CLUB TOTAL"),
      ),
    [grades],
  );

  // Season options derived from all matches (unfiltered would need a second
  // query; deriving from current results is sufficient and stays in sync).
  const seasonOptions = useMemo(() => {
    const set = new Set<number>();
    for (const m of matches ?? []) set.add(m.season);
    return Array.from(set).sort((a, b) => b - a);
  }, [matches]);

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
            value={grade}
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
            value={season}
            onChange={(e) => setSeason(e.target.value)}
            className="px-3 py-2 rounded border-2 border-primary bg-card text-foreground text-sm font-medium min-w-[8rem]"
          >
            <option value="">All seasons</option>
            {seasonOptions.map((s) => (
              <option key={s} value={String(s)}>{fmtSeason(s)}</option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="p-8 text-center">Loading...</div>
      ) : !matches || matches.length === 0 ? (
        <div className="p-8 text-center text-muted-foreground">
          No matches found. Match scorecards appear here once per-match imports are committed.
        </div>
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
