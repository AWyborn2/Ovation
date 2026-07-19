import { Kbd, KbdGroup } from "@workspace/cricket-club";

export function SingleKeys() {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
      <Kbd>Ctrl</Kbd>
      <Kbd>Shift</Kbd>
      <Kbd>Enter</Kbd>
      <Kbd>Esc</Kbd>
      <Kbd>/</Kbd>
    </div>
  );
}

export function InSentence() {
  return (
    <div style={{ fontSize: 13, maxWidth: 380, lineHeight: 1.7 }}>
      Press <Kbd>/</Kbd> to search players, or{" "}
      <KbdGroup>
        <Kbd>Ctrl</Kbd>
        <span style={{ fontSize: 11, opacity: 0.6 }}>+</span>
        <Kbd>K</Kbd>
      </KbdGroup>{" "}
      to open the command palette from any scorecard.
    </div>
  );
}
