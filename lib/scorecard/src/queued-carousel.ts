/** Frozen, admin-authored carousel payload shared by queue previews and publishing.
 * No browser types: this module is also used by the API server.
 *
 * Version 2 (ADR-010 P2, P7) saves content slides as their content snapshot
 * (`content` + `visibleFields`): what was approved is what posts. Each slide's
 * render input is derived from that content when the carousel is read, so
 * every reader (queue preview, publish render, junior photo check) still sees
 * `slide.input`. Version 1 payloads are read and rendered unchanged. */
import { contentInput } from "./card-content/render-input";
import { readCardContent } from "./card-content/validate";
import { readContentOverride, type ContentOverride } from "./card-content/settings";
import type { CardContent } from "./card-content/types";
import {
  LEGACY_CAROUSEL_PACK_ID,
  isCarouselPackId,
  isLegacyPackId,
  resolveActivePackId,
} from "./pack-ids";

export type CarouselSize = "square" | "portrait" | "story" | "landscape";
export {
  CAROUSEL_PACK_IDS,
  LEGACY_CAROUSEL_PACK_ID,
  LEGACY_PACK_IDS,
  FALLBACK_PACK_ID,
  ACTIVE_PACK_IDS,
  isCarouselPackId,
  isLegacyPackId,
  resolveActivePackId,
} from "./pack-ids";
/** Only absence means legacy. Explicit invalid selections must not fall back. */
export function carouselPackId(carousel: { packId?: unknown }): string {
  if (carousel.packId === undefined) return LEGACY_CAROUSEL_PACK_ID;
  if (!isCarouselPackId(carousel.packId))
    throw new Error("Unknown carousel design pack. Choose a registered built-in pack.");
  return carousel.packId;
}
export type CarouselSetType = "matchDay" | "teamList" | "results" | "matchSummary";
export const CAROUSEL_LABELS: Record<CarouselSetType, string> = {
  matchDay: "Match day",
  teamList: "Team lists",
  results: "Results",
  matchSummary: "Match summaries",
};
export interface QueuedCarouselSlide {
  id: string;
  label: string;
  /** The render input. Version 2 content slides derive it from `content` when read. */
  input: Record<string, unknown>;
  data: Record<string, unknown>;
  junior: boolean;
  sponsorsOn: boolean;
  warnings: string[];
  /** Version 2: the content this slide was built from. */
  content?: CardContent;
  /** Version 2: the content fields this slide shows. */
  visibleFields?: string[];
  /** Version 2: the photo chosen for the slide (a junior stock image's id authorises it). */
  photoId?: number | null;
}
export interface QueuedCarousel {
  version: 1 | 2;
  packId?: string;
  setType?: CarouselSetType;
  submissionId: string;
  size: CarouselSize;
  /** Version 2: this carousel's change to the club's content choices. */
  contentOverride?: ContentOverride;
  slides: QueuedCarouselSlide[];
}
const object = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * A content slide's render input: the content's fields (hidden ones blanked)
 * plus the slide's render flags. The Weekend Carousel previews with this and
 * the saved carousel renders with it, so preview and post match.
 */
export function contentSlideInput(slide: {
  content: CardContent;
  visibleFields: readonly string[];
  photoId?: number | null;
  data: Record<string, unknown>;
  junior: boolean;
}): Record<string, unknown> {
  const { content, data } = slide;
  const visible = new Set(slide.visibleFields);
  const hasPhoto = !!data.photoUrl;
  const input = contentInput(content, visible, { hasCoverPhoto: hasPhoto });
  // One match per slide (a fixture, result or team list); bookends and day slides are as built.
  if (content.page !== "fixture" && content.page !== "result" && content.page !== "team")
    return input;
  return {
    ...input,
    carouselContent: true,
    // A junior slide shows a photo only behind the club's own stock image (ADR-007).
    ...(slide.junior && hasPhoto && slide.photoId != null
      ? { juniorPhotoAllowed: true, juniorStockPhotoId: slide.photoId }
      : {}),
  };
}

/** A version 2 slide made whole: content slides get their derived input; null when invalid. */
function readSlideV2(s: unknown): Record<string, unknown> | null {
  if (!object(s)) return null;
  if (s.content === undefined) {
    // Slides saved before their kind moved onto the content pipeline keep their frozen input.
    return s.visibleFields === undefined && object(s.input) ? s : null;
  }
  const content = readCardContent(s.content);
  if (
    !content ||
    s.input !== undefined ||
    !Array.isArray(s.visibleFields) ||
    !s.visibleFields.every((f) => typeof f === "string") ||
    (s.photoId != null && (!Number.isSafeInteger(s.photoId) || Number(s.photoId) <= 0)) ||
    !object(s.data) ||
    typeof s.junior !== "boolean" ||
    // Juniors isolation: a slide's junior flag is its content's.
    ("junior" in content && content.junior !== s.junior)
  )
    return null;
  return {
    ...s,
    input: contentSlideInput({
      content,
      visibleFields: s.visibleFields as string[],
      photoId: s.photoId as number | null | undefined,
      data: s.data,
      junior: s.junior,
    }),
  };
}

/**
 * Invalid persisted payloads must never fall through to a single-card export.
 * A legacy pack id (`LEGACY_PACK_IDS`) reads as Club Kit; the stored payload is
 * left as saved.
 */
export function readQueuedCarousel(input: unknown): QueuedCarousel | null {
  if (!object(input) || !object(input.weekendCarousel)) return null;
  let c = input.weekendCarousel;
  if (isLegacyPackId(c.packId)) c = { ...c, packId: resolveActivePackId(c.packId as string) };
  if (c.version === 2) {
    if (!Array.isArray(c.slides) || (c.contentOverride !== undefined && !object(c.contentOverride)))
      return null;
    const slides = c.slides.map(readSlideV2);
    if (slides.some((s) => s === null)) return null;
    const override = readContentOverride("matchDay", c.contentOverride);
    const { contentOverride: _dropped, ...rest } = c;
    c = { ...rest, ...(override ? { contentOverride: override } : {}), slides };
  }
  if (c.packId !== undefined && !isCarouselPackId(c.packId)) return null;
  if (c.setType !== undefined && !Object.hasOwn(CAROUSEL_LABELS, String(c.setType))) return null;
  const kind =
    c.setType === "teamList"
      ? "teamList"
      : c.setType === "results" || c.setType === "matchSummary"
        ? "matchSummary"
        : "matchDay";
  if (
    (c.version !== 1 && c.version !== 2) ||
    typeof c.submissionId !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(c.submissionId) ||
    !["square", "portrait", "story", "landscape"].includes(String(c.size)) ||
    !Array.isArray(c.slides) ||
    c.slides.length < 3 ||
    c.slides.length > 20
  )
    return null;
  const ids = new Set<string>();
  for (const [index, s] of c.slides.entries()) {
    const bookend = index === 0 || index === c.slides.length - 1;
    if (
      !object(s) ||
      typeof s.id !== "string" ||
      !s.id ||
      ids.has(s.id) ||
      typeof s.label !== "string" ||
      !s.label ||
      !object(s.input) ||
      s.input.kind !== (bookend ? "matchDay" : kind) ||
      "weekendCarousel" in s.input ||
      !object(s.data) ||
      typeof s.junior !== "boolean" ||
      typeof s.sponsorsOn !== "boolean" ||
      !Array.isArray(s.warnings) ||
      !s.warnings.every((w) => typeof w === "string")
    )
      return null;
    if (!bookend && "carouselPage" in s.input) return null;
    // A junior day slide (P3) holds junior rows only, of a shape its layout prints.
    if (
      !bookend &&
      "carouselDay" in s.input &&
      (!s.junior || s.input.junior !== true || !validDaySlide(s.input.carouselDay, kind))
    )
      return null;
    if (
      !bookend &&
      kind === "teamList" &&
      (!Array.isArray(s.input.players) ||
        !s.input.players.length ||
        !s.input.players.every(
          (p) => object(p) && typeof p.surname === "string" && typeof p.order === "number",
        ))
    )
      return null;
    if (
      !bookend &&
      kind === "matchSummary" &&
      !("carouselDay" in s.input) &&
      (!object(s.input.club) ||
        !object(s.input.opposition) ||
        !Array.isArray(s.input.innings) ||
        typeof s.input.result !== "string" ||
        !s.input.innings.every(
          (i) => object(i) && Array.isArray(i.topBatters) && Array.isArray(i.topBowlers),
        ))
    )
      return null;
    if (
      s.junior &&
      ((!bookend && s.input.junior !== true) ||
        (s.data.photoUrl &&
          (s.input.juniorPhotoAllowed !== true ||
            !Number.isSafeInteger(s.input.juniorStockPhotoId) ||
            Number(s.input.juniorStockPhotoId) <= 0)))
    )
      return null;
    ids.add(s.id);
    const t = s.data.photoTransform;
    if (
      t != null &&
      (!object(t) ||
        !["focalX", "focalY", "zoom"].every(
          (k) => typeof t[k] === "number" && Number.isFinite(t[k]),
        ) ||
        Number(t.focalX) < 0 ||
        Number(t.focalX) > 1 ||
        Number(t.focalY) < 0 ||
        Number(t.focalY) > 1 ||
        Number(t.zoom) < 1 ||
        Number(t.zoom) > 3)
    )
      return null;
  }
  const first = c.slides[0] as QueuedCarouselSlide;
  const last = c.slides[c.slides.length - 1] as QueuedCarouselSlide;
  if (
    !object(first.input.carouselPage) ||
    first.input.carouselPage.page !== "title" ||
    !object(last.input.carouselPage) ||
    last.input.carouselPage.page !== "sponsors"
  )
    return null;
  return c as unknown as QueuedCarousel;
}

const str = (v: unknown): v is string => typeof v === "string";

/** A day slide's rows: Match Day fixtures or results, every field a display string. */
function validDaySlide(day: unknown, kind: string): boolean {
  if (!object(day) || !str(day.heading)) return false;
  const rows = kind === "matchDay" ? day.fixtures : kind === "matchSummary" ? day.results : null;
  const keys =
    kind === "matchDay"
      ? ["grade", "opposition", "monogram", "homeAway", "venue", "startTime", "roundLabel"]
      : ["grade", "opposition", "clubScore", "oppositionScore", "resultWord", "result", "winner"];
  return (
    Array.isArray(rows) &&
    rows.length >= 2 &&
    rows.every(
      (r) =>
        object(r) &&
        keys.every((k) => str(r[k])) &&
        (r.crestUrl === null || r.crestUrl === undefined || str(r.crestUrl)),
    )
  );
}

export function queuedSlideAdjustments(slide: QueuedCarouselSlide, size: CarouselSize) {
  const t = slide.data.photoTransform;
  return object(t) ? { photo: { [size]: t } } : null;
}
