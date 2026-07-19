import { Button } from "@workspace/cricket-club";

export function Variants() {
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
      <Button>View scorecard</Button>
      <Button variant="secondary">Season stats</Button>
      <Button variant="outline">Filter grades</Button>
      <Button variant="ghost">Cancel</Button>
      <Button variant="destructive">Delete record</Button>
      <Button variant="link">Full honour board</Button>
    </div>
  );
}

export function Sizes() {
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
      <Button size="sm">Small</Button>
      <Button size="default">Default</Button>
      <Button size="lg">Large</Button>
    </div>
  );
}

export function Disabled() {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <Button disabled>Saving…</Button>
      <Button variant="outline" disabled>
        Unavailable
      </Button>
    </div>
  );
}
