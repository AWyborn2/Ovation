import { describe, it, expect } from "vitest";
import {
  focusFit,
  focusTransform,
  frameShapeOf,
  normaliseFocusBox,
  photoShapeFit,
  shapeFit,
  FOCUS_ZOOM_MAX,
  type PhotoFocus,
} from "./photo-focus";

/**
 * The part of the photo a renderer shows for a transform, as the CSS does it:
 * `object-fit: cover` at `object-position: focal`, then `scale(zoom)` about the
 * same point.
 */
function visibleWindow(
  focus: PhotoFocus,
  frameAspect: number,
  t: ReturnType<typeof focusTransform>,
) {
  const photoAspect = focus.width / focus.height;
  const vx = photoAspect > frameAspect ? frameAspect / photoAspect : 1;
  const vy = photoAspect > frameAspect ? 1 : photoAspect / frameAspect;
  const wx = vx / t.zoom;
  const wy = vy / t.zoom;
  return {
    x0: t.focalX * (1 - wx),
    x1: t.focalX * (1 - wx) + wx,
    y0: t.focalY * (1 - wy),
    y1: t.focalY * (1 - wy) + wy,
  };
}

const landscape = (box: PhotoFocus["box"]): PhotoFocus => ({ box, width: 3000, height: 2000 });

describe("focusTransform", () => {
  it("keeps a face at the left of a wide photo in a tall frame", () => {
    const focus = landscape({ x: 0.1, y: 0.2, w: 0.15, h: 0.3 });
    const t = focusTransform(focus, 4 / 5);
    const win = visibleWindow(focus, 4 / 5, t);
    expect(win.x0).toBeLessThanOrEqual(0.1 + 1e-6);
    expect(win.x1).toBeGreaterThanOrEqual(0.25 - 1e-6);
    expect(win.y0).toBeLessThanOrEqual(0.2 + 1e-6);
    expect(win.y1).toBeGreaterThanOrEqual(0.5 - 1e-6);
    expect(t.zoom).toBeGreaterThan(1);
  });

  it("keeps every box in view in every common frame when it can fit", () => {
    const boxes = [
      { x: 0.4, y: 0.1, w: 0.2, h: 0.4 },
      { x: 0.7, y: 0.6, w: 0.25, h: 0.35 },
      { x: 0, y: 0, w: 0.3, h: 0.3 },
    ];
    for (const box of boxes) {
      for (const aspect of [9 / 16, 4 / 5, 1, 16 / 9, 1200 / 630]) {
        const focus = landscape(box);
        if (focusFit(focus, aspect) !== "good") continue;
        const win = visibleWindow(focus, aspect, focusTransform(focus, aspect));
        expect(win.x0).toBeLessThanOrEqual(box.x + 0.002);
        expect(win.x1).toBeGreaterThanOrEqual(box.x + box.w - 0.002);
        expect(win.y0).toBeLessThanOrEqual(box.y + 0.002);
        expect(win.y1).toBeGreaterThanOrEqual(box.y + box.h - 0.002);
      }
    }
  });

  it("centres a box too big for the frame at zoom 1", () => {
    const focus = landscape({ x: 0.05, y: 0.1, w: 0.9, h: 0.8 });
    const t = focusTransform(focus, 9 / 16);
    expect(t.zoom).toBe(1);
    expect(t.focalX).toBeCloseTo(0.5, 2);
  });

  it("never zooms past the cap for a tiny box", () => {
    const t = focusTransform(landscape({ x: 0.5, y: 0.5, w: 0.02, h: 0.02 }), 1);
    expect(t.zoom).toBe(FOCUS_ZOOM_MAX);
  });

  it("gives the plain centred crop for a whole-photo box", () => {
    expect(focusTransform(landscape({ x: 0, y: 0, w: 1, h: 1 }), 3 / 2)).toEqual({
      focalX: 0.5,
      focalY: 0.5,
      zoom: 1,
    });
  });
});

describe("fit", () => {
  it("rates a wide group box against tall and wide frames", () => {
    const group = landscape({ x: 0.05, y: 0.3, w: 0.9, h: 0.4 });
    expect(shapeFit(group, "wide")).toBe("good");
    expect(shapeFit(group, "tall")).toBe("none");
    expect(focusFit(group, 16 / 9)).toBe("good");
  });

  it("rates a single player box as good everywhere", () => {
    const solo = landscape({ x: 0.45, y: 0.2, w: 0.12, h: 0.5 });
    for (const shape of ["tall", "square", "wide"] as const)
      expect(shapeFit(solo, shape)).toBe("good");
  });

  it("lets a switched-off shape win and treats no box as good", () => {
    const photo = { width: 3000, height: 2000, focusBox: null, offShapes: ["tall"] };
    expect(photoShapeFit(photo, "tall")).toBe("none");
    expect(photoShapeFit(photo, "wide")).toBe("good");
  });

  it("names frame shapes by aspect", () => {
    expect(frameShapeOf(9 / 16)).toBe("tall");
    expect(frameShapeOf(4 / 5)).toBe("tall");
    expect(frameShapeOf(1)).toBe("square");
    expect(frameShapeOf(1200 / 630)).toBe("wide");
  });
});

describe("normaliseFocusBox", () => {
  it("clamps to the photo and rejects junk", () => {
    expect(normaliseFocusBox({ x: -0.1, y: 0.5, w: 0.5, h: 0.9 })).toEqual({
      x: 0,
      y: 0.5,
      w: 0.5,
      h: 0.5,
    });
    expect(normaliseFocusBox({ x: 0.2, y: 0.2, w: 0.001, h: 0.5 })).toBeNull();
    expect(normaliseFocusBox({ x: "a" })).toBeNull();
    expect(normaliseFocusBox(null)).toBeNull();
  });
});
