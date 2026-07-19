import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
  Button,
} from "@workspace/cricket-club";

function BatIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}

export function NoMatchesEmpty() {
  return (
    <div style={{ maxWidth: 480 }}>
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BatIcon />
          </EmptyMedia>
          <EmptyTitle>No matches recorded yet</EmptyTitle>
          <EmptyDescription>
            Scorecards will appear here once the first round of the 2026/27
            season has been played and imported.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button>Import scorecards</Button>
        </EmptyContent>
      </Empty>
    </div>
  );
}

export function NoSearchResultsEmpty() {
  return (
    <div style={{ maxWidth: 480 }}>
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>No players found</EmptyTitle>
          <EmptyDescription>
            No players match "K. Thompson" in the 2025/26 senior squads. Try a
            different spelling or search all seasons.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline">Search all seasons</Button>
        </EmptyContent>
      </Empty>
    </div>
  );
}
