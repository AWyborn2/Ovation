import { Badge } from "@workspace/cricket-club";

export function Variants() {
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
      <Badge>First Grade</Badge>
      <Badge variant="secondary">Round 8</Badge>
      <Badge variant="destructive">Forfeit</Badge>
      <Badge variant="outline">Away</Badge>
    </div>
  );
}

export function MatchContext() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 360 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 14 }}>Round 8 vs Mandurah</span>
        <Badge>Won by 24 runs</Badge>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 14 }}>J. Carter</span>
        <Badge variant="secondary">Captain</Badge>
        <Badge variant="outline">142 games</Badge>
      </div>
    </div>
  );
}

export function HonourBoard() {
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
      <Badge>Premiers 2024/25</Badge>
      <Badge variant="secondary">B Grade</Badge>
      <Badge variant="outline">T20</Badge>
    </div>
  );
}
