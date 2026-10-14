/** Frozen, admin-authored carousel payload shared by queue previews and publishing.
 * No browser types: this module is also used by the API server. */
export type CarouselSize = "square" | "portrait" | "story" | "landscape";
/** Built-in identities only; never uploaded backgrounds or layer templates. */
export const CAROUSEL_PACK_IDS = [
  "broadcast-dark-v1",
  "gold-foil-v1",
  "bold-type-v1",
  "neon-night-v1",
  "sunset-v1",
  "club-kit-v1",
] as const;
export const LEGACY_CAROUSEL_PACK_ID = "club-kit-v1";
export function isCarouselPackId(value: unknown): value is (typeof CAROUSEL_PACK_IDS)[number] {
  return typeof value === "string" && (CAROUSEL_PACK_IDS as readonly string[]).includes(value);
}
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
  input: Record<string, unknown>;
  data: Record<string, unknown>;
  junior: boolean;
  sponsorsOn: boolean;
  warnings: string[];
}
export interface QueuedCarousel {
  version: 1;
  packId?: string;
  setType?: CarouselSetType;
  submissionId: string;
  size: CarouselSize;
  slides: QueuedCarouselSlide[];
}
const object = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Invalid persisted payloads must never fall through to a single-card export. */
export function readQueuedCarousel(input: unknown): QueuedCarousel | null {
  if (!object(input) || !object(input.weekendCarousel)) return null;
  const c = input.weekendCarousel;
  if (c.packId !== undefined && !isCarouselPackId(c.packId)) return null;
  if (c.setType !== undefined && !Object.hasOwn(CAROUSEL_LABELS, String(c.setType))) return null;
  const kind =
    c.setType === "teamList"
      ? "teamList"
      : c.setType === "results" || c.setType === "matchSummary"
        ? "matchSummary"
        : "matchDay";
  if (
    c.version !== 1 ||
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
      (!object(s.input.club) ||
        !object(s.input.opposition) ||
        !Array.isArray(s.input.innings) ||
        typeof s.input.result !== "string" ||
        !s.input.innings.every(
          (i) => object(i) && Array.isArray(i.topBatters) && Array.isArray(i.topBowlers),
        ))
    )
      return null;
    if (s.junior && (s.data.photoUrl || (!bookend && s.input.junior !== true))) return null;
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

export function queuedSlideAdjustments(slide: QueuedCarouselSlide, size: CarouselSize) {
  const t = slide.data.photoTransform;
  return object(t) ? { photo: { [size]: t } } : null;
}
