import { useState } from "react";
import { Download } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListTenantCapImportBatches,
  usePreviewTenantCapImport,
  useCommitTenantCapImport,
  useUndoTenantCapImportBatch,
  getListTenantCapImportBatchesQueryKey,
  getGetCapImportTemplateUrl,
  type CapImportCommitResult,
  type CapImportPlannedCap,
  type CapImportPreview,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useConfirm } from "@/components/confirm-dialog";

/**
 * Cap register CSV import: the platform admin previews a club's own A Grade /
 * Female A Grade cap numbering (how each cap would link to a player; errors
 * with their row), commits it as one labelled batch, and can undo a batch while
 * no later cap has been issued after it. Exact-name links only: anything else
 * is written unlinked, to be linked by hand in Admin → Caps.
 */

const LIST_LABEL = { male: "A Grade", female: "Female A Grade" } as const;

const STATUS_TEXT: Record<CapImportPlannedCap["status"], string> = {
  linked: "Linked",
  unmatched: "No matching player",
  ambiguous: "Several players share this name",
  private: "Only a private player has this name",
};

/** The server's `error` (and preview, for a 422) from a failed generated-client call. */
function apiError(e: unknown): { message: string; preview?: CapImportPreview } {
  const err = e as {
    status?: number;
    data?: { error?: unknown; preview?: CapImportPreview };
    message?: string;
  } | null;
  const message =
    typeof err?.data?.error === "string"
      ? err.data.error
      : typeof err?.status === "number"
        ? `HTTP ${err.status}`
        : (err?.message ?? "Request failed");
  return { message, preview: err?.data?.preview };
}

/** Per-list counts of how the caps would link. */
export function capSummary(caps: readonly CapImportPlannedCap[]): Array<{
  category: "male" | "female";
  total: number;
  linked: number;
  unlinked: number;
}> {
  return (["male", "female"] as const)
    .map((category) => {
      const list = caps.filter((c) => c.category === category);
      const linked = list.filter((c) => c.playerId !== null).length;
      return { category, total: list.length, linked, unlinked: list.length - linked };
    })
    .filter((s) => s.total > 0);
}

export function CapPreviewView({ preview }: { preview: CapImportPreview }) {
  const summary = capSummary(preview.caps);
  const unlinked = preview.caps.filter((c) => c.playerId === null);
  return (
    <div className="space-y-4">
      {preview.errors.length > 0 ? (
        <div role="alert" className="rounded-md border border-destructive/40 p-3">
          <p className="mb-2 text-sm font-medium text-destructive">
            {preview.errors.length} {preview.errors.length === 1 ? "problem" : "problems"} — fix the
            file and preview again. Nothing can be imported until it is clean.
          </p>
          <ul className="space-y-1 text-sm" aria-label="Cap import errors">
            {preview.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {preview.centralUnavailable ? (
        <p className="text-sm text-amber-700">
          Central couldn&rsquo;t be read, so only pre-digital players could be linked:{" "}
          {preview.centralUnavailable}
        </p>
      ) : null}
      {summary.length > 0 ? (
        <ul className="space-y-1 text-sm" aria-label="Cap lists">
          {summary.map((s) => (
            <li key={s.category}>
              <strong>{LIST_LABEL[s.category]}</strong>: {s.total} caps · {s.linked} linked to a
              player · {s.unlinked} unlinked
            </li>
          ))}
        </ul>
      ) : null}
      {unlinked.length > 0 ? (
        <div className="overflow-x-auto">
          <p className="mb-1 text-xs text-muted-foreground">
            These caps are still written, unlinked. Link them by hand in Admin → Caps afterwards.
          </p>
          <table className="w-full text-sm" aria-label="Unlinked caps">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-1 pr-3">List</th>
                <th className="py-1 pr-3 text-right">Cap</th>
                <th className="py-1 pr-3">Name</th>
                <th className="py-1">Why</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {unlinked.map((c) => (
                <tr key={`${c.category}-${c.capNumber}`} className="align-top">
                  <td className="py-1 pr-3">{LIST_LABEL[c.category]}</td>
                  <td className="py-1 pr-3 text-right">#{c.capNumber}</td>
                  <td className="py-1 pr-3">{c.name}</td>
                  <td className="py-1">
                    {STATUS_TEXT[c.status]}
                    {c.note ? (
                      <span className="block text-xs text-muted-foreground">{c.note}</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

export function CapImportCard({ tenantId }: { tenantId: number }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CapImportPreview | null>(null);
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [committed, setCommitted] = useState<CapImportCommitResult | null>(null);

  const reset = () => {
    setPreview(null);
    setCommitted(null);
    setError(null);
  };

  const batches = useListTenantCapImportBatches(tenantId);

  const previewMut = usePreviewTenantCapImport({
    mutation: {
      onSuccess: (p) => {
        setError(null);
        setPreview(p);
      },
      onError: (e) => {
        setPreview(null);
        setError(apiError(e).message);
      },
    },
  });
  const commitMut = useCommitTenantCapImport({
    mutation: {
      onSuccess: (r) => {
        setCommitted(r);
        setPreview(null);
        setFile(null);
        setLabel("");
        qc.invalidateQueries({ queryKey: getListTenantCapImportBatchesQueryKey(tenantId) });
      },
      onError: (e) => {
        const { message: m, preview: p } = apiError(e);
        setError(m);
        if (p) setPreview(p);
      },
    },
  });
  const undo = useUndoTenantCapImportBatch({
    mutation: {
      onSuccess: (r) => {
        setMessage(`Undid batch ${r.batchId}: ${r.capsRemoved} caps removed.`);
        qc.invalidateQueries({ queryKey: getListTenantCapImportBatchesQueryKey(tenantId) });
      },
      onError: (e) => setMessage(apiError(e).message),
    },
  });

  function onPreview() {
    if (!file) {
      setError("Choose a CSV file first.");
      return;
    }
    setCommitted(null);
    previewMut.mutate({ id: tenantId, data: { file } });
  }

  function onCommit() {
    if (!file || !preview) return;
    commitMut.mutate({ id: tenantId, data: { file, label: label.trim() } });
  }

  async function onUndo(batchId: string, batchLabel: string) {
    if (
      !(await confirm({
        title: `Undo "${batchLabel}"?`,
        description:
          "Deletes the caps this import wrote. It is refused if a later cap has been issued " +
          "after them in the same list.",
        confirmText: "Undo batch",
        destructive: true,
      }))
    )
      return;
    setMessage(null);
    undo.mutate({ id: tenantId, batchId });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cap register</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Load the club&rsquo;s own A Grade and Female A Grade cap numbering from a CSV (category,
          cap number, name, games). Caps are written confirmed and linked to a player only on an
          exact name match; run the history import first so pre-digital players can be linked. A
          list that already has caps is refused.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <a
            href={getGetCapImportTemplateUrl()}
            download="cap-register.csv"
            className="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-muted"
          >
            <Download className="mr-1 h-4 w-4" /> Download cap template
          </a>
          <div className="space-y-1">
            <Label htmlFor="cap-file">Cap register CSV file</Label>
            <Input
              id="cap-file"
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                reset();
              }}
            />
          </div>
          <Button type="button" onClick={onPreview} disabled={previewMut.isPending || !file}>
            {previewMut.isPending ? "Checking…" : "Preview caps"}
          </Button>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {committed ? (
          <p className="text-sm text-green-700" role="status">
            Imported batch {committed.batchId}: {committed.written} caps, {committed.linked} linked
            and {committed.unlinked} unlinked.
          </p>
        ) : null}

        {preview ? (
          <>
            <CapPreviewView preview={preview} />
            {preview.errors.length === 0 && preview.rowCount > 0 ? (
              <div className="flex flex-wrap items-end gap-3 border-t pt-4">
                <div className="space-y-1">
                  <Label htmlFor="cap-batch-label">Batch label</Label>
                  <Input
                    id="cap-batch-label"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="e.g. A Grade caps (club list)"
                    className="w-80"
                  />
                </div>
                <Button
                  type="button"
                  onClick={onCommit}
                  disabled={commitMut.isPending || !label.trim()}
                >
                  {commitMut.isPending ? "Importing…" : `Import ${preview.rowCount} caps`}
                </Button>
              </div>
            ) : null}
          </>
        ) : null}

        <div className="border-t pt-4">
          <h3 className="mb-2 text-sm font-medium">Imported cap batches</h3>
          {batches.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
          {batches.isError ? (
            <p className="text-sm text-destructive">{apiError(batches.error).message}</p>
          ) : null}
          {batches.data && batches.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No cap register imported yet.</p>
          ) : null}
          {batches.data && batches.data.length > 0 ? (
            <ul className="divide-y text-sm" aria-label="Cap import batches">
              {batches.data.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div>
                    <span className="font-medium">{b.label}</span>
                    <div className="text-xs text-muted-foreground">
                      {new Date(b.createdAt).toLocaleString()} · {b.male} A Grade · {b.female}{" "}
                      Female A Grade · {b.linked} linked · {b.unlinked} unlinked
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onUndo(b.id, b.label)}
                    disabled={undo.isPending}
                  >
                    Undo
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          {message ? <p className="mt-2 text-sm text-muted-foreground">{message}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}
