import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListJuniorPremierships,
  useUpdateJuniorPremiership,
  getListJuniorPremiershipsQueryKey,
  type JuniorPremiership,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { ListSkeleton, QueryError, EmptyState } from "@/components/data-states";

const premTitle = (p: JuniorPremiership) =>
  [p.ageGroup ?? "Junior", p.season].filter(Boolean).join(" · ");

export default function AdminJuniorPremierships() {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useListJuniorPremierships();
  const update = useUpdateJuniorPremiership();
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: getListJuniorPremiershipsQueryKey() });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-muted-foreground mt-1">
          Set the captain and man-of-the-match for each junior premiership. These
          aren&apos;t in the source data, so they&apos;re added by hand here and
          shown on the junior premiership plaques.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {isError ? (
        <QueryError onRetry={() => refetch()} />
      ) : isLoading ? (
        <ListSkeleton />
      ) : (data?.length ?? 0) === 0 ? (
        <EmptyState
          title="No junior premierships found"
          message="Junior premierships will appear here once they're in the data."
        />
      ) : (
        data!.map((p) => (
          <Card key={p.id}>
            <CardHeader className="flex flex-row justify-between items-start gap-3">
              <CardTitle>{premTitle(p)}</CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditingId(editingId === p.id ? null : p.id)}
                data-testid={`button-edit-${p.id}`}
              >
                {editingId === p.id ? "Close" : "Edit"}
              </Button>
            </CardHeader>
            <CardContent>
              {editingId === p.id ? (
                <PremForm
                  prem={p}
                  pending={update.isPending}
                  onSubmit={(mom, captainPlayerIds) => {
                    setError(null);
                    update.mutate(
                      { id: p.id, data: { mom, captainPlayerIds } },
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
              ) : (
                <div className="text-sm text-muted-foreground space-y-1">
                  {p.matchDate && <div>{p.matchDate}</div>}
                  {p.resultText && <div>{p.resultText}</div>}
                  <div>
                    Captain:{" "}
                    {p.players.filter((pp) => pp.isCaptain).map((pp) => pp.playerName).join(", ") || "—"}
                  </div>
                  <div>M.O.M: {p.mom || "—"}</div>
                </div>
              )}
            </CardContent>
          </Card>
        ))
      )}
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
