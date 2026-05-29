import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListImports,
  useCommitImport,
  useDeleteImport,
  getListImportsQueryKey,
  getGetDashboardQueryKey,
  getListPlayersQueryKey,
  getListGradesQueryKey,
  getGetRecordsQueryKey,
} from "@workspace/api-client-react";
import { useInvalidateAdmin } from "@/lib/admin-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type Preview = {
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
  const [file, setFile] = useState<File | null>(null);
  const [season, setSeason] = useState<number>(new Date().getFullYear());
  const [preview, setPreview] = useState<Preview | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [committed, setCommitted] = useState<{ season: number } | null>(null);

  const { data: imports, refetch: refetchImports } = useListImports();
  const commit = useCommitImport();
  const del = useDeleteImport();

  const invalidateAggregates = () => {
    queryClient.invalidateQueries({ queryKey: getListImportsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListPlayersQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListGradesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetRecordsQueryKey() });
  };

  const onUpload = async (e: React.FormEvent) => {
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
      setPreview(body as Preview);
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

  const onConfirm = () => {
    if (!preview) return;
    commit.mutate(
      { id: preview.importId },
      {
        onSuccess: () => {
          setCommitted({ season: preview.season });
          setPreview(null);
          setFile(null);
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
    if (!preview) return;
    del.mutate(
      { id: preview.importId },
      {
        onSuccess: () => {
          setPreview(null);
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
          Upload a PlayCricket "Combined Batting/Bowling/Fielding" CSV export for a single grade and season.
          The preview shows what will change; nothing is applied until you Confirm.
        </p>
      </div>

      {committed && !preview && (
        <div className="rounded-md border border-green-600/40 bg-green-600/10 p-4 text-sm space-y-2">
          <p className="font-medium">
            Import applied for the {seasonLabel(committed.season)} season. Aggregates have been
            re-derived.
          </p>
          <p className="text-muted-foreground">
            Round-up and season-recap share cards can now be generated from this season's stats.
          </p>
          <Link
            href="/admin/social/queue"
            className="inline-flex items-center text-green-700 dark:text-green-400 font-medium hover:underline"
          >
            Open the social card queue →
          </Link>
        </div>
      )}

      {!preview && (
        <Card>
          <CardHeader>
            <CardTitle>Upload CSV</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onUpload} className="space-y-4">
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
              <Button onClick={onConfirm} disabled={commit.isPending}>
                {commit.isPending ? "Applying…" : "Confirm & Apply"}
              </Button>
              <Button variant="outline" onClick={onCancelPreview} disabled={del.isPending}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

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
                    <th className="py-2 pr-4">Filename</th>
                    <th className="py-2 pr-4">Grade</th>
                    <th className="py-2 pr-4">Season</th>
                    <th className="py-2 pr-4">Rows</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {imports.map((imp) => (
                    <tr key={imp.id} className="border-b last:border-0">
                      <td className="py-2 pr-4">{new Date(imp.importedAt).toLocaleString()}</td>
                      <td className="py-2 pr-4 max-w-xs truncate" title={imp.filename}>
                        {imp.filename}
                      </td>
                      <td className="py-2 pr-4">{imp.grade ?? "—"}</td>
                      <td className="py-2 pr-4">{seasonLabel(imp.season)}</td>
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

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-2xl font-serif">{value}</div>
    </div>
  );
}
