import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
  Button,
  Badge,
} from "@workspace/cricket-club";

export function PlayerHoverCard() {
  return (
    <div
      style={{
        minHeight: 320,
        display: "flex",
        justifyContent: "center",
        paddingTop: 16,
      }}
    >
      <HoverCard open>
        <HoverCardTrigger asChild>
          <Button variant="link">J. Carter</Button>
        </HoverCardTrigger>
        <HoverCardContent>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">J. Carter</h4>
              <Badge variant="secondary">First Grade</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Right-hand bat &middot; Seacrest CC since 2018/19
            </p>
            <div className="grid grid-cols-3 gap-2 pt-1 text-center">
              <div>
                <div className="text-sm font-semibold tabular-nums">2,847</div>
                <div className="text-xs text-muted-foreground">Runs</div>
              </div>
              <div>
                <div className="text-sm font-semibold tabular-nums">34.7</div>
                <div className="text-xs text-muted-foreground">Average</div>
              </div>
              <div>
                <div className="text-sm font-semibold tabular-nums">3</div>
                <div className="text-xs text-muted-foreground">Centuries</div>
              </div>
            </div>
          </div>
        </HoverCardContent>
      </HoverCard>
    </div>
  );
}
