import { describe, it, expect, vi } from "vitest";
import {
  faceScanTiles,
  mergeFaces,
  personBoxFromFace,
  suggestUploadFocus,
  unionBox,
} from "./face-suggestions";

describe("suggestUploadFocus", () => {
  it("saves a suggestion for each photo with faces and skips the rest", async () => {
    const box = { x: 0.2, y: 0.1, w: 0.3, h: 0.4 };
    const suggest = vi.fn(async (src: string) => {
      if (src === "/broken") throw new Error("unreadable");
      return src === "/faces" ? box : null;
    });
    const save = vi.fn(async () => ({}));
    const n = await suggestUploadFocus(
      [
        { id: 1, url: "/faces" },
        { id: 2, url: "/no-faces" },
        { id: 3, url: "/broken" },
        { id: 4, url: "/faces" },
      ],
      save,
      suggest,
    );
    expect(n).toBe(2);
    expect(save.mock.calls).toEqual([
      [1, box],
      [4, box],
    ]);
  });

  it("keeps going when a save fails", async () => {
    const box = { x: 0, y: 0, w: 0.5, h: 0.5 };
    const save = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({});
    const n = await suggestUploadFocus(
      [
        { id: 1, url: "/a" },
        { id: 2, url: "/b" },
      ],
      save,
      async () => box,
    );
    expect(n).toBe(1);
    expect(save).toHaveBeenCalledTimes(2);
  });
});

describe("the suggested box", () => {
  it("covers everyone found, head to about the waist", () => {
    const faces = [
      { x: 0.2, y: 0.2, w: 0.1, h: 0.1 },
      { x: 0.6, y: 0.25, w: 0.1, h: 0.1 },
    ];
    expect(unionBox(faces.map(personBoxFromFace))).toEqual({ x: 0.1, y: 0.15, w: 0.7, h: 0.5 });
  });
});

describe("faceScanTiles", () => {
  it("scans the whole photo, then overlapping squares a half and a quarter of the short side", () => {
    const tiles = faceScanTiles(3000, 2000);
    expect(tiles[0]).toEqual({ x: 0, y: 0, size: null });
    const halves = tiles.filter((t) => t.size === 1000);
    const quarters = tiles.filter((t) => t.size === 500);
    expect(halves.length).toBe(5 * 3);
    expect(quarters.length).toBe(11 * 7);
    // Every square sits inside the photo, and the last ones reach its far edges.
    for (const t of [...halves, ...quarters]) {
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.y).toBeGreaterThanOrEqual(0);
      expect(t.x + t.size!).toBeLessThanOrEqual(3000);
      expect(t.y + t.size!).toBeLessThanOrEqual(2000);
    }
    expect(Math.max(...quarters.map((t) => t.x + t.size!))).toBe(3000);
    expect(Math.max(...quarters.map((t) => t.y + t.size!))).toBe(2000);
  });

  it("covers every face up to half a square whole in some square", () => {
    const tiles = faceScanTiles(1200, 900).filter((t) => t.size === 225);
    for (let x = 0; x + 110 <= 1200; x += 37)
      for (let y = 0; y + 110 <= 900; y += 41)
        expect(
          tiles.some((t) => t.x <= x && t.y <= y && x + 110 <= t.x + 225 && y + 110 <= t.y + 225),
        ).toBe(true);
  });

  it("skips squares too small to read on a small photo", () => {
    expect(faceScanTiles(200, 150).every((t) => t.size === null || t.size >= 64)).toBe(true);
  });
});

describe("mergeFaces", () => {
  it("keeps one box per face, the most confident, across overlapping scans", () => {
    const merged = mergeFaces([
      { x: 100, y: 100, w: 50, h: 50, score: 0.8 },
      { x: 102, y: 98, w: 52, h: 51, score: 0.9 },
      // A cut-off view of the same face, mostly inside it.
      { x: 110, y: 110, w: 30, h: 30, score: 0.75 },
      { x: 400, y: 100, w: 50, h: 50, score: 0.85 },
    ]);
    expect(merged.map((f) => f.score)).toEqual([0.9, 0.85]);
  });
});
