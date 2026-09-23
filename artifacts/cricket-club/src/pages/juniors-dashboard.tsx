import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useBrand } from "@/lib/brand-context";
import {
  useGetJuniorsOverview,
  useGetJuniorSeasonTopPerformers,
  useGetJuniorsFilters,
  useListJuniorPremierships,
  type JuniorMatchSummary,
  type JuniorPremiership,
} from "@workspace/api-client-react";
import { fmtJuniorDate } from "@/lib/juniors";
import { useNavSurface, type ResolvedNavItem } from "@/lib/use-nav";
import { navIcon } from "@/lib/nav-icons";
import { gradeCode } from "@/lib/grade-code";
import { useHeroImage } from "@/lib/use-hero-image";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { QueryError, EmptyState } from "@/components/data-states";
import {
  Container,
  FilterChips,
  FullBleedPage,
  JuniorGradeTile,
  LeaderRow,
  LivePill,
  PageHero,
  PageStack,
  ResultRow,
  RowsSkeleton,
  SectionCard,
  SegmentedControl,
  StatTile,
  StatTileGrid,
  StatTilesSkeleton,
} from "@/components/broadcast";

const JUNIOR_QUICK_LINKS_FALLBACK: ResolvedNavItem[] = [
  {
    label: "Matches",
    target: "/juniors/matches",
    isExternal: false,
    iconKey: "clipboardList",
    description: "Browse junior games and full scorecards.",
  },
  {
    label: "Premierships",
    target: "/juniors/premierships",
    isExternal: false,
    iconKey: "crown",
    description: "Junior honour boards and winning rosters.",
  },
  {
    label: "Players & Leaders",
    target: "/juniors/players",
    isExternal: false,
    iconKey: "users",
    description: "Runs, wickets and games leaderboards.",
  },
];

/** Admin-configured junior quick links (the junior_quick_links nav surface). */
function JuniorQuickLinks() {
  const links = useNavSurface("junior_quick_links", JUNIOR_QUICK_LINKS_FALLBACK);
  return (
    <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr))]">
      {links.map((item) => {
        const Icon = navIcon(item.iconKey);
        const body = (
          <>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border bg-muted text-primary-text">
              {Icon && <Icon className="h-[18px] w-[18px]" aria-hidden />}
            </span>
            <span className="min-w-0">
              <span className="block font-semibold">{item.label}</span>
              {item.description && (
                <span className="block text-[13px] text-muted-foreground">{item.description}</span>
              )}
            </span>
          </>
        );
        const cls = "flex items-center gap-3 rounded-lg border bg-card p-4 bc-lift";
        return item.isExternal ? (
          <a
            key={item.target}
            href={item.target}
            target="_blank"
            rel="noopener noreferrer"
            className={cls}
          >
            {body}
          </a>
        ) : (
          <Link key={item.target} href={item.target} className={cls}>
            {body}
          </Link>
        );
      })}
    </div>
  );
}

type Metric = "runs" | "wickets";
// Season picker value: "latest" (default), "all" (all-time), or a season string.
type SeasonChoice = "latest" | "all" | string;

function LatestJuniorResults({ matches }: { matches: JuniorMatchSummary[] }) {
  return (
    <SectionCard
      title="Latest junior results"
      action={
        <Link href="/juniors/matches" className="text-sm font-semibold text-primary-text">
          All matches →
        </Link>
      }
    >
      {matches.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">No junior results yet.</p>
      ) : (
        matches.map((m) => (
          <ResultRow
            key={m.id}
            href={`/juniors/matches/${m.id}`}
            badge={<JuniorGradeTile code={gradeCode(m.ageGroup ?? m.grade) || "JR"} />}
            title={`vs ${m.opponentName ?? "Unknown"}`}
            meta={[m.teamName ?? m.ageGroup, m.round, fmtJuniorDate(m.matchDate)]
              .filter(Boolean)
              .join(" · ")}
            ours={m.hhScore}
            theirs={m.opponentScore}
            result={m.hhResult}
          />
        ))
      )}
    </SectionCard>
  );
}

function JuniorPremiershipsCard({ items }: { items: JuniorPremiership[] }) {
  const recent = [...items]
    .sort((a, b) => (b.season ?? "").localeCompare(a.season ?? ""))
    .slice(0, 6);
  return (
    <SectionCard
      title="Junior premierships"
      action={
        <Link href="/juniors/premierships" className="text-sm font-semibold text-primary-text">
          All premierships →
        </Link>
      }
    >
      {recent.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">No junior premierships recorded yet.</p>
      ) : (
        <ul>
          {recent.map((p) => {
            const captain = p.players.find((pl) => pl.isCaptain)?.playerName;
            return (
              <li key={p.id} className="flex items-center gap-4 border-t py-3 first:border-t-0">
                <span className="w-[92px] shrink-0 font-serif text-[26px] font-bold leading-none text-primary-text tabular-nums">
                  {p.season ?? "–"}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold">
                    {p.teamName ?? p.ageGroup ?? "Junior side"}
                  </span>
                  {captain && (
                    <span className="block text-[13px] text-muted-foreground">
                      Captain {captain}
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

function JuniorTopPerformers({ latestSeason }: { latestSeason: string | null }) {
  const { data: filters } = useGetJuniorsFilters();
  const [metric, setMetric] = useState<Metric>("runs");
  const [age, setAge] = useState("all");
  const [season, setSeason] = useState<SeasonChoice>("latest");
  const seasonOptions = useMemo(() => filters?.seasons ?? [], [filters?.seasons]);
  const seasonParams = season === "all" ? { allTime: true } : season === "latest" ? {} : { season };
  const { data: tp, isLoading } = useGetJuniorSeasonTopPerformers({
    ...(age !== "all" ? { ageGroup: age } : {}),
    ...seasonParams,
  });
  useEffect(() => {
    if (age !== "all" && tp && !tp.availableAgeGroups.includes(age)) setAge("all");
  }, [tp, age]);

  const rows =
    metric === "runs"
      ? (tp?.topRunScorers ?? []).map((p) => ({
          id: p.participantId,
          name: p.displayName,
          v: p.runs,
        }))
      : (tp?.topWicketTakers ?? []).map((p) => ({
          id: p.participantId,
          name: p.displayName,
          v: p.wickets,
        }));
  const top = rows.slice(0, 5);
  const max = top[0]?.v ?? 0;
  const seasonValue =
    season === "latest" ? (latestSeason ?? "latest") : season === "all" ? "all" : season;

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
          <Select value={seasonValue} onValueChange={(v) => setSeason(v)}>
            <SelectTrigger
              className="h-9 w-auto gap-2 rounded-full px-3.5"
              data-testid="season-select"
            >
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
      }
    >
      <div className="space-y-3">
        {(tp?.availableAgeGroups.length ?? 0) > 1 && (
          <FilterChips
            label="Age group"
            value={age}
            onChange={setAge}
            options={[
              { value: "all", label: "All" },
              ...(tp?.availableAgeGroups ?? []).map((a) => ({ value: a, label: a })),
            ]}
          />
        )}
        {isLoading ? (
          <RowsSkeleton rows={5} />
        ) : top.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">No data for this season yet.</p>
        ) : (
          top.map((r, i) => (
            <LeaderRow
              key={r.id}
              rank={i + 1}
              name={r.name}
              value={r.v}
              max={max}
              href={`/juniors/players/${r.id}`}
            />
          ))
        )}
      </div>
    </SectionCard>
  );
}

export default function JuniorsDashboard() {
  const brand = useBrand();
  const heroImage = useHeroImage("juniors");
  // Juniors isolation: this page reads only /api/juniors/* hooks.
  const { data, isLoading, isError, refetch } = useGetJuniorsOverview();
  const { data: premierships } = useListJuniorPremierships();

  return (
    <FullBleedPage>
      <PageHero
        variant="juniors"
        image={heroImage}
        imagePosition="45% 40%"
        className="min-h-[clamp(360px,34vw,480px)] text-[#F7EBDD]"
        contentClassName="gap-4"
      >
        <LivePill className="self-start">Junior cricket</LivePill>
        <h1 className="text-[clamp(44px,6.4vw,92px)] leading-[.95] text-[hsl(var(--primary))]">
          Juniors
        </h1>
        <p className="max-w-[46ch] text-[15px] text-[rgba(247,235,221,.82)]">
          Match results, scorecards, premierships and player stats for {brand.name}'s junior sides.
        </p>
      </PageHero>

      <Container className="py-[var(--gap-section)]">
        {isError ? (
          <QueryError onRetry={() => refetch()} />
        ) : isLoading ? (
          <PageStack>
            <StatTilesSkeleton count={4} />
            <RowsSkeleton rows={5} />
          </PageStack>
        ) : !data ? (
          <EmptyState
            title="No junior data yet"
            message="There's no junior data available to show yet."
          />
        ) : (
          <PageStack>
            <StatTileGrid>
              <StatTile label="Junior players" value={data.totals.players} />
              <StatTile label="Age groups" value={data.totals.ageGroups} />
              <StatTile label="Matches" value={data.totals.matches} />
              <StatTile label="Premierships" value={data.totals.premierships} />
            </StatTileGrid>
            <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,460px),1fr))]">
              <LatestJuniorResults matches={data.recentMatches} />
              <JuniorPremiershipsCard items={premierships ?? []} />
            </div>
            <JuniorTopPerformers latestSeason={data.latestSeason ?? null} />
            <JuniorQuickLinks />
          </PageStack>
        )}
      </Container>
    </FullBleedPage>
  );
}
