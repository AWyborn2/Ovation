import { Card, CardHeader, CardTitle, CardContent } from "@workspace/cricket-club";

export function ContentInCard() {
  return (
    <Card style={{ maxWidth: 420 }}>
      <CardHeader>
        <CardTitle>Club champion voting</CardTitle>
      </CardHeader>
      <CardContent>
        <p style={{ margin: 0 }}>
          CardContent is the padded body region — here holding the voting summary:
          J. Carter leads on 42 votes from T. Nguyen (38) with two rounds to play.
        </p>
      </CardContent>
    </Card>
  );
}
