import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListCaps,
  useCreateCap,
  useUpdateCap,
  useDeleteCap,
  useRecomputeCaps,
  getListCapsQueryKey,
  useListCapReview,
  getListCapReviewQueryKey,
  useConfirmCaps,
  useReorderPendingCaps,
  useDeclineCap,
  useRestoreCap,
  useListPlayers,
  getListPlayersQueryKey,
} from "@workspace/api-client-react";
import type { CapEntry, CapCategory } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { PlayerTypeahead, type SelectedPlayer } from "@/components/player-typeahead";
import { TableSkeleton, QueryError, EmptyState } from "@/components/data-states";
import { useConfirm } from "@/components/confirm-dialog";
import { DataTable, EditDrawer, StatusPill, type DataTableColumn } from "@/components/admin-ui";
import { ArrowDown, ArrowUp, Plus } from "lucide-react";

export default function AdminCaps() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { data: caps, isLoading, isError, refetch } = useListCaps();
  const createCap = useCreateCap();
  const updateCap = useUpdateCap();
  const deleteCap = useDeleteCap();
  const recomputeCaps = useRecomputeCaps();
  const [category, setCategory] = useState<CapCategory>("male");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { data: review } = useListCapReview();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListCapsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListCapReviewQueryKey() });
  };

  const onRecompute = () => {
    setError(null);
    setNotice(null);
    recomputeCaps.mutate(undefined, {
      onSuccess: (res) => {
        invalidate();
        setNotice(
          res.updated > 0
            ? `Refreshed ${res.updated} cap${res.updated === 1 ? "" : "s"} from stats.`
            : "All caps already up to date with stats.",
        );
      },
      onError: onMutationError,
    });
  };

  const inCategory = useMemo(
    () => (caps ?? []).filter((c) => (c.category ?? "male") === category),
    [caps, category],
  );

  const reviewInCategory = useMemo(
    () => (review ?? []).filter((c) => (c.category ?? "male") === category),
    [review, category],
  );

  // Pending caps hold numbers too, so a hand-added cap goes after them.
  const nextCapNumber = useMemo(() => {
    const numbers = [...inCategory, ...reviewInCategory]
      .map((c) => c.capNumber)
      .filter((n) => n > 0);
    return numbers.length === 0 ? 1 : Math.max(...numbers) + 1;
  }, [inCategory, reviewInCategory]);

  const onMutationError = (e: unknown) => {
    const msg = handleAdminMutationError(e);
    if (msg) setError(msg);
  };

  const editing = inCategory.find((c) => c.id === editingId) ?? null;
  const listName = category === "female" ? "A Grade Female" : "A Grade Male";

  const remove = async (cap: CapEntry) => {
    if (
      !(await confirm({
        title: "Delete cap entry",
        description: `Delete cap #${cap.capNumber} (${cap.name})?`,
        confirmText: "Delete",
        destructive: true,
      }))
    )
      return;
    setError(null);
    deleteCap.mutate(
      { id: cap.id },
      {
        onSuccess: () => {
          setEditingId(null);
          invalidate();
        },
        onError: onMutationError,
      },
    );
  };

  const columns: DataTableColumn<CapEntry>[] = [
    {
      key: "cap",
      header: "Cap #",
      className: "w-20",
      cell: (cap) => <span className="font-bold tabular-nums">{cap.capNumber}</span>,
    },
    {
      key: "name",
      header: "Name",
      cell: (cap) => (
        <span className="font-semibold">
          {cap.name}
          {cap.deceased && (
            <span className="ml-1 font-normal text-muted-foreground" title="Deceased">
              ✝
            </span>
          )}
        </span>
      ),
    },
    {
      key: "linked",
      header: "Linked player",
      cell: (cap) =>
        cap.playerId != null ? (
          <LinkedPlayerLabel playerId={cap.playerId} />
        ) : (
          <span className="italic text-muted-foreground">— unmatched —</span>
        ),
    },
    {
      key: "games",
      header: "Games",
      className: "w-20",
      cell: (cap) => <span className="tabular-nums">{cap.inStats ? cap.gamesAGrade : "—"}</span>,
    },
    {
      key: "status",
      header: "Status",
      className: "w-32",
      cell: (cap) =>
        cap.playerId != null ? (
          <StatusPill tone="success">Matched</StatusPill>
        ) : (
          <StatusPill tone="attention">No link</StatusPill>
        ),
    },
  ];

  return (
    <div className="space-y-5">
      <p className="max-w-[75ch] text-[15px] text-muted-foreground">
        Manage the A Grade cap lists. Changes apply immediately to the public honour boards page.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor="admin-cap-category">List</Label>
        <select
          id="admin-cap-category"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value as CapCategory);
            setEditingId(null);
          }}
          className="h-10 rounded-lg border border-input bg-background px-3 text-sm font-medium"
        >
          <option value="male">A Grade Male</option>
          <option value="female">A Grade Female</option>
        </select>
        <span className="text-sm text-muted-foreground">{inCategory.length} entries</span>
        <Button
          variant="outline"
          className="ml-auto"
          onClick={onRecompute}
          disabled={recomputeCaps.isPending}
          title="Refresh every linked cap's games and on-record status from the current stats"
        >
          {recomputeCaps.isPending ? "Refreshing…" : "Refresh from stats"}
        </Button>
      </div>

      {notice && <p className="text-sm text-[var(--win-fg)]">{notice}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}

      <PendingCapsPanel
        caps={reviewInCategory}
        category={category}
        onChanged={invalidate}
        onError={onMutationError}
      />

      {isError ? (
        <QueryError onRetry={() => refetch()} />
      ) : isLoading ? (
        <TableSkeleton />
      ) : (
        <DataTable
          label={`${listName} caps`}
          rows={inCategory}
          columns={columns}
          getRowId={(c) => c.id}
          searchText={(c) => `${c.name} ${c.capNumber}`}
          searchPlaceholder="Filter by name or cap number…"
          filters={[
            { id: "unmatched", label: "No link", predicate: (c) => c.playerId == null },
            { id: "deceased", label: "Deceased", predicate: (c) => c.deceased },
          ]}
          onRowClick={(c) => setEditingId(c.id)}
          toolbarAction={
            <Button onClick={() => setAdding(true)}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden />
              Add cap
            </Button>
          }
          emptyState={
            <EmptyState title="No cap entries" message="No caps match this list or filter yet." />
          }
          minWidth={620}
        />
      )}

      <EditDrawer
        open={adding}
        onOpenChange={setAdding}
        title="Add cap entry"
        description={listName}
      >
        {adding && (
          <CapForm
            initial={{
              capNumber: nextCapNumber,
              name: "",
              deceased: false,
              playerId: null,
              gamesAGrade: 0,
              inStats: false,
            }}
            pending={createCap.isPending}
            submitLabel="Add cap"
            onCancel={() => setAdding(false)}
            onSubmit={(values) => {
              setError(null);
              createCap.mutate(
                { data: { ...values, category } },
                {
                  onSuccess: () => {
                    setAdding(false);
                    invalidate();
                  },
                  onError: onMutationError,
                },
              );
            }}
          />
        )}
      </EditDrawer>

      <EditDrawer
        open={editing != null}
        onOpenChange={(o) => !o && setEditingId(null)}
        title={editing ? `Cap #${editing.capNumber} · ${editing.name}` : ""}
        description={listName}
        footer={
          editing ? (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled={deleteCap.isPending}
              onClick={() => remove(editing)}
            >
              Delete
            </Button>
          ) : undefined
        }
      >
        {editing && (
          <CapForm
            key={editing.id}
            initial={{
              capNumber: editing.capNumber,
              name: editing.name,
              deceased: editing.deceased,
              playerId: editing.playerId ?? null,
              gamesAGrade: editing.gamesAGrade,
              inStats: editing.inStats,
            }}
            pending={updateCap.isPending}
            submitLabel="Save changes"
            onCancel={() => setEditingId(null)}
            onSubmit={(values) => {
              setError(null);
              updateCap.mutate(
                { id: editing.id, data: values },
                {
                  onSuccess: () => {
                    setEditingId(null);
                    invalidate();
                  },
                  onError: onMutationError,
                },
              );
            }}
          />
        )}
      </EditDrawer>
    </div>
  );
}

/**
 * Caps issued automatically (an A Grade debut from an import, the bulk match
 * load or the PlayHQ sync) wait here, off the public register, until an admin
 * confirms them. Reorder them if they were issued in the wrong order, or
 * decline one (it won't be issued again automatically; restore undoes it).
 */
function PendingCapsPanel({
  caps,
  category,
  onChanged,
  onError,
}: {
  caps: CapEntry[];
  category: CapCategory;
  onChanged: () => void;
  onError: (e: unknown) => void;
}) {
  const confirmCaps = useConfirmCaps();
  const reorder = useReorderPendingCaps();
  const decline = useDeclineCap();
  const restore = useRestoreCap();
  const pending = useMemo(
    () => caps.filter((c) => c.status === "pending").sort((a, b) => a.capNumber - b.capNumber),
    [caps],
  );
  const declined = caps.filter((c) => c.status === "declined");
  const [order, setOrder] = useState<number[] | null>(null);
  const ids = order ?? pending.map((c) => c.id);
  const byId = new Map(pending.map((c) => [c.id, c]));
  const rows = ids.map((id) => byId.get(id)).filter((c): c is CapEntry => c != null);
  const firstNumber = pending.length ? Math.min(...pending.map((c) => c.capNumber)) : 0;
  const reordered = order != null && order.some((id, i) => id !== pending[i]?.id);
  const busy = confirmCaps.isPending || reorder.isPending || decline.isPending || restore.isPending;

  if (pending.length === 0 && declined.length === 0) return null;

  const move = (i: number, by: number) => {
    const next = [...ids];
    const j = i + by;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j]!, next[i]!];
    setOrder(next);
  };
  const done = () => {
    setOrder(null);
    onChanged();
  };

  return (
    <section
      aria-label="Caps awaiting confirmation"
      className="space-y-3 rounded-lg border-2 border-amber-500/50 bg-amber-500/5 p-4"
    >
      {pending.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="m-0 text-base font-semibold">
              {pending.length} cap{pending.length === 1 ? "" : "s"} awaiting confirmation
            </h3>
            <span className="text-sm text-muted-foreground">
              Issued automatically for new A Grade debuts. They show on the public register once
              confirmed.
            </span>
          </div>
          <ol className="m-0 list-none space-y-1 p-0">
            {rows.map((c, i) => (
              <li
                key={c.id}
                className="flex items-center gap-2 rounded border bg-background px-3 py-2"
              >
                <span className="w-14 font-bold tabular-nums">#{firstNumber + i}</span>
                <span className="flex-1 font-semibold">{c.name}</span>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={`Move ${c.name} up`}
                  disabled={busy || i === 0}
                  onClick={() => move(i, -1)}
                >
                  <ArrowUp className="h-4 w-4" aria-hidden />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={`Move ${c.name} down`}
                  disabled={busy || i === rows.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown className="h-4 w-4" aria-hidden />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy || reordered}
                  onClick={() =>
                    confirmCaps.mutate({ data: { ids: [c.id] } }, { onSuccess: done, onError })
                  }
                >
                  Confirm
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  disabled={busy || reordered}
                  onClick={() => decline.mutate({ id: c.id }, { onSuccess: done, onError })}
                >
                  Decline
                </Button>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-2">
            {reordered ? (
              <>
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    reorder.mutate({ data: { category, ids } }, { onSuccess: done, onError })
                  }
                >
                  {reorder.isPending ? "Saving…" : "Save new order"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setOrder(null)}>
                  Undo changes
                </Button>
              </>
            ) : (
              <Button
                type="button"
                disabled={busy}
                onClick={() =>
                  confirmCaps.mutate(
                    { data: { ids: pending.map((c) => c.id) } },
                    { onSuccess: done, onError },
                  )
                }
              >
                {confirmCaps.isPending ? "Confirming…" : `Confirm all ${pending.length}`}
              </Button>
            )}
          </div>
        </>
      )}
      {declined.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm text-muted-foreground">
            {declined.length} declined cap{declined.length === 1 ? "" : "s"} (not issued again
            automatically)
          </summary>
          <ul className="mt-2 list-none space-y-1 p-0">
            {declined.map((c) => (
              <li key={c.id} className="flex items-center gap-2 text-sm">
                <span className="flex-1">{c.name}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => restore.mutate({ id: c.id }, { onSuccess: done, onError })}
                >
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function LinkedPlayerLabel({ playerId }: { playerId: number }) {
  const params = useMemo(() => ({ page: 1, limit: 1 }), []);
  const { data } = useListPlayers(params, {
    query: { enabled: false, queryKey: getListPlayersQueryKey(params) },
  });
  void data;
  return <span className="font-mono text-xs text-muted-foreground">player #{playerId}</span>;
}

type CapFormValues = {
  capNumber: number;
  name: string;
  deceased: boolean;
  playerId: number | null;
  gamesAGrade: number;
  inStats: boolean;
};

function CapForm({
  initial,
  pending,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: CapFormValues;
  pending: boolean;
  submitLabel: string;
  onSubmit: (v: CapFormValues) => void;
  onCancel: () => void;
}) {
  const [capNumber, setCapNumber] = useState(initial.capNumber);
  const [name, setName] = useState(initial.name);
  const [deceased, setDeceased] = useState(initial.deceased);
  const [player, setPlayer] = useState<SelectedPlayer | null>(
    initial.playerId != null
      ? { id: initial.playerId, surname: "Linked", givenName: "player" }
      : null,
  );
  const [gamesAGrade, setGamesAGrade] = useState(initial.gamesAGrade);
  const [inStats, setInStats] = useState(initial.inStats);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({
      capNumber,
      name: name.trim(),
      deceased,
      playerId: player?.id ?? null,
      gamesAGrade: Number.isFinite(gamesAGrade) ? gamesAGrade : 0,
      inStats,
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[110px_1fr]">
        <div className="space-y-1">
          <Label htmlFor="cap-number">Cap #</Label>
          <Input
            id="cap-number"
            type="number"
            value={capNumber}
            onChange={(e) => setCapNumber(parseInt(e.target.value, 10))}
            min={1}
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cap-name">Player name</Label>
          <Input id="cap-name" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Linked player (optional)</Label>
        <PlayerTypeahead value={player} onChange={setPlayer} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="cap-games">A Grade games</Label>
        <Input
          id="cap-games"
          type="number"
          value={gamesAGrade}
          onChange={(e) => setGamesAGrade(parseInt(e.target.value, 10))}
          min={0}
          className="w-32"
        />
      </div>
      <div className="flex flex-wrap gap-5">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={deceased}
            onChange={(e) => setDeceased(e.target.checked)}
          />
          Deceased
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={inStats} onChange={(e) => setInStats(e.target.checked)} />
          On record
        </label>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending || !name.trim()}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
