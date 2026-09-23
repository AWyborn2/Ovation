import { useEffect, useMemo, useState } from "react";

import {
  useListMatches,
  useListGrades,
  useGetMatchDisplaySettings,
  getListMatchesQueryKey,
  type MatchSummary,
} from "@workspace/api-client-react";
import { GradeBadge, sortGradesBySeniority } from "@/components/grade-badge";
import { matchLabel } from "@/lib/utils";
import { QueryError, EmptyState } from "@/components/data-states";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Container,
  PageHeader,
  PageStack,
  ResultRow,
  RowsSkeleton,
  SectionCard,
} from "@/components/broadcast";

// Radix Select forbids an empty-string item value, so "all" uses a sentinel.
const ALL = "__all";

// Compact opposition crest for match cards; falls back silently to nothing
// (the opponent name is always shown beside it).
function MatchCardCrest({ club }: { club: MatchSummary["opponentClub"] }) {
  const [errored, setErrored] = useState(false);
  const src = club?.logoUrl128 || club?.logoUrl;
  if (!club || !src || errored) return null;
  return (
    <img
      loading="lazy"
      decoding="async"
      src={src}
      alt={`${club.name} logo`}
      title={club.name}
      width={28}
      height={28}
      onError={() => setErrored(true)}
      className="h-6 w-6 shrink-0 rounded-sm bg-white/90 object-contain p-0.5"
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
  const {
    data: matches,
    isLoading,
    isError,
    refetch,
  } = useListMatches(
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
    <Container page className="py-[var(--gap-section)]">
      <PageStack>
        <PageHeader
          eyebrow="Stats"
          title="Matches"
          subtitle="Results and full scorecards across every grade."
          actions={
            <>
              <Select value={grade || ALL} onValueChange={(v) => setGrade(v === ALL ? "" : v)}>
                <SelectTrigger
                  className="h-10 w-auto min-w-[150px] rounded-full"
                  aria-label="Grade"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All grades</SelectItem>
                  {gradeOptions.map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={season || ALL}
                onValueChange={(v) => {
                  setSeason(v === ALL ? "" : v);
                  setSeasonReady(true);
                }}
              >
                <SelectTrigger
                  className="h-10 w-auto min-w-[140px] rounded-full"
                  aria-label="Season"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All seasons</SelectItem>
                  {seasonOptions.map((s) => (
                    <SelectItem key={s} value={String(s)}>
                      {fmtSeason(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          }
        />

        {isError ? (
          <QueryError onRetry={() => refetch()} />
        ) : isLoading || !initialised || !seasonReady ? (
          <RowsSkeleton rows={8} />
        ) : !matches || matches.length === 0 ? (
          <EmptyState
            title="No matches found"
            message="Match scorecards appear here once per-match imports are committed."
          />
        ) : (
          <SectionCard>
            {matches.map((m) => (
              <ResultRow
                key={m.id}
                href={`/matches/${m.id}`}
                badge={<GradeBadge grade={m.grade} size="md" />}
                title={
                  <span className="inline-flex items-center gap-2">
                    vs {m.opponent ?? "Unknown"}
                    <MatchCardCrest club={m.opponentClub} />
                    {m.abandoned && (
                      <span className="rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Abandoned
                      </span>
                    )}
                  </span>
                }
                meta={[
                  m.grade,
                  fmtSeason(m.season),
                  matchLabel(m.round, m.stage),
                  fmtDate(m.matchDate),
                  m.venue,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                ours={m.clubScore}
                theirs={m.opponentScore}
                result={m.abandoned ? null : m.result}
              />
            ))}
          </SectionCard>
        )}
      </PageStack>
    </Container>
  );
}
