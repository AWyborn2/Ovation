import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLegend,
  FieldSet,
  Input,
} from "@workspace/cricket-club";

export function MatchDetailsFields() {
  return (
    <div style={{ maxWidth: 420 }}>
      <FieldSet>
        <FieldLegend>Match details</FieldLegend>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="field-venue">Venue</FieldLabel>
            <Input id="field-venue" defaultValue="Bortolo Reserve" />
            <FieldDescription>
              Home ground for Seacrest CC senior fixtures.
            </FieldDescription>
          </Field>
          <Field data-invalid="true">
            <FieldLabel htmlFor="field-overs">Overs per innings</FieldLabel>
            <Input id="field-overs" defaultValue="80" aria-invalid />
            <FieldError errors={[{ message: "Overs must be between 1 and 50" }]} />
          </Field>
        </FieldGroup>
      </FieldSet>
    </div>
  );
}
