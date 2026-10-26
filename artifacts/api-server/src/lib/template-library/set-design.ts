/**
 * A carousel set draft as one multi-page design (carousel set editor plan,
 * part 3).
 *
 * Two kinds of draft are sets:
 *
 * - a **queued carousel** (ADR-010 v3, `weekendCarousel`): its slides are a
 *   stored data snapshot; the set design says which page draws each, and
 *   saving reorders, deletes or adds (design page) slides in the payload;
 * - a **Round Team Lists** draft: one list card whose slides (cover, a team
 *   each) are worked out from its data at render; the design's arrangement
 *   holds the slide order and deletions.
 *
 * A draft saved before set designs has none: one is assembled for it from its
 * own design (a queued carousel's assembled document holds every page it
 * draws; a Round Team Lists draft's cover is its own card) and, for pages it
 * lacks, the same look's set template. Nothing is stored until a save.
 *
 * The data snapshot never changes here: what was approved is what posts, and
 * a junior set stays junior on every slide (C4).
 */
import { and, eq } from "drizzle-orm";
import {
  cardTemplatesTable,
  db,
  libraryTemplatesTable,
  libraryTemplateVersionsTable,
  socialDraftsTable,
  type CardTemplateRow,
  type DraftTemplateRefColumn,
  type SocialDraftRow,
} from "@workspace/db";
import {
  arrangeSlides,
  assembleSetDocument,
  isSetDocument,
  lookForPack,
  setFromDesign,
  setTemplateKind,
  setTypeOfKind,
  SET_TYPE_LABELS,
  templateDocumentErrors,
  type DataSetType,
  type SetType,
  type SetDocument,
  type SetPage,
} from "@workspace/scorecard/kind-templates";
import {
  readQueuedCarousel,
  type CarouselSetType,
  type CarouselSize,
} from "@workspace/scorecard/queued-carousel";
import { recordDraftRevision } from "../draft-revisions";
import { normalizeDraftStatus } from "../draft-status";
import { BLANK_PACK_ID, KIND_SOURCE } from "../kind-templates";
import { MAX_TEMPLATE_NAME } from "./copies";
import { initialFit, requestFit } from "./fit";
import { libraryAssetPolicyErrors } from "./assets";
import { resolveTemplateRef } from "./draw";
import { TemplateLibraryError } from "./errors";

/** The set type each queued carousel set type is drawn as. */
const CAROUSEL_SET_TYPE: Record<CarouselSetType, DataSetType> = {
  teamList: "teamLists",
  results: "results",
  matchDay: "matchDay",
  matchSummary: "matchSummary",
};

export type DraftSetLayout = "carousel" | "list" | "pages";

/** Which set a draft is, if it is one the set editor opens. */
export function draftSetType(
  draft: Pick<SocialDraftRow, "cardInput"> & Partial<Pick<SocialDraftRow, "adjustments">>,
): { setType: SetType; layout: DraftSetLayout } | null {
  const input = (draft.cardInput ?? {}) as Record<string, unknown>;
  // A card made into a free set of pages (full draft editor plan, stage 2):
  // every page draws the card's own data.
  if (isSetDocument(draft.adjustments) && draft.adjustments.set === "free")
    return { setType: "free", layout: "pages" };
  const carousel = readQueuedCarousel(input);
  if (carousel)
    return carousel.version === 3
      ? { setType: CAROUSEL_SET_TYPE[carousel.setType ?? "matchDay"], layout: "carousel" }
      : null;
  if (input.kind === "teamListRound" && !("weekendCarousel" in input))
    return { setType: "teamLists", layout: "list" };
  return null;
}

export type DraftSetDesignView = {
  draftId: number;
  setType: SetType;
  layout: DraftSetLayout;
  document: SetDocument;
  templateRef: DraftTemplateRefColumn | null;
  size: CarouselSize | null;
  stored: boolean;
};

const notASet = () =>
  new TemplateLibraryError(409, { error: "This draft isn't a carousel set the editor opens." });

/** A look's set template of `type`, current version (null when it has none). */
async function lookSetTemplate(
  where: { lookId: number } | { slug: string },
  type: DataSetType,
): Promise<{ document: SetDocument; ref: DraftTemplateRefColumn } | null> {
  const [row] = await db
    .select({
      id: libraryTemplatesTable.id,
      version: libraryTemplatesTable.currentVersion,
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
        eq(libraryTemplatesTable.kind, setTemplateKind(type)),
        "lookId" in where
          ? eq(libraryTemplatesTable.lookId, where.lookId)
          : eq(libraryTemplatesTable.slug, where.slug),
      ),
    )
    .limit(1);
  if (!row || !isSetDocument(row.document)) return null;
  return {
    document: structuredClone(row.document),
    ref: { libraryTemplateId: row.id, version: row.version },
  };
}

/** The look a draft is drawn in: its template's, else its pack's. */
async function draftLook(tenantId: number, draft: SocialDraftRow): Promise<number | null> {
  const ref = draft.templateRef as DraftTemplateRefColumn | null;
  if (ref) {
    try {
      return (await resolveTemplateRef(tenantId, ref)).lookId;
    } catch {
      // A copy deleted or saved since: fall back to the pack's look.
    }
  }
  return null;
}

/** The set template a draft's pages come from: its look's, else Club Kit's. */
async function fallbackSet(tenantId: number, draft: SocialDraftRow, type: DataSetType) {
  const lookId = await draftLook(tenantId, draft);
  return (
    (lookId !== null ? await lookSetTemplate({ lookId }, type) : null) ??
    (await lookSetTemplate(
      {
        slug: `${lookForPack(draft.packId, type === "teamLists" ? "teamList" : "matchDay")}/${setTemplateKind(type)}`,
      },
      type,
    )) ??
    (await lookSetTemplate({ slug: `club-kit/${setTemplateKind(type)}` }, type))
  );
}

/** A Round Team Lists draft's own cover: its templated card's page, else none. */
function listCover(draft: SocialDraftRow): SetPage["layers"] | null {
  if (draft.templateVersion === null) return null;
  const doc = draft.adjustments as { formatVersion?: unknown; pages?: Record<string, unknown> };
  const card =
    doc?.formatVersion === 2
      ? (doc.pages?.card as { layers?: unknown } | undefined)?.layers
      : (draft.adjustments as { layers?: unknown } | null)?.layers;
  return Array.isArray(card) && card.length > 0
    ? (structuredClone(card) as SetPage["layers"])
    : null;
}

/** A draft's set design: stored, or assembled for this read. */
export async function loadDraftSetDesign(
  tenantId: number,
  draft: SocialDraftRow,
): Promise<DraftSetDesignView> {
  const kind = draftSetType(draft);
  if (!kind) throw notASet();
  const carousel = readQueuedCarousel(draft.cardInput);
  const base = {
    draftId: draft.id,
    setType: kind.setType,
    layout: kind.layout,
    size: carousel?.size ?? null,
  };
  const ref = (draft.templateRef as DraftTemplateRefColumn | null) ?? null;
  if (isSetDocument(draft.adjustments) && draft.adjustments.set === kind.setType) {
    return { ...base, document: draft.adjustments, templateRef: ref, stored: true };
  }
  // A free set is the card's own pages, stored above; there's no look's set to fall back on.
  if (kind.setType === "free") throw notASet();
  if (kind.layout === "carousel") {
    // The assembled document holds every page the set draws, by page key.
    const own = assembleSetDocument(kind.setType, () => draft.adjustments);
    if (own) return { ...base, document: own.document, templateRef: ref, stored: false };
  }
  const set = await fallbackSet(tenantId, draft, kind.setType);
  if (!set)
    throw new TemplateLibraryError(409, {
      error: "No set template can draw this set yet. Pick a carousel set template in the library.",
    });
  const cover = kind.layout === "list" ? listCover(draft) : null;
  const document: SetDocument = cover
    ? {
        ...set.document,
        pages: set.document.pages.map((p) =>
          p.slot === "cover"
            ? { ...p, kind: "teamListRound", page: "card" as const, layers: cover }
            : p,
        ),
      }
    : set.document;
  return { ...base, document, templateRef: cover ? ref : set.ref, stored: false };
}

export type SaveDraftSetDesign = {
  document: unknown;
  templateRef?: DraftTemplateRefColumn | null;
  size?: CarouselSize;
};

const invalid = (error: string, problems?: string[]) =>
  new TemplateLibraryError(400, { error, ...(problems ? { problems } : {}) });

/**
 * A queued carousel's stored slides after an edit: in the arrangement's order,
 * without its removed slides, with a slide for each design page no slide
 * draws. Stored slides are moved as stored (content snapshots untouched).
 */
export function arrangeCarouselSlides(
  stored: Array<Record<string, unknown>>,
  doc: SetDocument,
): Array<Record<string, unknown>> {
  const allJunior = stored.length > 0 && stored.every((s) => s.junior === true);
  const pageIds = new Set(doc.pages.map((p) => p.id));
  const kept = stored.filter((s) => typeof s.pageId !== "string" || pageIds.has(s.pageId));
  const drawn = new Set(
    kept.map((s) => s.pageId).filter((x): x is string => typeof x === "string"),
  );
  const design = doc.pages
    .filter((p) => p.slot === "page" && !drawn.has(p.id))
    .map((p) => ({
      id: `page:${p.id}`,
      key: `page:${p.id}`,
      label: p.name?.trim() || "Page",
      pageId: p.id,
      input: { kind: p.kind, ...(allJunior ? { junior: true } : {}) },
      data: {},
      junior: allJunior,
      sponsorsOn: false,
      warnings: [],
    }));
  const withKeys = [...kept.map((s) => ({ ...s, key: String(s.id) })), ...design];
  return arrangeSlides(withKeys, doc.arrangement).map(({ key: _key, ...s }) => s);
}

/** Save a draft's set design (and, for a queued carousel, its slides and size). */
export async function saveDraftSetDesign(
  tenantId: number,
  draft: SocialDraftRow,
  body: SaveDraftSetDesign,
): Promise<SocialDraftRow> {
  const kind = draftSetType(draft);
  if (!kind) throw notASet();
  const status = normalizeDraftStatus(draft.status);
  if (status === "dismissed" || status === "posted")
    throw new TemplateLibraryError(409, { error: "This draft can't be edited any more." });
  const errors = [
    ...templateDocumentErrors(body.document, setTemplateKind(kind.setType)),
    ...libraryAssetPolicyErrors(body.document),
  ];
  if (errors.length > 0) throw invalid(errors[0]!, errors.slice(0, 20));
  const doc = body.document as SetDocument;

  let ref = (draft.templateRef as DraftTemplateRefColumn | null) ?? null;
  if (body.templateRef) {
    const t = await resolveTemplateRef(tenantId, body.templateRef);
    if (setTypeOfKind(t.kind) === null) throw invalid("Pick a carousel set template.");
    ref = t.ref;
  }

  const patch: Partial<typeof socialDraftsTable.$inferInsert> = {
    packId: BLANK_PACK_ID,
    templateRef: ref,
    templateVersion: ref?.version ?? draft.templateVersion ?? 1,
    designEditedAt: new Date(),
    layoutCheckPending: true,
    autoReadyAt: null,
  };
  if (kind.layout === "carousel") {
    const input = structuredClone(draft.cardInput) as Record<string, unknown>;
    const wc = input.weekendCarousel as Record<string, unknown>;
    const slides = arrangeCarouselSlides(wc.slides as Array<Record<string, unknown>>, doc);
    if (slides.length === 0) throw invalid("A set needs at least one slide.");
    wc.slides = slides;
    if (body.size) wc.size = body.size;
    if (ref) wc.templateRef = ref;
    const read = readQueuedCarousel(input);
    if (!read) throw invalid("Those slides can't be saved as a set.");
    patch.cardInput = input;
    // The payload holds the slide order now; the design keeps its pages.
    const { arrangement: _order, ...design } = doc;
    patch.adjustments = design;
  } else {
    patch.adjustments = doc;
  }
  return db.transaction(async (tx) => {
    await recordDraftRevision(draft, "edit", tx);
    const [row] = await tx
      .update(socialDraftsTable)
      .set(patch)
      .where(and(eq(socialDraftsTable.id, draft.id), eq(socialDraftsTable.tenantId, tenantId)))
      .returning();
    return row!;
  });
}

// ── Make a carousel set (part 4) ────────────────────────────────────────────

export type MakeCarouselSet = {
  setType: SetType;
  from?: { copyId?: number; libraryTemplateId?: number; version: number };
  lookId?: number;
  name?: string;
};

/**
 * A new club set design (`set:<type>`), saved to the club's designs: one
 * template's design on the pages it fits and the same look's set template
 * around it (`setFromDesign`), or a look's set template as it is. Made from a
 * design, it is the club's own (edited, standalone); taken from a look as it
 * is, it is an unedited copy that can take the look's updates. Never the
 * default: making it doesn't change what the club's sets are drawn with.
 */
export async function makeSetCopy(
  tenantId: number,
  body: MakeCarouselSet,
  adminId: number | null,
): Promise<CardTemplateRow> {
  const type = body.setType;
  let document: SetDocument | null;
  let origin: DraftTemplateRefColumn | null = null;
  if (body.from) {
    const t = await resolveTemplateRef(tenantId, body.from);
    if (setTypeOfKind(t.kind)) throw invalid("Start a set from a card template.");
    const base =
      type === "free"
        ? null
        : ((t.lookId !== null ? await lookSetTemplate({ lookId: t.lookId }, type) : null) ??
          (await lookSetTemplate({ slug: `club-kit/${setTemplateKind(type)}` }, type)));
    document = setFromDesign(type, base?.document ?? null, t.kind, t.document);
    if (!document) throw invalid("That template can't start this set.");
  } else {
    if (type === "free") throw invalid("A free set starts from a template.");
    const base =
      (body.lookId !== undefined ? await lookSetTemplate({ lookId: body.lookId }, type) : null) ??
      (await lookSetTemplate({ slug: `club-kit/${setTemplateKind(type)}` }, type));
    if (!base) throw new TemplateLibraryError(404, { error: "That look has no such set yet." });
    document = base.document;
    origin = base.ref;
  }
  const kind = setTemplateKind(type);
  const errors = templateDocumentErrors(document, kind);
  if (errors.length > 0) throw invalid(errors[0]!, errors.slice(0, 20));
  const fit = initialFit();
  const [row] = await db
    .insert(cardTemplatesTable)
    .values({
      tenantId,
      name: (
        body.name?.trim() ||
        (type === "free" ? SET_TYPE_LABELS.free : `${SET_TYPE_LABELS[type]} set`)
      ).slice(0, MAX_TEMPLATE_NAME),
      source: KIND_SOURCE,
      baseKind: kind,
      cardKinds: [kind],
      adjustments: document,
      version: 1,
      updatedAt: new Date(),
      updatedByAdminId: adminId,
      isKindDefault: false,
      originTemplateId: origin?.libraryTemplateId ?? null,
      originVersion: origin?.version ?? null,
      // A set made from a design is the club's own from the start.
      editedAt: origin ? null : new Date(),
      ...fit,
    })
    .returning();
  requestFit({ kind: "copy", tenantId, copyId: row!.id, version: 1 }, document, kind);
  return row!;
}
