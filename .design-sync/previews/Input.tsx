import { Input, Label } from "@workspace/cricket-club";

export function Default() {
  return (
    <div style={{ maxWidth: 360 }}>
      <Input defaultValue="Mitchell Braddock" aria-label="Player name" />
    </div>
  );
}

export function WithLabel() {
  return (
    <div style={{ maxWidth: 360, display: "grid", gap: 8 }}>
      <Label htmlFor="player-search">Player name</Label>
      <Input id="player-search" placeholder="e.g. Josh Carberry" />
    </div>
  );
}

export function Disabled() {
  return (
    <div style={{ maxWidth: 360, display: "grid", gap: 8 }}>
      <Label htmlFor="home-ground">Home ground</Label>
      <Input id="home-ground" disabled defaultValue="Rushton Park, Mandurah" />
    </div>
  );
}
