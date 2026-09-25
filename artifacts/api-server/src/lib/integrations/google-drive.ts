import { env } from "../../config";
import { MAX_INGEST_BYTES } from "../image-ingest";

/**
 * Google Drive photo import (Photo library). The admin picks files in the
 * Google Picker under the drive.file scope, so this app can only read the
 * files they chose. The browser hands over the picker's short-lived access
 * token for one request; it is used to download those files and is never
 * stored or logged.
 */

export type GoogleDriveConfig = { clientId: string; apiKey: string; appId: string };

/** The picker settings, or null when Drive import isn't configured (hidden). */
export function googleDriveConfig(): GoogleDriveConfig | null {
  const clientId = env.GOOGLE_DRIVE_CLIENT_ID();
  const apiKey = env.GOOGLE_DRIVE_API_KEY();
  const appId = env.GOOGLE_DRIVE_APP_ID();
  return clientId && apiKey && appId ? { clientId, apiKey, appId } : null;
}

export class DriveFileError extends Error {}

/** Drive file ids are URL-safe base64-ish; anything else never reaches a URL. */
export const isDriveFileId = (id: string): boolean => /^[A-Za-z0-9_-]{10,200}$/.test(id);

const DRIVE_FILES = "https://www.googleapis.com/drive/v3/files";

/**
 * Download one picked file. Refuses non-images and anything over the library's
 * 25 MB limit before fetching the bytes.
 */
export async function downloadDriveFile(
  fileId: string,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ name: string; mimeType: string; data: Buffer }> {
  if (!isDriveFileId(fileId)) throw new DriveFileError("That isn't a Google Drive file.");
  const headers = { Authorization: `Bearer ${accessToken}` };

  const metaRes = await fetchImpl(
    `${DRIVE_FILES}/${fileId}?fields=name,mimeType,size&supportsAllDrives=true`,
    { headers },
  );
  if (metaRes.status === 401) throw new DriveFileError("Google sign-in expired. Try again.");
  if (!metaRes.ok) throw new DriveFileError("Couldn't open that file in Google Drive.");
  const meta = (await metaRes.json()) as { name?: string; mimeType?: string; size?: string };
  const mimeType = meta.mimeType ?? "";
  if (!mimeType.startsWith("image/")) throw new DriveFileError("Only photos can be imported.");
  if (Number(meta.size ?? 0) > MAX_INGEST_BYTES)
    throw new DriveFileError("That photo is over 25 MB.");

  const fileRes = await fetchImpl(`${DRIVE_FILES}/${fileId}?alt=media&supportsAllDrives=true`, {
    headers,
  });
  if (!fileRes.ok) throw new DriveFileError("Couldn't download that file from Google Drive.");
  const data = Buffer.from(await fileRes.arrayBuffer());
  if (data.length > MAX_INGEST_BYTES) throw new DriveFileError("That photo is over 25 MB.");
  return { name: meta.name ?? fileId, mimeType, data };
}
