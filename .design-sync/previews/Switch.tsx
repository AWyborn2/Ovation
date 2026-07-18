import { Label, Switch } from "@workspace/cricket-club";

export function States() {
  return (
    <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
      <Switch aria-label="Off" />
      <Switch defaultChecked aria-label="On" />
      <Switch disabled aria-label="Disabled off" />
      <Switch disabled defaultChecked aria-label="Disabled on" />
    </div>
  );
}

export function WithLabel() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <Switch id="retired" defaultChecked />
        <Label htmlFor="retired">Show retired players</Label>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <Switch id="lineage" />
        <Label htmlFor="lineage">Include pre-merger club history</Label>
      </div>
    </div>
  );
}

export function SettingsRow() {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 24,
        maxWidth: 340,
      }}
    >
      <div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Match-day notifications</div>
        <div style={{ fontSize: 12, opacity: 0.7 }}>Selections, results and milestones</div>
      </div>
      <Switch defaultChecked aria-label="Match-day notifications" />
    </div>
  );
}
