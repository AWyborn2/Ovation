import { Button, ButtonGroup, ButtonGroupText } from "@workspace/cricket-club";

export function GradeFilterWithLabel() {
  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <ButtonGroup>
        <ButtonGroupText>Grade</ButtonGroupText>
        <Button variant="outline">1st</Button>
        <Button variant="outline">2nd</Button>
        <Button variant="outline">3rd</Button>
      </ButtonGroup>
      <ButtonGroup>
        <ButtonGroupText>Season</ButtonGroupText>
        <Button variant="outline">2025/26</Button>
        <ButtonGroupText>24 matches</ButtonGroupText>
      </ButtonGroup>
    </div>
  );
}
