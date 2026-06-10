import { useParams, Link } from "wouter";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMatch,
  getGetMatchQueryKey,
  useUpdateMatchRound,
  useSetMatchHatTrick,
  MatchStage,
  type MatchDetail as MatchDetailDto,
} from "@workspace/api-client-react";
import { useCurrentAdmin, handleAdminMutationError } from "@/lib/admin-auth";
import { GradeBadge } from "@/components/grade-badge";
import { DigitalScorecard } from "@/components/scorecard/digital-scorecard";
import { ShareCardModal } from "@/components/share-card-modal";
import { matchToSummaryInput } from "@/lib/match-summary";
import { matchLabel } from "@/lib/utils";
import { CalendarDays, MapPin, ChevronLeft, Pencil, Check, X, Flame, Share2 } from "lucide-react";
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
  const { id } = useParams<{ id: string }>();
  const matchId = parseInt(id, 10);
  const { data: match, isLoading, isError, refetch } = useGetMatch(matchId, {
    query: { enabled: !!matchId, queryKey: getGetMatchQueryKey(matchId) },
  });

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
            queryClient.invalidateQueries({ queryKey: ["/api/matches"] });
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
          queryClient.invalidateQueries({ queryKey: ["/api/matches"] });
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
  if (!match) return <EmptyState title="Match not found" message="This match could not be found." />;

  const hatTrickIds = new Set(match.hatTrickPlayerIds ?? []);
  // Admins manage hat-tricks on Halls Head bowlers (real players only).
  const hhBowlers = match.lines.filter((l) => l.bowled && l.playerId < 90000);

  return (
    <div className="space-y-6">
      <Link href="/matches" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
        <ChevronLeft className="h-4 w-4" /> All matches
      </Link>

      {/* Header */}
      <div className="bg-card border border-border rounded-md p-5 shadow-sm">
        <div className="flex items-start gap-4">
          <GradeBadge grade={match.grade} size="lg" />
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-serif font-bold text-primary flex items-center gap-2.5 flex-wrap">
              <span>Halls Head vs {match.opponent ?? "Unknown"}</span>
              <OpponentCrest club={match.opponentClub} size={32} />
            </h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground uppercase tracking-wider mt-0.5">
              <span>
                {match.grade} · {fmtSeason(match.season)}
                {!editingRound && matchLabel(match.round, match.stage)
                  ? ` · ${matchLabel(match.round, match.stage)}`
                  : ""}
              </span>
              {isAdmin && !editingRound && (
                <button
                  type="button"
                  onClick={startEditRound}
                  className="inline-flex items-center gap-1 normal-case text-xs font-medium text-primary hover:underline"
                  data-testid="button-edit-round"
                >
                  <Pencil className="h-3 w-3" />
                  {match.round != null || match.stage ? "Edit round/stage" : "Set round/stage"}
                </button>
              )}
              {isAdmin && editingRound && (
                <span className="inline-flex items-center gap-1.5 normal-case">
                  <span className="text-foreground">· Round</span>
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
                    className="w-16 px-2 py-0.5 rounded border border-border bg-background text-foreground text-sm disabled:opacity-50"
                    data-testid="input-round"
                  />
                  <span className="text-foreground">or final</span>
                  <select
                    value={stageValue}
                    onChange={(e) => {
                      setStageValue(e.target.value);
                      if (e.target.value) setRoundValue("");
                    }}
                    disabled={updateRound.isPending}
                    className="px-2 py-0.5 rounded border border-border bg-background text-foreground text-sm"
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
                    className="inline-flex items-center gap-1 text-xs font-medium text-green-700 hover:underline disabled:opacity-50"
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
                </span>
              )}
            </div>
            {isAdmin && roundError && (
              <div className="text-xs text-destructive normal-case mt-1" data-testid="text-round-error">
                {roundError}
              </div>
            )}
            {match.competition && (
              <div className="text-xs text-muted-foreground mt-0.5">{match.competition}</div>
            )}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground mt-2">
              {fmtDate(match.matchDate) && (
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="h-3.5 w-3.5" /> {fmtDate(match.matchDate)}
                </span>
              )}
              {match.venue && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" /> {match.venue}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            {match.abandoned && (
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-500/15 border border-amber-600/40 rounded px-2 py-0.5">
                Abandoned
              </span>
            )}
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
              data-testid="button-share-match"
            >
              <Share2 className="h-3.5 w-3.5" /> Share
            </button>
          </div>
        </div>
        {(match.result || match.hhccScore || match.opponentScore) && (
          <div className="mt-4 pt-4 border-t border-border flex flex-wrap items-center gap-4">
            {match.result && (
              <div className="font-semibold text-foreground/90">{match.result}</div>
            )}
            <div className="flex items-center gap-4 ml-auto font-mono text-sm">
              {match.hhccScore && (
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Halls Head</div>
                  <div className="font-bold text-primary text-lg">{match.hhccScore}</div>
                </div>
              )}
              {match.opponentScore && (
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground truncate max-w-[10rem]">{match.opponent ?? "Opponent"}</div>
                  <div className="font-bold text-foreground text-lg">{match.opponentScore}</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Branded digital scorecard */}
      <DigitalScorecard match={match} hatTrickIds={hatTrickIds} />

      {/* Admin: hat-trick management */}
      {isAdmin && hhBowlers.length > 0 && (
        <div className="bg-card border border-border rounded-md p-5 shadow-sm">
          <h2 className="text-sm font-serif font-bold text-primary flex items-center gap-1.5">
            <Flame className="h-4 w-4" /> Hat-tricks
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5 mb-3">
            Mark any Halls Head bowler who took a hat-trick in this match.
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

      <ShareCardModal
        open={shareOpen}
        onOpenChange={setShareOpen}
        input={shareOpen ? matchToSummaryInput(match) : null}
        engine="ondemand"
        appPath={`/matches/${matchId}`}
        playerId={null}
      />
    </div>
  );
}

type OpponentClubInfo = MatchDetailDto["opponentClub"];

// Branded opposition crest. Renders the club logo when one is matched, falling
// back silently to nothing (the opponent name is always shown separately).
function OpponentCrest({
  club,
  size = 28,
}: {
  club: OpponentClubInfo;
  size?: number;
}) {
  const [errored, setErrored] = useState(false);
  const src = club?.logoUrl128 || club?.logoUrl;
  if (!club || !src || errored) return null;
  return (
    <img
      src={src}
      alt={`${club.name} logo`}
      title={club.name}
      width={size}
      height={size}
      onError={() => setErrored(true)}
      className="inline-block rounded-sm object-contain bg-white/90 p-0.5 shadow-sm"
      style={{ width: size, height: size }}
      data-testid="img-opponent-crest"
    />
  );
}
