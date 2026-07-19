import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@workspace/cricket-club";

export function SearchAction() {
  return (
    <div style={{ maxWidth: 380 }}>
      <InputGroup>
        <InputGroupInput placeholder="Search match archive…" />
        <InputGroupAddon align="inline-end">
          <InputGroupButton>Search</InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}

export function SizesAndVariants() {
  return (
    <div style={{ display: "grid", gap: 12, maxWidth: 380 }}>
      <InputGroup>
        <InputGroupInput defaultValue="Season 2025/26" aria-label="Season" />
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="xs">Clear</InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <InputGroup>
        <InputGroupInput placeholder="Invite a scorer by email" />
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="sm" variant="secondary">
            Send invite
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}
