import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAllClubRoles,
  useCreateClubRole,
  useUpdateClubRole,
  useDeleteClubRole,
  useListPeople,
  getListAllClubRolesQueryKey,
  getListClubRolesQueryKey,
} from "@workspace/api-client-react";
import type { ClubRole, NonPlayerPerson } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { PlayerTypeahead, type SelectedPlayer } from "@/components/player-typeahead";

const OFFICE_ROLES = [
  "President",
  "Vice President",
  "Secretary",
  "Treasurer",
  "Director of Cricket",
  "Club Captain",
  "Coach",
];

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

const GRADE_CAPTAIN_ROLE = "Grade Captain";

function formatSeason(year: number): string {
  const next = (year + 1) % 100;
  return `${year}/${next.toString().padStart(2, "0")}`;
}

function splitName(id: number, fullName: string): SelectedPlayer {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) return { id, givenName: fullName.trim(), surname: "" };
  const surname = parts[parts.length - 1];
  const givenName = parts.slice(0, -1).join(" ");
  return { id, givenName, surname };
}

type RoleFormValues = {
  season: number;
  kind: "office" | "captain";
  role: string;
  grade: string | null;
  playerId: number | null;
  nonPlayerId: number | null;
  name: string;
  displayOrder: number;
  published: boolean;
};

export default function AdminCommittee() {
  const queryClient = useQueryClient();
  const { data: roles, isLoading } = useListAllClubRoles();
  const createRole = useCreateClubRole();
  const updateRole = useUpdateClubRole();
  const deleteRole = useDeleteClubRole();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListAllClubRolesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListClubRolesQueryKey() });
  };

  const onMutationError = (e: unknown) => {
    const msg = handleAdminMutationError(e);
    if (msg) setError(msg);
  };

  const seasons = useMemo(() => {
    const bySeason = new Map<number, ClubRole[]>();
    for (const r of roles ?? []) {
      if (!bySeason.has(r.season)) bySeason.set(r.season, []);
      bySeason.get(r.season)!.push(r);
    }
    return [...bySeason.entries()]
      .map(([season, rs]) => ({
        season,
        roles: [...rs].sort(
          (a, b) =>
            a.displayOrder - b.displayOrder ||
            a.role.localeCompare(b.role) ||
            a.id - b.id,
        ),
      }))
      .sort((a, b) => b.season - a.season);
  }, [roles]);

  const setPublishedForSeason = (season: number, published: boolean) => {
    const targets = (roles ?? []).filter(
      (r) => r.season === season && r.published !== published,
    );
    setError(null);
    for (const r of targets) {
      updateRole.mutate(
        { id: r.id, data: { published } },
        { onError: onMutationError, onSuccess: invalidate },
      );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif font-bold">Admin · Committee</h1>
          <p className="text-muted-foreground mt-1">
            Record club office bearers and grade captains for each season. Office
            bearers appear on the public Committee board; grade captains appear on
            each grade's page. Only published records are shown publicly.
          </p>
        </div>
        <Button onClick={() => setShowNew((v) => !v)} variant={showNew ? "outline" : "default"}>
          {showNew ? "Close form" : "Add role"}
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
            <CardTitle>Add a role record</CardTitle>
          </CardHeader>
          <CardContent>
            <RoleForm
              initial={{
                season: new Date().getFullYear(),
                kind: "office",
                role: OFFICE_ROLES[0],
                grade: null,
                playerId: null,
                nonPlayerId: null,
                name: "",
                displayOrder: 0,
                published: true,
              }}
              pending={createRole.isPending}
              onSubmit={(values) => {
                setError(null);
                createRole.mutate(
                  {
                    data: {
                      season: values.season,
                      role: values.role,
                      grade: values.grade,
                      playerId: values.playerId,
                      nonPlayerId: values.nonPlayerId,
                      name: values.name,
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
              submitLabel="Add role"
            />
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : seasons.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground italic">
            No role records yet.
          </CardContent>
        </Card>
      ) : (
        seasons.map((group) => {
          const allPublished = group.roles.every((r) => r.published);
          const nonePublished = group.roles.every((r) => !r.published);
          return (
            <Card key={group.season}>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <CardTitle className="text-xl">
                  {formatSeason(group.season)}
                  <span className="ml-2 align-middle text-xs font-normal text-muted-foreground">
                    {group.roles.length}{" "}
                    {group.roles.length === 1 ? "record" : "records"}
                  </span>
                </CardTitle>
                <div className="space-x-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={allPublished || updateRole.isPending}
                    onClick={() => setPublishedForSeason(group.season, true)}
                  >
                    Publish all
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={nonePublished || updateRole.isPending}
                    onClick={() => setPublishedForSeason(group.season, false)}
                  >
                    Unpublish all
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {group.roles.map((r) =>
                  editingId === r.id ? (
                    <div
                      key={r.id}
                      className="rounded-md border border-border bg-muted/30 p-4"
                    >
                      <RoleForm
                        initial={{
                          season: r.season,
                          kind: r.grade != null ? "captain" : "office",
                          role: r.role,
                          grade: r.grade ?? null,
                          playerId: r.playerId ?? null,
                          nonPlayerId: r.nonPlayerId ?? null,
                          name: r.name,
                          displayOrder: r.displayOrder,
                          published: r.published,
                        }}
                        pending={updateRole.isPending}
                        onSubmit={(values) => {
                          setError(null);
                          updateRole.mutate(
                            {
                              id: r.id,
                              data: {
                                season: values.season,
                                role: values.role,
                                grade: values.grade,
                                playerId: values.playerId,
                                nonPlayerId: values.nonPlayerId,
                                name: values.name,
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
                          {r.grade != null ? `${r.grade} captain` : r.role}
                        </span>
                        <div className="font-medium truncate">
                          {r.name}
                          {r.playerId != null && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              linked #{r.playerId}
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
                          disabled={deleteRole.isPending}
                          onClick={() => {
                            if (
                              !confirm(
                                `Delete "${r.name}" as ${r.grade != null ? `${r.grade} captain` : r.role} for ${formatSeason(r.season)}?`,
                              )
                            )
                              return;
                            setError(null);
                            deleteRole.mutate(
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

function RoleForm({
  initial,
  pending,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  initial: RoleFormValues;
  pending: boolean;
  onSubmit: (values: RoleFormValues) => void;
  onCancel: () => void;
  submitLabel: string;
}) {
  const [values, setValues] = useState<RoleFormValues>(initial);
  const { data: people } = useListPeople();
  const selectedPlayer: SelectedPlayer | null =
    values.playerId != null ? splitName(values.playerId, values.name) : null;

  const set = <K extends keyof RoleFormValues>(key: K, v: RoleFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: v }));

  const setKind = (kind: "office" | "captain") => {
    setValues((prev) => ({
      ...prev,
      kind,
      role: kind === "captain" ? GRADE_CAPTAIN_ROLE : OFFICE_ROLES[0],
      grade: kind === "captain" ? prev.grade ?? GRADES[0] : null,
    }));
  };

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
          <Label className="text-xs">Type</Label>
          <select
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={values.kind}
            onChange={(e) => setKind(e.target.value as "office" | "captain")}
          >
            <option value="office">Office bearer</option>
            <option value="captain">Grade captain</option>
          </select>
        </div>
        {values.kind === "office" ? (
          <div className="space-y-1">
            <Label className="text-xs">Role</Label>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={values.role}
              onChange={(e) => set("role", e.target.value)}
            >
              {OFFICE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="space-y-1">
            <Label className="text-xs">Grade</Label>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={values.grade ?? GRADES[0]}
              onChange={(e) => set("grade", e.target.value)}
            >
              {GRADES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="space-y-1">
          <Label className="text-xs">Display order</Label>
          <Input
            type="number"
            value={values.displayOrder}
            onChange={(e) => set("displayOrder", parseInt(e.target.value, 10) || 0)}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Name (as displayed)</Label>
        <Input
          value={values.name}
          placeholder="e.g. John Smith, or D. Patterson / R. Smedley"
          onChange={(e) => set("name", e.target.value)}
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Link to player (optional)</Label>
        <PlayerTypeahead
          value={selectedPlayer}
          onChange={(p) => {
            if (p) {
              setValues((prev) => ({
                ...prev,
                playerId: p.id,
                nonPlayerId: null,
                name: prev.name.trim()
                  ? prev.name
                  : `${p.givenName} ${p.surname}`.trim(),
              }));
            } else {
              set("playerId", null);
            }
          }}
        />
        <p className="text-xs text-muted-foreground">
          Leave unlinked for joint captains or names without a player record.
        </p>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">
          Or link a non-player official (optional)
        </Label>
        <select
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-50"
          value={values.nonPlayerId ?? ""}
          disabled={values.playerId != null}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) {
              set("nonPlayerId", null);
              return;
            }
            const personId = parseInt(v, 10);
            const person = (people ?? []).find((p) => p.id === personId);
            setValues((prev) => ({
              ...prev,
              nonPlayerId: personId,
              playerId: null,
              name: prev.name.trim() ? prev.name : person?.name ?? prev.name,
            }));
          }}
        >
          <option value="">— None —</option>
          {(people ?? []).map((p: NonPlayerPerson) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          For club officials who never played. Manage them under Admin ·
          Non-player people.
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
          disabled={pending || !values.name.trim()}
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
