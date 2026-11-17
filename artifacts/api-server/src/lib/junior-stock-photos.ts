import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db, clubPhotosTable, juniorPhotosTable } from "@workspace/db";
import { carouselSlideSlot, isRepeatSlot } from "@workspace/scorecard/kind-templates";
import { readQueuedCarousel, type QueuedCarousel } from "@workspace/scorecard/queued-carousel";
import { presentPhotos } from "./club-photo-library";
import { isJuniorPhotoPath } from "./photo-store";

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

// ── Photos inside a junior design (studio retest, 17 Nov 2026) ──────────────

/** A stored image URL as its object path, so `/api/storage/objects/x` and `/objects/x` match. */
const objectKey = (url: string): string => {
  const at = url.indexOf("/objects/");
  return at < 0 ? url : url.slice(at).split(/[?#]/)[0]!;
};

/** A junior player's photo: under the private prefix, or through its admin-only route. */
const isJuniorPlayerPhoto = (url: string): boolean =>
  /\/juniors\/photos\/\d+/.test(url) || isJuniorPhotoPath(objectKey(url));

/** Every string in a value that could be a stored photo (an object or a junior photo route). */
function photoStrings(value: unknown, out = new Set<string>()): Set<string> {
  if (typeof value === "string") {
    if (value.includes("/objects/") || value.includes("/juniors/photos/")) out.add(value);
  } else if (Array.isArray(value)) for (const v of value) photoStrings(v, out);
  else if (typeof value === "object" && value !== null)
    for (const v of Object.values(value)) photoStrings(v, out);
  return out;
}

const DROP = Symbol("drop");

/**
 * `value` without the photos `isBad` names: an image layer showing one goes
 * whole, and any other field holding one (an image override, a background)
 * is removed. Pure; returns how many it removed.
 */
export function withoutPhotos(
  value: unknown,
  isBad: (url: string) => boolean,
): { value: unknown; removed: number } {
  let removed = 0;
  const bad = (v: unknown) => typeof v === "string" && isBad(v);
  const walk = (v: unknown): unknown => {
    if (bad(v)) {
      removed++;
      return DROP;
    }
    if (Array.isArray(v)) return v.map(walk).filter((x) => x !== DROP);
    if (typeof v === "object" && v !== null) {
      const o = v as Record<string, unknown>;
      if (o.kind === "image" && bad(o.content)) {
        removed++;
        return DROP;
      }
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(o)) {
        const next = walk(x);
        if (next !== DROP) out[k] = next;
      }
      return out;
    }
    return v;
  };
  const next = walk(value);
  return { value: next === DROP ? null : next, removed };
}

/**
 * Whether a draft's design draws only junior surfaces: a junior card (either
 * marker), or a junior carousel set (a junior slide and no senior game), whose
 * cover and sponsors pages are junior surfaces too (ADR-007, #638).
 */
export function isJuniorDesignDraft(d: {
  sourceMatchIsJunior: boolean;
  cardInput: unknown;
}): boolean {
  if (d.sourceMatchIsJunior) return true;
  const input = d.cardInput as Record<string, unknown> | null | undefined;
  if (input?.junior === true) return true;
  const carousel = readQueuedCarousel(input);
  return !!carousel && isJuniorCarousel(carousel);
}

/**
 * A junior design as it may be saved or posted (fails closed). Every photo in
 * it from the club's photo libraries (a library photo added as an image layer,
 * an image override, a page background, any club's) is removed unless it is
 * one of this club's approved junior stock images (no grade, no player tags).
 * A junior player's photo is removed too, unless it is the card's own photo
 * the server cleared (`juniorPhotoAllowed`). The club's uploads (logos,
 * artwork) are not photos and stay. A senior design is returned as it is.
 */
export async function juniorSafeDesign(
  tenantId: number,
  draft: { sourceMatchIsJunior: boolean; cardInput: unknown; photoUrl?: string | null },
  design: unknown,
): Promise<{ design: unknown; removed: number }> {
  if (design == null || !isJuniorDesignDraft(draft)) return { design, removed: 0 };
  const found = photoStrings(design);
  if (!found.size) return { design, removed: 0 };
  const keys = [...new Set([...found].map(objectKey))];
  // Any club's library photo the design names, by its full or thumbnail path.
  const rows = await db
    .select()
    .from(clubPhotosTable)
    .where(or(inArray(clubPhotosTable.objectPath, keys), inArray(clubPhotosTable.thumbPath, keys)));
  const juniorRows = await db
    .select({ objectPath: juniorPhotosTable.objectPath, thumbPath: juniorPhotosTable.thumbPath })
    .from(juniorPhotosTable)
    .where(
      or(inArray(juniorPhotosTable.objectPath, keys), inArray(juniorPhotosTable.thumbPath, keys)),
    );
  const stock = await presentPhotos(
    tenantId,
    rows.filter((r) => r.tenantId === tenantId && r.juniorStock && r.grade === null),
  );
  const approved = new Set(
    stock
      .filter((p) => !p.playerIds.length)
      .flatMap((p) => [objectKey(p.url), objectKey(p.thumbUrl)]),
  );
  const library = new Set(rows.flatMap((r) => [r.objectPath, r.thumbPath]));
  const juniorPaths = new Set(
    juniorRows.flatMap((r) => [r.objectPath, r.thumbPath].filter((p): p is string => !!p)),
  );
  const input = draft.cardInput as Record<string, unknown> | null | undefined;
  const own =
    input?.juniorPhotoAllowed === true && draft.photoUrl ? objectKey(draft.photoUrl) : null;
  const isBad = (url: string) => {
    if (!found.has(url)) return false;
    const key = objectKey(url);
    if (own !== null && key === own) return false;
    if (isJuniorPlayerPhoto(url) || juniorPaths.has(key)) return true;
    return library.has(key) && !approved.has(key);
  };
  const { value, removed } = withoutPhotos(design, isBad);
  return { design: removed ? value : design, removed };
}
