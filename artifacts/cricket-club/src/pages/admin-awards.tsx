import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAdminAwards,
  useCreateAward,
  useUpdateAward,
  useDeleteAward,
  getListAdminAwardsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { ListSkeleton, EmptyState, QueryError } from "@/components/data-states";
import { useConfirm } from "@/components/confirm-dialog";
import { MECHANISM_LABEL } from "@/components/admin-awards/constants";
import { AwardForm } from "@/components/admin-awards/award-form";
import { WinnersManager } from "@/components/admin-awards/winners-manager";
import { VotingManager } from "@/components/admin-awards/voting-manager";
import { PointsManager } from "@/components/admin-awards/points-manager";

export default function AdminAwards() {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { data: awards, isLoading, isError, refetch } = useListAdminAwards();
  const createAward = useCreateAward();
  const updateAward = useUpdateAward();
  const deleteAward = useDeleteAward();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListAdminAwardsQueryKey() });
  };

  const onMutationError = (e: unknown) => {
    const msg = handleAdminMutationError(e);
    if (msg) setError(msg);
  };

  const sorted = useMemo(() => {
    if (!awards) return [];
    return [...awards].sort(
      (a, b) => a.displayOrder - b.displayOrder || a.id - b.id,
    );
  }, [awards]);

  const moveAward = (index: number, dir: -1 | 1) => {
    const a = sorted[index];
    const b = sorted[index + dir];
    if (!a || !b) return;
    setError(null);
    updateAward.mutate(
      { id: a.id, data: { displayOrder: b.displayOrder } },
      {
        onError: onMutationError,
        onSuccess: () => {
          updateAward.mutate(
            { id: b.id, data: { displayOrder: a.displayOrder } },
            { onSuccess: invalidate, onError: onMutationError },
          );
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-muted-foreground mt-1">
            Create club awards and record their past winners. Each award appears
            as its own honour board on the website and mobile app.
          </p>
        </div>
        <Button onClick={() => setShowNew((v) => !v)} variant={showNew ? "outline" : "default"}>
          {showNew ? "Close form" : "New award"}
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
            <CardTitle>New award</CardTitle>
          </CardHeader>
          <CardContent>
            <AwardForm
              initial={{
                key: "",
                title: "",
                description: "",
                displayOrder: (sorted[sorted.length - 1]?.displayOrder ?? -1) + 1,
                votingEnabled: false,
                mechanism: "manual",
                published: false,
                pointsGrade: null,
              }}
              autoKey
              pending={createAward.isPending}
              onSubmit={(values) => {
                setError(null);
                createAward.mutate(
                  { data: values },
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
              submitLabel="Create award"
            />
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : isError ? (
        <QueryError
          message="We couldn’t load awards. Please try again."
          onRetry={() => refetch()}
        />
      ) : sorted.length === 0 ? (
        <EmptyState title="No awards yet" message="Create an award to get started." />
      ) : (
        sorted.map((award, index) => (
          <Card key={award.id}>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div className="min-w-0">
                <CardTitle className="text-xl">
                  {award.title}
                  <span
                    className={`ml-2 align-middle text-xs font-normal rounded px-2 py-0.5 ${
                      award.published
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {award.published ? "Published" : "Draft"}
                  </span>
                  <span className="ml-2 align-middle text-xs font-normal rounded bg-secondary text-secondary-foreground px-2 py-0.5 capitalize">
                    {MECHANISM_LABEL[award.mechanism]}
                  </span>
                  {award.mechanism === "points" && award.pointsGrade && (
                    <span className="ml-2 align-middle text-xs font-normal rounded bg-primary/15 text-primary px-2 py-0.5">
                      {award.pointsGrade}
                    </span>
                  )}
                </CardTitle>
                <div className="text-xs text-muted-foreground mt-1">
                  slug: <code>{award.key}</code> · order {award.displayOrder} ·{" "}
                  {award.winners.length}{" "}
                  {award.winners.length === 1 ? "winner" : "winners"}
                </div>
              </div>
              <div className="space-x-2 shrink-0">
                <Button
                  size="sm"
                  variant={award.published ? "outline" : "default"}
                  disabled={updateAward.isPending}
                  onClick={() => {
                    setError(null);
                    updateAward.mutate(
                      { id: award.id, data: { published: !award.published } },
                      { onSuccess: invalidate, onError: onMutationError },
                    );
                  }}
                >
                  {award.published ? "Unpublish" : "Publish"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={index === 0 || updateAward.isPending}
                  onClick={() => moveAward(index, -1)}
                >
                  ↑
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={index === sorted.length - 1 || updateAward.isPending}
                  onClick={() => moveAward(index, 1)}
                >
                  ↓
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditingId(editingId === award.id ? null : award.id)}
                >
                  {editingId === award.id ? "Close" : "Edit"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    if (
                      !(await confirm({
                        title: "Delete award?",
                        description: `Delete award "${award.title}" and all its winners?`,
                        confirmText: "Delete",
                        destructive: true,
                      }))
                    )
                      return;
                    setError(null);
                    deleteAward.mutate(
                      { id: award.id },
                      { onSuccess: invalidate, onError: onMutationError },
                    );
                  }}
                  disabled={deleteAward.isPending}
                >
                  Delete
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {editingId === award.id && (
                <div className="rounded-md border border-border bg-muted/30 p-4">
                  <AwardForm
                    initial={{
                      key: award.key,
                      title: award.title,
                      description: award.description,
                      displayOrder: award.displayOrder,
                      votingEnabled: award.votingEnabled,
                      mechanism: award.mechanism,
                      published: award.published,
                      pointsGrade: award.pointsGrade ?? null,
                    }}
                    pending={updateAward.isPending}
                    onSubmit={(values) => {
                      setError(null);
                      updateAward.mutate(
                        { id: award.id, data: values },
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
              )}

              {award.description && (
                <p className="text-sm italic text-muted-foreground border-l-2 border-primary pl-3">
                  {award.description}
                </p>
              )}

              <WinnersManager
                award={award}
                onError={onMutationError}
                onChanged={invalidate}
              />

              {award.mechanism === "voted" && (
                <VotingManager award={award} onAwardChanged={invalidate} />
              )}
              {award.mechanism === "points" && (
                <PointsManager award={award} onAwardChanged={invalidate} />
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
