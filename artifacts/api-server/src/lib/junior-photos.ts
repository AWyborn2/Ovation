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
 * re-checks consent at request time, so withdrawing consent cuts the image off
 * everywhere at once.
 *
 * The junior photo library (kiosk-photo-rotation A) tags a photo with any number of
 * children (`junior_photo_participants`); `juniorLibraryPhotoAllowed` is the one consent
 * rule for cards, serving and the kiosk: every tagged child allowed, and at least one tag.
 *
 * Photo focus areas: given the card's frame shape, a pick leaves out photos switched off
 * for that shape and prefers the photos whose box (the child's area, else the photo's
 * focus box) fits it, as senior picks do.
 */
import { and, eq, inArray, ne, or, sql, type SQL } from "drizzle-orm";
import {
  db,
  juniorParticipantsTable,
  juniorPhotoParticipantsTable,
  juniorPhotosTable,
  socialDraftsTable,
} from "@workspace/db";
import { isJuniorWithheld } from "./junior-names";
import { juniorParticipantJoin } from "./junior-participant-scope";
import { focusFit, frameShapeOf, normaliseFocusBox, type FocusFit } from "@workspace/scorecard";
import { seededPick, type PhotoSource } from "./draft-enrich";
import { withdrawDraft } from "./draft-upsert";
import { draftFrameAspect } from "./photo-frame-aspect";

export const JUNIOR_PHOTO_SOURCE: PhotoSource = "auto:junior-photo";

export type JuniorPhoto = {
  photoId: number;
  participantId: string;
  url: string;
  thumbUrl: string | null;
  /** How well the photo suits the card's frame shape (when the pick knew it). */
  fit?: FocusFit;
};

const FIT_ORDER: readonly FocusFit[] = ["good", "tight", "none"];
const fitRank = (fit: FocusFit | undefined) => (fit ? FIT_ORDER.indexOf(fit) : 0);

/**
 * How well one tagged photo suits a frame of `frameAspect`: the child's area, else the
 * photo's focus box; "good" with no box or no known size (a centred crop, as before).
 */
export function juniorPhotoFit(
  photo: { width: number | null; height: number | null; focusBox: unknown; area: unknown },
  frameAspect: number,
): FocusFit {
  const box = normaliseFocusBox(photo.area) ?? normaliseFocusBox(photo.focusBox);
  if (!box || !photo.width || !photo.height) return "good";
  return focusFit({ box, width: photo.width, height: photo.height }, frameAspect);
}

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
 * Whether each of `photoIds` may be displayed outside admin (kiosk-photo-rotation A, fail
 * closed): only a photo with at least one tagged child, every one of whom has a participant
 * row in this tenant that passes `juniorPhotoAllowed`. An untagged photo, a tag whose child
 * is unknown, or any one withheld / private child makes the whole photo not displayable.
 * Ids of another tenant's photos come back false.
 */
export async function loadJuniorPhotoConsent(
  tenantId: number,
  photoIds: readonly number[],
): Promise<Map<number, boolean>> {
  const ids = [...new Set(photoIds)];
  const out = new Map<number, boolean>(ids.map((id) => [id, false]));
  if (ids.length === 0) return out;
  const rows = await db
    .select({
      photoId: juniorPhotoParticipantsTable.photoId,
      participantId: juniorParticipantsTable.participantId,
      photoWithheld: juniorParticipantsTable.photoWithheld,
      isPrivate: juniorParticipantsTable.isPrivate,
      privacyOverride: juniorParticipantsTable.privacyOverride,
    })
    .from(juniorPhotoParticipantsTable)
    .innerJoin(
      juniorPhotosTable,
      and(
        eq(juniorPhotosTable.id, juniorPhotoParticipantsTable.photoId),
        eq(juniorPhotosTable.tenantId, tenantId),
      ),
    )
    .leftJoin(
      juniorParticipantsTable,
      juniorParticipantJoin(juniorPhotoParticipantsTable.participantId, tenantId),
    )
    .where(
      and(
        eq(juniorPhotoParticipantsTable.tenantId, tenantId),
        inArray(juniorPhotoParticipantsTable.photoId, ids),
      ),
    );
  const verdict = new Map<number, boolean>();
  for (const r of rows) {
    const ok =
      r.participantId != null &&
      juniorPhotoAllowed({
        photoWithheld: r.photoWithheld ?? true,
        isPrivate: r.isPrivate ?? true,
        privacyOverride: r.privacyOverride ?? false,
      });
    verdict.set(r.photoId, (verdict.get(r.photoId) ?? true) && ok);
  }
  for (const [id, ok] of verdict) out.set(id, ok);
  return out;
}

/** The single consent rule for showing one junior photo anywhere outside admin. */
export async function juniorLibraryPhotoAllowed(
  tenantId: number,
  photoId: number,
): Promise<boolean> {
  return (await loadJuniorPhotoConsent(tenantId, [photoId])).get(photoId) === true;
}

/**
 * One displayable photo for every participant among `participantIds` (every tagged
 * participant when omitted), keyed by lower-cased participant id: the player's default
 * per-player photo, else the newest library photo they are tagged in. Only photos that
 * pass `juniorLibraryPhotoAllowed` count, so a group photo with one withheld child is
 * never picked for anyone in it.
 */
export async function loadJuniorPhotos(
  tenantId: number,
  participantIds?: readonly (string | null | undefined)[],
  opts: {
    /**
     * Skip the consent rule. Admin listings only — the photo route still refuses to
     * serve a photo that fails it publicly.
     */
    includeDisallowed?: boolean;
    /**
     * The shape (width / height) of the card's photo frame (photo focus areas): photos
     * switched off for its shape are left out, and photos that fit come first. Null or
     * omitted = shape doesn't matter.
     */
    frameAspect?: number | null;
  } = {},
): Promise<Map<string, JuniorPhoto>> {
  const ids = participantIds
    ? [...new Set(participantIds.filter((p): p is string => !!p).map((p) => p.toLowerCase()))]
    : null;
  if (ids && ids.length === 0) return new Map();
  const rows = await db
    .select({
      photoId: juniorPhotosTable.id,
      participantId: juniorPhotoParticipantsTable.participantId,
      ownerId: juniorPhotosTable.participantId,
      isDefault: juniorPhotosTable.isDefault,
      thumbPath: juniorPhotosTable.thumbPath,
      createdAt: juniorPhotosTable.createdAt,
      width: juniorPhotosTable.width,
      height: juniorPhotosTable.height,
      focusBox: juniorPhotosTable.focusBox,
      offShapes: juniorPhotosTable.offShapes,
      area: juniorPhotoParticipantsTable.area,
    })
    .from(juniorPhotoParticipantsTable)
    .innerJoin(
      juniorPhotosTable,
      and(
        eq(juniorPhotosTable.id, juniorPhotoParticipantsTable.photoId),
        eq(juniorPhotosTable.tenantId, tenantId),
      ),
    )
    .where(
      and(
        eq(juniorPhotoParticipantsTable.tenantId, tenantId),
        ids ? inArray(sql`lower(${juniorPhotoParticipantsTable.participantId})`, ids) : undefined,
      ),
    );
  const consent = opts.includeDisallowed
    ? null
    : await loadJuniorPhotoConsent(
        tenantId,
        rows.map((r) => r.photoId),
      );
  const aspect = opts.frameAspect && opts.frameAspect > 0 ? opts.frameAspect : null;
  const shape = aspect ? frameShapeOf(aspect) : null;
  const ranked = rows
    // A shape the admin switched off for the photo is never auto-picked for it.
    .filter((r) => !shape || !r.offShapes.includes(shape))
    .map((r) => ({ ...r, fit: aspect ? juniorPhotoFit(r, aspect) : undefined }));
  // The best fit for the frame first, then the player's own default, then the newest.
  const own = (r: (typeof ranked)[number]) =>
    r.isDefault && r.ownerId?.toLowerCase() === r.participantId.toLowerCase() ? 1 : 0;
  ranked.sort(
    (a, b) =>
      fitRank(a.fit) - fitRank(b.fit) ||
      own(b) - own(a) ||
      b.createdAt.getTime() - a.createdAt.getTime() ||
      b.photoId - a.photoId,
  );
  const out = new Map<string, JuniorPhoto>();
  for (const r of ranked) {
    const key = r.participantId.toLowerCase();
    if (out.has(key)) continue;
    if (consent && consent.get(r.photoId) !== true) continue;
    out.set(key, {
      photoId: r.photoId,
      participantId: r.participantId,
      url: juniorPhotoUrl(r.photoId),
      thumbUrl: r.thumbPath ? juniorPhotoThumbUrl(r.photoId) : null,
      ...(r.fit ? { fit: r.fit } : {}),
    });
  }
  return out;
}

/**
 * `loadJuniorPhotos` for a batch whose cards may be of several kinds: one load per frame
 * shape, from the club's template for each kind (`draftFrameAspect`). A kind whose shape
 * can't be read picks without one, as before.
 */
export function juniorPhotoLoader(
  tenantId: number,
  participantIds?: readonly (string | null | undefined)[],
): (kind: string) => Promise<Map<string, JuniorPhoto>> {
  const byAspect = new Map<number | null, Promise<Map<string, JuniorPhoto>>>();
  return async (kind) => {
    const aspect = await draftFrameAspect(tenantId, kind).catch(() => null);
    let photos = byAspect.get(aspect);
    if (!photos) {
      photos = loadJuniorPhotos(tenantId, participantIds, { frameAspect: aspect });
      byAspect.set(aspect, photos);
    }
    return photos;
  };
}

/**
 * The photo a junior card features: the first of `preferred` with a photo (a Big Moment's
 * player, a result's top performer), else one of `candidates` with a photo, picked by the
 * draft's seed the way senior team lists pick theirs (stable across re-renders). Among the
 * candidates, those whose photo best fits the frame (`fit`) are the pool; a tight or poor
 * fit is still picked when it is all there is. Null when no candidate is allowed and has a
 * photo.
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
  const best = Math.min(...pool.map((p) => fitRank(p.photo.fit)));
  return seededPick(
    pool.filter((p) => fitRank(p.photo.fit) === best),
    seed,
  ).photo;
}

/**
 * What a junior engine passes to `upsertDraftByKey` for its pick: the card-input fields
 * (the featured player and the positive marker) and the draft photo.
 */
export function juniorPhotoFields(pick: JuniorPhoto | null): {
  cardInput: Record<string, unknown>;
  photo: { url: string; source: PhotoSource; participantId?: string } | null;
} {
  if (!pick) return { cardInput: { photoUrl: null }, photo: null };
  return {
    cardInput: {
      photoUrl: pick.url,
      featuredParticipantId: pick.participantId,
      juniorPhotoAllowed: true,
    },
    // The featured child, so the draft crops to their area (photo focus areas).
    photo: { url: pick.url, source: JUNIOR_PHOTO_SOURCE, participantId: pick.participantId },
  };
}

const OPEN_STATUSES = ["awaiting_review", "ready"];

/**
 * A player is no longer allowed a photo (withheld, or made private): strip their photo from
 * every card not yet posted, in the request that changed them (R6) — cards featuring them,
 * and cards showing any photo they are tagged in (a group photo featuring a teammate); a
 * posted card is marked stale through `withdrawDraft`. The hourly sweep re-drafts the open
 * cards afterwards, so a team list can feature another allowed player.
 */
export async function withdrawJuniorPhotos(
  tenantId: number,
  participantId: string,
): Promise<{ stripped: number; stale: number }> {
  const pid = participantId.toLowerCase();
  const tagged = await db
    .select({ photoId: juniorPhotoParticipantsTable.photoId })
    .from(juniorPhotoParticipantsTable)
    .where(
      and(
        eq(juniorPhotoParticipantsTable.tenantId, tenantId),
        sql`lower(${juniorPhotoParticipantsTable.participantId}) = ${pid}`,
      ),
    );
  return stripJuniorPhotoDrafts(
    tenantId,
    pid,
    tagged.map((t) => t.photoId),
  );
}

/**
 * Photos that stopped being displayable (a withheld child tagged in, a tag removed, the
 * photo deleted): strip them from open cards and mark posted ones stale.
 */
export async function withdrawJuniorPhotoIds(
  tenantId: number,
  photoIds: readonly number[],
): Promise<{ stripped: number; stale: number }> {
  return stripJuniorPhotoDrafts(tenantId, null, photoIds);
}

async function stripJuniorPhotoDrafts(
  tenantId: number,
  participantId: string | null,
  photoIds: readonly number[],
): Promise<{ stripped: number; stale: number }> {
  const urls = [...new Set(photoIds)].map(juniorPhotoUrl);
  const matches = [
    participantId
      ? sql`lower(${socialDraftsTable.cardInput}->>'featuredParticipantId') = ${participantId}`
      : undefined,
    urls.length ? inArray(socialDraftsTable.photoUrl, urls) : undefined,
    urls.length ? inArray(sql`${socialDraftsTable.cardInput}->>'photoUrl'`, urls) : undefined,
  ].filter((c): c is SQL => !!c);
  if (matches.length === 0) return { stripped: 0, stale: 0 };
  const drafts = await db
    .select()
    .from(socialDraftsTable)
    .where(
      and(
        eq(socialDraftsTable.tenantId, tenantId),
        ne(socialDraftsTable.status, "dismissed"),
        or(...matches),
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
