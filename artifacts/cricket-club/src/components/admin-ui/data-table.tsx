import { useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * The admin CRUD table (Social Studio KTD13): search, filter chips, 52px rows,
 * horizontal scroll inside its card, row click, and an empty state. Pure
 * presentation — rows, columns and filters come from the page.
 */
export type DataTableColumn<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
};

export type DataTableFilter<T> = {
  id: string;
  label: string;
  predicate: (row: T) => boolean;
};

export type DataTableProps<T> = {
  rows: readonly T[];
  columns: readonly DataTableColumn<T>[];
  getRowId: (row: T) => string | number;
  /** Accessible name for the table. */
  label: string;
  /** Text searched by the search box; omit to hide search. */
  searchText?: (row: T) => string;
  searchPlaceholder?: string;
  /** Single-select chips; clicking the active chip clears it. */
  filters?: readonly DataTableFilter<T>[];
  onRowClick?: (row: T) => void;
  /** Shown when no rows match (or there are none). */
  emptyState?: ReactNode;
  /** Right-aligned toolbar slot, e.g. a primary "+ Add" button. */
  toolbarAction?: ReactNode;
  /** Below this width the table scrolls horizontally inside its card. */
  minWidth?: number;
};

export function DataTable<T>({
  rows,
  columns,
  getRowId,
  label,
  searchText,
  searchPlaceholder = "Search",
  filters,
  onRowClick,
  emptyState,
  toolbarAction,
  minWidth = 720,
}: DataTableProps<T>) {
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filter = filters?.find((f) => f.id === activeFilter);
    return rows.filter(
      (row) =>
        (!filter || filter.predicate(row)) &&
        (!q || !searchText || searchText(row).toLowerCase().includes(q)),
    );
  }, [rows, query, activeFilter, filters, searchText]);

  const onRowKey = (e: KeyboardEvent<HTMLTableRowElement>, row: T) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onRowClick?.(row);
    }
  };

  const showToolbar = !!searchText || !!filters?.length || !!toolbarAction;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {showToolbar && (
        <div className="flex flex-wrap items-center gap-2">
          {searchText && (
            <div className="relative w-full max-w-xs">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="h-10 pl-9"
              />
            </div>
          )}
          {filters?.map((f) => {
            const active = f.id === activeFilter;
            return (
              <button
                key={f.id}
                type="button"
                aria-pressed={active}
                onClick={() => setActiveFilter(active ? null : f.id)}
                className={cn(
                  "h-8 rounded-full border px-3 text-xs font-semibold transition-colors",
                  active
                    ? "border-primary bg-primary/10 text-primary-text"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                {f.label}
              </button>
            );
          })}
          {toolbarAction && <div className="ml-auto">{toolbarAction}</div>}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full border-collapse text-sm" style={{ minWidth }} aria-label={label}>
          <thead>
            <tr className="border-b border-border">
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cn(
                    "h-10 px-4 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground",
                    c.className,
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-10 text-center text-muted-foreground"
                >
                  {emptyState ?? "Nothing to show."}
                </td>
              </tr>
            ) : (
              visible.map((row) => (
                <tr
                  key={getRowId(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={onRowClick ? (e) => onRowKey(e, row) : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  className={cn(
                    "h-[52px] border-b border-border last:border-b-0",
                    onRowClick &&
                      "cursor-pointer hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none",
                  )}
                >
                  {columns.map((c) => (
                    <td key={c.key} className={cn("px-4 align-middle", c.className)}>
                      {c.cell(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
