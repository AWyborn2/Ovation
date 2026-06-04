import { useParams, Link } from "wouter";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMatch,
  getGetMatchQueryKey,
  useUpdateMatchRound,
  useSetMatchHatTrick,
  MatchStage,
  type MatchScorecardLine,
  type MatchOppositionLine,
} from "@workspace/api-client-react";
import { useCurrentAdmin, handleAdminMutationError } from "@/lib/admin-auth";
import { GradeBadge } from "@/components/grade-badge";
import { matchLabel } from "@/lib/utils";
import { CalendarDays, MapPin, ChevronLeft, Pencil, Check, X, Flame } from "lucide-react";

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
  const { data: match, isLoading } = useGetMatch(matchId, {
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

  if (isLoading) return <div className="p-8 text-center">Loading...</div>;
  if (!match) return <div className="p-8 text-center text-muted-foreground">Match not found.</div>;

  const batting = match.lines
    .filter((l) => l.batted)
    .sort((a, b) => (a.battingPos ?? 99) - (b.battingPos ?? 99));
  const bowling = match.lines.filter((l) => l.bowled);
  const hatTrickIds = new Set(match.hatTrickPlayerIds ?? []);
  const fielding = match.lines.filter(
    (l) => (l.catches ?? 0) + (l.stumpings ?? 0) + (l.runOuts ?? 0) > 0,
  );

  const oppLines = match.oppositionLines ?? [];
  const oppBatting = oppLines
    .filter((l) => l.batted)
    .sort((a, b) => (a.battingPos ?? 99) - (b.battingPos ?? 99));
  const oppBowling = oppLines.filter((l) => l.bowled);
  const oppFielding = oppLines.filter(
    (l) => (l.catches ?? 0) + (l.stumpings ?? 0) + (l.runOuts ?? 0) > 0,
  );
  const hasOpposition = oppBatting.length + oppBowling.length + oppFielding.length > 0;

  const playerLink = (l: MatchScorecardLine) => (
    <Link href={`/players/${l.playerId}`} className="font-medium text-primary hover:underline">
      {l.givenName} {l.surname}
    </Link>
  );

  const oppName = (l: MatchOppositionLine) => (
    <span className="font-medium text-foreground">{l.name}</span>
  );

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
            <h1 className="text-2xl font-serif font-bold text-primary">
              Halls Head vs {match.opponent ?? "Unknown"}
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
          {match.abandoned && (
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-500/15 border border-amber-600/40 rounded px-2 py-0.5">
              Abandoned
            </span>
          )}
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

      {/* Halls Head innings */}
      <TeamHeading
        name="Halls Head"
        score={match.hhccScore}
        hidden={match.abandoned}
      />

      {/* Batting */}
      <ScorecardSection title="Batting">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <th className="text-left font-medium p-3">Batter</th>
              <th className="text-left font-medium p-3">Dismissal</th>
              <th className="text-right font-medium p-3">R</th>
              <th className="text-right font-medium p-3">B</th>
              <th className="text-right font-medium p-3">4s</th>
              <th className="text-right font-medium p-3">6s</th>
            </tr>
          </thead>
          <tbody>
            {batting.length === 0 ? (
              <tr><td colSpan={6} className="p-4 text-center text-muted-foreground italic">No batting recorded.</td></tr>
            ) : (
              batting.map((l) => (
                <tr key={l.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                  <td className="p-3">{playerLink(l)}{l.notOut && <span className="text-primary font-bold"> *</span>}</td>
                  <td className="p-3 text-muted-foreground">{l.dismissal || "—"}</td>
                  <td className="p-3 text-right font-mono font-bold">{l.runs ?? 0}</td>
                  <td className="p-3 text-right font-mono">{l.balls ?? "—"}</td>
                  <td className="p-3 text-right font-mono">{l.fours ?? "—"}</td>
                  <td className="p-3 text-right font-mono">{l.sixes ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </ScorecardSection>

      {/* Bowling */}
      <ScorecardSection title="Bowling">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <th className="text-left font-medium p-3">Bowler</th>
              <th className="text-right font-medium p-3">O</th>
              <th className="text-right font-medium p-3">M</th>
              <th className="text-right font-medium p-3">R</th>
              <th className="text-right font-medium p-3">W</th>
              <th className="text-right font-medium p-3">Wd</th>
              <th className="text-right font-medium p-3">Nb</th>
              {isAdmin && <th className="text-right font-medium p-3">Hat-trick</th>}
            </tr>
          </thead>
          <tbody>
            {bowling.length === 0 ? (
              <tr><td colSpan={isAdmin ? 8 : 7} className="p-4 text-center text-muted-foreground italic">No bowling recorded.</td></tr>
            ) : (
              bowling.map((l) => {
                const hasHatTrick = hatTrickIds.has(l.playerId);
                return (
                  <tr key={l.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="p-3">
                      <span className="inline-flex items-center gap-1.5">
                        {playerLink(l)}
                        {hasHatTrick && (
                          <span
                            title="Hat-trick"
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-300 bg-rose-500/10 border border-rose-500/30"
                          >
                            <Flame className="h-3 w-3" />
                            Hat-trick
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="p-3 text-right font-mono">{l.overs || "—"}</td>
                    <td className="p-3 text-right font-mono">{l.maidens ?? "—"}</td>
                    <td className="p-3 text-right font-mono">{l.runsConceded ?? "—"}</td>
                    <td className="p-3 text-right font-mono font-bold">{l.wickets ?? 0}</td>
                    <td className="p-3 text-right font-mono">{l.wides ?? "—"}</td>
                    <td className="p-3 text-right font-mono">{l.noBalls ?? "—"}</td>
                    {isAdmin && (
                      <td className="p-3 text-right">
                        <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs">
                          <input
                            type="checkbox"
                            checked={hasHatTrick}
                            disabled={setHatTrick.isPending}
                            onChange={(e) =>
                              setHatTrick.mutate({
                                id: matchId,
                                data: { playerId: l.playerId, hatTrick: e.target.checked },
                              })
                            }
                          />
                          <span className="text-muted-foreground">{hasHatTrick ? "Yes" : "No"}</span>
                        </label>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        {isAdmin && hatTrickError && (
          <div className="p-3 text-sm text-destructive">{hatTrickError}</div>
        )}
      </ScorecardSection>

      {/* Fielding */}
      {fielding.length > 0 && (
        <ScorecardSection title="Fielding">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                <th className="text-left font-medium p-3">Fielder</th>
                <th className="text-right font-medium p-3">Ct</th>
                <th className="text-right font-medium p-3">St</th>
                <th className="text-right font-medium p-3">RO</th>
              </tr>
            </thead>
            <tbody>
              {fielding.map((l) => (
                <tr key={l.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                  <td className="p-3">{playerLink(l)}</td>
                  <td className="p-3 text-right font-mono">{l.catches || "—"}</td>
                  <td className="p-3 text-right font-mono">{l.stumpings || "—"}</td>
                  <td className="p-3 text-right font-mono">{l.runOuts || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScorecardSection>
      )}

      {/* Opposition innings (display only — plain-text names) */}
      {hasOpposition && (
        <>
          <TeamHeading
            name={match.opponent ?? "Opposition"}
            score={match.opponentScore}
          />

          {oppBatting.length > 0 && (
            <ScorecardSection title="Batting">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="text-left font-medium p-3">Batter</th>
                    <th className="text-left font-medium p-3">Dismissal</th>
                    <th className="text-right font-medium p-3">R</th>
                    <th className="text-right font-medium p-3">B</th>
                    <th className="text-right font-medium p-3">4s</th>
                    <th className="text-right font-medium p-3">6s</th>
                  </tr>
                </thead>
                <tbody>
                  {oppBatting.map((l) => (
                    <tr key={l.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                      <td className="p-3">{oppName(l)}{l.notOut && <span className="text-primary font-bold"> *</span>}</td>
                      <td className="p-3 text-muted-foreground">{l.dismissal || "—"}</td>
                      <td className="p-3 text-right font-mono font-bold">{l.runs ?? 0}</td>
                      <td className="p-3 text-right font-mono">{l.balls ?? "—"}</td>
                      <td className="p-3 text-right font-mono">{l.fours ?? "—"}</td>
                      <td className="p-3 text-right font-mono">{l.sixes ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScorecardSection>
          )}

          {oppBowling.length > 0 && (
            <ScorecardSection title="Bowling">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="text-left font-medium p-3">Bowler</th>
                    <th className="text-right font-medium p-3">O</th>
                    <th className="text-right font-medium p-3">M</th>
                    <th className="text-right font-medium p-3">R</th>
                    <th className="text-right font-medium p-3">W</th>
                    <th className="text-right font-medium p-3">Wd</th>
                    <th className="text-right font-medium p-3">Nb</th>
                  </tr>
                </thead>
                <tbody>
                  {oppBowling.map((l) => (
                    <tr key={l.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                      <td className="p-3">{oppName(l)}</td>
                      <td className="p-3 text-right font-mono">{l.overs || "—"}</td>
                      <td className="p-3 text-right font-mono">{l.maidens ?? "—"}</td>
                      <td className="p-3 text-right font-mono">{l.runsConceded ?? "—"}</td>
                      <td className="p-3 text-right font-mono font-bold">{l.wickets ?? 0}</td>
                      <td className="p-3 text-right font-mono">{l.wides ?? "—"}</td>
                      <td className="p-3 text-right font-mono">{l.noBalls ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScorecardSection>
          )}

          {oppFielding.length > 0 && (
            <ScorecardSection title="Fielding">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="text-left font-medium p-3">Fielder</th>
                    <th className="text-right font-medium p-3">Ct</th>
                    <th className="text-right font-medium p-3">St</th>
                    <th className="text-right font-medium p-3">RO</th>
                  </tr>
                </thead>
                <tbody>
                  {oppFielding.map((l) => (
                    <tr key={l.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                      <td className="p-3">{oppName(l)}</td>
                      <td className="p-3 text-right font-mono">{l.catches || "—"}</td>
                      <td className="p-3 text-right font-mono">{l.stumpings || "—"}</td>
                      <td className="p-3 text-right font-mono">{l.runOuts || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScorecardSection>
          )}
        </>
      )}
    </div>
  );
}

function TeamHeading({
  name,
  score,
  hidden,
}: {
  name: string;
  score?: string | null;
  hidden?: boolean;
}) {
  if (hidden) return null;
  return (
    <div className="flex items-baseline justify-between gap-3 pt-2">
      <h2 className="text-xl font-serif font-bold text-foreground m-0">{name}</h2>
      {score && <span className="font-mono font-bold text-primary text-lg">{score}</span>}
    </div>
  );
}

function ScorecardSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-md p-5 shadow-sm">
      <h2 className="text-lg font-serif font-bold text-primary m-0">{title}</h2>
      <div className="w-12 h-[2px] bg-primary mt-1 mb-4" />
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}
