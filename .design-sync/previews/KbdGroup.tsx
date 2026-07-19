import { Kbd, KbdGroup } from "@workspace/cricket-club";

export function Shortcut() {
  return (
    <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
      <KbdGroup>
        <Kbd>Ctrl</Kbd>
        <span style={{ fontSize: 11, opacity: 0.6 }}>+</span>
        <Kbd>K</Kbd>
      </KbdGroup>
      <KbdGroup>
        <Kbd>Shift</Kbd>
        <span style={{ fontSize: 11, opacity: 0.6 }}>+</span>
        <Kbd>Enter</Kbd>
      </KbdGroup>
    </div>
  );
}

export function ShortcutList() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 300 }}>
      {[
        { label: "Search players", keys: ["Ctrl", "K"] },
        { label: "Next scorecard", keys: ["J"] },
        { label: "Jump to honour board", keys: ["G", "H"] },
      ].map((row) => (
        <div
          key={row.label}
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
        >
          <span style={{ fontSize: 13 }}>{row.label}</span>
          <KbdGroup>
            {row.keys.map((k) => (
              <Kbd key={k}>{k}</Kbd>
            ))}
          </KbdGroup>
        </div>
      ))}
    </div>
  );
}
