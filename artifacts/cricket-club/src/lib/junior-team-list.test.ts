import { describe, it, expect } from "vitest";
import {
  addRow,
  moveRow,
  removeRow,
  rowsFromPlayers,
  toPayload,
  toggleRole,
  type JuniorEditorRow,
} from "./junior-team-list";

const row = (participantId: string, extra: Partial<JuniorEditorRow> = {}): JuniorEditorRow => ({
  participantId,
  name: participantId.toUpperCase(),
  shirtNumber: null,
  isPrivate: false,
  captain: false,
  vice: false,
  keeper: false,
  ...extra,
});

describe("junior team list editor rules", () => {
  it("reads saved players in order with their roles split out", () => {
    const rows = rowsFromPlayers([
      {
        order: 2,
        participantId: "b",
        name: "B",
        role: "VC/WK",
        shirtNumber: "4",
        isPrivate: true,
        isKnown: true,
      },
      {
        order: 1,
        participantId: "a",
        name: "A",
        role: "C",
        shirtNumber: null,
        isPrivate: false,
        isKnown: true,
      },
    ]);
    expect(rows.map((r) => r.participantId)).toEqual(["a", "b"]);
    expect(rows[0]).toMatchObject({ captain: true, vice: false, keeper: false });
    expect(rows[1]).toMatchObject({
      captain: false,
      vice: true,
      keeper: true,
      shirtNumber: "4",
      isPrivate: true,
    });
  });

  it("allows one captain, one vice-captain and one keeper", () => {
    let rows = [row("a"), row("b")];
    rows = toggleRole(rows, 0, "captain");
    rows = toggleRole(rows, 1, "captain");
    expect(rows.map((r) => r.captain)).toEqual([false, true]);
    // A captain cannot also be vice-captain.
    rows = toggleRole(rows, 1, "vice");
    expect(rows[1]).toMatchObject({ captain: false, vice: true });
    rows = toggleRole(rows, 0, "keeper");
    rows = toggleRole(rows, 1, "keeper");
    expect(rows.map((r) => r.keeper)).toEqual([false, true]);
    // Toggling again clears it.
    rows = toggleRole(rows, 1, "keeper");
    expect(rows[1]!.keeper).toBe(false);
  });

  it("moves, adds (once) and removes players", () => {
    let rows: readonly JuniorEditorRow[] = [row("a"), row("b"), row("c")];
    rows = moveRow(rows, 2, -1);
    expect(rows.map((r) => r.participantId)).toEqual(["a", "c", "b"]);
    expect(moveRow(rows, 0, -1)).toBe(rows);
    expect(moveRow(rows, 2, 1)).toBe(rows);
    rows = addRow(rows, row("d"));
    rows = addRow(rows, row("a"));
    expect(rows.map((r) => r.participantId)).toEqual(["a", "c", "b", "d"]);
    rows = removeRow(rows, 1);
    expect(rows.map((r) => r.participantId)).toEqual(["a", "b", "d"]);
  });

  it("saves participants in order with combined roles", () => {
    const payload = toPayload([
      row("a", { captain: true, keeper: true }),
      row("b", { vice: true }),
      row("c"),
    ]);
    expect(payload).toEqual([
      { order: 1, participantId: "a", role: "C/WK" },
      { order: 2, participantId: "b", role: "VC" },
      { order: 3, participantId: "c" },
    ]);
  });
});
