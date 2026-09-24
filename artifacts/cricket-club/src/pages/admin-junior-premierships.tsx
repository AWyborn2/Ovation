import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListJuniorPremierships,
  useUpdateJuniorPremiership,
  getListJuniorPremiershipsQueryKey,
  type JuniorPremiership,
} from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { ListSkeleton, QueryError, EmptyState } from "@/components/data-states";
import { DataTable, EditDrawer, StatusPill, type DataTableColumn } from "@/components/admin-ui";

const premTitle = (p: JuniorPremiership) =>
  [p.ageGroup ?? "Junior", p.season].filter(Boolean).join(" · ");

export default function AdminJuniorPremierships() {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useListJuniorPremierships();
  const update = useUpdateJuniorPremiership();
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: getListJuniorPremiershipsQueryKey() });

  const rows = data ?? [];
  const editing = rows.find((p) => p.id === editingId) ?? null;
  const captainsOf = (p: JuniorPremiership) =>
    p.players
      .filter((pp) => pp.isCaptain)
      .map((pp) => pp.playerName)
      .join(", ");

  const columns: DataTableColumn<JuniorPremiership>[] = [
    {
      key: "season",
      header: "Season",
      className: "w-28",
      cell: (p) => <span className="tabular-nums">{p.season}</span>,
    },
    {
      key: "age",
      header: "Age group",
      cell: (p) => <span className="font-semibold">{p.ageGroup ?? "Junior"}</span>,
    },
    { key: "captain", header: "Captain", cell: (p) => captainsOf(p) || "—" },
    { key: "mom", header: "M.O.M", cell: (p) => p.mom || "—" },
    {
      key: "status",
      header: "Status",
      className: "w-32",
      cell: (p) =>
        captainsOf(p) && p.mom ? (
          <StatusPill tone="success">Complete</StatusPill>
        ) : (
          <StatusPill tone="attention">Needs details</StatusPill>
        ),
    },
  ];

  return (
    <div className="space-y-5">
      <p className="max-w-[75ch] text-[15px] text-muted-foreground">
        Set the captain and man-of-the-match for each junior premiership. These aren&apos;t in the
        source data, so they&apos;re added by hand here and shown on the junior premiership plaques.
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
          label="Junior premierships"
          rows={rows}
          columns={columns}
          getRowId={(p) => p.id}
          searchText={(p) => `${premTitle(p)} ${captainsOf(p)} ${p.mom ?? ""}`}
          searchPlaceholder="Search season, age group or player"
          filters={[
            {
              id: "needs",
              label: "Needs details",
              predicate: (p) => !captainsOf(p) || !p.mom,
            },
          ]}
          onRowClick={(p) => setEditingId(p.id)}
          emptyState={
            <EmptyState
              title="No junior premierships found"
              message="Junior premierships will appear here once they're in the data."
            />
          }
          minWidth={560}
        />
      )}

      <EditDrawer
        open={editing != null}
        onOpenChange={(o) => !o && setEditingId(null)}
        title={editing ? premTitle(editing) : ""}
        description={
          editing ? [editing.matchDate, editing.resultText].filter(Boolean).join(" · ") : undefined
        }
      >
        {editing && (
          <PremForm
            key={editing.id}
            prem={editing}
            pending={update.isPending}
            onSubmit={(mom, captainPlayerIds) => {
              setError(null);
              update.mutate(
                { id: editing.id, data: { mom, captainPlayerIds } },
                {
                  onSuccess: () => {
                    setEditingId(null);
                    invalidate();
                  },
                  onError: (e) => setError(handleAdminMutationError(e)),
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

function PremForm({
  prem,
  pending,
  onSubmit,
  onCancel,
}: {
  prem: JuniorPremiership;
  pending: boolean;
  onSubmit: (mom: string | null, captainPlayerIds: number[]) => void;
  onCancel: () => void;
}) {
  const initialCaptains = useMemo(
    () => new Set(prem.players.filter((p) => p.isCaptain).map((p) => p.id)),
    [prem.players],
  );
  const [mom, setMom] = useState(prem.mom ?? "");
  const [captains, setCaptains] = useState<Set<number>>(initialCaptains);

  const toggleCaptain = (id: number) =>
    setCaptains((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-4">
      <div className="space-y-1 max-w-sm">
        <Label>Man of the match</Label>
        <Input
          value={mom}
          placeholder="e.g. Jack Smith"
          onChange={(e) => setMom(e.target.value)}
          data-testid="input-mom"
        />
      </div>

      <div>
        <Label className="mb-2 block">Captain</Label>
        {prem.players.length === 0 ? (
          <p className="text-sm text-muted-foreground">No squad recorded.</p>
        ) : (
          <div className="space-y-1">
            {prem.players.map((pp) => (
              <label
                key={pp.id}
                className="flex items-center gap-2 text-sm border-b py-1 last:border-0"
              >
                <input
                  type="checkbox"
                  checked={captains.has(pp.id)}
                  onChange={() => toggleCaptain(pp.id)}
                  data-testid={`checkbox-captain-${pp.id}`}
                />
                {pp.playerName}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Button
          onClick={() => onSubmit(mom.trim() ? mom.trim() : null, Array.from(captains))}
          disabled={pending}
          data-testid="button-save"
        >
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
