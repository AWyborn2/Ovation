/**
 * A set draft slide's own photo ("Change photo", `@workspace/scorecard`
 * `slide-photo.ts`), on the server: checked on save, checked again on every
 * render, and the pool the editor's Random draws from.
 *
 * A choice names a club library photo by id and address. On save each one
 * must be one of this club's library photos at that address, and a junior
 * slide's must be one of its approved junior stock images (ADR-007); anything
 * else is refused (fails closed). On render a choice that no longer passes
 * (the photo was deleted, or is no longer junior stock) is dropped and the
 * slide shows its automatic photo.
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  db,
  clubPhotoPlayersTable,
  clubPhotosTable,
  teamListsTable,
  type SocialDraftRow,
} from "@workspace/db";
import { isFillInPlayerId, planCardSet, type SetInput } from "@workspace/scorecard";
import {
  carouselSlideSlot,
  isRepeatSlot,
  juniorStockPhotos,
  slidePhotoChoice,
  slidePhotos,
  type SetDocument,
  type SlidePhoto,
} from "@workspace/scorecard/kind-templates";
import { readQueuedCarousel } from "@workspace/scorecard/queued-carousel";
import { presentPhotos, type PhotoDto } from "./club-photo-library";
import { isJuniorCarousel } from "./junior-stock-photos";
import { draftPhotoGrade } from "./draft-enrich";

/** Thrown for a slide photo the set can't take; the route answers 400. */
export class SlidePhotoError extends Error {}

/** Whether a draft is junior as a whole (a junior card, or a set with a junior team). */
export function draftIsJunior(draft: Pick<SocialDraftRow, "sourceMatchIsJunior" | "cardInput">) {
  const input = (draft.cardInput ?? {}) as Record<string, unknown>;
  const teams = Array.isArray(input.teams) ? (input.teams as Array<Record<string, unknown>>) : [];
  return (
    !!draft.sourceMatchIsJunior || input.junior === true || teams.some((t) => t?.junior === true)
  );
}

/**
 * Whether slide `key` of a set draft takes only junior stock: a junior slide,
 * any page of a junior carousel (its cover and sponsors too), or any slide of
 * a junior list or card made into pages.
 */
export function slideTakesJuniorStock(
  draft: Pick<SocialDraftRow, "sourceMatchIsJunior" | "cardInput">,
): (key: string) => boolean {
  const carousel = readQueuedCarousel(draft.cardInput);
  if (!carousel) {
    const junior = draftIsJunior(draft);
    return () => junior;
  }
  const juniorSet = isJuniorCarousel(carousel);
  const junior = new Set(carousel.slides.filter((s) => s.junior).map((s) => s.id));
  return (key) => juniorSet || junior.has(key) || draftIsJunior(draft);
}

/** The club's library photos with these ids, as the library lists them. */
async function libraryPhotos(tenantId: number, ids: number[]): Promise<Map<number, PhotoDto>> {
  if (!ids.length) return new Map();
  const rows = await db
    .select()
    .from(clubPhotosTable)
    .where(and(eq(clubPhotosTable.tenantId, tenantId), inArray(clubPhotosTable.id, ids)));
  return new Map((await presentPhotos(tenantId, rows)).map((p) => [p.id, p]));
}

/** Whether a library photo is approved junior stock. */
const isStock = (p: PhotoDto) => juniorStockPhotos([p]).length === 1;

/**
 * A set design's slide photos as they may be saved: each one this club's
 * library photo at that address, a junior slide's approved junior stock, its
 * framing taken from the library (the photo's focus box, or its player's
 * area). Throws {@link SlidePhotoError} for any other; the design is
 * returned unchanged when it holds none.
 */
export async function checkedSlidePhotos(
  tenantId: number,
  draft: Pick<SocialDraftRow, "sourceMatchIsJunior" | "cardInput">,
  doc: SetDocument,
): Promise<SetDocument> {
  const choices = Object.entries(doc.arrangement?.ownPhotos ?? {});
  if (!choices.length) return doc;
  const photos = await libraryPhotos(tenantId, [...new Set(choices.map(([, c]) => c.photoId))]);
  const juniorOnly = slideTakesJuniorStock(draft);
  const ownPhotos: Record<string, SlidePhoto> = {};
  for (const [key, choice] of choices) {
    const photo = photos.get(choice.photoId);
    if (!photo || photo.url !== choice.url)
      throw new SlidePhotoError("That photo isn't in the club's photo library any more.");
    if (juniorOnly(key) && !isStock(photo))
      throw new SlidePhotoError(
        "A junior slide shows only the club's approved junior stock images. Pick one of those.",
      );
    ownPhotos[key] = slidePhotoChoice(photo, choice.playerId ? [choice.playerId] : []);
  }
  return { ...doc, arrangement: { ...doc.arrangement!, ownPhotos } };
}

/**
 * The slide photos a render draws, by slide key, and the approved junior
 * stock among them (the ids `applySlidePhoto` lets onto a junior slide).
 * A choice that no longer passes the save check is left out (fails closed).
 */
export async function renderSlidePhotos(
  tenantId: number,
  draft: Pick<SocialDraftRow, "sourceMatchIsJunior" | "cardInput">,
  doc: SetDocument,
): Promise<{ choices: Record<string, SlidePhoto>; juniorStock: Set<number> }> {
  const all = slidePhotos(doc);
  const entries = Object.entries(all);
  if (!entries.length) return { choices: {}, juniorStock: new Set() };
  const photos = await libraryPhotos(tenantId, [...new Set(entries.map(([, c]) => c.photoId))]);
  const juniorOnly = slideTakesJuniorStock(draft);
  const choices: Record<string, SlidePhoto> = {};
  const juniorStock = new Set<number>();
  for (const [key, choice] of entries) {
    const photo = photos.get(choice.photoId);
    if (!photo || photo.url !== choice.url) continue;
    const stock = isStock(photo);
    if (stock) juniorStock.add(photo.id);
    if (juniorOnly(key) && !stock) continue;
    choices[key] = choice;
  }
  return { choices, juniorStock };
}

// ── The pool Random draws from ──────────────────────────────────────────────

/** What the editor's Change photo needs for one slide (or a single card). */
export type SlidePhotoPool = {
  /** Only approved junior stock may go on it. */
  junior: boolean;
  /** The photos the automatic pick draws from, for Random. */
  photoIds: number[];
  /** The slide's linked senior players (their tag boxes frame a photo). */
  playerIds: number[];
};

const linked = (ids: readonly (number | null | undefined)[]) => [
  ...new Set(ids.filter((id): id is number => id != null && id > 0 && !isFillInPlayerId(id))),
];

/** A fixture's published side, its linked senior players. */
async function fixturePlayers(tenantId: number, fixtureId: number): Promise<number[]> {
  const [row] = await db
    .select({ players: teamListsTable.players })
    .from(teamListsTable)
    .where(and(eq(teamListsTable.tenantId, tenantId), eq(teamListsTable.fixtureId, fixtureId)));
  return row ? linked(row.players.map((p) => p.playerId)) : [];
}

/** The slide's own input and content, for its grade and side. */
function slideSource(
  draft: Pick<SocialDraftRow, "cardInput">,
  key: string | null,
): { input: Record<string, unknown>; fixtureId: number | null } {
  const input = (draft.cardInput ?? {}) as Record<string, unknown>;
  const carousel = readQueuedCarousel(draft.cardInput);
  if (carousel && key) {
    const slide = carousel.slides.find((s) => s.id === key);
    if (!slide) return { input: {}, fixtureId: null };
    const content = slide.content as { fixtureId?: unknown; junior?: unknown } | undefined;
    // A senior game slide's own fixture (a team list); never a junior one.
    const fixtureId =
      !slide.junior &&
      isRepeatSlot(carouselSlideSlot(slide.input)) &&
      content?.junior === false &&
      Number.isSafeInteger(content.fixtureId)
        ? Number(content.fixtureId)
        : null;
    return { input: slide.input, fixtureId };
  }
  // A list's slide: its own input, as the set plans it (a team's grade).
  if (key) {
    const planned = planCardSet(input as SetInput, { cover: true }).find((s) => s.key === key);
    if (planned) return { input: planned.input as Record<string, unknown>, fixtureId: null };
  }
  return { input, fixtureId: null };
}

/**
 * Slide `key`'s photo pool (`null`: a single card's own photo). A junior
 * slide or card: the club's approved junior stock. Otherwise the automatic
 * pick's order: the slide's players' tagged library photos (a Team List's
 * selected side, or the card's own player), else photos of its grade.
 */
export async function slidePhotoPool(
  tenantId: number,
  draft: Pick<
    SocialDraftRow,
    "sourceMatchIsJunior" | "cardInput" | "sourceKey" | "subjectPlayerId"
  >,
  key: string | null,
): Promise<SlidePhotoPool> {
  const junior = key ? slideTakesJuniorStock(draft)(key) : draftIsJunior(draft);
  if (junior) {
    const rows = await db
      .select()
      .from(clubPhotosTable)
      .where(
        and(
          eq(clubPhotosTable.tenantId, tenantId),
          eq(clubPhotosTable.juniorStock, true),
          isNull(clubPhotosTable.grade),
        ),
      );
    const stock = juniorStockPhotos(await presentPhotos(tenantId, rows));
    return { junior, photoIds: stock.map((p) => p.id), playerIds: [] };
  }
  const { input, fixtureId } = slideSource(draft, key);
  let playerIds: number[] = [];
  if (fixtureId != null) playerIds = await fixturePlayers(tenantId, fixtureId);
  else if (!key) {
    const fixture = Number(/^teamlist:(\d+)$/.exec(draft.sourceKey ?? "")?.[1]);
    if (Number.isInteger(fixture)) playerIds = await fixturePlayers(tenantId, fixture);
    else playerIds = linked([draft.subjectPlayerId]);
  }
  if (playerIds.length) {
    const tagged = await db
      .selectDistinct({ id: clubPhotoPlayersTable.photoId })
      .from(clubPhotoPlayersTable)
      .innerJoin(clubPhotosTable, eq(clubPhotosTable.id, clubPhotoPlayersTable.photoId))
      .where(
        and(
          eq(clubPhotoPlayersTable.tenantId, tenantId),
          eq(clubPhotosTable.tenantId, tenantId),
          inArray(clubPhotoPlayersTable.playerId, playerIds),
        ),
      );
    if (tagged.length)
      return { junior, photoIds: tagged.map((r) => r.id).sort((a, b) => a - b), playerIds };
  }
  const grade = draftPhotoGrade(input);
  if (!grade) return { junior, photoIds: [], playerIds };
  const graded = await db
    .select({ id: clubPhotosTable.id })
    .from(clubPhotosTable)
    .where(and(eq(clubPhotosTable.tenantId, tenantId), eq(clubPhotosTable.grade, grade)));
  return { junior, photoIds: graded.map((r) => r.id).sort((a, b) => a - b), playerIds };
}
