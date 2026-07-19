import { ListSkeleton } from "@workspace/cricket-club";

export function PlayerListLoading() {
  return (
    <div style={{ maxWidth: 480 }}>
      <p className="mb-2 text-sm font-medium">Senior squad — 2026/27</p>
      <ListSkeleton rows={5} />
    </div>
  );
}
