import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldGroup,
  FieldLegend,
  FieldSet,
  FieldTitle,
  Checkbox,
  Input,
} from "@workspace/cricket-club";

export function LabelledInputs() {
  return (
    <div style={{ maxWidth: 420 }}>
      <FieldSet>
        <FieldLegend>Match details</FieldLegend>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="flb-venue">Venue</FieldLabel>
            <Input id="flb-venue" defaultValue="Bortolo Reserve" />
            <FieldDescription>
              Home ground for Seacrest CC senior fixtures.
            </FieldDescription>
          </Field>
          <FieldLabel htmlFor="flb-twoday">
            <Field orientation="horizontal">
              <Checkbox id="flb-twoday" defaultChecked />
              <FieldTitle>Two-day fixture</FieldTitle>
            </Field>
          </FieldLabel>
        </FieldGroup>
      </FieldSet>
    </div>
  );
}
