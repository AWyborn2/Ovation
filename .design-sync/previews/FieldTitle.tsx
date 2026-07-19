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

export function TitledOptions() {
  return (
    <div style={{ maxWidth: 420 }}>
      <FieldSet>
        <FieldLegend>Publishing</FieldLegend>
        <FieldGroup>
          <Field orientation="horizontal">
            <Checkbox id="ft-public" defaultChecked />
            <FieldContent>
              <FieldTitle>Show on public site</FieldTitle>
              <FieldDescription>
                FieldTitle renders a label-weight heading without a form
                association.
              </FieldDescription>
            </FieldContent>
          </Field>
          <Field orientation="horizontal">
            <Checkbox id="ft-notify" />
            <FieldContent>
              <FieldTitle>Email members when published</FieldTitle>
              <FieldDescription>
                Sends the Round 12 result summary to the Seacrest CC list.
              </FieldDescription>
            </FieldContent>
          </Field>
        </FieldGroup>
      </FieldSet>
    </div>
  );
}
