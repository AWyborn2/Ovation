import { useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { PlayerTypeahead, type SelectedPlayer } from "@/components/player-typeahead";
import { SeasonRolesBoard, formatSeason } from "@/components/season-roles-board";

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
  const { data: roles, isLoading, isError, refetch } = useListAllClubRoles();
  const createRole = useCreateClubRole();
  const updateRole = useUpdateClubRole();
  const deleteRole = useDeleteClubRole();
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListAllClubRolesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListClubRolesQueryKey() });
  };

  const onMutationError = (e: unknown) => {
    const msg = handleAdminMutationError(e);
    if (msg) setError(msg);
  };

  const setPublishedForSeason = (season: number, published: boolean) => {
    const targets = (roles ?? []).filter((r) => r.season === season && r.published !== published);
    setError(null);
    for (const r of targets) {
      updateRole.mutate(
        { id: r.id, data: { published } },
        { onError: onMutationError, onSuccess: invalidate },
      );
    }
  };

  const roleLabel = (r: ClubRole) => (r.grade != null ? `${r.grade} captain` : r.role);

  return (
    <SeasonRolesBoard
      rows={roles}
      isLoading={isLoading}
      isError={isError}
      onRetry={() => refetch()}
      intro={
        <>
          Record club office bearers and grade captains for each season. Office bearers appear on
          the public Committee board; grade captains appear on each grade's page. Only published
          records are shown publicly.
        </>
      }
      addLabel="Add role"
      addTitle="Add a role record"
      error={error}
      empty={{
        title: "No role records yet",
        message: "Add a role record to start building the committee board.",
      }}
      rowLabel={roleLabel}
      linkedLabel={(r) => (r.playerId != null ? `linked #${r.playerId}` : null)}
      updatePending={updateRole.isPending}
      deletePending={deleteRole.isPending}
      onSetSeasonPublished={setPublishedForSeason}
      deleteTitle="Delete role record"
      deleteDescription={(r) =>
        `Delete "${r.name}" as ${roleLabel(r)} for ${formatSeason(r.season)}?`
      }
      onDelete={(r) => {
        setError(null);
        deleteRole.mutate({ id: r.id }, { onSuccess: invalidate, onError: onMutationError });
      }}
      renderNewForm={(close) => (
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
                  close();
                  invalidate();
                },
                onError: onMutationError,
              },
            );
          }}
          onCancel={close}
          submitLabel="Add role"
        />
      )}
      renderEditForm={(r, close) => (
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
                  close();
                  invalidate();
                },
                onError: onMutationError,
              },
            );
          }}
          onCancel={close}
          submitLabel="Save changes"
        />
      )}
    />
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
      grade: kind === "captain" ? (prev.grade ?? GRADES[0]) : null,
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
                name: prev.name.trim() ? prev.name : `${p.givenName} ${p.surname}`.trim(),
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
        <Label className="text-xs">Or link a non-player official (optional)</Label>
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
              name: prev.name.trim() ? prev.name : (person?.name ?? prev.name),
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
          For club officials who never played. Manage them under Admin · Non-player people.
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
        <Button disabled={pending || !values.name.trim()} onClick={() => onSubmit(values)}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
