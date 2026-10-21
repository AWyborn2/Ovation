import { describe, it, expect } from "vitest";
import { MAX_FOCUS, pruneFocus, toggleFocus } from "./use-hub-view";

describe("toggleFocus", () => {
  it("adds a grade, and past the max drops the one focused longest ago", () => {
    expect(toggleFocus([1], 2)).toEqual([1, 2]);
    expect(toggleFocus([1, 2, 3], 4)).toEqual([2, 3, 4]);
    expect(MAX_FOCUS).toBe(3);
  });

  it("removes a grade but never the last one", () => {
    expect(toggleFocus([1, 2], 1)).toEqual([2]);
    expect(toggleFocus([2], 2)).toEqual([2]);
  });

  it("respects a smaller max", () => {
    expect(toggleFocus([1], 2, 1)).toEqual([2]);
  });
});

describe("pruneFocus", () => {
  it("keeps the focused sides that still exist, in grade order", () => {
    expect(pruneFocus([3, 1, 9], [1, 2, 3], 3)).toEqual([1, 3]);
  });

  it("falls back to the first sides when none are left", () => {
    expect(pruneFocus([9], [1, 2, 3, 4], 3)).toEqual([1, 2, 3]);
    expect(pruneFocus([], [1, 2, 3], 1)).toEqual([1]);
    expect(pruneFocus([], [], 3)).toEqual([]);
  });
});
