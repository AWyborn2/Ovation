import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListPlayers,
  useUpdatePlayer,
  useDeletePlayer,
  useMergePlayer,
  useCreatePlayer,
  useListPlayerImages,
  useAddPlayerImage,
  useDeletePlayerImage,
  useSetDefaultPlayerImage,
  useGetPlayer,
  getListPlayerImagesQueryKey,
  getGetPlayerQueryKey,
  getListPlayersQueryKey,
  getGetDashboardQueryKey,
  getGetRecordsQueryKey,
  type Player,
} from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { PlayerTypeahead, type SelectedPlayer } from "@/components/player-typeahead";
import { JuniorSeniorLinkDialog } from "@/components/junior-senior-link-dialog";
import { ListSkeleton, EmptyState, QueryError, LoadingState } from "@/components/data-states";
import { useConfirm } from "@/components/confirm-dialog";
import { DataTable, EditDrawer, type DataTableColumn } from "@/components/admin-ui";
import { HEADSHOT_ASPECTS, ImageCropDialog } from "@/components/admin-ui/image-crop-dialog";
import { Plus, Search } from "lucide-react";
import { TradingCardModal } from "@/components/trading-card";
import { CARD_ROLES, deriveRole } from "@/lib/trading-card";
import { aggregateCareer } from "@/lib/honour-boards";

export default function AdminPlayers() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Player | null>(null);
  const [adding, setAdding] = useState(false);
  const [mergeFor, setMergeFor] = useState<Player | null>(null);
  const [juniorLinkFor, setJuniorLinkFor] = useState<Player | null>(null);
  const [cardFor, setCardFor] = useState<number | null>(null);
  const [newSurname, setNewSurname] = useState("");
  const [newGiven, setNewGiven] = useState("");

  const { data, isLoading, isError, refetch } = useListPlayers({
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

  const remove = async (p: Player) => {
    const hasStats = (p.totalGames ?? 0) > 0 || (p.totalRuns ?? 0) > 0 || (p.totalWickets ?? 0) > 0;
    if (
      !(await confirm(
        hasStats
          ? {
              title: "Delete player with stats?",
              description: `${p.surname}, ${p.givenName} has stats. Deleting will cascade those stats. Continue?`,
              confirmText: "Delete",
              destructive: true,
            }
          : {
              title: "Delete player?",
              description: `Delete ${p.surname}, ${p.givenName}?`,
              confirmText: "Delete",
              destructive: true,
            },
      ))
    )
      return;
    setError(null);
    deletePlayer.mutate(
      { id: p.id },
      {
        onSuccess: () => {
          setEditing(null);
          invalidate();
        },
        onError: onErr,
      },
    );
  };

  const addPlayer = () => {
    if (!newSurname.trim() || !newGiven.trim()) return;
    setError(null);
    createPlayer.mutate(
      { data: { surname: newSurname.trim(), givenName: newGiven.trim() } },
      {
        onSuccess: () => {
          setNewSurname("");
          setNewGiven("");
          setAdding(false);
          invalidate();
        },
        onError: onErr,
      },
    );
  };

  const columns: DataTableColumn<Player>[] = [
    {
      key: "name",
      header: "Player",
      cell: (p) => (
        <span className="font-semibold">
          {p.surname}, {p.givenName}
          {p.deceased && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">✝ deceased</span>
          )}
        </span>
      ),
    },
    {
      key: "games",
      header: "Games",
      cell: (p) => <span className="tabular-nums">{p.totalGames ?? 0}</span>,
      className: "w-24 text-right",
    },
    {
      key: "runs",
      header: "Runs",
      cell: (p) => <span className="tabular-nums">{p.totalRuns ?? 0}</span>,
      className: "w-24 text-right",
    },
    {
      key: "wickets",
      header: "Wickets",
      cell: (p) => <span className="tabular-nums">{p.totalWickets ?? 0}</span>,
      className: "w-24 text-right",
    },
    {
      key: "card",
      header: "Card role",
      cell: (p) => p.cardRole ?? <span className="text-muted-foreground">Auto</span>,
      className: "w-36",
    },
  ];

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-0 flex-1 sm:max-w-sm">
          <span className="sr-only">Search players</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            placeholder="Search by name…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="h-10 pl-9"
          />
        </label>
        <Button className="ml-auto" onClick={() => setAdding(true)}>
          <Plus className="mr-1.5 h-4 w-4" aria-hidden />
          Add player
        </Button>
      </div>

      {isLoading ? (
        <ListSkeleton rows={8} />
      ) : isError ? (
        <QueryError
          message="We couldn’t load the players list. Please try again."
          onRetry={() => refetch()}
        />
      ) : (
        <DataTable
          label="Players"
          rows={data?.players ?? []}
          columns={columns}
          getRowId={(p) => p.id}
          onRowClick={setEditing}
          emptyState={
            <EmptyState
              title="No players found"
              message={search ? "No players match your search." : "Add a player to get started."}
            />
          }
          minWidth={620}
        />
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

      <EditDrawer
        open={adding}
        onOpenChange={setAdding}
        title="Add player"
        onSave={addPlayer}
        saving={createPlayer.isPending}
        saveDisabled={!newSurname.trim() || !newGiven.trim()}
        saveLabel="Add player"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            addPlayer();
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="new-surname">Surname</Label>
            <Input
              id="new-surname"
              value={newSurname}
              onChange={(e) => setNewSurname(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="new-given">Given name</Label>
            <Input id="new-given" value={newGiven} onChange={(e) => setNewGiven(e.target.value)} />
          </div>
        </form>
      </EditDrawer>

      <EditDrawer
        open={editing != null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing ? `${editing.surname}, ${editing.givenName}` : ""}
        description={
          editing
            ? `${editing.totalGames ?? 0} games · ${editing.totalRuns ?? 0} runs · ${editing.totalWickets ?? 0} wickets`
            : undefined
        }
        footer={
          editing ? (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled={deletePlayer.isPending}
              onClick={() => remove(editing)}
            >
              Delete
            </Button>
          ) : undefined
        }
      >
        {editing && (
          <PlayerEditor
            key={editing.id}
            player={editing}
            pending={updatePlayer.isPending}
            onSave={(patch) =>
              updatePlayer.mutate(
                { id: editing.id, data: patch },
                {
                  onSuccess: () => {
                    setEditing(null);
                    invalidate();
                  },
                  onError: onErr,
                },
              )
            }
            onCancel={() => setEditing(null)}
            onCard={() => setCardFor(editing.id)}
            onMerge={() => {
              setMergeFor(editing);
              setEditing(null);
            }}
            onJuniorLink={() => {
              setJuniorLinkFor(editing);
              setEditing(null);
            }}
          />
        )}
      </EditDrawer>

      {cardFor != null && (
        <TradingCardModal playerId={cardFor} open onOpenChange={(o) => !o && setCardFor(null)} />
      )}

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

      {juniorLinkFor && (
        <JuniorSeniorLinkDialog
          seniorPlayerId={juniorLinkFor.id}
          seniorName={`${juniorLinkFor.surname}, ${juniorLinkFor.givenName}`}
          onClose={() => setJuniorLinkFor(null)}
        />
      )}
    </div>
  );
}

function PlayerEditor({
  player,
  pending,
  onSave,
  onCancel,
  onCard,
  onMerge,
  onJuniorLink,
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
  onCancel: () => void;
  onCard: () => void;
  onMerge: () => void;
  onJuniorLink: () => void;
}) {
  const [surname, setSurname] = useState(player.surname);
  const [givenName, setGivenName] = useState(player.givenName);
  const [deceased, setDeceased] = useState(player.deceased);
  const [cardRole, setCardRole] = useState(player.cardRole ?? "");
  const [cardRating, setCardRating] = useState(
    player.cardRating != null ? String(player.cardRating) : "",
  );

  // Surface the role the auto-rule computes for this player, so an admin can
  // confirm or override it at a glance (the "Auto — …" option).
  const { data: detail } = useGetPlayer(player.id, {
    query: { queryKey: getGetPlayerQueryKey(player.id) },
  });
  const suggestedRole = detail ? deriveRole(aggregateCareer(detail.stats)[0]) : null;

  const save = () => {
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
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="p-surname">Surname</Label>
          <Input id="p-surname" value={surname} onChange={(e) => setSurname(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="p-given">Given name</Label>
          <Input id="p-given" value={givenName} onChange={(e) => setGivenName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="p-role">Card role</Label>
          <select
            id="p-role"
            value={cardRole}
            onChange={(e) => setCardRole(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">{suggestedRole ? `Auto — ${suggestedRole}` : "Auto"}</option>
            {CARD_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="p-rating">Card rating (1-5)</Label>
          <Input
            id="p-rating"
            type="number"
            min={0}
            max={5}
            value={cardRating}
            onChange={(e) => setCardRating(e.target.value)}
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={deceased} onChange={(e) => setDeceased(e.target.checked)} />
        Deceased
      </label>
      <div className="flex gap-2">
        <Button onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>

      <PlayerGallery playerId={player.id} />

      <div className="space-y-2 border-t border-border pt-4">
        <p className="text-sm font-semibold">More</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={onCard}>
            Trading card
          </Button>
          <Button size="sm" variant="outline" onClick={onMerge}>
            Merge…
          </Button>
          <Button size="sm" variant="outline" onClick={onJuniorLink}>
            Juniors…
          </Button>
        </div>
      </div>
    </div>
  );
}

function PlayerGallery({ playerId }: { playerId: number }) {
  const qc = useQueryClient();
  const [galleryError, setGalleryError] = useState<string | null>(null);
  const { data: images, isLoading } = useListPlayerImages(playerId);
  const addImage = useAddPlayerImage();
  const deleteImage = useDeletePlayerImage();
  const setDefault = useSetDefaultPlayerImage();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListPlayerImagesQueryKey(playerId) });
    qc.invalidateQueries({ queryKey: getGetPlayerQueryKey(playerId) });
    qc.invalidateQueries({ queryKey: getListPlayersQueryKey() });
  };
  const onErr = (e: unknown) => setGalleryError(handleAdminMutationError(e));

  const { uploadFile, isUploading } = useUpload({
    onError: (e) => setGalleryError(e.message),
  });

  const [cropOpen, setCropOpen] = useState(false);

  const handleFile = async (file: File) => {
    setGalleryError(null);
    const result = await uploadFile(file);
    if (!result) return;
    const url = `/api/storage${result.objectPath}`;
    addImage.mutate(
      { id: playerId, data: { imageUrl: url } },
      { onSuccess: invalidate, onError: onErr },
    );
  };

  const busy = isUploading || addImage.isPending || deleteImage.isPending || setDefault.isPending;

  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-3">
      <div className="flex items-center justify-between">
        <Label>Photo gallery</Label>
        <button
          type="button"
          className="text-sm font-medium text-primary-text hover:underline disabled:opacity-50"
          onClick={() => setCropOpen(true)}
          disabled={busy}
        >
          {isUploading ? "Uploading…" : "+ Add photo"}
        </button>
        <ImageCropDialog
          open={cropOpen}
          onOpenChange={setCropOpen}
          title="Player headshot"
          description="Drop a photo or pick one from the library, then frame the face in the circle."
          aspects={HEADSHOT_ASPECTS}
          suggestedWidth={800}
          allowLibrary
          onCropped={handleFile}
        />
      </div>
      {galleryError && <p className="text-xs text-destructive">{galleryError}</p>}
      {isLoading ? (
        <LoadingState label="Loading photos…" className="py-4" />
      ) : !images || images.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No photos yet. Add one — the first becomes the default.
        </p>
      ) : (
        <div className="flex flex-wrap gap-3">
          {images.map((img) => (
            <div key={img.id} className="w-24 space-y-1">
              <div
                className={`relative aspect-square overflow-hidden rounded-md border-2 ${
                  img.isDefault ? "border-primary" : "border-transparent"
                }`}
              >
                <img src={img.imageUrl} alt="" className="h-full w-full object-cover" />
                {img.isDefault && (
                  <span className="absolute left-1 top-1 rounded bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                    Default
                  </span>
                )}
              </div>
              <div className="flex gap-1">
                {!img.isDefault && (
                  <button
                    type="button"
                    className="text-[11px] text-primary-text hover:underline disabled:opacity-50"
                    disabled={busy}
                    onClick={() =>
                      setDefault.mutate(
                        { id: playerId, imageId: img.id },
                        { onSuccess: invalidate, onError: onErr },
                      )
                    }
                  >
                    Default
                  </button>
                )}
                <button
                  type="button"
                  className="text-[11px] text-destructive hover:underline disabled:opacity-50"
                  disabled={busy}
                  onClick={() =>
                    deleteImage.mutate(
                      { id: playerId, imageId: img.id },
                      { onSuccess: invalidate, onError: onErr },
                    )
                  }
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
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
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg space-y-4">
        <DialogHeader>
          <DialogTitle>Merge player</DialogTitle>
          <DialogDescription>
            All stats, premiership squad rows, cap register rows and life member rows belonging to{" "}
            <strong>
              {duplicate.surname}, {duplicate.givenName}
            </strong>{" "}
            will be reassigned to the keeper. The duplicate will then be deleted.
          </DialogDescription>
        </DialogHeader>
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
      </DialogContent>
    </Dialog>
  );
}
