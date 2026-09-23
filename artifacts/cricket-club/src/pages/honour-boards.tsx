import { useEffect, useMemo, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  useGetDashboard,
  useListGrades,
  useListPlayers,
  useListPremierships,
  useGetMilestonesBoard,
  getGetGradeLeaderboardQueryOptions,
  getListPlayersQueryKey,
  type MilestoneItem,
} from "@workspace/api-client-react";
import { Search } from "lucide-react";
import { LoadingState, QueryError, EmptyState } from "@/components/data-states";
import {
  BOARDS,
  type BoardKey,
  aggregateCareer,
  computeBoard,
  statToAggregated,
} from "@/lib/honour-boards";
import { useHeroImage } from "@/lib/use-hero-image";
import { useSearchParamState } from "@/lib/use-search-param";
import { CapRegisterTab } from "@/components/cap-register-tab";
import { LifeMembersTab } from "@/components/life-members-tab";
import { AwardsTab } from "@/components/awards-tab";
import { TeamOfDecadeTab } from "@/components/team-of-decade-tab";
import { CommitteeTab } from "@/components/committee-tab";
import { RecordsTab } from "@/components/records-tab";
import type { Scope } from "@/components/honour-boards/types";
import { MILESTONE_FILTERS, MILESTONES_PREVIEW } from "@/components/honour-boards/constants";
import { BoardView } from "@/components/honour-boards/board-cards";
import { DatedMilestoneCard } from "@/components/honour-boards/milestone-cards";
import { SearchResultCard } from "@/components/honour-boards/search-result-card";
import { PremiershipGrid } from "@/components/premierships/premiership-cards";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Container,
  Eyebrow,
  FilterChips,
  FullBleedPage,
  PageHero,
  RowsSkeleton,
  SegmentedControl,
  StatTile,
  StatTileGrid,
  UnderlineTabs,
} from "@/components/broadcast";

export type { PremiershipCount } from "@/components/honour-boards/types";
import type { PremiershipCount } from "@/components/honour-boards/types";

const TABS = [
  { value: "premierships", label: "Premierships" },
  { value: "milestones", label: "Milestones" },
  { value: "leaderboards", label: "Leaderboards" },
  { value: "life-members", label: "Life members" },
  { value: "awards", label: "Awards" },
  { value: "records", label: "Records" },
  { value: "caps", label: "Cap register" },
  { value: "team-of-decade", label: "Team of the decade" },
  { value: "committee", label: "Office bearers" },
  { value: "search", label: "Search" },
] as const;
type Tab = (typeof TABS)[number]["value"];
const TAB_VALUES = new Set<string>(TABS.map((t) => t.value));

function MilestonesPanel() {
  const { data: milestonesBoard } = useGetMilestonesBoard();
  const [kind, setKind] = useState<MilestoneItem["kind"] | "all">("all");
  const [expanded, setExpanded] = useState(false);
  const filtered = useMemo(() => {
    const items = milestonesBoard?.items ?? [];
    return kind === "all" ? items : items.filter((i) => i.kind === kind);
  }, [milestonesBoard, kind]);
  const visible = expanded ? filtered : filtered.slice(0, MILESTONES_PREVIEW);

  return (
    <div className="space-y-4">
      <FilterChips
        label="Milestone type"
        value={kind}
        onChange={(v) => {
          setKind(v);
          setExpanded(false);
        }}
        options={MILESTONE_FILTERS.map((f) => ({ value: f.value, label: f.label }))}
      />
      {filtered.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
          {!milestonesBoard || (milestonesBoard.items.length === 0 && !milestonesBoard.windowStart)
            ? "No dated milestones yet — they appear as match scorecards are imported."
            : "No milestones of this type recorded yet."}
        </div>
      ) : (
        <>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,230px),1fr))]">
            {visible.map((item) => (
              <DatedMilestoneCard key={item.id} item={item} />
            ))}
          </div>
          {filtered.length > MILESTONES_PREVIEW && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="h-10 rounded-full border px-5 text-sm font-semibold transition-colors hover:border-primary"
              >
                {expanded ? "Show less" : `Show ${filtered.length - MILESTONES_PREVIEW} more`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function LeaderboardsPanel() {
  const [boardKey, setBoardKey] = useSearchParamState("board", "games");
  const [scope, setScope] = useState<Scope>("career");
  const [grade, setGrade] = useState("");
  const { data: dashboard } = useGetDashboard();
  const { data: gradesList } = useListGrades();
  const { data: premierships } = useListPremierships();
  const grades = useMemo(() => (gradesList ?? []).map((g) => g.grade), [gradesList]);
  useEffect(() => {
    if (!grade && grades.length > 0) setGrade(grades[0]);
  }, [grades, grade]);

  const premMap = useMemo(() => {
    const m = new Map<number, PremiershipCount>();
    for (const p of premierships ?? []) {
      for (const pl of p.players) {
        if (pl.playerId == null) continue;
        const cur = m.get(pl.playerId) ?? { won: 0, captained: 0 };
        cur.won += 1;
        if (pl.isCaptain) cur.captained += 1;
        m.set(pl.playerId, cur);
      }
    }
    return m;
  }, [premierships]);

  const gradesToFetch = scope === "career" ? grades : grade ? [grade] : [];
  const queries = useQueries({
    queries: gradesToFetch.map((g) => getGetGradeLeaderboardQueryOptions(g)),
  });
  const allStats = useMemo(() => queries.flatMap((q) => q.data ?? []), [queries]);
  const aggregated = useMemo(
    () => (scope === "career" ? aggregateCareer(allStats) : allStats.map(statToAggregated)),
    [allStats, scope],
  );
  const board = BOARDS.find((b) => b.key === boardKey) ?? BOARDS[0];

  return (
    <div className="space-y-5">
      {dashboard && (
        <StatTileGrid>
          <StatTile label="Players" value={dashboard.totalPlayers} />
          <StatTile label="Games" value={dashboard.totalGames} />
          <StatTile label="Runs" value={dashboard.totalRuns} />
          <StatTile label="Wickets" value={dashboard.totalWickets} />
        </StatTileGrid>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={board.key} onValueChange={(v) => setBoardKey(v)}>
          <SelectTrigger
            className="h-10 w-auto min-w-[200px] rounded-full"
            data-testid="board-select"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BOARDS.map((b) => (
              <SelectItem key={b.key} value={b.key}>
                {b.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <SegmentedControl<Scope>
          label="Scope"
          value={scope}
          onChange={setScope}
          options={[
            { value: "career", label: "Career" },
            { value: "by-grade", label: "By grade" },
          ]}
        />
        {scope === "by-grade" && (
          <Select value={grade} onValueChange={setGrade}>
            <SelectTrigger className="h-10 w-auto min-w-[160px] rounded-full">
              <SelectValue placeholder="Grade" />
            </SelectTrigger>
            <SelectContent>
              {grades.map((g) => (
                <SelectItem key={g} value={g}>
                  {g}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      {queries.some((q) => q.isLoading) ? (
        <RowsSkeleton rows={6} />
      ) : queries.some((q) => q.isError) ? (
        <QueryError onRetry={() => queries.forEach((q) => q.refetch())} />
      ) : (
        <BoardView
          tiers={computeBoard(aggregated, board.key as BoardKey)}
          board={board}
          premMap={premMap}
        />
      )}
    </div>
  );
}

function SearchPanel() {
  const [term, setTerm] = useState("");
  const params = { search: term, page: 1, limit: 12 };
  const { data, isLoading, isError, refetch } = useListPlayers(params, {
    query: { enabled: term.trim().length > 0, queryKey: getListPlayersQueryKey(params) },
  });
  return (
    <div className="space-y-4">
      <label className="relative block max-w-[480px]">
        <span className="sr-only">Search players</span>
        <Search
          className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          type="search"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search for a player by name"
          className="h-[46px] w-full rounded-full border bg-card pl-10 pr-4 text-[15px] outline-none placeholder:text-muted-foreground focus:border-primary"
        />
      </label>
      {term.trim().length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
          Start typing to search the club roster.
        </div>
      ) : isError ? (
        <QueryError onRetry={() => refetch()} />
      ) : isLoading ? (
        <LoadingState label="Searching…" />
      ) : !data?.players?.length ? (
        <EmptyState title="No players found" message={`No players matched "${term}".`} />
      ) : (
        <div className="grid gap-3">
          {data.players.map((p) => (
            <SearchResultCard key={p.id} playerId={p.id} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function HonourBoards() {
  const heroImage = useHeroImage("honours");
  const [tabParam, setTab] = useSearchParamState("tab", "premierships");
  const tab: Tab = TAB_VALUES.has(tabParam) ? (tabParam as Tab) : "premierships";
  const premQ = useListPremierships();

  return (
    <FullBleedPage>
      <PageHero
        variant="honours"
        image={heroImage}
        imagePosition="50% 40%"
        fullWidthImage
        className="min-h-[clamp(240px,26vw,340px)]"
        contentClassName="gap-3"
      >
        <Eyebrow className="text-[hsl(var(--primary))]">History</Eyebrow>
        <h1 className="text-[clamp(40px,5.4vw,76px)] leading-[.95] text-white">Honour boards</h1>
        <p className="max-w-[52ch] text-[15px] text-white/80">
          Premierships, life members, awards and records.
        </p>
      </PageHero>

      <Container className="space-y-6 py-[var(--gap-section)]">
        <UnderlineTabs
          label="Honour boards"
          height={52}
          value={tab}
          onChange={(v) => setTab(v)}
          tabs={TABS.map((t) => ({ value: t.value, label: t.label }))}
        />
        <div role="tabpanel" aria-label={TABS.find((t) => t.value === tab)?.label}>
          {tab === "premierships" ? (
            <PremiershipGrid
              premierships={premQ.data}
              isLoading={premQ.isLoading}
              isError={premQ.isError}
              onRetry={() => premQ.refetch()}
            />
          ) : tab === "milestones" ? (
            <MilestonesPanel />
          ) : tab === "leaderboards" ? (
            <LeaderboardsPanel />
          ) : tab === "life-members" ? (
            <LifeMembersTab />
          ) : tab === "awards" ? (
            <AwardsTab />
          ) : tab === "records" ? (
            <RecordsTab />
          ) : tab === "caps" ? (
            <CapRegisterTab />
          ) : tab === "team-of-decade" ? (
            <TeamOfDecadeTab />
          ) : tab === "committee" ? (
            <CommitteeTab />
          ) : (
            <SearchPanel />
          )}
        </div>
      </Container>
    </FullBleedPage>
  );
}
