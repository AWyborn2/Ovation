import { GradeBadgeList } from "@workspace/cricket-club";

export function CareerGrades() {
  return (
    <GradeBadgeList grades={["C Grade", "A Grade", "Colts", "B Grade"]} size="sm" />
  );
}

export function InPlayerRow() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        maxWidth: 440,
        padding: "10px 14px",
        border: "1px solid hsl(var(--border))",
        borderRadius: 8,
        background: "hsl(var(--card))",
      }}
    >
      <div style={{ minWidth: 130 }}>
        <div style={{ fontWeight: 600 }}>J. Carter</div>
        <div style={{ fontSize: 12, opacity: 0.7 }}>Seacrest CC · 142 games</div>
      </div>
      <GradeBadgeList grades={["A Grade", "B Grade", "PPL"]} size="sm" />
    </div>
  );
}

export function EmptyList() {
  return <GradeBadgeList grades={[]} />;
}
