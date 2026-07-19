import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldGroup,
  FieldLegend,
  FieldSet,
  Input,
} from "@workspace/cricket-club";

export function MatchDetailsFieldSet() {
  return (
    <div style={{ maxWidth: 420 }}>
      <FieldSet>
        <FieldLegend>Match details</FieldLegend>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="fs-round">Round</FieldLabel>
            <Input id="fs-round" defaultValue="12" />
          </Field>
          <Field>
            <FieldLabel htmlFor="fs-venue">Venue</FieldLabel>
            <Input id="fs-venue" defaultValue="Bortolo Reserve" />
            <FieldDescription>
              Home ground for Seacrest CC senior fixtures.
            </FieldDescription>
          </Field>
        </FieldGroup>
      </FieldSet>
    </div>
  );
}
