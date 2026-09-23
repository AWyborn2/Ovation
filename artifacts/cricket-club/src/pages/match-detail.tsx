import { useParams, Link } from "wouter";
import { useBrand } from "@/lib/brand-context";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMatch,
  getGetMatchQueryKey,
  getListMatchesQueryKey,
  useUpdateMatchRound,
  useSetMatchHatTrick,
  MatchStage,
  type MatchDetail as MatchDetailDto,
} from "@workspace/api-client-react";
import { useCurrentAdmin, handleAdminMutationError } from "@/lib/admin-auth";

import { BroadcastScorecard } from "@/components/scorecard/broadcast-scorecard";
import { buildScorecard } from "@workspace/scorecard";
import { useBrandLogo } from "@/lib/use-brand";
import { useClubShortName } from "@/lib/brand-context";
import { Container, resultCode } from "@/components/broadcast";
import { LazyShareCardModal } from "@/components/share-card-modal-lazy";
import { matchToSummaryInput } from "@/lib/match-summary";
import { cn, matchLabel } from "@/lib/utils";
import { Pencil, Check, X, Flame, Share2 } from "lucide-react";
import { LoadingState, QueryError, EmptyState } from "@/components/data-states";

const FINALS_STAGES = Object.values(MatchStage);

const fmtSeason = (s: number) => `${s}/${String((s + 1) % 100).padStart(2, "0")}`;

const fmtDate = (d: string | null | undefined) => {
  if (!d) return null;
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return d;
  return `${m[3]}/${m[2]}/${m[1]}`;
};

export default function MatchDetail() {
  const brand = useBrand();
  const { id } = useParams<{ id: string }>();
  const matchId = parseInt(id, 10);
  const {
    data: match,
    isLoading,
    isError,
    refetch,
  } = useGetMatch(matchId, {
    query: { enabled: !!matchId, queryKey: getGetMatchQueryKey(matchId) },
  });

  const brandLogo = useBrandLogo();
  const brandShort = useClubShortName();
  const scorecard = useMemo(() => (match ? buildScorecard(match) : null), [match]);

  const me = useCurrentAdmin();
  const isAdmin = !!me.data;
  const queryClient = useQueryClient();
  const updateRound = useUpdateMatchRound();

  const [hatTrickError, setHatTrickError] = useState<string | null>(null);
  const setHatTrick = useSetMatchHatTrick({
    mutation: {
      onSuccess: () => {
        setHatTrickError(null);
        queryClient.invalidateQueries({ queryKey: getGetMatchQueryKey(matchId) });
      },
      onError: (e) => setHatTrickError(handleAdminMutationError(e)),
    },
  });

  const [shareOpen, setShareOpen] = useState(false);

  const [editingRound, setEditingRound] = useState(false);
  const [roundValue, setRoundValue] = useState("");
  const [stageValue, setStageValue] = useState("");
  const [roundError, setRoundError] = useState<string | null>(null);

  const startEditRound = () => {
    setRoundValue(match?.round != null ? String(match.round) : "");
    setStageValue(match?.stage ?? "");
    setRoundError(null);
    setEditingRound(true);
  };

  const cancelEditRound = () => {
    setEditingRound(false);
    setRoundError(null);
  };

  const saveRound = () => {
    // A finals stage wins and clears the round; otherwise a numeric round is
    // required. The two are mutually exclusive identities for a match.
    if (stageValue) {
      setRoundError(null);
      updateRound.mutate(
        { id: matchId, data: { round: null, stage: stageValue as MatchStage } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetMatchQueryKey(matchId) });
            queryClient.invalidateQueries({ queryKey: getListMatchesQueryKey() });
            setEditingRound(false);
          },
          onError: (e) => {
            setRoundError(handleAdminMutationError(e) ?? "Could not update the match.");
          },
        },
      );
      return;
    }

    const parsed = parseInt(roundValue, 10);
    if (!Number.isInteger(parsed) || parsed < 1) {
      setRoundError("Enter a round number of 1 or more, or pick a finals stage.");
      return;
    }
    setRoundError(null);
    updateRound.mutate(
      { id: matchId, data: { round: parsed, stage: null } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetMatchQueryKey(matchId) });
          queryClient.invalidateQueries({ queryKey: getListMatchesQueryKey() });
          setEditingRound(false);
        },
        onError: (e) => {
          setRoundError(handleAdminMutationError(e) ?? "Could not update the round.");
        },
      },
    );
  };

  if (isError) return <QueryError onRetry={() => refetch()} />;
  if (isLoading) return <LoadingState label="Loading match…" />;
  if (!match)
    return <EmptyState title="Match not found" message="This match could not be found." />;

  const hatTrickIds = new Set(match.hatTrickPlayerIds ?? []);
  // Admins manage hat-tricks on tenant-club bowlers (real players only).
  const hhBowlers = match.lines.filter((l) => l.bowled && l.playerId < 90000);
  const clubOvers = scorecard?.innings.find((i) => i.battingTeam.isHallsHead)?.oversTotal ?? null;
  const oppOvers = scorecard?.innings.find((i) => !i.battingTeam.isHallsHead)?.oversTotal ?? null;

  const code = match.abandoned ? null : resultCode(match.result);
  const verb = code === "W" ? "def" : code === "L" ? "lost to" : code === "T" ? "tied" : "v";
  const oppName = match.opponent ?? "Opposition";
  const meta = [
    `${match.grade} · ${fmtSeason(match.season)}`,
    !match.stage && matchLabel(match.round, match.stage),
    fmtDate(match.matchDate),
    match.venue,
  ].filter(Boolean);

  return (
    <Container page className="py-[var(--gap-section)]">
      <div className="flex flex-col gap-[var(--gap-section)]">
        <nav aria-label="Breadcrumb" className="text-[13px] text-muted-foreground">
          <Link href="/matches" className="hover:text-foreground">
            Matches
          </Link>
          <span className="mx-1.5" aria-hidden>
            /
          </span>
          <span className="text-foreground">
            {brandShort} v {oppName}
          </span>
        </nav>

        <section
          className="rounded-lg border p-[clamp(16px,2.4vw,32px)]"
          style={{
            background:
              "radial-gradient(ellipse at 15% 0%, var(--glow), transparent 55%), hsl(var(--card))",
          }}
          data-testid="match-hero"
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-muted-foreground">
            {match.stage && (
              <span className="inline-flex h-[26px] items-center rounded-full bg-primary px-3 text-xs font-bold uppercase tracking-[0.08em] text-primary-foreground">
                {match.stage}
              </span>
            )}
            {match.abandoned && (
              <span className="inline-flex h-[26px] items-center rounded-full border px-3 text-xs font-bold uppercase tracking-[0.08em]">
                Abandoned
              </span>
            )}
            <span>{meta.join(" · ")}</span>
            <div className="ml-auto flex items-center gap-2">
              {isAdmin && !editingRound && (
                <button
                  type="button"
                  onClick={startEditRound}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary-text hover:underline"
                  data-testid="button-edit-round"
                >
                  <Pencil className="h-3 w-3" />
                  {match.round != null || match.stage ? "Edit round/stage" : "Set round/stage"}
                </button>
              )}
              <button
                type="button"
                onClick={() => setShareOpen(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold transition-colors hover:border-primary"
                data-testid="button-share-match"
              >
                <Share2 className="h-3.5 w-3.5" /> Share
              </button>
            </div>
          </div>

          {isAdmin && editingRound && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-sm">
              <span>Round</span>
              <input
                type="number"
                min={1}
                value={roundValue}
                onChange={(e) => {
                  setRoundValue(e.target.value);
                  if (e.target.value) setStageValue("");
                }}
                disabled={updateRound.isPending || !!stageValue}
                autoFocus
                className="h-8 w-16 rounded-sm border bg-muted px-2 text-sm disabled:opacity-50"
                data-testid="input-round"
              />
              <span>or final</span>
              <select
                value={stageValue}
                onChange={(e) => {
                  setStageValue(e.target.value);
                  if (e.target.value) setRoundValue("");
                }}
                disabled={updateRound.isPending}
                className="h-8 rounded-sm border bg-muted px-2 text-sm"
                data-testid="select-stage"
              >
                <option value="">—</option>
                {FINALS_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={saveRound}
                disabled={updateRound.isPending}
                className="inline-flex items-center gap-1 text-xs font-medium text-primary-text hover:underline disabled:opacity-50"
                data-testid="button-save-round"
              >
                <Check className="h-3.5 w-3.5" /> Save
              </button>
              <button
                type="button"
                onClick={cancelEditRound}
                disabled={updateRound.isPending}
                className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:underline disabled:opacity-50"
                data-testid="button-cancel-round"
              >
                <X className="h-3.5 w-3.5" /> Cancel
              </button>
            </div>
          )}
          {isAdmin && roundError && (
            <div className="mt-1 text-xs text-destructive" data-testid="text-round-error">
              {roundError}
            </div>
          )}

          <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6">
            <TeamSide
              name={brand.name}
              logo={brandLogo}
              score={match.clubScore}
              overs={clubOvers}
            />
            <div
              className="font-serif text-sm font-bold uppercase tracking-[0.14em] text-muted-foreground"
              data-testid="match-verb"
            >
              {verb}
            </div>
            <TeamSide
              name={oppName}
              club={match.opponentClub}
              score={match.opponentScore}
              overs={oppOvers}
              align="right"
              muted
            />
          </div>

          {(match.result || match.competition) && (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t pt-4 text-sm">
              {match.result && (
                <span className="font-semibold text-primary-text">{match.result}</span>
              )}
              {match.competition && (
                <span className="text-muted-foreground">{match.competition}</span>
              )}
            </div>
          )}
        </section>

        <BroadcastScorecard match={match} hatTrickIds={hatTrickIds} />

        {/* Admin: hat-trick management */}
        {isAdmin && hhBowlers.length > 0 && (
          <div className="rounded-lg border bg-card p-[clamp(16px,2vw,24px)]">
            <h2 className="flex items-center gap-1.5 text-[22px] leading-none">
              <Flame className="h-4 w-4" /> Hat-tricks
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5 mb-3">
              Mark any {brand.name} bowler who took a hat-trick in this match.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {hhBowlers.map((l) => {
                const has = hatTrickIds.has(l.playerId);
                return (
                  <label
                    key={l.id}
                    className="inline-flex items-center gap-2 text-sm cursor-pointer rounded border border-border px-3 py-2 hover:bg-muted/50"
                  >
                    <input
                      type="checkbox"
                      checked={has}
                      disabled={setHatTrick.isPending}
                      onChange={(e) =>
                        setHatTrick.mutate({
                          id: matchId,
                          data: { playerId: l.playerId, hatTrick: e.target.checked },
                        })
                      }
                      data-testid={`checkbox-hattrick-${l.playerId}`}
                    />
                    <span className="text-foreground">
                      {l.givenName} {l.surname}
                    </span>
                    <span className="ml-auto font-mono text-xs text-muted-foreground">
                      {l.wickets ?? 0}/{l.runsConceded ?? "—"}
                    </span>
                  </label>
                );
              })}
            </div>
            {hatTrickError && <div className="mt-3 text-sm text-destructive">{hatTrickError}</div>}
          </div>
        )}

        <LazyShareCardModal
          open={shareOpen}
          onOpenChange={setShareOpen}
          input={shareOpen ? matchToSummaryInput(match) : null}
          engine="ondemand"
          appPath={`/matches/${matchId}`}
          playerId={null}
        />
      </div>
    </Container>
  );
}

type OpponentClubInfo = MatchDetailDto["opponentClub"];

/** One side of the score hero: crest, name, big score, overs. */
function TeamSide({
  name,
  logo,
  club,
  score,
  overs,
  align = "left",
  muted,
}: {
  name: string;
  logo?: string | null;
  club?: OpponentClubInfo;
  score?: string | null;
  overs?: string | null;
  align?: "left" | "right";
  muted?: boolean;
}) {
  const [errored, setErrored] = useState(false);
  const src = logo ?? club?.logoUrl128 ?? club?.logoUrl ?? null;
  const right = align === "right";
  return (
    <div
      className={cn("flex min-w-0 flex-col gap-2", right ? "items-end text-right" : "items-start")}
    >
      {src && !errored ? (
        <img
          src={src}
          alt=""
          onError={() => setErrored(true)}
          className="h-[clamp(48px,7vw,88px)] w-auto object-contain"
        />
      ) : (
        <span
          aria-hidden
          className="flex h-[clamp(48px,7vw,88px)] w-[clamp(48px,7vw,88px)] items-center justify-center rounded-full bg-muted font-serif text-[clamp(22px,3vw,36px)] font-bold text-muted-foreground"
        >
          {name.trim()[0]?.toUpperCase() ?? "?"}
        </span>
      )}
      <div className="max-w-full truncate font-semibold">{name}</div>
      <div
        className={cn(
          "font-serif text-[clamp(34px,5.4vw,72px)] font-bold leading-none tabular-nums",
          muted && "text-muted-foreground",
        )}
      >
        {score || "–"}
      </div>
      {overs && <div className="text-[13px] text-muted-foreground">{overs} overs</div>}
    </div>
  );
}
