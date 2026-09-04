import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListImports,
  useCommitImport,
  useDeleteImport,
  useUndoSeason,
  getListImportsQueryKey,
  getGetDashboardQueryKey,
  getListPlayersQueryKey,
  getListGradesQueryKey,
  getGetRecordsQueryKey,
} from "@workspace/api-client-react";
import { useInvalidateAdmin } from "@/lib/admin-auth";
import { useConfirm } from "@/components/confirm-dialog";
import { rowKey, type ReconcileMode, type RowResolution } from "./resolution";

/**
 * State shared by every import mode (CSV / single match / batch): the admin's
 * name resolutions, the backfill choice, upload/error/committed flags, the
 * import list + commit/delete/undo mutations, and the aggregate invalidation
 * that follows any applied change. The per-mode hooks build on this.
 */
export function useImportSession() {
  const queryClient = useQueryClient();
  const invalidateAdmin = useInvalidateAdmin();
  const confirm = useConfirm();
  const [resolutions, setResolutions] = useState<Record<string, RowResolution>>({});
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [committed, setCommitted] = useState<{ label: string } | null>(null);
  const [isBackfill, setIsBackfill] = useState(false);
  const [reconcileMode, setReconcileMode] = useState<ReconcileMode>("peel");

  const setRowResolution = (key: string, r: RowResolution | undefined) =>
    setResolutions((prev) => {
      if (!r) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: r };
    });

  /** Seed default resolutions: `new` rows default to create; `suggested` rows
   * are left undecided so the admin must confirm a link or a create. */
  const seedResolutions = (
    players: Array<{ surname: string; givenName: string; status: string }>,
  ) => {
    const seed: Record<string, RowResolution> = {};
    for (const p of players) {
      if (p.status === "new") {
        seed[rowKey(p.surname, p.givenName)] = { action: "create" };
      }
    }
    setResolutions(seed);
  };

  const {
    data: imports,
    refetch: refetchImports,
    isError: importsError,
    isLoading: importsLoading,
  } = useListImports();
  const commit = useCommitImport();
  const del = useDeleteImport();
  const undoSeason = useUndoSeason();

  const invalidateAggregates = () => {
    queryClient.invalidateQueries({ queryKey: getListImportsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListPlayersQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListGradesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetRecordsQueryKey() });
  };

  /** Message for a failed generated-client call: the server's `error` field when present. */
  const apiErrorMessage = (e: unknown): string => {
    const err = e as { status?: number; data?: { error?: unknown }; message?: string } | null;
    if (typeof err?.data?.error === "string") return err.data.error;
    if (typeof err?.status === "number") return `HTTP ${err.status}`;
    return err?.message ?? "Request failed";
  };

  const handleMutationError = (e: unknown): boolean => {
    const status = (e as { status?: number } | null)?.status;
    if (status === 401) {
      invalidateAdmin();
      setError("Your session has expired — please sign in again.");
      return true;
    }
    return false;
  };

  /** Clear the shared per-preview state (resolutions + backfill choice). */
  const resetShared = () => {
    setResolutions({});
    setIsBackfill(false);
    setReconcileMode("peel");
  };

  /** Discard a pending preview (deletes the holder import). */
  const cancelPreview = (id: number, afterSuccess: () => void) => {
    del.mutate(
      { id },
      {
        onSuccess: () => {
          afterSuccess();
          invalidateAggregates();
        },
        onError: (e) => {
          if (handleMutationError(e)) return;
          setError((e as Error).message);
        },
      },
    );
  };

  const deleteImport = async (id: number) => {
    if (
      !(await confirm({
        title: "Delete import",
        description: "Delete this import? Aggregates will be re-derived without its contribution.",
        confirmText: "Delete",
        destructive: true,
      }))
    )
      return;
    del.mutate(
      { id },
      {
        onSuccess: invalidateAggregates,
        onError: (e) => {
          if (handleMutationError(e)) return;
          setError((e as Error).message);
        },
      },
    );
  };

  /** Roll back a grade's season; resolves to the summary line the card shows. */
  const runUndoSeason = (grade: string, s: number) =>
    new Promise<string>((resolve, reject) => {
      undoSeason.mutate(
        { data: { grade, season: s } },
        {
          onSuccess: (r) => {
            invalidateAggregates();
            resolve(
              `Removed ${r.matchesDeleted} match${
                r.matchesDeleted === 1 ? "" : "es"
              } and ${r.playersRemoved} orphaned player${r.playersRemoved === 1 ? "" : "s"}.`,
            );
          },
          onError: (e) => {
            if (handleMutationError(e)) {
              reject(new Error("Session expired"));
              return;
            }
            reject(e as Error);
          },
        },
      );
    });

  return {
    resolutions,
    setRowResolution,
    seedResolutions,
    uploading,
    setUploading,
    error,
    setError,
    committed,
    setCommitted,
    isBackfill,
    setIsBackfill,
    reconcileMode,
    setReconcileMode,
    imports,
    refetchImports,
    importsError,
    importsLoading,
    commit,
    del,
    undoSeason,
    invalidateAggregates,
    apiErrorMessage,
    handleMutationError,
    resetShared,
    cancelPreview,
    deleteImport,
    runUndoSeason,
  };
}

export type ImportSession = ReturnType<typeof useImportSession>;
