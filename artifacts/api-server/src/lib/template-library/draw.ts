/**
 * What a new draft or carousel is drawn with (ADR-011 §3 "One-off post" and
 * "Carousels", T3.16, T3.20, T3.21).
 *
 * - A single card picked from a template (Create a Card) copies that template's
 *   document: one of the club's templates, or a library version directly. The
 *   club's default doesn't change.
 * - A carousel set is drawn with one template: the picked one or the club's
 *   default for the set's kind. Its title and sponsors pages (the bookends)
 *   come from the Match Day template of the same look, else the club's default
 *   Match Day template. If the set's template lacks a page the set needs (a
 *   pilot v1 copy has only its primary page), the club's pack look for that
 *   kind is used as a whole template instead. Pages from different templates
 *   are never mixed otherwise. The assembled document is stored on the draft.
 */
import { and, eq } from "drizzle-orm";
import {
  db,
  libraryTemplatesTable,
  libraryTemplateVersionsTable,
  type DraftTemplateRefColumn,
} from "@workspace/db";
import {
  BOOKEND_KIND,
  BOOKEND_PAGES,
  documentPages,
  isBookendPage,
  lookForPack,
  lookTemplateSlug,
  normaliseDocument,
  pageForInput,
  sizesWithLayers,
  templateKindFor,
  type LayerDocument,
  type PageKey,
  type TemplateSize,
  type TemplateDocumentV2,
  type TemplatePage,
} from "@workspace/scorecard/kind-templates";
import {
  carouselTemplateKind,
  type CarouselSetType,
  type QueuedCarousel,
} from "@workspace/scorecard/queued-carousel";
import { DESIGN_SIZE_LABEL } from "@workspace/scorecard/design-sizes";
import { BLANK_PACK_ID, ensureKindTemplate, type TemplatedDesign } from "../kind-templates";
import { loadCopy } from "./copies";
import { TemplateLibraryError } from "./errors";
import { loadLibraryVersion } from "./store";
import { layoutCheckOwed } from "../layout-check-state";

/** A template's document, the ref that names it, and the look it belongs to. */
type DrawnTemplate = {
  kind: string;
  document: unknown;
  ref: DraftTemplateRefColumn;
  lookId: number | null;
};

const wrongKind = () =>
  new TemplateLibraryError(400, { error: "That template is for a different card kind." });

async function lookOfLibraryTemplate(id: number | null): Promise<number | null> {
  if (id === null) return null;
  const [row] = await db
    .select({ lookId: libraryTemplatesTable.lookId })
    .from(libraryTemplatesTable)
    .where(eq(libraryTemplatesTable.id, id));
  return row?.lookId ?? null;
}

/** The template a ref names, for the tenant. 404 for another club's copy or an unknown library template. */
export async function resolveTemplateRef(
  tenantId: number,
  ref: { copyId?: number; libraryTemplateId?: number; version: number },
): Promise<DrawnTemplate> {
  if (ref.copyId !== undefined) {
    const copy = await loadCopy(tenantId, ref.copyId);
    if (copy.version !== ref.version) {
      throw new TemplateLibraryError(409, {
        error: "That template changed since you picked it. Pick it again.",
        currentVersion: copy.version,
      });
    }
    return {
      kind: copy.baseKind ?? "",
      document: copy.adjustments ?? { layers: [] },
      ref: { copyId: copy.id, version: copy.version },
      lookId: await lookOfLibraryTemplate(copy.originTemplateId),
    };
  }
  if (ref.libraryTemplateId === undefined) {
    throw new TemplateLibraryError(400, { error: "Pick a template." });
  }
  const v = await loadLibraryVersion(ref.libraryTemplateId, ref.version);
  return {
    kind: v.template.kind,
    document: v.document,
    ref: { libraryTemplateId: v.template.id, version: v.version },
    lookId: v.template.look?.id ?? null,
  };
}

/** A single card's design from a picked template (Create a Card, T3.21). */
export async function designFromRef(
  tenantId: number,
  cardKind: string,
  ref: { copyId?: number; libraryTemplateId?: number; version: number },
): Promise<TemplatedDesign> {
  const t = await resolveTemplateRef(tenantId, ref);
  if (templateKindFor(t.kind) !== templateKindFor(cardKind)) throw wrongKind();
  return {
    packId: BLANK_PACK_ID,
    adjustments: structuredClone(t.document),
    templateVersion: t.ref.version,
    templateRef: t.ref,
    ...layoutCheckOwed(),
  };
}

/** The template kind that draws a carousel set. */
export const setTemplateKind = carouselTemplateKind;

/** The pages a carousel's slides draw, bookends included. */
export function carouselPages(carousel: Pick<QueuedCarousel, "slides">): PageKey[] {
  const pages = new Set<PageKey>(BOOKEND_PAGES);
  for (const slide of carousel.slides) {
    pages.add(pageForInput(slide.input as Parameters<typeof pageForInput>[0]));
  }
  return [...pages];
}

const pagesOf = (document: unknown, kind: string) => {
  const doc = normaliseDocument(document, kind);
  return { doc, pages: new Set(documentPages(doc)) };
};

/**
 * Whether every one of `pages` of `doc` draws `size` (any size when none is
 * asked for). A page with no layers at all draws nothing at any size, so it
 * isn't a size problem.
 */
function drawsSize(
  doc: TemplateDocumentV2,
  pages: readonly PageKey[],
  size: TemplateSize | undefined,
): boolean {
  if (!size) return true;
  return pages.every((page) => {
    const p = doc.pages[page] as unknown as LayerDocument | undefined;
    if (!p || !Array.isArray(p.layers) || p.layers.length === 0) return true;
    return sizesWithLayers(p).includes(size);
  });
}

/** A picked template that doesn't come in the set's size (round 9 B13): refused, never swapped. */
const noSize = (size: TemplateSize) => {
  const label = DESIGN_SIZE_LABEL[size];
  return new TemplateLibraryError(409, {
    error: `This look has no ${label} size, so it can't draw this carousel at ${label}. Pick a look that comes in ${label}, or another size.`,
  });
};

/** A look's (or else a slug's) library template for a kind, at its current version. */
async function libraryTemplateFor(where: { lookId: number } | { slug: string }, kind: string) {
  const [row] = await db
    .select({
      id: libraryTemplatesTable.id,
      version: libraryTemplatesTable.currentVersion,
      lookId: libraryTemplatesTable.lookId,
      document: libraryTemplateVersionsTable.document,
    })
    .from(libraryTemplatesTable)
    .innerJoin(
      libraryTemplateVersionsTable,
      and(
        eq(libraryTemplateVersionsTable.templateId, libraryTemplatesTable.id),
        eq(libraryTemplateVersionsTable.version, libraryTemplatesTable.currentVersion),
      ),
    )
    .where(
      and(
        eq(libraryTemplatesTable.kind, kind),
        "lookId" in where
          ? eq(libraryTemplatesTable.lookId, where.lookId)
          : eq(libraryTemplatesTable.slug, where.slug),
      ),
    )
    .limit(1);
  return row ?? null;
}

const fromLibraryRow = (
  row: NonNullable<Awaited<ReturnType<typeof libraryTemplateFor>>>,
  kind: string,
): DrawnTemplate => ({
  kind,
  document: row.document,
  ref: { libraryTemplateId: row.id, version: row.version },
  lookId: row.lookId,
});

export type AssembledCarousel = {
  document: TemplateDocumentV2;
  /** The set's template (after any fallback to the pack look). */
  templateRef: DraftTemplateRefColumn;
};

const cannotDraw = (what: string) =>
  new TemplateLibraryError(409, {
    error: `No template the club can use has ${what}. Pick another template.`,
  });

/**
 * One document for a carousel (ADR-002): the set's pages from one template,
 * its title and sponsors pages from the Match Day template of the same look
 * (for a Match Day set, that is the template itself), else the club's default
 * Match Day template. When the set's template lacks a page the set needs, or
 * no bookends can come from its own look or the club's default, the club's
 * pack look for the kind is used as a whole template instead, so a pilot v1
 * copy never mixes with another look's pages.
 */
export async function assembleCarouselDocument(
  tenantId: number,
  carousel: Pick<QueuedCarousel, "setType" | "slides">,
  opts: AssemblyOptions,
): Promise<AssembledCarousel> {
  return assembleCarouselPages(tenantId, carousel.setType, carouselPages(carousel), opts);
}

export type AssemblyOptions = {
  templateRef?: { copyId?: number; libraryTemplateId?: number; version: number } | null;
  /** The club's pack for the set's kind: picks the fallback look. */
  packId: string | null;
  /**
   * The size the set is made at (round 9 B13): every page must draw it. A
   * picked template that doesn't is refused, not swapped for the pack look.
   */
  size?: TemplateSize;
};

/**
 * The same assembly for the pages a set draws, bookends added, so the
 * Weekend Carousel can preview exactly what it will save (T5.17).
 */
export async function assembleCarouselPages(
  tenantId: number,
  setType: CarouselSetType | undefined,
  slidePages: readonly PageKey[],
  opts: AssemblyOptions,
): Promise<AssembledCarousel> {
  const kind = setTemplateKind(setType);
  const size = opts.size;
  const needed = [...new Set<PageKey>([...BOOKEND_PAGES, ...slidePages])];
  // A Match Day set draws its bookends from its own template.
  const required = kind === BOOKEND_KIND ? needed : needed.filter((p) => !isBookendPage(p));

  let picked: DrawnTemplate;
  if (opts.templateRef) {
    picked = await resolveTemplateRef(tenantId, opts.templateRef);
    if (templateKindFor(picked.kind) !== kind) throw wrongKind();
  } else {
    const def = await ensureKindTemplate(tenantId, kind, opts.packId);
    picked = {
      kind,
      document: def.adjustments ?? { layers: [] },
      ref: { copyId: def.id, version: def.version },
      lookId: await lookOfLibraryTemplate(def.originTemplateId),
    };
  }

  /** The bookend pages for a set drawn with `t`, or null when none can be had. */
  const bookendsFor = async (
    t: DrawnTemplate,
    useClubDefault: boolean,
  ): Promise<TemplateDocumentV2 | null> => {
    const candidates: Array<() => Promise<DrawnTemplate | null>> = [
      async () => (kind === BOOKEND_KIND ? t : null),
      async () => {
        if (kind === BOOKEND_KIND || t.lookId === null) return null;
        const row = await libraryTemplateFor({ lookId: t.lookId }, BOOKEND_KIND);
        return row ? fromLibraryRow(row, BOOKEND_KIND) : null;
      },
      async () => {
        if (kind === BOOKEND_KIND || !useClubDefault) return null;
        const def = await ensureKindTemplate(tenantId, BOOKEND_KIND, opts.packId);
        return {
          kind: BOOKEND_KIND,
          document: def.adjustments ?? { layers: [] },
          ref: { copyId: def.id, version: def.version },
          lookId: null,
        };
      },
    ];
    for (const candidate of candidates) {
      const c = await candidate();
      if (!c) continue;
      const p = pagesOf(c.document, BOOKEND_KIND);
      if (BOOKEND_PAGES.every((page) => p.pages.has(page)) && drawsSize(p.doc, BOOKEND_PAGES, size))
        return p.doc;
    }
    return null;
  };

  const tryDraw = async (t: DrawnTemplate, useClubDefault: boolean) => {
    const own = pagesOf(t.document, kind);
    if (!required.every((p) => own.pages.has(p))) return null;
    if (!drawsSize(own.doc, required, size)) return null;
    const bookends = await bookendsFor(t, useClubDefault);
    return bookends ? { t, own, bookends } : null;
  };

  // A template the admin picked that has the pages but not the size is
  // refused (round 9 B13): drawing the set with another look instead would
  // be a silent swap.
  if (opts.templateRef && size) {
    const own = pagesOf(picked.document, kind);
    if (required.every((p) => own.pages.has(p)) && !drawsSize(own.doc, required, size))
      throw noSize(size);
  }

  let drawn = await tryDraw(picked, true);
  if (!drawn) {
    // The pack look for the kind, as a whole template (and its look's bookends).
    const row = await libraryTemplateFor(
      { slug: lookTemplateSlug(lookForPack(opts.packId, kind), kind) },
      kind,
    );
    drawn = row ? await tryDraw(fromLibraryRow(row, kind), false) : null;
  }
  if (!drawn) {
    throw cannotDraw(
      `every page this carousel needs (${needed.join(", ")})${size ? ` at ${DESIGN_SIZE_LABEL[size]}` : ""}`,
    );
  }

  const { t, own, bookends } = drawn;
  const pages: Partial<Record<PageKey, TemplatePage>> = {};
  for (const page of needed.filter((p) => !isBookendPage(p))) {
    pages[page] = structuredClone(own.doc.pages[page]!);
  }
  for (const page of BOOKEND_PAGES) pages[page] = structuredClone(bookends.pages[page]!);
  const palettes = [...new Set([...(own.doc.palettes ?? []), ...(bookends.palettes ?? [])])];
  const document: TemplateDocumentV2 = {
    formatVersion: 2,
    pages,
    ...(palettes.length ? { palettes } : {}),
    ...(own.doc.sponsorLock ? { sponsorLock: true } : {}),
  };
  return { document, templateRef: t.ref };
}
