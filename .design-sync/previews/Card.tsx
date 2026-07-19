import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Button,
  Badge,
} from "@workspace/cricket-club";

export function MatchSummary() {
  return (
    <Card style={{ maxWidth: 420 }}>
      <CardHeader>
        <CardTitle>Round 8 — vs Mandurah</CardTitle>
        <CardDescription>Rushton Park · Saturday 14 Feb 2026</CardDescription>
      </CardHeader>
      <CardContent>
        <p style={{ margin: 0 }}>
          Won by 42 runs. 8/214 (J. Carter 78*) defending against 172 all out
          (T. Nguyen 4/31).
        </p>
      </CardContent>
      <CardFooter style={{ display: "flex", gap: 8 }}>
        <Button size="sm">Full scorecard</Button>
        <Badge variant="secondary">First Grade</Badge>
      </CardFooter>
    </Card>
  );
}

export function Plain() {
  return (
    <Card style={{ maxWidth: 420 }}>
      <CardContent style={{ paddingTop: 24 }}>
        <p style={{ margin: 0 }}>
          A plain card with content only — used for stat blocks and list wrappers.
        </p>
      </CardContent>
    </Card>
  );
}
