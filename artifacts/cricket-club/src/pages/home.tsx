import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  useGetSeniorOverview,
  useGetSeniorSeasonTopPerformers,
  type MatchSummary,
} from "@workspace/api-client-react";
import { useBrand, useClubShortName } from "@/lib/brand-context";
import { useExploreImage, useHeroImage } from "@/lib/use-hero-image";
import { clubAbbrev, gradeCode } from "@/lib/grade-code";
import { matchLabel } from "@/lib/utils";
import { GradeBadge, sortGradesBySeniority } from "@/components/grade-badge";
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
  FilterChips,
  FullBleedPage,
  LeaderRow,
  LivePill,
  PageHero,
  PageStack,
  PhotoCard,
  ResultRow,
  ResultsTicker,
  RowsSkeleton,
  SectionCard,
  SegmentedControl,
  StatTile,
  StatTileGrid,
  StatTilesSkeleton,
  type TickerItem,
} from "@/components/broadcast";

type Metric = "runs" | "wickets";
// Season picker value: "latest" (default), "all" (all-time), or a season year.
type SeasonChoice = "latest" | "all" | number;

/** "2026-03-07" → "Sat 7 Mar" (null when unparseable). */
export function shortMatchDate(iso: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** The newest match (by date, then id) — the "Latest scorecard" CTA target. */
export function latestMatch(matches: MatchSummary[]): MatchSummary | null {
  return (
    [...matches].sort(
      (a, b) => (b.matchDate ?? "").localeCompare(a.matchDate ?? "") || b.id - a.id,
    )[0] ?? null
  );
}

/** Ticker items: one per latest-round result across the senior grades. */
export function tickerItems(matches: MatchSummary[], clubShort: string): TickerItem[] {
  return sortGradesBySeniority(new Set(matches.map((m) => m.grade))).flatMap((grade) =>
    matches
      .filter((m) => m.grade === grade && !m.abandoned && (m.clubScore || m.opponentScore))
      .map((m) => ({
        id: m.id,
        grade: gradeCode(m.grade),
        line: `${clubShort} ${m.clubScore ?? "–"} v ${clubAbbrev(
          m.opponentClub?.name ?? m.opponent,
          m.opponentClub?.shortName,
        )} ${m.opponentScore ?? "–"}`,
        result: m.result,
        href: `/matches/${m.id}`,
      })),
  );
}

function LatestResults({ matches }: { matches: MatchSummary[] }) {
  return (
    <SectionCard
      title="Latest results"
      action={
        <Link href="/matches" className="text-sm font-semibold text-primary-text">
          All matches →
        </Link>
      }
    >
      <div data-tour="recent-matches">
        {matches.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">No results yet this season.</p>
        ) : (
          matches.map((m) => (
            <ResultRow
              key={m.id}
              href={`/matches/${m.id}`}
              badge={<GradeBadge grade={m.grade} size="md" />}
              title={`vs ${m.opponent ?? "Unknown"}`}
              meta={[m.grade, matchLabel(m.round, m.stage), shortMatchDate(m.matchDate), m.venue]
                .filter(Boolean)
                .join(" · ")}
              ours={m.clubScore}
              theirs={m.opponentScore}
              result={m.abandoned ? null : m.result}
            />
          ))
        )}
      </div>
    </SectionCard>
  );
}

function TopPerformers({
  seasons,
  latestSeason,
}: {
  seasons: { season: number; label: string }[];
  latestSeason: number | null;
}) {
  const [metric, setMetric] = useState<Metric>("runs");
  const [grade, setGrade] = useState<string>("all");
  const [season, setSeason] = useState<SeasonChoice>("latest");

  const seasonParams = season === "all" ? { allTime: true } : season === "latest" ? {} : { season };
  const { data: tp, isLoading } = useGetSeniorSeasonTopPerformers({
    ...(grade !== "all" ? { grade } : {}),
    ...seasonParams,
  });

  const grades = useMemo(
    () => sortGradesBySeniority(tp?.availableGrades ?? []),
    [tp?.availableGrades],
  );

  // A grade with no records in the newly chosen season falls back to all
  // grades, so the chips never show a stale, empty filter.
  useEffect(() => {
    if (grade !== "all" && tp && !tp.availableGrades.includes(grade)) setGrade("all");
  }, [tp, grade]);

  const leaders = (metric === "runs" ? tp?.topRunScorers : tp?.topWicketTakers) ?? [];
  const top = leaders.slice(0, 5);
  const max = top[0]?.value ?? 0;
  const seasonValue =
    season === "latest"
      ? latestSeason != null
        ? String(latestSeason)
        : "latest"
      : season === "all"
        ? "all"
        : String(season);

  return (
    <SectionCard
      title="Top performers"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl<Metric>
            label="Leaderboard"
            value={metric}
            onChange={setMetric}
            options={[
              { value: "runs", label: "Runs" },
              { value: "wickets", label: "Wickets" },
            ]}
          />
          <Select
            value={seasonValue}
            onValueChange={(v) => setSeason(v === "all" ? "all" : Number(v))}
          >
            <SelectTrigger
              className="h-9 w-auto gap-2 rounded-full px-3.5"
              data-testid="season-select"
            >
              <SelectValue placeholder="Season" />
            </SelectTrigger>
            <SelectContent>
              {seasons.map((s) => (
                <SelectItem key={s.season} value={String(s.season)}>
                  {s.label}
                </SelectItem>
              ))}
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
        </div>
      }
    >
      <div data-tour="top-performers" className="space-y-3">
        {grades.length > 1 && (
          <FilterChips
            label="Grade"
            value={grade}
            onChange={setGrade}
            options={[
              { value: "all", label: "All" },
              ...grades.map((g) => ({ value: g, label: g })),
            ]}
          />
        )}
        {isLoading ? (
          <RowsSkeleton rows={5} />
        ) : top.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">No data for this season yet.</p>
        ) : (
          <div>
            {top.map((p, i) => (
              <LeaderRow
                key={p.playerId}
                rank={i + 1}
                name={`${p.givenName} ${p.surname}`}
                value={p.value}
                max={max}
                href={`/players/${p.playerId}`}
              />
            ))}
          </div>
        )}
      </div>
    </SectionCard>
  );
}

function ExploreGrid() {
  const honours = useExploreImage("honours");
  const players = useExploreImage("players");
  const premierships = useExploreImage("premierships");
  return (
    <section className="space-y-4" data-tour="quick-links">
      <h2 className="text-[clamp(22px,2.2vw,28px)] leading-none">Explore the club</h2>
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))]">
        <PhotoCard
          href="/honour-boards"
          image={honours}
          title="Honour boards"
          description="Premierships, life members, awards and records."
        />
        <PhotoCard
          href="/players"
          image={players}
          title="Players"
          description="Every player who has represented the club."
        />
        <PhotoCard
          href="/premierships"
          image={premierships}
          title="Premierships"
          description="The sides that brought home the flag."
        />
      </div>
    </section>
  );
}

export default function Home() {
  const brand = useBrand();
  const clubShort = useClubShortName();
  const heroImage = useHeroImage("home");
  const { data, isLoading, isError, refetch } = useGetSeniorOverview();

  const recent = data?.recentMatches ?? [];
  const latest = latestMatch(recent);
  const round = recent.reduce<number | null>(
    (acc, m) => (m.round != null && (acc == null || m.round > acc) ? m.round : acc),
    null,
  );
  const liveLabel = [
    data?.latestSeasonLabel ? `${data.latestSeasonLabel} season` : null,
    round != null ? `Round ${round}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <FullBleedPage>
      <PageHero
        variant="home"
        image={heroImage}
        className="min-h-[clamp(420px,40vw,540px)]"
        contentClassName="gap-5"
      >
        {liveLabel && <LivePill className="self-start">{liveLabel}</LivePill>}
        <h1 className="max-w-[9ch] text-[clamp(56px,8.4vw,120px)] font-extrabold leading-[.88] text-white">
          Senior cricket
        </h1>
        <p className="max-w-[46ch] text-[15px] text-white/80">
          Results, scorecards, records and player stats for {brand.name}'s senior grades.
        </p>
        <div className="flex flex-wrap gap-3">
          {latest && (
            <Link
              href={`/matches/${latest.id}`}
              className="inline-flex h-[46px] items-center rounded-sm bg-primary px-5 font-bold text-primary-foreground transition-transform hover:-translate-y-0.5"
            >
              Latest scorecard
            </Link>
          )}
          <Link
            href="/players"
            className="inline-flex h-[46px] items-center rounded-sm border border-white/30 bg-white/10 px-5 font-bold text-white backdrop-blur-md transition-transform hover:-translate-y-0.5"
          >
            Browse players
          </Link>
        </div>
        <ResultsTicker items={tickerItems(recent, clubShort.toUpperCase())} className="mt-3" />
      </PageHero>

      <Container className="py-[var(--gap-section)]">
        {isError ? (
          <QueryError onRetry={() => refetch()} />
        ) : isLoading ? (
          <PageStack>
            <StatTilesSkeleton />
            <RowsSkeleton rows={5} />
          </PageStack>
        ) : !data ? (
          <EmptyState
            title="No senior data yet"
            message="Senior stats appear here once imports are committed."
          />
        ) : (
          <PageStack>
            <div data-tour="home-totals">
              <StatTileGrid>
                <StatTile label="Players" value={data.totals.players} />
                <StatTile label="Games" value={data.totals.games} />
                <StatTile label="Runs" value={data.totals.runs} />
                <StatTile label="Wickets" value={data.totals.wickets} />
                <StatTile label="Grades" value={data.totals.grades} />
              </StatTileGrid>
            </div>
            <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,460px),1fr))]">
              <LatestResults matches={recent} />
              <TopPerformers seasons={data.availableSeasons} latestSeason={data.latestSeason} />
            </div>
            <ExploreGrid />
          </PageStack>
        )}
      </Container>
    </FullBleedPage>
  );
}
