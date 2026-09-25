import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  clubPhotoPlayersTable,
  playersTable,
  playerIdMapTable,
  type ClubPhotoRow,
} from "@workspace/db";
import { PHOTO_TYPES, isFillInPlayerId, type PhotoType } from "@workspace/scorecard";
import { tenantIsCentral } from "./tenant";
import { objectUrl } from "./photo-store";

/** Library helpers shared by the photo library routes (U6) and the Studio tools (U19). */

/**
 * The ids in `playerIds` that are NOT this tenant's senior players. Junior
 * participants and fill-ins can never be tagged on a library photo, and a
 * photo carrying such a tag is never sent to a third party (KTD15). A
 * central-data club's players are its crosswalk ids, a native club's are its
 * player register.
 */
export async function nonSeniorPlayerIds(tenantId: number, playerIds: number[]): Promise<number[]> {
  const unique = Array.from(new Set(playerIds));
  if (unique.length === 0) return [];
  const bad = unique.filter((id) => isFillInPlayerId(id));
  const candidates = unique.filter((id) => !isFillInPlayerId(id));
  if (candidates.length === 0) return bad;
  const known = (await tenantIsCentral(tenantId))
    ? await db
        .select({ id: playerIdMapTable.playerId })
        .from(playerIdMapTable)
        .where(
          and(
            eq(playerIdMapTable.tenantId, tenantId),
            inArray(playerIdMapTable.playerId, candidates),
          ),
        )
    : await db
        .select({ id: playersTable.id })
        .from(playersTable)
        .where(inArray(playersTable.id, candidates));
  const knownIds = new Set(known.map((k) => k.id));
  return [...bad, ...candidates.filter((id) => !knownIds.has(id))];
}

export type PhotoDto = {
  id: number;
  url: string;
  thumbUrl: string;
  width: number;
  height: number;
  season: number | null;
  grade: string | null;
  takenAt: string | null;
  createdAt: string;
  playerIds: number[];
  photoTypes: PhotoType[];
  sourcePhotoId: number | null;
};

export async function presentPhotos(tenantId: number, rows: ClubPhotoRow[]): Promise<PhotoDto[]> {
  const ids = rows.map((r) => r.id);
  const tags = ids.length
    ? await db
        .select()
        .from(clubPhotoPlayersTable)
        .where(
          and(
            eq(clubPhotoPlayersTable.tenantId, tenantId),
            inArray(clubPhotoPlayersTable.photoId, ids),
          ),
        )
    : [];
  const byPhoto = new Map<number, number[]>();
  for (const t of tags) byPhoto.set(t.photoId, [...(byPhoto.get(t.photoId) ?? []), t.playerId]);
  return rows.map((r) => ({
    id: r.id,
    url: objectUrl(r.objectPath),
    thumbUrl: objectUrl(r.thumbPath),
    width: r.width,
    height: r.height,
    season: r.season,
    grade: r.grade,
    takenAt: r.takenAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    playerIds: (byPhoto.get(r.id) ?? []).sort((a, b) => a - b),
    // In the canonical order, whatever order they were tagged in.
    photoTypes: PHOTO_TYPES.filter((t) => r.photoTypes.includes(t)),
    sourcePhotoId: r.sourcePhotoId ?? null,
  }));
}
