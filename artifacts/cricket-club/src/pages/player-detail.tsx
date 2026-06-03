import { useParams, Link } from "wouter";
import { useMemo, useState, useEffect, useRef } from "react";
import { useGetPlayer, getGetPlayerQueryKey, useDeletePlayer, useUpdatePlayer, useListCaps, useGetPlayerMatches, getGetPlayerMatchesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useUpload } from "@workspace/object-storage-web";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TierBadge } from "@/components/tier-badge";
import { GradeBadge, GradeBadgeListFromString } from "@/components/grade-badge";
import { Share2, Trophy, Crown, Upload, Loader2, ImageOff } from "lucide-react";
import { useCurrentAdmin } from "@/lib/admin-auth";
import {
  aggregateCareer,
  getAvailableSeasons,
  getMilestoneStatus,
  getPlayerSeasonCrossings,
  MILESTONE_BOARDS,
  type MilestoneStatus,
} from "@/lib/honour-boards";
import { downloadMilestoneCard } from "@/lib/milestone-share";
import { ShareButton } from "@/components/share-card-modal";
import type { ShareCardInput } from "@/lib/share-card";

const fmtNum = (n: number) => n.toLocaleString();

const MilestoneCard = ({ status, playerName, photoUrl }: { status: MilestoneStatus; playerName: string; photoUrl?: string | null }) => {
  const hasNext = status.nextTierLabel !== null && status.gap !== null;
  const inAnyTier = status.currentTierIndex !== null;
  const [sharing, setSharing] = useState(false);
  const handleShare = async () => {
    if (sharing || !inAnyTier || !status.currentTierLabel) return;
    setSharing(true);
    try {
      await downloadMilestoneCard({
        playerName,
        tierLabel: status.currentTierLabel,
        tierIndex: status.currentTierIndex!,
        milestoneLabel: status.boardLabel,
        currentValue: status.currentValue,
        headline: "Honour Board Milestone",
        photoUrl,
      });
    } catch (err) {
      console.error("Failed to generate milestone card", err);
      alert("Could not generate the share image. Please try again.");
    } finally {
      setSharing(false);
    }
  };
  return (
    <div className="bg-card border border-border rounded-md p-4 shadow-sm flex flex-col gap-3 relative">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs uppercase tracking-widest text-muted-foreground font-serif">{status.boardLabel}</div>
        <div className="font-mono font-bold text-primary text-lg">{fmtNum(status.currentValue)}</div>
      </div>
      {inAnyTier && status.currentTierLabel && (
        <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded px-3 py-2">
          <TierBadge tierIndex={status.currentTierIndex!} className="h-4 w-4 text-primary shrink-0" />
          <span className="text-xs font-semibold uppercase tracking-wider text-primary truncate flex-1">
            {status.currentTierLabel}
          </span>
          <button
            type="button"
            onClick={handleShare}
            disabled={sharing}
            aria-label={`Share ${status.currentTierLabel} milestone`}
            title="Share milestone"
            className="p-1 -m-1 rounded text-primary/80 hover:text-primary hover:bg-primary/15 transition-colors disabled:opacity-50 shrink-0"
          >
            <Share2 className="h-3.5 w-3.5" />
          </button>
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
  const { data: caps } = useListCaps();
  const { data: matchLines } = useGetPlayerMatches(playerId, { query: { enabled: !!playerId, queryKey: getGetPlayerMatchesQueryKey(playerId) } });

  const queryClient = useQueryClient();
  const deletePlayer = useDeletePlayer();
  const updatePlayer = useUpdatePlayer();
  const adminQ = useCurrentAdmin();
  const isAdmin = !!adminQ.data;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const { uploadFile, isUploading } = useUpload({
    onError: (e) => setPhotoError(e.message),
  });

  const persistImageUrl = (imageUrl: string | null) => {
    updatePlayer.mutate(
      { id: playerId, data: { imageUrl } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetPlayerQueryKey(playerId) });
        },
        onError: (e) => setPhotoError((e as Error)?.message ?? "Could not save photo"),
      },
    );
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoError(null);
    const result = await uploadFile(file);
    if (result) persistImageUrl(`/api/storage${result.objectPath}`);
  };

  const playerStats = player?.stats ?? [];
  const hasAGradeStats = playerStats.some((s) => s.grade === "A Grade");
  const capEntry = useMemo(
    () => caps?.find((c) => c.playerId === playerId) ?? null,
    [caps, playerId],
  );
  const showCappedNoStats = !!capEntry && !hasAGradeStats;
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

  const [matchSeasonFilter, setMatchSeasonFilter] = useState<string>("all");
  const [matchGradeFilter, setMatchGradeFilter] = useState<string>("all");
  const matchSeasonOptions = useMemo(() => {
    const set = new Set<number>();
    (matchLines ?? []).forEach((m) => {
      if (m.season != null) set.add(m.season);
    });
    return Array.from(set).sort((a, b) => b - a);
  }, [matchLines]);
  const matchGradeOptions = useMemo(() => {
    const set = new Set<string>();
    (matchLines ?? []).forEach((m) => {
      if (m.grade) set.add(m.grade);
    });
    return Array.from(set).sort();
  }, [matchLines]);
  const filteredMatchLines = useMemo(() => {
    return (matchLines ?? []).filter((m) => {
      if (matchSeasonFilter !== "all" && String(m.season) !== matchSeasonFilter) return false;
      if (matchGradeFilter !== "all" && m.grade !== matchGradeFilter) return false;
      return true;
    });
  }, [matchLines, matchSeasonFilter, matchGradeFilter]);
  const fmtSeason = (s: number) => `${s}/${String((s + 1) % 100).padStart(2, "0")}`;

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
  const premierships = player.premierships ?? [];
  const premsWon = player.premiershipsWon ?? premierships.length;
  const premsCaptained = player.premiershipsCaptained ?? premierships.filter((p) => p.isCaptain).length;
  const formatPremDate = (d: string | null | undefined) => {
    if (!d) return "";
    const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return d;
    return `${m[3]}/${m[2]}/${m[1]}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {(player.imageUrl || isAdmin) && (
            <div className="relative shrink-0">
              <div className="h-20 w-20 rounded-full overflow-hidden border-2 border-primary/40 bg-muted flex items-center justify-center">
                {player.imageUrl ? (
                  <img src={player.imageUrl} alt={`${player.givenName} ${player.surname}`} className="h-full w-full object-cover" />
                ) : (
                  <ImageOff className="h-7 w-7 text-muted-foreground" />
                )}
              </div>
              {isAdmin && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handlePhotoChange}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading || updatePlayer.isPending}
                    aria-label="Upload player photo"
                    title="Upload player photo"
                    className="absolute -bottom-1 -right-1 rounded-full bg-primary text-primary-foreground p-1.5 shadow hover:bg-primary/90 disabled:opacity-50"
                  >
                    {isUploading || updatePlayer.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Upload className="h-3.5 w-3.5" />
                    )}
                  </button>
                </>
              )}
            </div>
          )}
          <div>
            <h1 className="text-3xl font-serif font-bold text-primary">{player.givenName} {player.surname}</h1>
            <div className="mt-2">
              <GradeBadgeListFromString gradesPlayed={player.gradesPlayed} size="md" />
            </div>
            {isAdmin && player.imageUrl && (
              <button
                type="button"
                onClick={() => persistImageUrl(null)}
                disabled={updatePlayer.isPending}
                className="mt-2 text-xs text-muted-foreground hover:text-destructive underline disabled:opacity-50"
              >
                Remove photo
              </button>
            )}
            {photoError && <p className="mt-1 text-xs text-destructive">{photoError}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(() => {
            const fullName = `${player.givenName} ${player.surname}`.trim();
            const career = aggregateCareer(player.stats)[0];
            const stats: { label: string; value: number | string }[] = career
              ? [
                  { label: "Games", value: career.games ?? 0 },
                  { label: "Runs", value: career.runs ?? 0 },
                  { label: "Wickets", value: career.wickets ?? 0 },
                ]
              : [];
            if ((player.premiershipsWon ?? 0) > 0) {
              stats.push({ label: "Premierships", value: player.premiershipsWon ?? 0 });
            }
            const input: ShareCardInput = {
              kind: "player",
              playerName: fullName,
              gradesPlayed: player.gradesPlayed,
              stats,
              photoUrl: player.imageUrl,
            };
            return <ShareButton input={input} appPath={`/players/${player.id}`} playerId={player.id} label="Share profile" />;
          })()}
          <Button variant="destructive" onClick={handleDelete} disabled={deletePlayer.isPending}>Delete Player</Button>
        </div>
      </div>

      {premsWon > 0 && (
        <div className="bg-card border border-border rounded-md p-5 shadow-sm">
          <div className="flex items-baseline justify-between gap-3 mb-1">
            <h2 className="text-lg font-serif font-bold text-primary m-0 flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-600" />
              Premierships won
            </h2>
            <Link href="/premierships" className="text-xs uppercase tracking-widest text-primary hover:underline">View board →</Link>
          </div>
          <div className="w-12 h-[2px] bg-primary mb-4" />
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-amber-500/15 border border-amber-600/40 text-amber-700 dark:text-amber-300 font-bold">
              <Trophy className="h-4 w-4" />
              <span className="font-mono text-lg">{premsWon}</span>
              <span className="text-xs uppercase tracking-wider">won</span>
            </div>
            {premsCaptained > 0 && (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-amber-600 text-white font-bold">
                <Crown className="h-4 w-4" />
                <span className="font-mono text-lg">{premsCaptained}</span>
                <span className="text-xs uppercase tracking-wider">captained</span>
              </div>
            )}
          </div>
          <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {premierships.map((p) => (
              <div key={p.id} className="bg-background/60 border border-border rounded-md p-3 flex items-start gap-3">
                <div className="text-center shrink-0">
                  <div className="font-mono font-bold text-primary text-lg leading-none">{p.year}</div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{p.grade}</div>
                </div>
                <div className="min-w-0 text-xs">
                  {p.competition && p.competition !== p.grade.toUpperCase() && (
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">{p.competition}</div>
                  )}
                  {p.result && <div className="font-semibold text-foreground/90 leading-snug">{p.result}</div>}
                  <div className="text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                    {p.venue && <span>{p.venue}</span>}
                    {p.matchDate && <span>· {formatPremDate(p.matchDate)}</span>}
                    {p.isCaptain && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-600 text-white font-bold text-[10px] uppercase">
                        <Crown className="h-3 w-3" /> Captain
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {milestones.length > 0 && (
        <div className="bg-card border border-border rounded-md p-5 shadow-sm">
          <div className="flex items-baseline justify-between gap-3 mb-1">
            <h2 className="text-lg font-serif font-bold text-primary m-0">Milestone tracker</h2>
            <span className="text-xs uppercase tracking-widest text-muted-foreground">Next honour board target</span>
          </div>
          <div className="w-12 h-[2px] bg-primary mb-4" />
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {milestones.map((m) => (
              <MilestoneCard key={m.key} status={m} playerName={`${player.givenName} ${player.surname}`.trim()} photoUrl={player.imageUrl} />
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

      {showCappedNoStats && capEntry && (
        <div className="bg-muted/40 border-l-4 border-primary/60 rounded-md p-4 text-sm leading-snug">
          <p className="text-foreground/90">
            <span className="font-semibold">A Grade Cap #{capEntry.capNumber}.</span>{" "}
            Played between 1 and 9 A Grade games for the club. Individual stats were not recorded
            prior to MyCricket and PlayHQ for players with fewer than 10 games.
          </p>
        </div>
      )}

      {matchLines && matchLines.length > 0 && (
        <div className="bg-card border border-border rounded-md p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2 mb-1">
            <h2 className="text-lg font-serif font-bold text-primary m-0">Match by match</h2>
            <span className="text-xs uppercase tracking-widest text-muted-foreground">
              {filteredMatchLines.length === matchLines.length
                ? `${matchLines.length} game${matchLines.length === 1 ? "" : "s"} recorded`
                : `${filteredMatchLines.length} of ${matchLines.length} games`}
            </span>
          </div>
          <div className="w-12 h-[2px] bg-primary mb-4" />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4">
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold uppercase tracking-widest text-primary">Season</label>
              <select
                value={matchSeasonFilter}
                onChange={(e) => setMatchSeasonFilter(e.target.value)}
                className="px-3 py-1.5 rounded border-2 border-primary bg-card text-foreground text-sm font-medium"
              >
                <option value="all">All seasons</option>
                {matchSeasonOptions.map((s) => (
                  <option key={s} value={String(s)}>{fmtSeason(s)}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold uppercase tracking-widest text-primary">Grade</label>
              <select
                value={matchGradeFilter}
                onChange={(e) => setMatchGradeFilter(e.target.value)}
                className="px-3 py-1.5 rounded border-2 border-primary bg-card text-foreground text-sm font-medium"
              >
                <option value="all">All grades</option>
                {matchGradeOptions.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
          </div>
          {filteredMatchLines.length === 0 ? (
            <div className="text-sm text-muted-foreground italic">No matches for the selected filters.</div>
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left font-medium p-3">Season</th>
                  <th className="text-left font-medium p-3">Rnd</th>
                  <th className="text-left font-medium p-3">Grade</th>
                  <th className="text-left font-medium p-3">Opponent</th>
                  <th className="text-left font-medium p-3">Batting</th>
                  <th className="text-left font-medium p-3">Bowling</th>
                  <th className="text-left font-medium p-3">Field</th>
                </tr>
              </thead>
              <tbody>
                {filteredMatchLines.map((m) => {
                  const fieldParts = [
                    m.catches ? `${m.catches}c` : "",
                    m.stumpings ? `${m.stumpings}st` : "",
                    m.runOuts ? `${m.runOuts}ro` : "",
                  ].filter(Boolean);
                  return (
                    <tr key={m.matchId} className="border-b last:border-0 hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => { window.location.href = `/matches/${m.matchId}`; }}>
                      <td className="p-3 font-mono">
                        {m.season != null
                          ? `${m.season}/${String((m.season + 1) % 100).padStart(2, "0")}`
                          : "—"}
                      </td>
                      <td className="p-3 font-mono">{m.round ?? "—"}</td>
                      <td className="p-3">
                        <GradeBadge grade={m.grade} size="sm" />
                      </td>
                      <td className="p-3">
                        <Link href={`/matches/${m.matchId}`} onClick={(e) => e.stopPropagation()} className="text-primary hover:underline">
                          {m.opponent ?? "—"}
                        </Link>
                      </td>
                      <td className="p-3 font-mono">
                        {m.batted
                          ? `${m.runs ?? 0}${m.notOut ? "*" : ""}${m.balls != null ? ` (${m.balls})` : ""}`
                          : "—"}
                      </td>
                      <td className="p-3 font-mono">
                        {m.bowled
                          ? `${m.wickets ?? 0}/${m.runsConceded ?? 0}${m.overs ? ` (${m.overs})` : ""}`
                          : "—"}
                      </td>
                      <td className="p-3 font-mono">{fieldParts.length ? fieldParts.join(" ") : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
            {player.stats.filter(s => s.grade !== "CLUB TOTAL").map(stat => (
              <tr key={stat.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                <td className="p-4">
                  <div className="flex items-center gap-2">
                    <GradeBadge grade={stat.grade} size="sm" />
                    <span className="font-semibold text-primary">{stat.grade}</span>
                  </div>
                </td>
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
