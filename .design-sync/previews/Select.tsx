import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  Label,
} from "@workspace/cricket-club";

export function GradeFilter() {
  return (
    <div style={{ maxWidth: 280, display: "grid", gap: 6 }}>
      <Label>Grade</Label>
      <Select defaultValue="first-grade">
        <SelectTrigger>
          <SelectValue placeholder="Select a grade" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="first-grade">First Grade</SelectItem>
          <SelectItem value="second-grade">Second Grade</SelectItem>
          <SelectItem value="third-grade">Third Grade</SelectItem>
          <SelectItem value="fourth-grade">Fourth Grade</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

export function SeasonPicker() {
  return (
    <div style={{ maxWidth: 280, display: "grid", gap: 6 }}>
      <Label>Season</Label>
      <Select defaultValue="2025-26">
        <SelectTrigger>
          <SelectValue placeholder="Select a season" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="2025-26">2025/26</SelectItem>
          <SelectItem value="2024-25">2024/25</SelectItem>
          <SelectItem value="2023-24">2023/24</SelectItem>
          <SelectItem value="2022-23">2022/23</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

export function PlaceholderState() {
  return (
    <div style={{ maxWidth: 280, display: "grid", gap: 6 }}>
      <Label>Statistic</Label>
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Choose a statistic" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="batting-average">Batting average</SelectItem>
          <SelectItem value="bowling-average">Bowling average</SelectItem>
          <SelectItem value="strike-rate">Strike rate</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
