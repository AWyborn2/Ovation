import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAllJuniorOfficeBearers,
  useCreateJuniorOfficeBearer,
  useUpdateJuniorOfficeBearer,
  useDeleteJuniorOfficeBearer,
  getListAllJuniorOfficeBearersQueryKey,
  getListJuniorOfficeBearersQueryKey,
} from "@workspace/api-client-react";
import type { JuniorOfficeBearer } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { handleAdminMutationError } from "@/lib/admin-auth";
import {
  JuniorPlayerTypeahead,
  type SelectedJuniorPlayer,
} from "@/components/junior-player-typeahead";
import { ListSkeleton, QueryError, EmptyState } from "@/components/data-states";
import { useConfirm } from "@/components/confirm-dialog";

const OFFICE_ROLES = [
  "President",
  "Vice President",
  "Secretary",
  "Treasurer",
  "Registrar",
  "Junior Coordinator",
  "Coaching Coordinator",
  "Committee Member",
];

function formatSeason(year: number): string {
  const next = (year + 1) % 100;
  return `${year}/${next.toString().padStart(2, "0")}`;
}

type FormValues = {
  season: number;
  role: string;
  roleMode: "preset" | "custom";
  participantId: string | null;
  name: string;
  displayOrder: number;
  published: boolean;
};

export default function AdminJuniorCommittee() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { data: bearers, isLoading, isError, refetch } =
    useListAllJuniorOfficeBearers();
  const createBearer = useCreateJuniorOfficeBearer();
  const updateBearer = useUpdateJuniorOfficeBearer();
  const deleteBearer = useDeleteJuniorOfficeBearer();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: getListAllJuniorOfficeBearersQueryKey(),
    });
    queryClient.invalidateQueries({
      queryKey: getListJuniorOfficeBearersQueryKey(),
    });
  };

  const onMutationError = (e: unknown) => {
    const msg = handleAdminMutationError(e);
    if (msg) setError(msg);
  };

  const seasons = useMemo(() => {
    const bySeason = new Map<number, JuniorOfficeBearer[]>();
    for (const r of bearers ?? []) {
      if (!bySeason.has(r.season)) bySeason.set(r.season, []);
      bySeason.get(r.season)!.push(r);
    }
    return [...bySeason.entries()]
      .map(([season, rs]) => ({
        season,
        bearers: [...rs].sort(
          (a, b) =>
            a.displayOrder - b.displayOrder ||
            a.role.localeCompare(b.role) ||
            a.id - b.id,
        ),
      }))
      .sort((a, b) => b.season - a.season);
  }, [bearers]);

  const setPublishedForSeason = (season: number, published: boolean) => {
    const targets = (bearers ?? []).filter(
      (r) => r.season === season && r.published !== published,
    );
    setError(null);
    for (const r of targets) {
      updateBearer.mutate(
        { id: r.id, data: { published } },
        { onError: onMutationError, onSuccess: invalidate },
      );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-muted-foreground mt-1">
            Record Halls Head Junior Cricket Club office bearers for each season.
            Published seasons appear on the public Juniors → Office Bearers page.
            This data is kept completely separate from the senior committee.
          </p>
        </div>
        <Button
          onClick={() => setShowNew((v) => !v)}
          variant={showNew ? "outline" : "default"}
        >
          {showNew ? "Close form" : "Add office bearer"}
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
            <CardTitle>Add an office bearer</CardTitle>
          </CardHeader>
          <CardContent>
            <BearerForm
              initial={{
                season: new Date().getFullYear(),
                role: OFFICE_ROLES[0],
                roleMode: "preset",
                participantId: null,
                name: "",
                displayOrder: 0,
                published: true,
              }}
              pending={createBearer.isPending}
              onSubmit={(values) => {
                setError(null);
                createBearer.mutate(
                  {
                    data: {
                      season: values.season,
                      role: values.role,
                      name: values.name,
                      participantId: values.participantId,
                      displayOrder: values.displayOrder,
                      published: values.published,
                    },
                  },
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
              submitLabel="Add office bearer"
            />
          </CardContent>
        </Card>
      )}

      {isError ? (
        <QueryError onRetry={() => refetch()} />
      ) : isLoading ? (
        <ListSkeleton />
      ) : seasons.length === 0 ? (
        <EmptyState
          title="No junior office bearers yet"
          message="Add an office bearer to start building the junior committee board."
        />
      ) : (
        seasons.map((group) => {
          const allPublished = group.bearers.every((r) => r.published);
          const nonePublished = group.bearers.every((r) => !r.published);
          return (
            <Card key={group.season}>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <CardTitle className="text-xl">
                  {formatSeason(group.season)}
                  <span className="ml-2 align-middle text-xs font-normal text-muted-foreground">
                    {group.bearers.length}{" "}
                    {group.bearers.length === 1 ? "record" : "records"}
                  </span>
                </CardTitle>
                <div className="space-x-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={allPublished || updateBearer.isPending}
                    onClick={() => setPublishedForSeason(group.season, true)}
                  >
                    Publish all
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={nonePublished || updateBearer.isPending}
                    onClick={() => setPublishedForSeason(group.season, false)}
                  >
                    Unpublish all
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {group.bearers.map((r) =>
                  editingId === r.id ? (
                    <div
                      key={r.id}
                      className="rounded-md border border-border bg-muted/30 p-4"
                    >
                      <BearerForm
                        initial={{
                          season: r.season,
                          role: OFFICE_ROLES.includes(r.role)
                            ? r.role
                            : r.role,
                          roleMode: OFFICE_ROLES.includes(r.role)
                            ? "preset"
                            : "custom",
                          participantId: r.participantId ?? null,
                          name: r.name,
                          displayOrder: r.displayOrder,
                          published: r.published,
                        }}
                        pending={updateBearer.isPending}
                        onSubmit={(values) => {
                          setError(null);
                          updateBearer.mutate(
                            {
                              id: r.id,
                              data: {
                                season: values.season,
                                role: values.role,
                                name: values.name,
                                participantId: values.participantId,
                                displayOrder: values.displayOrder,
                                published: values.published,
                              },
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
                        submitLabel="Save changes"
                      />
                    </div>
                  ) : (
                    <div
                      key={r.id}
                      className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
                    >
                      <div className="min-w-0">
                        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                          {r.role}
                        </span>
                        <div className="font-medium truncate">
                          {r.name}
                          {r.participantId != null && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              linked
                            </span>
                          )}
                          {!r.published && (
                            <span className="ml-2 text-xs font-normal rounded bg-amber-500/15 text-amber-700 dark:text-amber-400 px-2 py-0.5">
                              Draft
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="space-x-2 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingId(r.id)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={deleteBearer.isPending}
                          onClick={async () => {
                            if (
                              !(await confirm({
                                title: "Delete office bearer",
                                description: `Delete "${r.name}" as ${r.role} for ${formatSeason(r.season)}?`,
                                confirmText: "Delete",
                                destructive: true,
                              }))
                            )
                              return;
                            setError(null);
                            deleteBearer.mutate(
                              { id: r.id },
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
          );
        })
      )}
    </div>
  );
}

function BearerForm({
  initial,
  pending,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  initial: FormValues;
  pending: boolean;
  onSubmit: (values: FormValues) => void;
  onCancel: () => void;
  submitLabel: string;
}) {
  const [values, setValues] = useState<FormValues>(initial);
  const selectedPlayer: SelectedJuniorPlayer | null =
    values.participantId != null
      ? { participantId: values.participantId, displayName: values.name }
      : null;

  const set = <K extends keyof FormValues>(key: K, v: FormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: v }));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Season (start year)</Label>
          <Input
            type="number"
            value={values.season}
            onChange={(e) => set("season", parseInt(e.target.value, 10) || 0)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Role</Label>
          {values.roleMode === "preset" ? (
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={
                OFFICE_ROLES.includes(values.role) ? values.role : "__custom__"
              }
              onChange={(e) => {
                if (e.target.value === "__custom__") {
                  setValues((prev) => ({ ...prev, roleMode: "custom", role: "" }));
                } else {
                  set("role", e.target.value);
                }
              }}
            >
              {OFFICE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
              <option value="__custom__">Other (type a role)…</option>
            </select>
          ) : (
            <Input
              value={values.role}
              placeholder="e.g. Equipment Officer"
              onChange={(e) => set("role", e.target.value)}
            />
          )}
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Display order</Label>
          <Input
            type="number"
            value={values.displayOrder}
            onChange={(e) =>
              set("displayOrder", parseInt(e.target.value, 10) || 0)
            }
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Name (as displayed)</Label>
        <Input
          value={values.name}
          placeholder="e.g. John Smith"
          onChange={(e) => set("name", e.target.value)}
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Link to junior player (optional)</Label>
        <JuniorPlayerTypeahead
          value={selectedPlayer}
          onChange={(p) => {
            if (p) {
              set("participantId", p.participantId);
              if (!values.name.trim()) set("name", p.displayName);
            } else {
              set("participantId", null);
            }
          }}
        />
        <p className="text-xs text-muted-foreground">
          Leave unlinked for names without a junior player record.
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={values.published}
          onChange={(e) => set("published", e.target.checked)}
        />
        Published (visible to the public)
      </label>

      <div className="flex gap-2">
        <Button
          disabled={pending || !values.name.trim() || !values.role.trim()}
          onClick={() => onSubmit(values)}
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
