import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetAdminTenant,
  useListTenantHistoryBatches,
  useGetTenantHistoryBoundaries,
  usePreviewTenantHistoryImport,
  useCommitTenantHistoryImport,
  useUndoTenantHistoryBatch,
  useReplaceTenantHistoryBoundaries,
  getListTenantHistoryBatchesQueryKey,
  getGetTenantHistoryBoundariesQueryKey,
  getGetHistoryImportTemplateUrl,
  type HistoryBoundary,
  type HistoryCoverage,
  type HistoryImportPreview,
  type HistoryImportTemplate,
  type HistoryImportCommitResult,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useConfirm } from "@/components/confirm-dialog";

/**
 * Concierge club history import (hybrid stats plan U11; R13, R14, R18). The
 * platform admin sets the club's boundary, uploads a CSV in one of four
 * templates, reviews the preview (row-numbered errors, each player's career
 * delta, span suggestions to confirm), commits it as one batch, and can undo
 * any batch. Pre-digital history only: every stats row must end before the
 * boundary, which is the first season central supplies.
 */

export const TEMPLATES: { value: HistoryImportTemplate; label: string; hint: string }[] = [
  {
    value: "career",
    label: "Career totals",
    hint: "One row per player and grade, with first and last season.",
  },
  { value: "season", label: "Season totals", hint: "One row per player, grade and season." },
  { value: "match", label: "Match scorecards", hint: "One row per player per match." },
  {
    value: "honours",
    label: "Honours and records",
    hint: "Awards, centuries, five-wicket hauls and club records.",
  },
];

/** 2003 -> "2003/04". */
export function seasonText(startYear: number): string {
  return `${startYear}/${String((startYear + 1) % 100).padStart(2, "0")}`;
}

/** "2003/04" or "2003" -> 2003; null when it doesn't parse. */
export function parseSeasonInput(raw: string): number | null {
  const m = /^\s*(\d{4})(?:\s*[/-]\s*\d{2,4})?\s*$/.exec(raw);
  return m ? Number(m[1]) : null;
}

/** "A Grade 1995/96–2002/03, B Grade careers" — a short read of a coverage list. */
export function coverageSummary(coverage: readonly HistoryCoverage[]): string {
  const byGrade = new Map<string, { seasons: number[]; career: boolean }>();
  for (const c of coverage) {
    const g = byGrade.get(c.grade) ?? { seasons: [], career: false };
    if (c.season === null) g.career = true;
    else g.seasons.push(c.season);
    byGrade.set(c.grade, g);
  }
  return [...byGrade.entries()]
    .map(([grade, g]) => {
      const parts: string[] = [];
      if (g.seasons.length > 0) {
        const lo = Math.min(...g.seasons);
        const hi = Math.max(...g.seasons);
        parts.push(lo === hi ? seasonText(lo) : `${seasonText(lo)}–${seasonText(hi)}`);
      }
      if (g.career) parts.push("career totals");
      return `${grade} ${parts.join(" + ")}`;
    })
    .join(", ");
}

/** The confirmed links to send: only players with a chosen suggestion. */
export function linksFromSelection(
  selection: Record<string, number | null>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, id] of Object.entries(selection)) if (id !== null) out[key] = id;
  return out;
}

/** The server's `error` (and preview, for a 422) from a failed generated-client call. */
function apiError(e: unknown): { message: string; preview?: HistoryImportPreview } {
  const err = e as {
    status?: number;
    data?: { error?: unknown; preview?: HistoryImportPreview };
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

export default function HistoryImportPage() {
  const params = useParams();
  const id = Number(params.id);
  const { data, isLoading, isError } = useGetAdminTenant(id);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }
  if (isError || !data) {
    return <p className="py-16 text-center text-muted-foreground">No such tenant.</p>;
  }

  return (
    <div>
      <Link
        href={`/platform-admin/tenants/${id}`}
        className="mb-4 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="mr-1 h-4 w-4" /> {data.tenant.name}
      </Link>
      <h1 className="mb-2 text-[clamp(32px,4vw,52px)] leading-none">History import</h1>
      <p className="max-w-3xl text-sm text-muted-foreground">
        Load {data.tenant.name}&rsquo;s pre-digital history. Central supplies every season from the
        boundary on; imported history must end before it. Nothing is written until you commit, and
        any batch can be undone. Importing history never drafts social cards.
      </p>
      <div className="mt-6 grid gap-6">
        <BoundaryCard tenantId={id} />
        <ImportCard tenantId={id} />
        <BatchesCard tenantId={id} />
      </div>
    </div>
  );
}

// ── Boundary ──────────────────────────────────────────────────────────────

type BoundaryDraft = { grade: string; season: string };

function BoundaryCard({ tenantId }: { tenantId: number }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { data, isError, error } = useGetTenantHistoryBoundaries(tenantId);
  const [rows, setRows] = useState<BoundaryDraft[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      setRows(data.map((b) => ({ grade: b.grade ?? "", season: seasonText(b.startSeason) })));
    }
  }, [data]);

  const save = useReplaceTenantHistoryBoundaries({
    mutation: {
      onSuccess: () => {
        setMessage("Saved.");
        qc.invalidateQueries({ queryKey: getGetTenantHistoryBoundariesQueryKey(tenantId) });
      },
      onError: (e) => setMessage(apiError(e).message),
    },
  });

  async function onSave() {
    const boundaries: HistoryBoundary[] = [];
    for (const r of rows) {
      const startSeason = parseSeasonInput(r.season);
      if (startSeason === null) {
        setMessage(`"${r.season}" isn't a season (use 2003/04).`);
        return;
      }
      boundaries.push({ grade: r.grade.trim() || null, startSeason });
    }
    if (
      !(await confirm({
        title: "Change the club's boundary?",
        description:
          "Central seasons before a grade's boundary stop counting, and club history supplies " +
          "them instead. This changes the club's public careers, records and milestones.",
        confirmText: "Save boundary",
      }))
    )
      return;
    setMessage(null);
    save.mutate({ id: tenantId, data: { boundaries } });
  }

  const missingStore = isError && (error as { status?: number } | null)?.status === 503;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Boundary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          The first season central supplies. Leave the grade blank for the club default; add a row
          per grade that differs.
        </p>
        {missingStore ? (
          <p className="text-sm text-destructive">{apiError(error).message}</p>
        ) : null}
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No boundary yet — history can&rsquo;t be imported until one is set.
          </p>
        ) : null}
        {rows.map((r, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor={`b-grade-${i}`}>Grade</Label>
              <Input
                id={`b-grade-${i}`}
                value={r.grade}
                placeholder="Club default"
                onChange={(e) =>
                  setRows(rows.map((x, j) => (j === i ? { ...x, grade: e.target.value } : x)))
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`b-season-${i}`}>First central season</Label>
              <Input
                id={`b-season-${i}`}
                value={r.season}
                placeholder="2003/04"
                onChange={(e) =>
                  setRows(rows.map((x, j) => (j === i ? { ...x, season: e.target.value } : x)))
                }
              />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRows(rows.filter((_, j) => j !== i))}
            >
              Remove
            </Button>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => setRows([...rows, { grade: "", season: "" }])}
          >
            Add row
          </Button>
          <Button type="button" onClick={onSave} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save boundary"}
          </Button>
          {message ? <span className="text-sm text-muted-foreground">{message}</span> : null}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Import ────────────────────────────────────────────────────────────────

function ImportCard({ tenantId }: { tenantId: number }) {
  const qc = useQueryClient();
  const [template, setTemplate] = useState<HistoryImportTemplate>("career");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<HistoryImportPreview | null>(null);
  const [selection, setSelection] = useState<Record<string, number | null>>({});
  const [label, setLabel] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [committed, setCommitted] = useState<HistoryImportCommitResult | null>(null);

  const reset = () => {
    setPreview(null);
    setSelection({});
    setCommitted(null);
    setError(null);
  };

  const previewMut = usePreviewTenantHistoryImport({
    mutation: {
      onSuccess: (p) => {
        setError(null);
        setPreview(p);
        setSelection({});
      },
      onError: (e) => {
        setPreview(null);
        setError(apiError(e).message);
      },
    },
  });
  const commitMut = useCommitTenantHistoryImport({
    mutation: {
      onSuccess: (r) => {
        setCommitted(r);
        setPreview(null);
        setSelection({});
        setFile(null);
        setLabel("");
        setNote("");
        qc.invalidateQueries({ queryKey: getListTenantHistoryBatchesQueryKey(tenantId) });
      },
      onError: (e) => {
        const { message, preview: p } = apiError(e);
        setError(message);
        if (p) setPreview(p);
      },
    },
  });

  function onPreview() {
    if (!file) {
      setError("Choose a CSV file first.");
      return;
    }
    setCommitted(null);
    previewMut.mutate({ id: tenantId, data: { file, template } });
  }

  function onCommit() {
    if (!file || !preview) return;
    commitMut.mutate({
      id: tenantId,
      data: {
        file,
        template,
        label: label.trim(),
        note: note.trim() || undefined,
        links: JSON.stringify(linksFromSelection(selection)),
      },
    });
  }

  const hint = TEMPLATES.find((t) => t.value === template)?.hint;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import a file</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="template">Template</Label>
            <select
              id="template"
              value={template}
              onChange={(e) => {
                setTemplate(e.target.value as HistoryImportTemplate);
                reset();
              }}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              {TEMPLATES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <a
            href={getGetHistoryImportTemplateUrl(template)}
            download={`club-history-${template}.csv`}
            className="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-muted"
          >
            <Download className="mr-1 h-4 w-4" /> Download template
          </a>
          <div className="space-y-1">
            <Label htmlFor="history-file">CSV file</Label>
            <Input
              id="history-file"
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                reset();
              }}
            />
          </div>
          <Button type="button" onClick={onPreview} disabled={previewMut.isPending || !file}>
            {previewMut.isPending ? "Checking…" : "Preview"}
          </Button>
        </div>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {committed ? (
          <p className="text-sm text-green-700" role="status">
            Imported batch #{committed.batchId}: {committed.rows} rows, {committed.honours} honours,{" "}
            {committed.linkedPlayers} linked and {committed.newPlayers} new pre-digital players.
          </p>
        ) : null}

        {preview ? (
          <>
            <HistoryPreviewView
              preview={preview}
              selection={selection}
              onSelect={(key, playerId) => setSelection({ ...selection, [key]: playerId })}
            />
            {preview.errors.length === 0 ? (
              <div className="flex flex-wrap items-end gap-3 border-t pt-4">
                <div className="space-y-1">
                  <Label htmlFor="batch-label">Batch label</Label>
                  <Input
                    id="batch-label"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="e.g. 1985–2002 career totals (club book)"
                    className="w-80"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="batch-note">Note (optional)</Label>
                  <Input
                    id="batch-note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="w-80"
                  />
                </div>
                <Button
                  type="button"
                  onClick={onCommit}
                  disabled={commitMut.isPending || !label.trim() || preview.rowCount === 0}
                >
                  {commitMut.isPending ? "Importing…" : "Commit import"}
                </Button>
              </div>
            ) : null}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

/**
 * The preview: row-numbered errors and warnings, what the file covers, each
 * player's career delta with span suggestions to confirm (at most one per
 * player; unconfirmed players stay separate pre-digital players), and honours.
 */
export function HistoryPreviewView({
  preview,
  selection,
  onSelect,
}: {
  preview: HistoryImportPreview;
  selection: Record<string, number | null>;
  onSelect: (key: string, playerId: number | null) => void;
}) {
  return (
    <div className="space-y-4">
      {preview.errors.length > 0 ? (
        <div role="alert" className="rounded-md border border-destructive/40 p-3">
          <p className="mb-2 text-sm font-medium text-destructive">
            {preview.errors.length} {preview.errors.length === 1 ? "problem" : "problems"} — fix the
            file and preview again. Nothing can be imported until it is clean.
          </p>
          <ul className="space-y-1 text-sm" aria-label="Import errors">
            {preview.errors.map((e, i) => (
              <li key={i}>
                <span className="font-mono">Row {e.row}</span>
                {e.column ? (
                  <span className="text-muted-foreground"> · {e.column}</span>
                ) : null}: {e.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {preview.warnings.length > 0 ? (
        <ul className="space-y-1 text-sm text-amber-700" aria-label="Import warnings">
          {preview.warnings.map((w, i) => (
            <li key={i}>
              Row {w.row}: {w.message}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-sm text-muted-foreground">
        {preview.rowCount} rows
        {preview.coverage.length > 0 ? ` · covers ${coverageSummary(preview.coverage)}` : ""}
      </p>

      {preview.players.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" aria-label="Players">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-1 pr-3">Player</th>
                <th className="py-1 pr-3">Seasons</th>
                <th className="py-1 pr-3 text-right">Games</th>
                <th className="py-1 pr-3 text-right">Runs</th>
                <th className="py-1 pr-3 text-right">Wkts</th>
                <th className="py-1 pr-3 text-right">Ct</th>
                <th className="py-1">Link to</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {preview.players.map((p) => (
                <tr key={p.key} className="align-top">
                  <td className="py-2 pr-3">
                    <span className="font-medium">{p.name}</span>
                    <div className="text-xs text-muted-foreground">{p.grades.join(", ")}</div>
                  </td>
                  <td className="py-2 pr-3">
                    {p.firstSeason === p.lastSeason
                      ? seasonText(p.firstSeason)
                      : `${seasonText(p.firstSeason)}–${seasonText(p.lastSeason)}`}
                  </td>
                  <td className="py-2 pr-3 text-right">+{p.delta.games}</td>
                  <td className="py-2 pr-3 text-right">+{p.delta.runs}</td>
                  <td className="py-2 pr-3 text-right">+{p.delta.wickets}</td>
                  <td className="py-2 pr-3 text-right">+{p.delta.catches}</td>
                  <td className="py-2">
                    {p.suggestions.length === 0 ? (
                      <span className="text-muted-foreground">New pre-digital player</span>
                    ) : (
                      <div className="space-y-1">
                        {p.suggestions.map((s) => {
                          const id = `link-${p.key}-${s.playerId}`;
                          return (
                            <label key={s.playerId} htmlFor={id} className="flex gap-2">
                              <input
                                id={id}
                                type="checkbox"
                                checked={selection[p.key] === s.playerId}
                                onChange={(e) =>
                                  onSelect(p.key, e.target.checked ? s.playerId : null)
                                }
                              />
                              <span>
                                Same person as <strong>{s.displayName ?? `#${s.playerId}`}</strong>
                                <span className="block text-xs text-muted-foreground">
                                  {s.reason}
                                </span>
                              </span>
                            </label>
                          );
                        })}
                        {selection[p.key] == null ? (
                          <span className="text-xs text-muted-foreground">
                            Unticked: stays a separate pre-digital player.
                          </span>
                        ) : null}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {preview.honours.length > 0 ? (
        <ul className="space-y-1 text-sm" aria-label="Honours">
          {preview.honours.map((h) => (
            <li key={h.row}>
              <span className="font-mono text-xs text-muted-foreground">Row {h.row}</span>{" "}
              {h.type.replace("_", " ")}: {h.title ? `${h.title} — ` : ""}
              {h.name}
              {h.season !== null ? ` (${seasonText(h.season)})` : ""}
              {h.grade ? `, ${h.grade}` : ""}
              {h.detail ? `, ${h.detail}` : ""}
              {h.linkedName ? (
                <span className="text-muted-foreground"> · links to {h.linkedName}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// ── Batches ───────────────────────────────────────────────────────────────

function BatchesCard({ tenantId }: { tenantId: number }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { data, isLoading, isError, error } = useListTenantHistoryBatches(tenantId);
  const [message, setMessage] = useState<string | null>(null);

  const undo = useUndoTenantHistoryBatch({
    mutation: {
      onSuccess: (r) => {
        setMessage(
          `Undid batch #${r.batchId}: ${r.rowsRemoved} rows, ${r.honoursRemoved} honours and ` +
            `${r.playersRemoved} pre-digital players removed.`,
        );
        qc.invalidateQueries({ queryKey: getListTenantHistoryBatchesQueryKey(tenantId) });
      },
      onError: (e) => setMessage(apiError(e).message),
    },
  });

  async function onUndo(batchId: number, label: string) {
    if (
      !(await confirm({
        title: `Undo "${label}"?`,
        description:
          "Removes every history row and honour this batch added, and any pre-digital player " +
          "only it used. Everything else is left alone.",
        confirmText: "Undo batch",
        destructive: true,
      }))
    )
      return;
    undo.mutate({ id: tenantId, batchId });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Imported batches</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
        {isError ? <p className="text-sm text-destructive">{apiError(error).message}</p> : null}
        {data && data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No history imported yet.</p>
        ) : null}
        {data && data.length > 0 ? (
          <ul className="divide-y text-sm" aria-label="History batches">
            {data.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <span className="font-medium">
                    #{b.id} {b.label}
                  </span>
                  <div className="text-xs text-muted-foreground">
                    {new Date(b.createdAt).toLocaleString()} · {b.rows} rows · {b.honours} honours
                    {b.coverage.length > 0 ? ` · ${coverageSummary(b.coverage)}` : ""}
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
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </CardContent>
    </Card>
  );
}
