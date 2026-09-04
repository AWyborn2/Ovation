import { useState } from "react";
import { Link } from "wouter";
import { useClubShortName } from "@/lib/brand-context";
import {
  useImportSession,
  useCsvImport,
  useXlsxImport,
  useBatchImport,
  ModeTabs,
  CsvUploadForm,
  MatchUploadForm,
  BatchUploadForm,
  CsvPreviewCard,
  MatchPreviewCard,
  BatchPreviewCard,
  UndoSeasonCard,
  PastImportsCard,
  type Mode,
} from "@/components/admin-import";

/**
 * Admin · Import Stats. Three mutually exclusive modes (season CSV, single
 * match, season batch) share one session (`useImportSession`) for name
 * resolutions, the backfill choice and the applied-import bookkeeping; each
 * mode's upload → preview → commit flow lives in its own hook under
 * `components/admin-import/` (plan.md §5.6).
 */
export default function AdminImport() {
  const clubShort = useClubShortName();
  const [mode, setMode] = useState<Mode>("csv");
  const session = useImportSession();
  const csv = useCsvImport(session);
  const match = useXlsxImport(session);
  const batch = useBatchImport(session, mode === "batch");

  const resetPreviews = () => {
    csv.reset();
    match.reset();
    batch.reset();
    session.resetShared();
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    session.setError(null);
    session.setCommitted(null);
    resetPreviews();
  };

  const onCancelPreview = () => {
    const id = csv.preview?.importId ?? match.preview?.importId ?? batch.preview?.importId;
    if (id == null) return;
    session.cancelPreview(id, resetPreviews);
  };

  const noPreview = !csv.preview && !match.preview && !batch.preview;

  // Props every preview card shares (see `PreviewCommonProps`).
  const common = {
    resolutions: session.resolutions,
    setRowResolution: session.setRowResolution,
    isBackfill: session.isBackfill,
    setIsBackfill: session.setIsBackfill,
    reconcileMode: session.reconcileMode,
    setReconcileMode: session.setReconcileMode,
    error: session.error,
    onCancel: onCancelPreview,
    cancelling: session.del.isPending,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-bold">Admin · Import Stats</h1>
        <p className="text-muted-foreground mt-1">
          Import a whole-season PlayCricket CSV, or add a single match scorecard to the running
          season totals. Nothing is applied until you Confirm.
        </p>
      </div>

      {session.committed && noPreview && (
        <div className="rounded-md border border-green-600/40 bg-green-600/10 p-4 text-sm space-y-2">
          <p className="font-medium">
            Import applied for {session.committed.label}. Aggregates have been re-derived.
          </p>
          <Link
            href="/admin/social/queue"
            className="inline-flex items-center text-green-700 dark:text-green-400 font-medium hover:underline"
          >
            Open the social card queue →
          </Link>
        </div>
      )}

      {noPreview && <ModeTabs mode={mode} onChange={switchMode} />}

      {noPreview && mode === "csv" && (
        <CsvUploadForm
          onSubmit={csv.onUpload}
          onFile={csv.setFile}
          season={csv.season}
          setSeason={csv.setSeason}
          uploading={session.uploading}
          error={session.error}
        />
      )}

      {noPreview && mode === "match" && (
        <MatchUploadForm
          onSubmit={match.onUpload}
          onFile={match.setFile}
          uploading={session.uploading}
          error={session.error}
        />
      )}

      {noPreview && mode === "batch" && (
        <BatchUploadForm
          onSubmit={batch.onUpload}
          onFiles={batch.setFiles}
          uploading={session.uploading}
          error={session.error}
        />
      )}

      {csv.preview && (
        <CsvPreviewCard
          {...common}
          preview={csv.preview}
          onConfirm={() => csv.onConfirm(resetPreviews)}
          committing={session.commit.isPending}
        />
      )}

      {match.preview && (
        <MatchPreviewCard
          {...common}
          matchPreview={match.preview}
          clubShort={clubShort}
          matchRound={match.matchRound}
          setMatchRound={match.setMatchRound}
          matchStage={match.matchStage}
          setMatchStage={match.setMatchStage}
          onConfirm={() => match.onConfirm(resetPreviews)}
          committing={session.commit.isPending}
        />
      )}

      {batch.preview && (
        <BatchPreviewCard
          {...common}
          batchPreview={batch.preview}
          fileResolutions={batch.fileResolutions}
          setFileResolutions={batch.setFileResolutions}
          uploading={session.uploading}
          onConfirm={() => void batch.onConfirm(resetPreviews)}
        />
      )}

      <UndoSeasonCard disabled={session.undoSeason.isPending} onUndo={session.runUndoSeason} />

      <PastImportsCard
        imports={session.imports}
        isError={session.importsError}
        isLoading={session.importsLoading}
        onRetry={() => session.refetchImports()}
        onDelete={session.deleteImport}
        deleting={session.del.isPending}
      />
    </div>
  );
}
