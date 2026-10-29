import { describe, expect, it } from "vitest";
import { MAJOR_TILE_SCALE, TILE_ASPECT, tileGrid, type TileRect } from "./tile-grid";

const box = { width: 950, height: 540, gap: 12, maxTileHeight: 150 };
const inside = (t: TileRect) =>
  t.x >= -1e-6 && t.y >= -1e-6 && t.x + t.w <= box.width + 1e-6 && t.y + t.h <= box.height + 1e-6;
const apart = (a: TileRect, b: TileRect) =>
  a.x + a.w <= b.x + 1e-6 ||
  b.x + b.w <= a.x + 1e-6 ||
  a.y + a.h <= b.y + 1e-6 ||
  b.y + b.h <= a.y + 1e-6;

function check(tiles: TileRect[]) {
  for (const t of tiles) {
    expect(inside(t)).toBe(true);
    expect(t.w / t.h).toBeCloseTo(TILE_ASPECT);
  }
  for (let i = 0; i < tiles.length; i++)
    for (let j = i + 1; j < tiles.length; j++) expect(apart(tiles[i]!, tiles[j]!)).toBe(true);
}

describe("tileGrid (sponsors page tiles)", () => {
  it("places nothing for no tiles or no box", () => {
    expect(tileGrid({ ...box, count: 0, majors: 0 })).toEqual([]);
    expect(tileGrid({ ...box, width: 0, count: 3, majors: 0 })).toEqual([]);
  });

  it("one sponsor is one tile at the cap, centred in the box", () => {
    const [t] = tileGrid({ ...box, count: 1, majors: 0 });
    expect(t!.h).toBeCloseTo(box.maxTileHeight);
    expect(t!.x + t!.w / 2).toBeCloseTo(box.width / 2);
    expect(t!.y + t!.h / 2).toBeCloseTo(box.height / 2);
  });

  it("a few sponsors share one line rather than stacking", () => {
    const tiles = tileGrid({ ...box, count: 3, majors: 0 });
    check(tiles);
    expect(new Set(tiles.map((t) => t.y)).size).toBe(1);
  });

  it("majors are larger and come first, in lines of their own", () => {
    const tiles = tileGrid({ ...box, count: 12, majors: 3 });
    check(tiles);
    const majors = tiles.slice(0, 3);
    const rest = tiles.slice(3);
    for (const m of majors) expect(m.h).toBeCloseTo(rest[0]!.h * MAJOR_TILE_SCALE);
    expect(Math.max(...majors.map((m) => m.y + m.h))).toBeLessThanOrEqual(
      Math.min(...rest.map((r) => r.y)),
    );
  });

  it("fills the box better than the old fixed 3 + 9 slots", () => {
    // The old square slots: majors 17.8% wide, standard 11.1% (of 1080).
    const tiles = tileGrid({ ...box, count: 12, majors: 3 });
    expect(tiles[3]!.w).toBeGreaterThan(0.111 * 1080);
    expect(tiles[0]!.w).toBeGreaterThan(0.178 * 1080);
  });

  it("twenty sponsors all fit, lines no wider than the box", () => {
    for (const majors of [0, 3, 6]) check(tileGrid({ ...box, count: 20, majors }));
  });

  it("lines split evenly: six over two lines is three and three", () => {
    const tiles = tileGrid({
      width: 500,
      height: 600,
      gap: 10,
      maxTileHeight: 1000,
      count: 6,
      majors: 0,
    });
    const perLine = new Map<number, number>();
    for (const t of tiles) perLine.set(t.y, (perLine.get(t.y) ?? 0) + 1);
    expect(new Set(perLine.values()).size).toBe(1);
  });
});
