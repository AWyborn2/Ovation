import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetJuniorsFilters,
  useListJuniorMatches,
  getListJuniorMatchesQueryKey,
  useGetJuniorMatch,
  getGetJuniorMatchQueryKey,
  useUpdateJuniorMatch,
  useCreateJuniorBattingLine,
  useUpdateJuniorBattingLine,
  useDeleteJuniorBattingLine,
  useCreateJuniorBowlingLine,
  useUpdateJuniorBowlingLine,
  useDeleteJuniorBowlingLine,
  useAddJuniorRosterEntry,
  useRemoveJuniorRosterEntry,
  useListJuniorStatCorrections,
  getListJuniorStatCorrectionsQueryKey,
  useRevertJuniorStatCorrection,
  getListJuniorPlayersQueryKey,
  getListJuniorLeaderboardQueryKey,
  getGetJuniorLeaderboardsQueryKey,
  type JuniorMatchDetail,
  type JuniorBattingLine,
  type JuniorBowlingLine,
  type JuniorStatCorrection,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { handleAdminMutationError } from "@/lib/admin-auth";
import {
  JuniorPlayerTypeahead,
  type SelectedJuniorPlayer,
} from "@/components/junior-player-typeahead";
import { ListSkeleton, QueryError, EmptyState, LoadingState } from "@/components/data-states";
import { useConfirm } from "@/components/confirm-dialog";
import { fmtJuniorDate } from "@/lib/juniors";
import { useClubShortName } from "@/lib/brand-context";

/**
 * Admin editor for junior scorecards. Junior stats are loaded read-only from
 * PlayHQ exports, so this page is the only place source errors can be fixed:
 * match metadata, batting/bowling line figures, player attribution, missing or
 * duplicate lines, and roster membership. Every edit is journalled server-side
 * (junior_stat_corrections) so it survives a juniors data reload, and the
 * journal panel below the editor lets admins review + revert past edits.
 * All derived junior aggregates recompute automatically because they are
 * computed live from the line tables.
 */

/** Parse an <input> string to int-or-null (empty = null). */
function intOrNull(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function numOrNull(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const str = (v: number | null | undefined): string => (v == null ? "" : String(v));

export default function AdminJuniorStats() {
  const initialMatchId = useMemo(() => {
    const raw = new URLSearchParams(window.location.search).get("matchId");
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  }, []);

  const [season, setSeason] = useState("");
  const [ageGroup, setAgeGroup] = useState("");
  const [matchId, setMatchId] = useState<number | null>(initialMatchId);

  const { data: filters } = useGetJuniorsFilters();

  const listParams = {
    season: season || undefined,
    ageGroup: ageGroup || undefined,
  };
  const {
    data: matches,
    isLoading,
    isError,
    refetch,
  } = useListJuniorMatches(listParams, {
    query: {
      enabled: matchId == null,
      queryKey: getListJuniorMatchesQueryKey(listParams),
    },
  });

  if (matchId != null) {
    return <JuniorMatchEditor matchId={matchId} onBack={() => setMatchId(null)} />;
  }

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground">
        Fix errors in the junior scorecard data — match details, batting and
        bowling figures, player attribution and match rosters. Every change is
        journalled and survives a juniors data reload.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Label className="text-xs uppercase tracking-wider">Season</Label>
          <select
            value={season}
            onChange={(e) => setSeason(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">All seasons</option>
            {(filters?.seasons ?? []).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs uppercase tracking-wider">Age group</Label>
          <select
            value={ageGroup}
            onChange={(e) => setAgeGroup(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">All age groups</option>
            {(filters?.ageGroups ?? []).map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <ListSkeleton rows={8} />
      ) : isError ? (
        <QueryError onRetry={() => refetch()} />
      ) : !matches?.length ? (
        <EmptyState
          title="No junior matches found"
          message="Try different season or age-group filters."
        />
      ) : (
        <div className="space-y-2">
          {matches.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMatchId(m.id)}
              className="w-full text-left bg-card border border-border rounded-md p-3 shadow-sm hover:border-primary transition-colors flex flex-wrap items-center gap-x-4 gap-y-1"
            >
              <span className="font-medium text-primary">
                vs {m.opponentName ?? "Unknown"}
              </span>
              <span className="text-xs text-muted-foreground uppercase tracking-wider">
                {m.season ?? ""}
                {m.ageGroup ? ` · ${m.ageGroup}` : ""}
                {m.round ? ` · ${m.round}` : ""}
              </span>
              {fmtJuniorDate(m.matchDate) && (
                <span className="text-xs text-muted-foreground">
                  {fmtJuniorDate(m.matchDate)}
                </span>
              )}
              <span className="ml-auto text-xs font-mono text-muted-foreground">
                {m.hhScore ?? "—"} vs {m.opponentScore ?? "—"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function JuniorMatchEditor({
  matchId,
  onBack,
}: {
  matchId: number;
  onBack: () => void;
}) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const {
    data: match,
    isLoading,
    isError,
    refetch,
  } = useGetJuniorMatch(matchId, {
    query: { queryKey: getGetJuniorMatchQueryKey(matchId) },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getGetJuniorMatchQueryKey(matchId) });
    qc.invalidateQueries({
      queryKey: getListJuniorStatCorrectionsQueryKey({ matchId }),
    });
    // Junior aggregates are computed live from the line tables, so any list or
    // leaderboard the visitor has cached must refetch.
    qc.invalidateQueries({ queryKey: getListJuniorPlayersQueryKey() });
    qc.invalidateQueries({ queryKey: getListJuniorLeaderboardQueryKey() });
    qc.invalidateQueries({ queryKey: getGetJuniorLeaderboardsQueryKey() });
  };
  const onErr = (e: unknown) => setError(handleAdminMutationError(e));

  return (
    <div className="space-y-6">
      <Button size="sm" variant="outline" onClick={onBack}>
        ← Back to match list
      </Button>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {isLoading ? (
        <LoadingState label="Loading match…" />
      ) : isError ? (
        <QueryError onRetry={() => refetch()} />
      ) : !match ? (
        <EmptyState title="Match not found" message="This junior match doesn't exist." />
      ) : (
        <>
          <div>
            <h2 className="text-xl font-serif font-bold text-primary">
              vs {match.opponentName ?? "Unknown"}
            </h2>
            <div className="text-sm text-muted-foreground">
              {match.season ?? ""}
              {match.ageGroup ? ` · ${match.ageGroup}` : ""}
              {match.round ? ` · ${match.round}` : ""}
            </div>
          </div>

          <MatchMetaForm
            match={match}
            onSaved={invalidate}
            onError={onErr}
            clearError={() => setError(null)}
          />

          {match.innings.map((inn) => (
            <InningsEditor
              key={inn.innings}
              matchId={match.id}
              innings={inn.innings}
              battingTeam={inn.battingTeam}
              isHallsHeadBatting={inn.isHallsHead}
              batting={inn.batting}
              bowling={inn.bowling}
              onSaved={invalidate}
              onError={onErr}
              clearError={() => setError(null)}
            />
          ))}

          <RosterEditor
            match={match}
            onSaved={invalidate}
            onError={onErr}
            clearError={() => setError(null)}
          />

          <CorrectionsPanel
            matchId={match.id}
            onReverted={invalidate}
            onError={onErr}
            clearError={() => setError(null)}
          />
        </>
      )}
    </div>
  );
}

function MatchMetaForm({
  match,
  onSaved,
  onError,
  clearError,
}: {
  match: JuniorMatchDetail;
  onSaved: () => void;
  onError: (e: unknown) => void;
  clearError: () => void;
}) {
  const clubShort = useClubShortName();
  const update = useUpdateJuniorMatch();
  const [team1Score, setTeam1Score] = useState(match.team1Score ?? "");
  const [team2Score, setTeam2Score] = useState(match.team2Score ?? "");
  const [hhResult, setHhResult] = useState(match.hhResult ?? "");
  const [winner, setWinner] = useState(match.winner ?? "");
  const [tossWinner, setTossWinner] = useState(match.tossWinner ?? "");
  const [battedFirst, setBattedFirst] = useState(
    match.hhBattedFirst == null ? "" : match.hhBattedFirst ? "yes" : "no",
  );
  const [status, setStatus] = useState(match.status ?? "");
  const [matchDate, setMatchDate] = useState(match.matchDate ?? "");
  const [round, setRound] = useState(match.round ?? "");
  const [venue, setVenue] = useState(match.venue ?? "");

  const fields: {
    label: string;
    value: string;
    set: (v: string) => void;
    width?: string;
  }[] = [
    { label: `${match.team1 ?? "Team 1"} score`, value: team1Score, set: setTeam1Score },
    { label: `${match.team2 ?? "Team 2"} score`, value: team2Score, set: setTeam2Score },
    { label: `Result (${clubShort})`, value: hhResult, set: setHhResult },
    { label: "Winner", value: winner, set: setWinner },
    { label: "Toss winner", value: tossWinner, set: setTossWinner },
    { label: "Status", value: status, set: setStatus },
    { label: "Match date", value: matchDate, set: setMatchDate },
    { label: "Round", value: round, set: setRound },
    { label: "Venue", value: venue, set: setVenue },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Match details</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-end gap-3">
          {fields.map((f) => (
            <div key={f.label} className="space-y-1">
              <Label>{f.label}</Label>
              <Input
                value={f.value}
                onChange={(e) => f.set(e.target.value)}
                className="w-44"
              />
            </div>
          ))}
          <div className="space-y-1">
            <Label>{clubShort} batted first</Label>
            <select
              value={battedFirst}
              onChange={(e) => setBattedFirst(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">Unknown</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>
          <Button
            disabled={update.isPending}
            onClick={() => {
              clearError();
              update.mutate(
                {
                  id: match.id,
                  data: {
                    team1Score: team1Score.trim() === "" ? null : team1Score,
                    team2Score: team2Score.trim() === "" ? null : team2Score,
                    hhResult: hhResult.trim() === "" ? null : hhResult,
                    winner: winner.trim() === "" ? null : winner,
                    tossWinner: tossWinner.trim() === "" ? null : tossWinner,
                    hhBattedFirst:
                      battedFirst === "" ? null : battedFirst === "yes",
                    status: status.trim() === "" ? null : status,
                    matchDate: matchDate.trim() === "" ? null : matchDate,
                    round: round.trim() === "" ? null : round,
                    venue: venue.trim() === "" ? null : venue,
                  },
                },
                { onSuccess: onSaved, onError },
              );
            }}
          >
            {update.isPending ? "Saving…" : "Save match details"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function InningsEditor({
  matchId,
  innings,
  battingTeam,
  isHallsHeadBatting,
  batting,
  bowling,
  onSaved,
  onError,
  clearError,
}: {
  matchId: number;
  innings: number;
  battingTeam: string | null | undefined;
  isHallsHeadBatting: boolean;
  batting: JuniorBattingLine[];
  bowling: JuniorBowlingLine[];
  onSaved: () => void;
  onError: (e: unknown) => void;
  clearError: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Innings {innings} — {battingTeam ?? "Unknown"} batting
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <BattingTable
          matchId={matchId}
          innings={innings}
          lines={batting}
          canAdd={isHallsHeadBatting}
          onSaved={onSaved}
          onError={onError}
          clearError={clearError}
        />
        <BowlingTable
          matchId={matchId}
          innings={innings}
          lines={bowling}
          canAdd={!isHallsHeadBatting}
          onSaved={onSaved}
          onError={onError}
          clearError={clearError}
        />
      </CardContent>
    </Card>
  );
}

function BattingTable({
  matchId,
  innings,
  lines,
  canAdd,
  onSaved,
  onError,
  clearError,
}: {
  matchId: number;
  innings: number;
  lines: JuniorBattingLine[];
  canAdd: boolean;
  onSaved: () => void;
  onError: (e: unknown) => void;
  clearError: () => void;
}) {
  const confirm = useConfirm();
  const create = useCreateJuniorBattingLine();
  const update = useUpdateJuniorBattingLine();
  const del = useDeleteJuniorBattingLine();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const pending = create.isPending || update.isPending || del.isPending;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wider text-primary">Batting</h3>
        {canAdd && (
          <Button size="sm" variant="outline" onClick={() => setAdding((a) => !a)}>
            {adding ? "Close" : "Add batting line"}
          </Button>
        )}
      </div>

      {adding && (
        <AddBattingForm
          pending={create.isPending}
          onSubmit={(participantId, values) => {
            clearError();
            create.mutate(
              { matchId, data: { innings, participantId, ...values } },
              {
                onSuccess: () => {
                  setAdding(false);
                  onSaved();
                },
                onError,
              },
            );
          }}
        />
      )}

      {lines.length === 0 ? (
        <div className="text-sm text-muted-foreground italic">No batting lines.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-2 py-1.5">Batter</th>
                <th className="px-2 py-1.5 text-right">Runs</th>
                <th className="px-2 py-1.5 text-right">Balls</th>
                <th className="px-2 py-1.5 text-right">4s</th>
                <th className="px-2 py-1.5 text-right">6s</th>
                <th className="px-2 py-1.5">Dismissal</th>
                <th className="px-2 py-1.5 text-right">Order</th>
                <th className="px-2 py-1.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) =>
                editingId === l.id ? (
                  <BattingEditRow
                    key={l.id}
                    line={l}
                    pending={pending}
                    onCancel={() => setEditingId(null)}
                    onSave={(patch) => {
                      clearError();
                      update.mutate(
                        { matchId, lineId: l.id, data: patch },
                        {
                          onSuccess: () => {
                            setEditingId(null);
                            onSaved();
                          },
                          onError,
                        },
                      );
                    }}
                  />
                ) : (
                  <tr key={l.id} className="border-b last:border-0">
                    <td className="px-2 py-1.5">
                      {l.playerName}
                      {!l.isHallsHead && (
                        <span className="ml-2 text-[10px] uppercase text-muted-foreground">opposition</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono">{l.runs ?? "—"}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{l.balls ?? "—"}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{l.fours ?? "—"}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{l.sixes ?? "—"}</td>
                    <td className="px-2 py-1.5">{l.dismissal ?? "—"}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{l.batOrder ?? "—"}</td>
                    <td className="px-2 py-1.5 text-right">
                      <div className="inline-flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => setEditingId(l.id)}>
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={async () => {
                            if (
                              !(await confirm({
                                title: "Delete batting line?",
                                description: `Remove ${l.playerName}'s batting line from this innings? The change is journalled and can be reverted.`,
                                confirmText: "Delete",
                                destructive: true,
                              }))
                            )
                              return;
                            clearError();
                            del.mutate(
                              { matchId, lineId: l.id },
                              { onSuccess: onSaved, onError },
                            );
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function BattingEditRow({
  line,
  pending,
  onSave,
  onCancel,
}: {
  line: JuniorBattingLine;
  pending: boolean;
  onSave: (patch: {
    runs?: number | null;
    balls?: number | null;
    fours?: number | null;
    sixes?: number | null;
    dismissal?: string | null;
    batOrder?: number | null;
    participantId?: string;
  }) => void;
  onCancel: () => void;
}) {
  const [runs, setRuns] = useState(str(line.runs));
  const [balls, setBalls] = useState(str(line.balls));
  const [fours, setFours] = useState(str(line.fours));
  const [sixes, setSixes] = useState(str(line.sixes));
  const [dismissal, setDismissal] = useState(line.dismissal ?? "");
  const [batOrder, setBatOrder] = useState(str(line.batOrder));
  const [reattribute, setReattribute] = useState<SelectedJuniorPlayer | null>(null);

  return (
    <tr className="border-b last:border-0 bg-muted/30">
      <td className="px-2 py-1.5">
        {line.isHallsHead && !line.isPrivate ? (
          <div className="min-w-56">
            <JuniorPlayerTypeahead
              value={reattribute}
              onChange={setReattribute}
              placeholder={`${line.playerName} — search to re-attribute`}
            />
          </div>
        ) : (
          line.playerName
        )}
      </td>
      <td className="px-2 py-1.5 text-right">
        <Input value={runs} onChange={(e) => setRuns(e.target.value)} className="w-16 text-right" />
      </td>
      <td className="px-2 py-1.5 text-right">
        <Input value={balls} onChange={(e) => setBalls(e.target.value)} className="w-16 text-right" />
      </td>
      <td className="px-2 py-1.5 text-right">
        <Input value={fours} onChange={(e) => setFours(e.target.value)} className="w-14 text-right" />
      </td>
      <td className="px-2 py-1.5 text-right">
        <Input value={sixes} onChange={(e) => setSixes(e.target.value)} className="w-14 text-right" />
      </td>
      <td className="px-2 py-1.5">
        <Input value={dismissal} onChange={(e) => setDismissal(e.target.value)} className="w-40" />
      </td>
      <td className="px-2 py-1.5 text-right">
        <Input value={batOrder} onChange={(e) => setBatOrder(e.target.value)} className="w-14 text-right" />
      </td>
      <td className="px-2 py-1.5 text-right">
        <div className="inline-flex gap-1">
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              onSave({
                runs: intOrNull(runs),
                balls: intOrNull(balls),
                fours: intOrNull(fours),
                sixes: intOrNull(sixes),
                dismissal: dismissal.trim() === "" ? null : dismissal,
                batOrder: intOrNull(batOrder),
                ...(reattribute ? { participantId: reattribute.participantId } : {}),
              })
            }
          >
            Save
          </Button>
          <Button size="sm" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </td>
    </tr>
  );
}

function AddBattingForm({
  pending,
  onSubmit,
}: {
  pending: boolean;
  onSubmit: (
    participantId: string,
    values: {
      runs?: number | null;
      balls?: number | null;
      fours?: number | null;
      sixes?: number | null;
      dismissal?: string | null;
      batOrder?: number | null;
    },
  ) => void;
}) {
  const clubShort = useClubShortName();
  const [player, setPlayer] = useState<SelectedJuniorPlayer | null>(null);
  const [runs, setRuns] = useState("");
  const [balls, setBalls] = useState("");
  const [dismissal, setDismissal] = useState("");

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-md border border-border p-3">
      <div className="space-y-1 min-w-64">
        <Label>{clubShort} junior</Label>
        <JuniorPlayerTypeahead value={player} onChange={setPlayer} />
      </div>
      <div className="space-y-1">
        <Label>Runs</Label>
        <Input value={runs} onChange={(e) => setRuns(e.target.value)} className="w-20" />
      </div>
      <div className="space-y-1">
        <Label>Balls</Label>
        <Input value={balls} onChange={(e) => setBalls(e.target.value)} className="w-20" />
      </div>
      <div className="space-y-1">
        <Label>Dismissal</Label>
        <Input value={dismissal} onChange={(e) => setDismissal(e.target.value)} className="w-40" />
      </div>
      <Button
        disabled={pending || !player}
        onClick={() =>
          player &&
          onSubmit(player.participantId, {
            runs: intOrNull(runs),
            balls: intOrNull(balls),
            dismissal: dismissal.trim() === "" ? null : dismissal,
          })
        }
      >
        {pending ? "Adding…" : "Add"}
      </Button>
    </div>
  );
}

function BowlingTable({
  matchId,
  innings,
  lines,
  canAdd,
  onSaved,
  onError,
  clearError,
}: {
  matchId: number;
  innings: number;
  lines: JuniorBowlingLine[];
  canAdd: boolean;
  onSaved: () => void;
  onError: (e: unknown) => void;
  clearError: () => void;
}) {
  const confirm = useConfirm();
  const create = useCreateJuniorBowlingLine();
  const update = useUpdateJuniorBowlingLine();
  const del = useDeleteJuniorBowlingLine();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const pending = create.isPending || update.isPending || del.isPending;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wider text-primary">Bowling</h3>
        {canAdd && (
          <Button size="sm" variant="outline" onClick={() => setAdding((a) => !a)}>
            {adding ? "Close" : "Add bowling line"}
          </Button>
        )}
      </div>

      {adding && (
        <AddBowlingForm
          pending={create.isPending}
          onSubmit={(participantId, values) => {
            clearError();
            create.mutate(
              { matchId, data: { innings, participantId, ...values } },
              {
                onSuccess: () => {
                  setAdding(false);
                  onSaved();
                },
                onError,
              },
            );
          }}
        />
      )}

      {lines.length === 0 ? (
        <div className="text-sm text-muted-foreground italic">No bowling lines.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-2 py-1.5">Bowler</th>
                <th className="px-2 py-1.5 text-right">Overs</th>
                <th className="px-2 py-1.5 text-right">Mdns</th>
                <th className="px-2 py-1.5 text-right">Runs</th>
                <th className="px-2 py-1.5 text-right">Wkts</th>
                <th className="px-2 py-1.5 text-right">Wides</th>
                <th className="px-2 py-1.5 text-right">NBs</th>
                <th className="px-2 py-1.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) =>
                editingId === l.id ? (
                  <BowlingEditRow
                    key={l.id}
                    line={l}
                    pending={pending}
                    onCancel={() => setEditingId(null)}
                    onSave={(patch) => {
                      clearError();
                      update.mutate(
                        { matchId, lineId: l.id, data: patch },
                        {
                          onSuccess: () => {
                            setEditingId(null);
                            onSaved();
                          },
                          onError,
                        },
                      );
                    }}
                  />
                ) : (
                  <tr key={l.id} className="border-b last:border-0">
                    <td className="px-2 py-1.5">
                      {l.playerName}
                      {!l.isHallsHead && (
                        <span className="ml-2 text-[10px] uppercase text-muted-foreground">opposition</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono">{l.overs ?? "—"}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{l.maidens ?? "—"}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{l.runs ?? "—"}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{l.wickets ?? "—"}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{l.wides ?? "—"}</td>
                    <td className="px-2 py-1.5 text-right font-mono">{l.noBalls ?? "—"}</td>
                    <td className="px-2 py-1.5 text-right">
                      <div className="inline-flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => setEditingId(l.id)}>
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={async () => {
                            if (
                              !(await confirm({
                                title: "Delete bowling line?",
                                description: `Remove ${l.playerName}'s bowling line from this innings? The change is journalled and can be reverted.`,
                                confirmText: "Delete",
                                destructive: true,
                              }))
                            )
                              return;
                            clearError();
                            del.mutate(
                              { matchId, lineId: l.id },
                              { onSuccess: onSaved, onError },
                            );
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function BowlingEditRow({
  line,
  pending,
  onSave,
  onCancel,
}: {
  line: JuniorBowlingLine;
  pending: boolean;
  onSave: (patch: {
    overs?: number | null;
    maidens?: number | null;
    runs?: number | null;
    wickets?: number | null;
    wides?: number | null;
    noBalls?: number | null;
    participantId?: string;
  }) => void;
  onCancel: () => void;
}) {
  const [overs, setOvers] = useState(str(line.overs));
  const [maidens, setMaidens] = useState(str(line.maidens));
  const [runs, setRuns] = useState(str(line.runs));
  const [wickets, setWickets] = useState(str(line.wickets));
  const [wides, setWides] = useState(str(line.wides));
  const [noBalls, setNoBalls] = useState(str(line.noBalls));
  const [reattribute, setReattribute] = useState<SelectedJuniorPlayer | null>(null);

  return (
    <tr className="border-b last:border-0 bg-muted/30">
      <td className="px-2 py-1.5">
        {line.isHallsHead && !line.isPrivate ? (
          <div className="min-w-56">
            <JuniorPlayerTypeahead
              value={reattribute}
              onChange={setReattribute}
              placeholder={`${line.playerName} — search to re-attribute`}
            />
          </div>
        ) : (
          line.playerName
        )}
      </td>
      <td className="px-2 py-1.5 text-right">
        <Input
          value={overs}
          onChange={(e) => setOvers(e.target.value)}
          className="w-16 text-right"
          title="Ball notation, e.g. 3.4 = 3 overs 4 balls"
        />
      </td>
      <td className="px-2 py-1.5 text-right">
        <Input value={maidens} onChange={(e) => setMaidens(e.target.value)} className="w-14 text-right" />
      </td>
      <td className="px-2 py-1.5 text-right">
        <Input value={runs} onChange={(e) => setRuns(e.target.value)} className="w-16 text-right" />
      </td>
      <td className="px-2 py-1.5 text-right">
        <Input value={wickets} onChange={(e) => setWickets(e.target.value)} className="w-14 text-right" />
      </td>
      <td className="px-2 py-1.5 text-right">
        <Input value={wides} onChange={(e) => setWides(e.target.value)} className="w-14 text-right" />
      </td>
      <td className="px-2 py-1.5 text-right">
        <Input value={noBalls} onChange={(e) => setNoBalls(e.target.value)} className="w-14 text-right" />
      </td>
      <td className="px-2 py-1.5 text-right">
        <div className="inline-flex gap-1">
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              onSave({
                overs: numOrNull(overs),
                maidens: intOrNull(maidens),
                runs: intOrNull(runs),
                wickets: intOrNull(wickets),
                wides: intOrNull(wides),
                noBalls: intOrNull(noBalls),
                ...(reattribute ? { participantId: reattribute.participantId } : {}),
              })
            }
          >
            Save
          </Button>
          <Button size="sm" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </td>
    </tr>
  );
}

function AddBowlingForm({
  pending,
  onSubmit,
}: {
  pending: boolean;
  onSubmit: (
    participantId: string,
    values: {
      overs?: number | null;
      maidens?: number | null;
      runs?: number | null;
      wickets?: number | null;
      wides?: number | null;
      noBalls?: number | null;
    },
  ) => void;
}) {
  const clubShort = useClubShortName();
  const [player, setPlayer] = useState<SelectedJuniorPlayer | null>(null);
  const [overs, setOvers] = useState("");
  const [runs, setRuns] = useState("");
  const [wickets, setWickets] = useState("");

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-md border border-border p-3">
      <div className="space-y-1 min-w-64">
        <Label>{clubShort} junior</Label>
        <JuniorPlayerTypeahead value={player} onChange={setPlayer} />
      </div>
      <div className="space-y-1">
        <Label>Overs</Label>
        <Input
          value={overs}
          onChange={(e) => setOvers(e.target.value)}
          className="w-20"
          title="Ball notation, e.g. 3.4 = 3 overs 4 balls"
        />
      </div>
      <div className="space-y-1">
        <Label>Runs</Label>
        <Input value={runs} onChange={(e) => setRuns(e.target.value)} className="w-20" />
      </div>
      <div className="space-y-1">
        <Label>Wickets</Label>
        <Input value={wickets} onChange={(e) => setWickets(e.target.value)} className="w-20" />
      </div>
      <Button
        disabled={pending || !player}
        onClick={() =>
          player &&
          onSubmit(player.participantId, {
            overs: numOrNull(overs),
            runs: intOrNull(runs),
            wickets: intOrNull(wickets),
          })
        }
      >
        {pending ? "Adding…" : "Add"}
      </Button>
    </div>
  );
}

function RosterEditor({
  match,
  onSaved,
  onError,
  clearError,
}: {
  match: JuniorMatchDetail;
  onSaved: () => void;
  onError: (e: unknown) => void;
  clearError: () => void;
}) {
  const clubShort = useClubShortName();
  const confirm = useConfirm();
  const add = useAddJuniorRosterEntry();
  const remove = useRemoveJuniorRosterEntry();
  const [player, setPlayer] = useState<SelectedJuniorPlayer | null>(null);
  const hhRoster = match.rosters.filter((r) => r.isHallsHead);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{clubShort} roster</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          The roster is the canonical &ldquo;games played&rdquo; record — adding
          or removing a player here changes their junior games count everywhere.
        </p>
        {hhRoster.length === 0 ? (
          <div className="text-sm text-muted-foreground italic">No roster recorded.</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {hhRoster.map((r) => (
              <span
                key={r.id}
                className="inline-flex items-center gap-2 rounded-md border border-border px-2 py-1 text-sm"
              >
                {r.playerName}
                <button
                  type="button"
                  className="text-muted-foreground hover:text-destructive"
                  title="Remove from roster"
                  onClick={async () => {
                    if (
                      !(await confirm({
                        title: "Remove from roster?",
                        description: `Remove ${r.playerName} from this match roster? Their junior games count drops by one everywhere. The change is journalled and can be reverted.`,
                        confirmText: "Remove",
                        destructive: true,
                      }))
                    )
                      return;
                    clearError();
                    remove.mutate(
                      { matchId: match.id, lineId: r.id },
                      { onSuccess: onSaved, onError },
                    );
                  }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1 min-w-64">
            <Label>Add a junior to the roster</Label>
            <JuniorPlayerTypeahead value={player} onChange={setPlayer} />
          </div>
          <Button
            disabled={add.isPending || !player}
            onClick={() => {
              if (!player) return;
              clearError();
              add.mutate(
                { matchId: match.id, data: { participantId: player.participantId } },
                {
                  onSuccess: () => {
                    setPlayer(null);
                    onSaved();
                  },
                  onError,
                },
              );
            }}
          >
            {add.isPending ? "Adding…" : "Add"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function describeCorrection(c: JuniorStatCorrection): string {
  const table = c.targetTable.replace("junior_", "").replace(/_/g, " ");
  if (c.op === "insert") return `Added ${table} row`;
  if (c.op === "delete") return `Deleted ${table} row`;
  const cols = c.patch ? Object.keys(c.patch).join(", ") : "";
  return `Updated ${table}${cols ? ` (${cols})` : ""}`;
}

function CorrectionsPanel({
  matchId,
  onReverted,
  onError,
  clearError,
}: {
  matchId: number;
  onReverted: () => void;
  onError: (e: unknown) => void;
  clearError: () => void;
}) {
  const confirm = useConfirm();
  const { data: corrections, isLoading } = useListJuniorStatCorrections(
    { matchId },
    { query: { queryKey: getListJuniorStatCorrectionsQueryKey({ matchId }) } },
  );
  const revert = useRevertJuniorStatCorrection();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Corrections history</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Every admin edit to this match is journalled, survives a juniors data
          reload, and can be reverted (newest first).
        </p>
        {isLoading ? (
          <ListSkeleton rows={3} />
        ) : !corrections?.length ? (
          <div className="text-sm text-muted-foreground italic">
            No corrections recorded for this match.
          </div>
        ) : (
          <div className="space-y-1">
            {corrections.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
              >
                <span>
                  {describeCorrection(c)}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {new Date(c.createdAt).toLocaleString()}
                    {c.createdBy ? ` · ${c.createdBy}` : ""}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={revert.isPending}
                  onClick={async () => {
                    if (
                      !(await confirm({
                        title: "Revert correction?",
                        description: `${describeCorrection(c)} — restore the previous values?`,
                        confirmText: "Revert",
                        destructive: true,
                      }))
                    )
                      return;
                    clearError();
                    revert.mutate({ id: c.id }, { onSuccess: onReverted, onError });
                  }}
                >
                  Revert
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
