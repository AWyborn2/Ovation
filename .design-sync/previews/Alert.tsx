import { Alert, AlertTitle, AlertDescription } from "@workspace/cricket-club";

export function Default() {
  return (
    <Alert style={{ maxWidth: 480 }}>
      <AlertTitle>Season import complete</AlertTitle>
      <AlertDescription>
        212 scorecards from the 2025/26 season were folded into the statistics
        database. Player links were resolved automatically.
      </AlertDescription>
    </Alert>
  );
}

export function Destructive() {
  return (
    <Alert variant="destructive" style={{ maxWidth: 480 }}>
      <AlertTitle>Sync failed</AlertTitle>
      <AlertDescription>
        The PlayHQ fixture feed did not respond. Results shown may be up to a
        week old — retry the sync from the admin console.
      </AlertDescription>
    </Alert>
  );
}
