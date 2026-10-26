import { describe, it, expect } from "vitest";
import { dropIndex, duplicateItem, moveItem, rotationItemKind } from "./rotation-list";

describe("rotation list helpers (kiosk redesign B2)", () => {
  it("types each sequence token", () => {
    expect(rotationItemKind("premierships")).toBe("board");
    expect(rotationItemKind("sponsor")).toBe("sponsor");
    expect(rotationItemKind("photos:abc")).toBe("photos");
    expect(rotationItemKind("ad:123")).toBe("ad");
  });

  it("moves an item to a new index, clamped to the list", () => {
    expect(moveItem(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveItem(["a", "b", "c", "d"], 3, 0)).toEqual(["d", "a", "b", "c"]);
    expect(moveItem(["a", "b", "c"], 1, 9)).toEqual(["a", "c", "b"]);
    expect(moveItem(["a", "b"], 5, 0)).toEqual(["a", "b"]);
  });

  it("duplicates an item straight after itself", () => {
    expect(duplicateItem(["a", "sponsor", "b"], 1)).toEqual(["a", "sponsor", "sponsor", "b"]);
  });

  it("works out where a dragged row lands", () => {
    // Dragging row 0 onto the bottom half of row 2 lands it at index 2.
    expect(dropIndex(0, 2, true)).toBe(2);
    // ...and onto the top half of row 2, at index 1.
    expect(dropIndex(0, 2, false)).toBe(1);
    // Dragging row 3 onto the top half of row 0 lands it first.
    expect(dropIndex(3, 0, false)).toBe(0);
    expect(dropIndex(3, 1, true)).toBe(2);
  });
});
