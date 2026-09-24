import { useMemo, useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ListSkeleton, QueryError, EmptyState } from "@/components/data-states";
import { useConfirm } from "@/components/confirm-dialog";
import { DataTable, EditDrawer, StatusPill, type DataTableColumn } from "@/components/admin-ui";

/** "2024" → "2024/25". */
export function formatSeason(year: number): string {
  const next = (year + 1) % 100;
  return `${year}/${next.toString().padStart(2, "0")}`;
}

/** What every season-grouped role record must expose for the shared board. */
export type SeasonRole = {
  id: number;
  season: number;
  role: string;
  name: string;
  displayOrder: number;
  published: boolean;
};

const selectClass =
  "h-10 rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Role records in the admin data table (Social Studio U21): newest season
 * first, a season picker with publish/unpublish-all for that season, and the
 * create/edit forms in the edit drawer with a confirmed delete. Shared by the
 * senior committee and junior office-bearer admin pages (plan.md §5.6): the
 * pages keep their own hooks (`/api/club-roles` vs `/api/juniors/*`) and forms
 * and hand this board the rows plus callbacks, so juniors isolation is
 * unchanged.
 */
export function SeasonRolesBoard<R extends SeasonRole>({
  rows,
  isLoading,
  isError,
  onRetry,
  intro,
  addLabel,
  addTitle,
  error,
  empty,
  rowLabel,
  linkedLabel,
  updatePending,
  deletePending,
  onSetSeasonPublished,
  deleteTitle,
  deleteDescription,
  onDelete,
  renderNewForm,
  renderEditForm,
}: {
  rows: R[] | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  intro: ReactNode;
  addLabel: string;
  addTitle: string;
  error: string | null;
  empty: { title: string; message: string };
  /** The role column (role, or "<grade> captain"). */
  rowLabel: (r: R) => ReactNode;
  /** "linked …" hint beside the name, or null when the record is unlinked. */
  linkedLabel: (r: R) => string | null;
  updatePending: boolean;
  deletePending: boolean;
  onSetSeasonPublished: (season: number, published: boolean) => void;
  deleteTitle: string;
  deleteDescription: (r: R) => string;
  onDelete: (r: R) => void;
  renderNewForm: (close: () => void) => ReactNode;
  renderEditForm: (r: R, close: () => void) => ReactNode;
}) {
  const confirm = useConfirm();
  const [editing, setEditing] = useState<R | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [season, setSeason] = useState<number | "all">("all");

  const sorted = useMemo(
    () =>
      [...(rows ?? [])].sort(
        (a, b) =>
          b.season - a.season ||
          a.displayOrder - b.displayOrder ||
          a.role.localeCompare(b.role) ||
          a.id - b.id,
      ),
    [rows],
  );
  const seasons = useMemo(() => [...new Set(sorted.map((r) => r.season))], [sorted]);
  const visible = season === "all" ? sorted : sorted.filter((r) => r.season === season);
  const allPublished = visible.every((r) => r.published);
  const nonePublished = visible.every((r) => !r.published);

  const confirmDelete = async (r: R) => {
    if (
      !(await confirm({
        title: deleteTitle,
        description: deleteDescription(r),
        confirmText: "Delete",
        destructive: true,
      }))
    )
      return;
    onDelete(r);
    setEditing(null);
  };

  const columns: DataTableColumn<R>[] = [
    {
      key: "season",
      header: "Season",
      cell: (r) => <span className="tabular-nums">{formatSeason(r.season)}</span>,
      className: "w-28",
    },
    { key: "role", header: "Role", cell: (r) => rowLabel(r) },
    {
      key: "name",
      header: "Name",
      cell: (r) => {
        const linked = linkedLabel(r);
        return (
          <span className="font-semibold">
            {r.name}
            {linked != null && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">{linked}</span>
            )}
          </span>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      cell: (r) =>
        r.published ? (
          <StatusPill tone="success">Published</StatusPill>
        ) : (
          <StatusPill tone="attention">Draft</StatusPill>
        ),
      className: "w-32",
    },
  ];

  return (
    <div className="space-y-5">
      <p className="max-w-[75ch] text-[15px] text-muted-foreground">{intro}</p>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {isError ? (
        <QueryError onRetry={onRetry} />
      ) : isLoading ? (
        <ListSkeleton />
      ) : (
        <>
          {seasons.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Season</span>
                <select
                  className={selectClass}
                  value={season}
                  onChange={(e) =>
                    setSeason(e.target.value === "all" ? "all" : Number(e.target.value))
                  }
                >
                  <option value="all">All seasons</option>
                  {seasons.map((s) => (
                    <option key={s} value={s}>
                      {formatSeason(s)}
                    </option>
                  ))}
                </select>
              </label>
              {season !== "all" && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={allPublished || updatePending}
                    onClick={() => onSetSeasonPublished(season, true)}
                  >
                    Publish all
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={nonePublished || updatePending}
                    onClick={() => onSetSeasonPublished(season, false)}
                  >
                    Unpublish all
                  </Button>
                </>
              )}
            </div>
          )}
          <DataTable
            label="Role records"
            rows={visible}
            columns={columns}
            getRowId={(r) => r.id}
            searchText={(r) => `${r.name} ${r.role}`}
            searchPlaceholder="Search names and roles"
            filters={[
              { id: "published", label: "Published", predicate: (r) => r.published },
              { id: "draft", label: "Drafts", predicate: (r) => !r.published },
            ]}
            onRowClick={setEditing}
            toolbarAction={
              <Button onClick={() => setShowNew(true)}>
                <Plus className="mr-1.5 h-4 w-4" aria-hidden />
                {addLabel}
              </Button>
            }
            emptyState={<EmptyState title={empty.title} message={empty.message} />}
            minWidth={560}
          />
        </>
      )}

      <EditDrawer open={showNew} onOpenChange={setShowNew} title={addTitle}>
        {showNew && renderNewForm(() => setShowNew(false))}
      </EditDrawer>

      <EditDrawer
        open={editing != null}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing ? <>Edit {rowLabel(editing)}</> : ""}
        description={editing ? `${editing.name} · ${formatSeason(editing.season)}` : undefined}
        footer={
          editing ? (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled={deletePending}
              onClick={() => confirmDelete(editing)}
            >
              Delete
            </Button>
          ) : undefined
        }
      >
        {editing && renderEditForm(editing, () => setEditing(null))}
      </EditDrawer>
    </div>
  );
}
