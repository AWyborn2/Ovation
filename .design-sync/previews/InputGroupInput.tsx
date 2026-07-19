import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@workspace/cricket-club";

export function InGroup() {
  return (
    <div style={{ maxWidth: 380 }}>
      <InputGroup>
        <InputGroupAddon align="inline-start">
          <InputGroupText>Player</InputGroupText>
        </InputGroupAddon>
        <InputGroupInput placeholder="Start typing a surname…" />
      </InputGroup>
    </div>
  );
}

export function WithValue() {
  return (
    <div style={{ maxWidth: 380 }}>
      <InputGroup>
        <InputGroupAddon align="inline-start">
          <InputGroupText>Venue</InputGroupText>
        </InputGroupAddon>
        <InputGroupInput defaultValue="Rushton Park, Mandurah" aria-label="Venue" />
      </InputGroup>
    </div>
  );
}

export function DisabledControl() {
  return (
    <div style={{ maxWidth: 380 }}>
      <InputGroup data-disabled="true">
        <InputGroupAddon align="inline-start">
          <InputGroupText>PlayHQ ID</InputGroupText>
        </InputGroupAddon>
        <InputGroupInput disabled defaultValue="8f2c-mandurah-2026" aria-label="PlayHQ ID" />
      </InputGroup>
    </div>
  );
}
