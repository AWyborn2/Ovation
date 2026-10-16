/**
 * Junior card photos (plan 2026-10-16-001, ADR-007).
 *
 * A junior player may have photos the club's admin uploaded (`junior_photos`). One may
 * appear on a junior card only when the player is **allowed**: not `photo_withheld`
 * (the admin's record that the family has not consented) and not withheld by privacy
 * (`is_private` without an override). The engines load the allowed players' default
 * photos once per batch (like `loadJuniorNaming`), pick one per card, and stamp the
 * card input with `featuredParticipantId` and the positive marker
 * `juniorPhotoAllowed: true` — the only thing that lets a renderer show a photo on a
 * junior card. Photos are served through the gated `/juniors/photos/:id` route, which
 * re-checks the player at request time, so withdrawing consent cuts the image off
 * everywhere at once.
 */
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { db, juniorParticipantsTable, juniorPhotosTable, socialDraftsTable } from "@workspace/db";
import { isJuniorWithheld } from "./junior-names";
import { juniorParticipantJoin } from "./junior-participant-scope";
import { seededPick, type PhotoSource } from "./draft-enrich";
import { withdrawDraft } from "./draft-upsert";

export const JUNIOR_PHOTO_SOURCE: PhotoSource = "auto:junior-photo";

export type JuniorPhoto = {
  photoId: number;
  participantId: string;
  url: string;
  thumbUrl: string | null;
};

/** The URL cards and profiles use for a junior photo (gated by the serving route). */
export function juniorPhotoUrl(photoId: number): string {
  return `/api/juniors/photos/${photoId}`;
}

export function juniorPhotoThumbUrl(photoId: number): string {
  return `/api/juniors/photos/${photoId}/thumb`;
}

/** Whether a participant row may have a photo shown at all (R3). */
export function juniorPhotoAllowed(p: {
  photoWithheld: boolean;
  isPrivate: boolean;
  privacyOverride: boolean;
}): boolean {
  return !p.photoWithheld && !isJuniorWithheld(p);
}

/**
 * The default photo of every ALLOWED participant among `participantIds` (every
 * allowed participant with a photo when omitted), keyed by lower-cased participant id.
 */
export async function loadJuniorPhotos(
  tenantId: number,
  participantIds?: readonly (string | null | undefined)[],
  opts: {
    /**
     * Include players who are NOT allowed a photo (withheld or private). Admin
     * listings only — the photo route still refuses to serve them publicly.
     */
    includeDisallowed?: boolean;
  } = {},
): Promise<Map<string, JuniorPhoto>> {
  const ids = participantIds
    ? [...new Set(participantIds.filter((p): p is string => !!p).map((p) => p.toLowerCase()))]
    : null;
  if (ids && ids.length === 0) return new Map();
  const rows = await db
    .select({
      photoId: juniorPhotosTable.id,
      participantId: juniorPhotosTable.participantId,
      thumbPath: juniorPhotosTable.thumbPath,
      photoWithheld: juniorParticipantsTable.photoWithheld,
      isPrivate: juniorParticipantsTable.isPrivate,
      privacyOverride: juniorParticipantsTable.privacyOverride,
    })
    .from(juniorPhotosTable)
    // Photo rows are written from the participant row's own id, so the exact,
    // tenant-scoped join is right (and what the tenant guard test requires).
    .innerJoin(
      juniorParticipantsTable,
      juniorParticipantJoin(juniorPhotosTable.participantId, tenantId),
    )
    .where(
      and(
        eq(juniorPhotosTable.tenantId, tenantId),
        eq(juniorPhotosTable.isDefault, true),
        ids ? inArray(sql`lower(${juniorPhotosTable.participantId})`, ids) : undefined,
      ),
    );
  const out = new Map<string, JuniorPhoto>();
  for (const r of rows) {
    if (!opts.includeDisallowed && !juniorPhotoAllowed(r)) continue;
    out.set(r.participantId.toLowerCase(), {
      photoId: r.photoId,
      participantId: r.participantId,
      url: juniorPhotoUrl(r.photoId),
      thumbUrl: r.thumbPath ? juniorPhotoThumbUrl(r.photoId) : null,
    });
  }
  return out;
}

/**
 * The photo a junior card features: the first of `preferred` with a photo (a Big Moment's
 * player, a result's top performer), else one of `candidates` with a photo, picked by the
 * draft's seed the way senior team lists pick theirs (stable across re-renders). Null when
 * no candidate is allowed and has a photo.
 */
export function pickJuniorCardPhoto(
  photos: ReadonlyMap<string, JuniorPhoto>,
  candidates: readonly (string | null | undefined)[],
  seed: string | null,
  preferred: readonly (string | null | undefined)[] = [],
): JuniorPhoto | null {
  for (const p of preferred) {
    const photo = p ? photos.get(p.toLowerCase()) : undefined;
    if (photo) return photo;
  }
  const pool: Array<{ id: number; photo: JuniorPhoto }> = [];
  const seen = new Set<string>();
  for (const c of candidates) {
    if (!c) continue;
    const key = c.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const photo = photos.get(key);
    if (photo) pool.push({ id: photo.photoId, photo });
  }
  if (pool.length === 0) return null;
  return seededPick(pool, seed).photo;
}

/**
 * What a junior engine passes to `upsertDraftByKey` for its pick: the card-input fields
 * (the featured player and the positive marker) and the draft photo.
 */
export function juniorPhotoFields(pick: JuniorPhoto | null): {
  cardInput: Record<string, unknown>;
  photo: { url: string; source: PhotoSource } | null;
} {
  if (!pick) return { cardInput: { photoUrl: null }, photo: null };
  return {
    cardInput: {
      photoUrl: pick.url,
      featuredParticipantId: pick.participantId,
      juniorPhotoAllowed: true,
    },
    photo: { url: pick.url, source: JUNIOR_PHOTO_SOURCE },
  };
}

const OPEN_STATUSES = ["awaiting_review", "ready"];

/**
 * A player is no longer allowed a photo (withheld, or made private): strip their photo from
 * every card not yet posted, in the request that changed them (R6); a posted card is marked
 * stale through `withdrawDraft`. The hourly sweep re-drafts the open cards afterwards, so a
 * team list can feature another allowed player.
 */
export async function withdrawJuniorPhotos(
  tenantId: number,
  participantId: string,
): Promise<{ stripped: number; stale: number }> {
  const pid = participantId.toLowerCase();
  const drafts = await db
    .select()
    .from(socialDraftsTable)
    .where(
      and(
        eq(socialDraftsTable.tenantId, tenantId),
        ne(socialDraftsTable.status, "dismissed"),
        sql`lower(${socialDraftsTable.cardInput}->>'featuredParticipantId') = ${pid}`,
      ),
    );
  let stripped = 0;
  let stale = 0;
  for (const d of drafts) {
    if (!OPEN_STATUSES.includes(d.status)) {
      await withdrawDraft(d);
      stale++;
      continue;
    }
    const input = { ...((d.cardInput ?? {}) as Record<string, unknown>) };
    delete input.featuredParticipantId;
    delete input.juniorPhotoAllowed;
    input.photoUrl = null;
    await db
      .update(socialDraftsTable)
      .set({ cardInput: input, photoUrl: null, photoSource: "none" })
      .where(eq(socialDraftsTable.id, d.id));
    stripped++;
  }
  return { stripped, stale };
}
