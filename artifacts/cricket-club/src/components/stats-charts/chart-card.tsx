import { useId, type ReactNode } from "react";
import { BarChart3 } from "lucide-react";
import { CardGridSkeleton, EmptyState, TableSkeleton } from "@/components/data-states";
import { cn } from "@/lib/utils";

/** The figures behind a chart, rendered as a visually hidden table (R8). */
export interface ChartTable {
  columns: string[];
  rows: Array<Array<string | number | null | undefined>>;
}

/** Charts need at least this many data points before they draw (R6). */
export const MIN_CHART_POINTS = 3;

/**
 * Card shell every stats chart sits in: eyebrow + H2 + note header, optional
 * header actions (local tabs), and the three non-chart states —
 *
 * - `loading` → the existing table / card-grid skeleton;
 * - `empty`, or fewer than `minPoints` data `points` → the existing
 *   `EmptyState` with the caller's specific `emptyReason`
 *   (e.g. "No bowling recorded in this range");
 * - otherwise the chart, plus a visually hidden data table of its figures so
 *   screen-reader users get every number without hunting through marks.
 */
export function ChartCard({
  eyebrow,
  title,
  note,
  actions,
  loading,
  skeleton = "table",
  points,
  minPoints = MIN_CHART_POINTS,
  empty,
  emptyReason = "Not enough data to chart",
  emptyMessage,
  table,
  children,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  note?: ReactNode;
  actions?: ReactNode;
  loading?: boolean;
  skeleton?: "table" | "cards";
  /** Number of data points the chart would draw; below `minPoints` → empty state. */
  points?: number;
  minPoints?: number;
  /** Force the empty state (e.g. the underlying detail isn't captured). */
  empty?: boolean;
  emptyReason?: string;
  emptyMessage?: string;
  table?: ChartTable;
  children?: ReactNode;
  className?: string;
}) {
  const titleId = useId();
  const tooShort = points != null && points < minPoints;
  const showEmpty = !loading && (empty || tooShort);

  return (
    <section
      aria-labelledby={titleId}
      aria-busy={loading || undefined}
      className={cn(
        "flex min-w-0 flex-col gap-4 rounded-[16px] border bg-card p-[22px]",
        className,
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && (
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {eyebrow}
            </div>
          )}
          <h2
            id={titleId}
            className="mt-1 font-serif text-[26px] font-bold uppercase leading-none text-foreground"
          >
            {title}
          </h2>
        </div>
        {(actions || note) && (
          <div className="flex flex-wrap items-center gap-3">
            {note && <div className="text-[13px] text-muted-foreground">{note}</div>}
            {actions}
          </div>
        )}
      </header>

      {loading ? (
        <div role="status" aria-label="Loading chart" data-testid="chart-card-loading">
          {skeleton === "cards" ? <CardGridSkeleton count={3} /> : <TableSkeleton rows={5} />}
        </div>
      ) : showEmpty ? (
        <EmptyState
          icon={<BarChart3 className="h-8 w-8" aria-hidden />}
          title={emptyReason}
          message={emptyMessage}
          className="py-10"
        />
      ) : (
        <>
          <div className="min-w-0">{children}</div>
          {table && <HiddenDataTable table={table} caption={title} />}
        </>
      )}
    </section>
  );
}

function HiddenDataTable({ table, caption }: { table: ChartTable; caption: ReactNode }) {
  return (
    <table className="sr-only" data-testid="chart-data-table">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {table.columns.map((c) => (
            <th key={c} scope="col">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {table.rows.map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) =>
              j === 0 ? (
                <th key={j} scope="row">
                  {cell ?? "—"}
                </th>
              ) : (
                <td key={j}>{cell ?? "—"}</td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
