import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldGroup,
  FieldLegend,
  FieldSet,
  Input,
} from "@workspace/cricket-club";

export function DescribedFields() {
  return (
    <div style={{ maxWidth: 420 }}>
      <FieldSet>
        <FieldLegend>Match details</FieldLegend>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="fd-venue">Venue</FieldLabel>
            <Input id="fd-venue" defaultValue="Bortolo Reserve" />
            <FieldDescription>
              Home ground for Seacrest CC senior fixtures.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="fd-grade">Grade</FieldLabel>
            <Input id="fd-grade" defaultValue="A-Grade" />
            <FieldDescription>
              Must match the grade published in the association fixtures —
              scorecards import against this value.
            </FieldDescription>
          </Field>
        </FieldGroup>
      </FieldSet>
    </div>
  );
}
