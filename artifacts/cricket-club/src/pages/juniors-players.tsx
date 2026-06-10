import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  useListJuniorPlayers,
  useGetJuniorLeaderboards,
  useListJuniorLeaderboard,
  useGetJuniorsFilters,
  getListJuniorPlayersQueryKey,
  getGetJuniorLeaderboardsQueryKey,
  getListJuniorLeaderboardQueryKey,
  type JuniorLeaderboardRow,
} from "@workspace/api-client-react";
import { fmtJuniorDate, fmtNum } from "@/lib/juniors";
import { TableSkeleton, QueryError, EmptyState } from "@/components/data-states";

type Tab = "directory" | "leaderboard" | "runs" | "wickets" | "games" | "innings" | "bowling";

const TABS: { key: Tab; label: string }[] = [
  { key: "directory", label: "Players" },
  { key: "leaderboard", label: "Leaderboard" },
  { key: "runs", label: "Most Runs" },
  { key: "wickets", label: "Most Wickets" },
  { key: "games", label: "Most Games" },
  { key: "innings", label: "Highest Scores" },
  { key: "bowling", label: "Best Bowling" },
];

// Columns for the rich combined batting + bowling leaderboard. `num` selects the
// sortable numeric value; nulls sort last regardless of direction.
type LbCol = {
  key: string;
  label: string;
  title: string;
  group: "bat" | "bowl";
  num: (r: JuniorLeaderboardRow) => number | null;
  render: (r: JuniorLeaderboardRow) => React.ReactNode;
};

const LB_COLS: LbCol[] = [
  { key: "matches", label: "Games", title: "Games played (team appearances)", group: "bat", num: (r) => r.matches, render: (r) => r.matches },
  { key: "innings", label: "Inns", title: "Innings batted", group: "bat", num: (r) => r.innings, render: (r) => r.innings },
  { key: "notOuts", label: "NO", title: "Not outs", group: "bat", num: (r) => r.notOuts, render: (r) => r.notOuts },
  { key: "runs", label: "Runs", title: "Runs scored", group: "bat", num: (r) => r.runs, render: (r) => <span className="font-bold">{r.runs}</span> },
  { key: "highScore", label: "HS", title: "Highest score", group: "bat", num: (r) => r.highScore ?? null, render: (r) => r.highScore ?? "—" },
  { key: "battingAverage", label: "Avg", title: "Batting average", group: "bat", num: (r) => r.battingAverage ?? null, render: (r) => fmtNum(r.battingAverage, 2) },
  { key: "hundreds", label: "100s", title: "Hundreds", group: "bat", num: (r) => r.hundreds, render: (r) => r.hundreds },
  { key: "fifties", label: "50s", title: "Fifties", group: "bat", num: (r) => r.fifties, render: (r) => r.fifties },
  { key: "wickets", label: "Wkts", title: "Wickets", group: "bowl", num: (r) => r.wickets, render: (r) => <span className="font-bold">{r.wickets}</span> },
  { key: "runsConceded", label: "Runs", title: "Runs conceded", group: "bowl", num: (r) => r.runsConceded, render: (r) => r.runsConceded },
  { key: "bowlingAverage", label: "Avg", title: "Bowling average", group: "bowl", num: (r) => r.bowlingAverage ?? null, render: (r) => fmtNum(r.bowlingAverage, 2) },
  { key: "bestBowling", label: "BB", title: "Best bowling", group: "bowl", num: (r) => r.bestBowling ? parseInt(r.bestBowling.split("/")[0] ?? "0", 10) : null, render: (r) => r.bestBowling ?? "—" },
  { key: "fiveWickets", label: "5WI", title: "Five-wicket hauls", group: "bowl", num: (r) => r.fiveWickets, render: (r) => r.fiveWickets },
];

export default function JuniorsPlayers() {
  const [tab, setTab] = useState<Tab>("directory");
  const [search, setSearch] = useState("");
  const [season, setSeason] = useState("");
  const [ageGroup, setAgeGroup] = useState("");

  const { data: filters } = useGetJuniorsFilters();

  const searchArg = search.trim() || undefined;
  const seasonArg = season || undefined;
  const ageArg = ageGroup || undefined;

  // The directory tab is filterable; the "Most Games" board derives from the
  // same junior-only players list (the leaderboards endpoint has no games
  // ranking) sorted by appearances, so it always queries unfiltered.
  const inDirectory = tab === "directory";
  const inGames = tab === "games";
  const listSearch = inDirectory ? searchArg : undefined;
  const listSeason = inDirectory ? seasonArg : undefined;
  const listAge = inDirectory ? ageArg : undefined;

  const { data: players, isLoading: playersLoading, isError: playersError, refetch: refetchPlayers } = useListJuniorPlayers(
    { search: listSearch, season: listSeason, ageGroup: listAge },
    {
      query: {
        enabled: inDirectory || inGames,
        queryKey: getListJuniorPlayersQueryKey({ search: listSearch, season: listSeason, ageGroup: listAge }),
      },
    },
  );

  const gamesRanked = useMemo(
    () =>
      [...(players ?? [])]
        .sort((a, b) => (b.matches ?? 0) - (a.matches ?? 0))
        .slice(0, 50),
    [players],
  );

  const { data: leaderboards, isLoading: lbLoading, isError: lbError, refetch: refetchLb } = useGetJuniorLeaderboards({
    query: {
      enabled: tab !== "directory" && tab !== "games" && tab !== "leaderboard",
      queryKey: getGetJuniorLeaderboardsQueryKey(),
    },
  });

  // Rich combined leaderboard — server aggregates the filtered HH lines; sorting
  // and name search happen client-side over that result set.
  const inLeaderboard = tab === "leaderboard";
  const richParams = { season: seasonArg, ageGroup: ageArg };
  const { data: richRows, isLoading: richLoading, isError: richError, refetch: refetchRich } = useListJuniorLeaderboard(richParams, {
    query: { enabled: inLeaderboard, queryKey: getListJuniorLeaderboardQueryKey(richParams) },
  });

  const [sortKey, setSortKey] = useState<string>("runs");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sortedRich = useMemo(() => {
    const rows = [...(richRows ?? [])];
    if (searchArg) {
      const q = searchArg.toLowerCase();
      for (let i = rows.length - 1; i >= 0; i--) {
        if (!rows[i].displayName.toLowerCase().includes(q)) rows.splice(i, 1);
      }
    }
    const col = LB_COLS.find((c) => c.key === sortKey);
    rows.sort((a, b) => {
      const av = col ? col.num(a) : null;
      const bv = col ? col.num(b) : null;
      if (av == null && bv == null) return 0;
      if (av == null) return 1; // nulls always last
      if (bv == null) return -1;
      return sortDir === "desc" ? bv - av : av - bv;
    });
    return rows;
  }, [richRows, searchArg, sortKey, sortDir]);

  const toggleSort = (key: string) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-primary mb-2">
          Juniors
        </div>
        <h1 className="text-3xl font-serif font-bold text-primary">Junior Players & Leaders</h1>
        <p className="text-muted-foreground mt-1">Junior runs, wickets and games — names shown as recorded.</p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 font-serif text-sm uppercase tracking-wider border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? "text-primary border-primary"
                : "text-muted-foreground border-transparent hover:text-primary"
            }`}
            data-testid={`tab-${t.key}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "directory" ? (
        <>
          <div className="flex flex-wrap gap-3">
            <div className="flex flex-col gap-1 flex-1 min-w-[12rem]">
              <label className="text-xs font-bold uppercase tracking-widest text-primary">Search</label>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Player name"
                className="px-3 py-2 rounded border-2 border-primary bg-card text-foreground text-sm"
                data-testid="input-search"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold uppercase tracking-widest text-primary">Age Group</label>
              <select
                value={ageGroup}
                onChange={(e) => setAgeGroup(e.target.value)}
                className="px-3 py-2 rounded border-2 border-primary bg-card text-foreground text-sm font-medium min-w-[9rem]"
                data-testid="select-age-group"
              >
                <option value="">All age groups</option>
                {(filters?.ageGroups ?? []).map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold uppercase tracking-widest text-primary">Season</label>
              <select
                value={season}
                onChange={(e) => setSeason(e.target.value)}
                className="px-3 py-2 rounded border-2 border-primary bg-card text-foreground text-sm font-medium min-w-[8rem]"
                data-testid="select-season"
              >
                <option value="">All seasons</option>
                {(filters?.seasons ?? []).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          {playersError ? (
            <QueryError onRetry={() => refetchPlayers()} />
          ) : playersLoading ? (
            <TableSkeleton />
          ) : !players || players.length === 0 ? (
            <EmptyState title="No junior players found" message="No junior players match these filters." />
          ) : (
            <div className="overflow-x-auto bg-card border border-border rounded-md">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-2">Player</th>
                    <th className="px-3 py-2">Seasons</th>
                    <th className="px-3 py-2 text-right">Games</th>
                    <th className="px-3 py-2 text-right">Runs</th>
                    <th className="px-3 py-2 text-right">Wickets</th>
                  </tr>
                </thead>
                <tbody>
                  {players.map((p) => (
                    <tr key={p.participantId} className="border-b border-border/60 last:border-0 hover:bg-primary/5">
                      <td className="px-3 py-2">
                        <Link href={`/juniors/players/${p.participantId}`}>
                          <span className="font-medium text-primary hover:text-primary cursor-pointer">{p.displayName}</span>
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground text-xs">
                        {p.firstSeason && p.lastSeason && p.firstSeason !== p.lastSeason
                          ? `${p.firstSeason} – ${p.lastSeason}`
                          : p.firstSeason ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{p.matches ?? 0}</td>
                      <td className="px-3 py-2 text-right font-mono">{p.runs ?? 0}</td>
                      <td className="px-3 py-2 text-right font-mono">{p.wickets ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : tab === "leaderboard" ? (
        <>
          <div className="flex flex-wrap gap-3">
            <div className="flex flex-col gap-1 flex-1 min-w-[12rem]">
              <label className="text-xs font-bold uppercase tracking-widest text-[#bc8c6b]">Search</label>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Player name"
                className="px-3 py-2 rounded border-2 border-[#bc8c6b] bg-card text-foreground text-sm"
                data-testid="input-lb-search"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold uppercase tracking-widest text-[#bc8c6b]">Age Group</label>
              <select
                value={ageGroup}
                onChange={(e) => setAgeGroup(e.target.value)}
                className="px-3 py-2 rounded border-2 border-[#bc8c6b] bg-card text-foreground text-sm font-medium min-w-[9rem]"
                data-testid="select-lb-age-group"
              >
                <option value="">All age groups</option>
                {(filters?.ageGroups ?? []).map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold uppercase tracking-widest text-[#bc8c6b]">Season</label>
              <select
                value={season}
                onChange={(e) => setSeason(e.target.value)}
                className="px-3 py-2 rounded border-2 border-[#bc8c6b] bg-card text-foreground text-sm font-medium min-w-[8rem]"
                data-testid="select-lb-season"
              >
                <option value="">All seasons</option>
                {(filters?.seasons ?? []).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          {richError ? (
            <QueryError onRetry={() => refetchRich()} />
          ) : richLoading ? (
            <TableSkeleton />
          ) : sortedRich.length === 0 ? (
            <EmptyState title="No leaderboard data" message="No junior leaderboard data for this filter." />
          ) : (
            <div className="overflow-x-auto bg-card border border-border rounded-md">
              <table className="w-full text-sm whitespace-nowrap">
                <thead>
                  <tr className="text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-2 py-1 border-b border-border" />
                    <th className="px-2 py-1 border-b border-border" />
                    <th className="px-2 py-1 text-center border-b border-[#bc8c6b]/40 border-x border-x-border text-[#bc8c6b]" colSpan={LB_COLS.filter((c) => c.group === "bat").length}>
                      Batting
                    </th>
                    <th className="px-2 py-1 text-center border-b border-[#bc8c6b]/40 text-[#bc8c6b]" colSpan={LB_COLS.filter((c) => c.group === "bowl").length}>
                      Bowling
                    </th>
                  </tr>
                  <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-2 py-2 w-8 border-b border-border">#</th>
                    <th className="px-3 py-2 border-b border-border">Player</th>
                    {LB_COLS.map((c, i) => {
                      const firstBowl = c.group === "bowl" && LB_COLS[i - 1]?.group === "bat";
                      const active = sortKey === c.key;
                      return (
                        <th
                          key={c.key}
                          title={c.title}
                          onClick={() => toggleSort(c.key)}
                          className={`px-2 py-2 text-right cursor-pointer select-none border-b border-border hover:text-[#bc8c6b] ${
                            firstBowl ? "border-l border-l-border" : ""
                          } ${active ? "text-[#bc8c6b]" : ""}`}
                          data-testid={`sort-${c.key}`}
                        >
                          {c.label}
                          {active ? (sortDir === "desc" ? " ↓" : " ↑") : ""}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {sortedRich.map((r, i) => (
                    <tr key={r.participantId} className="border-b border-border/60 last:border-0 hover:bg-[#bc8c6b]/5">
                      <td className="px-2 py-2 text-muted-foreground font-mono">{i + 1}</td>
                      <td className="px-3 py-2">
                        <Link href={`/juniors/players/${r.participantId}`}>
                          <span className="font-medium text-primary hover:text-[#bc8c6b] cursor-pointer">{r.displayName}</span>
                        </Link>
                      </td>
                      {LB_COLS.map((c, ci) => {
                        const firstBowl = c.group === "bowl" && LB_COLS[ci - 1]?.group === "bat";
                        return (
                          <td
                            key={c.key}
                            className={`px-2 py-2 text-right font-mono ${firstBowl ? "border-l border-l-border" : ""} ${
                              sortKey === c.key ? "text-[#bc8c6b]" : ""
                            }`}
                          >
                            {c.render(r)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : tab === "games" ? (
        playersError ? (
          <QueryError onRetry={() => refetchPlayers()} />
        ) : playersLoading ? (
          <TableSkeleton />
        ) : gamesRanked.length === 0 ? (
          <EmptyState title="No leaderboard data" message="No junior games data is available yet." />
        ) : (
          <div className="overflow-x-auto bg-card border border-border rounded-md">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2 w-10">#</th>
                  <th className="px-3 py-2">Player</th>
                  <th className="px-3 py-2 text-right">Games</th>
                  <th className="px-3 py-2 text-right">Runs</th>
                  <th className="px-3 py-2 text-right">Wickets</th>
                </tr>
              </thead>
              <tbody>
                {gamesRanked.map((p, i) => (
                  <tr key={p.participantId} className="border-b border-border/60 last:border-0 hover:bg-primary/5">
                    <td className="px-3 py-2 text-muted-foreground font-mono">{i + 1}</td>
                    <td className="px-3 py-2">
                      <Link href={`/juniors/players/${p.participantId}`}>
                        <span className="font-medium text-primary hover:text-primary cursor-pointer">{p.displayName}</span>
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold">{p.matches ?? 0}</td>
                    <td className="px-3 py-2 text-right font-mono">{p.runs ?? 0}</td>
                    <td className="px-3 py-2 text-right font-mono">{p.wickets ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : lbError ? (
        <QueryError onRetry={() => refetchLb()} />
      ) : lbLoading ? (
        <TableSkeleton />
      ) : !leaderboards ? (
        <EmptyState title="No leaderboard data" message="No junior leaderboard data is available yet." />
      ) : (
        <div className="overflow-x-auto bg-card border border-border rounded-md">
          {tab === "runs" && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2 w-10">#</th>
                  <th className="px-3 py-2">Player</th>
                  <th className="px-3 py-2 text-right">Runs</th>
                  <th className="px-3 py-2 text-right">Inns</th>
                  <th className="px-3 py-2 text-right">HS</th>
                  <th className="px-3 py-2 text-right">Avg</th>
                </tr>
              </thead>
              <tbody>
                {leaderboards.mostRuns.map((p, i) => (
                  <tr key={p.participantId} className="border-b border-border/60 last:border-0 hover:bg-primary/5">
                    <td className="px-3 py-2 text-muted-foreground font-mono">{i + 1}</td>
                    <td className="px-3 py-2">
                      <Link href={`/juniors/players/${p.participantId}`}>
                        <span className="font-medium text-primary hover:text-primary cursor-pointer">{p.displayName}</span>
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold">{p.runs}</td>
                    <td className="px-3 py-2 text-right font-mono">{p.innings}</td>
                    <td className="px-3 py-2 text-right font-mono">{p.highScore ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtNum(p.average, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === "wickets" && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2 w-10">#</th>
                  <th className="px-3 py-2">Player</th>
                  <th className="px-3 py-2 text-right">Wickets</th>
                  <th className="px-3 py-2 text-right">Games</th>
                  <th className="px-3 py-2 text-right">Best</th>
                  <th className="px-3 py-2 text-right">Econ</th>
                </tr>
              </thead>
              <tbody>
                {leaderboards.mostWickets.map((p, i) => (
                  <tr key={p.participantId} className="border-b border-border/60 last:border-0 hover:bg-primary/5">
                    <td className="px-3 py-2 text-muted-foreground font-mono">{i + 1}</td>
                    <td className="px-3 py-2">
                      <Link href={`/juniors/players/${p.participantId}`}>
                        <span className="font-medium text-primary hover:text-primary cursor-pointer">{p.displayName}</span>
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold">{p.wickets}</td>
                    <td className="px-3 py-2 text-right font-mono">{p.matches}</td>
                    <td className="px-3 py-2 text-right font-mono">{p.bestWickets != null ? p.bestWickets : "—"}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtNum(p.economy, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === "innings" && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2 w-10">#</th>
                  <th className="px-3 py-2">Player</th>
                  <th className="px-3 py-2 text-right">Runs</th>
                  <th className="px-3 py-2">Vs</th>
                  <th className="px-3 py-2">Season</th>
                </tr>
              </thead>
              <tbody>
                {leaderboards.highestScores.map((p, i) => (
                  <tr key={`${p.participantId}-${p.matchId}-${i}`} className="border-b border-border/60 last:border-0 hover:bg-primary/5">
                    <td className="px-3 py-2 text-muted-foreground font-mono">{i + 1}</td>
                    <td className="px-3 py-2">
                      <Link href={`/juniors/players/${p.participantId}`}>
                        <span className="font-medium text-primary hover:text-primary cursor-pointer">{p.displayName}</span>
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold">
                      {p.runs}{p.balls != null ? <span className="text-xs text-muted-foreground"> ({p.balls})</span> : null}
                    </td>
                    <td className="px-3 py-2">
                      <Link href={`/juniors/matches/${p.matchId}`}>
                        <span className="hover:text-primary cursor-pointer">{p.opponentName ?? "—"}</span>
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground text-xs">
                      {p.season ?? fmtJuniorDate(p.matchDate) ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === "bowling" && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2 w-10">#</th>
                  <th className="px-3 py-2">Player</th>
                  <th className="px-3 py-2 text-right">Figures</th>
                  <th className="px-3 py-2">Vs</th>
                  <th className="px-3 py-2">Season</th>
                </tr>
              </thead>
              <tbody>
                {leaderboards.bestBowling.map((p, i) => (
                  <tr key={`${p.participantId}-${p.matchId}-${i}`} className="border-b border-border/60 last:border-0 hover:bg-primary/5">
                    <td className="px-3 py-2 text-muted-foreground font-mono">{i + 1}</td>
                    <td className="px-3 py-2">
                      <Link href={`/juniors/players/${p.participantId}`}>
                        <span className="font-medium text-primary hover:text-primary cursor-pointer">{p.displayName}</span>
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold">{p.wickets}/{p.runs}</td>
                    <td className="px-3 py-2">
                      <Link href={`/juniors/matches/${p.matchId}`}>
                        <span className="hover:text-primary cursor-pointer">{p.opponentName ?? "—"}</span>
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground text-xs">
                      {p.season ?? fmtJuniorDate(p.matchDate) ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
