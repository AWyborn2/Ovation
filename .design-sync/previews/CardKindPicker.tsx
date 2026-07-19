import { CardKindPicker } from "@workspace/cricket-club";

// Chip picker for the card types a sponsor or template applies to.
// Empty selection = "All cards" chip active.
export function AllCardTypes() {
  return (
    <div style={{ maxWidth: 460 }}>
      <CardKindPicker value={[]} onChange={() => {}} />
    </div>
  );
}

// A sponsor scoped to a subset of celebration cards.
export function SponsorSubset() {
  return (
    <div style={{ maxWidth: 460 }}>
      <CardKindPicker
        value={["milestone", "century", "fiveFor"]}
        onChange={() => {}}
      />
    </div>
  );
}
