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
import type {
  ImportPreview,
  MatchImportPreview,
  BatchImportPreview,
  NameMatchCandidate,
  PlayerResolution,
} from "@workspace/api-client-react";
import { useInvalidateAdmin } from "@/lib/admin-auth";
import {
  PlayerTypeahead,
  type SelectedPlayer,
} from "@/components/player-typeahead";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type Mode = "csv" | "match" | "batch";

/** An admin's decision for a previewed name, held in local state. */
type RowResolution =
  | { action: "link"; player: SelectedPlayer }
  | { action: "create" };

/**
 * Normalise a name part the same way the server's `nameKey` does (lowercase,
 * strip accents and any non-letter characters) so a row's resolution lines up
 * with the parsed row the server resolves it against. Keeping this in sync
 * prevents punctuation/diacritic variants (e.g. "O'Brien" vs "Obrien") from
 * holding divergent UI state that the server would silently collapse.
 */
const normName = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");

/** A stable key for a previewed name, used to index resolution state. */
const rowKey = (surname: string, givenName: string) =>
  `${normName(surname)}|${normName(givenName)}`;

/**
 * The player id a row would resolve to given the admin's current choice, or
 * null when it would create a brand-new player. Used for live debut recompute.
 */
function resolvedPlayerId(
  status: "matched" | "suggested" | "new",
  playerId: number | null | undefined,
  candidates: NameMatchCandidate[],
  resolution: RowResolution | undefined,
): number | null {
  if (resolution) return resolution.action === "link" ? resolution.player.id : null;
  if (status === "matched") return playerId ?? null;
  if (status === "suggested") return candidates[0]?.playerId ?? null;
  return null;
}

/**
 * Whether a row is a debut: cap-eligible import and the resolved player holds
 * no existing cap in the category (a new player always debuts).
 */
function isDebut(
  capCategory: string | null,
  cappedIds: Set<number>,
  resolvedId: number | null,
): boolean {
  if (capCategory == null) return false;
  return resolvedId == null || !cappedIds.has(resolvedId);
}

/** Count `suggested` rows the admin has not yet decided (link or create). */
function unresolvedSuggestions(
  players: Array<{ surname: string; givenName: string; status: string }>,
  map: Record<string, RowResolution>,
): number {
  let n = 0;
  for (const p of players) {
    if (p.status === "suggested" && !map[rowKey(p.surname, p.givenName)]) n++;
  }
  return n;
}

/** Build the commit body from the admin's resolution choices. */
function buildResolutions(
  map: Record<string, RowResolution>,
  players: Array<{ surname: string; givenName: string }>,
): PlayerResolution[] {
  const out: PlayerResolution[] = [];
  for (const p of players) {
    const r = map[rowKey(p.surname, p.givenName)];
    if (!r) continue;
    if (r.action === "link") {
      out.push({ surname: p.surname, givenName: p.givenName, action: "link", playerId: r.player.id });
    } else {
      out.push({ surname: p.surname, givenName: p.givenName, action: "create" });
    }
  }
  return out;
}

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
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [matchPreview, setMatchPreview] = useState<MatchImportPreview | null>(null);
  const [batchPreview, setBatchPreview] = useState<BatchImportPreview | null>(null);
  const [batchFiles, setBatchFiles] = useState<FileList | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, RowResolution>>({});
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [committed, setCommitted] = useState<{ label: string } | null>(null);

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
    setBatchPreview(null);
    setBatchFiles(null);
    setResolutions({});
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
      const data = body as ImportPreview;
      setPreview(data);
      seedResolutions(data.players);
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
      const data = body as MatchImportPreview;
      setMatchPreview(data);
      seedResolutions(data.players);
      refetchImports();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const onUploadBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!batchFiles || batchFiles.length === 0) {
      setError("Please choose one or more .xlsx scorecards, or a .zip.");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      for (const f of Array.from(batchFiles)) form.append("files", f);
      const res = await fetch("/api/imports/match-batch", {
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
      const data = body as BatchImportPreview;
      setBatchPreview(data);
      seedResolutions(data.players);
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
      {
        id: preview.importId,
        data: { resolutions: buildResolutions(resolutions, preview.players) },
      },
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
      {
        id: matchPreview.importId,
        data: { resolutions: buildResolutions(resolutions, matchPreview.players) },
      },
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

  const onConfirmBatch = async () => {
    if (!batchPreview) return;
    setUploading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/imports/match-batch/${batchPreview.importId}/commit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            resolutions: buildResolutions(resolutions, batchPreview.players),
          }),
          credentials: "include",
        },
      );
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
      const committedCount = (body?.committed as number) ?? 0;
      setCommitted({
        label: `${committedCount} match${committedCount === 1 ? "" : "es"}`,
      });
      resetPreviews();
      invalidateAggregates();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const onCancelPreview = () => {
    const id = preview?.importId ?? matchPreview?.importId ?? batchPreview?.importId;
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

      {committed && !preview && !matchPreview && !batchPreview && (
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

      {!preview && !matchPreview && !batchPreview && (
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
          <button
            type="button"
            onClick={() => switchMode("batch")}
            className={`px-4 py-1.5 text-sm rounded ${
              mode === "batch" ? "bg-background shadow font-medium" : "text-muted-foreground"
            }`}
          >
            Season batch (.xlsx/.zip)
          </button>
        </div>
      )}

      {!preview && !matchPreview && !batchPreview && mode === "csv" && (
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

      {!preview && !matchPreview && !batchPreview && mode === "match" && (
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

      {!preview && !matchPreview && !batchPreview && mode === "batch" && (
        <Card>
          <CardHeader>
            <CardTitle>Upload a season of scorecards</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onUploadBatch} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="batch">Scorecards (.xlsx files and/or a .zip)</Label>
                <Input
                  id="batch"
                  type="file"
                  multiple
                  accept=".xlsx,.zip,application/zip,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(e) => setBatchFiles(e.target.files)}
                />
                <p className="text-xs text-muted-foreground">
                  Select every match scorecard for the season (or a single .zip of them). The grade,
                  season and round are read from each scorecard's header. Player names are matched
                  once across the whole batch, then all valid matches are committed together.
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
              <Stat label="Matched players" value={preview.matchedPlayers} />
              <Stat label="Suggested" value={preview.suggestedPlayers} />
              <Stat label="New players" value={preview.newPlayers} />
            </div>
            {preview.capCategory && (
              <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
                This is a cap-eligible grade ({preview.capCategory}). Players earning
                their first cap are flagged{" "}
                <DebutBadge /> below.
              </div>
            )}

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
              {preview.suggestedPlayers > 0 && (
                <p className="text-sm text-muted-foreground mb-2">
                  Some names look like existing players. Confirm a link or choose to
                  create a new player for each suggestion before applying.
                </p>
              )}
              <div className="max-h-96 overflow-y-auto rounded-md border divide-y">
                {preview.players.map((p, i) => (
                  <PlayerResolutionRow
                    key={i}
                    surname={p.surname}
                    givenName={p.givenName}
                    status={p.status}
                    candidates={p.candidates}
                    resolution={resolutions[rowKey(p.surname, p.givenName)]}
                    onChange={(r) => setRowResolution(rowKey(p.surname, p.givenName), r)}
                    debut={isDebut(
                      preview.capCategory,
                      new Set(preview.cappedPlayerIds),
                      resolvedPlayerId(
                        p.status,
                        p.playerId,
                        p.candidates,
                        resolutions[rowKey(p.surname, p.givenName)],
                      ),
                    )}
                  />
                ))}
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            {unresolvedSuggestions(preview.players, resolutions) > 0 && (
              <p className="text-sm text-amber-600 dark:text-amber-400">
                {unresolvedSuggestions(preview.players, resolutions)} suggested name(s)
                still need a decision before you can apply.
              </p>
            )}

            <div className="flex gap-3">
              <Button
                onClick={onConfirmCsv}
                disabled={
                  commit.isPending ||
                  unresolvedSuggestions(preview.players, resolutions) > 0
                }
              >
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
                <Stat label="Matched" value={matchPreview.matchedPlayers} />
                <Stat label="Suggested" value={matchPreview.suggestedPlayers} />
                <Stat label="New players" value={matchPreview.newPlayers} />
                <Stat label="Venue" value={matchPreview.venue ?? "—"} />
              </div>
            )}

            {matchPreview.capCategory && (
              <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
                This is a cap-eligible grade ({matchPreview.capCategory}). Players
                earning their first cap are flagged <DebutBadge /> below.
              </div>
            )}

            {matchPreview.players.length > 0 && (
              <div>
                <h3 className="font-semibold mb-2">Player lines</h3>
                {matchPreview.suggestedPlayers > 0 && (
                  <p className="text-sm text-muted-foreground mb-2">
                    Some names look like existing players. Confirm a link or choose to
                    create a new player for each suggestion before applying.
                  </p>
                )}
                <div className="max-h-96 overflow-y-auto rounded-md border divide-y">
                  {matchPreview.players.map((p, i) => {
                    const bat = p.batted
                      ? `${p.runs ?? 0}${p.notOut ? "*" : ""}${
                          p.balls != null ? ` (${p.balls})` : ""
                        }`
                      : null;
                    const bowl = p.bowled
                      ? `${p.wickets ?? 0}/${p.runsConceded ?? 0}${
                          p.overs ? ` (${p.overs})` : ""
                        }`
                      : null;
                    const field =
                      p.catches + p.stumpings + p.runOuts > 0
                        ? [
                            p.catches ? `${p.catches}c` : "",
                            p.stumpings ? `${p.stumpings}st` : "",
                            p.runOuts ? `${p.runOuts}ro` : "",
                          ]
                            .filter(Boolean)
                            .join(" ")
                        : null;
                    return (
                      <PlayerResolutionRow
                        key={i}
                        surname={p.surname}
                        givenName={p.givenName}
                        status={p.status}
                        candidates={p.candidates}
                        resolution={resolutions[rowKey(p.surname, p.givenName)]}
                        onChange={(r) =>
                          setRowResolution(rowKey(p.surname, p.givenName), r)
                        }
                        meta={
                          <span className="text-xs text-muted-foreground">
                            {[
                              bat ? `Bat ${bat}` : null,
                              bowl ? `Bowl ${bowl}` : null,
                              field ? `Field ${field}` : null,
                            ]
                              .filter(Boolean)
                              .join(" · ") || "Did not bat/bowl/field"}
                          </span>
                        }
                        debut={isDebut(
                          matchPreview.capCategory,
                          new Set(matchPreview.cappedPlayerIds),
                          resolvedPlayerId(
                            p.status,
                            p.playerId,
                            p.candidates,
                            resolutions[rowKey(p.surname, p.givenName)],
                          ),
                        )}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            {unresolvedSuggestions(matchPreview.players, resolutions) > 0 && (
              <p className="text-sm text-amber-600 dark:text-amber-400">
                {unresolvedSuggestions(matchPreview.players, resolutions)} suggested
                name(s) still need a decision before you can apply.
              </p>
            )}

            <div className="flex gap-3">
              <Button
                onClick={onConfirmMatch}
                disabled={
                  commit.isPending ||
                  unresolvedSuggestions(matchPreview.players, resolutions) > 0
                }
              >
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

      {batchPreview && (
        <Card>
          <CardHeader>
            <CardTitle>Season batch preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Stat label="Files" value={batchPreview.files.length} />
              <Stat label="Committable matches" value={batchPreview.committableMatches} />
              <Stat label="Matched players" value={batchPreview.matchedPlayers} />
              <Stat label="New players" value={batchPreview.newPlayers} />
            </div>

            {batchPreview.warnings.length > 0 && (
              <div className="rounded-md border border-yellow-500/50 bg-yellow-500/10 p-3 text-sm space-y-1">
                {batchPreview.warnings.map((w, i) => (
                  <p key={i}>{w}</p>
                ))}
              </div>
            )}

            <div>
              <h3 className="font-semibold mb-2">Matches in this batch</h3>
              <div className="max-h-96 overflow-y-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-background">
                    <tr className="text-left border-b">
                      <th className="py-2 px-3">File</th>
                      <th className="py-2 px-3">Grade</th>
                      <th className="py-2 px-3">Season</th>
                      <th className="py-2 px-3">Round</th>
                      <th className="py-2 px-3">Opponent</th>
                      <th className="py-2 px-3">Result</th>
                      <th className="py-2 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batchPreview.files.map((f, i) => (
                      <tr
                        key={i}
                        className={`border-b last:border-0 ${
                          f.committable ? "" : "opacity-60"
                        }`}
                      >
                        <td className="py-2 px-3 max-w-[16rem] truncate" title={f.filename}>
                          {f.filename}
                        </td>
                        <td className="py-2 px-3">{f.grade ?? "—"}</td>
                        <td className="py-2 px-3">{seasonLabel(f.season)}</td>
                        <td className="py-2 px-3">{f.round ?? "—"}</td>
                        <td className="py-2 px-3">{f.opponent ?? "—"}</td>
                        <td className="py-2 px-3">{f.result ?? "—"}</td>
                        <td className="py-2 px-3">
                          <BatchStatusBadge status={f.status} />
                          {f.error && (
                            <span className="block text-xs text-destructive" title={f.error}>
                              {f.error}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {batchPreview.players.length > 0 && (
              <div>
                <h3 className="font-semibold mb-2">Players across the batch</h3>
                {batchPreview.suggestedPlayers > 0 && (
                  <p className="text-sm text-muted-foreground mb-2">
                    Some names look like existing players. Confirm a link or choose to
                    create a new player for each suggestion before applying.
                  </p>
                )}
                <div className="max-h-96 overflow-y-auto rounded-md border divide-y">
                  {batchPreview.players.map((p, i) => (
                    <PlayerResolutionRow
                      key={i}
                      surname={p.surname}
                      givenName={p.givenName}
                      status={p.status}
                      candidates={p.candidates}
                      resolution={resolutions[rowKey(p.surname, p.givenName)]}
                      onChange={(r) =>
                        setRowResolution(rowKey(p.surname, p.givenName), r)
                      }
                      debut={isDebut(
                        p.capCategory ?? null,
                        new Set(batchPreview.cappedPlayerIds),
                        resolvedPlayerId(
                          p.status,
                          p.playerId,
                          p.candidates,
                          resolutions[rowKey(p.surname, p.givenName)],
                        ),
                      )}
                    />
                  ))}
                </div>
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            {unresolvedSuggestions(batchPreview.players, resolutions) > 0 && (
              <p className="text-sm text-amber-600 dark:text-amber-400">
                {unresolvedSuggestions(batchPreview.players, resolutions)} suggested
                name(s) still need a decision before you can apply.
              </p>
            )}

            <div className="flex gap-3">
              <Button
                onClick={onConfirmBatch}
                disabled={
                  uploading ||
                  batchPreview.committableMatches === 0 ||
                  unresolvedSuggestions(batchPreview.players, resolutions) > 0
                }
              >
                {uploading
                  ? "Applying…"
                  : `Confirm & Add ${batchPreview.committableMatches} match${
                      batchPreview.committableMatches === 1 ? "" : "es"
                    }`}
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

function DebutBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
      Debut
    </span>
  );
}

/** Per-file outcome badge in the season-batch preview table. */
function BatchStatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    ready: "Ready",
    abandoned: "Abandoned",
    duplicate: "Replaces existing",
    duplicateInBatch: "Duplicate in batch",
    missingRound: "No round",
    unmappableGrade: "Unknown grade",
    parseError: "Parse error",
  };
  const ok = status === "ready" || status === "abandoned" || status === "duplicate";
  const cls = ok
    ? "bg-green-600/15 text-green-700 dark:text-green-400"
    : "bg-destructive/15 text-destructive";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {labels[status] ?? status}
    </span>
  );
}

/**
 * One previewed name with its match status and the controls an admin uses to
 * resolve it: confirm a suggested link, link to a different existing player, or
 * create a new player. Matched names need no decision.
 */
function PlayerResolutionRow({
  surname,
  givenName,
  status,
  candidates,
  resolution,
  onChange,
  debut,
  meta,
}: {
  surname: string;
  givenName: string;
  status: "matched" | "suggested" | "new";
  candidates: NameMatchCandidate[];
  resolution: RowResolution | undefined;
  onChange: (r: RowResolution | undefined) => void;
  debut: boolean;
  meta?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium">
            {surname}, {givenName}
          </span>
          {debut && <DebutBadge />}
        </div>
        {meta && <div className="mt-0.5">{meta}</div>}
      </div>
      <div className="sm:text-right sm:min-w-[18rem]">
        {status === "matched" ? (
          <span className="text-sm text-green-700 dark:text-green-400">
            matched to existing player
          </span>
        ) : resolution?.action === "link" ? (
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <span className="text-sm">
              Link to{" "}
              <span className="font-semibold">
                {resolution.player.surname}, {resolution.player.givenName}
              </span>{" "}
              <span className="text-muted-foreground">#{resolution.player.id}</span>
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onChange(status === "new" ? { action: "create" } : undefined)}
            >
              Change
            </Button>
          </div>
        ) : resolution?.action === "create" && status === "new" ? (
          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            <span className="text-sm text-blue-700 dark:text-blue-400">
              will create new player
            </span>
            <div className="w-full sm:w-72">
              <PlayerTypeahead
                value={null}
                placeholder="Or link to an existing player…"
                onChange={(p) => p && onChange({ action: "link", player: p })}
              />
            </div>
          </div>
        ) : (
          // suggested + undecided
          <div className="flex flex-col items-stretch gap-2 sm:items-end">
            {candidates.length > 0 && (
              <div className="flex flex-col items-stretch gap-1 sm:items-end">
                {candidates.map((c) => (
                  <Button
                    key={c.playerId}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="justify-start sm:justify-end"
                    onClick={() =>
                      onChange({
                        action: "link",
                        player: {
                          id: c.playerId,
                          surname: c.surname,
                          givenName: c.givenName,
                        },
                      })
                    }
                  >
                    Link to {c.surname}, {c.givenName} ({c.reason})
                  </Button>
                ))}
              </div>
            )}
            <div className="w-full sm:w-72">
              <PlayerTypeahead
                value={null}
                placeholder="Search a different player…"
                onChange={(p) => p && onChange({ action: "link", player: p })}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange({ action: "create" })}
            >
              Create new player instead
            </Button>
          </div>
        )}
        {resolution?.action === "create" && status === "suggested" && (
          <div className="mt-1 flex items-center gap-2 sm:justify-end">
            <span className="text-sm text-blue-700 dark:text-blue-400">
              will create new player
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onChange(undefined)}
            >
              Change
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
