import { LoadingState } from "@workspace/cricket-club";

export function DefaultLoading() {
  return (
    <div style={{ maxWidth: 480 }} className="rounded-md border">
      <LoadingState />
    </div>
  );
}

export function LabelledLoading() {
  return (
    <div style={{ maxWidth: 480 }} className="rounded-md border">
      <LoadingState label="Loading 2025/26 batting averages…" />
    </div>
  );
}
