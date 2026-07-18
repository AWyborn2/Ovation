import { Spinner } from "@workspace/cricket-club";

export function Sizes() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
      <Spinner className="size-4" />
      <Spinner className="size-6" />
      <Spinner className="size-8" />
    </div>
  );
}

export function LoadingScorecard() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        maxWidth: 320,
      }}
    >
      <Spinner className="size-5" />
      <span style={{ fontSize: 14, opacity: 0.8 }}>
        Loading Round 12 scorecard&hellip;
      </span>
    </div>
  );
}
