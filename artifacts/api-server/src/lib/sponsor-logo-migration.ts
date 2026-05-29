import type { Logger } from "pino";
import { eq } from "drizzle-orm";
import { db, sponsorsTable } from "@workspace/db";
import { ObjectStorageService } from "./objectStorage";

const objectStorage = new ObjectStorageService();

// data:<mime>[;base64],<payload>
const DATA_URL_RE = /^data:([^;,]*)(;base64)?,([\s\S]*)$/;

/**
 * Sponsor logos used to be stored as base64 data URLs in Postgres. This helper
 * lazily migrates any remaining data-URL logo to Replit Object Storage on read,
 * rewriting the DB row to point at the served object URL. Already-migrated rows
 * (anything not starting with "data:") are returned untouched.
 */
async function migrateSponsorLogoIfNeeded(
  sponsor: { id: number; logoUrl: string },
  log: Logger,
): Promise<string> {
  if (!sponsor.logoUrl.startsWith("data:")) return sponsor.logoUrl;

  try {
    const match = DATA_URL_RE.exec(sponsor.logoUrl);
    if (!match) return sponsor.logoUrl;

    const contentType = match[1] || "application/octet-stream";
    const isBase64 = Boolean(match[2]);
    const payload = match[3] ?? "";
    const buffer = isBase64
      ? Buffer.from(payload, "base64")
      : Buffer.from(decodeURIComponent(payload), "utf8");

    const uploadURL = await objectStorage.getObjectEntityUploadURL();
    const putRes = await fetch(uploadURL, {
      method: "PUT",
      body: buffer,
      headers: { "Content-Type": contentType },
    });
    if (!putRes.ok) {
      throw new Error(`Presigned upload returned ${putRes.status}`);
    }

    const objectPath = objectStorage.normalizeObjectEntityPath(uploadURL);
    const newUrl = `/api/storage${objectPath}`;
    await db
      .update(sponsorsTable)
      .set({ logoUrl: newUrl })
      .where(eq(sponsorsTable.id, sponsor.id));

    log.info(
      { sponsorId: sponsor.id, objectPath },
      "Migrated sponsor logo data URL to object storage",
    );
    return newUrl;
  } catch (err) {
    log.error(
      { err, sponsorId: sponsor.id },
      "Failed to migrate sponsor logo to object storage; keeping data URL",
    );
    return sponsor.logoUrl;
  }
}

export async function migrateSponsorLogos<T extends { id: number; logoUrl: string }>(
  sponsors: T[],
  log: Logger,
): Promise<T[]> {
  return Promise.all(
    sponsors.map(async (s) => ({
      ...s,
      logoUrl: await migrateSponsorLogoIfNeeded(s, log),
    })),
  );
}
