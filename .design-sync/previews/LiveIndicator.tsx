import { LiveIndicator, StatusPill } from "@workspace/cricket-club";

export function Default() {
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
      <LiveIndicator />
      <LiveIndicator>Day 2 in progress</LiveIndicator>
    </div>
  );
}

export function LiveVsFinished() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 400 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 14 }}>Rd 12 · Seacrest CC v Dunes CC</span>
        <LiveIndicator>Live</LiveIndicator>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 14 }}>Rd 11 · Seacrest CC v Bayside</span>
        <StatusPill tone="neutral">Final</StatusPill>
      </div>
    </div>
  );
}
