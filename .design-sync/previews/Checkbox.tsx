import { Checkbox, Label } from "@workspace/cricket-club";

export function States() {
  return (
    <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
      <Checkbox aria-label="Unchecked" />
      <Checkbox defaultChecked aria-label="Checked" />
      <Checkbox disabled aria-label="Disabled" />
      <Checkbox disabled defaultChecked aria-label="Disabled checked" />
    </div>
  );
}

export function WithLabel() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Checkbox id="finals" defaultChecked />
        <Label htmlFor="finals">Include finals matches</Label>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Checkbox id="t20" />
        <Label htmlFor="t20">T20 fixtures only</Label>
      </div>
    </div>
  );
}

export function FilterGroup() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 260 }}>
      <div style={{ fontSize: 13, fontWeight: 600 }}>Grades</div>
      {[
        { id: "g1", label: "First Grade", checked: true },
        { id: "g2", label: "Second Grade", checked: true },
        { id: "g3", label: "B Grade", checked: false },
      ].map((g) => (
        <div key={g.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Checkbox id={g.id} defaultChecked={g.checked} />
          <Label htmlFor={g.id}>{g.label}</Label>
        </div>
      ))}
    </div>
  );
}
