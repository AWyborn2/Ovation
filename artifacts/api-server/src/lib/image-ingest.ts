import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import sharp from "sharp";
import exifr from "exifr";

/**
 * Library photo ingest (KTD7): whatever the club uploads — JPEG, PNG, WebP or
 * an iPhone HEIC — becomes an upright JPEG capped at MAX_WIDTH, with EXIF
 * (including GPS) stripped, plus a thumbnail. HEIC is decoded in a worker
 * thread; everything else goes straight to sharp.
 */
export const MAX_INGEST_BYTES = 25 * 1024 * 1024;
export const MAX_INGEST_BATCH = 50;
export const MAX_CONCURRENT_PER_TENANT = 2;
export const MAX_WIDTH = 2048;
export const THUMB_WIDTH = 480;

export type ImageKind = "jpeg" | "png" | "webp" | "heic" | "avif" | "unknown";

const HEIF_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"]);

/** Sniff the real format from the bytes; upload content types are not trusted. */
export function detectImageKind(data: Buffer): ImageKind {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "jpeg";
  if (
    data.length >= 8 &&
    data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "png";
  if (
    data.length >= 12 &&
    data.subarray(0, 4).toString("ascii") === "RIFF" &&
    data.subarray(8, 12).toString("ascii") === "WEBP"
  )
    return "webp";
  if (data.length >= 12 && data.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = data.subarray(8, 12).toString("ascii");
    if (brand === "avif" || brand === "avis") return "avif";
    if (HEIF_BRANDS.has(brand)) return "heic";
  }
  return "unknown";
}

export type IngestedImage = {
  jpeg: Buffer;
  thumb: Buffer;
  width: number;
  height: number;
  takenAt: Date | null;
};

export class IngestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IngestError";
  }
}

/** Convert one uploaded image. Throws IngestError with a user-facing message. */
export async function ingestImage(data: Buffer): Promise<IngestedImage> {
  if (data.length > MAX_INGEST_BYTES) {
    throw new IngestError(`File is larger than ${MAX_INGEST_BYTES / 1024 / 1024} MB.`);
  }
  const kind = detectImageKind(data);
  if (kind === "unknown") {
    throw new IngestError("Not a supported image (JPEG, PNG, WebP or HEIC).");
  }

  const takenAt = await readTakenAt(data);
  let source = data;
  if (kind === "heic") {
    try {
      source = await decodeHeic(data);
    } catch {
      throw new IngestError("This HEIC photo could not be read.");
    }
  }

  try {
    // rotate() applies the EXIF orientation; sharp writes no metadata unless
    // asked, so EXIF (GPS included) is dropped from both outputs.
    const main = await sharp(source)
      .rotate()
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer({ resolveWithObject: true });
    const thumb = await sharp(main.data)
      .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: 75 })
      .toBuffer();
    return {
      jpeg: main.data,
      thumb,
      width: main.info.width,
      height: main.info.height,
      takenAt,
    };
  } catch {
    throw new IngestError("This image could not be processed.");
  }
}

async function readTakenAt(data: Buffer): Promise<Date | null> {
  try {
    const tags = (await exifr.parse(data, { pick: ["DateTimeOriginal", "CreateDate"] })) as
      { DateTimeOriginal?: Date; CreateDate?: Date } | undefined;
    const d = tags?.DateTimeOriginal ?? tags?.CreateDate;
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
  } catch {
    return null;
  }
}

/**
 * The built worker sits beside the bundled server (`dist/image-ingest.worker.mjs`).
 * Under tsx/vitest there is no built file, so decoding runs in-process — the
 * same code, just on the calling thread.
 */
function builtWorkerPath(): string | null {
  const path = fileURLToPath(new URL("./image-ingest.worker.mjs", import.meta.url));
  return existsSync(path) ? path : null;
}

async function decodeHeic(data: Buffer): Promise<Buffer> {
  const workerPath = builtWorkerPath();
  if (!workerPath) {
    const { default: convert } = await import("heic-convert");
    return Buffer.from(await convert({ buffer: data, format: "JPEG", quality: 0.92 }));
  }
  return new Promise<Buffer>((resolve, reject) => {
    const worker = new Worker(workerPath, { workerData: new Uint8Array(data) });
    worker.once("message", (msg: { ok: boolean; output?: Uint8Array; error?: string }) => {
      void worker.terminate();
      if (msg.ok && msg.output) resolve(Buffer.from(msg.output));
      else reject(new Error(msg.error ?? "HEIC decode failed"));
    });
    worker.once("error", (err) => {
      void worker.terminate();
      reject(err);
    });
  });
}

/**
 * At most MAX_CONCURRENT_PER_TENANT conversions run at once per tenant, so
 * one club's big upload can't monopolise the server.
 */
const running = new Map<number, number>();
const waiting = new Map<number, Array<() => void>>();

export async function withTenantSlot<T>(tenantId: number, fn: () => Promise<T>): Promise<T> {
  if ((running.get(tenantId) ?? 0) >= MAX_CONCURRENT_PER_TENANT) {
    // Wait for a finishing job to hand its slot over (the count stays put, so
    // a newcomer can't slip in between the release and this job starting).
    await new Promise<void>((resolve) => {
      const queue = waiting.get(tenantId) ?? [];
      queue.push(resolve);
      waiting.set(tenantId, queue);
    });
  } else {
    running.set(tenantId, (running.get(tenantId) ?? 0) + 1);
  }
  try {
    return await fn();
  } finally {
    const queue = waiting.get(tenantId);
    const next = queue?.shift();
    if (queue && queue.length === 0) waiting.delete(tenantId);
    if (next) {
      next();
    } else {
      const left = (running.get(tenantId) ?? 1) - 1;
      if (left === 0) running.delete(tenantId);
      else running.set(tenantId, left);
    }
  }
}
