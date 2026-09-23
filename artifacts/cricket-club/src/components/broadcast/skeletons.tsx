import { cn } from "@/lib/utils";

/** A `--muted` placeholder block shaped like the content it stands in for. */
export function SkeletonBlock({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-sm bg-muted", className)} />;
}

/** Row of stat-tile skeletons. */
export function StatTilesSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div
      className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]"
      role="status"
      aria-label="Loading"
      data-testid="skeleton-tiles"
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-lg border bg-card px-5 py-[18px]">
          <SkeletonBlock className="h-3 w-16" />
          <SkeletonBlock className="mt-3 h-9 w-24" />
        </div>
      ))}
    </div>
  );
}

/** List of row skeletons (result rows, leader rows, table rows). */
export function RowsSkeleton({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div
      className={cn("space-y-3", className)}
      role="status"
      aria-label="Loading"
      data-testid="skeleton-rows"
    >
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <SkeletonBlock className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <SkeletonBlock className="h-4 w-1/2" />
            <SkeletonBlock className="h-3 w-1/3" />
          </div>
          <SkeletonBlock className="h-6 w-12" />
        </div>
      ))}
    </div>
  );
}

/** Card-grid skeleton (premiership cards, photo cards). */
export function CardsSkeleton({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div
      className={cn(
        "grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(min(100%,230px),1fr))]",
        className,
      )}
      role="status"
      aria-label="Loading"
      data-testid="skeleton-cards"
    >
      {Array.from({ length: count }, (_, i) => (
        <SkeletonBlock key={i} className="h-40 rounded-lg" />
      ))}
    </div>
  );
}
