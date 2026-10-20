/**
 * Automatic carousel photos (ADR-010 P4): the least recently used library
 * photo for a carousel's cover and for each fixture slide, so a carousel can
 * go out without an admin picking photos by hand. An admin can still swap any
 * pick in the Weekend Carousel (the swap is saved in the carousel's content
 * override). With nothing that fits, the pick is null and the slide prints on
 * the pack's brand-colour background.
 *
 * "Recently used" is `photo_usage`, written when a draft is posted
 * ({@link recordPhotoUsage}). Within one build, a photo already picked for an
 * earlier slide counts as the most recent, so slides spread across the library.
 *
 * The pools are the ones the Weekend Carousel offers (the sources route returns
 * them from {@link loadCarouselPhotos}), so every auto pick is also a photo the
 * admin could have chosen:
 *   - a senior fixture: photos in its grade's folder tagged batting, bowling or
 *     fielding; a `fixed` card photo rule for (grade, matchDay) wins when its
 *     photo is one of them;
 *   - the cover: Club-wide · Season 2026 photos (team photos first among
 *     equally fresh ones), else the club's junior stock images;
 *   - anything junior (a junior fixture, or the cover of a set with no senior
 *     fixture): the club's junior stock images only. Never a junior player's
 *     own photo (withheld or not), never a senior library photo, never a card
 *     photo rule — junior cards never get a photo from the senior library
 *     (KTD15, ADR-007).
 * Photos tagged with anyone who is not a known senior player (a fill-in, a
 * junior) are left out of every pool.
 */

import { and, asc, eq, inArray, isNotNull, isNull, max, or } from "drizzle-orm";
import {
  db,
  cardPhotoRulesTable,
  clubPhotosTable,
  photoUsageTable,
  type SocialDraftRow,
} from "@workspace/db";
import { isJuniorGradeLabel } from "@workspace/scorecard";
import { readQueuedCarousel } from "@workspace/scorecard/queued-carousel";
import type { MatchDayFixtureContent } from "@workspace/scorecard/card-content";
import { nonSeniorPlayerIds, presentPhotos, type PhotoDto } from "../club-photo-library";
import { logger } from "../logger";

/** Which slide a photo is for. */
export type PhotoScope =
  /** `junior`: the set has no senior fixture, so the cover must be junior-safe. */
  { kind: "cover"; junior: boolean } | { kind: "fixture"; grade: string; junior: boolean };

export interface PhotoPick {
  photoId: number;
  url: string;
}

/** The library photos a Weekend Carousel may show, as the sources route returns them. */
export interface CarouselPhotos {
  /** Senior grade photos tagged batting, bowling or fielding (fixture slides). */
  photos: PhotoDto[];
  /** Club-wide · Season 2026 photos, in any category (the cover). */
  coverPhotos: PhotoDto[];
  /** Club-approved junior stock images (no grade, no player tags). */
  juniorStockPhotos: PhotoDto[];
}

const ACTION_TYPES = ["batting", "bowling", "fielding"];

/** The senior grades among `grades` (a junior-looking label fails closed). */
const seniorGrades = (grades: readonly string[]) =>
  [...new Set(grades)].filter((g) => !!g && !isJuniorGradeLabel(g));

/**
 * The photos a carousel over `grades` may show. Every query is tenant-scoped;
 * photos tagged with anyone who is not a known senior player are dropped.
 */
export async function loadCarouselPhotos(
  tenantId: number,
  grades: readonly string[],
): Promise<CarouselPhotos> {
  const senior = seniorGrades(grades);
  const gradeRows = senior.length
    ? await db
        .select()
        .from(clubPhotosTable)
        .where(and(eq(clubPhotosTable.tenantId, tenantId), inArray(clubPhotosTable.grade, senior)))
        .orderBy(asc(clubPhotosTable.id))
    : [];
  // Club-wide is represented by a NULL grade, not all grade folders.
  const clubRows = await db
    .select()
    .from(clubPhotosTable)
    .where(
      and(
        eq(clubPhotosTable.tenantId, tenantId),
        isNull(clubPhotosTable.grade),
        eq(clubPhotosTable.season, 2026),
      ),
    )
    .orderBy(asc(clubPhotosTable.id));
  const stockRows = await db
    .select()
    .from(clubPhotosTable)
    .where(
      and(
        eq(clubPhotosTable.tenantId, tenantId),
        eq(clubPhotosTable.juniorStock, true),
        isNull(clubPhotosTable.grade),
      ),
    )
    .orderBy(asc(clubPhotosTable.id));
  const [gradePhotos, clubPhotos, stockPhotos] = await Promise.all([
    presentPhotos(tenantId, gradeRows),
    presentPhotos(tenantId, clubRows),
    presentPhotos(tenantId, stockRows),
  ]);
  const unsafe = new Set(
    await nonSeniorPlayerIds(
      tenantId,
      [...gradePhotos, ...clubPhotos].flatMap((p) => p.playerIds),
    ),
  );
  const safe = (p: PhotoDto) => !p.playerIds.some((id) => unsafe.has(id));
  const graded = gradePhotos.filter(safe);
  return {
    photos: graded.filter((p) => p.photoTypes.some((t) => ACTION_TYPES.includes(t))),
    coverPhotos: clubPhotos.filter(safe),
    juniorStockPhotos: stockPhotos.filter((p) => p.playerIds.length === 0),
  };
}

/** When each of the club's photos was last posted, by photo id. */
async function lastUsed(tenantId: number): Promise<Map<number, number>> {
  const rows = await db
    .select({ photoId: photoUsageTable.photoId, usedAt: max(photoUsageTable.usedAt) })
    .from(photoUsageTable)
    .where(eq(photoUsageTable.tenantId, tenantId))
    .groupBy(photoUsageTable.photoId);
  return new Map(rows.flatMap((r) => (r.usedAt ? [[r.photoId, r.usedAt.getTime()]] : [])));
}

/** The club's fixed Match Day photo per senior grade (card photo rules). */
async function fixedMatchDayRules(
  tenantId: number,
  grades: readonly string[],
): Promise<Map<string, number>> {
  const senior = seniorGrades(grades);
  if (!senior.length) return new Map();
  const rows = await db
    .select({ grade: cardPhotoRulesTable.grade, photoId: cardPhotoRulesTable.photoId })
    .from(cardPhotoRulesTable)
    .where(
      and(
        eq(cardPhotoRulesTable.tenantId, tenantId),
        eq(cardPhotoRulesTable.cardKind, "matchDay"),
        eq(cardPhotoRulesTable.mode, "fixed"),
        inArray(cardPhotoRulesTable.grade, senior),
        isNotNull(cardPhotoRulesTable.photoId),
      ),
    );
  return new Map(rows.map((r) => [r.grade, r.photoId!]));
}

const newest = (p: PhotoDto) => Date.parse(p.takenAt ?? p.createdAt);

/**
 * Picks photos for one build: loads the pools, the usage and the rules once,
 * and spreads its picks (a photo picked earlier in the build ranks behind every
 * photo not yet picked).
 */
export interface PhotoPicker {
  pick(scope: PhotoScope): PhotoPick | null;
  readonly photos: CarouselPhotos;
}

export async function createPhotoPicker(
  tenantId: number,
  grades: readonly string[],
  opts: { photos?: CarouselPhotos } = {},
): Promise<PhotoPicker> {
  const [photos, used, rules] = await Promise.all([
    opts.photos ?? loadCarouselPhotos(tenantId, grades),
    lastUsed(tenantId),
    fixedMatchDayRules(tenantId, grades),
  ]);
  const picked = new Map<number, number>();

  /** Least picked in this build, then least recently posted (never first), then newest. */
  const leastRecent = (pool: readonly PhotoDto[], prefer?: (p: PhotoDto) => boolean) =>
    [...pool].sort(
      (a, b) =>
        (picked.get(a.id) ?? 0) - (picked.get(b.id) ?? 0) ||
        (used.get(a.id) ?? 0) - (used.get(b.id) ?? 0) ||
        (prefer ? Number(prefer(b)) - Number(prefer(a)) : 0) ||
        newest(b) - newest(a) ||
        b.id - a.id,
    )[0];

  const take = (photo: PhotoDto | undefined): PhotoPick | null => {
    if (!photo) return null;
    picked.set(photo.id, (picked.get(photo.id) ?? 0) + 1);
    return { photoId: photo.id, url: photo.url };
  };

  return {
    photos,
    pick(scope) {
      if (scope.kind === "cover") {
        if (scope.junior) return take(leastRecent(photos.juniorStockPhotos));
        const club = photos.coverPhotos;
        return take(
          club.length
            ? leastRecent(club, (p) => p.photoTypes.includes("team"))
            : leastRecent(photos.juniorStockPhotos),
        );
      }
      // Junior slides: club stock artwork only, never a rule or a library photo.
      if (scope.junior || isJuniorGradeLabel(scope.grade))
        return take(leastRecent(photos.juniorStockPhotos));
      const pool = photos.photos.filter((p) => p.grade === scope.grade);
      const fixed = rules.get(scope.grade);
      const ruled = fixed != null ? pool.find((p) => p.id === fixed) : undefined;
      return take(ruled ?? leastRecent(pool));
    },
  };
}

/** One photo for one slide (see {@link createPhotoPicker} for a whole build). */
export async function pickPhoto(tenantId: number, scope: PhotoScope): Promise<PhotoPick | null> {
  const picker = await createPhotoPicker(tenantId, scope.kind === "fixture" ? [scope.grade] : []);
  return picker.pick(scope);
}

/** A Match Day carousel's automatic photos: the cover's, then each fixture's in order. */
export interface MatchDayPhotoPicks {
  cover: number | null;
  /** By fixture id. */
  fixtures: Record<string, number | null>;
}

/**
 * The automatic photos for a Match Day set built from `content` (in slide
 * order). The cover is junior-safe unless the set has a senior fixture.
 */
export async function buildMatchDayPhotos(
  tenantId: number,
  content: readonly MatchDayFixtureContent[],
  opts: { photos?: CarouselPhotos } = {},
): Promise<MatchDayPhotoPicks> {
  const picker = await createPhotoPicker(
    tenantId,
    content.filter((c) => !c.junior).map((c) => c.source.grade),
    opts,
  );
  const fixtures: Record<string, number | null> = {};
  for (const c of content) {
    fixtures[c.fixtureId] =
      picker.pick({ kind: "fixture", grade: c.source.grade, junior: c.junior })?.photoId ?? null;
  }
  const cover =
    picker.pick({ kind: "cover", junior: content.length > 0 && content.every((c) => c.junior) })
      ?.photoId ?? null;
  return { cover, fixtures };
}

/** The library photo ids a draft shows: a carousel's slide photos, or its own photo. */
function draftPhotoRefs(draft: Pick<SocialDraftRow, "cardInput" | "photoUrl">) {
  const ids = new Set<number>();
  const urls = new Set<string>();
  if (draft.photoUrl) urls.add(draft.photoUrl);
  const carousel = readQueuedCarousel(draft.cardInput);
  for (const s of carousel?.slides ?? []) {
    const id = s.photoId ?? s.input.juniorStockPhotoId;
    if (typeof id === "number" && Number.isSafeInteger(id) && id > 0) ids.add(id);
    if (typeof s.data.photoUrl === "string" && s.data.photoUrl) urls.add(s.data.photoUrl);
  }
  return { ids: [...ids], urls: [...urls] };
}

const STORAGE_PREFIX = "/api/storage";

/**
 * Record that a posted draft used its photos (one `photo_usage` row per
 * library photo). Only the draft's own tenant's photos are recorded; a photo
 * that is not in the library (a headshot, an external URL) is skipped. Posting
 * the same draft again records nothing new.
 */
export async function recordPhotoUsage(
  draft: Pick<SocialDraftRow, "id" | "tenantId" | "cardInput" | "photoUrl">,
): Promise<number> {
  const { ids, urls } = draftPhotoRefs(draft);
  const paths = urls.flatMap((u) =>
    u.startsWith(`${STORAGE_PREFIX}/`) ? [u.slice(STORAGE_PREFIX.length)] : [],
  );
  if (!ids.length && !paths.length) return 0;
  const photos = await db
    .select({ id: clubPhotosTable.id })
    .from(clubPhotosTable)
    .where(
      and(
        eq(clubPhotosTable.tenantId, draft.tenantId),
        or(
          ids.length ? inArray(clubPhotosTable.id, ids) : undefined,
          paths.length ? inArray(clubPhotosTable.objectPath, paths) : undefined,
        ),
      ),
    );
  if (!photos.length) return 0;
  const rows = await db
    .insert(photoUsageTable)
    .values(photos.map((p) => ({ tenantId: draft.tenantId, photoId: p.id, draftId: draft.id })))
    .onConflictDoNothing()
    .returning({ id: photoUsageTable.id });
  return rows.length;
}

/**
 * {@link recordPhotoUsage}, best effort: the post has already gone out, so a
 * failed write is logged and never fails the posting (the next automatic pick
 * is merely less fresh).
 */
export async function notePhotoUsage(
  draft: Pick<SocialDraftRow, "id" | "tenantId" | "cardInput" | "photoUrl">,
): Promise<void> {
  try {
    await recordPhotoUsage(draft);
  } catch (err) {
    logger.warn({ err, draftId: draft.id, tenantId: draft.tenantId }, "photo usage: write failed");
  }
}
