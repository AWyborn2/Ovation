import { ColourSlotPicker } from "@workspace/cricket-club";

// Tenant brand-colour slots: swatch, hex field, R/G/B channels and a Pantone
// code lookup, all kept in sync. Shown as the pair an admin edits together.
export function BrandColours() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 12,
        maxWidth: 560,
      }}
    >
      <ColourSlotPicker
        label="Primary"
        description="Buttons, nav highlights"
        value="#1B3A5C"
        onChange={() => {}}
      />
      <ColourSlotPicker
        label="Accent"
        description="Badges, key stats"
        value="#D9A521"
        onChange={() => {}}
      />
    </div>
  );
}

// Locked slot — e.g. while a theme save is in flight.
export function DisabledSlot() {
  return (
    <div style={{ maxWidth: 280 }}>
      <ColourSlotPicker
        label="Secondary"
        description="Footers, muted panels"
        value="#3D4A55"
        onChange={() => {}}
        disabled
      />
    </div>
  );
}
