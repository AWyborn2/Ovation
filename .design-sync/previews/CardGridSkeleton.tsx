import { CardGridSkeleton } from "@workspace/cricket-club";

export function SeasonCardsLoading() {
  return (
    <div style={{ maxWidth: 640 }}>
      <p className="mb-2 text-sm font-medium">Season archive</p>
      <CardGridSkeleton count={6} />
    </div>
  );
}
