import { describe, it, expect } from "vitest";
import { slideFraming } from "./photo-slide";

const photo = (width: number, height: number, over: Record<string, unknown> = {}) => ({
  width,
  height,
  focusBox: null,
  noWideCrop: false,
  ...over,
});

describe("kiosk photo framing", () => {
  it("smart framing fills only a photo already close to the screen's shape", () => {
    // 16:9 and 1.85:1 lose almost nothing: fill.
    expect(slideFraming(photo(1920, 1080), "auto").mode).toBe("fill");
    expect(slideFraming(photo(1850, 1000), "auto").mode).toBe("fill");
    expect(slideFraming(photo(1200, 630), "auto").mode).toBe("fill");
    // 16:10 already loses 10%: whole.
    expect(slideFraming(photo(1600, 1000), "auto").mode).toBe("whole");
    // 3:2, 4:3, square and portrait would lose the top and bottom: whole.
    expect(slideFraming(photo(1500, 1000), "auto").mode).toBe("whole");
    expect(slideFraming(photo(1600, 1200), "auto").mode).toBe("whole");
    expect(slideFraming(photo(1000, 1000), "auto").mode).toBe("whole");
    expect(slideFraming(photo(1000, 1500), "auto").mode).toBe("whole");
    // An unknown size is shown whole rather than guessed.
    expect(slideFraming(photo(0, 0), "auto").mode).toBe("whole");
  });

  it("smart framing crops a 3:2 photo when its focus box fits, aimed at the box", () => {
    // A batter in the middle third of a 3:2 shot fits a 16:9 crop.
    const framing = slideFraming(
      photo(1500, 1000, { focusBox: { x: 0.3, y: 0.15, w: 0.3, h: 0.6 } }),
      "auto",
    );
    expect(framing.mode).toBe("fill");
    expect(framing.mode === "fill" && framing.transform.zoom).toBeGreaterThanOrEqual(1);
    // A box from the very top to the very bottom can't fit a wider crop: whole.
    expect(
      slideFraming(photo(1500, 1000, { focusBox: { x: 0.3, y: 0, w: 0.3, h: 1 } }), "auto").mode,
    ).toBe("whole");
  });

  it("'fill' always crops, aiming at the focus box; 'whole' never does", () => {
    expect(slideFraming(photo(1000, 1500), "fill")).toEqual({
      mode: "fill",
      transform: { focalX: 0.5, focalY: 0.5, zoom: 1 },
    });
    const aimed = slideFraming(
      photo(1000, 1500, { focusBox: { x: 0.2, y: 0.05, w: 0.5, h: 0.2 } }),
      "fill",
    );
    expect(aimed.mode === "fill" && aimed.transform.focalY).toBeLessThan(0.5);
    expect(slideFraming(photo(1920, 1080), "whole").mode).toBe("whole");
  });

  it("shows a photo whole when its wide crops are switched off", () => {
    expect(slideFraming(photo(1920, 1080, { noWideCrop: true }), "auto").mode).toBe("whole");
    expect(slideFraming(photo(1920, 1080, { noWideCrop: true }), "fill").mode).toBe("whole");
  });
});
