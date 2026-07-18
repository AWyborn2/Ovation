import {
  InputGroup,
  InputGroupAddon,
  InputGroupText,
  InputGroupTextarea,
} from "@workspace/cricket-club";

export function MatchNotes() {
  return (
    <div style={{ maxWidth: 440 }}>
      <InputGroup>
        <InputGroupAddon align="block-start">
          <InputGroupText>Match notes — Round 4 vs Waroona</InputGroupText>
        </InputGroupAddon>
        <InputGroupTextarea
          rows={4}
          defaultValue="Chased 163 with three overs to spare. Callum Rigby 4/28 off 8, best figures of his B-Grade season."
        />
      </InputGroup>
    </div>
  );
}

export function WithFooterCount() {
  return (
    <div style={{ maxWidth: 440 }}>
      <InputGroup>
        <InputGroupTextarea
          rows={3}
          placeholder="Describe the premiership-winning moment…"
        />
        <InputGroupAddon align="block-end">
          <InputGroupText>0 / 280 characters</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}
