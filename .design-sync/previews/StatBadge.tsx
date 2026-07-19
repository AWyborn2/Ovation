import { StatBadge } from "@workspace/cricket-club";

export function Tones() {
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
      <StatBadge>4,182 runs</StatBadge>
      <StatBadge>Avg 38.4</StatBadge>
      <StatBadge tone="green">312 wkts</StatBadge>
      <StatBadge tone="green">5/23 best</StatBadge>
    </div>
  );
}

export function InStatLine() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 380 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 14 }}>T. Nguyen — Seacrest CC</span>
        <StatBadge>128* (94)</StatBadge>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 14 }}>M. Okafor — Dunes CC</span>
        <StatBadge tone="green">6/41</StatBadge>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 14 }}>Season strike rate</span>
        <StatBadge>SR 87.2</StatBadge>
      </div>
    </div>
  );
}
