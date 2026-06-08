import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  useListJuniorPlayers,
  useGetJuniorLeaderboards,
  useGetJuniorsFilters,
  getListJuniorPlayersQueryKey,
  getGetJuniorLeaderboardsQueryKey,
} from "@workspace/api-client-react";
import { fmtJuniorDate, fmtNum } from "@/lib/juniors";

type Tab = "directory" | "runs" | "wickets" | "games" | "innings" | "bowling";

const TABS: { key: Tab; label: string }[] = [
  { key: "directory", label: "Players" },
  { key: "runs", label: "Most Runs" },
  { key: "wickets", label: "Most Wickets" },
  { key: "games", label: "Most Games" },
  { key: "innings", label: "Highest Scores" },
  { key: "bowling", label: "Best Bowling" },
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

  const { data: players, isLoading: playersLoading } = useListJuniorPlayers(
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

  const { data: leaderboards, isLoading: lbLoading } = useGetJuniorLeaderboards({
    query: { enabled: tab !== "directory" && tab !== "games", queryKey: getGetJuniorLeaderboardsQueryKey() },
  });

  return (
    <div className="space-y-6">
      <div>
        <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#bc8c6b] mb-2">
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
                ? "text-[#bc8c6b] border-[#bc8c6b]"
                : "text-muted-foreground border-transparent hover:text-[#bc8c6b]"
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
              <label className="text-xs font-bold uppercase tracking-widest text-[#bc8c6b]">Search</label>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Player name"
                className="px-3 py-2 rounded border-2 border-[#bc8c6b] bg-card text-foreground text-sm"
                data-testid="input-search"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold uppercase tracking-widest text-[#bc8c6b]">Age Group</label>
              <select
                value={ageGroup}
                onChange={(e) => setAgeGroup(e.target.value)}
                className="px-3 py-2 rounded border-2 border-[#bc8c6b] bg-card text-foreground text-sm font-medium min-w-[9rem]"
                data-testid="select-age-group"
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
                data-testid="select-season"
              >
                <option value="">All seasons</option>
                {(filters?.seasons ?? []).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          {playersLoading ? (
            <div className="p-8 text-center">Loading...</div>
          ) : !players || players.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No junior players found.</div>
          ) : (
            <div className="overflow-x-auto bg-card border border-border rounded-md">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-2">Player</th>
                    <th className="px-3 py-2">Seasons</th>
                    <th className="px-3 py-2 text-right">Matches</th>
                    <th className="px-3 py-2 text-right">Runs</th>
                    <th className="px-3 py-2 text-right">Wickets</th>
                  </tr>
                </thead>
                <tbody>
                  {players.map((p) => (
                    <tr key={p.participantId} className="border-b border-border/60 last:border-0 hover:bg-[#bc8c6b]/5">
                      <td className="px-3 py-2">
                        <Link href={`/juniors/players/${p.participantId}`}>
                          <span className="font-medium text-primary hover:text-[#bc8c6b] cursor-pointer">{p.displayName}</span>
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
      ) : tab === "games" ? (
        playersLoading ? (
          <div className="p-8 text-center">Loading...</div>
        ) : gamesRanked.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">No leaderboard data available.</div>
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
                  <tr key={p.participantId} className="border-b border-border/60 last:border-0 hover:bg-[#bc8c6b]/5">
                    <td className="px-3 py-2 text-muted-foreground font-mono">{i + 1}</td>
                    <td className="px-3 py-2">
                      <Link href={`/juniors/players/${p.participantId}`}>
                        <span className="font-medium text-primary hover:text-[#bc8c6b] cursor-pointer">{p.displayName}</span>
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
      ) : lbLoading ? (
        <div className="p-8 text-center">Loading...</div>
      ) : !leaderboards ? (
        <div className="p-8 text-center text-muted-foreground">No leaderboard data available.</div>
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
                  <tr key={p.participantId} className="border-b border-border/60 last:border-0 hover:bg-[#bc8c6b]/5">
                    <td className="px-3 py-2 text-muted-foreground font-mono">{i + 1}</td>
                    <td className="px-3 py-2">
                      <Link href={`/juniors/players/${p.participantId}`}>
                        <span className="font-medium text-primary hover:text-[#bc8c6b] cursor-pointer">{p.displayName}</span>
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
                  <th className="px-3 py-2 text-right">Matches</th>
                  <th className="px-3 py-2 text-right">Best</th>
                  <th className="px-3 py-2 text-right">Econ</th>
                </tr>
              </thead>
              <tbody>
                {leaderboards.mostWickets.map((p, i) => (
                  <tr key={p.participantId} className="border-b border-border/60 last:border-0 hover:bg-[#bc8c6b]/5">
                    <td className="px-3 py-2 text-muted-foreground font-mono">{i + 1}</td>
                    <td className="px-3 py-2">
                      <Link href={`/juniors/players/${p.participantId}`}>
                        <span className="font-medium text-primary hover:text-[#bc8c6b] cursor-pointer">{p.displayName}</span>
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
                  <tr key={`${p.participantId}-${p.matchId}-${i}`} className="border-b border-border/60 last:border-0 hover:bg-[#bc8c6b]/5">
                    <td className="px-3 py-2 text-muted-foreground font-mono">{i + 1}</td>
                    <td className="px-3 py-2">
                      <Link href={`/juniors/players/${p.participantId}`}>
                        <span className="font-medium text-primary hover:text-[#bc8c6b] cursor-pointer">{p.displayName}</span>
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold">
                      {p.runs}{p.balls != null ? <span className="text-xs text-muted-foreground"> ({p.balls})</span> : null}
                    </td>
                    <td className="px-3 py-2">
                      <Link href={`/juniors/matches/${p.matchId}`}>
                        <span className="hover:text-[#bc8c6b] cursor-pointer">{p.opponentName ?? "—"}</span>
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
                  <tr key={`${p.participantId}-${p.matchId}-${i}`} className="border-b border-border/60 last:border-0 hover:bg-[#bc8c6b]/5">
                    <td className="px-3 py-2 text-muted-foreground font-mono">{i + 1}</td>
                    <td className="px-3 py-2">
                      <Link href={`/juniors/players/${p.participantId}`}>
                        <span className="font-medium text-primary hover:text-[#bc8c6b] cursor-pointer">{p.displayName}</span>
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold">{p.wickets}/{p.runs}</td>
                    <td className="px-3 py-2">
                      <Link href={`/juniors/matches/${p.matchId}`}>
                        <span className="hover:text-[#bc8c6b] cursor-pointer">{p.opponentName ?? "—"}</span>
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
