/**
 * One slide's own photo in a set draft ("Change photo", Nov 2026).
 *
 * A set draft's slides take their photo automatically: a queued carousel's
 * slide its stored pick, a list or a set of pages the draft's own photo. The
 * admin can give one slide a photo of its own from the club's library. It is
 * stored in the set design as `arrangement.ownPhotos` (slide key → choice), for
 * every size at once, as the automatic pick is; the other slides keep theirs.
 * Clearing the entry ("Back to automatic photo") draws the slide as before.
 *
 * The choice is a snapshot (KTD6): the photo's id, its address and its focus
 * box (or the box of the tagged player it was picked for), checked against the
 * library by the server on save and again on every render. A position the
 * admin set for the slide (Photo position) is the design's and is untouched,
 * so it carries over to the new photo; without one the new photo's own focus
 * box frames it.
 *
 * Juniors (ADR-007): a junior slide takes only one of the club's approved
 * junior stock images. Readers pass the stock ids they know to be approved;
 * a junior choice not among them is ignored (fails closed), and the server
 * refuses one on save.
 */
import type { PhotoFocus } from "../photo-focus";
import type { SetArrangement } from "./set-document";

/** A slide's own photo: a library photo, by id and address, with its framing. */
export type SlidePhoto = {
  photoId: number;
  url: string;
  /** The tagged player the photo was picked for (their area frames it). */
  playerId?: number;
  /** The photo's focus box (or the player's area) with its size; absent = centred. */
  focus?: PhotoFocus;
};

type WithArrangement = { arrangement?: SetArrangement };

const object = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const positiveInt = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) > 0;

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Whether a stored value is a slide photo choice of the right shape. */
export function isSlidePhoto(v: unknown): v is SlidePhoto {
  if (!object(v) || !positiveInt(v.photoId) || typeof v.url !== "string" || !v.url) return false;
  if (v.url.length > 2048) return false;
  if (Object.keys(v).some((k) => !["photoId", "url", "playerId", "focus"].includes(k)))
    return false;
  if (v.playerId !== undefined && !positiveInt(v.playerId)) return false;
  if (v.focus !== undefined) {
    const f = v.focus;
    if (!object(f) || !object(f.box) || !finite(f.width) || !finite(f.height)) return false;
    if (!(f.width > 0) || !(f.height > 0)) return false;
    const b = f.box;
    if (![b.x, b.y, b.w, b.h].every((n) => finite(n) && n >= 0 && n <= 1)) return false;
  }
  return true;
}

/** Slide `key`'s own photo, if it has one (a deleted slide's is ignored). */
export function slidePhotoFor(doc: WithArrangement, key: string): SlidePhoto | null {
  const a = doc.arrangement;
  if (!a?.ownPhotos || a.removed.includes(key)) return null;
  const choice = a.ownPhotos[key];
  return isSlidePhoto(choice) ? choice : null;
}

/** Every live slide's own photo, by slide key. */
export function slidePhotos(doc: WithArrangement): Record<string, SlidePhoto> {
  const a = doc.arrangement;
  const removed = new Set(a?.removed ?? []);
  return Object.fromEntries(
    Object.entries(a?.ownPhotos ?? {}).filter(([k, v]) => !removed.has(k) && isSlidePhoto(v)),
  );
}

/**
 * The arrangement with slide `key`'s own photo set, or cleared (`null`,
 * "Back to automatic photo"). Nothing else in it changes.
 */
export function withSlidePhotoArrangement(
  arrangement: SetArrangement | undefined,
  key: string,
  choice: SlidePhoto | null,
): SetArrangement | undefined {
  const ownPhotos = { ...(arrangement?.ownPhotos ?? {}) };
  if (choice) ownPhotos[key] = choice;
  else delete ownPhotos[key];
  const base = arrangement ?? { order: [], removed: [] };
  const { ownPhotos: _old, ...rest } = base;
  if (Object.keys(ownPhotos).length) return { ...rest, ownPhotos };
  // Nothing left: an arrangement that held only the photo choices goes too.
  const { order, removed, ...others } = rest;
  return !order.length && !removed.length && !Object.keys(others).length ? undefined : rest;
}

/** A set document with slide `key`'s own photo set or cleared. */
export function withSlidePhoto<D extends WithArrangement>(
  doc: D,
  key: string,
  choice: SlidePhoto | null,
): D {
  const arrangement = withSlidePhotoArrangement(doc.arrangement, key, choice);
  const { arrangement: _old, ...rest } = doc;
  return (arrangement ? { ...rest, arrangement } : rest) as D;
}

/**
 * The `ownPhotos` entries for slides the set still holds (`keys`): a slide
 * gone from the set takes its photo with it.
 */
export function liveOwnPhotos(
  arrangement: SetArrangement | undefined,
  keys: ReadonlySet<string>,
): Record<string, SlidePhoto> {
  return Object.fromEntries(
    Object.entries(arrangement?.ownPhotos ?? {}).filter(([k, v]) => keys.has(k) && isSlidePhoto(v)),
  );
}

/** A slide as the photo choice applies to it. */
export type SlidePhotoTarget<I, D> = { input: I; data: D; junior: boolean };

/**
 * A slide drawn with its own photo: the photo in the card data's photo (every
 * photo frame shows it, as the draft's own photo does), its framing, and on a
 * junior slide the server's marker that this photo is cleared for it. A
 * sourced photo layer shows the admin's choice too (an admin's pick wins on
 * every photo layer). A junior choice not among `juniorStock` (the club's
 * approved junior stock ids) is not applied: the slide draws as before.
 */
export function applySlidePhoto<I extends object, D extends object>(
  slide: SlidePhotoTarget<I, D>,
  choice: SlidePhoto | null | undefined,
  juniorStock: ReadonlySet<number> = new Set(),
): SlidePhotoTarget<I, D> {
  if (!choice) return slide;
  if (slide.junior && !juniorStock.has(choice.photoId)) return slide;
  const {
    photoFocus: _focus,
    layerPhotos: _layers,
    ...data
  } = slide.data as D & {
    photoFocus?: unknown;
    layerPhotos?: unknown;
  };
  return {
    junior: slide.junior,
    data: {
      ...data,
      photoUrl: choice.url,
      ...(choice.focus ? { photoFocus: choice.focus } : {}),
    } as unknown as D,
    input: slide.junior
      ? ({
          ...slide.input,
          juniorPhotoAllowed: true,
          juniorStockPhotoId: choice.photoId,
        } as I)
      : slide.input,
  };
}

// ── Picking (the editor's Change photo menu) ────────────────────────────────

/** A library photo as the picker reads it (`ClubPhoto`). */
export type PickablePhoto = {
  id: number;
  url: string;
  width: number;
  height: number;
  grade: string | null;
  playerIds: readonly number[];
  juniorStock?: boolean;
  focusBox?: { x: number; y: number; w: number; h: number } | null;
  playerAreas?: ReadonlyArray<{
    playerId: number;
    box: { x: number; y: number; w: number; h: number };
  }>;
};

/**
 * The photos a junior page may take: the club's approved junior stock, which
 * pictures no tagged player and belongs to no grade (`eligibleJuniorStockPhotos`).
 */
export function juniorStockPhotos<P extends PickablePhoto>(photos: readonly P[]): P[] {
  return photos.filter((p) => p.juniorStock === true && p.grade === null && !p.playerIds.length);
}

/** The photos a slide's photo may be: approved junior stock on a junior slide. */
export function allowedSlidePhotos<P extends PickablePhoto>(
  photos: readonly P[],
  junior: boolean,
): P[] {
  return junior ? juniorStockPhotos(photos) : [...photos];
}

/** The slide's tagged player on this photo with an area, if any. */
function framedPlayer(photo: PickablePhoto, playerIds: readonly number[]) {
  return (photo.playerAreas ?? []).find((a) => playerIds.includes(a.playerId)) ?? null;
}

/**
 * Whether a photo comes already framed for the slide: it has a focus box, or
 * a box for one of the slide's players (Focused only).
 */
export function isFocusedFor(photo: PickablePhoto, playerIds: readonly number[]): boolean {
  return !!photo.focusBox || !!framedPlayer(photo, playerIds);
}

/** Focused only: the allowed photos that are already framed for the slide. */
export function focusedSlidePhotos<P extends PickablePhoto>(
  photos: readonly P[],
  junior: boolean,
  playerIds: readonly number[],
): P[] {
  return allowedSlidePhotos(photos, junior).filter((p) => isFocusedFor(p, playerIds));
}

/**
 * The choice for a picked photo: its framing is the slide's player's area on
 * it when it has one, else its focus box, else none (centred).
 */
export function slidePhotoChoice(photo: PickablePhoto, playerIds: readonly number[]): SlidePhoto {
  const player = framedPlayer(photo, playerIds);
  const box = player?.box ?? photo.focusBox ?? null;
  const sized = photo.width > 0 && photo.height > 0;
  return {
    photoId: photo.id,
    url: photo.url,
    ...(player ? { playerId: player.playerId } : {}),
    ...(box && sized
      ? {
          focus: {
            box: { x: box.x, y: box.y, w: box.w, h: box.h },
            width: photo.width,
            height: photo.height,
          },
        }
      : {}),
  };
}

/**
 * Random: a photo from the automatic pick's pool (`poolIds`, the server's)
 * that the slide may take, never the one it shows now (by id or address).
 * Null when the pool holds no other photo. `random` is injectable for tests.
 */
export function randomSlidePhoto<P extends PickablePhoto>(
  photos: readonly P[],
  opts: {
    poolIds: readonly number[];
    junior: boolean;
    current?: { photoId?: number | null; url?: string | null } | null;
    random?: () => number;
  },
): P | null {
  const pool = new Set(opts.poolIds);
  const candidates = allowedSlidePhotos(photos, opts.junior).filter(
    (p) =>
      pool.has(p.id) &&
      p.id !== opts.current?.photoId &&
      !(opts.current?.url && p.url === opts.current.url),
  );
  if (!candidates.length) return null;
  const r = (opts.random ?? Math.random)();
  return candidates[Math.min(candidates.length - 1, Math.floor(r * candidates.length))]!;
}
