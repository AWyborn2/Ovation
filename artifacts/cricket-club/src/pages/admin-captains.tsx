import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListCaptains,
  useCreateCaptain,
  useUpdateCaptain,
  useDeleteCaptain,
  getListCaptainsQueryKey,
  type Captain,
} from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { ListSkeleton, QueryError, EmptyState } from "@/components/data-states";
import { useConfirm } from "@/components/confirm-dialog";
import { DataTable, EditDrawer, StatusPill, type DataTableColumn } from "@/components/admin-ui";
import { Plus } from "lucide-react";

const GRADES = [
  "A Grade",
  "B Grade",
  "C Grade",
  "D Grade",
  "E Grade",
  "F Grade",
  "Female A Grade",
  "Female B Grade",
  "PPL",
  "Colts",
];

type CaptainFormValues = {
  username: string;
  displayName: string;
  password: string;
  grades: string[];
};

export default function AdminCaptains() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { data: captains, isLoading, isError, refetch } = useListCaptains();
  const createCaptain = useCreateCaptain();
  const deleteCaptain = useDeleteCaptain();
  const [showNew, setShowNew] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListCaptainsQueryKey() });

  const onMutationError = (e: unknown) => {
    const status = (e as { status?: number } | null)?.status;
    if (status === 409) {
      setError("That username is already taken.");
      return;
    }
    const msg = handleAdminMutationError(e);
    if (msg) setError(msg);
  };

  const sorted = [...(captains ?? [])].sort((a, b) => a.username.localeCompare(b.username));
  const editing = sorted.find((c) => c.id === editingId) ?? null;

  const remove = async (captain: Captain) => {
    if (
      !(await confirm({
        title: "Delete captain",
        description: `Delete captain "${captain.displayName}"?`,
        confirmText: "Delete",
        destructive: true,
      }))
    )
      return;
    setError(null);
    deleteCaptain.mutate(
      { id: captain.id },
      {
        onSuccess: () => {
          setEditingId(null);
          invalidate();
        },
        onError: onMutationError,
      },
    );
  };

  const columns: DataTableColumn<Captain>[] = [
    {
      key: "name",
      header: "Captain",
      cell: (c) => <span className="font-semibold">{c.displayName}</span>,
    },
    {
      key: "username",
      header: "Username",
      cell: (c) => <span className="text-muted-foreground">@{c.username}</span>,
    },
    {
      key: "grades",
      header: "Grades",
      cell: (c) =>
        c.grades.length > 0 ? (
          c.grades.join(", ")
        ) : (
          <StatusPill tone="attention">No grades</StatusPill>
        ),
    },
  ];

  return (
    <div className="space-y-5">
      <p className="max-w-[75ch] text-[15px] text-muted-foreground">
        Create grade captain logins and grant each one the grades they vote for. Captains sign in at{" "}
        <code>/captain</code> to submit their 3-2-1 votes each round.
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
          label="Captains"
          rows={sorted}
          columns={columns}
          getRowId={(c) => c.id}
          searchText={(c) => `${c.displayName} ${c.username} ${c.grades.join(" ")}`}
          searchPlaceholder="Search captains"
          onRowClick={(c) => setEditingId(c.id)}
          toolbarAction={
            <Button onClick={() => setShowNew(true)}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden />
              New captain
            </Button>
          }
          emptyState={
            <EmptyState
              title="No captains yet"
              message="Create a captain login to let them submit votes."
            />
          }
          minWidth={560}
        />
      )}

      <EditDrawer open={showNew} onOpenChange={setShowNew} title="New captain">
        {showNew && (
          <CaptainForm
            initial={{ username: "", displayName: "", password: "", grades: [] }}
            requirePassword
            pending={createCaptain.isPending}
            onSubmit={(values) => {
              setError(null);
              createCaptain.mutate(
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
            submitLabel="Create captain"
          />
        )}
      </EditDrawer>

      <EditDrawer
        open={editing != null}
        onOpenChange={(o) => !o && setEditingId(null)}
        title={editing ? `Edit ${editing.displayName}` : ""}
        description={editing ? `@${editing.username}` : undefined}
        footer={
          editing ? (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled={deleteCaptain.isPending}
              onClick={() => remove(editing)}
            >
              Delete
            </Button>
          ) : undefined
        }
      >
        {editing && (
          <EditCaptain
            captain={editing}
            onError={onMutationError}
            onSaved={() => {
              setEditingId(null);
              invalidate();
            }}
          />
        )}
      </EditDrawer>
    </div>
  );
}

function EditCaptain({
  captain,
  onError,
  onSaved,
}: {
  captain: Captain;
  onError: (e: unknown) => void;
  onSaved: () => void;
}) {
  const updateCaptain = useUpdateCaptain();
  return (
    <CaptainForm
      initial={{
        username: captain.username,
        displayName: captain.displayName,
        password: "",
        grades: captain.grades,
      }}
      pending={updateCaptain.isPending}
      passwordHint="Leave blank to keep the current password"
      onSubmit={(values) => {
        updateCaptain.mutate(
          {
            id: captain.id,
            data: {
              username: values.username,
              displayName: values.displayName,
              grades: values.grades,
              ...(values.password ? { password: values.password } : {}),
            },
          },
          { onSuccess: onSaved, onError },
        );
      }}
      onCancel={onSaved}
      submitLabel="Save changes"
    />
  );
}

function CaptainForm({
  initial,
  pending,
  onSubmit,
  onCancel,
  submitLabel,
  requirePassword,
  passwordHint,
}: {
  initial: CaptainFormValues;
  pending: boolean;
  onSubmit: (v: CaptainFormValues) => void;
  onCancel: () => void;
  submitLabel: string;
  requirePassword?: boolean;
  passwordHint?: string;
}) {
  const [username, setUsername] = useState(initial.username);
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [password, setPassword] = useState("");
  const [grades, setGrades] = useState<string[]>(initial.grades);

  const toggleGrade = (g: string) =>
    setGrades((cur) => (cur.includes(g) ? cur.filter((x) => x !== g) : [...cur, g]));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !displayName.trim()) return;
    if (requirePassword && !password) return;
    onSubmit({
      username: username.trim(),
      displayName: displayName.trim(),
      password,
      grades,
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Username</Label>
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. agrade-captain"
            autoComplete="off"
            required
          />
        </div>
        <div className="space-y-2">
          <Label>Display name</Label>
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="e.g. A Grade Captain"
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Password</Label>
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          required={requirePassword}
        />
        {passwordHint && <p className="text-xs text-muted-foreground">{passwordHint}</p>}
      </div>

      <div className="space-y-2">
        <Label>Grades this captain votes for</Label>
        <div className="grid grid-cols-2 gap-2">
          {GRADES.map((g) => (
            <label key={g} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={grades.includes(g)} onChange={() => toggleGrade(g)} />
              {g}
            </label>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <Button
          type="submit"
          disabled={
            pending || !username.trim() || !displayName.trim() || (requirePassword && !password)
          }
        >
          {pending ? "Saving…" : submitLabel}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
