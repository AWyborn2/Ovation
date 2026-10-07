import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type {
  ShirtNumberPreviewRow,
  ShirtNumberUploadCommitResult,
  ShirtNumberUploadPreview,
  ShirtNumberWarning,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { StatusPill, type StatusTone } from "@/components/admin-ui";
import { conflictOf, errorMessage, type RowResolution, type ShirtNumberRegisterApi } from "./api";
import { seasonLabel } from "./season";

const MAX_BYTES = 2 * 1024 * 1024;
const selectClass = "h-9 rounded-lg border border-input bg-background px-2 text-sm";

type Group = {
  status: ShirtNumberPreviewRow["status"];
  title: string;
  tone: StatusTone;
  hint: string;
};
const GROUPS: Group[] = [
  {
    status: "suggested",
    title: "Needs review",
    tone: "attention",
    hint: "Possible matches. Pick the right player, keep the row as held, or discard it.",
  },
  {
    status: "new",
    title: "New",
    tone: "info",
    hint: "No player found. Held entries link automatically once the player has played.",
  },
  {
    status: "matched",
    title: "Matched",
    tone: "success",
    hint: "Matched to a player.",
  },
  {
    status: "invalid",
    title: "Can't be used",
    tone: "danger",
    hint: "These rows will be discarded.",
  },
];

/** The effective decision for a row: the admin's choice, else the server default. */
function defaultResolution(
  row: ShirtNumberPreviewRow,
  supportsHeld: boolean,
): RowResolution | null {
  if (row.status === "invalid") return { rowIndex: row.rowIndex, action: "discard" };
  if (row.status === "matched") {
    return {
      rowIndex: row.rowIndex,
      action: "link",
      playerId: row.playerId,
      participantId: row.participantId,
    };
  }
  return supportsHeld ? { rowIndex: row.rowIndex, action: "hold" } : null;
}

const encode = (r: RowResolution | null): string =>
  !r
    ? ""
    : r.action === "link"
      ? r.playerId != null
        ? `link:p:${r.playerId}`
        : `link:g:${r.participantId ?? ""}`
      : r.action;

function decode(rowIndex: number, value: string): RowResolution | null {
  if (value === "hold" || value === "discard") return { rowIndex, action: value };
  if (value.startsWith("link:p:"))
    return { rowIndex, action: "link", playerId: Number(value.slice(7)) };
  if (value.startsWith("link:g:"))
    return { rowIndex, action: "link", participantId: value.slice(7) };
  return null;
}

/**
 * Upload the club's shirt-number spreadsheet (R4, R7, R8): choose a file,
 * review the preview grouped by match status with a candidate picker on
 * suggested rows and bulk actions, then commit. A block-policy rejection
 * lists the conflicting rows. Registered players without numbers come from
 * the squad register ("Add squad to register"), not an upload.
 */
export function ShirtNumberUploadPanel({
  api,
  season,
  onCommitted,
}: {
  api: ShirtNumberRegisterApi;
  season: number;
  onCommitted: (result: ShirtNumberUploadCommitResult) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ShirtNumberUploadPreview | null>(null);
  const [choices, setChoices] = useState<Map<number, RowResolution | null>>(new Map());
  const [conflict, setConflict] = useState<{
    error: string;
    warnings: ShirtNumberWarning[];
  } | null>(null);

  const upload = useMutation({ mutationFn: api.upload });
  const commit = useMutation({
    mutationFn: (args: { id: number; resolutions: RowResolution[] }) =>
      api.commitUpload(args.id, args.resolutions),
  });
  const discard = useMutation({ mutationFn: api.discardUpload });

  const reset = () => {
    setPreview(null);
    setChoices(new Map());
    setConflict(null);
    setError(null);
    setFile(null);
    setFileKey((k) => k + 1);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!file) {
      setError("Choose a .csv or .xlsx file first.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("That file is too large (2 MB maximum).");
      return;
    }
    upload.mutate(
      { file, kind: "numbers", season },
      {
        onSuccess: (p) => {
          setPreview(p);
          setChoices(new Map());
          setConflict(null);
        },
        onError: (err) => setError(errorMessage(err)),
      },
    );
  };

  const resolutionOf = (row: ShirtNumberPreviewRow): RowResolution | null =>
    choices.has(row.rowIndex)
      ? (choices.get(row.rowIndex) ?? null)
      : defaultResolution(row, api.supportsHeld);

  const choose = (rowIndex: number, r: RowResolution | null) =>
    setChoices((prev) => new Map(prev).set(rowIndex, r));

  const bulk = (status: ShirtNumberPreviewRow["status"], action: "hold" | "discard") => {
    if (!preview) return;
    setChoices((prev) => {
      const next = new Map(prev);
      for (const row of preview.rows) {
        if (row.status === status) next.set(row.rowIndex, { rowIndex: row.rowIndex, action });
      }
      return next;
    });
  };

  const unresolved = (preview?.rows ?? []).filter((r) => resolutionOf(r) === null).length;

  const onCommit = () => {
    if (!preview) return;
    setConflict(null);
    setError(null);
    const resolutions = [...choices.values()].filter((r): r is RowResolution => r !== null);
    commit.mutate(
      { id: preview.id, resolutions },
      {
        onSuccess: (result) => {
          reset();
          onCommitted(result);
        },
        onError: (err) => {
          const c = conflictOf(err);
          if (c && c.warnings.length > 0) setConflict(c);
          else setError(errorMessage(err));
        },
      },
    );
  };

  const onDiscard = () => {
    if (!preview) return;
    discard.mutate(preview.id, { onSettled: reset });
  };

  // ── Choose file ──
  if (!preview) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Upload for {seasonLabel(season)}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <p className="m-0 text-sm text-muted-foreground">
              Your club&rsquo;s shirt-number spreadsheet: a name column and a number column. To add
              registered players without numbers, use &ldquo;Add squad to register&rdquo;.
            </p>
            <div className="space-y-1">
              <Label htmlFor={`shirt-upload-file-${api.side}`}>File</Label>
              <Input
                key={fileKey}
                id={`shirt-upload-file-${api.side}`}
                type="file"
                accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-muted-foreground">Up to 2 MB and 1,000 rows.</p>
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" disabled={upload.isPending}>
              {upload.isPending ? "Parsing…" : "Upload and preview"}
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  // ── Parse error (file-level problems) ──
  if (preview.errors.length > 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>We couldn't read {preview.fileName}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <ul role="alert" className="list-disc space-y-1 pl-5 text-destructive">
            {preview.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
          {preview.unrecognisedHeaders.length > 0 && (
            <p>
              Columns found that we didn't recognise:{" "}
              <span className="font-mono">{preview.unrecognisedHeaders.join(", ")}</span>
            </p>
          )}
          <Button type="button" variant="outline" onClick={onDiscard} disabled={discard.isPending}>
            Choose another file
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ── Preview and review ──
  const c = preview.counts;
  const duplicates = preview.rows.filter((r) => r.duplicate);
  const busy = commit.isPending || discard.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Review {preview.fileName} · {seasonLabel(preview.season)}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        <p className="text-muted-foreground">
          {c.total} rows: {c.matched} matched, {c.suggested} to review, {c.new} new, {c.invalid}{" "}
          can't be used, {c.numberChanges} number change{c.numberChanges === 1 ? "" : "s"},{" "}
          {c.duplicates} duplicate{c.duplicates === 1 ? "" : "s"}. Nothing changes until you apply.
        </p>
        {preview.truncated && (
          <p className="text-destructive">Only the first 1,000 rows were read.</p>
        )}
        {preview.unrecognisedHeaders.length > 0 && (
          <p className="text-muted-foreground">
            Ignored columns:{" "}
            <span className="font-mono">{preview.unrecognisedHeaders.join(", ")}</span>
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {api.supportsHeld && c.new > 0 && (
            <Button type="button" size="sm" variant="outline" onClick={() => bulk("new", "hold")}>
              Keep all new as held
            </Button>
          )}
          {c.invalid > 0 && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => bulk("invalid", "discard")}
            >
              Discard all invalid
            </Button>
          )}
        </div>

        {GROUPS.map((g) => {
          const rows = preview.rows.filter((r) => r.status === g.status);
          if (rows.length === 0) return null;
          return (
            <section key={g.status} aria-label={g.title} className="space-y-2">
              <h3 className="m-0 flex items-center gap-2 text-base font-semibold">
                {g.title} <StatusPill tone={g.tone}>{rows.length}</StatusPill>
              </h3>
              <p className="m-0 text-xs text-muted-foreground">{g.hint}</p>
              <ul className="m-0 list-none space-y-1 p-0">
                {rows.map((row) => (
                  <PreviewRowItem
                    key={row.rowIndex}
                    row={row}
                    supportsHeld={api.supportsHeld}
                    value={resolutionOf(row)}
                    onChange={(r) => choose(row.rowIndex, r)}
                  />
                ))}
              </ul>
            </section>
          );
        })}

        {duplicates.length > 0 && (
          <section aria-label="Duplicates" className="space-y-1">
            <h3 className="m-0 flex items-center gap-2 text-base font-semibold">
              Duplicates <StatusPill tone="danger">{duplicates.length}</StatusPill>
            </h3>
            <ul className="m-0 list-disc space-y-0.5 pl-5">
              {duplicates.map((r) => (
                <li key={r.rowIndex}>
                  #{r.number} {r.name}
                  {r.duplicateWith?.length ? ` (also ${r.duplicateWith.join(", ")})` : ""}
                </li>
              ))}
            </ul>
          </section>
        )}

        {conflict && (
          <div role="alert" className="space-y-1 rounded-lg border border-destructive/50 p-3">
            <p className="m-0 font-semibold text-destructive">{conflict.error}</p>
            <ul className="m-0 list-disc space-y-0.5 pl-5">
              {conflict.warnings.map((w, i) => (
                <li key={`${w.number}-${i}`}>{w.message}</li>
              ))}
            </ul>
            <p className="m-0 text-xs text-muted-foreground">
              Discard or change those rows, or switch duplicate handling to warn, then apply again.
            </p>
          </div>
        )}
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={onCommit} disabled={busy || unresolved > 0}>
            {commit.isPending ? "Applying…" : "Apply to register"}
          </Button>
          <Button type="button" variant="outline" onClick={onDiscard} disabled={busy}>
            Discard upload
          </Button>
          {unresolved > 0 && (
            <span className="text-xs text-muted-foreground">
              {unresolved} row{unresolved === 1 ? "" : "s"} still need a decision.
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function PreviewRowItem({
  row,
  supportsHeld,
  value,
  onChange,
}: {
  row: ShirtNumberPreviewRow;
  supportsHeld: boolean;
  value: RowResolution | null;
  onChange: (r: RowResolution | null) => void;
}) {
  const id = `shirt-row-${row.rowIndex}`;
  return (
    <li className="flex flex-col gap-2 rounded border bg-background px-3 py-2 sm:flex-row sm:items-center">
      <span className="w-12 shrink-0 font-bold tabular-nums">
        {row.number !== null ? `#${row.number}` : "—"}
      </span>
      <span className="flex-1">
        <span className="font-semibold">{row.name}</span>{" "}
        <span className="text-xs text-muted-foreground">row {row.rowIndex}</span>
        {row.numberChange && (
          <span className="ml-2 text-xs text-muted-foreground">
            was #{row.existingNumber ?? "none"}
          </span>
        )}
        {row.duplicate && (
          <StatusPill tone="danger" className="ml-2">
            Duplicate
          </StatusPill>
        )}
        {row.errors.length > 0 && (
          <span className="block text-xs text-destructive">{row.errors.join(" ")}</span>
        )}
      </span>
      {row.status === "invalid" ? (
        <span className="text-xs text-muted-foreground">Discarded</span>
      ) : (
        <>
          <label htmlFor={id} className="sr-only">
            Decision for {row.name}
          </label>
          <select
            id={id}
            className={selectClass}
            value={encode(value)}
            onChange={(e) => onChange(decode(row.rowIndex, e.target.value))}
          >
            {value === null && <option value="">Choose…</option>}
            {row.status === "matched" && (
              <option
                value={encode({
                  rowIndex: row.rowIndex,
                  action: "link",
                  playerId: row.playerId,
                  participantId: row.participantId,
                })}
              >
                Link to matched player
              </option>
            )}
            {row.candidates.map((cand) => {
              const v = encode({
                rowIndex: row.rowIndex,
                action: "link",
                playerId: cand.playerId,
                participantId: cand.participantId,
              });
              return (
                <option key={v} value={v}>
                  Link to {cand.name}
                </option>
              );
            })}
            {supportsHeld && <option value="hold">Keep as held</option>}
            <option value="discard">Discard</option>
          </select>
        </>
      )}
    </li>
  );
}
