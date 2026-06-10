import { useState } from "react";
import {
  useCreateAwardWinner,
  useUpdateAwardWinner,
  useDeleteAwardWinner,
} from "@workspace/api-client-react";
import type { Award } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/confirm-dialog";
import { WinnerForm } from "./winner-form";
import { formatSeason } from "./helpers";

export function WinnersManager({
  award,
  onError,
  onChanged,
}: {
  award: Award;
  onError: (e: unknown) => void;
  onChanged: () => void;
}) {
  const createWinner = useCreateAwardWinner();
  const updateWinner = useUpdateAwardWinner();
  const deleteWinner = useDeleteAwardWinner();
  const confirm = useConfirm();
  const [showNew, setShowNew] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const winners = award.winners;

  const moveWinner = (index: number, dir: -1 | 1) => {
    const a = winners[index];
    const b = winners[index + dir];
    if (!a || !b) return;
    updateWinner.mutate(
      { id: a.id, data: { displayOrder: b.displayOrder } },
      {
        onError,
        onSuccess: () => {
          updateWinner.mutate(
            { id: b.id, data: { displayOrder: a.displayOrder } },
            { onSuccess: onChanged, onError },
          );
        },
      },
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Past winners
        </h4>
        <Button
          size="sm"
          variant={showNew ? "outline" : "secondary"}
          onClick={() => setShowNew((v) => !v)}
        >
          {showNew ? "Cancel" : "Add winner"}
        </Button>
      </div>

      {showNew && (
        <div className="rounded-md border border-border bg-background p-4">
          <WinnerForm
            initial={{
              season: new Date().getFullYear(),
              playerId: null,
              name: "",
              displayOrder: (winners[winners.length - 1]?.displayOrder ?? -1) + 1,
              published: true,
            }}
            pending={createWinner.isPending}
            onSubmit={(values) => {
              createWinner.mutate(
                { id: award.id, data: values },
                {
                  onSuccess: () => {
                    setShowNew(false);
                    onChanged();
                  },
                  onError,
                },
              );
            }}
            onCancel={() => setShowNew(false)}
            submitLabel="Add winner"
          />
        </div>
      )}

      {winners.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          No winners recorded yet.
        </p>
      ) : (
        <div className="divide-y divide-border rounded-md border border-border">
          {winners.map((w, index) =>
            editingId === w.id ? (
              <div key={w.id} className="p-4 bg-muted/30">
                <WinnerForm
                  initial={{
                    season: w.season,
                    playerId: w.playerId ?? null,
                    name: w.name,
                    displayOrder: w.displayOrder,
                    published: w.published,
                  }}
                  knownName={w.name}
                  pending={updateWinner.isPending}
                  onSubmit={(values) => {
                    updateWinner.mutate(
                      { id: w.id, data: values },
                      {
                        onSuccess: () => {
                          setEditingId(null);
                          onChanged();
                        },
                        onError,
                      },
                    );
                  }}
                  onCancel={() => setEditingId(null)}
                  submitLabel="Save winner"
                />
              </div>
            ) : (
              <div
                key={w.id}
                className="flex items-center justify-between gap-3 p-3"
              >
                <div className="min-w-0">
                  <span className="font-mono font-bold text-primary">
                    {formatSeason(w.season)}
                  </span>
                  <span className="ml-3 font-semibold">{w.name}</span>
                  {w.playerId != null ? (
                    <span className="ml-2 text-xs text-muted-foreground">
                      linked #{w.playerId}
                    </span>
                  ) : (
                    <span className="ml-2 text-xs text-muted-foreground italic">
                      free text
                    </span>
                  )}
                  {!w.published && (
                    <span className="ml-2 text-xs rounded bg-muted text-muted-foreground px-1.5 py-0.5">
                      Draft
                    </span>
                  )}
                </div>
                <div className="space-x-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={index === 0 || updateWinner.isPending}
                    onClick={() => moveWinner(index, -1)}
                  >
                    ↑
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={index === winners.length - 1 || updateWinner.isPending}
                    onClick={() => moveWinner(index, 1)}
                  >
                    ↓
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditingId(w.id)}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={deleteWinner.isPending}
                    onClick={async () => {
                      if (
                        !(await confirm({
                          title: "Remove winner?",
                          description: `Remove ${w.name} (${formatSeason(w.season)}) from this award?`,
                          confirmText: "Remove",
                          destructive: true,
                        }))
                      )
                        return;
                      deleteWinner.mutate(
                        { id: w.id },
                        { onSuccess: onChanged, onError },
                      );
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}
