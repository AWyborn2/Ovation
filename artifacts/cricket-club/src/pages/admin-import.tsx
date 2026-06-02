import { useState } from "react";
import { Link } from "wouter";
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
import type { MatchImportPreview } from "@workspace/api-client-react";
import { useInvalidateAdmin } from "@/lib/admin-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type CsvPreview = {
  importId: number;
  filename: string;
  season: number;
  rowsParsed: number;
  matchedPlayers: number;
  newPlayers: number;
  unmappedGrades: string[];
  gradeTotals: Array<{ grade: string; rows: number; games: number; runs: number; wickets: number }>;
  players: Array<{ surname: string; givenName: string; status: "matched" | "new"; playerId: number | null }>;
};

type Mode = "csv" | "match";

const GRADES = [
  "A Grade",
  "B Grade",
  "C Grade",
  "D Grade",
  "E Grade",
  "F Grade",
  "Female A Grade",
  "Female B Grade",
  "PPL",
  "Colts",
];

const SEASON_OPTIONS = (() => {
  const out: { value: number; label: string }[] = [];
  for (let y = 2030; y >= 1991; y--) {
    out.push({ value: y, label: `${y}/${String((y + 1) % 100).padStart(2, "0")}` });
  }
  return out;
})();

const seasonLabel = (s: number | null | undefined) =>
  s == null ? "—" : `${s}/${String((s + 1) % 100).padStart(2, "0")}`;

export default function AdminImport() {
  const queryClient = useQueryClient();
  const invalidateAdmin = useInvalidateAdmin();
  const [mode, setMode] = useState<Mode>("csv");
  const [file, setFile] = useState<File | null>(null);
  const [season, setSeason] = useState<number>(new Date().getFullYear());
  const [preview, setPreview] = useState<CsvPreview | null>(null);
  const [matchPreview, setMatchPreview] = useState<MatchImportPreview | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [committed, setCommitted] = useState<{ label: string } | null>(null);

  const { data: imports, refetch: refetchImports } = useListImports();
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

  const resetPreviews = () => {
    setPreview(null);
    setMatchPreview(null);
    setFile(null);
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
    setCommitted(null);
    resetPreviews();
  };

  const onUploadCsv = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!file) {
      setError("Please choose a CSV file first.");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("season", String(season));
      const res = await fetch("/api/imports/playcricket-csv", {
        method: "POST",
        body: form,
        credentials: "include",
      });
      if (res.status === 401) {
        invalidateAdmin();
        setError("Your session has expired — please sign in again.");
        return;
      }
      const body = await res.json();
      if (!res.ok) {
        setError(typeof body?.error === "string" ? body.error : `HTTP ${res.status}`);
        return;
      }
      setPreview(body as CsvPreview);
      refetchImports();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const onUploadMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!file) {
      setError("Please choose a scorecard .xlsx file first.");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/imports/match-xlsx", {
        method: "POST",
        body: form,
        credentials: "include",
      });
      if (res.status === 401) {
        invalidateAdmin();
        setError("Your session has expired — please sign in again.");
        return;
      }
      const body = await res.json();
      if (!res.ok) {
        setError(typeof body?.error === "string" ? body.error : `HTTP ${res.status}`);
        return;
      }
      setMatchPreview(body as MatchImportPreview);
      refetchImports();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
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

  const onConfirmCsv = () => {
    if (!preview) return;
    commit.mutate(
      { id: preview.importId },
      {
        onSuccess: () => {
          setCommitted({ label: `the ${seasonLabel(preview.season)} season` });
          resetPreviews();
          invalidateAggregates();
        },
        onError: (e) => {
          if (handleMutationError(e)) return;
          setError((e as Error).message);
        },
      },
    );
  };

  const onConfirmMatch = () => {
    if (!matchPreview) return;
    commit.mutate(
      { id: matchPreview.importId },
      {
        onSuccess: () => {
          const r = matchPreview.round != null ? `Round ${matchPreview.round}, ` : "";
          setCommitted({
            label: `${r}${matchPreview.grade ?? ""} ${seasonLabel(matchPreview.season)}`.trim(),
          });
          resetPreviews();
          invalidateAggregates();
        },
        onError: (e) => {
          if (handleMutationError(e)) return;
          setError((e as Error).message);
        },
      },
    );
  };

  const onCancelPreview = () => {
    const id = preview?.importId ?? matchPreview?.importId;
    if (id == null) return;
    del.mutate(
      { id },
      {
        onSuccess: () => {
          resetPreviews();
          invalidateAggregates();
        },
        onError: (e) => {
          if (handleMutationError(e)) return;
          setError((e as Error).message);
        },
      },
    );
  };

  const onDeleteImport = (id: number) => {
    if (!confirm("Delete this import? Aggregates will be re-derived without its contribution.")) return;
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-serif font-bold">Admin · Import Stats</h1>
        <p className="text-muted-foreground mt-1">
          Import a whole-season PlayCricket CSV, or add a single match scorecard to the running
          season totals. Nothing is applied until you Confirm.
        </p>
      </div>

      {committed && !preview && !matchPreview && (
        <div className="rounded-md border border-green-600/40 bg-green-600/10 p-4 text-sm space-y-2">
          <p className="font-medium">
            Import applied for {committed.label}. Aggregates have been re-derived.
          </p>
          <Link
            href="/admin/social/queue"
            className="inline-flex items-center text-green-700 dark:text-green-400 font-medium hover:underline"
          >
            Open the social card queue →
          </Link>
        </div>
      )}

      {!preview && !matchPreview && (
        <div className="inline-flex rounded-md border p-1 bg-muted/40">
          <button
            type="button"
            onClick={() => switchMode("csv")}
            className={`px-4 py-1.5 text-sm rounded ${
              mode === "csv" ? "bg-background shadow font-medium" : "text-muted-foreground"
            }`}
          >
            Whole-season CSV
          </button>
          <button
            type="button"
            onClick={() => switchMode("match")}
            className={`px-4 py-1.5 text-sm rounded ${
              mode === "match" ? "bg-background shadow font-medium" : "text-muted-foreground"
            }`}
          >
            Single match (.xlsx)
          </button>
        </div>
      )}

      {!preview && !matchPreview && mode === "csv" && (
        <Card>
          <CardHeader>
            <CardTitle>Upload season CSV</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onUploadCsv} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="csv">CSV file</Label>
                <Input
                  id="csv"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="season">Season</Label>
                <select
                  id="season"
                  value={season}
                  onChange={(e) => setSeason(parseInt(e.target.value, 10))}
                  className="block w-48 rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {SEASON_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="submit" disabled={uploading}>
                {uploading ? "Parsing…" : "Upload & Preview"}
              </Button>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </form>
          </CardContent>
        </Card>
      )}

      {!preview && !matchPreview && mode === "match" && (
        <Card>
          <CardHeader>
            <CardTitle>Upload match scorecard</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onUploadMatch} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="xlsx">Scorecard file (.xlsx)</Label>
                <Input
                  id="xlsx"
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <p className="text-xs text-muted-foreground">
                  The grade, season and round are read from the scorecard header. Committing adds
                  this match to the running season totals.
                </p>
              </div>
              <Button type="submit" disabled={uploading}>
                {uploading ? "Parsing…" : "Upload & Preview"}
              </Button>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </form>
          </CardContent>
        </Card>
      )}

      {preview && (
        <Card>
          <CardHeader>
            <CardTitle>Preview — {preview.filename}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Stat label="Rows parsed" value={preview.rowsParsed} />
              <Stat label="Season" value={seasonLabel(preview.season)} />
              <Stat label="Matched players" value={preview.matchedPlayers} />
              <Stat label="New players" value={preview.newPlayers} />
            </div>

            {preview.unmappedGrades.length > 0 && (
              <div className="rounded-md border border-yellow-500/50 bg-yellow-500/10 p-3 text-sm">
                Skipped rows with unrecognised PlayCricket grade(s):{" "}
                <strong>{preview.unmappedGrades.join(", ")}</strong>. Add a mapping in{" "}
                <code className="font-mono">PLAYCRICKET_GRADE_MAP</code> to include them.
              </div>
            )}

            <div>
              <h3 className="font-semibold mb-2">Totals to apply</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b">
                      <th className="py-2 pr-4">Grade</th>
                      <th className="py-2 pr-4">Rows</th>
                      <th className="py-2 pr-4">Games</th>
                      <th className="py-2 pr-4">Runs</th>
                      <th className="py-2 pr-4">Wickets</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.gradeTotals.map((g) => (
                      <tr key={g.grade} className="border-b last:border-0">
                        <td className="py-2 pr-4">{g.grade}</td>
                        <td className="py-2 pr-4">{g.rows}</td>
                        <td className="py-2 pr-4">{g.games}</td>
                        <td className="py-2 pr-4">{g.runs}</td>
                        <td className="py-2 pr-4">{g.wickets}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Players in this CSV</h3>
              <div className="max-h-72 overflow-y-auto rounded-md border">
                <table className="w-full text-sm">
                  <tbody>
                    {preview.players.map((p, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-2 px-3">
                          {p.surname}, {p.givenName}
                        </td>
                        <td className="py-2 px-3 text-right">
                          {p.status === "matched" ? (
                            <span className="text-green-700 dark:text-green-400">matched</span>
                          ) : (
                            <span className="text-blue-700 dark:text-blue-400">will create</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-3">
              <Button onClick={onConfirmCsv} disabled={commit.isPending}>
                {commit.isPending ? "Applying…" : "Confirm & Apply"}
              </Button>
              <Button variant="outline" onClick={onCancelPreview} disabled={del.isPending}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {matchPreview && (
        <Card>
          <CardHeader>
            <CardTitle>Match preview — {matchPreview.filename}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Stat label="Grade" value={matchPreview.grade ?? "—"} />
              <Stat label="Season" value={seasonLabel(matchPreview.season)} />
              <Stat label="Round" value={matchPreview.round ?? "—"} />
              <Stat label="Result" value={matchPreview.result ?? "—"} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="rounded-md border p-3">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Halls Head
                </div>
                <div className="font-medium">{matchPreview.hhccScore ?? "—"}</div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  {matchPreview.opponent ?? "Opponent"}
                </div>
                <div className="font-medium">{matchPreview.opponentScore ?? "—"}</div>
              </div>
            </div>

            {matchPreview.warnings.length > 0 && (
              <div className="rounded-md border border-yellow-500/50 bg-yellow-500/10 p-3 text-sm space-y-1">
                {matchPreview.warnings.map((w, i) => (
                  <p key={i}>{w}</p>
                ))}
              </div>
            )}

            {!matchPreview.abandoned && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Stat label="Players" value={matchPreview.players.length} />
                <Stat label="Matched" value={matchPreview.matchedPlayers} />
                <Stat label="New players" value={matchPreview.newPlayers} />
                <Stat label="Venue" value={matchPreview.venue ?? "—"} />
              </div>
            )}

            {matchPreview.players.length > 0 && (
              <div>
                <h3 className="font-semibold mb-2">Player lines</h3>
                <div className="max-h-80 overflow-y-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left border-b">
                        <th className="py-2 px-3">Player</th>
                        <th className="py-2 px-3">Batting</th>
                        <th className="py-2 px-3">Bowling</th>
                        <th className="py-2 px-3">Field</th>
                        <th className="py-2 px-3 text-right"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {matchPreview.players.map((p, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-2 px-3">
                            {p.surname}, {p.givenName}
                          </td>
                          <td className="py-2 px-3">
                            {p.batted
                              ? `${p.runs ?? 0}${p.notOut ? "*" : ""}${
                                  p.balls != null ? ` (${p.balls})` : ""
                                }`
                              : "—"}
                          </td>
                          <td className="py-2 px-3">
                            {p.bowled
                              ? `${p.wickets ?? 0}/${p.runsConceded ?? 0}${
                                  p.overs ? ` (${p.overs})` : ""
                                }`
                              : "—"}
                          </td>
                          <td className="py-2 px-3">
                            {p.catches + p.stumpings + p.runOuts > 0
                              ? [
                                  p.catches ? `${p.catches}c` : "",
                                  p.stumpings ? `${p.stumpings}st` : "",
                                  p.runOuts ? `${p.runOuts}ro` : "",
                                ]
                                  .filter(Boolean)
                                  .join(" ")
                              : "—"}
                          </td>
                          <td className="py-2 px-3 text-right">
                            {p.status === "matched" ? (
                              <span className="text-green-700 dark:text-green-400">matched</span>
                            ) : (
                              <span className="text-blue-700 dark:text-blue-400">will create</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-3">
              <Button onClick={onConfirmMatch} disabled={commit.isPending}>
                {commit.isPending
                  ? "Applying…"
                  : matchPreview.matchExists
                    ? "Confirm & Replace"
                    : "Confirm & Add match"}
              </Button>
              <Button variant="outline" onClick={onCancelPreview} disabled={del.isPending}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <UndoSeasonCard
        disabled={undoSeason.isPending}
        onUndo={(grade, s) =>
          new Promise<string>((resolve, reject) => {
            undoSeason.mutate(
              { data: { grade, season: s } },
              {
                onSuccess: (r) => {
                  invalidateAggregates();
                  resolve(
                    `Removed ${r.matchesDeleted} match${
                      r.matchesDeleted === 1 ? "" : "es"
                    } and ${r.playersRemoved} orphaned player${
                      r.playersRemoved === 1 ? "" : "s"
                    }.`,
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
          })
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Past imports</CardTitle>
        </CardHeader>
        <CardContent>
          {!imports || imports.length === 0 ? (
            <p className="text-sm text-muted-foreground">No imports yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2 pr-4">When</th>
                    <th className="py-2 pr-4">Type</th>
                    <th className="py-2 pr-4">Filename</th>
                    <th className="py-2 pr-4">Grade</th>
                    <th className="py-2 pr-4">Season</th>
                    <th className="py-2 pr-4">Round</th>
                    <th className="py-2 pr-4">Rows</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {imports.map((imp) => (
                    <tr key={imp.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">{new Date(imp.importedAt).toLocaleString()}</td>
                      <td className="py-2 pr-4">{imp.kind === "match" ? "Match" : "Season"}</td>
                      <td className="py-2 pr-4 max-w-xs truncate" title={imp.filename}>
                        {imp.filename}
                      </td>
                      <td className="py-2 pr-4">{imp.grade ?? "—"}</td>
                      <td className="py-2 pr-4">{seasonLabel(imp.season)}</td>
                      <td className="py-2 pr-4">{imp.round ?? "—"}</td>
                      <td className="py-2 pr-4">{imp.rowCount}</td>
                      <td className="py-2 pr-4">{imp.status}</td>
                      <td className="py-2 pr-4 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onDeleteImport(imp.id)}
                          disabled={del.isPending}
                        >
                          Delete
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function UndoSeasonCard({
  disabled,
  onUndo,
}: {
  disabled: boolean;
  onUndo: (grade: string, season: number) => Promise<string>;
}) {
  const [grade, setGrade] = useState<string>(GRADES[0]);
  const [season, setSeason] = useState<number>(new Date().getFullYear());
  const [result, setResult] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = () => {
    setResult(null);
    setErr(null);
    if (
      !confirm(
        `Undo every match imported for ${grade} ${seasonLabel(season)}? ` +
          "This removes those matches, rolls back the season totals, any auto-created caps, " +
          "and players who no longer have any games.",
      )
    )
      return;
    onUndo(grade, season)
      .then(setResult)
      .catch((e: Error) => setErr(e.message));
  };

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle>Undo a season's matches</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Deletes all per-match scorecards imported for one grade and season, then rebuilds the
          season totals from what's left. Whole-season CSV imports are not affected.
        </p>
        <div className="flex flex-wrap gap-4 items-end">
          <div className="space-y-2">
            <Label htmlFor="undo-grade">Grade</Label>
            <select
              id="undo-grade"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              className="block w-48 rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {GRADES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="undo-season">Season</Label>
            <select
              id="undo-season"
              value={season}
              onChange={(e) => setSeason(parseInt(e.target.value, 10))}
              className="block w-48 rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {SEASON_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <Button variant="destructive" onClick={run} disabled={disabled}>
            {disabled ? "Working…" : "Undo season"}
          </Button>
        </div>
        {result && <p className="text-sm text-green-700 dark:text-green-400">{result}</p>}
        {err && <p className="text-sm text-destructive">{err}</p>}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-2xl font-serif">{value}</div>
    </div>
  );
}
