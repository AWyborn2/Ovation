import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useBrand } from "@/lib/brand-context";
import {
  useListAllJuniorOfficeBearers,
  useCreateJuniorOfficeBearer,
  useUpdateJuniorOfficeBearer,
  useDeleteJuniorOfficeBearer,
  getListAllJuniorOfficeBearersQueryKey,
  getListJuniorOfficeBearersQueryKey,
} from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { handleAdminMutationError } from "@/lib/admin-auth";
import {
  JuniorPlayerTypeahead,
  type SelectedJuniorPlayer,
} from "@/components/junior-player-typeahead";
import { SeasonRolesBoard, formatSeason } from "@/components/season-roles-board";

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

type FormValues = {
  season: number;
  role: string;
  roleMode: "preset" | "custom";
  participantId: string | null;
  name: string;
  displayOrder: number;
  published: boolean;
};

/**
 * Junior office bearers — kept completely separate from the senior committee:
 * this page only ever calls the `/api/juniors/*` office-bearer endpoints.
 */
export default function AdminJuniorCommittee() {
  const brand = useBrand();
  const queryClient = useQueryClient();
  const { data: bearers, isLoading, isError, refetch } = useListAllJuniorOfficeBearers();
  const createBearer = useCreateJuniorOfficeBearer();
  const updateBearer = useUpdateJuniorOfficeBearer();
  const deleteBearer = useDeleteJuniorOfficeBearer();
  const [error, setError] = useState<string | null>(null);

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

  const setPublishedForSeason = (season: number, published: boolean) => {
    const targets = (bearers ?? []).filter((r) => r.season === season && r.published !== published);
    setError(null);
    for (const r of targets) {
      updateBearer.mutate(
        { id: r.id, data: { published } },
        { onError: onMutationError, onSuccess: invalidate },
      );
    }
  };

  return (
    <SeasonRolesBoard
      rows={bearers}
      isLoading={isLoading}
      isError={isError}
      onRetry={() => refetch()}
      intro={
        <>
          Record {brand.name} junior office bearers for each season. Published seasons appear on the
          public Juniors → Office Bearers page. This data is kept completely separate from the
          senior committee.
        </>
      }
      addLabel="Add office bearer"
      addTitle="Add an office bearer"
      error={error}
      empty={{
        title: "No junior office bearers yet",
        message: "Add an office bearer to start building the junior committee board.",
      }}
      rowLabel={(r) => r.role}
      linkedLabel={(r) => (r.participantId != null ? "linked" : null)}
      updatePending={updateBearer.isPending}
      deletePending={deleteBearer.isPending}
      onSetSeasonPublished={setPublishedForSeason}
      deleteTitle="Delete office bearer"
      deleteDescription={(r) => `Delete "${r.name}" as ${r.role} for ${formatSeason(r.season)}?`}
      onDelete={(r) => {
        setError(null);
        deleteBearer.mutate({ id: r.id }, { onSuccess: invalidate, onError: onMutationError });
      }}
      renderNewForm={(close) => (
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
                  close();
                  invalidate();
                },
                onError: onMutationError,
              },
            );
          }}
          onCancel={close}
          submitLabel="Add office bearer"
        />
      )}
      renderEditForm={(r, close) => (
        <BearerForm
          initial={{
            season: r.season,
            role: r.role,
            roleMode: OFFICE_ROLES.includes(r.role) ? "preset" : "custom",
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
              value={OFFICE_ROLES.includes(values.role) ? values.role : "__custom__"}
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
            onChange={(e) => set("displayOrder", parseInt(e.target.value, 10) || 0)}
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
