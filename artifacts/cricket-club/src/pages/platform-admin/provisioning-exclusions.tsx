import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";
import {
  useListProvisioningExclusions,
  useCreateProvisioningExclusion,
  useDeleteProvisioningExclusion,
  useGetAvailableClubs,
  getListProvisioningExclusionsQueryKey,
  getGetAvailableClubsQueryKey,
  type AvailableClub,
  type ProvisioningExclusionVisibility,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusPill } from "@/components/ui/stat-badge";
import { useConfirm } from "@/components/confirm-dialog";
import { ClubPicker } from "@/components/club-picker";

/**
 * Platform-admin-managed provisioning exclusions: defunct/merged clubs (hidden
 * everywhere) and clubs not yet ready for public self-serve signup (hidden
 * from self-serve only, still concierge-provisionable). Independent of
 * central.clubs.active_to -- see docs/plans/2026-07-31-002.
 */
export default function ProvisioningExclusions() {
  const { data, isLoading, isError } = useListProvisioningExclusions();
  const qc = useQueryClient();
  const confirm = useConfirm();

  const remove = useDeleteProvisioningExclusion({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListProvisioningExclusionsQueryKey() });
      },
    },
  });

  async function onRemove(id: number, clubName: string) {
    if (
      !(await confirm({
        title: "Remove this exclusion?",
        description: `${clubName} will become provisionable again, unless it's already been claimed as a tenant.`,
        confirmText: "Remove",
        destructive: true,
      }))
    )
      return;
    remove.mutate({ id });
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Provisioning exclusions</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Clubs excluded from provisioning, independent of the central register's own folded/renamed
        data.
      </p>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Current exclusions</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : isError ? (
              <p className="py-8 text-center text-muted-foreground">Couldn't load exclusions.</p>
            ) : !data || data.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No clubs are currently excluded.
              </p>
            ) : (
              <ul className="divide-y text-sm">
                {data.map((e) => (
                  <li key={e.id} className="flex items-start justify-between gap-3 py-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{e.clubName}</span>
                        <StatusPill tone={e.visibility === "everywhere" ? "danger" : "pilot"}>
                          {e.visibility === "everywhere" ? "Hidden everywhere" : "Self-serve only"}
                        </StatusPill>
                      </div>
                      {e.reason ? (
                        <p className="mt-1 text-xs text-muted-foreground">{e.reason}</p>
                      ) : null}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove exclusion for ${e.clubName}`}
                      onClick={() => onRemove(e.id, e.clubName)}
                      disabled={remove.isPending}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <AddExclusionCard />
      </div>
    </div>
  );
}

function AddExclusionCard() {
  const qc = useQueryClient();
  const { data: clubs, isLoading, isError } = useGetAvailableClubs();
  const [club, setClub] = useState<AvailableClub | null>(null);
  const [visibility, setVisibility] = useState<ProvisioningExclusionVisibility>("everywhere");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = useCreateProvisioningExclusion({
    mutation: {
      onSuccess: () => {
        setError(null);
        setClub(null);
        setReason("");
        setVisibility("everywhere");
        qc.invalidateQueries({ queryKey: getListProvisioningExclusionsQueryKey() });
        qc.invalidateQueries({ queryKey: getGetAvailableClubsQueryKey() });
      },
      onError: (e) => {
        const status = (e as { status?: number })?.status;
        setError(status === 409 ? "That club is already excluded." : "Couldn't add the exclusion.");
      },
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!club) return;
    create.mutate({
      data: {
        centralClubId: club.centralClubId,
        visibility,
        reason: reason.trim() || undefined,
      },
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add an exclusion</CardTitle>
      </CardHeader>
      <CardContent>
        {club ? (
          <form onSubmit={submit} className="space-y-4">
            <button
              type="button"
              onClick={() => setClub(null)}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              &larr; Choose a different club
            </button>
            <p className="font-medium">{club.name}</p>

            <div className="space-y-2">
              <Label htmlFor="visibility">Visibility</Label>
              <select
                id="visibility"
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as ProvisioningExclusionVisibility)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="everywhere">Hidden everywhere (defunct or merged)</option>
                <option value="self_serve_only">
                  Hidden from self-serve only (still concierge-provisionable)
                </option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason">Reason (optional)</Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Merged with Singleton, now Singleton Irwinians"
              />
            </div>

            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Adding…" : "Add exclusion"}
            </Button>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </form>
        ) : (
          <ClubPicker clubs={clubs} isLoading={isLoading} isError={isError} onPick={setClub} />
        )}
      </CardContent>
    </Card>
  );
}
