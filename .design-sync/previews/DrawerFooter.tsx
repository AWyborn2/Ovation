import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
  Button,
} from "@workspace/cricket-club";

export function DrawerFooterInContext() {
  return (
    <div style={{ minHeight: 420 }}>
      <Drawer open shouldScaleBackground={false}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Confirm result entry</DrawerTitle>
            <DrawerDescription>
              Round 8 vs Dunes CC will be recorded as a 27-run win.
            </DrawerDescription>
          </DrawerHeader>
          <DrawerFooter>
            <Button>Save result</Button>
            <Button variant="outline">Cancel</Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
