import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListJuniorPlayers,
  getListJuniorPlayersQueryKey,
  useUpdateJuniorParticipant,
  useSetJuniorSeniorLink,
  useClearJuniorSeniorLink,
  useMergeJuniorParticipant,
  useGetPlayer,
  getGetPlayerQueryKey,
  getGetJuniorPlayerQueryKey,
  getListJuniorLeaderboardQueryKey,
  getGetJuniorLeaderboardsQueryKey,
  getListJuniorMatchesQueryKey,
  type JuniorPlayerSummary,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { handleAdminMutationError } from "@/lib/admin-auth";
import {
  JuniorPlayerTypeahead,
  type SelectedJuniorPlayer,
} from "@/components/junior-player-typeahead";
import { PlayerTypeahead, type SelectedPlayer } from "@/components/player-typeahead";
import { ListSkeleton, QueryError, EmptyState } from "@/components/data-states";
import { useConfirm } from "@/components/confirm-dialog";

/**
 * Junior players admin: the identity-management home for junior participants.
 * Rename and privacy-flag a profile, manage the junior↔senior cross-link, and
 * MERGE duplicate profiles (PlayHQ sometimes minted two participant GUIDs for
 * the same child, splitting their record). Merges are permanent, reassign
 * every junior line to the keeper, and survive juniors data reloads via the
 * junior_participant_merges map; the absorbed profile's URL aliases to the
 * keeper. Junior and senior stats remain completely separate throughout.
 */
export default function AdminJuniorPlayers() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mergeFor, setMergeFor] = useState<JuniorPlayerSummary | null>(null);
  const [linkFor, setLinkFor] = useState<JuniorPlayerSummary | null>(null);

  const listParams = {
    search: search.trim() || undefined,
    includePrivate: true,
  };
  const { data, isLoading, isError, refetch } = useListJuniorPlayers(listParams, {
    query: { queryKey: getListJuniorPlayersQueryKey(listParams) },
  });

  const invalidateAll = () => {
    // Junior aggregates are computed live from the line tables, so a merge or
    // participant edit can change every junior surface.
    qc.invalidateQueries({ queryKey: getListJuniorPlayersQueryKey() });
    qc.invalidateQueries({ queryKey: getListJuniorLeaderboardQueryKey() });
    qc.invalidateQueries({ queryKey: getGetJuniorLeaderboardsQueryKey() });
    qc.invalidateQueries({ queryKey: getListJuniorMatchesQueryKey() });
  };
  const onErr = (e: unknown) => setError(handleAdminMutationError(e));

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground">
        Rename junior players, manage privacy and senior-profile links, and merge duplicate
        profiles. A merge moves every scorecard line and appearance onto the profile you keep, is
        permanent, and survives data reloads.
      </p>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card>
        <CardContent className="p-4 space-y-4">
          <Input
            placeholder="Search junior players by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-md"
          />
          {isLoading ? (
            <ListSkeleton rows={8} />
          ) : isError ? (
            <QueryError onRetry={() => refetch()} />
          ) : !data?.length ? (
            <EmptyState
              title="No junior players found"
              message={
                search ? "No junior players match your search." : "No junior players in the data."
              }
            />
          ) : (
            <div className="space-y-2">
              {data.map((p) => (
                <JuniorPlayerRow
                  key={p.participantId}
                  player={p}
                  clearError={() => setError(null)}
                  onError={onErr}
                  onChanged={invalidateAll}
                  onMerge={() => setMergeFor(p)}
                  onLink={() => setLinkFor(p)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {mergeFor && (
        <JuniorMergeDialog
          duplicate={mergeFor}
          onClose={() => setMergeFor(null)}
          onMerged={() => {
            setMergeFor(null);
            invalidateAll();
          }}
        />
      )}

      {linkFor && (
        <JuniorRowSeniorLinkDialog
          participant={linkFor}
          onClose={() => setLinkFor(null)}
          onChanged={invalidateAll}
        />
      )}
    </div>
  );
}

function JuniorPlayerRow({
  player,
  clearError,
  onError,
  onChanged,
  onMerge,
  onLink,
}: {
  player: JuniorPlayerSummary;
  clearError: () => void;
  onError: (e: unknown) => void;
  onChanged: () => void;
  onMerge: () => void;
  onLink: () => void;
}) {
  const confirm = useConfirm();
  const update = useUpdateJuniorParticipant();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(player.displayName);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-2 last:border-0">
      <div className="min-w-0">
        {editing ? (
          <div className="flex items-center gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} className="w-56" />
            <Button
              size="sm"
              disabled={update.isPending || !name.trim()}
              onClick={() => {
                clearError();
                update.mutate(
                  { id: player.participantId, data: { displayName: name.trim() } },
                  {
                    onSuccess: () => {
                      setEditing(false);
                      onChanged();
                    },
                    onError,
                  },
                );
              }}
            >
              Save
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditing(false);
                setName(player.displayName);
              }}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <>
            <span className="font-medium">{player.displayName}</span>
            {player.isPrivate && (
              <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-destructive border border-destructive/40 rounded px-1.5 py-0.5">
                Private
              </span>
            )}
            {player.seniorPlayerId != null && (
              <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-primary border border-primary/40 rounded px-1.5 py-0.5">
                Senior linked
              </span>
            )}
            <span className="ml-3 text-xs text-muted-foreground">
              {player.firstSeason ?? ""}
              {player.lastSeason && player.lastSeason !== player.firstSeason
                ? ` – ${player.lastSeason}`
                : ""}
              {" · "}
              {player.matches ?? 0}g · {player.runs ?? 0}r · {player.wickets ?? 0}w
            </span>
          </>
        )}
      </div>
      {!editing && (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            Rename
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={update.isPending}
            onClick={async () => {
              const makingPrivate = !player.isPrivate;
              if (
                !(await confirm({
                  title: makingPrivate ? "Make player private?" : "Make player public?",
                  description: makingPrivate
                    ? `${player.displayName} will be hidden from every public junior page (scorecard lines are masked, directory/leaderboard entries removed).`
                    : `${player.displayName} will appear on public junior pages again.`,
                  confirmText: makingPrivate ? "Make private" : "Make public",
                  destructive: makingPrivate,
                }))
              )
                return;
              clearError();
              update.mutate(
                { id: player.participantId, data: { isPrivate: makingPrivate } },
                { onSuccess: onChanged, onError },
              );
            }}
          >
            {player.isPrivate ? "Make public" : "Make private"}
          </Button>
          <Button size="sm" variant="outline" onClick={onLink}>
            Senior link…
          </Button>
          <Button size="sm" variant="outline" onClick={onMerge}>
            Merge…
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Merge a duplicate junior profile into a keeper. Permanent by design (senior
 * merge parity): every line moves onto the keeper and the duplicate profile
 * is deleted; the merge is recorded so it survives juniors data reloads.
 */
function JuniorMergeDialog({
  duplicate,
  onClose,
  onMerged,
}: {
  duplicate: JuniorPlayerSummary;
  onClose: () => void;
  onMerged: () => void;
}) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const merge = useMergeJuniorParticipant();
  const [error, setError] = useState<string | null>(null);
  const [keeper, setKeeper] = useState<SelectedJuniorPlayer | null>(null);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg space-y-4">
        <DialogHeader>
          <DialogTitle>Merge duplicate junior profile</DialogTitle>
        </DialogHeader>
        <p className="text-sm">
          <strong>{duplicate.displayName}</strong> ({duplicate.matches ?? 0} games,{" "}
          {duplicate.runs ?? 0} runs, {duplicate.wickets ?? 0} wickets) will be absorbed into the
          keeper: every scorecard line and appearance moves onto the keeper, this profile is
          deleted, and its old link redirects to the keeper. <strong>This cannot be undone.</strong>
        </p>

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="space-y-1">
          <Label>Keeper (the profile to keep)</Label>
          <JuniorPlayerTypeahead value={keeper} onChange={setKeeper} />
        </div>

        <div className="flex gap-2">
          <Button
            disabled={
              merge.isPending || !keeper || keeper.participantId === duplicate.participantId
            }
            onClick={async () => {
              if (!keeper) return;
              if (
                !(await confirm({
                  title: "Merge profiles permanently?",
                  description: `${duplicate.displayName}'s ${duplicate.matches ?? 0} games will be moved onto ${keeper.displayName} and ${duplicate.displayName}'s profile deleted. This cannot be undone.`,
                  confirmText: "Merge",
                  destructive: true,
                }))
              )
                return;
              setError(null);
              merge.mutate(
                {
                  id: duplicate.participantId,
                  data: { keeperParticipantId: keeper.participantId },
                },
                {
                  onSuccess: () => {
                    qc.invalidateQueries({
                      queryKey: getGetJuniorPlayerQueryKey(keeper.participantId),
                    });
                    onMerged();
                  },
                  onError: (e) => setError(handleAdminMutationError(e)),
                },
              );
            }}
          >
            {merge.isPending ? "Merging…" : "Merge"}
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Junior-anchored senior-link control: set or clear THIS participant's senior
 * cross-link. (The senior players admin has the senior-anchored equivalent.)
 * Cross-reference only — junior and senior stats never combine.
 */
function JuniorRowSeniorLinkDialog({
  participant,
  onClose,
  onChanged,
}: {
  participant: JuniorPlayerSummary;
  onClose: () => void;
  onChanged: () => void;
}) {
  const confirm = useConfirm();
  const setLink = useSetJuniorSeniorLink();
  const clearLink = useClearJuniorSeniorLink();
  const [error, setError] = useState<string | null>(null);
  const [senior, setSenior] = useState<SelectedPlayer | null>(null);
  const currentSeniorId = participant.seniorPlayerId ?? null;

  const { data: currentSenior } = useGetPlayer(currentSeniorId ?? 0, {
    query: {
      enabled: currentSeniorId != null,
      queryKey: getGetPlayerQueryKey(currentSeniorId ?? 0),
    },
  });

  const onErr = (e: unknown) => setError(handleAdminMutationError(e));
  const busy = setLink.isPending || clearLink.isPending;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg space-y-4">
        <DialogHeader>
          <DialogTitle>Senior profile link</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Link <strong className="text-foreground">{participant.displayName}</strong> to their
          senior profile. Cross-reference only — junior and senior stats stay separate and are never
          combined.
        </p>

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="space-y-2">
          <Label>Current link</Label>
          {currentSeniorId == null ? (
            <div className="text-sm text-muted-foreground">No senior profile linked.</div>
          ) : (
            <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
              <span>
                {currentSenior
                  ? `${currentSenior.givenName} ${currentSenior.surname}`
                  : `Senior player #${currentSeniorId}`}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={async () => {
                  if (
                    !(await confirm({
                      title: "Unlink senior profile?",
                      description: `Remove ${participant.displayName}'s senior profile link? No stats are affected.`,
                      confirmText: "Unlink",
                      destructive: true,
                    }))
                  )
                    return;
                  setError(null);
                  clearLink.mutate(
                    { id: participant.participantId },
                    {
                      onSuccess: () => {
                        onChanged();
                        onClose();
                      },
                      onError: onErr,
                    },
                  );
                }}
              >
                Unlink
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-1">
          <Label>{currentSeniorId == null ? "Link a senior player" : "Replace with"}</Label>
          <PlayerTypeahead value={senior} onChange={setSenior} />
        </div>

        <div className="flex gap-2">
          <Button
            disabled={busy || !senior}
            onClick={() => {
              if (!senior) return;
              setError(null);
              setLink.mutate(
                {
                  id: participant.participantId,
                  data: { seniorPlayerId: senior.id },
                },
                {
                  onSuccess: () => {
                    onChanged();
                    onClose();
                  },
                  onError: onErr,
                },
              );
            }}
          >
            {setLink.isPending ? "Linking…" : "Link"}
          </Button>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
