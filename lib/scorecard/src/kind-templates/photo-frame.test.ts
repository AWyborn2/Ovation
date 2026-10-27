import { describe, expect, it } from "vitest";
import { photoFrameAspect } from "./photo-frame";

describe("photoFrameAspect", () => {
  const doc = {
    formatVersion: 2,
    pages: {
      card: {
        layers: [
          { id: "small", kind: "photo", geometry: { square: { x: 0, y: 0, w: 10, h: 10 } } },
          {
            id: "g",
            kind: "group",
            geometry: { square: { x: 0, y: 0, w: 50, h: 100 } },
            children: [
              { id: "big", kind: "photo", geometry: { square: { x: 0, y: 0, w: 100, h: 80 } } },
            ],
          },
        ],
      },
    },
  };

  it("measures the largest photo frame through its groups", () => {
    // 50% x 100% of 1080, then 100% x 80% of that: 540 x 864.
    expect(photoFrameAspect(doc, "player", "square")).toBeCloseTo(540 / 864, 5);
  });

  it("is null when the design draws no photo", () => {
    expect(
      photoFrameAspect({ formatVersion: 2, pages: { card: { layers: [] } } }, "player", "square"),
    ).toBeNull();
    expect(photoFrameAspect(null, "player", "square")).toBeNull();
  });
});
