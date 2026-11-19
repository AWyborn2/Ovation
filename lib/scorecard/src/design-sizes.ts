/**
 * The sizes a stored design draws (portrait and story sizes plan, Stage 1;
 * round 9 B13), read from its document, never guessed. Shared by the server
 * (what a draft renders, posts and downloads at) and the web (what the
 * editor's Format menu, the share window and Download offer), so the two
 * can't disagree about an empty size.
 */
import {
  isDocumentV2,
  isSetDocument,
  normaliseDocument,
  pageForInput,
  sizesWithLayers,
  TEMPLATE_SIZE_ORDER,
  type LayerDocument,
  type PageKey,
  type TemplateSize,
} from "./kind-templates";
import { carouselTemplateKind, readQueuedCarousel } from "./queued-carousel";

/** A size's name, as Format and the messages read it. */
export const DESIGN_SIZE_LABEL: Record<TemplateSize, string> = {
  square: "Square",
  portrait: "Portrait",
  story: "Story",
  landscape: "Landscape",
};

/**
 * The sizes every one of `pages` that has layers puts a layer on, in standard
 * order (none when no page has any layers).
 */
export function pagesCoverage(pages: readonly LayerDocument[]): TemplateSize[] {
  const drawn = pages.filter((p) => Array.isArray(p.layers) && p.layers.length > 0);
  if (drawn.length === 0) return [];
  return TEMPLATE_SIZE_ORDER.filter((size) =>
    drawn.every((p) => sizesWithLayers(p).includes(size)),
  );
}

/**
 * The sizes a layer document covers for the cards `inputs` draw: a set
 * document's pages (every page with layers), a flat (v1) document as one
 * page, a page-based (v2) one for the pages `inputs` draw, chosen as the
 * renderer chooses them. None when nothing can be read from it.
 */
export function layerDocumentCoverage(
  doc: unknown,
  kind: string,
  inputs: readonly Record<string, unknown>[],
): TemplateSize[] {
  if (isSetDocument(doc)) return pagesCoverage(doc.pages as unknown as LayerDocument[]);
  if (typeof doc !== "object" || doc === null) return [];
  const normalised = normaliseDocument(doc, kind);
  if (!isDocumentV2(doc)) return pagesCoverage(Object.values(normalised.pages).filter((p) => !!p));
  const pages = new Set<PageKey>(
    inputs.map((input) =>
      pageForInput({
        ...input,
        kind: typeof input.kind === "string" ? input.kind : kind,
      } as Parameters<typeof pageForInput>[0]),
    ),
  );
  return pagesCoverage([...pages].map((page) => normalised.pages[page] ?? { layers: [] }));
}

/** What `designSizes` reads from a draft. */
export type DesignOf = {
  cardInput?: unknown;
  adjustments?: unknown;
  /** Null (or absent) for a pack-based draft, from before the template library. */
  templateVersion?: number | null;
};

/**
 * The sizes a draft's design draws: a templated card's layer document (for
 * the page it draws), a set design's pages, a templated carousel's pages for
 * its slides. A pack-based draft or carousel (before the template library)
 * covers all four, and so does a document no size can be read from: it
 * renders as it always has.
 */
export function designSizes(draft: DesignOf): TemplateSize[] {
  const input = (draft.cardInput ?? {}) as Record<string, unknown>;
  const kind = typeof input.kind === "string" ? input.kind : "card";
  const carousel = readQueuedCarousel(input);
  let covered: TemplateSize[];
  if (carousel) {
    if (carousel.version !== 3) return [...TEMPLATE_SIZE_ORDER];
    covered = layerDocumentCoverage(
      draft.adjustments,
      carouselTemplateKind(carousel.setType),
      carousel.slides.map((s) => s.input as unknown as Record<string, unknown>),
    );
  } else {
    if (draft.templateVersion == null) return [...TEMPLATE_SIZE_ORDER];
    covered = layerDocumentCoverage(draft.adjustments, kind, [input]);
  }
  return covered.length ? covered : [...TEMPLATE_SIZE_ORDER];
}

/**
 * Why a card drawn on the blank base with `doc` can't be downloaded at
 * `size` (round 9 B13): its design draws other sizes but not this one, so the
 * file would be blank. Null when it can (or nothing can be read from `doc`:
 * a pack card, or a design with no layers yet).
 */
export function emptySizeRefusal(
  doc: unknown,
  input: Record<string, unknown>,
  size: TemplateSize,
): string | null {
  const kind = typeof input.kind === "string" ? input.kind : "card";
  const covered = layerDocumentCoverage(doc, kind, [input]);
  if (covered.length === 0 || covered.includes(size)) return null;
  return emptySizeMessage(size);
}

/** The message for a size a design doesn't draw. */
export function emptySizeMessage(size: TemplateSize): string {
  const label = DESIGN_SIZE_LABEL[size];
  return `This design has no ${label} size, so there's nothing to download at ${label}. Pick a size it has in Format.`;
}

/** A club's size switches, as social settings hold them. */
export type DesignSizeSwitches = {
  sizeSquare: boolean;
  sizePortrait: boolean;
  sizeStory: boolean;
  sizeLandscape: boolean;
};

/**
 * The size a design posts to the feed at (Stage 1): Portrait when it covers
 * Portrait and either the club has Portrait on or the design has no Square;
 * otherwise Square. Null when the design has neither, so it has no feed size.
 */
export function feedSizeFor(
  design: readonly TemplateSize[],
  settings: Pick<DesignSizeSwitches, "sizePortrait">,
): TemplateSize | null {
  if (design.includes("portrait") && (settings.sizePortrait || !design.includes("square")))
    return "portrait";
  return design.includes("square") ? "square" : null;
}

/**
 * The feed size automation judges a draft's layout on (round 9 (b)): its
 * design's feed size at the club's switches. Null (automation then blocks on
 * any warning) when the switches or the design aren't known.
 */
export function draftFeedSize(
  draft: DesignOf,
  settings: Pick<DesignSizeSwitches, "sizePortrait"> | null | undefined,
): TemplateSize | null {
  if (!settings || !("adjustments" in draft) || !("cardInput" in draft)) return null;
  return feedSizeFor(designSizes(draft), settings);
}
