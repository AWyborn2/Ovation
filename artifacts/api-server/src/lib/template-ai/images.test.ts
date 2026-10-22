/** Reference images for the AI designer (T7.9): uploads only, downscaled, EXIF stripped. */
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  MAX_REFERENCE_BYTES,
  prepareReferenceImage,
  REFERENCE_LONG_EDGE,
  sniffImageType,
} from "./images";

const jpegWithExif = () =>
  sharp({ create: { width: 3000, height: 1200, channels: 3, background: "#204080" } })
    .jpeg()
    .withExif({ IFD0: { Copyright: "Junior photo, do not share", Artist: "Club photographer" } })
    .toBuffer();

describe("prepareReferenceImage", () => {
  it("downscales to a 1,568 px long edge and drops EXIF", async () => {
    const input = await jpegWithExif();
    expect((await sharp(input).metadata()).exif).toBeTruthy();
    const out = await prepareReferenceImage(input);
    expect(out.image.mediaType).toBe("image/jpeg");
    expect([out.width, out.height]).toEqual([REFERENCE_LONG_EDGE, 627]);
    const sent = Buffer.from(out.image.data, "base64");
    expect((await sharp(sent).metadata()).exif).toBeUndefined();
    expect(sent.toString("latin1")).not.toContain("Junior photo");
    expect(out.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("keeps a small PNG's size", async () => {
    const png = await sharp({
      create: { width: 400, height: 300, channels: 4, background: "#ffffff00" },
    })
      .png()
      .toBuffer();
    const out = await prepareReferenceImage(png);
    expect(out.image.mediaType).toBe("image/png");
    expect([out.width, out.height]).toEqual([400, 300]);
  });

  it("refuses anything that isn't a PNG or JPEG by its bytes, an empty file and a large one", async () => {
    const gif = Buffer.from("GIF89a\x01\x00\x01\x00", "latin1");
    expect(sniffImageType(gif)).toBeNull();
    await expect(prepareReferenceImage(gif)).rejects.toThrow("Upload a PNG or JPEG image.");
    await expect(prepareReferenceImage(Buffer.alloc(0))).rejects.toThrow("empty");
    const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(MAX_REFERENCE_BYTES)]);
    await expect(prepareReferenceImage(big)).rejects.toThrow("at most 5 MB");
    const fake = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from("not really a jpeg")]);
    await expect(prepareReferenceImage(fake)).rejects.toThrow("couldn't be read");
  });
});
