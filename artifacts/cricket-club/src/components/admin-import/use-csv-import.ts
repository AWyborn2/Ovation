import { useState } from "react";
import { uploadPlaycricketCsv, type ImportPreview } from "@workspace/api-client-react";
import { buildResolutions, seasonLabel } from "./resolution";
import type { ImportSession } from "./use-import-session";

/** Whole-season PlayCricket CSV: upload → preview → commit. */
export function useCsvImport(session: ImportSession) {
  const [file, setFile] = useState<File | null>(null);
  const [season, setSeason] = useState<number>(new Date().getFullYear());
  const [preview, setPreview] = useState<ImportPreview | null>(null);

  const reset = () => {
    setPreview(null);
    setFile(null);
  };

  const onUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    session.setError(null);
    if (!file) {
      session.setError("Please choose a CSV file first.");
      return;
    }
    session.setUploading(true);
    try {
      const data = await uploadPlaycricketCsv({ file, season });
      setPreview(data);
      session.seedResolutions(data.players);
      session.refetchImports();
    } catch (err) {
      if (!session.handleMutationError(err)) session.setError(session.apiErrorMessage(err));
    } finally {
      session.setUploading(false);
    }
  };

  const onConfirm = (afterSuccess: () => void) => {
    if (!preview) return;
    session.commit.mutate(
      {
        id: preview.importId,
        data: {
          resolutions: buildResolutions(session.resolutions, preview.players),
          reconcileMode: session.isBackfill ? session.reconcileMode : null,
        },
      },
      {
        onSuccess: () => {
          session.setCommitted({ label: `the ${seasonLabel(preview.season)} season` });
          afterSuccess();
          session.invalidateAggregates();
        },
        onError: (e) => {
          if (session.handleMutationError(e)) return;
          session.setError((e as Error).message);
        },
      },
    );
  };

  return { file, setFile, season, setSeason, preview, reset, onUpload, onConfirm };
}
