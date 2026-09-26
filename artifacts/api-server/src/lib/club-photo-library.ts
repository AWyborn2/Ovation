import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  clubPhotoPlayersTable,
  clubPhotosTable,
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

/**
 * A library photo of this player for their profile when they have no headshot:
 * solo shots first (fewest players tagged), then the newest. Library photos
 * are senior-only, so a junior or fill-in never matches. Null when untagged.
 */
/**
 * The tagged library photo for each of `playerIds` (same choice as
 * {@link taggedPlayerPhotoUrl}: solo shots first, then newest), in one query.
 * Players with no tagged photo, and fill-ins, are absent from the map.
 */
export async function taggedPlayerPhotoUrls(
  tenantId: number,
  playerIds: number[],
): Promise<Map<number, string>> {
  const ids = [...new Set(playerIds.filter((id) => id > 0 && !isFillInPlayerId(id)))];
  const out = new Map<number, string>();
  if (ids.length === 0) return out;
  const rows = await db.execute<{ player_id: number; object_path: string }>(sql`
    SELECT DISTINCT ON (t.player_id) t.player_id, p.object_path
    FROM ${clubPhotoPlayersTable} t
    JOIN ${clubPhotosTable} p ON p.id = t.photo_id
    WHERE t.tenant_id = ${tenantId}
      AND p.tenant_id = ${tenantId}
      AND t.player_id IN (${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `,
      )})
    ORDER BY t.player_id,
      (SELECT count(*) FROM ${clubPhotoPlayersTable} t2 WHERE t2.photo_id = p.id) ASC,
      coalesce(p.taken_at, p.created_at) DESC,
      p.id DESC
  `);
  for (const r of rows.rows) out.set(Number(r.player_id), objectUrl(r.object_path));
  return out;
}

/** Attach each player's tagged library photo (`libraryPhotoUrl`) to a list page. */
export async function withLibraryPhotos<T extends { id: number }>(
  tenantId: number,
  players: T[],
): Promise<(T & { libraryPhotoUrl: string | null })[]> {
  const urls = await taggedPlayerPhotoUrls(
    tenantId,
    players.map((p) => p.id),
  );
  return players.map((p) => ({ ...p, libraryPhotoUrl: urls.get(p.id) ?? null }));
}

export async function taggedPlayerPhotoUrl(
  tenantId: number,
  playerId: number,
): Promise<string | null> {
  if (isFillInPlayerId(playerId)) return null;
  const tagCount = sql<number>`(select count(*) from ${clubPhotoPlayersTable} t2 where t2.photo_id = ${clubPhotosTable.id})`;
  const [row] = await db
    .select({ objectPath: clubPhotosTable.objectPath })
    .from(clubPhotoPlayersTable)
    .innerJoin(clubPhotosTable, eq(clubPhotosTable.id, clubPhotoPlayersTable.photoId))
    .where(
      and(
        eq(clubPhotoPlayersTable.tenantId, tenantId),
        eq(clubPhotosTable.tenantId, tenantId),
        eq(clubPhotoPlayersTable.playerId, playerId),
      ),
    )
    .orderBy(
      asc(tagCount),
      desc(sql`coalesce(${clubPhotosTable.takenAt}, ${clubPhotosTable.createdAt})`),
      desc(clubPhotosTable.id),
    )
    .limit(1);
  return row ? objectUrl(row.objectPath) : null;
}
