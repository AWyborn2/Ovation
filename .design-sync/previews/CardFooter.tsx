import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
  Button,
  Badge,
} from "@workspace/cricket-club";

export function FooterInCard() {
  return (
    <Card style={{ maxWidth: 420 }}>
      <CardHeader>
        <CardTitle>Round 9 — vs Dunes CC</CardTitle>
      </CardHeader>
      <CardContent>
        <p style={{ margin: 0 }}>Won by 5 wickets chasing 158.</p>
      </CardContent>
      <CardFooter style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Button size="sm">Full scorecard</Button>
        <Badge variant="outline">Second Grade</Badge>
      </CardFooter>
    </Card>
  );
}
