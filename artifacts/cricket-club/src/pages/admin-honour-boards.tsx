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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { PlayerTypeahead, type SelectedPlayer } from "@/components/player-typeahead";

export default function AdminHonourBoards() {
  const qc = useQueryClient();
  const { data: boards, isLoading } = useListHonourBoards();
  const createBoard = useCreateHonourBoard();
  const updateBoard = useUpdateHonourBoard();
  const deleteBoard = useDeleteHonourBoard();
  const [error, setError] = useState<string | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  const invalidate = () => qc.invalidateQueries({ queryKey: getListHonourBoardsQueryKey() });
  const onErr = (e: unknown) => setError(handleAdminMutationError(e));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-4">
        <Button onClick={() => setShowNew((v) => !v)}>{showNew ? "Close" : "Add board"}</Button>
      </div>
      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

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

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        boards?.map((b) => (
          <Card key={b.id}>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle>
                  {b.label} <span className="font-mono text-xs text-muted-foreground">({b.key})</span>
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-1">{b.title}</p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setActiveKey(activeKey === b.key ? null : b.key)}
                >
                  {activeKey === b.key ? "Close" : "Open"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (!confirm(`Delete honour board "${b.label}"?`)) return;
                    setError(null);
                    deleteBoard.mutate(
                      { key: b.key },
                      { onSuccess: invalidate, onError: onErr },
                    );
                  }}
                >
                  Delete
                </Button>
              </div>
            </CardHeader>
            {activeKey === b.key && (
              <CardContent className="space-y-4">
                <BoardEditor
                  board={b}
                  pending={updateBoard.isPending}
                  onSave={(patch) =>
                    updateBoard.mutate(
                      { key: b.key, data: patch },
                      { onSuccess: invalidate, onError: onErr },
                    )
                  }
                />
                <BoardOverrides boardKey={b.key} onError={onErr} />
              </CardContent>
            )}
          </Card>
        ))
      )}
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
    <Card>
      <CardHeader>
        <CardTitle>New honour board</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <Label>Key (lowercase id)</Label>
            <Input value={key} onChange={(e) => setKey(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Label</Label>
            <Input value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
        </div>
        <div className="flex gap-2 mt-3">
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
      </CardContent>
    </Card>
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

function BoardOverrides({ boardKey, onError }: { boardKey: string; onError: (e: unknown) => void }) {
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
    <div className="border-t pt-4 space-y-3">
      <h3 className="font-semibold text-sm">Overrides (pin / hide / annotate)</h3>
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
          <div key={o.id} className="flex items-center justify-between text-sm border-b py-1 last:border-0">
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
