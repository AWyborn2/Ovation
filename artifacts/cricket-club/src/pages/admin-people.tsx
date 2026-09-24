import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListPeople,
  useCreatePerson,
  useUpdatePerson,
  useDeletePerson,
  getListPeopleQueryKey,
} from "@workspace/api-client-react";
import type { NonPlayerPerson } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { ListSkeleton, QueryError, EmptyState } from "@/components/data-states";
import { useConfirm } from "@/components/confirm-dialog";
import { DataTable, EditDrawer, type DataTableColumn } from "@/components/admin-ui";
import { Plus } from "lucide-react";

type PersonFormValues = { name: string; bio: string };

export default function AdminPeople() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { data: people, isLoading, isError, refetch } = useListPeople();
  const createPerson = useCreatePerson();
  const updatePerson = useUpdatePerson();
  const deletePerson = useDeletePerson();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListPeopleQueryKey() });
  };

  const onMutationError = (e: unknown) => {
    const msg = handleAdminMutationError(e);
    if (msg) setError(msg);
  };

  const rows = people ?? [];
  const editing = rows.find((p) => p.id === editingId) ?? null;

  const remove = async (p: NonPlayerPerson) => {
    if (
      !(await confirm({
        title: "Delete person",
        description: `Delete "${p.name}"? Any committee/captain rows linked to them will revert to plain text.`,
        confirmText: "Delete",
        destructive: true,
      }))
    )
      return;
    setError(null);
    deletePerson.mutate(
      { id: p.id },
      {
        onSuccess: () => {
          setEditingId(null);
          invalidate();
        },
        onError: onMutationError,
      },
    );
  };

  const columns: DataTableColumn<NonPlayerPerson>[] = [
    {
      key: "name",
      header: "Name",
      cell: (p) => <span className="font-semibold">{p.name}</span>,
    },
    {
      key: "bio",
      header: "Bio",
      cell: (p) => (
        <span className="line-clamp-1 max-w-[48ch] text-muted-foreground">{p.bio || "—"}</span>
      ),
    },
    {
      key: "id",
      header: "ID",
      cell: (p) => <span className="tabular-nums text-muted-foreground">#{p.id}</span>,
      className: "w-20",
    },
  ];

  return (
    <div className="space-y-5">
      <p className="max-w-[75ch] text-[15px] text-muted-foreground">
        Club officials who served the club but never played (e.g. Secretaries and Treasurers). Add
        them here, then link them on committee or captain rows so their name becomes a clickable
        profile.
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
          label="Non-player people"
          rows={rows}
          columns={columns}
          getRowId={(p) => p.id}
          searchText={(p) => `${p.name} ${p.bio ?? ""}`}
          searchPlaceholder="Search people"
          onRowClick={(p) => setEditingId(p.id)}
          toolbarAction={
            <Button onClick={() => setShowNew(true)}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden />
              Add person
            </Button>
          }
          emptyState={
            <EmptyState
              title="No non-player people yet"
              message="Add a club official who never played to link them on committee or captain rows."
            />
          }
          minWidth={520}
        />
      )}

      <EditDrawer open={showNew} onOpenChange={setShowNew} title="Add a non-player person">
        {showNew && (
          <PersonForm
            initial={{ name: "", bio: "" }}
            pending={createPerson.isPending}
            submitLabel="Add person"
            onSubmit={(values) => {
              setError(null);
              createPerson.mutate(
                { data: { name: values.name, bio: values.bio || null } },
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
          />
        )}
      </EditDrawer>

      <EditDrawer
        open={editing != null}
        onOpenChange={(o) => !o && setEditingId(null)}
        title={editing ? `Edit ${editing.name}` : ""}
        footer={
          editing ? (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled={deletePerson.isPending}
              onClick={() => remove(editing)}
            >
              Delete
            </Button>
          ) : undefined
        }
      >
        {editing && (
          <PersonForm
            initial={{ name: editing.name, bio: editing.bio ?? "" }}
            pending={updatePerson.isPending}
            submitLabel="Save changes"
            onSubmit={(values) => {
              setError(null);
              updatePerson.mutate(
                { id: editing.id, data: { name: values.name, bio: values.bio || null } },
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
          />
        )}
      </EditDrawer>
    </div>
  );
}

function PersonForm({
  initial,
  pending,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: PersonFormValues;
  pending: boolean;
  submitLabel: string;
  onSubmit: (values: PersonFormValues) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<PersonFormValues>(initial);
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label className="text-xs">Name</Label>
        <Input
          value={values.name}
          placeholder="e.g. Raquel Willey"
          onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Bio (optional)</Label>
        <textarea
          className="w-full min-h-24 rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={values.bio}
          placeholder="A short note about their contribution to the club."
          onChange={(e) => setValues((v) => ({ ...v, bio: e.target.value }))}
        />
      </div>
      <div className="flex gap-2">
        <Button
          disabled={pending || !values.name.trim()}
          onClick={() => onSubmit({ name: values.name.trim(), bio: values.bio.trim() })}
        >
          {pending ? "Saving…" : submitLabel}
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
