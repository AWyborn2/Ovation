/** Canvas photo placement: the focal point is a fraction of the travel, and zoom goes down to 0.5×. */
import { describe, expect, it } from "vitest";
import { drawImageCoverFocal } from "./draw-primitives";

// A 2000×1000 landscape photo drawn into a 1000×1000 square box.
const img = { width: 2000, height: 1000 } as HTMLImageElement;
const draw = (focalX: number, focalY: number, zoom: number) => {
  const calls: number[][] = [];
  const ctx = {
    drawImage: (...args: unknown[]) => calls.push((args.slice(1) as number[]).map(Math.round)),
  } as unknown as CanvasRenderingContext2D;
  drawImageCoverFocal(ctx, img, 0, 0, 1000, 1000, focalX, focalY, zoom);
  return calls[0];
};

describe("drawImageCoverFocal", () => {
  it("places the window by the fraction of the travel, like object-position", () => {
    // 1000 px of horizontal travel: 0 → left edge, 0.5 → centred, 1 → right edge.
    expect(draw(0, 0.5, 1)).toEqual([0, 0, 1000, 1000, 0, 0, 1000, 1000]);
    expect(draw(0.5, 0.5, 1)).toEqual([500, 0, 1000, 1000, 0, 0, 1000, 1000]);
    expect(draw(1, 0.5, 1)).toEqual([1000, 0, 1000, 1000, 0, 0, 1000, 1000]);
  });

  it("zoomed out, draws the whole photo smaller inside the box at the focal fraction", () => {
    // At 0.5× the window is 2000×2000: the photo fills the width and half the height.
    expect(draw(0.5, 0, 0.5)).toEqual([0, 0, 2000, 1000, 0, 0, 1000, 500]);
    expect(draw(0.5, 1, 0.5)).toEqual([0, 0, 2000, 1000, 0, 500, 1000, 500]);
    // Below 0.5× is held at 0.5×.
    expect(draw(0.5, 1, 0.1)).toEqual(draw(0.5, 1, 0.5));
  });
});
