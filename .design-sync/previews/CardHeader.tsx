import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@workspace/cricket-club";

export function HeaderInCard() {
  return (
    <Card style={{ maxWidth: 420 }}>
      <CardHeader>
        <CardTitle>Season 2025/26</CardTitle>
        <CardDescription>Round 8 of 14 · Seacrest CC First Grade</CardDescription>
      </CardHeader>
      <CardContent>
        <p style={{ margin: 0 }}>
          The CardHeader above carries the title and description block that opens
          every stat and match card.
        </p>
      </CardContent>
    </Card>
  );
}
