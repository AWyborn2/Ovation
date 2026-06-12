import { useQueries } from "@tanstack/react-query";
import {
  useGetDashboard,
  useListGrades,
  useListPlayers,
  useListPremierships,
  useGetMilestoneBoardSettings,
  useListRecentDebutants,
  useGetMilestonesBoard,
  getGetGradeLeaderboardQueryOptions,
  getListPlayersQueryKey,
  type DebutEntry,
  type MilestoneItem,
} from "@workspace/api-client-react";
import { ChevronDown, ClipboardList, Crown, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { GradeBadge } from "@/components/grade-badge";
import { LoadingState, TableSkeleton, QueryError, EmptyState } from "@/components/data-states";
import { useEffect, useMemo, useState } from "react";
import {
  BOARDS,
  type BoardKey,
  type MilestoneThresholds,
  DEFAULT_MILESTONE_THRESHOLDS,
  aggregateCareer,
  computeBoard,
  getAvailableSeasons,
  getRecentPromotions,
  getSeasonPromotions,
  getApproachingMilestones,
  statToAggregated,
} from "@/lib/honour-boards";
import { useBrandLogo } from "@/lib/use-brand";
import { useBrand } from "@/lib/brand-context";
import { CapRegisterTab } from "@/components/cap-register-tab";
import { LifeMembersTab } from "@/components/life-members-tab";
import { AwardsTab } from "@/components/awards-tab";
import { TeamOfDecadeTab } from "@/components/team-of-decade-tab";
import { CommitteeTab } from "@/components/committee-tab";
import { RecordsTab } from "@/components/records-tab";
import type { ActiveTab, RecentItem, Scope } from "@/components/honour-boards/types";
import {
  STATISTICS_ITEMS,
  HONOUR_BOARD_ITEMS,
  tabClass,
  dropdownItemClass,
  MILESTONE_FILTERS,
  RECENT_ITEMS_LIMIT,
  MILESTONES_PREVIEW,
} from "@/components/honour-boards/constants";
import {
  SummaryStat,
  BoardView,
  QuickLink,
} from "@/components/honour-boards/board-cards";
import {
  PromotionCard,
  DebutCard,
  ApproachingCard,
  DatedMilestoneCard,
} from "@/components/honour-boards/milestone-cards";
import { SearchResultCard } from "@/components/honour-boards/search-result-card";

export type { PremiershipCount } from "@/components/honour-boards/types";
import type { PremiershipCount } from "@/components/honour-boards/types";

export default function HonourBoards() {
  const logoUrl = useBrandLogo();
  const brand = useBrand();
  const [activeTab, setActiveTab] = useState<ActiveTab>("milestones");
  const [scope, setScope] = useState<Scope>("career");

  // The Milestones tab is career-only; force the scope so its career
  // aggregation (recent/approaching display mode) always has every grade.
  useEffect(() => {
    if (activeTab === "milestones" && scope !== "career") setScope("career");
  }, [activeTab, scope]);
  const [selectedGrade, setSelectedGrade] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [milestoneKind, setMilestoneKind] = useState<MilestoneItem["kind"] | "all">("all");
  const [milestonesExpanded, setMilestonesExpanded] = useState(false);

  const { data: dashboard } = useGetDashboard();
  const { data: gradesList } = useListGrades();
  const { data: premierships } = useListPremierships();

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

  const grades = useMemo(() => (gradesList ?? []).map((g) => g.grade), [gradesList]);

  // Set default selected grade when grades load
  useEffect(() => {
    if (!selectedGrade && grades.length > 0) {
      setSelectedGrade(grades[0]);
    }
  }, [grades, selectedGrade]);

  // Fetch all grade leaderboards (career scope) or just selected (by-grade)
  const gradesToFetch = scope === "career" ? grades : selectedGrade ? [selectedGrade] : [];

  const leaderboardQueries = useQueries({
    queries: gradesToFetch.map((g) => ({
      ...getGetGradeLeaderboardQueryOptions(g),
    })),
  });

  const allStats = useMemo(
    () => leaderboardQueries.flatMap((q) => q.data ?? []),
    [leaderboardQueries],
  );

  const isLoadingBoards = leaderboardQueries.some((q) => q.isLoading);
  const isErrorBoards = leaderboardQueries.some((q) => q.isError);

  const aggregatedPlayers = useMemo(() => {
    if (scope === "career") return aggregateCareer(allStats);
    return allStats.map(statToAggregated);
  }, [allStats, scope]);

  const totalDismissals = useMemo(() => {
    if (!dashboard) return 0;
    return aggregatedPlayers.reduce((sum, p) => sum + p.catches + p.stumpings + p.runOuts, 0);
  }, [aggregatedPlayers, dashboard]);

  const availableSeasons = useMemo(() => getAvailableSeasons(allStats), [allStats]);
  const [selectedSeason, setSelectedSeason] = useState<number | "all">("all");

  useEffect(() => {
    if (selectedSeason === "all") return;
    if (!availableSeasons.includes(selectedSeason)) {
      setSelectedSeason("all");
    }
  }, [availableSeasons, selectedSeason]);

  // Dated, prioritized milestones (centuries, five-fors, hat-tricks, A Grade
  // debuts, career-tier crossings) derived server-side from real match data.
  const { data: milestonesBoard } = useGetMilestonesBoard();

  const filteredMilestones = useMemo(() => {
    const items = milestonesBoard?.items ?? [];
    return milestoneKind === "all"
      ? items
      : items.filter((i) => i.kind === milestoneKind);
  }, [milestonesBoard, milestoneKind]);
  const visibleMilestones = milestonesExpanded
    ? filteredMilestones
    : filteredMilestones.slice(0, MILESTONES_PREVIEW);

  const { data: milestoneSettings } = useGetMilestoneBoardSettings();
  const milestoneMode = milestoneSettings?.displayMode ?? "recent";
  const milestoneThresholds: MilestoneThresholds = useMemo(
    () => ({
      games: milestoneSettings?.gamesThreshold ?? DEFAULT_MILESTONE_THRESHOLDS.games,
      runs: milestoneSettings?.runsThreshold ?? DEFAULT_MILESTONE_THRESHOLDS.runs,
      wickets: milestoneSettings?.wicketsThreshold ?? DEFAULT_MILESTONE_THRESHOLDS.wickets,
    }),
    [milestoneSettings],
  );
  const showRecent = milestoneMode === "recent" || milestoneMode === "both";
  const showApproaching = milestoneMode === "approaching" || milestoneMode === "both";

  const recentPromotions = useMemo(() => {
    if (scope !== "career" || !showRecent) return [];
    if (selectedSeason === "all") return getRecentPromotions(aggregatedPlayers, 5, milestoneThresholds);
    return getSeasonPromotions(allStats, selectedSeason, 5, milestoneThresholds);
  }, [aggregatedPlayers, allStats, scope, selectedSeason, showRecent, milestoneThresholds]);

  // Recent A Grade / Female A Grade debutants — derived from the cap register
  // (ungated by the milestone engine). Only dated debuts (those with a matched
  // per-match record) surface here; older seeded caps with no match record are
  // historical and never "just achieved". The endpoint returns freshest first.
  const { data: debutants } = useListRecentDebutants();
  const recentDebuts = useMemo<DebutEntry[]>(() => {
    if (scope !== "career" || !showRecent) return [];
    const dated = (debutants ?? []).filter((d) => d.season != null);
    if (selectedSeason === "all") return dated;
    return dated.filter((d) => d.season === selectedSeason);
  }, [debutants, scope, showRecent, selectedSeason]);

  // Merge debuts into the "Just achieved" list, giving the freshest debuts
  // priority so older career-total milestones can't crowd them out.
  const recentItems = useMemo<RecentItem[]>(() => {
    const debutItems: RecentItem[] = recentDebuts.map((d) => ({
      kind: "debut",
      key: `debut-${d.playerId}-${d.capNumber}`,
      debut: d,
    }));
    const promoItems: RecentItem[] = recentPromotions.map((p) => ({
      kind: "promotion",
      key: `promo-${p.playerId}-${p.boardKey}`,
      promotion: p,
    }));
    return [...debutItems, ...promoItems].slice(0, RECENT_ITEMS_LIMIT);
  }, [recentDebuts, recentPromotions]);

  const approachingMilestones = useMemo(() => {
    if (scope !== "career" || !showApproaching) return [];
    return getApproachingMilestones(aggregatedPlayers, 5, milestoneThresholds);
  }, [aggregatedPlayers, scope, showApproaching, milestoneThresholds]);

  const thresholdSummary = `${milestoneThresholds.games.toLocaleString()}+ games, ${milestoneThresholds.runs.toLocaleString()}+ runs and ${milestoneThresholds.wickets.toLocaleString()}+ wickets clubs`;
  const promotionHeading =
    milestoneMode === "approaching"
      ? "Approaching milestones"
      : selectedSeason === "all" || !showRecent
        ? "Significant milestones"
        : `Significant milestones in ${selectedSeason}`;
  const promotionSubheading =
    milestoneMode === "approaching"
      ? `Players closing in on the ${thresholdSummary}`
      : milestoneMode === "both"
        ? `Recent achievers and players approaching the ${thresholdSummary}`
        : selectedSeason === "all"
          ? thresholdSummary
          : `Players who reached the ${thresholdSummary} in ${selectedSeason}`;

  // Search
  const searchParams = { search: searchTerm, page: 1, limit: 12 };
  const {
    data: searchResults,
    isLoading: isSearchLoading,
    isError: isSearchError,
    refetch: refetchSearch,
  } = useListPlayers(
    searchParams,
    {
      query: {
        enabled: activeTab === "search" && searchTerm.trim().length > 0,
        queryKey: getListPlayersQueryKey(searchParams),
      },
    },
  );

  return (
    <div className="space-y-6">
      {/* Hero header */}
      <div className="bg-card border border-border rounded-md p-6 md:p-8 flex items-center gap-4 md:gap-6 shadow-lg">
        <img src={logoUrl} alt={brand.name} className="h-16 md:h-20 w-auto drop-shadow-lg" />
        <div>
          <h1 className="text-2xl md:text-4xl font-serif font-bold text-primary m-0 leading-tight">
            {brand.name} — Honour Boards
          </h1>
          <div className="text-xs md:text-sm uppercase tracking-widest text-muted-foreground mt-2">
            Established 1991 • Career milestones across all grades
          </div>
        </div>
      </div>

      {/* Summary stats */}
      {dashboard && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <SummaryStat label="Total Players" value={dashboard.totalPlayers} />
          <SummaryStat label="Total Games" value={dashboard.totalGames} />
          <SummaryStat label="Runs Scored" value={dashboard.totalRuns} />
          <SummaryStat label="Wickets" value={dashboard.totalWickets} />
          <SummaryStat label="Total Dismissals" value={totalDismissals} />
        </div>
      )}

      {/* Quick links */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <QuickLink href="/matches" icon={ClipboardList} title="Matches" desc="Browse senior games and full scorecards." />
        <QuickLink href="/premierships" icon={Crown} title="Premierships" desc="Senior honour boards and winning rosters." />
        <QuickLink href="/players" icon={Users} title="Players & Leaders" desc="Runs, wickets and games leaderboards." />
      </div>

      {/* Tabs */}
      {(() => {
        const activeStat = STATISTICS_ITEMS.find((b) => b.key === activeTab);
        const activeHonourBoard = HONOUR_BOARD_ITEMS.find((h) => h.tab === activeTab);
        return (
          <div className="bg-card border border-border rounded-md p-2 flex flex-wrap items-center gap-2 shadow-md">
            <button onClick={() => setActiveTab("milestones")} className={tabClass(activeTab === "milestones")}>
              Milestones
            </button>

            {/* Statistics — career/by-grade leaderboards (Games lives in Honour Boards) */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className={tabClass(!!activeStat)}>
                  {activeStat ? `Statistics: ${activeStat.label}` : "Statistics"}
                  <ChevronDown className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                {STATISTICS_ITEMS.map((b) => (
                  <DropdownMenuItem
                    key={b.key}
                    onSelect={() => setActiveTab(b.key)}
                    className={dropdownItemClass(activeTab === b.key)}
                  >
                    {b.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Honour Boards — Games Played plus the curated boards */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className={tabClass(!!activeHonourBoard)}>
                  {activeHonourBoard ? `Honour Boards: ${activeHonourBoard.label}` : "Honour Boards"}
                  <ChevronDown className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                {HONOUR_BOARD_ITEMS.map((h) => (
                  <DropdownMenuItem
                    key={h.tab}
                    onSelect={() => setActiveTab(h.tab)}
                    className={dropdownItemClass(activeTab === h.tab)}
                  >
                    {h.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <button onClick={() => setActiveTab("caps")} className={tabClass(activeTab === "caps")}>
              A Grade Caps
            </button>
            <button onClick={() => setActiveTab("life-members")} className={tabClass(activeTab === "life-members")}>
              Life Members
            </button>

            <button onClick={() => setActiveTab("search")} className={tabClass(activeTab === "search")}>
              Search
            </button>
          </div>
        );
      })()}

      {/* Scope control — only shown for leaderboard (BOARDS) tabs, including
          Games. Hidden for milestones, search, and the curated honour tabs
          (caps / life-members / awards / team-of-decade / committee / records). */}
      {activeTab !== "milestones" && activeTab !== "search" && activeTab !== "caps" && activeTab !== "life-members" && activeTab !== "awards" && activeTab !== "team-of-decade" && activeTab !== "committee" && activeTab !== "records" && (
        <div className="bg-card border border-border rounded-md p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5 flex-wrap shadow-md">
          <span className="text-xs font-bold uppercase tracking-widest text-primary">Scope</span>
          <div className="inline-flex rounded overflow-hidden border-2 border-primary self-start">
            <button
              onClick={() => setScope("career")}
              className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
                scope === "career" ? "bg-primary text-primary-foreground" : "text-primary hover:bg-primary/15"
              }`}
            >
              Career
            </button>
            <button
              onClick={() => setScope("by-grade")}
              className={`px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors border-l-2 border-primary ${
                scope === "by-grade" ? "bg-primary text-primary-foreground" : "text-primary hover:bg-primary/15"
              }`}
            >
              By Grade
            </button>
          </div>
          {scope === "by-grade" && (
            <div className="flex items-center gap-3 self-start">
              {selectedGrade && <GradeBadge grade={selectedGrade} size="md" />}
              <select
                value={selectedGrade}
                onChange={(e) => setSelectedGrade(e.target.value)}
                className="px-3 py-2 rounded border-2 border-primary bg-card text-foreground text-sm font-medium"
              >
                {grades.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Tab content */}
      {activeTab === "milestones" ? (
        <div className="space-y-6">
          {/* Dated, prioritized achievements from real match data */}
          <div className="bg-card border border-border rounded-md p-5 md:p-6 shadow-md space-y-4">
            <div>
              <h2 className="text-lg md:text-xl font-serif font-bold text-primary m-0">
                {milestonesBoard?.featured ? "Recent milestones" : "Milestones"}
              </h2>
              <div className="text-xs uppercase tracking-widest text-muted-foreground mt-1">
                {milestonesBoard?.featured
                  ? "Latest centuries, five-fors, hat-tricks, debuts and career milestones"
                  : "Significant achievements, ranked by milestone"}
              </div>
            </div>
            <div className="w-12 h-[2px] bg-primary" />
            <div className="flex flex-wrap gap-2">
              {MILESTONE_FILTERS.map((f) => {
                const active = milestoneKind === f.value;
                return (
                  <button
                    key={f.value}
                    onClick={() => {
                      setMilestoneKind(f.value);
                      setMilestonesExpanded(false);
                    }}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border text-muted-foreground hover:border-primary hover:text-primary"
                    }`}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
            {filteredMilestones.length === 0 ? (
              <div className="text-sm text-muted-foreground italic">
                {!milestonesBoard || (milestonesBoard.items.length === 0 && !milestonesBoard.windowStart)
                  ? "No dated milestones yet — they appear as match scorecards are imported."
                  : milestoneKind === "all"
                    ? "No milestones recorded yet."
                    : `No ${MILESTONE_FILTERS.find((f) => f.value === milestoneKind)?.label.toLowerCase()} recorded yet.`}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                  {visibleMilestones.map((item) => (
                    <DatedMilestoneCard key={item.id} item={item} />
                  ))}
                </div>
                {filteredMilestones.length > MILESTONES_PREVIEW && (
                  <div className="flex justify-center">
                    <button
                      onClick={() => setMilestonesExpanded((v) => !v)}
                      className="px-4 py-2 rounded text-xs font-bold uppercase tracking-wider border-2 border-primary text-primary hover:bg-primary/15 transition-colors"
                    >
                      {milestonesExpanded
                        ? "Show less"
                        : `Show ${filteredMilestones.length - MILESTONES_PREVIEW} more`}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Existing display mode (recent / approaching / both) — preserved */}
          <div className="bg-card border border-border rounded-md p-5 md:p-6 shadow-md space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2">
              <div>
                <h2 className="text-lg md:text-xl font-serif font-bold text-primary m-0">{promotionHeading}</h2>
                <div className="text-xs uppercase tracking-widest text-muted-foreground mt-1">{promotionSubheading}</div>
              </div>
              {showRecent && (
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-primary">Season</label>
                  <select
                    value={selectedSeason === "all" ? "all" : String(selectedSeason)}
                    onChange={(e) =>
                      setSelectedSeason(e.target.value === "all" ? "all" : parseInt(e.target.value, 10))
                    }
                    className="px-3 py-2 rounded border-2 border-primary bg-card text-foreground text-sm font-medium"
                  >
                    <option value="all">All-time</option>
                    {availableSeasons.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="w-12 h-[2px] bg-primary" />

            {/* Recent achievers */}
            {showRecent && (
              <div className="space-y-3">
                {milestoneMode === "both" && (
                  <div className="text-xs font-bold uppercase tracking-widest text-primary/80">
                    Just achieved
                  </div>
                )}
                {recentItems.length === 0 ? (
                  <div className="text-sm text-muted-foreground italic">
                    {selectedSeason === "all"
                      ? "No significant milestones to show yet."
                      : `No players reached a significant milestone in ${selectedSeason}.`}
                  </div>
                ) : (
                  <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
                    {recentItems.map((item) =>
                      item.kind === "debut" ? (
                        <DebutCard key={item.key} entry={item.debut} />
                      ) : (
                        <PromotionCard key={item.key} entry={item.promotion} />
                      ),
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Visual divider between the two sub-boards */}
            {milestoneMode === "both" && (
              <div className="border-t border-dashed border-border" />
            )}

            {/* Approaching */}
            {showApproaching && (
              <div className="space-y-3">
                {milestoneMode === "both" && (
                  <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    Approaching
                  </div>
                )}
                {approachingMilestones.length === 0 ? (
                  <div className="text-sm text-muted-foreground italic">
                    No players approaching a significant milestone right now.
                  </div>
                ) : (
                  <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
                    {approachingMilestones.map((p) => (
                      <ApproachingCard key={`${p.playerId}-${p.boardKey}`} entry={p} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : activeTab === "caps" ? (
        <CapRegisterTab />
      ) : activeTab === "life-members" ? (
        <LifeMembersTab />
      ) : activeTab === "awards" ? (
        <AwardsTab />
      ) : activeTab === "team-of-decade" ? (
        <TeamOfDecadeTab />
      ) : activeTab === "committee" ? (
        <CommitteeTab />
      ) : activeTab === "records" ? (
        <RecordsTab />
      ) : activeTab === "search" ? (
        <div className="space-y-4">
          <Input
            placeholder="Search for a player by name…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full text-base"
          />
          {searchTerm.trim().length === 0 ? (
            <div className="bg-card border border-border rounded-md p-8 text-center text-muted-foreground italic">
              Start typing to search the club roster.
            </div>
          ) : isSearchError ? (
            <QueryError onRetry={() => refetchSearch()} />
          ) : isSearchLoading ? (
            <LoadingState label="Searching…" />
          ) : !searchResults?.players?.length ? (
            <EmptyState
              title="No players found"
              message={`No players matched "${searchTerm}".`}
            />
          ) : (
            <div className="grid gap-3">
              {searchResults.players.map((p) => (
                <SearchResultCard key={p.id} playerId={p.id} />
              ))}
            </div>
          )}
        </div>
      ) : isLoadingBoards ? (
        <TableSkeleton />
      ) : isErrorBoards ? (
        <QueryError onRetry={() => leaderboardQueries.forEach((q) => q.refetch())} />
      ) : (
        (() => {
          const board = BOARDS.find((b) => b.key === (activeTab as BoardKey))!;
          const tiers = computeBoard(aggregatedPlayers, board.key);
          return <BoardView tiers={tiers} board={board} premMap={premMap} />;
        })()
      )}

      <div className="text-center text-xs uppercase tracking-widest text-muted-foreground bg-card border border-border rounded-md py-4 border-t-4 border-t-primary">
        Last updated:{" "}
        <span className="text-primary font-bold">
          {new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}
        </span>{" "}
        • {brand.name}
      </div>
    </div>
  );
}
