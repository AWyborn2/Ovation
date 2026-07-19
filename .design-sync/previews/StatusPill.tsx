import { StatusPill } from "@workspace/cricket-club";

export function AllTones() {
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
      <StatusPill tone="live">In progress</StatusPill>
      <StatusPill tone="pilot">Pilot</StatusPill>
      <StatusPill tone="info">Scheduled</StatusPill>
      <StatusPill tone="neutral">Completed</StatusPill>
      <StatusPill tone="danger">Forfeit</StatusPill>
    </div>
  );
}

export function MatchStates() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 400 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 14 }}>Rd 12 · Seacrest CC v Dunes CC</span>
        <StatusPill tone="live">Day 2</StatusPill>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 14 }}>Rd 11 · Seacrest CC v Bayside</span>
        <StatusPill tone="neutral">Won by 24 runs</StatusPill>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 14 }}>Rd 10 · Dunes CC v Seacrest CC</span>
        <StatusPill tone="danger">Abandoned</StatusPill>
      </div>
    </div>
  );
}
