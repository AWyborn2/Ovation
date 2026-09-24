import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListLifeMembers,
  useCreateLifeMember,
  useUpdateLifeMember,
  useDeleteLifeMember,
  getListLifeMembersQueryKey,
} from "@workspace/api-client-react";
import type { LifeMember } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { PlayerTypeahead, type SelectedPlayer } from "@/components/player-typeahead";
import { ListSkeleton, QueryError, EmptyState } from "@/components/data-states";
import { useConfirm } from "@/components/confirm-dialog";
import { DataTable, EditDrawer, type DataTableColumn } from "@/components/admin-ui";
import { Plus } from "lucide-react";

type FormValues = {
  name: string;
  inductionYear: number;
  isPlayingMember: boolean;
  playerId: number | null;
  roleLabel: string | null;
  blurb: string;
};

export default function AdminLifeMembers() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { data: members, isLoading, isError, refetch } = useListLifeMembers();
  const createMember = useCreateLifeMember();
  const updateMember = useUpdateLifeMember();
  const deleteMember = useDeleteLifeMember();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListLifeMembersQueryKey() });
  };

  const onMutationError = (e: unknown) => {
    const msg = handleAdminMutationError(e);
    if (msg) setError(msg);
  };

  const sorted = useMemo(() => {
    if (!members) return [];
    return [...members].sort(
      (a, b) => a.inductionYear - b.inductionYear || a.name.localeCompare(b.name),
    );
  }, [members]);

  const editing = sorted.find((m) => m.id === editingId) ?? null;

  const remove = async (m: LifeMember) => {
    if (
      !(await confirm({
        title: "Delete life member",
        description: `Delete life member "${m.name}"?`,
        confirmText: "Delete",
        destructive: true,
      }))
    )
      return;
    setError(null);
    deleteMember.mutate(
      { id: m.id },
      {
        onSuccess: () => {
          setEditingId(null);
          invalidate();
        },
        onError: onMutationError,
      },
    );
  };

  const columns: DataTableColumn<LifeMember>[] = [
    {
      key: "year",
      header: "Inducted",
      className: "w-24",
      cell: (m) => <span className="tabular-nums">{m.inductionYear}</span>,
    },
    {
      key: "name",
      header: "Name",
      cell: (m) => <span className="font-semibold">{m.name}</span>,
    },
    {
      key: "type",
      header: "Member",
      cell: (m) => (
        <span className="text-muted-foreground">
          {m.isPlayingMember ? "Playing" : "Non-playing"}
          {m.roleLabel && <> · {m.roleLabel}</>}
        </span>
      ),
    },
    {
      key: "linked",
      header: "Linked",
      className: "w-28",
      cell: (m) =>
        m.playerId != null ? (
          <span className="font-mono text-xs text-muted-foreground">player #{m.playerId}</span>
        ) : (
          "—"
        ),
    },
  ];

  return (
    <div className="space-y-5">
      <p className="max-w-[75ch] text-[15px] text-muted-foreground">
        Manage the Life Members honour board. Changes apply immediately to the public page.
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
          label="Life members"
          rows={sorted}
          columns={columns}
          getRowId={(m) => m.id}
          searchText={(m) => `${m.name} ${m.inductionYear} ${m.roleLabel ?? ""}`}
          searchPlaceholder="Search life members"
          filters={[
            { id: "playing", label: "Playing", predicate: (m) => m.isPlayingMember },
            { id: "non-playing", label: "Non-playing", predicate: (m) => !m.isPlayingMember },
          ]}
          onRowClick={(m) => setEditingId(m.id)}
          toolbarAction={
            <Button onClick={() => setShowNew(true)}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden />
              New life member
            </Button>
          }
          emptyState={
            <EmptyState
              title="No life members yet"
              message="Add a life member to populate the honour board."
            />
          }
          minWidth={560}
        />
      )}

      <EditDrawer open={showNew} onOpenChange={setShowNew} title="New life member">
        {showNew && (
          <LifeMemberForm
            initial={{
              name: "",
              inductionYear: new Date().getFullYear(),
              isPlayingMember: true,
              playerId: null,
              roleLabel: null,
              blurb: "",
            }}
            pending={createMember.isPending}
            onSubmit={(values) => {
              setError(null);
              createMember.mutate(
                { data: values },
                {
                  onSuccess: () => {
                    setShowNew(false);
                    invalidate();
                  },
                  onError: onMutationError,
                },
              );
            }}
            onCancel={() => setShowNew(false)}
            submitLabel="Add life member"
          />
        )}
      </EditDrawer>

      <EditDrawer
        open={editing != null}
        onOpenChange={(o) => !o && setEditingId(null)}
        title={editing?.name ?? ""}
        description={editing ? `Inducted ${editing.inductionYear}` : undefined}
        footer={
          editing ? (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled={deleteMember.isPending}
              onClick={() => remove(editing)}
            >
              Delete
            </Button>
          ) : undefined
        }
      >
        {editing && (
          <LifeMemberForm
            key={editing.id}
            initial={{
              name: editing.name,
              inductionYear: editing.inductionYear,
              isPlayingMember: editing.isPlayingMember,
              playerId: editing.playerId ?? null,
              roleLabel: editing.roleLabel ?? null,
              blurb: editing.blurb,
            }}
            pending={updateMember.isPending}
            onSubmit={(values) => {
              setError(null);
              updateMember.mutate(
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
            onCancel={() => setEditingId(null)}
            submitLabel="Save changes"
            knownPlayer={editing}
          />
        )}
      </EditDrawer>
    </div>
  );
}

function LifeMemberForm({
  initial,
  pending,
  onSubmit,
  onCancel,
  submitLabel,
  knownPlayer,
}: {
  initial: FormValues;
  pending: boolean;
  onSubmit: (v: FormValues) => void;
  onCancel: () => void;
  submitLabel: string;
  knownPlayer?: LifeMember;
}) {
  const [name, setName] = useState(initial.name);
  const [inductionYear, setInductionYear] = useState(initial.inductionYear);
  const [isPlayingMember, setIsPlayingMember] = useState(initial.isPlayingMember);
  const [roleLabel, setRoleLabel] = useState(initial.roleLabel ?? "");
  const [blurb, setBlurb] = useState(initial.blurb);
  const [player, setPlayer] = useState<SelectedPlayer | null>(
    initial.playerId != null
      ? { id: initial.playerId, surname: knownPlayer?.name ?? "Linked", givenName: "" }
      : null,
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      inductionYear,
      isPlayingMember,
      playerId: player?.id ?? null,
      roleLabel: roleLabel.trim() || null,
      blurb,
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-[1fr_120px]">
        <div className="space-y-2">
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label>Induction year</Label>
          <Input
            type="number"
            value={inductionYear}
            onChange={(e) => setInductionYear(parseInt(e.target.value, 10))}
            min={1900}
            max={2100}
            required
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Member type</Label>
          <div className="flex gap-3 text-sm pt-1">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={isPlayingMember}
                onChange={() => setIsPlayingMember(true)}
              />
              Playing
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={!isPlayingMember}
                onChange={() => setIsPlayingMember(false)}
              />
              Non-playing
            </label>
          </div>
        </div>
        <div className="space-y-2">
          <Label>Role label (optional, e.g. "Scorer")</Label>
          <Input value={roleLabel} onChange={(e) => setRoleLabel(e.target.value)} />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Linked player (optional)</Label>
        <PlayerTypeahead value={player} onChange={setPlayer} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="blurb">
          Blurb{" "}
          <span className="text-xs text-muted-foreground font-normal">
            (use a blank line between paragraphs)
          </span>
        </Label>
        <textarea
          id="blurb"
          value={blurb}
          onChange={(e) => setBlurb(e.target.value)}
          rows={8}
          className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-sans"
        />
      </div>

      <div className="flex gap-3">
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
