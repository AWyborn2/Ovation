import { Skeleton, Card, CardContent, CardHeader } from "@workspace/cricket-club";

export function PlayerCardLoading() {
  return (
    <Card style={{ maxWidth: 360 }}>
      <CardHeader>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Skeleton style={{ height: 48, width: 48, borderRadius: 9999 }} />
          <div style={{ display: "grid", gap: 6, flex: 1 }}>
            <Skeleton style={{ height: 16, width: "60%" }} />
            <Skeleton style={{ height: 12, width: "40%" }} />
          </div>
        </div>
      </CardHeader>
      <CardContent style={{ display: "grid", gap: 8 }}>
        <Skeleton style={{ height: 12, width: "100%" }} />
        <Skeleton style={{ height: 12, width: "85%" }} />
        <Skeleton style={{ height: 12, width: "70%" }} />
      </CardContent>
    </Card>
  );
}

export function LeaderboardLoading() {
  return (
    <div style={{ maxWidth: 360, display: "grid", gap: 10 }}>
      <Skeleton style={{ height: 20, width: "50%" }} />
      {[0, 1, 2, 3].map((row) => (
        <div
          key={row}
          style={{ display: "flex", alignItems: "center", gap: 10 }}
        >
          <Skeleton style={{ height: 28, width: 28, borderRadius: 9999 }} />
          <Skeleton style={{ height: 12, flex: 1 }} />
          <Skeleton style={{ height: 12, width: 40 }} />
        </div>
      ))}
    </div>
  );
}
