import { describe, it, expect } from "vitest";
import { compressImage, encodePreferWebp, fitWithin } from "./compress-image";

describe("fitWithin", () => {
  it("downscales a 4000px photo to the max width, keeping aspect", () => {
    expect(fitWithin(4000, 3000, 2000)).toEqual({ width: 2000, height: 1500 });
  });

  it("never upscales an image already narrower than the max", () => {
    expect(fitWithin(600, 400, 2000)).toEqual({ width: 600, height: 400 });
  });
});

describe("encodePreferWebp", () => {
  it("returns the WebP blob when the browser encodes WebP", async () => {
    const out = await encodePreferWebp(async (type) => new Blob(["x"], { type }));
    expect(out.type).toBe("image/webp");
  });

  it("re-encodes as JPEG when the encoder ignores WebP and returns PNG (Safari)", async () => {
    const calls: string[] = [];
    const out = await encodePreferWebp(async (type) => {
      calls.push(type);
      return new Blob(["x"], { type: type === "image/webp" ? "image/png" : type });
    });
    expect(calls).toEqual(["image/webp", "image/jpeg"]);
    expect(out.type).toBe("image/jpeg");
  });

  it("throws when nothing can be encoded", async () => {
    await expect(encodePreferWebp(async () => null)).rejects.toThrow();
  });
});

describe("compressImage", () => {
  it("rejects a non-image file", async () => {
    const file = new File(["%PDF"], "doc.pdf", { type: "application/pdf" });
    await expect(compressImage(file, 2000)).rejects.toThrow(/image file/);
  });
});
