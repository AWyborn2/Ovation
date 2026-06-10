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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { handleAdminMutationError } from "@/lib/admin-auth";

type PersonFormValues = { name: string; bio: string };

export default function AdminPeople() {
  const queryClient = useQueryClient();
  const { data: people, isLoading } = useListPeople();
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

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif font-bold">Admin · Non-player people</h1>
          <p className="text-muted-foreground mt-1">
            Club officials who served the club but never played (e.g. Secretaries
            and Treasurers). Add them here, then link them on committee or captain
            rows so their name becomes a clickable profile.
          </p>
        </div>
        <Button
          onClick={() => setShowNew((v) => !v)}
          variant={showNew ? "outline" : "default"}
        >
          {showNew ? "Close form" : "Add person"}
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
            <CardTitle>Add a non-player person</CardTitle>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (people ?? []).length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground italic">
            No non-player people yet.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="space-y-2 pt-6">
            {(people ?? []).map((p: NonPlayerPerson) =>
              editingId === p.id ? (
                <div
                  key={p.id}
                  className="rounded-md border border-border bg-muted/30 p-4"
                >
                  <PersonForm
                    initial={{ name: p.name, bio: p.bio ?? "" }}
                    pending={updatePerson.isPending}
                    submitLabel="Save changes"
                    onSubmit={(values) => {
                      setError(null);
                      updatePerson.mutate(
                        {
                          id: p.id,
                          data: { name: values.name, bio: values.bio || null },
                        },
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
                </div>
              ) : (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">
                      {p.name}
                      <span className="ml-2 text-xs text-muted-foreground">
                        #{p.id}
                      </span>
                    </div>
                    {p.bio && (
                      <div className="text-sm text-muted-foreground truncate">
                        {p.bio}
                      </div>
                    )}
                  </div>
                  <div className="space-x-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingId(p.id)}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={deletePerson.isPending}
                      onClick={() => {
                        if (
                          !confirm(
                            `Delete "${p.name}"? Any committee/captain rows linked to them will revert to plain text.`,
                          )
                        )
                          return;
                        setError(null);
                        deletePerson.mutate(
                          { id: p.id },
                          { onSuccess: invalidate, onError: onMutationError },
                        );
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ),
            )}
          </CardContent>
        </Card>
      )}
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
