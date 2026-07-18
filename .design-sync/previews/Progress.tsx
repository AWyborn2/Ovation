import { Progress, Label } from "@workspace/cricket-club";

export function SeasonImport() {
  return (
    <div style={{ maxWidth: 360, display: "grid", gap: 10 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
      >
        <Label>Importing 2025/26 scorecards</Label>
        <span style={{ fontSize: 13, opacity: 0.7 }}>60%</span>
      </div>
      <Progress value={60} />
    </div>
  );
}

export function ValueSteps() {
  return (
    <div style={{ maxWidth: 360, display: "grid", gap: 16 }}>
      <div style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 13, opacity: 0.7 }}>Round 6 of 22 &mdash; 25%</span>
        <Progress value={25} />
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 13, opacity: 0.7 }}>Season 60% complete</span>
        <Progress value={60} />
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 13, opacity: 0.7 }}>
          Target chase &mdash; 194 of 215 runs (90%)
        </span>
        <Progress value={90} />
      </div>
    </div>
  );
}
