/** Frozen, admin-authored carousel payload shared by queue previews and publishing.
 * No browser types: this module is also used by the API server. */
export type CarouselSize = "square" | "portrait" | "story" | "landscape";
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
  if (c.version !== 1 || typeof c.submissionId !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(c.submissionId) ||
    !["square", "portrait", "story", "landscape"].includes(String(c.size)) ||
    !Array.isArray(c.slides) || c.slides.length < 3 || c.slides.length > 20) return null;
  const ids = new Set<string>();
  for (const s of c.slides) {
    if (!object(s) || typeof s.id !== "string" || !s.id || ids.has(s.id) ||
      typeof s.label !== "string" || !s.label || !object(s.input) || s.input.kind !== "matchDay" ||
      "weekendCarousel" in s.input || !object(s.data) ||
      typeof s.junior !== "boolean" || typeof s.sponsorsOn !== "boolean" ||
      !Array.isArray(s.warnings) || !s.warnings.every(w => typeof w === "string")) return null;
    ids.add(s.id);
    const t = s.data.photoTransform;
    if (t != null && (!object(t) || !["focalX", "focalY", "zoom"].every(k =>
      typeof t[k] === "number" && Number.isFinite(t[k])) ||
      Number(t.focalX) < 0 || Number(t.focalX) > 1 || Number(t.focalY) < 0 ||
      Number(t.focalY) > 1 || Number(t.zoom) < 1 || Number(t.zoom) > 3)) return null;
  }
  const first = c.slides[0] as QueuedCarouselSlide;
  const last = c.slides[c.slides.length - 1] as QueuedCarouselSlide;
  if (!object(first.input.carouselPage) || first.input.carouselPage.page !== "title" ||
    !object(last.input.carouselPage) || last.input.carouselPage.page !== "sponsors") return null;
  return c as unknown as QueuedCarousel;
}

export function queuedSlideAdjustments(slide: QueuedCarouselSlide, size: CarouselSize) {
  const t = slide.data.photoTransform;
  return object(t) ? { photo: { [size]: t } } : null;
}
