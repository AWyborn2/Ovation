import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAdminAwards,
  useCreateAward,
  useUpdateAward,
  useDeleteAward,
  getListAdminAwardsQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { ListSkeleton, EmptyState, QueryError } from "@/components/data-states";
import { useConfirm } from "@/components/confirm-dialog";
import { DataTable, EditDrawer, StatusPill, type DataTableColumn } from "@/components/admin-ui";
import { ArrowDown, ArrowUp, Plus } from "lucide-react";
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
    return [...awards].sort((a, b) => a.displayOrder - b.displayOrder || a.id - b.id);
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

  const editing = sorted.find((a) => a.id === editingId) ?? null;
  type AwardRow = (typeof sorted)[number];

  const remove = async (award: AwardRow) => {
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
      {
        onSuccess: () => {
          setEditingId(null);
          invalidate();
        },
        onError: onMutationError,
      },
    );
  };

  const togglePublished = (award: AwardRow) => {
    setError(null);
    updateAward.mutate(
      { id: award.id, data: { published: !award.published } },
      { onSuccess: invalidate, onError: onMutationError },
    );
  };

  const columns: DataTableColumn<AwardRow>[] = [
    {
      key: "order",
      header: "Order",
      className: "w-24",
      cell: (award) => {
        const index = sorted.indexOf(award);
        return (
          <span className="flex gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              aria-label={`Move ${award.title} up`}
              disabled={index === 0 || updateAward.isPending}
              onClick={(e) => {
                e.stopPropagation();
                moveAward(index, -1);
              }}
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              aria-label={`Move ${award.title} down`}
              disabled={index === sorted.length - 1 || updateAward.isPending}
              onClick={(e) => {
                e.stopPropagation();
                moveAward(index, 1);
              }}
            >
              <ArrowDown className="h-4 w-4" />
            </Button>
          </span>
        );
      },
    },
    {
      key: "title",
      header: "Award",
      cell: (award) => (
        <span className="min-w-0">
          <span className="block font-semibold">{award.title}</span>
          <span className="block text-xs text-muted-foreground">
            <code>{award.key}</code>
          </span>
        </span>
      ),
    },
    {
      key: "mechanism",
      header: "Decided by",
      className: "w-44",
      cell: (award) => (
        <span className="capitalize">
          {MECHANISM_LABEL[award.mechanism]}
          {award.mechanism === "points" && award.pointsGrade && (
            <span className="text-muted-foreground"> · {award.pointsGrade}</span>
          )}
        </span>
      ),
    },
    {
      key: "winners",
      header: "Winners",
      className: "w-24",
      cell: (award) => <span className="tabular-nums">{award.winners.length}</span>,
    },
    {
      key: "status",
      header: "Status",
      className: "w-32",
      cell: (award) =>
        award.published ? (
          <StatusPill tone="success">Published</StatusPill>
        ) : (
          <StatusPill>Draft</StatusPill>
        ),
    },
  ];

  return (
    <div className="space-y-5">
      <p className="max-w-[75ch] text-[15px] text-muted-foreground">
        Create club awards and record their past winners. Each award appears as its own honour board
        on the website and mobile app.
      </p>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : isError ? (
        <QueryError
          message="We couldn’t load awards. Please try again."
          onRetry={() => refetch()}
        />
      ) : (
        <DataTable
          label="Awards"
          rows={sorted}
          columns={columns}
          getRowId={(a) => a.id}
          searchText={(a) => `${a.title} ${a.key} ${a.description ?? ""}`}
          searchPlaceholder="Search awards"
          filters={[
            { id: "published", label: "Published", predicate: (a) => a.published },
            { id: "draft", label: "Drafts", predicate: (a) => !a.published },
          ]}
          onRowClick={(a) => setEditingId(a.id)}
          toolbarAction={
            <Button onClick={() => setShowNew(true)}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden />
              New award
            </Button>
          }
          emptyState={
            <EmptyState title="No awards yet" message="Create an award to get started." />
          }
          minWidth={640}
        />
      )}

      <EditDrawer open={showNew} onOpenChange={setShowNew} title="New award">
        {showNew && (
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
        )}
      </EditDrawer>

      <EditDrawer
        wide
        open={editing != null}
        onOpenChange={(o) => !o && setEditingId(null)}
        title={editing?.title ?? ""}
        description={
          editing
            ? `${MECHANISM_LABEL[editing.mechanism]} · ${editing.winners.length} ${
                editing.winners.length === 1 ? "winner" : "winners"
              }`
            : undefined
        }
        footer={
          editing ? (
            <>
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                disabled={deleteAward.isPending}
                onClick={() => remove(editing)}
              >
                Delete
              </Button>
              <Button
                type="button"
                className="ml-auto"
                variant={editing.published ? "outline" : "default"}
                disabled={updateAward.isPending}
                onClick={() => togglePublished(editing)}
              >
                {editing.published ? "Unpublish" : "Publish"}
              </Button>
            </>
          ) : undefined
        }
      >
        {editing && (
          <div className="space-y-6">
            <AwardForm
              key={editing.id}
              initial={{
                key: editing.key,
                title: editing.title,
                description: editing.description,
                displayOrder: editing.displayOrder,
                votingEnabled: editing.votingEnabled,
                mechanism: editing.mechanism,
                published: editing.published,
                pointsGrade: editing.pointsGrade ?? null,
              }}
              pending={updateAward.isPending}
              onSubmit={(values) => {
                setError(null);
                updateAward.mutate(
                  { id: editing.id, data: values },
                  { onSuccess: invalidate, onError: onMutationError },
                );
              }}
              onCancel={() => setEditingId(null)}
              submitLabel="Save changes"
            />

            <WinnersManager award={editing} onError={onMutationError} onChanged={invalidate} />

            {editing.mechanism === "voted" && (
              <VotingManager award={editing} onAwardChanged={invalidate} />
            )}
            {editing.mechanism === "points" && (
              <PointsManager award={editing} onAwardChanged={invalidate} />
            )}
          </div>
        )}
      </EditDrawer>
    </div>
  );
}
