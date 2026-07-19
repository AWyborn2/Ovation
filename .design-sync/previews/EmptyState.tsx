import { EmptyState, Button } from "@workspace/cricket-club";

export function NoAwardsYet() {
  return (
    <div style={{ maxWidth: 480 }}>
      <EmptyState
        title="No award winners recorded"
        message="Season award winners will appear here once the committee publishes the 2026/27 vote count."
        action={<Button size="sm">Add award winners</Button>}
      />
    </div>
  );
}

export function NoMilestonesDefault() {
  return (
    <div style={{ maxWidth: 480 }}>
      <EmptyState
        title="No milestones this round"
        message="Fifties, five-fors and career milestones from Round 8 will show up here after scorecards are imported."
      />
    </div>
  );
}
