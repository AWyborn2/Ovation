import { useState } from "react";
import {
  uploadMatchScorecard,
  type MatchStage,
  type MatchImportPreview,
} from "@workspace/api-client-react";
import { buildResolutions, seasonLabel } from "./resolution";
import type { ImportSession } from "./use-import-session";

/** Single match scorecard (.xlsx): upload → preview (round / final) → commit. */
export function useXlsxImport(session: ImportSession) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<MatchImportPreview | null>(null);
  const [matchRound, setMatchRound] = useState<string>("");
  const [matchStage, setMatchStage] = useState<string>("");

  const reset = () => {
    setPreview(null);
    setMatchRound("");
    setMatchStage("");
    setFile(null);
  };

  const onUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    session.setError(null);
    if (!file) {
      session.setError("Please choose a scorecard .xlsx file first.");
      return;
    }
    session.setUploading(true);
    try {
      const data = await uploadMatchScorecard({ file });
      setPreview(data);
      setMatchRound(data.round != null ? String(data.round) : "");
      setMatchStage(data.stage ?? "");
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
    // A finals stage wins and clears the round; otherwise the typed round stands.
    const stage = matchStage ? (matchStage as MatchStage) : null;
    const trimmed = matchRound.trim();
    const round = stage ? null : trimmed === "" ? null : parseInt(trimmed, 10);
    session.commit.mutate(
      {
        id: preview.importId,
        data: {
          resolutions: buildResolutions(session.resolutions, preview.players),
          round,
          stage,
          reconcileMode: session.isBackfill ? session.reconcileMode : null,
        },
      },
      {
        onSuccess: () => {
          const label = stage ? `${stage}, ` : round != null ? `Round ${round}, ` : "";
          session.setCommitted({
            label: `${label}${preview.grade ?? ""} ${seasonLabel(preview.season)}`.trim(),
          });
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

  return {
    file,
    setFile,
    preview,
    matchRound,
    setMatchRound,
    matchStage,
    setMatchStage,
    reset,
    onUpload,
    onConfirm,
  };
}
