import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  Button,
  Badge,
} from "@workspace/cricket-club";

export function MatchDetailsSheet() {
  return (
    <div style={{ minHeight: 460 }}>
      <Sheet open>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>Match details</SheetTitle>
            <SheetDescription>
              Round 8 &middot; First Grade &middot; 14 Feb 2026
            </SheetDescription>
          </SheetHeader>
          <div className="grid gap-3 py-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium">Seacrest CC</span>
              <span>8/214 (45.0)</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-medium">Dunes CC</span>
              <span>10/187 (42.3)</span>
            </div>
            <div className="border-t" />
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Result</span>
              <Badge>Won by 27 runs</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Venue</span>
              <span>Foreshore Oval</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Toss</span>
              <span>Seacrest CC, batted first</span>
            </div>
          </div>
          <SheetFooter>
            <Button variant="outline">Close</Button>
            <Button>View full scorecard</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
