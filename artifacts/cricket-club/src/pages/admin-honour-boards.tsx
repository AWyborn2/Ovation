import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListHonourBoards,
  useCreateHonourBoard,
  useUpdateHonourBoard,
  useDeleteHonourBoard,
  useListHonourBoardOverrides,
  useUpsertHonourBoardOverride,
  useDeleteHonourBoardOverride,
  getListHonourBoardsQueryKey,
  getListHonourBoardOverridesQueryKey,
  type HonourBoard,
  type HonourBoardOverride,
} from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { PlayerTypeahead, type SelectedPlayer } from "@/components/player-typeahead";
import { ListSkeleton, QueryError, EmptyState } from "@/components/data-states";
import { useConfirm } from "@/components/confirm-dialog";
import { DataTable, EditDrawer, type DataTableColumn } from "@/components/admin-ui";
import { Plus } from "lucide-react";

export default function AdminHonourBoards() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { data: boards, isLoading, isError, refetch } = useListHonourBoards();
  const createBoard = useCreateHonourBoard();
  const updateBoard = useUpdateHonourBoard();
  const deleteBoard = useDeleteHonourBoard();
  const [error, setError] = useState<string | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  const invalidate = () => qc.invalidateQueries({ queryKey: getListHonourBoardsQueryKey() });
  const onErr = (e: unknown) => setError(handleAdminMutationError(e));

  const rows = [...(boards ?? [])].sort(
    (a, b) => a.displayOrder - b.displayOrder || a.label.localeCompare(b.label),
  );
  const active = rows.find((b) => b.key === activeKey) ?? null;

  const remove = async (b: HonourBoard) => {
    if (
      !(await confirm({
        title: "Delete honour board",
        description: `Delete honour board "${b.label}"?`,
        confirmText: "Delete",
        destructive: true,
      }))
    )
      return;
    setError(null);
    deleteBoard.mutate(
      { key: b.key },
      {
        onSuccess: () => {
          setActiveKey(null);
          invalidate();
        },
        onError: onErr,
      },
    );
  };

  const columns: DataTableColumn<HonourBoard>[] = [
    {
      key: "order",
      header: "Order",
      className: "w-20",
      cell: (b) => <span className="tabular-nums text-muted-foreground">{b.displayOrder}</span>,
    },
    {
      key: "label",
      header: "Board",
      cell: (b) => (
        <span>
          <span className="block font-semibold">{b.label}</span>
          <span className="block font-mono text-xs text-muted-foreground">{b.key}</span>
        </span>
      ),
    },
    { key: "title", header: "Title", cell: (b) => b.title },
  ];

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {isError ? (
        <QueryError onRetry={() => refetch()} />
      ) : isLoading ? (
        <ListSkeleton />
      ) : (
        <DataTable
          label="Honour boards"
          rows={rows}
          columns={columns}
          getRowId={(b) => b.key}
          searchText={(b) => `${b.label} ${b.key} ${b.title}`}
          searchPlaceholder="Search boards"
          onRowClick={(b) => setActiveKey(b.key)}
          toolbarAction={
            <Button onClick={() => setShowNew(true)}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden />
              Add board
            </Button>
          }
          emptyState={
            <EmptyState
              title="No honour boards yet"
              message="Add a board to start recording club honours."
            />
          }
          minWidth={520}
        />
      )}

      <EditDrawer open={showNew} onOpenChange={setShowNew} title="New honour board">
        {showNew && (
          <NewBoardForm
            pending={createBoard.isPending}
            onCreate={(values) => {
              setError(null);
              createBoard.mutate(
                { data: values },
                {
                  onSuccess: () => {
                    setShowNew(false);
                    invalidate();
                  },
                  onError: onErr,
                },
              );
            }}
            onCancel={() => setShowNew(false)}
          />
        )}
      </EditDrawer>

      <EditDrawer
        wide
        open={active != null}
        onOpenChange={(o) => !o && setActiveKey(null)}
        title={active?.label ?? ""}
        description={active ? active.title : undefined}
        footer={
          active ? (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled={deleteBoard.isPending}
              onClick={() => remove(active)}
            >
              Delete
            </Button>
          ) : undefined
        }
      >
        {active && (
          <div className="space-y-6">
            <BoardEditor
              key={active.key}
              board={active}
              pending={updateBoard.isPending}
              onSave={(patch) =>
                updateBoard.mutate(
                  { key: active.key, data: patch },
                  { onSuccess: invalidate, onError: onErr },
                )
              }
            />
            <BoardOverrides boardKey={active.key} onError={onErr} />
          </div>
        )}
      </EditDrawer>
    </div>
  );
}

function NewBoardForm({
  pending,
  onCreate,
  onCancel,
}: {
  pending: boolean;
  onCreate: (v: {
    key: string;
    label: string;
    title: string;
    subtitle?: string;
    headlineLabel?: string;
    supportingLabel?: string;
    displayOrder?: number;
  }) => void;
  onCancel: () => void;
}) {
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [title, setTitle] = useState("");
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="hb-key">Key (lowercase id)</Label>
        <Input id="hb-key" value={key} onChange={(e) => setKey(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="hb-label">Label</Label>
        <Input id="hb-label" value={label} onChange={(e) => setLabel(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="hb-title">Title</Label>
        <Input id="hb-title" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <Button
          onClick={() => onCreate({ key: key.trim(), label: label.trim(), title: title.trim() })}
          disabled={pending || !key.trim() || !label.trim() || !title.trim()}
        >
          Create
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function BoardEditor({
  board,
  pending,
  onSave,
}: {
  board: HonourBoard;
  pending: boolean;
  onSave: (patch: Partial<HonourBoard>) => void;
}) {
  const [label, setLabel] = useState(board.label);
  const [title, setTitle] = useState(board.title);
  const [subtitle, setSubtitle] = useState(board.subtitle);
  const [headlineLabel, setHeadlineLabel] = useState(board.headlineLabel);
  const [supportingLabel, setSupportingLabel] = useState(board.supportingLabel);
  const [displayOrder, setDisplayOrder] = useState(board.displayOrder);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label>Label</Label>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="space-y-1 md:col-span-2">
          <Label>Subtitle</Label>
          <Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Headline label</Label>
          <Input value={headlineLabel} onChange={(e) => setHeadlineLabel(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Supporting label</Label>
          <Input value={supportingLabel} onChange={(e) => setSupportingLabel(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Display order</Label>
          <Input
            type="number"
            value={displayOrder}
            onChange={(e) => setDisplayOrder(parseInt(e.target.value, 10) || 0)}
          />
        </div>
      </div>
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          onSave({ label, title, subtitle, headlineLabel, supportingLabel, displayOrder })
        }
      >
        Save board
      </Button>
    </div>
  );
}

function BoardOverrides({
  boardKey,
  onError,
}: {
  boardKey: string;
  onError: (e: unknown) => void;
}) {
  const qc = useQueryClient();
  const { data: overrides } = useListHonourBoardOverrides(boardKey);
  const upsert = useUpsertHonourBoardOverride();
  const del = useDeleteHonourBoardOverride();
  const [player, setPlayer] = useState<SelectedPlayer | null>(null);
  const [pinned, setPinned] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [note, setNote] = useState("");

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: getListHonourBoardOverridesQueryKey(boardKey) });

  return (
    <div className="space-y-3 border-t pt-4">
      <h3 className="text-sm font-semibold">Overrides (pin / hide / annotate)</h3>
      <div className="flex flex-wrap gap-2 items-end">
        <div className="w-64 space-y-1">
          <Label className="text-xs">Player</Label>
          <PlayerTypeahead value={player} onChange={setPlayer} />
        </div>
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
          Pin
        </label>
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
          Hide
        </label>
        <div className="space-y-1 flex-1 min-w-40">
          <Label className="text-xs">Note</Label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <Button
          size="sm"
          disabled={!player || upsert.isPending}
          onClick={() => {
            if (!player) return;
            upsert.mutate(
              { key: boardKey, data: { playerId: player.id, pinned, hidden, note } },
              {
                onSuccess: () => {
                  setPlayer(null);
                  setPinned(false);
                  setHidden(false);
                  setNote("");
                  invalidate();
                },
                onError,
              },
            );
          }}
        >
          Save override
        </Button>
      </div>
      <div className="space-y-1">
        {overrides?.map((o: HonourBoardOverride) => (
          <div
            key={o.id}
            className="flex items-center justify-between text-sm border-b py-1 last:border-0"
          >
            <span>
              player #{o.playerId}
              {o.pinned && <span className="ml-2 text-xs text-amber-600">pinned</span>}
              {o.hidden && <span className="ml-2 text-xs text-muted-foreground">hidden</span>}
              {o.note && <span className="ml-2 text-xs italic">"{o.note}"</span>}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                del.mutate(
                  { key: boardKey, playerId: o.playerId },
                  { onSuccess: invalidate, onError },
                )
              }
            >
              Remove
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
