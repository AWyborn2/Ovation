import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import { db, clubPhotosTable, clubPhotoPlayersTable, type ClubPhotoRow } from "@workspace/db";
import { env } from "../../config";
import { nonSeniorPlayerIds } from "../club-photo-library";
import { detectImageKind, THUMB_WIDTH } from "../image-ingest";
import { photoStore } from "../photo-store";

/**
 * Background removal for club-library photos (Social Studio U19, R21; KTD14,
 * KTD15), through Photoroom's segmentation API. Off when PHOTOROOM_API_KEY is
 * missing — the routes then 404 and the editor hides the tool.
 *
 * Two layers:
 *  - `removeBackground(image)` is the provider boundary: image bytes in, cut-out
 *    PNG bytes out. Only the image itself is sent — no file name, player,
 *    tenant or other personal data.
 *  - `cutOutLibraryPhoto(tenantId, photoId)` is the only entry point the app
 *    uses. It accepts a photo id from this club's senior library and refuses
 *    anything else BEFORE any external call: a photo outside the library, or
 *    one tagged with anyone who is not a senior player of the club (a junior
 *    participant or a fill-in), never leaves the server. The cut-out is stored
 *    in the library as a derived PNG linked to its source; the source photo is
 *    never changed.
 */
export const PHOTOROOM_SEGMENT_URL = "https://sdk.photoroom.com/v1/segment";
const PROVIDER_TIMEOUT_MS = 60_000;

export function backgroundRemovalEnabled(): boolean {
  return !!env.PHOTOROOM_API_KEY();
}

export class BackgroundRemovalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackgroundRemovalError";
  }
}

/** Send one image to Photoroom and return the cut-out PNG. Throws BackgroundRemovalError. */
export async function removeBackground(image: Buffer): Promise<Buffer> {
  const apiKey = env.PHOTOROOM_API_KEY();
  if (!apiKey) throw new BackgroundRemovalError("Background removal is not configured.");
  const form = new FormData();
  // A generic file name: nothing identifying leaves the server with the image.
  const isPng = detectImageKind(image) === "png";
  form.append(
    "image_file",
    new Blob([new Uint8Array(image)], { type: isPng ? "image/png" : "image/jpeg" }),
    isPng ? "photo.png" : "photo.jpg",
  );
  form.append("format", "png");
  let res: Response;
  try {
    res = await fetch(PHOTOROOM_SEGMENT_URL, {
      method: "POST",
      headers: { "x-api-key": apiKey, Accept: "image/png" },
      body: form,
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
  } catch {
    throw new BackgroundRemovalError("The background removal service could not be reached.");
  }
  if (!res.ok) {
    throw new BackgroundRemovalError(
      `The background removal service could not process this photo (${res.status}).`,
    );
  }
  const out = Buffer.from(await res.arrayBuffer());
  if (detectImageKind(out) !== "png") {
    throw new BackgroundRemovalError("The background removal service returned an unexpected file.");
  }
  return out;
}

export type CutOutResult =
  | { ok: true; photo: ClubPhotoRow }
  | {
      ok: false;
      reason: "disabled" | "not_found" | "not_senior" | "provider";
      message: string;
    };

/**
 * Cut the background out of one of this club's library photos and store the
 * result as a new library photo (PNG with transparency) linked to the source.
 */
export async function cutOutLibraryPhoto(tenantId: number, photoId: number): Promise<CutOutResult> {
  if (!backgroundRemovalEnabled()) {
    return { ok: false, reason: "disabled", message: "Background removal is not configured." };
  }
  const [source] = await db
    .select()
    .from(clubPhotosTable)
    .where(and(eq(clubPhotosTable.tenantId, tenantId), eq(clubPhotosTable.id, photoId)));
  if (!source) {
    return { ok: false, reason: "not_found", message: "That photo is not in the club library." };
  }
  const tags = await db
    .select({ playerId: clubPhotoPlayersTable.playerId })
    .from(clubPhotoPlayersTable)
    .where(
      and(eq(clubPhotoPlayersTable.tenantId, tenantId), eq(clubPhotoPlayersTable.photoId, photoId)),
    );
  const tagged = tags.map((t) => t.playerId);
  if ((await nonSeniorPlayerIds(tenantId, tagged)).length > 0) {
    return {
      ok: false,
      reason: "not_senior",
      message: "Only photos of senior players can have their background removed.",
    };
  }

  const store = photoStore();
  let cutOut: Buffer;
  try {
    cutOut = await removeBackground(await store.read(source.objectPath));
  } catch (err) {
    return {
      ok: false,
      reason: "provider",
      message:
        err instanceof BackgroundRemovalError
          ? err.message
          : "The background removal service could not process this photo.",
    };
  }

  let png: { data: Buffer; width: number; height: number };
  let thumb: Buffer;
  try {
    // Re-encode through sharp: guarantees an alpha channel and drops any
    // metadata the provider added.
    const main = await sharp(cutOut).ensureAlpha().png().toBuffer({ resolveWithObject: true });
    png = { data: main.data, width: main.info.width, height: main.info.height };
    thumb = await sharp(main.data)
      .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
      .png()
      .toBuffer();
  } catch {
    return {
      ok: false,
      reason: "provider",
      message: "The background removal service returned an unreadable image.",
    };
  }

  const objectPath = await store.write(png.data, "image/png");
  const thumbPath = await store.write(thumb, "image/png");
  const row = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(clubPhotosTable)
      .values({
        tenantId,
        objectPath,
        thumbPath,
        width: png.width,
        height: png.height,
        season: source.season,
        grade: source.grade,
        takenAt: source.takenAt,
        photoTypes: source.photoTypes,
        sourcePhotoId: source.id,
      })
      .returning();
    if (tagged.length > 0) {
      await tx
        .insert(clubPhotoPlayersTable)
        .values(tagged.map((playerId) => ({ tenantId, photoId: inserted.id, playerId })))
        .onConflictDoNothing();
    }
    return inserted;
  });
  return { ok: true, photo: row };
}
