/**
 * Social Studio automation U6 — library photo ingest: format sniffing,
 * orientation, EXIF/GPS stripping, width cap, per-file failures and the
 * per-tenant concurrency cap. Pure unit tests (no DB, no object storage).
 */
import { describe, it, expect } from "vitest";
import sharp from "sharp";
import {
  IngestError,
  MAX_INGEST_BYTES,
  MAX_WIDTH,
  THUMB_WIDTH,
  detectImageKind,
  ingestImage,
  withTenantSlot,
} from "./image-ingest";

const solid = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: "#1b5e20" } });

/** A fake HEIC: a valid `ftyp heic` box header followed by garbage. */
function corruptHeic(): Buffer {
  const header = Buffer.alloc(12);
  header.writeUInt32BE(24, 0);
  header.write("ftypheic", 4, "ascii");
  return Buffer.concat([header, Buffer.alloc(2048, 7)]);
}

describe("detectImageKind", () => {
  it("sniffs formats from the bytes", async () => {
    expect(detectImageKind(await solid(4, 4).jpeg().toBuffer())).toBe("jpeg");
    expect(detectImageKind(await solid(4, 4).png().toBuffer())).toBe("png");
    expect(detectImageKind(await solid(4, 4).webp().toBuffer())).toBe("webp");
    expect(detectImageKind(corruptHeic())).toBe("heic");
    expect(detectImageKind(Buffer.from("hello world, not an image"))).toBe("unknown");
  });
});

describe("ingestImage", () => {
  it("applies EXIF orientation so the JPEG is upright, and writes no metadata", async () => {
    // 40×20 stored with orientation 6 (rotate 90° clockwise to view).
    const input = await solid(40, 20).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    expect((await sharp(input).metadata()).orientation).toBe(6);

    const out = await ingestImage(input);
    expect([out.width, out.height]).toEqual([20, 40]);
    const meta = await sharp(out.jpeg).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
  });

  it("strips GPS EXIF and keeps the capture time", async () => {
    const input = await solid(64, 48)
      .jpeg()
      .withExif({
        IFD2: { DateTimeOriginal: "2025:11:15 10:30:00" },
        IFD3: { GPSLatitudeRef: "S", GPSLongitudeRef: "E" },
      })
      .toBuffer();
    expect((await sharp(input).metadata()).exif).toBeDefined();

    const out = await ingestImage(input);
    expect((await sharp(out.jpeg).metadata()).exif).toBeUndefined();
    expect((await sharp(out.thumb).metadata()).exif).toBeUndefined();
    expect(out.takenAt?.getFullYear()).toBe(2025);
  });

  it("caps the width and makes a thumbnail", async () => {
    const out = await ingestImage(await solid(3000, 1500).png().toBuffer());
    expect(out.width).toBe(MAX_WIDTH);
    expect((await sharp(out.thumb).metadata()).width).toBe(THUMB_WIDTH);
  });

  it("a corrupt HEIC fails with a clear message", async () => {
    await expect(ingestImage(corruptHeic())).rejects.toThrow(IngestError);
    await expect(ingestImage(corruptHeic())).rejects.toThrow(/HEIC photo could not be read/);
  });

  it("rejects unknown formats and files over the size limit", async () => {
    await expect(ingestImage(Buffer.from("not an image at all"))).rejects.toThrow(/supported/);
    await expect(ingestImage(Buffer.alloc(MAX_INGEST_BYTES + 1))).rejects.toThrow(/larger than 25/);
  });
});

describe("withTenantSlot", () => {
  it("runs at most two conversions at once per tenant", async () => {
    let active = 0;
    let peak = 0;
    const job = () =>
      withTenantSlot(7, async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 10));
        active--;
      });
    const other = withTenantSlot(8, async () => {
      // Another tenant is never blocked by tenant 7's queue.
      expect(active).toBeLessThanOrEqual(2);
    });
    await Promise.all([job(), job(), job(), job(), job(), other]);
    expect(peak).toBe(2);
  });
});
