import { Label, Textarea } from "@workspace/cricket-club";

export function MatchReport() {
  return (
    <div style={{ maxWidth: 420, display: "grid", gap: 8 }}>
      <Label htmlFor="match-report">Match report — Round 7 vs Pinjarra</Label>
      <Textarea
        id="match-report"
        rows={4}
        defaultValue="Won the toss and batted on a green Rushton Park deck. Openers weathered a tight first spell before Whitfield (74 off 61) took the game away in the middle overs."
      />
    </div>
  );
}

export function Placeholder() {
  return (
    <div style={{ maxWidth: 420, display: "grid", gap: 8 }}>
      <Label htmlFor="captains-notes">Captain&apos;s notes</Label>
      <Textarea
        id="captains-notes"
        placeholder="Add selection notes for the A-Grade squad…"
      />
    </div>
  );
}

export function Disabled() {
  return (
    <div style={{ maxWidth: 420 }}>
      <Textarea
        disabled
        defaultValue="Umpire's report locked after finals review."
        aria-label="Umpire's report"
      />
    </div>
  );
}
