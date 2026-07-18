import { Button, ButtonGroup } from "@workspace/cricket-club";

export function StatFilters() {
  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <ButtonGroup>
        <Button variant="outline">Batting</Button>
        <Button variant="outline">Bowling</Button>
        <Button variant="outline">Fielding</Button>
        <Button variant="outline">Records</Button>
      </ButtonGroup>
      <ButtonGroup>
        <Button variant="secondary" size="sm">
          2023/24
        </Button>
        <Button variant="secondary" size="sm">
          2024/25
        </Button>
        <Button variant="secondary" size="sm">
          2025/26
        </Button>
      </ButtonGroup>
    </div>
  );
}
