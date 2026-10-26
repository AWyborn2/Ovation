import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListHatTricks,
  useCreateHatTrick,
  useUpdateHatTrick,
  useDeleteHatTrick,
  getListHatTricksQueryKey,
} from "@workspace/api-client-react";
import type { HatTrick, HatTrickInput } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { PlayerTypeahead, type SelectedPlayer } from "@/components/player-typeahead";
import { ListSkeleton, QueryError, EmptyState } from "@/components/data-states";
import { useConfirm } from "@/components/confirm-dialog";
import { DataTable, EditDrawer, type DataTableColumn } from "@/components/admin-ui";
import { Plus } from "lucide-react";

const BLANK: HatTrickInput = {
  bowler: "",
  grade: "",
  season: null,
  figures: null,
  opponent: null,
  playerId: null,
};

/**
 * Admin → Honours → Hat-tricks (honours kiosk redesign C2). Scorecards don't
 * record the order wickets fell in, so the club enters its hat-tricks here;
 * the honours display shows them as an achievement list.
 */
export default function AdminHatTricks() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { data: rows, isLoading, isError, refetch } = useListHatTricks();
  const create = useCreateHatTrick();
  const update = useUpdateHatTrick();
  const del = useDeleteHatTrick();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListHatTricksQueryKey() });
  const onMutationError = (e: unknown) => {
    const msg = handleAdminMutationError(e);
    if (msg) setError(msg);
  };
  const editing = rows?.find((r) => r.id === editingId) ?? null;

  const remove = async (r: HatTrick) => {
    if (
      !(await confirm({
        title: "Delete hat-trick",
        description: `Delete ${r.bowler}'s hat-trick${r.season ? ` (${r.season})` : ""}?`,
        confirmText: "Delete",
        destructive: true,
      }))
    )
      return;
    setError(null);
    del.mutate(
      { id: r.id },
      {
        onSuccess: () => {
          setEditingId(null);
          invalidate();
        },
        onError: onMutationError,
      },
    );
  };

  const columns: DataTableColumn<HatTrick>[] = [
    {
      key: "season",
      header: "Season",
      className: "w-24",
      cell: (r) => <span className="tabular-nums">{r.season ?? "—"}</span>,
    },
    {
      key: "bowler",
      header: "Bowler",
      cell: (r) => <span className="font-semibold">{r.bowler}</span>,
    },
    { key: "grade", header: "Grade", cell: (r) => r.grade },
    {
      key: "figures",
      header: "Figures",
      className: "w-24",
      cell: (r) => <span className="tabular-nums">{r.figures ?? "—"}</span>,
    },
    {
      key: "opponent",
      header: "Opponent",
      cell: (r) => <span className="text-muted-foreground">{r.opponent ?? "—"}</span>,
    },
  ];

  return (
    <div className="space-y-5">
      <p className="max-w-[75ch] text-[15px] text-muted-foreground">
        The club&apos;s hat-tricks. Scorecards don&apos;t show the order wickets fell in, so add
        them here; they appear on the honours display&apos;s Hat-tricks board.
      </p>

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
          label="Hat-tricks"
          rows={rows ?? []}
          columns={columns}
          getRowId={(r) => r.id}
          searchText={(r) => `${r.bowler} ${r.season ?? ""} ${r.grade} ${r.opponent ?? ""}`}
          searchPlaceholder="Search hat-tricks"
          onRowClick={(r) => setEditingId(r.id)}
          toolbarAction={
            <Button onClick={() => setShowNew(true)} data-testid="button-new-hat-trick">
              <Plus className="mr-1.5 h-4 w-4" aria-hidden />
              New hat-trick
            </Button>
          }
          emptyState={
            <EmptyState
              title="No hat-tricks yet"
              message="Add the club's hat-tricks to show them on the honours display."
            />
          }
          minWidth={560}
        />
      )}

      <EditDrawer open={showNew} onOpenChange={setShowNew} title="New hat-trick">
        {showNew && (
          <HatTrickForm
            initial={BLANK}
            pending={create.isPending}
            submitLabel="Add hat-trick"
            onCancel={() => setShowNew(false)}
            onSubmit={(data) => {
              setError(null);
              create.mutate(
                { data },
                {
                  onSuccess: () => {
                    setShowNew(false);
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
        title={editing?.bowler ?? ""}
        description={editing?.season ?? undefined}
        footer={
          editing ? (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled={del.isPending}
              onClick={() => remove(editing)}
            >
              Delete
            </Button>
          ) : undefined
        }
      >
        {editing && (
          <HatTrickForm
            key={editing.id}
            initial={{
              bowler: editing.bowler,
              grade: editing.grade,
              season: editing.season ?? null,
              figures: editing.figures ?? null,
              opponent: editing.opponent ?? null,
              playerId: editing.playerId ?? null,
            }}
            pending={update.isPending}
            submitLabel="Save changes"
            onCancel={() => setEditingId(null)}
            onSubmit={(data) => {
              setError(null);
              update.mutate(
                { id: editing.id, data },
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

function HatTrickForm({
  initial,
  pending,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: HatTrickInput;
  pending: boolean;
  submitLabel: string;
  onSubmit: (v: HatTrickInput) => void;
  onCancel: () => void;
}) {
  const [bowler, setBowler] = useState(initial.bowler);
  const [grade, setGrade] = useState(initial.grade);
  const [season, setSeason] = useState(initial.season ?? "");
  const [figures, setFigures] = useState(initial.figures ?? "");
  const [opponent, setOpponent] = useState(initial.opponent ?? "");
  const [player, setPlayer] = useState<SelectedPlayer | null>(
    initial.playerId != null
      ? { id: initial.playerId, surname: initial.bowler || "Linked", givenName: "" }
      : null,
  );
  const valid = bowler.trim() !== "" && grade.trim() !== "";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    onSubmit({
      bowler: bowler.trim(),
      grade: grade.trim(),
      season: season.trim() || null,
      figures: figures.trim() || null,
      opponent: opponent.trim() || null,
      playerId: player?.id ?? null,
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="ht-bowler">Bowler</Label>
        <Input
          id="ht-bowler"
          value={bowler}
          onChange={(e) => setBowler(e.target.value)}
          required
          data-testid="input-ht-bowler"
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="ht-grade">Grade</Label>
          <Input
            id="ht-grade"
            value={grade}
            placeholder="A Grade"
            onChange={(e) => setGrade(e.target.value)}
            required
            data-testid="input-ht-grade"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ht-season">Season</Label>
          <Input
            id="ht-season"
            value={season}
            placeholder="2024/25"
            onChange={(e) => setSeason(e.target.value)}
            data-testid="input-ht-season"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ht-figures">Figures</Label>
          <Input
            id="ht-figures"
            value={figures}
            placeholder="5/23"
            onChange={(e) => setFigures(e.target.value)}
            data-testid="input-ht-figures"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ht-opponent">Opponent</Label>
          <Input
            id="ht-opponent"
            value={opponent}
            placeholder="Mandurah"
            onChange={(e) => setOpponent(e.target.value)}
            data-testid="input-ht-opponent"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Linked player (optional)</Label>
        <PlayerTypeahead value={player} onChange={setPlayer} />
      </div>
      <div className="flex gap-3">
        <Button type="submit" disabled={pending || !valid} data-testid="button-save-hat-trick">
          {pending ? "Saving…" : submitLabel}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
