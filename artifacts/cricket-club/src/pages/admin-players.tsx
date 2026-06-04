import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListPlayers,
  useUpdatePlayer,
  useDeletePlayer,
  useMergePlayer,
  useCreatePlayer,
  getListPlayersQueryKey,
  getGetDashboardQueryKey,
  getGetRecordsQueryKey,
  type Player,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { PlayerTypeahead, type SelectedPlayer } from "@/components/player-typeahead";
import { TradingCardModal } from "@/components/trading-card";
import { CARD_ROLES } from "@/lib/trading-card";

export default function AdminPlayers() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [mergeFor, setMergeFor] = useState<Player | null>(null);
  const [newSurname, setNewSurname] = useState("");
  const [newGiven, setNewGiven] = useState("");

  const { data, isLoading } = useListPlayers({
    search: search || undefined,
    page,
    limit: 25,
    sortBy: "name",
    sortOrder: "asc",
  });

  const updatePlayer = useUpdatePlayer();
  const deletePlayer = useDeletePlayer();
  const mergePlayer = useMergePlayer();
  const createPlayer = useCreatePlayer();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListPlayersQueryKey() });
    qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
    qc.invalidateQueries({ queryKey: getGetRecordsQueryKey() });
  };
  const onErr = (e: unknown) => setError(handleAdminMutationError(e));
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-serif font-bold">Players</h1>
      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Add player</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex gap-3 items-end"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newSurname.trim() || !newGiven.trim()) return;
              setError(null);
              createPlayer.mutate(
                { data: { surname: newSurname.trim(), givenName: newGiven.trim() } },
                {
                  onSuccess: () => {
                    setNewSurname("");
                    setNewGiven("");
                    invalidate();
                  },
                  onError: onErr,
                },
              );
            }}
          >
            <div className="space-y-1">
              <Label>Surname</Label>
              <Input value={newSurname} onChange={(e) => setNewSurname(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Given name</Label>
              <Input value={newGiven} onChange={(e) => setNewGiven(e.target.value)} />
            </div>
            <Button type="submit" disabled={createPlayer.isPending}>
              Add
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-4">
          <Input
            placeholder="Search by name…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="max-w-md"
          />
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !data?.players.length ? (
            <p className="text-sm text-muted-foreground italic">No players.</p>
          ) : (
            <div className="space-y-2">
              {data.players.map((p) => (
                <PlayerRow
                  key={p.id}
                  player={p}
                  pending={updatePlayer.isPending || deletePlayer.isPending}
                  onSave={(patch) =>
                    updatePlayer.mutate(
                      { id: p.id, data: patch },
                      { onSuccess: invalidate, onError: onErr },
                    )
                  }
                  onDelete={() => {
                    if ((p.totalGames ?? 0) > 0 || (p.totalRuns ?? 0) > 0 || (p.totalWickets ?? 0) > 0) {
                      if (
                        !confirm(
                          `${p.surname}, ${p.givenName} has stats. Deleting will cascade those stats. Continue?`,
                        )
                      )
                        return;
                    } else if (!confirm(`Delete ${p.surname}, ${p.givenName}?`)) return;
                    setError(null);
                    deletePlayer.mutate(
                      { id: p.id },
                      { onSuccess: invalidate, onError: onErr },
                    );
                  }}
                  onMerge={() => setMergeFor(p)}
                />
              ))}
            </div>
          )}
          {data && data.total > 0 && (
            <div className="flex items-center justify-between text-sm">
              <div className="text-muted-foreground">
                Page {data.page} of {totalPages} — {data.total} players
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={data.page <= 1}
                >
                  Prev
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={data.page >= totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {mergeFor && (
        <MergeDialog
          duplicate={mergeFor}
          pending={mergePlayer.isPending}
          onClose={() => setMergeFor(null)}
          onMerge={(keeperId) => {
            setError(null);
            mergePlayer.mutate(
              { id: mergeFor.id, data: { keeperId } },
              {
                onSuccess: () => {
                  setMergeFor(null);
                  invalidate();
                },
                onError: onErr,
              },
            );
          }}
        />
      )}
    </div>
  );
}

function PlayerRow({
  player,
  pending,
  onSave,
  onDelete,
  onMerge,
}: {
  player: Player;
  pending: boolean;
  onSave: (patch: {
    surname?: string;
    givenName?: string;
    deceased?: boolean;
    cardRole?: string | null;
    cardRating?: number | null;
  }) => void;
  onDelete: () => void;
  onMerge: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [surname, setSurname] = useState(player.surname);
  const [givenName, setGivenName] = useState(player.givenName);
  const [deceased, setDeceased] = useState(player.deceased);
  const [cardRole, setCardRole] = useState(player.cardRole ?? "");
  const [cardRating, setCardRating] = useState(
    player.cardRating != null ? String(player.cardRating) : "",
  );

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-3 border-b pb-2 last:border-0">
        <div>
          <span className="font-medium">
            {player.surname}, {player.givenName}
          </span>
          {player.deceased && <span className="ml-2 text-xs text-muted-foreground">✝ deceased</span>}
          <span className="ml-3 text-xs text-muted-foreground">
            {player.totalGames ?? 0}g · {player.totalRuns ?? 0}r · {player.totalWickets ?? 0}w
          </span>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setCardOpen(true)}>
            Card
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button size="sm" variant="outline" onClick={onMerge}>
            Merge…
          </Button>
          <Button size="sm" variant="outline" onClick={onDelete} disabled={pending}>
            Delete
          </Button>
        </div>
        <TradingCardModal playerId={player.id} open={cardOpen} onOpenChange={setCardOpen} />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-3 border-b pb-3 last:border-0">
      <div className="space-y-1">
        <Label>Surname</Label>
        <Input value={surname} onChange={(e) => setSurname(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>Given name</Label>
        <Input value={givenName} onChange={(e) => setGivenName(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>Card role</Label>
        <select
          value={cardRole}
          onChange={(e) => setCardRole(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="">Auto</option>
          {CARD_ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label>Card rating (1-5)</Label>
        <Input
          type="number"
          min={0}
          max={5}
          value={cardRating}
          onChange={(e) => setCardRating(e.target.value)}
          className="w-24"
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={deceased} onChange={(e) => setDeceased(e.target.checked)} />
        Deceased
      </label>
      <Button
        size="sm"
        onClick={() => {
          const ratingNum = cardRating.trim() === "" ? null : Number(cardRating);
          const nextRole = cardRole === "" ? null : cardRole;
          const prevRating = player.cardRating ?? null;
          const prevRole = player.cardRole ?? null;
          onSave({
            surname: surname !== player.surname ? surname : undefined,
            givenName: givenName !== player.givenName ? givenName : undefined,
            deceased: deceased !== player.deceased ? deceased : undefined,
            cardRole: nextRole !== prevRole ? nextRole : undefined,
            cardRating:
              ratingNum !== prevRating
                ? ratingNum != null && Number.isFinite(ratingNum)
                  ? Math.min(5, Math.max(0, Math.round(ratingNum)))
                  : null
                : undefined,
          });
          setEditing(false);
        }}
        disabled={pending}
      >
        Save
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          setEditing(false);
          setSurname(player.surname);
          setGivenName(player.givenName);
          setDeceased(player.deceased);
          setCardRole(player.cardRole ?? "");
          setCardRating(player.cardRating != null ? String(player.cardRating) : "");
        }}
      >
        Cancel
      </Button>
    </div>
  );
}

function MergeDialog({
  duplicate,
  pending,
  onClose,
  onMerge,
}: {
  duplicate: Player;
  pending: boolean;
  onClose: () => void;
  onMerge: (keeperId: number) => void;
}) {
  const [keeper, setKeeper] = useState<SelectedPlayer | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4">
      <Card className="max-w-lg w-full">
        <CardHeader>
          <CardTitle>Merge player</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">
            All stats, premiership squad rows, cap register rows and life member rows belonging to{" "}
            <strong>
              {duplicate.surname}, {duplicate.givenName}
            </strong>{" "}
            will be reassigned to the keeper. The duplicate will then be deleted.
          </p>
          <div className="space-y-1">
            <Label>Keeper (the player to keep)</Label>
            <PlayerTypeahead value={keeper} onChange={setKeeper} />
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => keeper && onMerge(keeper.id)}
              disabled={pending || !keeper || keeper.id === duplicate.id}
            >
              {pending ? "Merging…" : "Merge"}
            </Button>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
