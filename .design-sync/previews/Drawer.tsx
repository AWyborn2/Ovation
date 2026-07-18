import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
  Button,
} from "@workspace/cricket-club";

export function InningsSummaryDrawer() {
  return (
    <div style={{ minHeight: 420 }}>
      <Drawer open shouldScaleBackground={false}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Innings summary</DrawerTitle>
            <DrawerDescription>
              Seacrest CC &middot; 8/214 from 45 overs &middot; Round 8
            </DrawerDescription>
          </DrawerHeader>
          <div className="grid gap-2 px-4 pb-2 text-sm">
            <div className="flex items-center justify-between">
              <span>J. Carter</span>
              <span className="tabular-nums">74 (68)</span>
            </div>
            <div className="flex items-center justify-between">
              <span>R. Patel</span>
              <span className="tabular-nums">41 (55)</span>
            </div>
            <div className="flex items-center justify-between">
              <span>M. Osei</span>
              <span className="tabular-nums">33* (24)</span>
            </div>
          </div>
          <DrawerFooter>
            <Button>View full scorecard</Button>
            <Button variant="outline">Close</Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
