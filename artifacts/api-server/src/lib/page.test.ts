import { describe, it, expect } from "vitest";
import { page } from "./page";

/** Pure unit test — no database, so it runs locally as well as in CI. */

const rows = [1, 2, 3, 4, 5];

describe("page", () => {
  it("returns the list untouched when no params are given", () => {
    // This is the backward-compatibility guarantee: existing web and mobile
    // callers send neither param and must keep getting the whole grade.
    expect(page(rows)).toEqual(rows);
  });

  it("applies limit alone", () => {
    expect(page(rows, 2)).toEqual([1, 2]);
  });

  it("applies offset alone", () => {
    expect(page(rows, undefined, 2)).toEqual([3, 4, 5]);
  });

  it("applies limit and offset together", () => {
    expect(page(rows, 2, 1)).toEqual([2, 3]);
  });

  it("does not wrap or throw when the window runs past the end", () => {
    expect(page(rows, 10, 3)).toEqual([4, 5]);
    expect(page(rows, 5, 99)).toEqual([]);
  });

  it("handles an empty list", () => {
    expect(page([], 5, 0)).toEqual([]);
  });
});
