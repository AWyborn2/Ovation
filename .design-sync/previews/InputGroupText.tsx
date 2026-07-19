import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@workspace/cricket-club";

export function PrefixText() {
  return (
    <div style={{ maxWidth: 360 }}>
      <InputGroup>
        <InputGroupAddon align="inline-start">
          <InputGroupText>Overs</InputGroupText>
        </InputGroupAddon>
        <InputGroupInput defaultValue="42.3" aria-label="Overs bowled" />
      </InputGroup>
    </div>
  );
}

export function SuffixText() {
  return (
    <div style={{ maxWidth: 360 }}>
      <InputGroup>
        <InputGroupInput defaultValue="98.4" aria-label="Strike rate" />
        <InputGroupAddon align="inline-end">
          <InputGroupText>strike rate</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}

export function BothSides() {
  return (
    <div style={{ maxWidth: 360 }}>
      <InputGroup>
        <InputGroupAddon align="inline-start">
          <InputGroupText>Target</InputGroupText>
        </InputGroupAddon>
        <InputGroupInput defaultValue="187" aria-label="Target score" />
        <InputGroupAddon align="inline-end">
          <InputGroupText>runs</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}
