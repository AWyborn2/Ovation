import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLegend,
  FieldSet,
  FieldTitle,
  Checkbox,
} from "@workspace/cricket-club";

export function CheckboxWithContent() {
  return (
    <div style={{ maxWidth: 420 }}>
      <FieldSet>
        <FieldLegend>Match options</FieldLegend>
        <FieldGroup>
          <Field orientation="horizontal">
            <Checkbox id="fc-twoday" defaultChecked />
            <FieldContent>
              <FieldTitle>Two-day fixture</FieldTitle>
              <FieldDescription>
                Played across consecutive Saturdays at Bortolo Reserve.
              </FieldDescription>
            </FieldContent>
          </Field>
          <Field orientation="horizontal">
            <Checkbox id="fc-finals" />
            <FieldContent>
              <FieldTitle>Counts toward finals qualification</FieldTitle>
              <FieldDescription>
                Players need six qualifying matches to be eligible.
              </FieldDescription>
            </FieldContent>
          </Field>
        </FieldGroup>
      </FieldSet>
    </div>
  );
}
