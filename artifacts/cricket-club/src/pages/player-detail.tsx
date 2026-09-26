import { useParams, Link } from "wouter";
import { useMemo, useState, useRef } from "react";
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
  useGetMilestoneBoardSettings,
  getGetMilestoneBoardSettingsQueryKey,
  useGetGradeDistribution,
  getGetGradeDistributionQueryKey,
} from "@workspace/api-client-react";
import type { PlayerMatchLine, PlayerSeasonStat } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useUpload } from "@workspace/object-storage-web";
import { IdCard, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { sortGradesBySeniority } from "@/components/grade-badge";
import { gradeCode } from "@/lib/grade-code";
import { Container, PageStack } from "@/components/broadcast";
import { SeasonBar } from "@/components/stats-charts";
import { useCurrentAdmin } from "@/lib/admin-auth";
import { aggregateCareer } from "@/lib/honour-boards";
import { ShareButton } from "@/components/share-button";
import type { ShareCardInput } from "@/lib/share-card";
import { TradingCardModal } from "@/components/trading-card";
import { LoadingState, QueryError } from "@/components/data-states";
import { useConfirm } from "@/components/confirm-dialog";
import { useExploreImage, useHeroImage } from "@/lib/use-hero-image";
import { seasonLabel, useStatsView } from "@/lib/use-stats-view";
import {
  filterMatches,
  filterSeasonRows,
  milestoneTiers,
  nextMilestones,
  scorecardCoverage,
} from "@/lib/stats-analytics";
import { ProfileHero, heroStats } from "./player-detail/hero";
import { MilestoneTimeline, milestoneEvents } from "./player-detail/milestones";
import { CareerArc } from "./player-detail/career-arc";
import { DismissalsCard } from "./player-detail/dismissals";
import { FormCard } from "./player-detail/form";
import { SplitsCard } from "./player-detail/splits";
import { DistributionCard } from "./player-detail/distribution";
import { RanksCard } from "./player-detail/ranks";
import { OpponentsCard } from "./player-detail/opponents";
import { NextUpCard } from "./player-detail/next-up";
import {
  GradeCareerTable,
  JuniorCareerSection,
  MatchByMatch,
  PremiershipsCard,
} from "./player-detail/history";
import {
  arcSeasons,
  mostPlayedGrade,
  rankSpan,
  rateWindow,
  seasonTotals,
} from "./player-detail/season-stats";

const EMPTY_MATCHES: PlayerMatchLine[] = [];
const EMPTY_SEASONS: PlayerSeasonStat[] = [];

/** Card rows from the handoff: 2-up at 520px, 3-up at 250px, reflowing to ~360px. */
const ROW_2 = "grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,520px),1fr))]";
const ROW_3 = "grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr))]";

/**
 * Player profile (plan 2026-09-24-002, U6): a chart-led analysis page driven by
 * the shared season bar (range + batting/bowling in the URL). Season-level
 * figures (hero, career arc) read `GET /players/{id}/seasons`; every per-match
 * chart reads the same enriched `GET /players/{id}/matches` rows through the
 * stats-analytics module, so their totals agree (R5). Ranks read the grade
 * distribution endpoint.
 */
export default function PlayerDetail() {
  const { id } = useParams<{ id: string }>();
  const playerId = parseInt(id, 10);
  const { view, setView, label: rangeLabel } = useStatsView();
  const range = useMemo(() => ({ from: view.from, to: view.to }), [view.from, view.to]);

  const {
    data: player,
    isLoading,
    isError,
    refetch,
  } = useGetPlayer(playerId, {
    query: { enabled: !!playerId, queryKey: getGetPlayerQueryKey(playerId) },
  });
  const { data: caps } = useListCaps();
  const matchesQ = useGetPlayerMatches(playerId, {
    query: { enabled: !!playerId, queryKey: getGetPlayerMatchesQueryKey(playerId) },
  });
  const seasonsQ = useGetPlayerSeasons(playerId, {
    query: { enabled: !!playerId, queryKey: getGetPlayerSeasonsQueryKey(playerId) },
  });
  const { data: boardSettings } = useGetMilestoneBoardSettings({
    query: { queryKey: getGetMilestoneBoardSettingsQueryKey() },
  });
  const matches = matchesQ.data ?? EMPTY_MATCHES;
  const seasons = seasonsQ.data ?? EMPTY_SEASONS;
  const chartsLoading = matchesQ.isLoading || seasonsQ.isLoading;

  // Ranks compare against the player's most-played grade over the range (or
  // the last five seasons for Career), from the grade distribution (U5).
  const rankGrade = useMemo(() => mostPlayedGrade(seasons, range), [seasons, range]);
  const span = useMemo(() => rankSpan(seasons, range), [seasons, range]);
  const distParams = span ? { fromSeason: span.from, toSeason: span.to } : undefined;
  const distQ = useGetGradeDistribution(rankGrade ?? "", distParams, {
    query: {
      enabled: !!rankGrade && !!span,
      queryKey: getGetGradeDistributionQueryKey(rankGrade ?? "", distParams),
    },
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
  // No player photo → the club's action shot (never another club's photo).
  const explorePhoto = useExploreImage("players");
  const homePhoto = useHeroImage("home");
  const clubPhoto = explorePhoto ?? homePhoto;

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

  const capEntry = useMemo(
    () => caps?.find((c) => c.playerId === playerId) ?? null,
    [caps, playerId],
  );

  // Range-scoped inputs shared by every section.
  const rangeMatches = useMemo(() => filterMatches(matches, range), [matches, range]);
  const totals = useMemo(() => seasonTotals(filterSeasonRows(seasons, range)), [seasons, range]);
  const arc = useMemo(() => arcSeasons(seasons, seasonLabel), [seasons]);
  const coverageNote = useMemo(() => scorecardCoverage(seasons, matches).note, [seasons, matches]);
  const tiers = useMemo(() => milestoneTiers(boardSettings), [boardSettings]);
  const barSeasons = useMemo(
    () => [...seasons.map((s) => s.season), ...matches.map((m) => m.season)],
    [seasons, matches],
  );
  const upcoming = useMemo(
    () => nextMilestones(matches, seasons, tiers, { rateMatches: rateWindow(matches, range) }),
    [matches, seasons, tiers, range],
  );
  const events = useMemo(
    () =>
      milestoneEvents({
        matches,
        seasons,
        tiers,
        capNumber: capEntry?.capNumber ?? null,
        premierships: player?.premierships ?? [],
        awards: player?.awards ?? [],
      }),
    [matches, seasons, tiers, capEntry, player],
  );

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
  const hasAGradeStats = player.stats.some((s) => s.grade === "A Grade");
  const showCappedNoStats = !!capEntry && !hasAGradeStats;
  const premierships = player.premierships ?? [];
  const premsWon = player.premiershipsWon ?? premierships.length;
  const premsCaptained =
    player.premiershipsCaptained ?? premierships.filter((p) => p.isCaptain).length;

  const fullName = `${player.givenName} ${player.surname}`.trim();
  const gradeList = sortGradesBySeniority(
    (player.gradesPlayed ?? "")
      .split(",")
      .map((g) => g.trim())
      .filter(Boolean),
  );
  const debutSeason = seasons.reduce<number | null>(
    (min, r) => (r.season != null && (min == null || r.season < min) ? r.season : min),
    null,
  );
  // Games before the first season row (season-less baseline) mean the real
  // debut predates the season rows, so say so rather than name a season.
  const playedBefore = seasons.some((r) => r.season == null && (r.games ?? 0) > 0);
  const debutLabel =
    debutSeason == null
      ? null
      : playedBefore
        ? `Debut pre-${seasonLabel(debutSeason)}`
        : `Debut ${seasonLabel(debutSeason)}`;
  const meta = [gradeList[0], debutLabel].filter(Boolean).join(" · ");
  const chips = [
    gradeList.length > 0 ? `Grades ${gradeList.map(gradeCode).join(" · ")}` : null,
    premsWon > 0 ? `${premsWon} premiership${premsWon === 1 ? "" : "s"}` : null,
    ...(player.awards ?? []).slice(0, 2).map((a) => `${a.title} ${seasonLabel(a.season)}`),
  ].filter((c): c is string => !!c);

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
    // Social assets lead with a library photo the player is tagged in, then
    // the headshot (the profile hero itself keeps the headshot first).
    photoUrl: player.libraryPhotoUrl ?? player.imageUrl ?? null,
  };

  const adminPhotoControls = isAdmin ? (
    <>
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
    </>
  ) : null;

  const sectionProps = {
    matches: rangeMatches,
    discipline: view.d,
    loading: chartsLoading,
    coverageNote,
  };

  return (
    <>
      <SeasonBar seasons={barSeasons} />
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

          <ProfileHero
            fullName={fullName}
            // Headshot first, then a photo-library shot they are tagged in.
            photo={player.imageUrl ?? player.libraryPhotoUrl ?? null}
            clubPhoto={clubPhoto}
            capNumber={capEntry?.capNumber ?? null}
            meta={meta || null}
            chips={chips}
            rangeLabel={rangeLabel}
            stats={heroStats(totals, view.d)}
            discipline={view.d}
            overlay={adminPhotoControls}
          />

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
            {photoError && <p className="text-xs text-destructive">{photoError}</p>}
          </div>
          <TradingCardModal playerId={playerId} open={cardOpen} onOpenChange={setCardOpen} />

          {showCappedNoStats && capEntry && (
            <div className="rounded-md border-l-4 border-primary/60 bg-muted/40 p-4 text-sm leading-snug">
              <p className="text-foreground/90">
                <span className="font-semibold">A Grade Cap #{capEntry.capNumber}.</span> Played
                between 1 and 9 A Grade games for the club. Individual stats were not recorded prior
                to MyCricket and PlayHQ for players with fewer than 10 games.
              </p>
            </div>
          )}

          <MilestoneTimeline events={events} view={view} loading={chartsLoading} />

          <div className={ROW_2}>
            <CareerArc
              seasons={arc}
              view={view}
              onDiscipline={(d) => setView({ d })}
              loading={chartsLoading}
            />
            <DismissalsCard {...sectionProps} />
          </div>

          <div className={ROW_3}>
            <FormCard {...sectionProps} />
            <SplitsCard {...sectionProps} />
            <DistributionCard {...sectionProps} gradeDistribution={distQ.data} />
          </div>

          <div className={ROW_2}>
            <RanksCard
              distribution={distQ.data}
              playerId={player.id}
              discipline={view.d}
              grade={rankGrade}
              span={span}
              loading={chartsLoading || (!!rankGrade && distQ.isLoading)}
              playerName={fullName}
            />
            <OpponentsCard {...sectionProps} />
          </div>

          <NextUpCard milestones={upcoming} loading={chartsLoading} />

          <PremiershipsCard
            premierships={premierships}
            premsWon={premsWon}
            premsCaptained={premsCaptained}
          />
          <MatchByMatch matches={rangeMatches} rangeLabel={rangeLabel} />
          <GradeCareerTable stats={player.stats} />
          <JuniorCareerSection playerId={player.id} />
        </PageStack>
      </Container>
    </>
  );
}
