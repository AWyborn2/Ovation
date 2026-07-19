import { Slider, Label } from "@workspace/cricket-club";

export function MinimumInnings() {
  return (
    <div style={{ maxWidth: 320, display: "grid", gap: 10 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
      >
        <Label>Minimum innings</Label>
        <span style={{ fontSize: 13, opacity: 0.7 }}>10</span>
      </div>
      <Slider defaultValue={[10]} min={0} max={50} step={1} />
    </div>
  );
}

export function OversRange() {
  return (
    <div style={{ maxWidth: 320, display: "grid", gap: 10 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
      >
        <Label>Overs bowled per season</Label>
        <span style={{ fontSize: 13, opacity: 0.7 }}>40&ndash;120</span>
      </div>
      <Slider defaultValue={[40, 120]} min={0} max={200} step={5} />
    </div>
  );
}
