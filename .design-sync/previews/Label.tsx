import { Input, Label } from "@workspace/cricket-club";

export function Standalone() {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Label>Batting position</Label>
      <Label>Bowling style</Label>
      <Label>Preferred grade</Label>
    </div>
  );
}

export function WithInput() {
  return (
    <div style={{ maxWidth: 360, display: "grid", gap: 8 }}>
      <Label htmlFor="venue">Home venue</Label>
      <Input id="venue" placeholder="e.g. Bortolo Reserve" />
    </div>
  );
}

export function WithDisabledPeer() {
  return (
    <div style={{ maxWidth: 360, display: "grid", gap: 8 }}>
      <Input id="assoc" className="peer" disabled defaultValue="Peel Cricket Association" />
      <Label htmlFor="assoc">Association (locked)</Label>
    </div>
  );
}
