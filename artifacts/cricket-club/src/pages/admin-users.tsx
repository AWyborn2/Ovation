import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAdmins,
  useCreateAdmin,
  useUpdateAdmin,
  useDeleteAdmin,
  getListAdminsQueryKey,
  type Admin,
} from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { InitialsAvatar, PageHeader } from "@/components/broadcast";
import { handleAdminMutationError, useCurrentAdmin } from "@/lib/admin-auth";
import { ListSkeleton, QueryError, EmptyState } from "@/components/data-states";
import { useConfirm } from "@/components/confirm-dialog";
import { DataTable, EditDrawer, type DataTableColumn } from "@/components/admin-ui";
import { Plus } from "lucide-react";

export default function AdminUsers() {
  const qc = useQueryClient();
  const me = useCurrentAdmin();
  const confirm = useConfirm();
  const { data: admins, isLoading, isError, refetch } = useListAdmins();
  const createAdmin = useCreateAdmin();
  const updateAdmin = useUpdateAdmin();
  const deleteAdmin = useDeleteAdmin();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [newUsername, setNewUsername] = useState("");
  const [newDisplay, setNewDisplay] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: getListAdminsQueryKey() });
  const onErr = (e: unknown) => setError(handleAdminMutationError(e));
  const rows = admins ?? [];
  const editing = rows.find((a) => a.id === editingId) ?? null;

  const create = () => {
    setError(null);
    if (!newUsername.trim() || !newDisplay.trim() || !newPassword) {
      setError("All fields required");
      return;
    }
    createAdmin.mutate(
      {
        data: {
          username: newUsername.trim(),
          displayName: newDisplay.trim(),
          password: newPassword,
        },
      },
      {
        onSuccess: () => {
          setNewUsername("");
          setNewDisplay("");
          setNewPassword("");
          setAdding(false);
          invalidate();
        },
        onError: onErr,
      },
    );
  };

  const remove = async (a: Admin) => {
    if (
      !(await confirm({
        title: "Delete admin",
        description: `Delete admin "${a.username}"?`,
        confirmText: "Delete",
        destructive: true,
      }))
    )
      return;
    setError(null);
    deleteAdmin.mutate(
      { id: a.id },
      {
        onSuccess: () => {
          setEditingId(null);
          invalidate();
        },
        onError: onErr,
      },
    );
  };

  const columns: DataTableColumn<Admin>[] = [
    {
      key: "name",
      header: "Admin",
      cell: (a) => (
        <span className="flex items-center gap-3">
          <InitialsAvatar name={a.displayName} size={30} />
          <span className="font-semibold">
            {a.displayName}
            {me.data?.id === a.id && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">(you)</span>
            )}
          </span>
        </span>
      ),
    },
    {
      key: "username",
      header: "Username",
      cell: (a) => <span className="text-muted-foreground">@{a.username}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Admin users"
        subtitle="Add, rename, reset passwords and remove the admins for this club."
      />
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
          label="Admin users"
          rows={rows}
          columns={columns}
          getRowId={(a) => a.id}
          searchText={(a) => `${a.displayName} ${a.username}`}
          searchPlaceholder="Search admins"
          onRowClick={(a) => setEditingId(a.id)}
          toolbarAction={
            <Button onClick={() => setAdding(true)}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden />
              Add admin
            </Button>
          }
          emptyState={<EmptyState title="No admins" message="Add an admin user to get started." />}
          minWidth={480}
        />
      )}

      <EditDrawer
        open={adding}
        onOpenChange={setAdding}
        title="Add admin"
        onSave={create}
        saving={createAdmin.isPending}
        saveLabel="Add admin"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="na-username">Username</Label>
            <Input
              id="na-username"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="na-display">Display name</Label>
            <Input
              id="na-display"
              value={newDisplay}
              onChange={(e) => setNewDisplay(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="na-password">Password</Label>
            <Input
              id="na-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
        </form>
      </EditDrawer>

      <EditDrawer
        open={editing != null}
        onOpenChange={(o) => !o && setEditingId(null)}
        title={editing?.displayName ?? ""}
        description={editing ? `@${editing.username}` : undefined}
        footer={
          editing ? (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled={deleteAdmin.isPending}
              onClick={() => remove(editing)}
            >
              Delete
            </Button>
          ) : undefined
        }
      >
        {editing && (
          <AdminEditor
            key={editing.id}
            admin={editing}
            pending={updateAdmin.isPending}
            onCancel={() => setEditingId(null)}
            onSave={(patch) =>
              updateAdmin.mutate(
                { id: editing.id, data: patch },
                {
                  onSuccess: () => {
                    setEditingId(null);
                    invalidate();
                  },
                  onError: onErr,
                },
              )
            }
          />
        )}
      </EditDrawer>
    </div>
  );
}

function AdminEditor({
  admin,
  pending,
  onSave,
  onCancel,
}: {
  admin: Admin;
  pending: boolean;
  onSave: (patch: { username?: string; displayName?: string; password?: string }) => void;
  onCancel: () => void;
}) {
  const [username, setUsername] = useState(admin.username);
  const [displayName, setDisplayName] = useState(admin.displayName);
  const [password, setPassword] = useState("");

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="ea-username">Username</Label>
        <Input id="ea-username" value={username} onChange={(e) => setUsername(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="ea-display">Display name</Label>
        <Input
          id="ea-display"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="ea-password">New password</Label>
        <Input
          id="ea-password"
          type="password"
          placeholder="(leave blank to keep)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />
      </div>
      <div className="flex gap-2">
        <Button
          disabled={pending}
          onClick={() =>
            onSave({
              username: username !== admin.username ? username : undefined,
              displayName: displayName !== admin.displayName ? displayName : undefined,
              password: password || undefined,
            })
          }
        >
          {pending ? "Saving…" : "Save changes"}
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
