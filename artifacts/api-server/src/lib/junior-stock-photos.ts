import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, clubPhotosTable } from "@workspace/db";
import { carouselSlideSlot, isRepeatSlot } from "@workspace/scorecard/kind-templates";
import { readQueuedCarousel, type QueuedCarousel } from "@workspace/scorecard/queued-carousel";
import { presentPhotos } from "./club-photo-library";

/** Client permission markers alone never authorise a junior image. */
export async function validJuniorStockSelection(tenantId: number, carousel: QueuedCarousel) {
  const selected = carousel.slides.filter((s) => s.junior && s.data.photoUrl);
  if (!selected.length) return true;
  const ids = selected.map((s) => Number(s.input.juniorStockPhotoId));
  const rows = await db
    .select()
    .from(clubPhotosTable)
    .where(
      and(
        eq(clubPhotosTable.tenantId, tenantId),
        eq(clubPhotosTable.juniorStock, true),
        isNull(clubPhotosTable.grade),
        inArray(clubPhotosTable.id, ids),
      ),
    );
  const allowed = (await presentPhotos(tenantId, rows)).filter((p) => !p.playerIds.length);
  return selected.every((s) =>
    allowed.some((p) => p.id === s.input.juniorStockPhotoId && p.url === s.data.photoUrl),
  );
}

/**
 * Whether a carousel is a junior set: it has a junior slide and no senior
 * game slide (a fixture, team or result). Its cover and sponsors pages are
 * then junior surfaces too (ADR-007, KTD15).
 */
export function isJuniorCarousel(carousel: Pick<QueuedCarousel, "slides">): boolean {
  const game = (s: QueuedCarousel["slides"][number]) =>
    !s.id.startsWith("page:") && isRepeatSlot(carouselSlideSlot(s.input));
  return (
    carousel.slides.some((s) => s.junior) && !carousel.slides.some((s) => !s.junior && game(s))
  );
}

/**
 * A junior set's pages that aren't junior slides (its cover, sponsors and
 * design pages) show a photo only when it is one of the club's approved junior
 * stock images, matched by id and URL; any other photo is removed from the
 * saved slide (fails closed: the page prints on the brand colour). Mutates
 * `weekendCarousel.slides` in `cardInput`; returns how many photos it removed.
 */
export async function stripUnapprovedJuniorSetPhotos(
  tenantId: number,
  cardInput: Record<string, unknown>,
  carousel: QueuedCarousel,
): Promise<number> {
  if (!isJuniorCarousel(carousel)) return 0;
  const withPhoto = carousel.slides.filter((s) => !s.junior && s.data.photoUrl);
  if (!withPhoto.length) return 0;
  const idOf = (s: QueuedCarousel["slides"][number]) =>
    Number(s.photoId ?? s.input.juniorStockPhotoId);
  const ids = withPhoto.map(idOf).filter((id) => Number.isSafeInteger(id) && id > 0);
  const rows = ids.length
    ? await db
        .select()
        .from(clubPhotosTable)
        .where(
          and(
            eq(clubPhotosTable.tenantId, tenantId),
            eq(clubPhotosTable.juniorStock, true),
            isNull(clubPhotosTable.grade),
            inArray(clubPhotosTable.id, ids),
          ),
        )
    : [];
  const allowed = (await presentPhotos(tenantId, rows)).filter((p) => !p.playerIds.length);
  const unsafe = new Set(
    withPhoto
      .filter((s) => !allowed.some((p) => p.id === idOf(s) && p.url === s.data.photoUrl))
      .map((s) => s.id),
  );
  if (!unsafe.size) return 0;
  const wc = cardInput.weekendCarousel as { slides?: Array<Record<string, unknown>> };
  for (const raw of wc.slides ?? []) {
    if (!unsafe.has(String(raw.id))) continue;
    const {
      photoUrl: _url,
      photoTransform: _transform,
      ...data
    } = (raw.data ?? {}) as Record<string, unknown>;
    raw.data = data;
    if ("photoId" in raw) raw.photoId = null;
  }
  return unsafe.size;
}

/** A saved carousel as it may post: a junior set's unapproved page photos removed. */
export async function juniorSafeCarousel(
  tenantId: number,
  cardInput: Record<string, unknown>,
  carousel: QueuedCarousel,
): Promise<QueuedCarousel> {
  if (!isJuniorCarousel(carousel)) return carousel;
  const copy = structuredClone(cardInput);
  return (await stripUnapprovedJuniorSetPhotos(tenantId, copy, carousel))
    ? (readQueuedCarousel(copy) ?? carousel)
    : carousel;
}
