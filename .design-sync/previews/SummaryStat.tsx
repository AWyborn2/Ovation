import { SummaryStat } from "@workspace/cricket-club";

export function Single() {
  return (
    <div style={{ maxWidth: 220 }}>
      <SummaryStat label="Career runs" value="4,182" />
    </div>
  );
}

export function StatGrid() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, minmax(160px, 1fr))",
        gap: 12,
        maxWidth: 440,
      }}
    >
      <SummaryStat label="Matches" value={11604} />
      <SummaryStat label="Premierships" value={170} />
      <SummaryStat label="Highest score" value="212*" />
      <SummaryStat label="Best bowling" value="9/34" />
    </div>
  );
}
