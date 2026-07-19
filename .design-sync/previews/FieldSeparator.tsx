import {
  Field,
  FieldLabel,
  FieldGroup,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  Input,
} from "@workspace/cricket-club";

export function SeparatedSections() {
  return (
    <div style={{ maxWidth: 420 }}>
      <FieldSet>
        <FieldLegend>Match details</FieldLegend>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="fsp-venue">Venue</FieldLabel>
            <Input id="fsp-venue" defaultValue="Bortolo Reserve" />
          </Field>
          <FieldSeparator />
          <Field>
            <FieldLabel htmlFor="fsp-umpire">Umpire</FieldLabel>
            <Input id="fsp-umpire" placeholder="Optional" />
          </Field>
          <FieldSeparator>Scoring extras</FieldSeparator>
          <Field>
            <FieldLabel htmlFor="fsp-penalty">Penalty runs</FieldLabel>
            <Input id="fsp-penalty" defaultValue="0" />
          </Field>
        </FieldGroup>
      </FieldSet>
    </div>
  );
}
