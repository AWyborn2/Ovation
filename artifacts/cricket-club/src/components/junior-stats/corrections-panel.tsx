import {
  useListJuniorStatCorrections,
  getListJuniorStatCorrectionsQueryKey,
  useRevertJuniorStatCorrection,
  type JuniorStatCorrection,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ListSkeleton } from "@/components/data-states";
import { useConfirm } from "@/components/confirm-dialog";

function describeCorrection(c: JuniorStatCorrection): string {
  const table = c.targetTable.replace("junior_", "").replace(/_/g, " ");
  if (c.op === "insert") return `Added ${table} row`;
  if (c.op === "delete") return `Deleted ${table} row`;
  const cols = c.patch ? Object.keys(c.patch).join(", ") : "";
  return `Updated ${table}${cols ? ` (${cols})` : ""}`;
}

export function CorrectionsPanel({
  matchId,
  onReverted,
  onError,
  clearError,
}: {
  matchId: number;
  onReverted: () => void;
  onError: (e: unknown) => void;
  clearError: () => void;
}) {
  const confirm = useConfirm();
  const { data: corrections, isLoading } = useListJuniorStatCorrections(
    { matchId },
    { query: { queryKey: getListJuniorStatCorrectionsQueryKey({ matchId }) } },
  );
  const revert = useRevertJuniorStatCorrection();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Corrections history</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Every admin edit to this match is journalled, survives a juniors data
          reload, and can be reverted (newest first).
        </p>
        {isLoading ? (
          <ListSkeleton rows={3} />
        ) : !corrections?.length ? (
          <div className="text-sm text-muted-foreground italic">
            No corrections recorded for this match.
          </div>
        ) : (
          <div className="space-y-1">
            {corrections.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
              >
                <span>
                  {describeCorrection(c)}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {new Date(c.createdAt).toLocaleString()}
                    {c.createdBy ? ` · ${c.createdBy}` : ""}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={revert.isPending}
                  onClick={async () => {
                    if (
                      !(await confirm({
                        title: "Revert correction?",
                        description: `${describeCorrection(c)} — restore the previous values?`,
                        confirmText: "Revert",
                        destructive: true,
                      }))
                    )
                      return;
                    clearError();
                    revert.mutate({ id: c.id }, { onSuccess: onReverted, onError });
                  }}
                >
                  Revert
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
