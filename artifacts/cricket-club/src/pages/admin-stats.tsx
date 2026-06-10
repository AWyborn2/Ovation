import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListStats,
  useDeleteStat,
  useCreateStat,
  getListStatsQueryKey,
  getGetDashboardQueryKey,
  getListGradesQueryKey,
  getGetRecordsQueryKey,
  ListStatsSortBy,
  type ListStatsSortBy as ListStatsSortByType,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { PlayerTypeahead, type SelectedPlayer } from "@/components/player-typeahead";

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

export default function AdminStats() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [grade, setGrade] = useState<string>("");
  const [sortBy, setSortBy] = useState<ListStatsSortByType>(ListStatsSortBy.name);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  const { data, isLoading } = useListStats({
    search: search || undefined,
    grade: grade || undefined,
    sortBy,
    sortOrder,
    page,
    limit: 25,
  });

  const deleteStat = useDeleteStat();
  const createStat = useCreateStat();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListStatsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
    qc.invalidateQueries({ queryKey: getListGradesQueryKey() });
    qc.invalidateQueries({ queryKey: getGetRecordsQueryKey() });
  };
  const onErr = (e: unknown) => setError(handleAdminMutationError(e));

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-end gap-4">
        <Button onClick={() => setShowNew((v) => !v)}>{showNew ? "Close" : "Add stat"}</Button>
      </div>
      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {showNew && (
        <NewStatForm
          pending={createStat.isPending}
          onCreate={(values) => {
            setError(null);
            createStat.mutate(
              { data: values },
              {
                onSuccess: () => {
                  setShowNew(false);
                  invalidate();
                },
                onError: onErr,
              },
            );
          }}
          onCancel={() => setShowNew(false)}
        />
      )}

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto] md:items-end">
            <div className="space-y-1">
              <Label>Search by name</Label>
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="space-y-1">
              <Label>Grade</Label>
              <select
                value={grade}
                onChange={(e) => {
                  setGrade(e.target.value);
                  setPage(1);
                }}
                className="block rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">All</option>
                {GRADES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Sort</Label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as ListStatsSortByType)}
                className="block rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value={ListStatsSortBy.name}>Name</option>
                <option value={ListStatsSortBy.games}>Games</option>
                <option value={ListStatsSortBy.runs}>Runs</option>
                <option value={ListStatsSortBy.wickets}>Wickets</option>
                <option value={ListStatsSortBy.batAvg}>Bat avg</option>
                <option value={ListStatsSortBy.bowlAvg}>Bowl avg</option>
              </select>
            </div>
            <Button
              variant="outline"
              onClick={() => setSortOrder((o) => (o === "asc" ? "desc" : "asc"))}
            >
              {sortOrder === "asc" ? "↑ asc" : "↓ desc"}
            </Button>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !data?.stats.length ? (
            <p className="text-sm text-muted-foreground italic">No stats match these filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2 pr-3">Player</th>
                    <th className="py-2 pr-3">Grade</th>
                    <th className="py-2 pr-3">Games</th>
                    <th className="py-2 pr-3">Runs</th>
                    <th className="py-2 pr-3">Wkts</th>
                    <th className="py-2 pr-3">Bat avg</th>
                    <th className="py-2 pr-3">Bowl avg</th>
                    <th className="py-2 pr-3 text-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.stats.map((s) => (
                    <tr key={s.id} className="border-b last:border-0">
                      <td className="py-2 pr-3">
                        {s.surname}, {s.givenName}
                      </td>
                      <td className="py-2 pr-3">{s.grade}</td>
                      <td className="py-2 pr-3">{s.games ?? "—"}</td>
                      <td className="py-2 pr-3">{s.runs ?? "—"}</td>
                      <td className="py-2 pr-3">{s.wickets ?? "—"}</td>
                      <td className="py-2 pr-3">{s.batAvg ?? "—"}</td>
                      <td className="py-2 pr-3">{s.bowlAvg ?? "—"}</td>
                      <td className="py-2 pr-3 text-right space-x-2">
                        <Link href={`/stats/${s.id}`}>
                          <Button size="sm" variant="outline">
                            Edit
                          </Button>
                        </Link>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            if (!confirm(`Delete ${s.surname}, ${s.givenName} — ${s.grade}?`)) return;
                            setError(null);
                            deleteStat.mutate(
                              { id: s.id },
                              { onSuccess: invalidate, onError: onErr },
                            );
                          }}
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

          {data && data.total > 0 && (
            <div className="flex items-center justify-between text-sm">
              <div className="text-muted-foreground">
                Page {data.page} of {totalPages} — {data.total} rows
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={data.page <= 1}
                >
                  Prev
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={data.page >= totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function NewStatForm({
  pending,
  onCreate,
  onCancel,
}: {
  pending: boolean;
  onCreate: (v: {
    playerId: number;
    grade: string;
    games?: number;
    runs?: number;
    wickets?: number;
  }) => void;
  onCancel: () => void;
}) {
  const [player, setPlayer] = useState<SelectedPlayer | null>(null);
  const [grade, setGrade] = useState("A Grade");
  const [games, setGames] = useState("");
  const [runs, setRuns] = useState("");
  const [wickets, setWickets] = useState("");

  return (
    <Card>
      <CardHeader>
        <CardTitle>New stat row</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] md:items-end">
          <div className="space-y-1">
            <Label>Player</Label>
            <PlayerTypeahead value={player} onChange={setPlayer} />
          </div>
          <div className="space-y-1">
            <Label>Grade</Label>
            <select
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {GRADES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label>Games</Label>
            <Input value={games} onChange={(e) => setGames(e.target.value)} type="number" />
          </div>
          <div className="space-y-1">
            <Label>Runs</Label>
            <Input value={runs} onChange={(e) => setRuns(e.target.value)} type="number" />
          </div>
          <div className="space-y-1">
            <Label>Wickets</Label>
            <Input value={wickets} onChange={(e) => setWickets(e.target.value)} type="number" />
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => {
                if (!player) return;
                onCreate({
                  playerId: player.id,
                  grade,
                  games: games ? Number(games) : undefined,
                  runs: runs ? Number(runs) : undefined,
                  wickets: wickets ? Number(wickets) : undefined,
                });
              }}
              disabled={pending || !player}
            >
              {pending ? "Adding…" : "Add"}
            </Button>
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
