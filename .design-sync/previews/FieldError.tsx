import {
  Field,
  FieldLabel,
  FieldError,
  FieldGroup,
  FieldLegend,
  FieldSet,
  Input,
} from "@workspace/cricket-club";

export function InvalidOversField() {
  return (
    <div style={{ maxWidth: 420 }}>
      <FieldSet>
        <FieldLegend>Match details</FieldLegend>
        <FieldGroup>
          <Field data-invalid="true">
            <FieldLabel htmlFor="fe-overs">Overs per innings</FieldLabel>
            <Input id="fe-overs" defaultValue="80" aria-invalid />
            <FieldError errors={[{ message: "Overs must be between 1 and 50" }]} />
          </Field>
          <Field data-invalid="true">
            <FieldLabel htmlFor="fe-date">Match date</FieldLabel>
            <Input id="fe-date" defaultValue="31/02/2027" aria-invalid />
            <FieldError
              errors={[
                { message: "Enter a real calendar date" },
                { message: "Date must fall within the 2026/27 season" },
              ]}
            />
          </Field>
        </FieldGroup>
      </FieldSet>
    </div>
  );
}
