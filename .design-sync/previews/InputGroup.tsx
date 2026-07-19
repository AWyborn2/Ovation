import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from "@workspace/cricket-club";

export function PlayerSearch() {
  return (
    <div style={{ maxWidth: 400 }}>
      <InputGroup>
        <InputGroupAddon align="inline-start">
          <InputGroupText>Search</InputGroupText>
        </InputGroupAddon>
        <InputGroupInput placeholder="Find a player, e.g. Dale Whitfield" />
        <InputGroupAddon align="inline-end">
          <InputGroupButton>Go</InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}

export function StatSuffix() {
  return (
    <div style={{ maxWidth: 320 }}>
      <InputGroup>
        <InputGroupInput defaultValue="4.72" aria-label="Economy rate" />
        <InputGroupAddon align="inline-end">
          <InputGroupText>runs / over</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}

export function GradeFilter() {
  return (
    <div style={{ maxWidth: 400 }}>
      <InputGroup>
        <InputGroupAddon align="inline-start">
          <InputGroupText>Grade</InputGroupText>
        </InputGroupAddon>
        <InputGroupInput placeholder="A-Grade Turf" />
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="sm" variant="outline">
            Apply
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}
