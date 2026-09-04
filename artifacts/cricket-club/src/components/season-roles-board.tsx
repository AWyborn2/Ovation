import { useMemo, useState, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ListSkeleton, QueryError, EmptyState } from "@/components/data-states";
import { useConfirm } from "@/components/confirm-dialog";

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

/**
 * Season-grouped list of role records with publish/unpublish-all per season,
 * inline edit forms and confirmed delete. Shared by the senior committee and
 * junior office-bearer admin pages (plan.md §5.6): the pages keep their own
 * hooks (`/api/club-roles` vs `/api/juniors/*`) and forms and hand this board
 * the rows plus callbacks, so juniors isolation is unchanged.
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
  /** The small uppercase label above the name (role, or "<grade> captain"). */
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
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showNew, setShowNew] = useState(false);

  const seasons = useMemo(() => {
    const bySeason = new Map<number, R[]>();
    for (const r of rows ?? []) {
      if (!bySeason.has(r.season)) bySeason.set(r.season, []);
      bySeason.get(r.season)!.push(r);
    }
    return [...bySeason.entries()]
      .map(([season, rs]) => ({
        season,
        rows: [...rs].sort(
          (a, b) =>
            a.displayOrder - b.displayOrder ||
            a.role.localeCompare(b.role) ||
            a.id - b.id,
        ),
      }))
      .sort((a, b) => b.season - a.season);
  }, [rows]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-muted-foreground mt-1">{intro}</p>
        </div>
        <Button
          onClick={() => setShowNew((v) => !v)}
          variant={showNew ? "outline" : "default"}
        >
          {showNew ? "Close form" : addLabel}
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {showNew && (
        <Card>
          <CardHeader>
            <CardTitle>{addTitle}</CardTitle>
          </CardHeader>
          <CardContent>{renderNewForm(() => setShowNew(false))}</CardContent>
        </Card>
      )}

      {isError ? (
        <QueryError onRetry={onRetry} />
      ) : isLoading ? (
        <ListSkeleton />
      ) : seasons.length === 0 ? (
        <EmptyState title={empty.title} message={empty.message} />
      ) : (
        seasons.map((group) => {
          const allPublished = group.rows.every((r) => r.published);
          const nonePublished = group.rows.every((r) => !r.published);
          return (
            <Card key={group.season}>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <CardTitle className="text-xl">
                  {formatSeason(group.season)}
                  <span className="ml-2 align-middle text-xs font-normal text-muted-foreground">
                    {group.rows.length}{" "}
                    {group.rows.length === 1 ? "record" : "records"}
                  </span>
                </CardTitle>
                <div className="space-x-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={allPublished || updatePending}
                    onClick={() => onSetSeasonPublished(group.season, true)}
                  >
                    Publish all
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={nonePublished || updatePending}
                    onClick={() => onSetSeasonPublished(group.season, false)}
                  >
                    Unpublish all
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {group.rows.map((r) => {
                  if (editingId === r.id) {
                    return (
                      <div
                        key={r.id}
                        className="rounded-md border border-border bg-muted/30 p-4"
                      >
                        {renderEditForm(r, () => setEditingId(null))}
                      </div>
                    );
                  }
                  const linked = linkedLabel(r);
                  return (
                    <div
                      key={r.id}
                      className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
                    >
                      <div className="min-w-0">
                        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                          {rowLabel(r)}
                        </span>
                        <div className="font-medium truncate">
                          {r.name}
                          {linked != null && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              {linked}
                            </span>
                          )}
                          {!r.published && (
                            <span className="ml-2 text-xs font-normal rounded bg-amber-500/15 text-amber-700 dark:text-amber-400 px-2 py-0.5">
                              Draft
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="space-x-2 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingId(r.id)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={deletePending}
                          onClick={async () => {
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
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
