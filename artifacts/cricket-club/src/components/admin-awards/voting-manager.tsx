import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAwardVotingConfigs,
  useUpsertAwardVotingConfig,
  useUpdateAwardVotingConfig,
  useDeleteAwardVotingConfig,
  useGetVotingConfigTally,
  useListVotingConfigBallots,
  useUpdateConfigBallot,
  useDeleteConfigBallot,
  useFinaliseVotingConfig,
  getListAwardVotingConfigsQueryKey,
  getGetVotingConfigTallyQueryKey,
  getListVotingConfigBallotsQueryKey,
} from "@workspace/api-client-react";
import type { Award, AwardVotingConfig } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { LoadingState, QueryError } from "@/components/data-states";
import { useConfirm } from "@/components/confirm-dialog";
import { PlayerTypeahead, type SelectedPlayer } from "@/components/player-typeahead";
import { GRADES } from "./constants";
import { formatSeasonRange, splitName, invalidateBallotsAndTally } from "./helpers";

export function VotingManager({
  award,
  onAwardChanged,
}: {
  award: Award;
  onAwardChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: configs, isLoading, isError, refetch } =
    useListAwardVotingConfigs(award.id);
  const upsert = useUpsertAwardVotingConfig();
  const [showNew, setShowNew] = useState(false);
  const [season, setSeason] = useState(new Date().getFullYear());
  const [error, setError] = useState<string | null>(null);

  const invalidateConfigs = () =>
    queryClient.invalidateQueries({
      queryKey: getListAwardVotingConfigsQueryKey(award.id),
    });

  const sorted = [...(configs ?? [])].sort((a, b) => b.season - a.season);

  return (
    <div className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold uppercase tracking-wide text-primary">
          3-2-1 voting
        </h4>
        <Button
          size="sm"
          variant={showNew ? "outline" : "secondary"}
          onClick={() => setShowNew((v) => !v)}
        >
          {showNew ? "Cancel" : "Add a season"}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {showNew && (
        <div className="flex items-end gap-3 rounded-md border border-border bg-background p-3">
          <div className="space-y-1">
            <Label className="text-xs">Season (start year)</Label>
            <Input
              type="number"
              className="w-32"
              value={season}
              onChange={(e) => setSeason(parseInt(e.target.value, 10) || 0)}
            />
          </div>
          <Button
            size="sm"
            disabled={upsert.isPending}
            onClick={() => {
              setError(null);
              upsert.mutate(
                {
                  id: award.id,
                  data: { season, grades: [], votingEnabled: true, votingOpen: true },
                },
                {
                  onSuccess: () => {
                    setShowNew(false);
                    invalidateConfigs();
                    onAwardChanged();
                  },
                  onError: (e) => {
                    const msg = handleAdminMutationError(e);
                    if (msg) setError(msg);
                  },
                },
              );
            }}
          >
            {upsert.isPending ? "Adding…" : "Add season"}
          </Button>
        </div>
      )}

      {isLoading ? (
        <LoadingState label="Loading voting…" className="py-4" />
      ) : isError ? (
        <QueryError
          message="We couldn’t load voting seasons. Please try again."
          onRetry={() => refetch()}
        />
      ) : sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          No voting seasons configured. Add a season to let captains vote 3-2-1
          each round.
        </p>
      ) : (
        <div className="space-y-3">
          {sorted.map((config) => (
            <VotingConfigCard
              key={config.id}
              award={award}
              config={config}
              onChanged={() => {
                invalidateConfigs();
                onAwardChanged();
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function VotingConfigCard({
  award,
  config,
  onChanged,
}: {
  award: Award;
  config: AwardVotingConfig;
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const update = useUpdateAwardVotingConfig();
  const remove = useDeleteAwardVotingConfig();
  const finalise = useFinaliseVotingConfig();
  const confirm = useConfirm();
  const [grades, setGrades] = useState<string[]>(config.grades);
  const [autoHide, setAutoHide] = useState<string>(
    config.autoHideAfterRounds != null ? String(config.autoHideAfterRounds) : "",
  );
  const [showTally, setShowTally] = useState(false);
  const [showBallots, setShowBallots] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finalised = config.finalisedAt != null;

  const onError = (e: unknown) => {
    const msg = handleAdminMutationError(e);
    if (msg) setError(msg);
  };

  const patch = (data: Parameters<typeof update.mutate>[0]["data"]) => {
    setError(null);
    update.mutate(
      { id: config.id, data },
      { onSuccess: onChanged, onError },
    );
  };

  const toggleGrade = (g: string) => {
    const next = grades.includes(g) ? grades.filter((x) => x !== g) : [...grades, g];
    setGrades(next);
    patch({ grades: next });
  };

  return (
    <div className="rounded-md border border-border bg-background p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold">
            {formatSeasonRange(config.season)}
            {finalised && (
              <span className="ml-2 text-xs font-normal rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 px-2 py-0.5">
                Finalised
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {config.votingOpen ? "Voting open" : "Voting closed"} ·{" "}
            {config.tallyVisible ? "Tally public" : "Tally hidden"}
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={remove.isPending}
          onClick={async () => {
            if (
              !(await confirm({
                title: "Delete voting season?",
                description: `Delete voting for ${formatSeasonRange(config.season)}? All ballots will be removed.`,
                confirmText: "Delete",
                destructive: true,
              }))
            )
              return;
            setError(null);
            remove.mutate({ id: config.id }, { onSuccess: onChanged, onError });
          }}
        >
          Delete
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="space-y-2">
        <Label className="text-xs">Grades tracked for this award</Label>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
          {GRADES.map((g) => (
            <label key={g} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={grades.includes(g)}
                onChange={() => toggleGrade(g)}
                disabled={update.isPending}
              />
              {g}
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={config.votingOpen}
            onChange={(e) => patch({ votingOpen: e.target.checked })}
            disabled={update.isPending}
          />
          Voting open
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={config.tallyVisible}
            onChange={(e) => patch({ tallyVisible: e.target.checked })}
            disabled={update.isPending}
          />
          Show live tally publicly
        </label>
        <div className="flex items-center gap-2 text-sm">
          <span>Auto-hide after</span>
          <Input
            type="number"
            className="w-20 h-8"
            value={autoHide}
            placeholder="—"
            onChange={(e) => setAutoHide(e.target.value)}
            onBlur={() =>
              patch({
                autoHideAfterRounds: autoHide === "" ? null : parseInt(autoHide, 10) || null,
              })
            }
          />
          <span>rounds</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setShowTally((v) => !v);
            if (!showTally)
              queryClient.invalidateQueries({
                queryKey: getGetVotingConfigTallyQueryKey(config.id),
              });
          }}
        >
          {showTally ? "Hide tally" : "View live tally"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setShowBallots((v) => !v);
            if (!showBallots)
              queryClient.invalidateQueries({
                queryKey: getListVotingConfigBallotsQueryKey(config.id),
              });
          }}
        >
          {showBallots ? "Hide ballots" : "Review ballots"}
        </Button>
        <Button
          size="sm"
          disabled={finalise.isPending}
          onClick={async () => {
            if (
              !(await confirm({
                title: "Finalise voting?",
                description: `Finalise ${award.title} ${formatSeasonRange(config.season)}? The current leader(s) will be recorded as the winner(s) and voting will close.`,
                confirmText: "Finalise",
              }))
            )
              return;
            setError(null);
            finalise.mutate(
              { id: config.id },
              { onSuccess: onChanged, onError },
            );
          }}
        >
          {finalise.isPending ? "Finalising…" : finalised ? "Re-finalise" : "Finalise winner(s)"}
        </Button>
      </div>

      {showTally && <TallyView configId={config.id} />}
      {showBallots && <BallotsView configId={config.id} finalised={finalised} />}
    </div>
  );
}

function TallyView({ configId }: { configId: number }) {
  const { data, isLoading, isError, refetch } = useGetVotingConfigTally(configId);
  if (isLoading) return <LoadingState label="Loading tally…" className="py-4" />;
  if (isError)
    return (
      <QueryError
        message="We couldn’t load the tally. Please try again."
        onRetry={() => refetch()}
      />
    );
  if (!data || data.entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">
        No votes submitted yet.
      </p>
    );
  }
  const winners = new Set(data.winnerPlayerIds);
  return (
    <div className="rounded-md border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="text-left px-3 py-2">Player</th>
            <th className="text-right px-3 py-2">Pts</th>
            <th className="text-right px-3 py-2">3s</th>
            <th className="text-right px-3 py-2">2s</th>
            <th className="text-right px-3 py-2">1s</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.entries.map((e) => (
            <tr key={e.playerId} className={winners.has(e.playerId) ? "bg-primary/10" : ""}>
              <td className="px-3 py-2 font-medium">
                {e.name}
                {winners.has(e.playerId) && (
                  <span className="ml-2 text-xs text-primary">● leader</span>
                )}
              </td>
              <td className="px-3 py-2 text-right font-bold">{e.points}</td>
              <td className="px-3 py-2 text-right text-muted-foreground">{e.firstPlaces}</td>
              <td className="px-3 py-2 text-right text-muted-foreground">{e.secondPlaces}</td>
              <td className="px-3 py-2 text-right text-muted-foreground">{e.thirdPlaces}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BallotsView({ configId, finalised }: { configId: number; finalised: boolean }) {
  const { data, isLoading, isError, refetch } = useListVotingConfigBallots(configId);
  const [editingId, setEditingId] = useState<number | null>(null);
  if (isLoading) return <LoadingState label="Loading ballots…" className="py-4" />;
  if (isError)
    return (
      <QueryError
        message="We couldn’t load ballots. Please try again."
        onRetry={() => refetch()}
      />
    );
  if (!data || data.length === 0) {
    return <p className="text-sm text-muted-foreground italic">No ballots submitted yet.</p>;
  }
  return (
    <div className="rounded-md border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="text-left px-3 py-2">Captain</th>
            <th className="text-left px-3 py-2">Grade</th>
            <th className="text-right px-3 py-2">Rd</th>
            <th className="text-left px-3 py-2">3 / 2 / 1</th>
            {!finalised && <th className="px-3 py-2" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.map((b) =>
            editingId === b.id ? (
              <BallotEditRow
                key={b.id}
                configId={configId}
                ballot={b}
                onClose={() => setEditingId(null)}
              />
            ) : (
              <tr key={b.id}>
                <td className="px-3 py-2">{b.captainName}</td>
                <td className="px-3 py-2">{b.grade}</td>
                <td className="px-3 py-2 text-right">{b.round}</td>
                <td className="px-3 py-2">
                  {b.pick1Name} / {b.pick2Name} / {b.pick3Name}
                </td>
                {!finalised && (
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <Button
                      size="sm"
                      variant="outline"
                      className="mr-2"
                      onClick={() => setEditingId(b.id)}
                    >
                      Edit
                    </Button>
                    <ClearBallotButton configId={configId} ballotId={b.id} />
                  </td>
                )}
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}

function ClearBallotButton({
  configId,
  ballotId,
}: {
  configId: number;
  ballotId: number;
}) {
  const queryClient = useQueryClient();
  const remove = useDeleteConfigBallot();
  const confirm = useConfirm();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={remove.isPending}
      onClick={async () => {
        if (
          !(await confirm({
            title: "Clear ballot?",
            description: "Clear this captain's ballot for this round?",
            confirmText: "Clear",
            destructive: true,
          }))
        )
          return;
        remove.mutate(
          { id: configId, ballotId },
          {
            onSuccess: () => invalidateBallotsAndTally(queryClient, configId),
            onError: (e) => {
              const msg = handleAdminMutationError(e);
              if (msg) alert(msg);
            },
          },
        );
      }}
    >
      Clear
    </Button>
  );
}

function BallotEditRow({
  configId,
  ballot,
  onClose,
}: {
  configId: number;
  ballot: {
    id: number;
    captainName: string;
    grade: string;
    round: number;
    pick1PlayerId: number;
    pick2PlayerId: number;
    pick3PlayerId: number;
    pick1Name: string;
    pick2Name: string;
    pick3Name: string;
  };
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const update = useUpdateConfigBallot();
  const [pick1, setPick1] = useState<SelectedPlayer | null>(
    splitName(ballot.pick1PlayerId, ballot.pick1Name),
  );
  const [pick2, setPick2] = useState<SelectedPlayer | null>(
    splitName(ballot.pick2PlayerId, ballot.pick2Name),
  );
  const [pick3, setPick3] = useState<SelectedPlayer | null>(
    splitName(ballot.pick3PlayerId, ballot.pick3Name),
  );
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    setError(null);
    if (!pick1 || !pick2 || !pick3) {
      setError("Pick three players.");
      return;
    }
    if (new Set([pick1.id, pick2.id, pick3.id]).size !== 3) {
      setError("The three picks must be different players.");
      return;
    }
    update.mutate(
      {
        id: configId,
        ballotId: ballot.id,
        data: {
          pick1PlayerId: pick1.id,
          pick2PlayerId: pick2.id,
          pick3PlayerId: pick3.id,
        },
      },
      {
        onSuccess: () => {
          invalidateBallotsAndTally(queryClient, configId);
          onClose();
        },
        onError: (e) => {
          const msg = handleAdminMutationError(e);
          if (msg) setError(msg);
        },
      },
    );
  };

  return (
    <tr>
      <td className="px-3 py-2 align-top">{ballot.captainName}</td>
      <td className="px-3 py-2 align-top">{ballot.grade}</td>
      <td className="px-3 py-2 text-right align-top">{ballot.round}</td>
      <td className="px-3 py-2" colSpan={2}>
        <div className="space-y-2">
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs">3 votes</Label>
              <PlayerTypeahead value={pick1} onChange={setPick1} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">2 votes</Label>
              <PlayerTypeahead value={pick2} onChange={setPick2} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">1 vote</Label>
              <PlayerTypeahead value={pick3} onChange={setPick3} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Picks must be players who played that match.
          </p>
          <div className="flex gap-2">
            <Button size="sm" disabled={update.isPending} onClick={save}>
              {update.isPending ? "Saving…" : "Save ballot"}
            </Button>
            <Button size="sm" variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </div>
      </td>
    </tr>
  );
}
