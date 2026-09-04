import { useEffect, useRef, useState } from "react";
import {
  uploadMatchBatch,
  commitMatchBatch,
  revalidateMatchBatch,
  type BatchImportPreview,
} from "@workspace/api-client-react";
import {
  buildFileResolutions,
  buildResolutions,
  type FileResolutionEntry,
} from "./resolution";
import type { ImportSession } from "./use-import-session";

/**
 * Season batch (.xlsx files / .zip): upload → preview with per-file round /
 * final resolvers (live re-validated) → commit every committable match.
 * `active` gates the live re-validation to the batch mode only.
 */
export function useBatchImport(session: ImportSession, active: boolean) {
  const [files, setFiles] = useState<FileList | null>(null);
  const [preview, setPreview] = useState<BatchImportPreview | null>(null);
  const [fileResolutions, setFileResolutions] = useState<
    Record<string, FileResolutionEntry>
  >({});

  // Monotonic token so only the latest revalidate response is applied — rapid
  // resolver edits fire overlapping requests that can resolve out of order.
  const revalidateSeq = useRef(0);

  // Live re-validation: whenever the admin changes a per-file round/stage fix,
  // re-classify the pending batch holder server-side (debounced) and refresh the
  // per-file statuses and committable count so a remapped duplicate clears before
  // they commit. Best-effort — the commit re-validates authoritatively.
  useEffect(() => {
    if (!active || !preview) return;
    if (Object.keys(fileResolutions).length === 0) return;
    const importId = preview.importId;
    const controller = new AbortController();
    const seq = ++revalidateSeq.current;
    const handle = setTimeout(async () => {
      try {
        const data = await revalidateMatchBatch(
          importId,
          { fileResolutions: buildFileResolutions(fileResolutions) },
          { signal: controller.signal },
        );
        // Drop stale responses that resolved after a newer request was issued.
        if (seq !== revalidateSeq.current) return;
        setPreview((prev) =>
          prev && prev.importId === importId
            ? {
                ...prev,
                files: data.files,
                committableMatches: data.committableMatches,
              }
            : prev,
        );
      } catch {
        // ignore — aborted or best-effort live refresh failed
      }
    }, 400);
    return () => {
      clearTimeout(handle);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileResolutions, preview?.importId, active]);

  const reset = () => {
    setPreview(null);
    setFiles(null);
    setFileResolutions({});
  };

  const onUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    session.setError(null);
    if (!files || files.length === 0) {
      session.setError("Please choose one or more .xlsx scorecards, or a .zip.");
      return;
    }
    session.setUploading(true);
    try {
      const data = await uploadMatchBatch({ files: Array.from(files) });
      setPreview(data);
      session.seedResolutions(data.players);
      session.refetchImports();
    } catch (err) {
      if (!session.handleMutationError(err)) session.setError(session.apiErrorMessage(err));
    } finally {
      session.setUploading(false);
    }
  };

  const onConfirm = async (afterSuccess: () => void) => {
    if (!preview) return;
    session.setUploading(true);
    session.setError(null);
    try {
      const body = await commitMatchBatch(preview.importId, {
        resolutions: buildResolutions(session.resolutions, preview.players),
        fileResolutions: buildFileResolutions(fileResolutions),
        reconcileMode: session.isBackfill ? session.reconcileMode : null,
      });
      const committedCount = body.committed ?? 0;
      session.setCommitted({
        label: `${committedCount} match${committedCount === 1 ? "" : "es"}`,
      });
      afterSuccess();
      session.invalidateAggregates();
    } catch (err) {
      if (!session.handleMutationError(err)) session.setError(session.apiErrorMessage(err));
    } finally {
      session.setUploading(false);
    }
  };

  return {
    files,
    setFiles,
    preview,
    fileResolutions,
    setFileResolutions,
    reset,
    onUpload,
    onConfirm,
  };
}
