import { Link } from "wouter";
import { useQueries } from "@tanstack/react-query";
import {
  useGetDashboard,
  useListGrades,
  useListPlayers,
  useGetPlayer,
  useListPremierships,
  useGetMilestoneBoardSettings,
  useListRecentDebutants,
  useGetMilestonesBoard,
  getGetGradeLeaderboardQueryOptions,
  getGetPlayerQueryKey,
  getListPlayersQueryKey,
  type DebutEntry,
  type MilestoneItem,
} from "@workspace/api-client-react";
import { Trophy, Star, Award, Target, Zap, Flame, UserPlus, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TierBadge } from "@/components/tier-badge";
import { GradeBadge, GradeBadgeList, GradeBadgeListFromString } from "@/components/grade-badge";
import { ShareButton } from "@/components/share-card-modal";
import { useEffect, useMemo, useState } from "react";
import {
  BOARDS,
  type BoardKey,
  type BoardTier,
  type PromotionEntry,
  type ApproachingEntry,
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
import logoUrl from "@assets/HHCC_logo_(1)_1779834789645.png";
import { CapRegisterTab } from "@/components/cap-register-tab";
import { LifeMembersTab } from "@/components/life-members-tab";
import { AwardsTab } from "@/components/awards-tab";
import { TeamOfDecadeTab } from "@/components/team-of-decade-tab";
import { CommitteeTab } from "@/components/committee-tab";
import { RecordsTab } from "@/components/records-tab";

type Scope = "career" | "by-grade";
type ExtraTab = "milestones" | "caps" | "life-members" | "awards" | "team-of-decade" | "committee" | "records" | "search";
type ActiveTab = BoardKey | ExtraTab;

// "Honours" dropdown — the non-leaderboard boards (no career/by-grade scope).
const HONOURS_ITEMS: { tab: ExtraTab; label: string }[] = [
  { tab: "caps", label: "A Grade Caps" },
  { tab: "life-members", label: "Life Members" },
  { tab: "awards", label: "Awards" },
  { tab: "team-of-decade", label: "Team of the Decade" },
  { tab: "committee", label: "Office Bearers" },
  { tab: "records", label: "Notable Records" },
];

const tabClass = (active: boolean) =>
  `inline-flex items-center gap-1.5 px-4 md:px-5 py-2.5 rounded text-xs md:text-sm font-bold uppercase tracking-wider transition-colors ${
    active
      ? "bg-primary text-primary-foreground"
      : "text-muted-foreground hover:bg-muted hover:text-primary"
  }`;

const dropdownItemClass = (active: boolean) =>
  `cursor-pointer text-xs md:text-sm font-semibold uppercase tracking-wider ${
    active ? "bg-primary/10 text-primary" : ""
  }`;

// A card in the "Just achieved" list: either a career-total milestone promotion
// or an A Grade / Female A Grade debut.
type RecentItem =
  | { kind: "debut"; key: string; debut: DebutEntry }
  | { kind: "promotion"; key: string; promotion: PromotionEntry };

// Max cards shown in the "Just achieved" grid (debuts first, then milestones).
const RECENT_ITEMS_LIMIT = 5;

const SummaryStat = ({ label, value }: { label: string; value: string | number }) => (
  <div className="bg-card border border-border rounded-md p-5 shadow-md">
    <div className="text-3xl md:text-4xl font-serif font-bold text-primary">
      {typeof value === "number" ? value.toLocaleString() : value}
    </div>
    <div className="text-xs uppercase tracking-widest text-muted-foreground mt-1 font-serif">{label}</div>
  </div>
);

export type PremiershipCount = { won: number; captained: number };

const PremiershipBadge = ({ count }: { count: PremiershipCount }) => {
  if (count.won === 0) return <span className="text-muted-foreground/60">—</span>;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/15 border border-amber-600/40 text-amber-700 dark:text-amber-300 font-bold text-xs"
      title={`${count.won} premiership${count.won === 1 ? "" : "s"}${count.captained ? `, captained ${count.captained}` : ""}`}
    >
      <Trophy className="h-3 w-3" />
      <span className="font-mono">{count.won}</span>
      {count.captained > 0 && (
        <span className="ml-0.5 font-mono text-[10px] bg-amber-600 text-white rounded px-1">
          C×{count.captained}
        </span>
      )}
    </span>
  );
};

const BoardCard = ({ tier, board, premMap }: { tier: BoardTier; board: (typeof BOARDS)[number]; premMap?: Map<number, PremiershipCount> }) => (
  <div className="bg-card border border-border rounded-md overflow-hidden shadow-lg">
    <div className="bg-primary text-primary-foreground px-4 md:px-6 py-3 font-serif font-bold uppercase tracking-wider text-sm flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 md:gap-3">
        <TierBadge tierIndex={tier.tierIndex} />
        <span>{tier.label}</span>
      </span>
      <span className="text-xs whitespace-nowrap">{tier.rows.length} {tier.rows.length === 1 ? "player" : "players"}</span>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-black/25">
            <th className="text-center font-serif uppercase tracking-wider text-primary p-3 text-xs w-14">#</th>
            <th className="text-left font-serif uppercase tracking-wider text-primary p-3 text-xs">Surname</th>
            <th className="text-left font-serif uppercase tracking-wider text-primary p-3 text-xs">Given Name</th>
            <th className="text-right font-serif uppercase tracking-wider text-primary p-3 text-xs">{board.headlineLabel}</th>
            {board.key === "games" && (
              <th className="text-center font-serif uppercase tracking-wider text-primary p-3 text-xs">Prem</th>
            )}
            <th className={`font-serif uppercase tracking-wider text-primary p-3 text-xs hidden sm:table-cell ${board.key === "games" ? "text-left" : "text-right"}`}>{board.key === "games" ? "Grades" : board.supportingLabel}</th>
          </tr>
        </thead>
        <tbody>
          {tier.rows.map((r, i) => (
            <tr key={r.playerId} className={`border-t border-border/50 hover:bg-primary/10 transition-colors ${i % 2 ? "bg-black/10" : ""}`}>
              <td className="p-3 text-center font-mono text-primary font-bold">{tier.startRank + i}</td>
              <td className="p-3">
                <Link href={`/players/${r.playerId}`} className="font-semibold text-primary hover:underline uppercase">
                  {r.surname}
                </Link>
              </td>
              <td className="p-3 text-foreground/90">{r.givenName}</td>
              <td className="p-3 text-right font-mono font-bold">{r.headline}</td>
              {board.key === "games" && (
                <td className="p-3 text-center">
                  <PremiershipBadge count={premMap?.get(r.playerId) ?? { won: 0, captained: 0 }} />
                </td>
              )}
              <td className="p-3 hidden sm:table-cell">
                {board.key === "games" ? (
                  <GradeBadgeList grades={r.gradesPlayed} size="sm" />
                ) : (
                  <span className="block text-right font-mono text-muted-foreground">{r.supporting}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

const BoardView = ({ tiers, board, premMap }: { tiers: BoardTier[]; board: (typeof BOARDS)[number]; premMap?: Map<number, PremiershipCount> }) => (
  <div className="space-y-4">
    <div className="bg-card border border-border rounded-md p-6 shadow-md">
      <h2 className="text-2xl md:text-3xl font-serif font-bold text-primary m-0">{board.title}</h2>
      <div className="w-20 h-[3px] bg-primary mt-3" />
      <p className="text-muted-foreground italic mt-3 mb-0">{board.subtitle}</p>
    </div>
    {tiers.length === 0 ? (
      <div className="bg-card border border-border rounded-md p-8 text-center text-muted-foreground italic">
        No players qualify yet.
      </div>
    ) : (
      tiers.map((t) => <BoardCard key={t.label} tier={t} board={board} premMap={premMap} />)
    )}
  </div>
);

const PromotionCard = ({ entry: p }: { entry: PromotionEntry }) => {
  return (
    <div className="group relative bg-background/60 border border-border rounded-md p-3 flex flex-col gap-2 hover:border-primary hover:bg-primary/5 transition-colors">
      <Link href={`/players/${p.playerId}`} className="flex flex-col gap-2 pr-8">
        <div className="flex items-center gap-2">
          <TierBadge tierIndex={p.tierIndex} className="h-5 w-5 text-primary shrink-0" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-primary truncate">
            {p.tierLabel}
          </span>
        </div>
        <div className="font-serif font-bold text-primary uppercase leading-tight group-hover:underline">
          {p.surname}
          <span className="font-sans font-normal text-foreground/80 normal-case"> {p.givenName}</span>
        </div>
        <div className="text-xs text-muted-foreground mt-auto">
          <span className="font-mono font-bold text-foreground">{p.currentValue.toLocaleString()}</span>{" "}
          {p.boardLabel.toLowerCase()} • just past {p.threshold.toLocaleString()}
        </div>
      </Link>
      <div className="absolute top-2 right-2">
        <ShareButton
          engine="milestone"
          appPath={`/players/${p.playerId}`}
          playerId={p.playerId}
          iconOnly
          variant="ghost"
          size="icon"
          label={`Share ${p.givenName} ${p.surname} milestone`}
          className="h-7 w-7"
          input={{
            kind: "milestone",
            playerName: `${p.givenName} ${p.surname}`.trim(),
            tierLabel: p.tierLabel,
            tierIndex: p.tierIndex,
            milestoneLabel: p.boardLabel,
            currentValue: p.currentValue,
            threshold: p.threshold,
            headline: "Just Promoted",
          }}
        />
      </div>
    </div>
  );
};

const DebutCard = ({ entry: d }: { entry: DebutEntry }) => {
  const subline =
    d.season != null
      ? `${d.grade} Cap #${d.capNumber} • ${d.round != null ? `Round ${d.round}, ` : ""}${d.season}`
      : `${d.grade} Cap #${d.capNumber}`;
  return (
    <div className="group relative bg-background/60 border border-border rounded-md p-3 flex flex-col gap-2 hover:border-primary hover:bg-primary/5 transition-colors">
      <Link href={`/players/${d.playerId}`} className="flex flex-col gap-2 pr-8">
        <div className="flex items-center gap-2">
          <Star className="h-5 w-5 text-primary shrink-0" strokeWidth={2.25} />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-primary truncate">
            Debut
          </span>
        </div>
        <div className="font-serif font-bold text-primary uppercase leading-tight group-hover:underline">
          {d.name}
        </div>
        <div className="text-xs text-muted-foreground mt-auto">{subline}</div>
      </Link>
      <div className="absolute top-2 right-2">
        <ShareButton
          engine="milestone"
          appPath={`/players/${d.playerId}`}
          playerId={d.playerId}
          iconOnly
          variant="ghost"
          size="icon"
          label={`Share ${d.name} debut`}
          className="h-7 w-7"
          input={{
            kind: "debut",
            playerName: d.name,
            grade: d.grade,
            capNumber: d.capNumber,
            season: d.season != null ? String(d.season) : null,
            round: d.round ?? null,
          }}
        />
      </div>
    </div>
  );
};

const ApproachingCard = ({ entry: p }: { entry: ApproachingEntry }) => {
  return (
    <div className="group relative bg-background/60 border border-border rounded-md p-3 flex flex-col gap-2 hover:border-primary hover:bg-primary/5 transition-colors">
      <Link href={`/players/${p.playerId}`} className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <TierBadge tierIndex={p.tierIndex} className="h-5 w-5 text-primary shrink-0" />
          <span className="text-[11px] font-semibold uppercase tracking-wider text-primary truncate">
            {p.tierLabel}
          </span>
        </div>
        <div className="font-serif font-bold text-primary uppercase leading-tight group-hover:underline">
          {p.surname}
          <span className="font-sans font-normal text-foreground/80 normal-case"> {p.givenName}</span>
        </div>
        <div className="text-xs text-muted-foreground mt-auto">
          <span className="font-mono font-bold text-foreground">{p.currentValue.toLocaleString()}</span>{" "}
          {p.boardLabel.toLowerCase()} •{" "}
          <span className="font-bold text-primary whitespace-nowrap">{p.gap.toLocaleString()} to go</span>
        </div>
      </Link>
    </div>
  );
};

const SearchResultCard = ({ playerId }: { playerId: number }) => {
  const { data: player } = useGetPlayer(playerId, {
    query: { enabled: !!playerId, queryKey: getGetPlayerQueryKey(playerId) },
  });
  if (!player) return null;
  const agg = aggregateCareer(player.stats);
  const a = agg[0] ?? null;
  const grades = player.gradesPlayed || "—";
  return (
    <div className="bg-card border border-border rounded-md p-5 md:p-6 shadow-md">
      <Link href={`/players/${player.id}`} className="block group">
        <h3 className="font-serif text-xl font-bold text-primary group-hover:underline m-0 uppercase">
          {player.givenName} {player.surname}
        </h3>
      </Link>
      <div className="mt-1 mb-4">
        {player.gradesPlayed ? (
          <GradeBadgeListFromString gradesPlayed={player.gradesPlayed} size="sm" />
        ) : (
          <span className="text-xs text-muted-foreground italic">{grades}</span>
        )}
      </div>
      {a && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 text-sm">
          <Chip label="Games" value={a.games} />
          <Chip label="Runs" value={a.runs} />
          <Chip label="Wickets" value={a.wickets} />
          <Chip label="Bat Avg" value={a.innings - a.notOuts > 0 ? (a.runs / (a.innings - a.notOuts)).toFixed(2) : "-"} />
          <Chip label="High Score" value={a.highScoreDisplay} />
          <Chip label="Bowl Avg" value={a.wickets > 0 ? (a.runsConceded / a.wickets).toFixed(2) : "-"} />
          <Chip label="Best Bowling" value={a.bestBowling} />
          <Chip label="Catches" value={a.catches} />
        </div>
      )}
      {player.stats.length > 0 && (
        <div className="overflow-x-auto mt-4">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-black/25">
                <th className="text-left font-serif uppercase tracking-wider text-primary p-2">Grade</th>
                <th className="text-right font-serif uppercase tracking-wider text-primary p-2">Mat</th>
                <th className="text-right font-serif uppercase tracking-wider text-primary p-2">Runs</th>
                <th className="text-right font-serif uppercase tracking-wider text-primary p-2">HS</th>
                <th className="text-right font-serif uppercase tracking-wider text-primary p-2">Wkts</th>
                <th className="text-right font-serif uppercase tracking-wider text-primary p-2">BB</th>
              </tr>
            </thead>
            <tbody>
              {player.stats.filter((s) => s.grade !== "CLUB TOTAL").map((s) => (
                <tr key={s.id} className="border-t border-border/50">
                  <td className="p-2">
                    <div className="flex items-center gap-2">
                      <GradeBadge grade={s.grade} size="sm" />
                      <span className="font-semibold text-primary">{s.grade}</span>
                    </div>
                  </td>
                  <td className="p-2 text-right font-mono">{s.games ?? "-"}</td>
                  <td className="p-2 text-right font-mono">{s.runs ?? "-"}</td>
                  <td className="p-2 text-right font-mono">{s.highScore ?? "-"}</td>
                  <td className="p-2 text-right font-mono">{s.wickets ?? "-"}</td>
                  <td className="p-2 text-right font-mono">{s.bestBowling ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const Chip = ({ label, value }: { label: string; value: string | number }) => (
  <div className="bg-background/60 border border-border rounded px-3 py-2">
    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
    <div className="font-mono font-semibold text-primary">{value}</div>
  </div>
);

const MILESTONE_KIND_META: Record<
  MilestoneItem["kind"],
  { label: string; icon: typeof Award; cls: string }
> = {
  hatTrick: { label: "Hat-trick", icon: Flame, cls: "text-rose-600 dark:text-rose-300 bg-rose-500/10 border-rose-500/30" },
  century: { label: "Century", icon: Target, cls: "text-emerald-600 dark:text-emerald-300 bg-emerald-500/10 border-emerald-500/30" },
  fiveFor: { label: "Five-for", icon: Zap, cls: "text-sky-600 dark:text-sky-300 bg-sky-500/10 border-sky-500/30" },
  debut: { label: "Debut", icon: UserPlus, cls: "text-violet-600 dark:text-violet-300 bg-violet-500/10 border-violet-500/30" },
  career: { label: "Career", icon: Award, cls: "text-amber-600 dark:text-amber-300 bg-amber-500/10 border-amber-500/30" },
};

function formatMatchDate(d: string | null): string | null {
  if (!d) return null;
  const dt = new Date(`${d}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

const DatedMilestoneCard = ({ item }: { item: MilestoneItem }) => {
  const meta = MILESTONE_KIND_META[item.kind];
  const Icon = meta.icon;
  const date = formatMatchDate(item.matchDate ?? null);
  return (
    <Link
      href={`/players/${item.playerId}`}
      className="block bg-background/60 border border-border rounded-md p-4 hover:border-primary transition-colors no-underline"
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${meta.cls}`}
        >
          <Icon className="h-3 w-3" />
          {meta.label}
        </span>
        {item.recent && (
          <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Recent</span>
        )}
      </div>
      <div className="font-serif font-bold text-primary leading-tight">{item.playerName}</div>
      <div className="text-sm font-semibold text-foreground mt-0.5">{item.label}</div>
      {item.detail && <div className="text-xs text-muted-foreground mt-1">{item.detail}</div>}
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        {item.grade && <GradeBadge grade={item.grade} size="sm" />}
        {date && (
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{date}</span>
        )}
      </div>
    </Link>
  );
};

export default function HonourBoards() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("milestones");
  const [scope, setScope] = useState<Scope>("career");

  // The Milestones tab is career-only; force the scope so its career
  // aggregation (recent/approaching display mode) always has every grade.
  useEffect(() => {
    if (activeTab === "milestones" && scope !== "career") setScope("career");
  }, [activeTab, scope]);
  const [selectedGrade, setSelectedGrade] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");

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
  const { data: searchResults, isLoading: isSearchLoading } = useListPlayers(
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
        <img src={logoUrl} alt="HHCC" className="h-16 md:h-20 w-auto drop-shadow-lg" />
        <div>
          <h1 className="text-2xl md:text-4xl font-serif font-bold text-primary m-0 leading-tight">
            Halls Head Cricket Club — Honour Boards
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

      {/* Tabs */}
      {(() => {
        const activeBoard = BOARDS.find((b) => b.key === activeTab);
        const activeHonour = HONOURS_ITEMS.find((h) => h.tab === activeTab);
        return (
          <div className="bg-card border border-border rounded-md p-2 flex flex-wrap items-center gap-2 shadow-md">
            <button onClick={() => setActiveTab("milestones")} className={tabClass(activeTab === "milestones")}>
              Milestones
            </button>

            {/* Leaderboards — career/by-grade statistical boards */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className={tabClass(!!activeBoard)}>
                  {activeBoard ? `Leaderboards: ${activeBoard.label}` : "Leaderboards"}
                  <ChevronDown className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                {BOARDS.map((b) => (
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

            {/* Honours — caps, life members, awards, etc. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className={tabClass(!!activeHonour)}>
                  {activeHonour ? `Honours: ${activeHonour.label}` : "Honours"}
                  <ChevronDown className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                {HONOURS_ITEMS.map((h) => (
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

            <button onClick={() => setActiveTab("search")} className={tabClass(activeTab === "search")}>
              Search
            </button>
          </div>
        );
      })()}

      {/* Scope control — only shown for the Leaderboards (BOARDS) tabs; hidden for
          milestones, search, and every Honours tab (caps / life-members / awards /
          team-of-decade / committee / records). */}
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
            {!milestonesBoard || milestonesBoard.items.length === 0 ? (
              <div className="text-sm text-muted-foreground italic">
                No dated milestones yet — they appear as match scorecards are imported.
              </div>
            ) : (
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                {milestonesBoard.items.map((item) => (
                  <DatedMilestoneCard key={item.id} item={item} />
                ))}
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
          ) : isSearchLoading ? (
            <div className="bg-card border border-border rounded-md p-8 text-center text-muted-foreground">
              Searching…
            </div>
          ) : !searchResults?.players?.length ? (
            <div className="bg-card border border-border rounded-md p-8 text-center text-muted-foreground italic">
              No players matched "{searchTerm}".
            </div>
          ) : (
            <div className="grid gap-3">
              {searchResults.players.map((p) => (
                <SearchResultCard key={p.id} playerId={p.id} />
              ))}
            </div>
          )}
        </div>
      ) : isLoadingBoards ? (
        <div className="bg-card border border-border rounded-md p-12 text-center text-muted-foreground">
          Loading honour boards…
        </div>
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
        • Halls Head Cricket Club
      </div>
    </div>
  );
}
