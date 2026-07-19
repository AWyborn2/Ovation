import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
  Button,
} from "@workspace/cricket-club";

export function DrawerHeaderInContext() {
  return (
    <div style={{ minHeight: 420 }}>
      <Drawer open shouldScaleBackground={false}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Match details</DrawerTitle>
            <DrawerDescription>
              Round 8 &middot; First Grade &middot; Foreshore Oval &middot; 14
              Feb 2026
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-2 text-sm text-muted-foreground">
            Seacrest CC won by 27 runs after batting first.
          </div>
          <DrawerFooter>
            <Button>View full scorecard</Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
