import { and, eq, sql } from "drizzle-orm";
import {
  db,
  clubPhotoPlayersTable,
  clubPhotosTable,
  juniorPhotoParticipantsTable,
  juniorPhotosTable,
} from "@workspace/db";
import { normaliseFocusBox, type PhotoFocus } from "@workspace/scorecard";
import { objectUrl } from "./photo-store";

/** The prefix `objectUrl` puts on a library object path. */
const STORAGE_PREFIX = objectUrl("");

/**
 * The focus snapshot a draft stores with its photo (photo focus areas): the
 * pictured player's area when `playerId` is given and they have one on this
 * photo, else the photo's focus box, with the photo's size. Null for a photo
 * that isn't in the club's library (a headshot, an upload) or has no box, so
 * the card crops it centred as before. A snapshot, not a reference: editing a
 * box later never changes a draft that already has the photo.
 */
export async function draftPhotoFocus(
  tenantId: number,
  url: string | null | undefined,
  playerId: number | null = null,
  /** A junior card's featured child, for their area on a junior photo. */
  participantId: string | null = null,
): Promise<PhotoFocus | null> {
  if (!url) return null;
  const junior = JUNIOR_PHOTO_URL.exec(url);
  if (junior) return juniorPhotoFocus(tenantId, Number(junior[1]), participantId);
  if (!url.startsWith(STORAGE_PREFIX)) return null;
  const objectPath = url.slice(STORAGE_PREFIX.length);
  const [photo] = await db
    .select({
      id: clubPhotosTable.id,
      width: clubPhotosTable.width,
      height: clubPhotosTable.height,
      focusBox: clubPhotosTable.focusBox,
    })
    .from(clubPhotosTable)
    .where(and(eq(clubPhotosTable.tenantId, tenantId), eq(clubPhotosTable.objectPath, objectPath)))
    .limit(1);
  if (!photo || !(photo.width > 0) || !(photo.height > 0)) return null;
  let box = null;
  if (playerId != null) {
    const [tag] = await db
      .select({ area: clubPhotoPlayersTable.area })
      .from(clubPhotoPlayersTable)
      .where(
        and(
          eq(clubPhotoPlayersTable.tenantId, tenantId),
          eq(clubPhotoPlayersTable.photoId, photo.id),
          eq(clubPhotoPlayersTable.playerId, playerId),
        ),
      )
      .limit(1);
    box = normaliseFocusBox(tag?.area);
  }
  box = box ?? normaliseFocusBox(photo.focusBox);
  return box ? { box, width: photo.width, height: photo.height } : null;
}

/** The gated junior photo URL (`juniorPhotoUrl`). */
const JUNIOR_PHOTO_URL = /^\/api\/juniors\/photos\/(\d+)$/;

/** {@link draftPhotoFocus} for a junior library photo (the junior tables only). */
async function juniorPhotoFocus(
  tenantId: number,
  photoId: number,
  participantId: string | null,
): Promise<PhotoFocus | null> {
  const [photo] = await db
    .select({
      width: juniorPhotosTable.width,
      height: juniorPhotosTable.height,
      focusBox: juniorPhotosTable.focusBox,
    })
    .from(juniorPhotosTable)
    .where(and(eq(juniorPhotosTable.tenantId, tenantId), eq(juniorPhotosTable.id, photoId)))
    .limit(1);
  if (!photo?.width || !photo.height) return null;
  let box = null;
  if (participantId) {
    const [tag] = await db
      .select({ area: juniorPhotoParticipantsTable.area })
      .from(juniorPhotoParticipantsTable)
      .where(
        and(
          eq(juniorPhotoParticipantsTable.tenantId, tenantId),
          eq(juniorPhotoParticipantsTable.photoId, photoId),
          sql`lower(${juniorPhotoParticipantsTable.participantId}) = ${participantId.toLowerCase()}`,
        ),
      )
      .limit(1);
    box = normaliseFocusBox(tag?.area);
  }
  box = box ?? normaliseFocusBox(photo.focusBox);
  return box ? { box, width: photo.width, height: photo.height } : null;
}
