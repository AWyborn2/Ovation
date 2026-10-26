/**
 * A carousel set draft's slides with its set design (carousel set editor
 * plan, part 3), as the queue previews them, the set editor edits them and
 * the server posts them (`draft-render.ts` does the same on the server).
 *
 * - A queued carousel (ADR-010 v3): its stored slides in order, each drawn by
 *   its page, plus a slide for a design page no stored slide draws yet (one
 *   just added in the editor); the design's arrangement then orders them.
 * - A Round Team Lists draft: its cover and a slide per team, worked out from
 *   its data, on the set's pages, in the design's arrangement.
 *
 * A junior set is junior on every slide (C4).
 */
import {
  arrangeSlides,
  expandSetSlides,
  isSetDocument,
  mapCarouselSlides,
  setPageRenderDocument,
  slideInputFor,
  type SetDocument,
  type SetPage,
} from "@workspace/scorecard/kind-templates";
import {
  carouselSlideData,
  readQueuedCarousel,
  type QueuedCarousel,
} from "@workspace/scorecard/queued-carousel";
import type { CardAdjustments, PackCardData } from "@/lib/pack-render";
import type { ShareCardInput } from "@/lib/share-card";
import { planCardSet } from "@/lib/card-sets/plan";

type Input = Record<string, unknown>;

/** One slide of a set draft, ready to draw. */
export type SetDraftSlide = {
  key: string;
  label: string;
  page: SetPage;
  input: ShareCardInput;
  /** The card data: a stored slide's own, else the club's (`brand`). */
  data: PackCardData;
  junior: boolean;
  sponsorsOn: boolean;
  /** A repeating page's item number. */
  item?: number;
  /** Removable from the set (every slide is; a design page goes with its page). */
  design: boolean;
};

export type SetDraftSource = {
  cardInput: unknown;
  sourceMatchIsJunior?: boolean;
  adjustments?: unknown;
};

/**
 * Which layout a draft's set is (`null`: not a set the editor opens). `pages`:
 * a card made into a free set of design pages, each drawn with the card's own
 * data (full draft editor plan, stage 2).
 */
export function setDraftLayout(draft: SetDraftSource): "carousel" | "list" | "pages" | null {
  if (isSetDocument(draft.adjustments) && draft.adjustments.set === "free") return "pages";
  const carousel = readQueuedCarousel(draft.cardInput);
  if (carousel) return carousel.version === 3 ? "carousel" : null;
  const input = (draft.cardInput ?? {}) as Input;
  return input.kind === "teamListRound" && !("weekendCarousel" in input) ? "list" : null;
}

/** The club's sponsors as a sponsors page lists them. */
const sponsorRows = (data: PackCardData) =>
  (data.sponsors ?? []).map((s) => ({ name: s.name, logoUrl: s.logoUrl ?? "" }));

/**
 * A set draft's slides in posting order. `brand` is the club's card data (the
 * Studio's), used where a slide stores none.
 */
export function setDraftSlides(
  draft: SetDraftSource,
  doc: SetDocument,
  brand: PackCardData,
): SetDraftSlide[] {
  const carousel = readQueuedCarousel(draft.cardInput);
  if (carousel) return carouselSlides(carousel, doc, brand);
  const input = (draft.cardInput ?? {}) as ShareCardInput;
  const junior = !!draft.sourceMatchIsJunior || (input as { junior?: boolean }).junior === true;
  const items = planCardSet(input, { cover: true }).map((s) => {
    const grade = (s.input as { grade?: unknown }).grade;
    return {
      key: s.key,
      slot: s.role === "cover" ? ("cover" as const) : ("team" as const),
      input: s.input as unknown as Input,
      // A team's slide is named by its grade.
      ...(s.role !== "cover" && typeof grade === "string" && grade ? { label: grade } : {}),
    };
  });
  return expandSetSlides(doc, items, { sponsors: sponsorRows(brand), junior }).map((s) => {
    const slideJunior = junior || s.input.junior === true;
    return {
      key: s.key,
      label: s.label,
      page: s.page,
      input: s.input as unknown as ShareCardInput,
      // A junior slide shows a photo only behind the server's marker (ADR-007).
      data:
        slideJunior && s.input.juniorPhotoAllowed !== true ? { ...brand, photoUrl: null } : brand,
      junior: slideJunior,
      sponsorsOn: true,
      ...(s.item ? { item: s.item } : {}),
      design: s.page.slot === "page",
    };
  });
}

function carouselSlides(
  carousel: QueuedCarousel,
  doc: SetDocument,
  brand: PackCardData,
): SetDraftSlide[] {
  const mapped = mapCarouselSlides(doc, carousel.slides);
  const byId = new Map(carousel.slides.map((s) => [s.id, s]));
  const allJunior = carousel.slides.length > 0 && carousel.slides.every((s) => s.junior);
  const drawn = new Set(carousel.slides.map((s) => s.pageId).filter(Boolean));
  const cover = carousel.slides.find((s) => Object.keys(s.data).length > 0);
  const out: SetDraftSlide[] = mapped.slides.map((s) => {
    const stored = byId.get(s.key)!;
    const data = carouselSlideData(carousel, stored);
    return {
      key: s.key,
      label: s.label,
      page: s.page,
      input: s.input as unknown as ShareCardInput,
      data: (Object.keys(data).length ? data : brand) as PackCardData,
      junior: stored.junior,
      sponsorsOn: stored.sponsorsOn,
      ...(s.item ? { item: s.item } : {}),
      design: stored.pageId !== undefined && stored.content === undefined,
    };
  });
  // A design page just added: a slide drawn with the set's brand.
  for (const page of doc.pages) {
    if (page.slot !== "page" || drawn.has(page.id)) continue;
    const coverData = cover ? carouselSlideData(carousel, { ...cover, pageId: "x", data: {} }) : {};
    out.push({
      key: `page:${page.id}`,
      label: page.name?.trim() || "Page",
      page,
      input: slideInputFor(page, {
        kind: page.kind,
        ...(allJunior ? { junior: true } : {}),
      }) as unknown as ShareCardInput,
      data: (Object.keys(coverData).length ? coverData : brand) as PackCardData,
      junior: allJunior,
      sponsorsOn: false,
      design: true,
    });
  }
  return arrangeSlides(out, doc.arrangement);
}

/** What draws a set draft's slide: its page's document. */
export const slideDocument = (doc: SetDocument, slide: Pick<SetDraftSlide, "page">) =>
  setPageRenderDocument(doc, slide.page) as unknown as CardAdjustments;

/** A draft's set design, if it holds one. */
export const draftSetDocument = (adjustments: unknown): SetDocument | null =>
  isSetDocument(adjustments) ? adjustments : null;
