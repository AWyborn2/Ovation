/**
 * Client-side downscale for admin image uploads (Broadcast hero / explore
 * photos). Club photos arrive as multi-megabyte camera originals; there is no
 * server image pipeline, so we resize in the browser before the presigned
 * upload: WebP at ≤ `maxWidth`, falling back to JPEG where the browser's canvas
 * encoder silently ignores WebP (Safari returns PNG instead).
 */

/** Widths the Broadcast layouts need: heroes span the viewport, cards ~⅓. */
export const HERO_MAX_WIDTH = 2000;
export const CARD_MAX_WIDTH = 1000;

const WEBP_QUALITY = 0.82;
const JPEG_QUALITY = 0.82;

/** Scale (w, h) down to fit `maxWidth`, never upscaling. */
export function fitWithin(
  width: number,
  height: number,
  maxWidth: number,
): { width: number; height: number } {
  if (width <= maxWidth) return { width, height };
  const scale = maxWidth / width;
  return { width: maxWidth, height: Math.round(height * scale) };
}

/** Encodes a drawn canvas to a blob of (roughly) the requested type. */
export type CanvasEncoder = (type: string, quality: number) => Promise<Blob | null>;

/**
 * Encode as WebP, re-encoding as JPEG when the encoder returned something else
 * (a browser without a WebP encoder hands back PNG, which is far larger).
 */
export async function encodePreferWebp(encode: CanvasEncoder): Promise<Blob> {
  const webp = await encode("image/webp", WEBP_QUALITY);
  if (webp && webp.type === "image/webp") return webp;
  const jpeg = await encode("image/jpeg", JPEG_QUALITY);
  if (jpeg) return jpeg;
  throw new Error("Could not encode the image");
}

function renameFor(name: string, type: string): string {
  const ext = type === "image/webp" ? "webp" : "jpg";
  return `${name.replace(/\.[^.]+$/, "") || "image"}.${ext}`;
}

/**
 * Downscale an image file to `maxWidth` and re-encode it (WebP, JPEG fallback).
 * Rejects non-image files. Images already narrower than `maxWidth` are still
 * re-encoded (stripping camera metadata) but never upscaled.
 */
export async function compressImage(file: File, maxWidth: number): Promise<File> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file (JPEG, PNG or WebP).");
  }
  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, maxWidth);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not process the image");
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await encodePreferWebp(
      (type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality)),
    );
    return new File([blob], renameFor(file.name, blob.type), { type: blob.type });
  } finally {
    bitmap.close();
  }
}
