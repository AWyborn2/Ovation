import { useParams, Link } from "wouter";
import { useMemo, useState, useEffect, useRef } from "react";
import {
  useGetPlayer,
  getGetPlayerQueryKey,
  useDeletePlayer,
  useUpdatePlayer,
  useListCaps,
  useGetPlayerMatches,
  getGetPlayerMatchesQueryKey,
  useGetPlayerSeasons,
  getGetPlayerSeasonsQueryKey,
  useListJuniorPlayersBySenior,
  getListJuniorPlayersBySeniorQueryKey,
  useGetJuniorPlayer,
  getGetJuniorPlayerQueryKey,
} from "@workspace/api-client-react";
import type { PlayerSeasonStat } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useUpload } from "@workspace/object-storage-web";
import { Button } from "@/components/ui/button";
import { TierBadge } from "@/components/tier-badge";
import { GradeBadge, sortGradesBySeniority } from "@/components/grade-badge";
import { gradeCode } from "@/lib/grade-code";
import {
  AttrChip,
  Container,
  Eyebrow,
  GlassPill,
  PageStack,
  StatStrip,
  Timeline,
  initialsOf,
} from "@/components/broadcast";
import { Share2, Trophy, Crown, Upload, Loader2 } from "lucide-react";
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
import { useBrand } from "@/lib/brand-context";
import { ShareButton } from "@/components/share-button";
import type { ShareCardInput } from "@/lib/share-card";
import { TradingCardModal } from "@/components/trading-card";
import { IdCard } from "lucide-react";
import { LoadingState, QueryError } from "@/components/data-states";
import { useConfirm } from "@/components/confirm-dialog";

const fmtNum = (n: number) => n.toLocaleString();

const MilestoneCard = ({
  status,
  playerName,
  photoUrl,
}: {
  status: MilestoneStatus;
  playerName: string;
  photoUrl?: string | null;
}) => {
  const hasNext = status.nextTierLabel !== null && status.gap !== null;
  const inAnyTier = status.currentTierIndex !== null;
  const [sharing, setSharing] = useState(false);
  const brand = useBrand();
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
        brand,
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
        <div className="text-xs uppercase tracking-widest text-muted-foreground font-serif">
          {status.boardLabel}
        </div>
        <div className="tabular-nums font-bold text-primary-text text-lg">
          {fmtNum(status.currentValue)}
        </div>
      </div>
      {inAnyTier && status.currentTierLabel && (
        <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded px-3 py-2">
          <TierBadge
            tierIndex={status.currentTierIndex!}
            className="h-4 w-4 text-primary-text shrink-0"
          />
          <span className="text-xs font-semibold uppercase tracking-wider text-primary-text truncate flex-1">
            {status.currentTierLabel}
          </span>
          <button
            type="button"
            onClick={handleShare}
            disabled={sharing}
            aria-label={`Share ${status.currentTierLabel} milestone`}
            title="Share milestone"
            className="p-1 -m-1 rounded text-primary-text/80 hover:text-primary-text hover:bg-primary/15 transition-colors disabled:opacity-50 shrink-0"
          >
            <Share2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {hasNext ? (
        <div className="flex items-start gap-2 mt-auto">
          <TierBadge
            tierIndex={status.nextTierIndex!}
            className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5"
          />
          <div className="text-xs leading-snug">
            <span className="tabular-nums font-bold text-primary-text">{fmtNum(status.gap!)}</span>{" "}
            <span className="text-muted-foreground">
              {status.boardLabel.toLowerCase()} away from the{" "}
            </span>
            <span className="font-semibold text-foreground">{status.nextTierLabel}</span>
          </div>
        </div>
      ) : (
        <div className="text-xs italic text-muted-foreground mt-auto">
          Top of the honour board — every milestone unlocked.
        </div>
      )}
    </div>
  );
};

export default function PlayerDetail() {
  const { id } = useParams<{ id: string }>();
  const playerId = parseInt(id, 10);
  const {
    data: player,
    isLoading,
    isError,
    refetch,
  } = useGetPlayer(playerId, {
    query: { enabled: !!playerId, queryKey: getGetPlayerQueryKey(playerId) },
  });
  const { data: caps } = useListCaps();
  const { data: matchLines } = useGetPlayerMatches(playerId, {
    query: { enabled: !!playerId, queryKey: getGetPlayerMatchesQueryKey(playerId) },
  });
  const { data: seasonStats } = useGetPlayerSeasons(playerId, {
    query: { enabled: !!playerId, queryKey: getGetPlayerSeasonsQueryKey(playerId) },
  });

  const queryClient = useQueryClient();
  const deletePlayer = useDeletePlayer();
  const updatePlayer = useUpdatePlayer();
  const adminQ = useCurrentAdmin();
  const isAdmin = !!adminQ.data;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [cardOpen, setCardOpen] = useState(false);
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

  // Group the season-level rows by grade for the "By season" breakdown. Rows
  // arrive sorted grade-asc, season-asc (baseline season=null first). The
  // per-grade totals row is summed from the season rows, so it matches the
  // existing per-grade aggregate table below.
  const seasonsByGrade = useMemo(() => {
    const rows = seasonStats ?? [];
    const map = new Map<string, PlayerSeasonStat[]>();
    for (const r of rows) {
      if (r.grade === "CLUB TOTAL") continue;
      const list = map.get(r.grade) ?? [];
      list.push(r);
      map.set(r.grade, list);
    }
    const sumKeys = [
      "games",
      "innings",
      "notOuts",
      "runs",
      "fifties",
      "hundreds",
      "wickets",
      "runsConceded",
      "fiveWickets",
      "catches",
      "stumpings",
      "runOuts",
    ] as const;
    return Array.from(map.entries()).map(([grade, list]) => {
      const totals: Record<string, number> = {};
      for (const k of sumKeys) {
        totals[k] = list.reduce((acc, r) => acc + (r[k] ?? 0), 0);
      }
      const batOuts = totals.innings - totals.notOuts;
      const batAvg = batOuts > 0 ? totals.runs / batOuts : null;
      const bowlAvg = totals.wickets > 0 ? totals.runsConceded / totals.wickets : null;
      return { grade, rows: list, totals, batAvg, bowlAvg };
    });
  }, [seasonStats]);

  const confirm = useConfirm();
  const handleDelete = async () => {
    if (
      await confirm({
        title: "Delete player?",
        description: "Are you sure you want to delete this player? This cannot be undone.",
        confirmText: "Delete",
        destructive: true,
      })
    ) {
      deletePlayer.mutate(
        { id: playerId },
        {
          onSuccess: () => {
            window.location.href = "/players";
          },
        },
      );
    }
  };

  if (isLoading) return <LoadingState className="py-20" label="Loading player…" />;
  if (isError)
    return (
      <QueryError
        className="my-12"
        message="We couldn’t load this player’s profile. Please try again."
        onRetry={() => refetch()}
      />
    );
  if (!player)
    return <div className="p-8 text-center text-muted-foreground">Player not found.</div>;

  const aggregated = aggregateCareer(player.stats)[0];
  const milestones = aggregated
    ? MILESTONE_BOARDS.map((k) => getMilestoneStatus(aggregated, k))
    : [];
  const premierships = player.premierships ?? [];
  const premsWon = player.premiershipsWon ?? premierships.length;
  const premsCaptained =
    player.premiershipsCaptained ?? premierships.filter((p) => p.isCaptain).length;
  const formatPremDate = (d: string | null | undefined) => {
    if (!d) return "";
    const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return d;
    return `${m[3]}/${m[2]}/${m[1]}`;
  };

  const fullName = `${player.givenName} ${player.surname}`.trim();
  const gradeList = sortGradesBySeniority(
    (player.gradesPlayed ?? "")
      .split(",")
      .map((g) => g.trim())
      .filter(Boolean),
  );
  const debutSeason = (seasonStats ?? []).reduce<number | null>(
    (min, r) => (r.season != null && (min == null || r.season < min) ? r.season : min),
    null,
  );
  const shareInput: ShareCardInput = {
    kind: "player",
    playerName: fullName,
    gradesPlayed: player.gradesPlayed,
    stats: [
      ...(aggregated
        ? [
            { label: "Games", value: aggregated.games ?? 0 },
            { label: "Runs", value: aggregated.runs ?? 0 },
            { label: "Wickets", value: aggregated.wickets ?? 0 },
          ]
        : []),
      ...((player.premiershipsWon ?? 0) > 0
        ? [{ label: "Premierships", value: player.premiershipsWon ?? 0 }]
        : []),
    ],
    photoUrl: player.imageUrl,
  };
  const batOuts = aggregated ? aggregated.innings - aggregated.notOuts : 0;
  const careerAvg = aggregated && batOuts > 0 ? (aggregated.runs / batOuts).toFixed(2) : null;
  const milestoneTimeline = seasons
    .slice()
    .sort((a, b) => b - a)
    .flatMap((s) =>
      getPlayerSeasonCrossings(playerStats, s).map((c) => ({
        key: `${s}-${c.key}-${c.threshold}`,
        label: String(s),
        title: c.tierLabel,
      })),
    )
    .slice(0, 8);

  return (
    <Container page className="py-[var(--gap-section)]">
      <PageStack>
        <nav aria-label="Breadcrumb" className="text-[13px] text-muted-foreground">
          <Link href="/players" className="hover:text-foreground">
            Players
          </Link>
          <span className="mx-1.5" aria-hidden>
            /
          </span>
          <span className="text-foreground">{fullName}</span>
        </nav>

        <div className="flex flex-wrap items-end gap-[clamp(20px,3vw,40px)]">
          <div className="relative aspect-[4/5] min-w-0 max-w-[380px] flex-[1_1_260px] overflow-hidden rounded-lg border bg-muted">
            {player.imageUrl ? (
              <img
                src={player.imageUrl}
                alt={fullName}
                className="h-full w-full object-cover"
                style={{ objectPosition: "52% 40%" }}
                data-testid="player-portrait"
              />
            ) : (
              <div
                className="flex h-full w-full items-center justify-center font-serif text-[clamp(64px,10vw,120px)] font-bold text-muted-foreground"
                data-testid="player-initials"
              >
                {initialsOf(fullName)}
              </div>
            )}
            {capEntry && (
              <GlassPill className="absolute left-3 top-3">Cap {capEntry.capNumber}</GlassPill>
            )}
            {isAdmin && (
              <div className="absolute bottom-3 right-3 flex items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoChange}
                />
                {player.imageUrl && (
                  <button
                    type="button"
                    onClick={() => persistImageUrl(null)}
                    disabled={updatePlayer.isPending}
                    className="rounded-full bg-black/60 px-3 py-1.5 text-xs text-white backdrop-blur-md hover:bg-black/75 disabled:opacity-50"
                  >
                    Remove photo
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading || updatePlayer.isPending}
                  aria-label="Upload player photo"
                  title="Upload player photo"
                  className="rounded-full bg-primary p-2 text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
                >
                  {isUploading || updatePlayer.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                </button>
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-[2_1_420px] flex-col gap-4">
            {(gradeList[0] || debutSeason != null) && (
              <Eyebrow accent>
                {[gradeList[0], debutSeason != null ? `Debut ${fmtSeason(debutSeason)}` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </Eyebrow>
            )}
            <h1 className="text-[clamp(44px,6.4vw,96px)] leading-[.95]">{fullName}</h1>
            {gradeList.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <AttrChip>Grades {gradeList.map(gradeCode).join(" · ")}</AttrChip>
                {premsWon > 0 && (
                  <AttrChip>
                    {premsWon} premiership{premsWon === 1 ? "" : "s"}
                  </AttrChip>
                )}
              </div>
            )}
            {aggregated && (
              <StatStrip
                items={[
                  { label: "Matches", value: aggregated.games },
                  { label: "Runs", value: aggregated.runs },
                  { label: "High score", value: aggregated.highScoreDisplay },
                  { label: "Average", value: careerAvg },
                  { label: "Wickets", value: aggregated.wickets },
                  { label: "Best", value: aggregated.bestBowling || null },
                  { label: "Catches", value: aggregated.catches },
                ]}
              />
            )}
            {photoError && <p className="text-xs text-destructive">{photoError}</p>}
            <div className="flex flex-wrap items-center gap-2">
              <ShareButton
                input={shareInput}
                appPath={`/players/${player.id}`}
                playerId={player.id}
                label="Share player card"
                variant="default"
                className="h-11 rounded-full px-5 transition-transform hover:-translate-y-0.5"
              />
              <Link
                href={`/compare?a=${player.id}`}
                className="inline-flex h-11 items-center rounded-full border px-5 text-sm font-semibold transition-colors hover:border-primary"
              >
                Compare
              </Link>
              <Button
                variant="outline"
                className="h-11 rounded-full px-5"
                onClick={() => setCardOpen(true)}
              >
                <IdCard className="mr-1.5 h-4 w-4" /> Trading card
              </Button>
              {isAdmin && (
                <Button
                  variant="destructive"
                  className="h-11 rounded-full px-5"
                  onClick={handleDelete}
                  disabled={deletePlayer.isPending}
                >
                  Delete player
                </Button>
              )}
            </div>
          </div>
        </div>
        <TradingCardModal playerId={playerId} open={cardOpen} onOpenChange={setCardOpen} />

        {milestoneTimeline.length > 0 && (
          <section className="rounded-lg border bg-card p-[clamp(16px,2vw,24px)]">
            <h2 className="mb-4 text-[clamp(22px,2.2vw,28px)] leading-none">Milestones</h2>
            <Timeline items={milestoneTimeline} />
          </section>
        )}

        {premsWon > 0 && (
          <div className="rounded-lg border bg-card p-[clamp(16px,2vw,24px)]">
            <div className="flex items-baseline justify-between gap-3 mb-1">
              <h2 className="m-0 text-[clamp(22px,2.2vw,28px)] leading-none flex items-center gap-2">
                <Trophy className="h-5 w-5 text-amber-600" />
                Premierships won
              </h2>
              <Link
                href="/premierships"
                className="text-xs uppercase tracking-widest text-primary-text hover:underline"
              >
                View board →
              </Link>
            </div>
            <div className="mb-4" />
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-amber-500/15 border border-amber-600/40 text-amber-700 dark:text-amber-300 font-bold">
                <Trophy className="h-4 w-4" />
                <span className="tabular-nums text-lg">{premsWon}</span>
                <span className="text-xs uppercase tracking-wider">won</span>
              </div>
              {premsCaptained > 0 && (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-amber-600 text-white font-bold">
                  <Crown className="h-4 w-4" />
                  <span className="tabular-nums text-lg">{premsCaptained}</span>
                  <span className="text-xs uppercase tracking-wider">captained</span>
                </div>
              )}
            </div>
            <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {premierships.map((p) => (
                <div
                  key={p.id}
                  className="bg-background/60 border border-border rounded-md p-3 flex items-start gap-3"
                >
                  <div className="text-center shrink-0">
                    <div className="tabular-nums font-bold text-primary-text text-lg leading-none">
                      {p.year}
                    </div>
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      {p.grade}
                    </div>
                  </div>
                  <div className="min-w-0 text-xs">
                    {p.competition && p.competition !== p.grade.toUpperCase() && (
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">
                        {p.competition}
                      </div>
                    )}
                    {p.result && (
                      <div className="font-semibold text-foreground/90 leading-snug">
                        {p.result}
                      </div>
                    )}
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
          <div className="rounded-lg border bg-card p-[clamp(16px,2vw,24px)]">
            <div className="flex items-baseline justify-between gap-3 mb-1">
              <h2 className="m-0 text-[clamp(22px,2.2vw,28px)] leading-none">Milestone tracker</h2>
              <span className="text-xs uppercase tracking-widest text-muted-foreground">
                Next honour board target
              </span>
            </div>
            <div className="mb-4" />
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              {milestones.map((m) => (
                <MilestoneCard
                  key={m.key}
                  status={m}
                  playerName={`${player.givenName} ${player.surname}`.trim()}
                  photoUrl={player.imageUrl}
                />
              ))}
            </div>
          </div>
        )}

        {seasons.length > 0 && selectedSeason !== null && (
          <div className="rounded-lg border bg-card p-[clamp(16px,2vw,24px)]">
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2 mb-1">
              <h2 className="m-0 text-[clamp(22px,2.2vw,28px)] leading-none">
                Milestones hit this season
              </h2>
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold uppercase tracking-widest text-primary-text">
                  Season
                </label>
                <select
                  value={String(selectedSeason)}
                  onChange={(e) => setSelectedSeason(parseInt(e.target.value, 10))}
                  className="h-9 rounded-full border bg-muted px-3.5 text-sm font-medium text-foreground"
                >
                  {seasons.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mb-4" />
            {seasonCrossings.length === 0 ? (
              <div className="text-sm text-muted-foreground italic">
                No honour board crossed in {selectedSeason}.
              </div>
            ) : (
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {seasonCrossings.map((c) => (
                  <div
                    key={`${c.key}-${c.threshold}`}
                    className="bg-background/60 border border-border rounded-md p-3 flex items-start gap-3"
                  >
                    <TierBadge
                      tierIndex={c.tierIndex}
                      className="h-6 w-6 text-primary-text shrink-0 mt-0.5"
                    />
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-primary-text truncate">
                        {c.tierLabel}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        <span className="tabular-nums font-bold text-foreground">
                          {fmtNum(c.beforeValue)}
                        </span>
                        <span> → </span>
                        <span className="tabular-nums font-bold text-foreground">
                          {fmtNum(c.afterValue)}
                        </span>{" "}
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
              <span className="font-semibold">A Grade Cap #{capEntry.capNumber}.</span> Played
              between 1 and 9 A Grade games for the club. Individual stats were not recorded prior
              to MyCricket and PlayHQ for players with fewer than 10 games.
            </p>
          </div>
        )}

        {seasonsByGrade.length > 0 && (
          <div className="rounded-lg border bg-card p-[clamp(16px,2vw,24px)]">
            <div className="flex items-baseline justify-between gap-3 mb-1">
              <h2 className="m-0 text-[clamp(22px,2.2vw,28px)] leading-none">By season</h2>
              <span className="text-xs uppercase tracking-widest text-muted-foreground">
                Year-by-year history
              </span>
            </div>
            <div className="mb-4" />
            <div className="space-y-6">
              {seasonsByGrade.map(({ grade, rows, totals, batAvg, bowlAvg }) => (
                <div key={grade}>
                  <div className="flex items-center gap-2 mb-2">
                    <GradeBadge grade={grade} size="sm" />
                    <span className="font-semibold text-primary-text">{grade}</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm sticky-id-col">
                      <thead>
                        <tr className="border-b text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                          <th className="text-left font-medium p-3">Season</th>
                          <th className="text-right font-medium p-3">Mat</th>
                          <th className="text-right font-medium p-3">Inn</th>
                          <th className="text-right font-medium p-3">NO</th>
                          <th className="text-right font-medium p-3">Runs</th>
                          <th className="text-right font-medium p-3">HS</th>
                          <th className="text-right font-medium p-3">Avg</th>
                          <th className="text-right font-medium p-3">100s</th>
                          <th className="text-right font-medium p-3">50s</th>
                          <th className="text-right font-medium p-3">Wkts</th>
                          <th className="text-right font-medium p-3">Runs</th>
                          <th className="text-right font-medium p-3">Avg</th>
                          <th className="text-right font-medium p-3">BB</th>
                          <th className="text-right font-medium p-3">5WI</th>
                          <th className="text-right font-medium p-3">Ct</th>
                          <th className="text-right font-medium p-3">St</th>
                          <th className="text-right font-medium p-3">RO</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr
                            key={`${grade}-${r.season ?? "baseline"}`}
                            className="border-b last:border-0 hover:bg-muted/50 transition-colors"
                          >
                            <td className="p-3 tabular-nums whitespace-nowrap">
                              {r.season != null ? fmtSeason(r.season) : "Pre-2025"}
                            </td>
                            <td className="p-3 text-right tabular-nums">{r.games || "-"}</td>
                            <td className="p-3 text-right tabular-nums">{r.innings || "-"}</td>
                            <td className="p-3 text-right tabular-nums">{r.notOuts || "-"}</td>
                            <td className="p-3 text-right tabular-nums font-bold">
                              {r.runs || "-"}
                            </td>
                            <td className="p-3 text-right tabular-nums">{r.highScore || "-"}</td>
                            <td className="p-3 text-right tabular-nums">
                              {r.batAvg?.toFixed(2) || "-"}
                            </td>
                            <td className="p-3 text-right tabular-nums">{r.hundreds || "-"}</td>
                            <td className="p-3 text-right tabular-nums">{r.fifties || "-"}</td>
                            <td className="p-3 text-right tabular-nums font-bold">
                              {r.wickets || "-"}
                            </td>
                            <td className="p-3 text-right tabular-nums">{r.runsConceded || "-"}</td>
                            <td className="p-3 text-right tabular-nums">
                              {r.bowlAvg?.toFixed(2) || "-"}
                            </td>
                            <td className="p-3 text-right tabular-nums">{r.bestBowling || "-"}</td>
                            <td className="p-3 text-right tabular-nums">{r.fiveWickets || "-"}</td>
                            <td className="p-3 text-right tabular-nums">{r.catches || "-"}</td>
                            <td className="p-3 text-right tabular-nums">{r.stumpings || "-"}</td>
                            <td className="p-3 text-right tabular-nums">{r.runOuts || "-"}</td>
                          </tr>
                        ))}
                        <tr className="border-t-2 border-primary/40 bg-muted/30 font-semibold">
                          <td className="p-3 tabular-nums uppercase tracking-wider text-xs text-primary-text">
                            Total
                          </td>
                          <td className="p-3 text-right tabular-nums">{totals.games || "-"}</td>
                          <td className="p-3 text-right tabular-nums">{totals.innings || "-"}</td>
                          <td className="p-3 text-right tabular-nums">{totals.notOuts || "-"}</td>
                          <td className="p-3 text-right tabular-nums font-bold">
                            {totals.runs || "-"}
                          </td>
                          <td className="p-3 text-right tabular-nums">-</td>
                          <td className="p-3 text-right tabular-nums">
                            {batAvg?.toFixed(2) || "-"}
                          </td>
                          <td className="p-3 text-right tabular-nums">{totals.hundreds || "-"}</td>
                          <td className="p-3 text-right tabular-nums">{totals.fifties || "-"}</td>
                          <td className="p-3 text-right tabular-nums font-bold">
                            {totals.wickets || "-"}
                          </td>
                          <td className="p-3 text-right tabular-nums">
                            {totals.runsConceded || "-"}
                          </td>
                          <td className="p-3 text-right tabular-nums">
                            {bowlAvg?.toFixed(2) || "-"}
                          </td>
                          <td className="p-3 text-right tabular-nums">-</td>
                          <td className="p-3 text-right tabular-nums">
                            {totals.fiveWickets || "-"}
                          </td>
                          <td className="p-3 text-right tabular-nums">{totals.catches || "-"}</td>
                          <td className="p-3 text-right tabular-nums">{totals.stumpings || "-"}</td>
                          <td className="p-3 text-right tabular-nums">{totals.runOuts || "-"}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {matchLines && matchLines.length > 0 && (
          <div className="rounded-lg border bg-card p-[clamp(16px,2vw,24px)]">
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2 mb-1">
              <h2 className="m-0 text-[clamp(22px,2.2vw,28px)] leading-none">Match by match</h2>
              <span className="text-xs uppercase tracking-widest text-muted-foreground">
                {filteredMatchLines.length === matchLines.length
                  ? `${matchLines.length} game${matchLines.length === 1 ? "" : "s"} recorded`
                  : `${filteredMatchLines.length} of ${matchLines.length} games`}
              </span>
            </div>
            <div className="mb-4" />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4">
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold uppercase tracking-widest text-primary-text">
                  Season
                </label>
                <select
                  value={matchSeasonFilter}
                  onChange={(e) => setMatchSeasonFilter(e.target.value)}
                  className="h-9 rounded-full border bg-muted px-3.5 text-sm font-medium text-foreground"
                >
                  <option value="all">All seasons</option>
                  {matchSeasonOptions.map((s) => (
                    <option key={s} value={String(s)}>
                      {fmtSeason(s)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold uppercase tracking-widest text-primary-text">
                  Grade
                </label>
                <select
                  value={matchGradeFilter}
                  onChange={(e) => setMatchGradeFilter(e.target.value)}
                  className="h-9 rounded-full border bg-muted px-3.5 text-sm font-medium text-foreground"
                >
                  <option value="all">All grades</option>
                  {matchGradeOptions.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {filteredMatchLines.length === 0 ? (
              <div className="text-sm text-muted-foreground italic">
                No matches for the selected filters.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm sticky-id-col">
                  <thead>
                    <tr className="border-b text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
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
                        <tr
                          key={m.matchId}
                          className="border-b last:border-0 hover:bg-muted/50 transition-colors cursor-pointer"
                          onClick={() => {
                            window.location.href = `/matches/${m.matchId}`;
                          }}
                        >
                          <td className="p-3 tabular-nums">
                            {m.season != null
                              ? `${m.season}/${String((m.season + 1) % 100).padStart(2, "0")}`
                              : "—"}
                          </td>
                          <td className="p-3 tabular-nums">{m.stage ?? m.round ?? "—"}</td>
                          <td className="p-3">
                            <GradeBadge grade={m.grade} size="sm" />
                          </td>
                          <td className="p-3">
                            <Link
                              href={`/matches/${m.matchId}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-primary-text hover:underline"
                            >
                              {m.opponent ?? "—"}
                            </Link>
                          </td>
                          <td className="p-3 tabular-nums">
                            {m.batted
                              ? `${m.runs ?? 0}${m.notOut ? "*" : ""}${m.balls != null ? ` (${m.balls})` : ""}`
                              : "—"}
                          </td>
                          <td className="p-3 tabular-nums">
                            {m.bowled
                              ? `${m.wickets ?? 0}/${m.runsConceded ?? 0}${m.overs ? ` (${m.overs})` : ""}`
                              : "—"}
                          </td>
                          <td className="p-3 tabular-nums">
                            {fieldParts.length ? fieldParts.join(" ") : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm sticky-id-col">
            <thead>
              <tr className="border-b text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
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
              {player.stats
                .filter((s) => s.grade !== "CLUB TOTAL")
                .map((stat) => (
                  <tr
                    key={stat.id}
                    className="border-b last:border-0 hover:bg-muted/50 transition-colors"
                  >
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <GradeBadge grade={stat.grade} size="sm" />
                        <span className="font-semibold text-primary-text">{stat.grade}</span>
                      </div>
                    </td>
                    <td className="p-4 text-right tabular-nums">{stat.games || "-"}</td>
                    <td className="p-4 text-right tabular-nums">{stat.innings || "-"}</td>
                    <td className="p-4 text-right tabular-nums">{stat.notOuts || "-"}</td>
                    <td className="p-4 text-right tabular-nums font-bold">{stat.runs || "-"}</td>
                    <td className="p-4 text-right tabular-nums">{stat.highScore || "-"}</td>
                    <td className="p-4 text-right tabular-nums">
                      {stat.batAvg?.toFixed(2) || "-"}
                    </td>
                    <td className="p-4 text-right tabular-nums">{stat.hundreds || "-"}</td>
                    <td className="p-4 text-right tabular-nums">{stat.fifties || "-"}</td>
                    <td className="p-4 text-right tabular-nums font-bold">{stat.wickets || "-"}</td>
                    <td className="p-4 text-right tabular-nums">{stat.runsConceded || "-"}</td>
                    <td className="p-4 text-right tabular-nums">
                      {stat.bowlAvg?.toFixed(2) || "-"}
                    </td>
                    <td className="p-4 text-right tabular-nums">{stat.bestBowling || "-"}</td>
                    <td className="p-4 text-right tabular-nums">{stat.fiveWickets || "-"}</td>
                    <td className="p-4 text-right tabular-nums">{stat.catches || "-"}</td>
                    <td className="p-4 text-right tabular-nums">{stat.stumpings || "-"}</td>
                    <td className="p-4 text-right tabular-nums">{stat.runOuts || "-"}</td>
                    <td className="p-4 text-right">
                      <Link
                        href={`/stats/${stat.id}`}
                        className="text-sm text-primary-text hover:underline"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              {player.stats.length === 0 && (
                <tr>
                  <td colSpan={18} className="p-8 text-center text-muted-foreground">
                    No stats recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <JuniorCareerSection playerId={player.id} />
      </PageStack>
    </Container>
  );
}

/**
 * Junior career cross-section, shown only when an admin has linked this senior
 * player to junior participant profile(s). Junior figures are fetched from the
 * juniors API in the browser (the senior API never reads junior tables) and
 * rendered as a clearly-labelled SEPARATE section — junior and senior records
 * are never combined into any total, and this section never feeds the
 * milestone tracker or any senior record/leaderboard.
 */
function JuniorCareerSection({ playerId }: { playerId: number }) {
  const { data: links } = useListJuniorPlayersBySenior(playerId, {
    query: { queryKey: getListJuniorPlayersBySeniorQueryKey(playerId) },
  });
  if (!links?.length) return null;
  return (
    <div className="rounded-lg border bg-card p-[clamp(16px,2vw,24px)]">
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <h2 className="m-0 text-[clamp(22px,2.2vw,28px)] leading-none">Junior career</h2>
        <span className="text-xs uppercase tracking-widest text-muted-foreground">
          Kept separate from senior records
        </span>
      </div>
      <div className="mb-4" />
      <div className="space-y-4">
        {links.map((l) => (
          <JuniorIdentitySummary key={l.participantId} participantId={l.participantId} />
        ))}
      </div>
      <p className="text-xs text-muted-foreground mt-4">
        Junior records are kept completely separate from senior records and are never combined into
        any career figure.
      </p>
    </div>
  );
}

function JuniorIdentitySummary({ participantId }: { participantId: string }) {
  const { data: junior } = useGetJuniorPlayer(participantId, {
    query: { queryKey: getGetJuniorPlayerQueryKey(participantId) },
  });
  if (!junior) return null;
  const tiles: { label: string; value: string | number }[] = [
    { label: "Matches", value: junior.batting.matches },
    { label: "Runs", value: junior.batting.runs },
    { label: "High Score", value: junior.batting.highScore ?? "—" },
    { label: "Wickets", value: junior.bowling.wickets },
    {
      label: "Best Bowling",
      value:
        junior.bowling.bestWickets != null
          ? `${junior.bowling.bestWickets}/${junior.bowling.bestRuns ?? "—"}`
          : "—",
    },
  ];
  return (
    <div className="border border-border rounded-md p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <div>
          <span className="font-semibold text-primary-text">{junior.displayName}</span>
          <span className="ml-2 text-xs text-muted-foreground">
            {junior.firstSeason && junior.lastSeason
              ? `${junior.firstSeason} – ${junior.lastSeason}`
              : (junior.firstSeason ?? "")}
            {junior.teams ? ` · ${junior.teams}` : ""}
          </span>
        </div>
        <Link
          href={`/juniors/players/${junior.participantId}`}
          className="text-sm text-primary-text hover:underline"
        >
          View junior profile →
        </Link>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {tiles.map((t) => (
          <div
            key={t.label}
            className="bg-background/60 border border-border rounded-md p-2 text-center"
          >
            <div className="text-lg font-serif font-bold text-primary-text">{t.value}</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">
              {t.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
