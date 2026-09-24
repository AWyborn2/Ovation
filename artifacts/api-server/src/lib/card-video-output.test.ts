/**
 * Social Studio U18 — export outputs: MP4 stays H.264 for every platform, GIF
 * builds its own palette and loops, and export scale is held to 1–3×.
 */
import { describe, it, expect } from "vitest";
import { clampScale, ffmpegArgs } from "./card-video-renderer";

describe("ffmpegArgs", () => {
  it("MP4 is H.264 yuv420p with faststart, reading PNG frames at the clip rate", () => {
    const args = ffmpegArgs("mp4", 30, "/tmp/x.mp4");
    expect(args.slice(0, 7)).toEqual(["-y", "-f", "image2pipe", "-framerate", "30", "-i", "-"]);
    expect(args).toContain("libx264");
    expect(args).toContain("yuv420p");
    expect(args).toContain("+faststart");
    expect(args.at(-1)).toBe("/tmp/x.mp4");
  });

  it("GIF generates a palette from the clip and loops forever", () => {
    const args = ffmpegArgs("gif", 15, "/tmp/x.gif");
    const vf = args[args.indexOf("-vf") + 1];
    expect(vf).toContain("palettegen");
    expect(vf).toContain("paletteuse");
    expect(args[args.indexOf("-loop") + 1]).toBe("0");
    expect(args).not.toContain("libx264");
    expect(args.at(-1)).toBe("/tmp/x.gif");
  });
});

describe("clampScale", () => {
  it("defaults to 1× and holds to 1–3×", () => {
    expect(clampScale(undefined)).toBe(1);
    expect(clampScale(null)).toBe(1);
    expect(clampScale(Number.NaN)).toBe(1);
    expect(clampScale(0.5)).toBe(1);
    expect(clampScale(2)).toBe(2);
    expect(clampScale(9)).toBe(3);
  });
});
