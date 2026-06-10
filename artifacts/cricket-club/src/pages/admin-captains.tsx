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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { ListSkeleton, QueryError, EmptyState } from "@/components/data-states";
import { useConfirm } from "@/components/confirm-dialog";

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

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListCaptainsQueryKey() });

  const onMutationError = (e: unknown) => {
    const status = (e as { status?: number } | null)?.status;
    if (status === 409) {
      setError("That username is already taken.");
      return;
    }
    const msg = handleAdminMutationError(e);
    if (msg) setError(msg);
  };

  const sorted = [...(captains ?? [])].sort((a, b) =>
    a.username.localeCompare(b.username),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-muted-foreground mt-1">
            Create grade captain logins and grant each one the grades they vote
            for. Captains sign in at <code>/captain</code> to submit their 3-2-1
            votes each round.
          </p>
        </div>
        <Button onClick={() => setShowNew((v) => !v)} variant={showNew ? "outline" : "default"}>
          {showNew ? "Close form" : "New captain"}
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {showNew && (
        <Card>
          <CardHeader>
            <CardTitle>New captain</CardTitle>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
      )}

      {isError ? (
        <QueryError onRetry={() => refetch()} />
      ) : isLoading ? (
        <ListSkeleton />
      ) : sorted.length === 0 ? (
        <EmptyState
          title="No captains yet"
          message="Create a captain login to let them submit votes."
        />
      ) : (
        sorted.map((captain) => (
          <Card key={captain.id}>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div className="min-w-0">
                <CardTitle className="text-xl">{captain.displayName}</CardTitle>
                <div className="text-xs text-muted-foreground mt-1">
                  @{captain.username} ·{" "}
                  {captain.grades.length > 0
                    ? captain.grades.join(", ")
                    : "no grades assigned"}
                </div>
              </div>
              <div className="space-x-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditingId(editingId === captain.id ? null : captain.id)}
                >
                  {editingId === captain.id ? "Close" : "Edit"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={deleteCaptain.isPending}
                  onClick={async () => {
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
                      { onSuccess: invalidate, onError: onMutationError },
                    );
                  }}
                >
                  Delete
                </Button>
              </div>
            </CardHeader>
            {editingId === captain.id && (
              <CardContent>
                <EditCaptain
                  captain={captain}
                  onError={onMutationError}
                  onSaved={() => {
                    setEditingId(null);
                    invalidate();
                  }}
                />
              </CardContent>
            )}
          </Card>
        ))
      )}
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
      <div className="grid gap-4 md:grid-cols-2">
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
        {passwordHint && (
          <p className="text-xs text-muted-foreground">{passwordHint}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label>Grades this captain votes for</Label>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {GRADES.map((g) => (
            <label key={g} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={grades.includes(g)}
                onChange={() => toggleGrade(g)}
              />
              {g}
            </label>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <Button
          type="submit"
          disabled={
            pending ||
            !username.trim() ||
            !displayName.trim() ||
            (requirePassword && !password)
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
