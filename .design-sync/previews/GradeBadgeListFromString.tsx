import { GradeBadgeListFromString } from "@workspace/cricket-club";

export function FromCommaString() {
  return (
    <GradeBadgeListFromString gradesPlayed="B Grade, A Grade, Female A Grade, Colts" size="sm" />
  );
}

export function WithClubTotalFiltered() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 420 }}>
      <div style={{ fontSize: 12, opacity: 0.7 }}>
        &quot;A Grade, CLUB TOTAL, C Grade&quot; — CLUB TOTAL is filtered out
      </div>
      <GradeBadgeListFromString gradesPlayed="A Grade, CLUB TOTAL, C Grade" size="sm" />
    </div>
  );
}

export function NullInput() {
  return <GradeBadgeListFromString gradesPlayed={null} />;
}
