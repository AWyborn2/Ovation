import { describe, expect, it } from "vitest";
import { hasLayoutWarnings, mergeRenderedWarnings, warningsCoverSizes } from "./warnings";

const overflow = { reason: "overflow" as const, size: "square" as const, layerId: "name" };

describe("layout warnings", () => {
  it("replaces only the sizes just rendered", () => {
    const merged = mergeRenderedWarnings({ square: [overflow], story: [] }, { square: [] });
    expect(merged).toEqual({ square: [], story: [] });
  });

  it("detects any warning across sizes", () => {
    expect(hasLayoutWarnings({ square: [], story: [] })).toBe(false);
    expect(hasLayoutWarnings({ square: [overflow] })).toBe(true);
    expect(hasLayoutWarnings(null)).toBe(false);
  });

  it("knows whether every size has been checked", () => {
    expect(warningsCoverSizes({ square: [], story: [] }, ["square", "story"])).toBe(true);
    expect(warningsCoverSizes({ square: [] }, ["square", "story"])).toBe(false);
    expect(warningsCoverSizes(undefined, ["square"])).toBe(false);
  });
});
