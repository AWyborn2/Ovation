import { PlayerTypeahead } from "@/components/player-typeahead";
import { JuniorPlayerTypeahead } from "@/components/junior-player-typeahead";
import type { PickedPerson } from "./api";

export type PersonPickerProps = {
  value: PickedPerson | null;
  onChange: (person: PickedPerson | null) => void;
};

/** "Given Surname" back into the typeahead's surname / given-name shape. */
function asSelected(id: number, name: string) {
  const parts = name.trim().split(/\s+/);
  const surname = parts.pop() ?? name;
  return { id, surname, givenName: parts.join(" ") };
}

/** Picks a senior player for the add form or to link a held entry. */
export function SeniorPersonPicker({ value, onChange }: PersonPickerProps) {
  return (
    <PlayerTypeahead
      value={value?.playerId != null ? asSelected(value.playerId, value.name) : null}
      onChange={(p) =>
        onChange(
          p ? { name: [p.givenName, p.surname].filter(Boolean).join(" "), playerId: p.id } : null,
        )
      }
    />
  );
}

/** Picks one of the club's junior players for the juniors add form. */
export function JuniorPersonPicker({ value, onChange }: PersonPickerProps) {
  return (
    <JuniorPlayerTypeahead
      value={
        value?.participantId
          ? { participantId: value.participantId, displayName: value.name }
          : null
      }
      onChange={(p) => onChange(p ? { name: p.displayName, participantId: p.participantId } : null)}
    />
  );
}
