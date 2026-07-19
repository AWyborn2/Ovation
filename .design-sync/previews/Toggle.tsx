import { Toggle } from "@workspace/cricket-club";

export function States() {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <Toggle aria-label="Batting view">Batting</Toggle>
      <Toggle defaultPressed aria-label="Bowling view">
        Bowling
      </Toggle>
      <Toggle disabled aria-label="Fielding view">
        Fielding
      </Toggle>
    </div>
  );
}

export function OutlineVariant() {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <Toggle variant="outline" aria-label="Career stats">
        Career
      </Toggle>
      <Toggle variant="outline" defaultPressed aria-label="Season stats">
        2025/26
      </Toggle>
      <Toggle variant="outline" disabled aria-label="Finals only">
        Finals
      </Toggle>
    </div>
  );
}

export function Sizes() {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <Toggle size="sm" variant="outline" defaultPressed>
        T20
      </Toggle>
      <Toggle size="default" variant="outline" defaultPressed>
        One Day
      </Toggle>
      <Toggle size="lg" variant="outline" defaultPressed>
        Two Day
      </Toggle>
    </div>
  );
}
