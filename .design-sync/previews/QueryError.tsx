import { QueryError } from "@workspace/cricket-club";

export function LeaderboardError() {
  return (
    <div style={{ maxWidth: 480 }}>
      <QueryError
        title="Couldn’t load the batting leaderboard"
        message="The stats service didn’t respond. Check your connection and try again."
        onRetry={() => {}}
      />
    </div>
  );
}

export function DefaultErrorNoRetry() {
  return (
    <div style={{ maxWidth: 480 }}>
      <QueryError />
    </div>
  );
}
