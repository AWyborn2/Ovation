import { useParams, Link } from "wouter";
import { useGetPlayer, getGetPlayerQueryKey, useDeletePlayer } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TierBadge } from "@/components/tier-badge";
import { useMemo, useState, useEffect } from "react";
import {
  aggregateCareer,
  getAvailableSeasons,
  getMilestoneStatus,
  getPlayerSeasonCrossings,
  MILESTONE_BOARDS,
  type MilestoneStatus,
} from "@/lib/honour-boards";

const fmtNum = (n: number) => n.toLocaleString();

const MilestoneCard = ({ status }: { status: MilestoneStatus }) => {
  const hasNext = status.nextTierLabel !== null && status.gap !== null;
  const inAnyTier = status.currentTierIndex !== null;
  return (
    <div className="bg-card border border-border rounded-md p-4 shadow-sm flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs uppercase tracking-widest text-muted-foreground font-serif">{status.boardLabel}</div>
        <div className="font-mono font-bold text-primary text-lg">{fmtNum(status.currentValue)}</div>
      </div>
      {inAnyTier && status.currentTierLabel && (
        <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded px-3 py-2">
          <TierBadge tierIndex={status.currentTierIndex!} className="h-4 w-4 text-primary shrink-0" />
          <span className="text-xs font-semibold uppercase tracking-wider text-primary truncate">
            {status.currentTierLabel}
          </span>
        </div>
      )}
      {hasNext ? (
        <div className="flex items-start gap-2 mt-auto">
          <TierBadge tierIndex={status.nextTierIndex!} className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
          <div className="text-xs leading-snug">
            <span className="font-mono font-bold text-primary">{fmtNum(status.gap!)}</span>{" "}
            <span className="text-muted-foreground">
              {status.boardLabel.toLowerCase()} away from the{" "}
            </span>
            <span className="font-semibold text-foreground">{status.nextTierLabel}</span>
          </div>
        </div>
      ) : (
        <div className="text-xs italic text-muted-foreground mt-auto">Top of the honour board — every milestone unlocked.</div>
      )}
    </div>
  );
};

export default function PlayerDetail() {
  const { id } = useParams<{ id: string }>();
  const playerId = parseInt(id, 10);
  const { data: player, isLoading } = useGetPlayer(playerId, { query: { enabled: !!playerId, queryKey: getGetPlayerQueryKey(playerId) } });
  
  const queryClient = useQueryClient();
  const deletePlayer = useDeletePlayer();

  const playerStats = player?.stats ?? [];
  const seasons = useMemo(() => getAvailableSeasons(playerStats), [playerStats]);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  useEffect(() => {
    if (selectedSeason !== null && !seasons.includes(selectedSeason)) {
      setSelectedSeason(seasons[0] ?? null);
    } else if (selectedSeason === null && seasons.length > 0) {
      setSelectedSeason(seasons[0]);
    }
  }, [seasons, selectedSeason]);
  const seasonCrossings = useMemo(
    () => (selectedSeason !== null ? getPlayerSeasonCrossings(playerStats, selectedSeason) : []),
    [playerStats, selectedSeason],
  );

  const handleDelete = () => {
    if (confirm("Are you sure you want to delete this player?")) {
      deletePlayer.mutate({ id: playerId }, {
        onSuccess: () => {
          window.location.href = "/players";
        }
      });
    }
  };

  if (isLoading) return <div className="p-8 text-center">Loading...</div>;
  if (!player) return <div className="p-8 text-center text-muted-foreground">Player not found.</div>;

  const aggregated = aggregateCareer(player.stats)[0];
  const milestones = aggregated ? MILESTONE_BOARDS.map((k) => getMilestoneStatus(aggregated, k)) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-serif font-bold text-primary">{player.givenName} {player.surname}</h1>
          <p className="text-muted-foreground mt-1">Grades: {player.gradesPlayed || "None"}</p>
        </div>
        <Button variant="destructive" onClick={handleDelete} disabled={deletePlayer.isPending}>Delete Player</Button>
      </div>

      {milestones.length > 0 && (
        <div className="bg-card border border-border rounded-md p-5 shadow-sm">
          <div className="flex items-baseline justify-between gap-3 mb-1">
            <h2 className="text-lg font-serif font-bold text-primary m-0">Milestone tracker</h2>
            <span className="text-xs uppercase tracking-widest text-muted-foreground">Next honour board target</span>
          </div>
          <div className="w-12 h-[2px] bg-primary mb-4" />
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {milestones.map((m) => (
              <MilestoneCard key={m.key} status={m} />
            ))}
          </div>
        </div>
      )}

      {seasons.length > 0 && selectedSeason !== null && (
        <div className="bg-card border border-border rounded-md p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2 mb-1">
            <h2 className="text-lg font-serif font-bold text-primary m-0">Milestones hit this season</h2>
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold uppercase tracking-widest text-primary">Season</label>
              <select
                value={String(selectedSeason)}
                onChange={(e) => setSelectedSeason(parseInt(e.target.value, 10))}
                className="px-3 py-1.5 rounded border-2 border-primary bg-card text-foreground text-sm font-medium"
              >
                {seasons.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="w-12 h-[2px] bg-primary mb-4" />
          {seasonCrossings.length === 0 ? (
            <div className="text-sm text-muted-foreground italic">No honour board crossed in {selectedSeason}.</div>
          ) : (
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {seasonCrossings.map((c) => (
                <div key={`${c.key}-${c.threshold}`} className="bg-background/60 border border-border rounded-md p-3 flex items-start gap-3">
                  <TierBadge tierIndex={c.tierIndex} className="h-6 w-6 text-primary shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-primary truncate">{c.tierLabel}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      <span className="font-mono font-bold text-foreground">{fmtNum(c.beforeValue)}</span>
                      <span> → </span>
                      <span className="font-mono font-bold text-foreground">{fmtNum(c.afterValue)}</span>{" "}
                      {c.boardLabel.toLowerCase()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="bg-card border rounded-lg overflow-x-auto shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left font-medium p-4">Grade</th>
              <th className="text-right font-medium p-4">Mat</th>
              <th className="text-right font-medium p-4">Inn</th>
              <th className="text-right font-medium p-4">NO</th>
              <th className="text-right font-medium p-4">Runs</th>
              <th className="text-right font-medium p-4">HS</th>
              <th className="text-right font-medium p-4">Avg</th>
              <th className="text-right font-medium p-4">100s</th>
              <th className="text-right font-medium p-4">50s</th>
              <th className="text-right font-medium p-4">Wkts</th>
              <th className="text-right font-medium p-4">Runs</th>
              <th className="text-right font-medium p-4">Avg</th>
              <th className="text-right font-medium p-4">BB</th>
              <th className="text-right font-medium p-4">5WI</th>
              <th className="text-right font-medium p-4">Ct</th>
              <th className="text-right font-medium p-4">St</th>
              <th className="text-right font-medium p-4">RO</th>
              <th className="text-right font-medium p-4">Edit</th>
            </tr>
          </thead>
          <tbody>
            {player.stats.map(stat => (
              <tr key={stat.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                <td className="p-4 font-semibold text-primary">{stat.grade}</td>
                <td className="p-4 text-right font-mono">{stat.games || "-"}</td>
                <td className="p-4 text-right font-mono">{stat.innings || "-"}</td>
                <td className="p-4 text-right font-mono">{stat.notOuts || "-"}</td>
                <td className="p-4 text-right font-mono font-bold">{stat.runs || "-"}</td>
                <td className="p-4 text-right font-mono">{stat.highScore || "-"}</td>
                <td className="p-4 text-right font-mono">{stat.batAvg?.toFixed(2) || "-"}</td>
                <td className="p-4 text-right font-mono">{stat.hundreds || "-"}</td>
                <td className="p-4 text-right font-mono">{stat.fifties || "-"}</td>
                <td className="p-4 text-right font-mono font-bold">{stat.wickets || "-"}</td>
                <td className="p-4 text-right font-mono">{stat.runsConceded || "-"}</td>
                <td className="p-4 text-right font-mono">{stat.bowlAvg?.toFixed(2) || "-"}</td>
                <td className="p-4 text-right font-mono">{stat.bestBowling || "-"}</td>
                <td className="p-4 text-right font-mono">{stat.fiveWickets || "-"}</td>
                <td className="p-4 text-right font-mono">{stat.catches || "-"}</td>
                <td className="p-4 text-right font-mono">{stat.stumpings || "-"}</td>
                <td className="p-4 text-right font-mono">{stat.runOuts || "-"}</td>
                <td className="p-4 text-right">
                  <Link href={`/stats/${stat.id}`} className="text-sm text-blue-600 hover:underline">Edit</Link>
                </td>
              </tr>
            ))}
            {player.stats.length === 0 && (
              <tr>
                <td colSpan={18} className="p-8 text-center text-muted-foreground">No stats recorded yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
