import { TierBadge } from "@workspace/cricket-club";

const TIER_LABELS = ["500+ runs", "400+", "300+", "250+", "200+", "150+", "100+"];

export function AllTiers() {
  return (
    <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center" }}>
      {TIER_LABELS.map((label, i) => (
        <div
          key={label}
          style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}
        >
          <TierBadge tierIndex={i} />
          <span style={{ fontSize: 11, opacity: 0.7 }}>{label}</span>
        </div>
      ))}
    </div>
  );
}

export function InBoardHeader() {
  return (
    <div
      className="bg-primary text-primary-foreground"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "10px 18px",
        borderRadius: 6,
        maxWidth: 420,
        fontFamily: "serif",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        fontSize: 14,
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <TierBadge tierIndex={1} />
        <span>300 Wickets</span>
      </span>
      <span style={{ fontSize: 12 }}>4 players</span>
    </div>
  );
}
