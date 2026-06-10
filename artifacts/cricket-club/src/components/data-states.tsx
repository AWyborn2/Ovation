import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Loader2, AlertTriangle, Inbox } from "lucide-react";

/**
 * Shared loading / error / empty state primitives.
 *
 * These give every data-fetching screen a consistent, on-brand feel:
 * - skeletons for tables and card grids (preferred over bare "Loading…" text),
 * - a small inline spinner for tight spaces,
 * - a clear error block with a retry action for failed initial fetches,
 * - a friendly empty state for "nothing here yet" lists.
 */

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-4 w-4 animate-spin", className)} />;
}

/** Small centred spinner + label for tight areas where a skeleton is overkill. */
export function LoadingState({
  label = "Loading…",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <Spinner />
      <span>{label}</span>
    </div>
  );
}

/** Skeleton placeholder shaped like a data table. */
export function TableSkeleton({
  rows = 6,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)} aria-hidden="true">
      <Skeleton className="h-8 w-full" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

/** Skeleton placeholder shaped like a grid of cards. */
export function CardGridSkeleton({
  count = 6,
  className,
  cardClassName,
}: {
  count?: number;
  className?: string;
  cardClassName?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
        className,
      )}
      aria-hidden="true"
    >
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className={cn("h-28 w-full rounded-md", cardClassName)} />
      ))}
    </div>
  );
}

/** A stack of full-width line skeletons (lists, simple rows). */
export function ListSkeleton({
  rows = 5,
  className,
  rowClassName,
}: {
  rows?: number;
  className?: string;
  rowClassName?: string;
}) {
  return (
    <div className={cn("space-y-2", className)} aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className={cn("h-12 w-full rounded-md", rowClassName)} />
      ))}
    </div>
  );
}

/** Error block shown when an initial data fetch fails. Offers a retry. */
export function QueryError({
  title = "Couldn’t load this",
  message = "Something went wrong while loading. Please try again.",
  onRetry,
  className,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-md border border-destructive/40 bg-destructive/5 px-6 py-10 text-center",
        className,
      )}
      role="alert"
    >
      <AlertTriangle className="h-8 w-8 text-destructive" />
      <div className="space-y-1">
        <p className="font-semibold text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/** Friendly empty state for lists/boards with no data yet. */
export function EmptyState({
  icon,
  title,
  message,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  message?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-md border border-dashed border-border bg-muted/20 px-6 py-12 text-center",
        className,
      )}
    >
      <div className="text-muted-foreground">
        {icon ?? <Inbox className="h-8 w-8" />}
      </div>
      <div className="space-y-1">
        <p className="font-semibold text-foreground">{title}</p>
        {message && <p className="text-sm text-muted-foreground">{message}</p>}
      </div>
      {action}
    </div>
  );
}
