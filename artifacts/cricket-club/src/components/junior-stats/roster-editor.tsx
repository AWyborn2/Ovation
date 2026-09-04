import { useState } from "react";
import {
  useAddJuniorRosterEntry,
  useRemoveJuniorRosterEntry,
  type JuniorMatchDetail,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  JuniorPlayerTypeahead,
  type SelectedJuniorPlayer,
} from "@/components/junior-player-typeahead";
import { useConfirm } from "@/components/confirm-dialog";
import { useClubShortName } from "@/lib/brand-context";

/** The club's roster for a junior match — the canonical "games played" record. */
export function RosterEditor({
  match,
  onSaved,
  onError,
  clearError,
}: {
  match: JuniorMatchDetail;
  onSaved: () => void;
  onError: (e: unknown) => void;
  clearError: () => void;
}) {
  const clubShort = useClubShortName();
  const confirm = useConfirm();
  const add = useAddJuniorRosterEntry();
  const remove = useRemoveJuniorRosterEntry();
  const [player, setPlayer] = useState<SelectedJuniorPlayer | null>(null);
  const hhRoster = match.rosters.filter((r) => r.isHallsHead);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{clubShort} roster</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          The roster is the canonical &ldquo;games played&rdquo; record — adding or removing a
          player here changes their junior games count everywhere.
        </p>
        {hhRoster.length === 0 ? (
          <div className="text-sm text-muted-foreground italic">No roster recorded.</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {hhRoster.map((r) => (
              <span
                key={r.id}
                className="inline-flex items-center gap-2 rounded-md border border-border px-2 py-1 text-sm"
              >
                {r.playerName}
                <button
                  type="button"
                  className="text-muted-foreground hover:text-destructive"
                  title="Remove from roster"
                  onClick={async () => {
                    if (
                      !(await confirm({
                        title: "Remove from roster?",
                        description: `Remove ${r.playerName} from this match roster? Their junior games count drops by one everywhere. The change is journalled and can be reverted.`,
                        confirmText: "Remove",
                        destructive: true,
                      }))
                    )
                      return;
                    clearError();
                    remove.mutate(
                      { matchId: match.id, lineId: r.id },
                      { onSuccess: onSaved, onError },
                    );
                  }}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1 min-w-64">
            <Label>Add a junior to the roster</Label>
            <JuniorPlayerTypeahead value={player} onChange={setPlayer} />
          </div>
          <Button
            disabled={add.isPending || !player}
            onClick={() => {
              if (!player) return;
              clearError();
              add.mutate(
                { matchId: match.id, data: { participantId: player.participantId } },
                {
                  onSuccess: () => {
                    setPlayer(null);
                    onSaved();
                  },
                  onError,
                },
              );
            }}
          >
            {add.isPending ? "Adding…" : "Add"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
