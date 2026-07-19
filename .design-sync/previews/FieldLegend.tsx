import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldGroup,
  FieldLegend,
  FieldSet,
  Input,
} from "@workspace/cricket-club";

export function LegendVariants() {
  return (
    <div style={{ maxWidth: 420 }} className="flex flex-col gap-8">
      <FieldSet>
        <FieldLegend>Match details</FieldLegend>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="fl-venue">Venue</FieldLabel>
            <Input id="fl-venue" defaultValue="Bortolo Reserve" />
          </Field>
        </FieldGroup>
      </FieldSet>
      <FieldSet>
        <FieldLegend variant="label">Toss result</FieldLegend>
        <FieldDescription>
          Label-sized legend for compact sub-sections.
        </FieldDescription>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="fl-toss">Won by</FieldLabel>
            <Input id="fl-toss" defaultValue="Seacrest CC" />
          </Field>
        </FieldGroup>
      </FieldSet>
    </div>
  );
}
