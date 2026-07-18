import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@workspace/cricket-club";

export function InlineStartAndEnd() {
  return (
    <div style={{ maxWidth: 380 }}>
      <InputGroup>
        <InputGroupAddon align="inline-start">
          <InputGroupText>Round</InputGroupText>
        </InputGroupAddon>
        <InputGroupInput defaultValue="12" aria-label="Round number" />
        <InputGroupAddon align="inline-end">
          <InputGroupText>of 18</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}

export function BlockStart() {
  return (
    <div style={{ maxWidth: 380 }}>
      <InputGroup>
        <InputGroupAddon align="block-start">
          <InputGroupText>Opposition club</InputGroupText>
        </InputGroupAddon>
        <InputGroupInput placeholder="e.g. Baldivis White Knights" />
      </InputGroup>
    </div>
  );
}

export function BlockEnd() {
  return (
    <div style={{ maxWidth: 380 }}>
      <InputGroup>
        <InputGroupInput defaultValue="Bortolo Reserve" aria-label="Venue" />
        <InputGroupAddon align="block-end">
          <InputGroupText>Turf wicket — confirmed by PCA fixtures</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}
