import { RadioGroup, RadioGroupItem, Label } from "@workspace/cricket-club";

export function FormatChoice() {
  return (
    <RadioGroup defaultValue="two-day" style={{ maxWidth: 320 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <RadioGroupItem value="two-day" id="fmt-two-day" />
        <Label htmlFor="fmt-two-day">Two-day fixture</Label>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <RadioGroupItem value="one-day" id="fmt-one-day" />
        <Label htmlFor="fmt-one-day">One-day (50 overs)</Label>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <RadioGroupItem value="t20" id="fmt-t20" disabled />
        <Label htmlFor="fmt-t20" style={{ opacity: 0.5 }}>
          T20 (finals only)
        </Label>
      </div>
    </RadioGroup>
  );
}

export function GradeSelection() {
  return (
    <RadioGroup defaultValue="second-grade" style={{ maxWidth: 320 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <RadioGroupItem value="first-grade" id="grade-first" />
        <Label htmlFor="grade-first">First Grade</Label>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <RadioGroupItem value="second-grade" id="grade-second" />
        <Label htmlFor="grade-second">Second Grade</Label>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <RadioGroupItem value="third-grade" id="grade-third" />
        <Label htmlFor="grade-third">Third Grade</Label>
      </div>
    </RadioGroup>
  );
}
