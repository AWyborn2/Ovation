import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldGroup,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  Input,
} from "@workspace/cricket-club";

export function GroupedMatchForm() {
  return (
    <div style={{ maxWidth: 420 }}>
      <FieldSet>
        <FieldLegend>Match details</FieldLegend>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="fg-opponent">Opposition</FieldLabel>
            <Input id="fg-opponent" defaultValue="Dunes CC" />
          </Field>
          <Field>
            <FieldLabel htmlFor="fg-venue">Venue</FieldLabel>
            <Input id="fg-venue" defaultValue="Bortolo Reserve" />
            <FieldDescription>
              Home ground for Seacrest CC senior fixtures.
            </FieldDescription>
          </Field>
          <FieldSeparator />
          <Field>
            <FieldLabel htmlFor="fg-umpire">Umpire</FieldLabel>
            <Input id="fg-umpire" placeholder="Optional" />
          </Field>
        </FieldGroup>
      </FieldSet>
    </div>
  );
}
