import { TableSkeleton } from "@workspace/cricket-club";

export function LadderTableLoading() {
  return (
    <div style={{ maxWidth: 560 }}>
      <p className="mb-2 text-sm font-medium">A-Grade ladder</p>
      <TableSkeleton rows={6} />
    </div>
  );
}
