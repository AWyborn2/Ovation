import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Input,
  Label,
} from "@workspace/cricket-club";

export function EditPlayerDialog() {
  return (
    <div style={{ minHeight: 460 }}>
      <Dialog open>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit player</DialogTitle>
            <DialogDescription>
              Update this player's details. Changes apply to every season from
              2019/20 onwards.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="player-name">Display name</Label>
              <Input id="player-name" defaultValue="J. Carter" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="player-club">Current club</Label>
              <Input id="player-club" defaultValue="Seacrest CC" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline">Cancel</Button>
            <Button>Save changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
