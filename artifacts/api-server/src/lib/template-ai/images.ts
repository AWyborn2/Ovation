/**
 * Reference images for the AI designer (ADR-011 §8, T7.9).
 *
 * - Uploads only: a PNG or JPEG file the admin chose, at most 5 MB, checked
 *   by its bytes, not its name or claimed type. There is no way to pick a
 *   photo from a club's library (so junior photos can't be sent), and a
 *   request that names a library photo is refused by the route.
 * - Downscaled to a 1,568 px long edge (the model's useful maximum), turned
 *   upright from its EXIF orientation, and re-encoded, which drops EXIF and
 *   every other metadata block.
 * - Never stored: the job keeps only its SHA-256, in the logs.
 */
import { createHash } from "node:crypto";
import sharp, { type OutputInfo } from "sharp";
import type { ReferenceImage } from "./prompt";

export const MAX_REFERENCE_BYTES = 5 * 1024 * 1024;
export const REFERENCE_LONG_EDGE = 1568;

export class ReferenceImageError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = "ReferenceImageError";
  }
}

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];

/** The image type a buffer's leading bytes say it is, or null. */
export function sniffImageType(buf: Buffer): "image/png" | "image/jpeg" | null {
  const starts = (sig: number[]) => sig.every((b, i) => buf[i] === b);
  if (starts(PNG)) return "image/png";
  if (starts(JPEG)) return "image/jpeg";
  return null;
}

export type PreparedImage = {
  image: ReferenceImage;
  sha256: string;
  width: number;
  height: number;
};

/** An uploaded reference image made safe and small enough to send. */
export async function prepareReferenceImage(buf: Buffer): Promise<PreparedImage> {
  if (buf.length === 0) throw new ReferenceImageError("The image is empty.");
  if (buf.length > MAX_REFERENCE_BYTES)
    throw new ReferenceImageError("The image can be at most 5 MB.");
  const type = sniffImageType(buf);
  if (!type) throw new ReferenceImageError("Upload a PNG or JPEG image.");
  let out: { data: Buffer; info: OutputInfo };
  try {
    const pipeline = sharp(buf, { failOn: "error" }).rotate().resize({
      width: REFERENCE_LONG_EDGE,
      height: REFERENCE_LONG_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    });
    out = await (type === "image/png" ? pipeline.png() : pipeline.jpeg({ quality: 88 })).toBuffer({
      resolveWithObject: true,
    });
  } catch {
    throw new ReferenceImageError("That image couldn't be read.");
  }
  return {
    image: { mediaType: type, data: out.data.toString("base64") },
    sha256: createHash("sha256").update(buf).digest("hex"),
    width: out.info.width,
    height: out.info.height,
  };
}
