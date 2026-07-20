import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListJuniorPlayersBySenior,
  useSetJuniorSeniorLink,
  useClearJuniorSeniorLink,
  getListJuniorPlayersBySeniorQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { handleAdminMutationError } from "@/lib/admin-auth";
import {
  JuniorPlayerTypeahead,
  type SelectedJuniorPlayer,
} from "@/components/junior-player-typeahead";
import { useConfirm } from "@/components/confirm-dialog";

/**
 * Link/unlink a senior player to their junior participant profile(s). The link
 * (junior_participants.senior_player_id) is a profile cross-reference only —
 * junior and senior figures stay completely separate and are never combined;
 * it just lets both profile pages show clearly-labelled cross-sections.
 * Multiple junior identities may link to one senior (PlayHQ duplicate GUIDs).
 *
 * Shared by the senior players admin (anchored on a senior row) and the
 * junior players admin.
 */
export function JuniorSeniorLinkDialog({
  seniorPlayerId,
  seniorName,
  onClose,
}: {
  seniorPlayerId: number;
  seniorName: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [error, setError] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<SelectedJuniorPlayer | null>(null);

  const { data: links, isLoading } = useListJuniorPlayersBySenior(
    seniorPlayerId,
    {
      query: { queryKey: getListJuniorPlayersBySeniorQueryKey(seniorPlayerId) },
    },
  );
  const setLink = useSetJuniorSeniorLink();
  const clearLink = useClearJuniorSeniorLink();

  const invalidate = () => {
    qc.invalidateQueries({
      queryKey: getListJuniorPlayersBySeniorQueryKey(seniorPlayerId),
    });
  };
  const onErr = (e: unknown) => setError(handleAdminMutationError(e));
  const busy = setLink.isPending || clearLink.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4">
      <Card className="max-w-lg w-full">
        <CardHeader>
          <CardTitle>Junior profile link</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Link <strong className="text-foreground">{seniorName}</strong> to
            their junior profile. This is a cross-reference only — junior and
            senior stats stay separate and are never combined; both profile
            pages simply show a link to the other career.
          </p>

          {error && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label>Linked junior profiles</Label>
            {isLoading ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : !links?.length ? (
              <div className="text-sm text-muted-foreground">
                No junior profile linked.
              </div>
            ) : (
              <div className="space-y-1">
                {links.map((l) => (
                  <div
                    key={l.participantId}
                    className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <span>
                      {l.displayName}
                      {l.firstSeason && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {l.firstSeason}
                          {l.lastSeason && l.lastSeason !== l.firstSeason
                            ? ` – ${l.lastSeason}`
                            : ""}
                        </span>
                      )}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={async () => {
                        if (
                          !(await confirm({
                            title: "Unlink junior profile?",
                            description: `Remove the link between ${l.displayName} and ${seniorName}? No stats are affected.`,
                            confirmText: "Unlink",
                            destructive: true,
                          }))
                        )
                          return;
                        setError(null);
                        clearLink.mutate(
                          { id: l.participantId },
                          { onSuccess: invalidate, onError: onErr },
                        );
                      }}
                    >
                      Unlink
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Label>Add a junior profile</Label>
            <JuniorPlayerTypeahead value={candidate} onChange={setCandidate} />
          </div>

          <div className="flex gap-2">
            <Button
              disabled={busy || !candidate}
              onClick={() => {
                if (!candidate) return;
                setError(null);
                setLink.mutate(
                  {
                    id: candidate.participantId,
                    data: { seniorPlayerId },
                  },
                  {
                    onSuccess: () => {
                      setCandidate(null);
                      invalidate();
                    },
                    onError: onErr,
                  },
                );
              }}
            >
              {setLink.isPending ? "Linking…" : "Link"}
            </Button>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
