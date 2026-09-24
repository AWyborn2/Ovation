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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { handleAdminMutationError } from "@/lib/admin-auth";
import { PlayerTypeahead, type SelectedPlayer } from "@/components/player-typeahead";
import { TableSkeleton, EmptyState, QueryError } from "@/components/data-states";
import { useConfirm } from "@/components/confirm-dialog";
import { DataTable, EditDrawer, type DataTableColumn } from "@/components/admin-ui";
import { Plus, Search } from "lucide-react";

const selectClass =
  "h-10 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

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
  const confirm = useConfirm();
  const [search, setSearch] = useState("");
  const [grade, setGrade] = useState<string>("");
  const [sortBy, setSortBy] = useState<ListStatsSortByType>(ListStatsSortBy.name);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);

  const { data, isLoading, isError, refetch } = useListStats({
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

  const stats = data?.stats ?? [];
  type StatRow = (typeof stats)[number];
  const open = stats.find((s) => s.id === openId) ?? null;

  const remove = async (s: StatRow) => {
    if (
      !(await confirm({
        title: "Delete stat record?",
        description: `Delete ${s.surname}, ${s.givenName} — ${s.grade}?`,
        confirmText: "Delete",
        destructive: true,
      }))
    )
      return;
    setError(null);
    deleteStat.mutate(
      { id: s.id },
      {
        onSuccess: () => {
          setOpenId(null);
          invalidate();
        },
        onError: onErr,
      },
    );
  };

  const num = (v: number | string | null | undefined) => (
    <span className="tabular-nums">{v ?? "—"}</span>
  );
  const columns: DataTableColumn<StatRow>[] = [
    {
      key: "player",
      header: "Player",
      cell: (s) => (
        <span className="font-semibold">
          {s.surname}, {s.givenName}
        </span>
      ),
    },
    { key: "grade", header: "Grade", cell: (s) => s.grade, className: "w-36" },
    { key: "games", header: "Games", cell: (s) => num(s.games), className: "w-20" },
    { key: "runs", header: "Runs", cell: (s) => num(s.runs), className: "w-20" },
    { key: "wickets", header: "Wkts", cell: (s) => num(s.wickets), className: "w-20" },
    { key: "batAvg", header: "Bat avg", cell: (s) => num(s.batAvg), className: "w-24" },
    { key: "bowlAvg", header: "Bowl avg", cell: (s) => num(s.bowlAvg), className: "w-24" },
  ];

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <label className="relative min-w-0 flex-1 sm:max-w-sm">
          <span className="sr-only">Search by name</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            placeholder="Search by name…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="h-10 pl-9"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Grade</span>
          <select
            value={grade}
            onChange={(e) => {
              setGrade(e.target.value);
              setPage(1);
            }}
            className={selectClass}
          >
            <option value="">All</option>
            {GRADES.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Sort</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as ListStatsSortByType)}
            className={selectClass}
          >
            <option value={ListStatsSortBy.name}>Name</option>
            <option value={ListStatsSortBy.games}>Games</option>
            <option value={ListStatsSortBy.runs}>Runs</option>
            <option value={ListStatsSortBy.wickets}>Wickets</option>
            <option value={ListStatsSortBy.batAvg}>Bat avg</option>
            <option value={ListStatsSortBy.bowlAvg}>Bowl avg</option>
          </select>
        </label>
        <Button
          variant="outline"
          className="h-10"
          onClick={() => setSortOrder((o) => (o === "asc" ? "desc" : "asc"))}
        >
          {sortOrder === "asc" ? "↑ asc" : "↓ desc"}
        </Button>
        <Button className="ml-auto h-10" onClick={() => setShowNew(true)}>
          <Plus className="mr-1.5 h-4 w-4" aria-hidden />
          Add stat
        </Button>
      </div>

      {isLoading ? (
        <TableSkeleton rows={8} />
      ) : isError ? (
        <QueryError
          message="We couldn’t load the stats list. Please try again."
          onRetry={() => refetch()}
        />
      ) : (
        <DataTable
          label="Stat records"
          rows={stats}
          columns={columns}
          getRowId={(s) => s.id}
          onRowClick={(s) => setOpenId(s.id)}
          emptyState={
            <EmptyState
              title="No stats match these filters"
              message="Try clearing the search or grade filter, or add a stat record."
            />
          }
          minWidth={720}
        />
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

      <EditDrawer open={showNew} onOpenChange={setShowNew} title="New stat row">
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
      </EditDrawer>

      <EditDrawer
        open={open != null}
        onOpenChange={(o) => !o && setOpenId(null)}
        title={open ? `${open.surname}, ${open.givenName}` : ""}
        description={open?.grade}
        footer={
          open ? (
            <>
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                disabled={deleteStat.isPending}
                onClick={() => remove(open)}
              >
                Delete
              </Button>
              <Button asChild className="ml-auto">
                <Link href={`/stats/${open.id}`}>Open full editor</Link>
              </Button>
            </>
          ) : undefined
        }
      >
        {open && (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            {(
              [
                ["Games", open.games],
                ["Runs", open.runs],
                ["Wickets", open.wickets],
                ["Batting average", open.batAvg],
                ["Bowling average", open.bowlAvg],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="text-lg font-semibold tabular-nums">{value ?? "—"}</dd>
              </div>
            ))}
          </dl>
        )}
      </EditDrawer>
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
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>Player</Label>
        <PlayerTypeahead value={player} onChange={setPlayer} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="ns-grade">Grade</Label>
        <select
          id="ns-grade"
          value={grade}
          onChange={(e) => setGrade(e.target.value)}
          className="block h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          {GRADES.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label htmlFor="ns-games">Games</Label>
          <Input
            id="ns-games"
            value={games}
            onChange={(e) => setGames(e.target.value)}
            type="number"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ns-runs">Runs</Label>
          <Input
            id="ns-runs"
            value={runs}
            onChange={(e) => setRuns(e.target.value)}
            type="number"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ns-wickets">Wickets</Label>
          <Input
            id="ns-wickets"
            value={wickets}
            onChange={(e) => setWickets(e.target.value)}
            type="number"
          />
        </div>
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
  );
}
