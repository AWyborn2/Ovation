/**
 * Photos inside a junior card's or junior set's design (ADR-007, #638, studio
 * retest 17 Nov 2026): every photo binding resolves only to the club's
 * approved junior stock, or to nothing. A club library photo held in the
 * design (an image layer, an image override, a page background) is dropped
 * unless it is approved junior stock; a junior player's photo is dropped
 * unless it is the card's own photo the server cleared. The club's uploads
 * (logos, artwork) are not photos and stay.
 *
 * Shared by the server (on save and on post) and the web (every place a
 * junior draft is drawn, Download included), so both draw the same thing.
 */
import { readQueuedCarousel } from "./queued-carousel";
import { carouselSlideSlot } from "./kind-templates/set-slides";
import { isRepeatSlot } from "./kind-templates/set-document";

/** A stored image URL as its object path, so `/api/storage/objects/x` and `/objects/x` match. */
export function photoKey(url: string): string {
  const at = url.indexOf("/objects/");
  return at < 0 ? url : url.slice(at).split(/[?#]/)[0]!;
}

/** The club photo library's storage prefix (senior photos, junior stock, junior players). */
const LIBRARY_PREFIX = "/objects/library/";

/** A junior player's photo: under its private prefix, or through its admin-only route. */
export const isJuniorPlayerPhotoUrl = (url: string): boolean =>
  /\/juniors\/photos\/\d+/.test(url) || photoKey(url).startsWith(`${LIBRARY_PREFIX}juniors/`);

/** Every string in a value that could be a stored photo (an object or a junior photo route). */
export function photoStrings(value: unknown, out = new Set<string>()): Set<string> {
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
 * cover and sponsors pages are junior surfaces too.
 */
export function isJuniorDesign(d: {
  sourceMatchIsJunior?: boolean | null;
  cardInput: unknown;
}): boolean {
  if (d.sourceMatchIsJunior) return true;
  const input = d.cardInput as Record<string, unknown> | null | undefined;
  if (input?.junior === true) return true;
  const carousel = readQueuedCarousel(input);
  if (!carousel) return false;
  const game = (s: (typeof carousel.slides)[number]) =>
    !s.id.startsWith("page:") && isRepeatSlot(carouselSlideSlot(s.input));
  return (
    carousel.slides.some((s) => s.junior) && !carousel.slides.some((s) => !s.junior && game(s))
  );
}

/** What decides a junior design's photos. */
export type JuniorPhotoRule = {
  /** The club's approved junior stock images (full and thumbnail), as `photoKey`s. */
  approved: ReadonlySet<string>;
  /** Other known library photos (any club's), as `photoKey`s; the library prefix counts too. */
  library?: ReadonlySet<string>;
  /** Other known junior player photos, as `photoKey`s. */
  juniorPlayers?: ReadonlySet<string>;
};

/** The card's own junior photo the server cleared, if any (it may show). */
export function clearedOwnPhoto(d: {
  cardInput: unknown;
  photoUrl?: string | null;
}): string | null {
  const input = d.cardInput as Record<string, unknown> | null | undefined;
  return input?.juniorPhotoAllowed === true && d.photoUrl ? photoKey(d.photoUrl) : null;
}

/**
 * A junior draft's design as it may be drawn, saved or posted (fails closed).
 * A senior draft's design comes back as it is.
 */
export function juniorSafeDesignWith(
  draft: { sourceMatchIsJunior?: boolean | null; cardInput: unknown; photoUrl?: string | null },
  design: unknown,
  rule: JuniorPhotoRule,
): { design: unknown; removed: number } {
  if (design == null || !isJuniorDesign(draft)) return { design, removed: 0 };
  const own = clearedOwnPhoto(draft);
  const isBad = (url: string) => {
    const key = photoKey(url);
    if (own !== null && key === own) return false;
    if (isJuniorPlayerPhotoUrl(url) || rule.juniorPlayers?.has(key)) return true;
    const library = key.startsWith(LIBRARY_PREFIX) || !!rule.library?.has(key);
    return library && !rule.approved.has(key);
  };
  const { value, removed } = withoutPhotos(design, isBad);
  return { design: removed ? value : design, removed };
}
