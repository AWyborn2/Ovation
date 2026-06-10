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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { handleAdminMutationError, useCurrentAdmin } from "@/lib/admin-auth";
import { ListSkeleton, QueryError, EmptyState } from "@/components/data-states";
import { useConfirm } from "@/components/confirm-dialog";

export default function AdminUsers() {
  const qc = useQueryClient();
  const me = useCurrentAdmin();
  const confirm = useConfirm();
  const { data: admins, isLoading, isError, refetch } = useListAdmins();
  const createAdmin = useCreateAdmin();
  const updateAdmin = useUpdateAdmin();
  const deleteAdmin = useDeleteAdmin();
  const [error, setError] = useState<string | null>(null);
  const [newUsername, setNewUsername] = useState("");
  const [newDisplay, setNewDisplay] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: getListAdminsQueryKey() });
  const onErr = (e: unknown) => setError(handleAdminMutationError(e));

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!newUsername.trim() || !newDisplay.trim() || !newPassword) {
      setError("All fields required");
      return;
    }
    createAdmin.mutate(
      { data: { username: newUsername.trim(), displayName: newDisplay.trim(), password: newPassword } },
      {
        onSuccess: () => {
          setNewUsername("");
          setNewDisplay("");
          setNewPassword("");
          invalidate();
        },
        onError: onErr,
      },
    );
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-serif font-bold">Admin users</h1>
      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Add admin</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={create} className="grid gap-3 md:grid-cols-4 md:items-end">
            <div className="space-y-1">
              <Label>Username</Label>
              <Input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Display name</Label>
              <Input value={newDisplay} onChange={(e) => setNewDisplay(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Password</Label>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </div>
            <Button type="submit" disabled={createAdmin.isPending}>
              {createAdmin.isPending ? "Adding…" : "Add admin"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Existing admins</CardTitle>
        </CardHeader>
        <CardContent>
          {isError ? (
            <QueryError onRetry={() => refetch()} />
          ) : isLoading ? (
            <ListSkeleton />
          ) : !admins?.length ? (
            <EmptyState title="No admins" message="Add an admin user to get started." />
          ) : (
            <div className="space-y-3">
              {admins.map((a) => (
                <AdminRow
                  key={a.id}
                  admin={a}
                  isSelf={me.data?.id === a.id}
                  onSave={(patch) =>
                    updateAdmin.mutate(
                      { id: a.id, data: patch },
                      { onSuccess: invalidate, onError: onErr },
                    )
                  }
                  onDelete={async () => {
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
                      { onSuccess: invalidate, onError: onErr },
                    );
                  }}
                  pending={updateAdmin.isPending || deleteAdmin.isPending}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AdminRow({
  admin,
  isSelf,
  onSave,
  onDelete,
  pending,
}: {
  admin: Admin;
  isSelf: boolean;
  onSave: (patch: { username?: string; displayName?: string; password?: string }) => void;
  onDelete: () => void;
  pending: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [username, setUsername] = useState(admin.username);
  const [displayName, setDisplayName] = useState(admin.displayName);
  const [password, setPassword] = useState("");

  if (!editing) {
    return (
      <div className="flex items-center justify-between gap-3 border-b pb-3 last:border-0 last:pb-0">
        <div>
          <div className="font-medium">
            {admin.displayName} {isSelf && <span className="text-xs text-muted-foreground">(you)</span>}
          </div>
          <div className="text-xs text-muted-foreground">@{admin.username}</div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button size="sm" variant="outline" onClick={onDelete} disabled={pending}>
            Delete
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end border-b pb-3 last:border-0">
      <div className="space-y-1">
        <Label>Username</Label>
        <Input value={username} onChange={(e) => setUsername(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>Display name</Label>
        <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label>New password</Label>
        <Input
          type="password"
          placeholder="(leave blank to keep)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={() => {
            onSave({
              username: username !== admin.username ? username : undefined,
              displayName: displayName !== admin.displayName ? displayName : undefined,
              password: password || undefined,
            });
            setEditing(false);
            setPassword("");
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
            setUsername(admin.username);
            setDisplayName(admin.displayName);
            setPassword("");
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
