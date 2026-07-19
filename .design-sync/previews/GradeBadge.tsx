import { GradeBadge } from "@workspace/cricket-club";

export function Grades() {
  return (
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
      <GradeBadge grade="A Grade" size="md" />
      <GradeBadge grade="B Grade" size="md" />
      <GradeBadge grade="C Grade" size="md" />
      <GradeBadge grade="Female A Grade" size="md" />
      <GradeBadge grade="PPL" size="md" />
      <GradeBadge grade="Colts" size="md" />
    </div>
  );
}

export function Sizes() {
  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
      <GradeBadge grade="A Grade" size="sm" />
      <GradeBadge grade="A Grade" size="md" />
      <GradeBadge grade="A Grade" size="lg" />
    </div>
  );
}

export function BadgeStyles() {
  return (
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
      <GradeBadge grade="B Grade" size="md" badgeStyle="diamond" />
      <GradeBadge grade="B Grade" size="md" badgeStyle="shield" />
      <GradeBadge grade="B Grade" size="md" badgeStyle="hexagon" />
      <GradeBadge grade="B Grade" size="md" badgeStyle="oval" />
      <GradeBadge grade="B Grade" size="md" badgeStyle="crest" />
    </div>
  );
}
