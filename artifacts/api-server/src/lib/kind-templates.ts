/**
 * Card kind templates (plan 2026-10-07-002, U5; ADR-002, ADR-003).
 *
 * One DEFAULT template per tenant and card kind, stored as a `card_templates`
 * row with `source = 'kind'` and `is_kind_default`; the template library
 * (ADR-011) lets a club hold other copies of a kind, edited through
 * `/club-templates`. The default is created lazily from the club's pack look
 * the first time a draft of the kind needs one. Applying a template copies it
 * into the kind's unposted drafts, recording each draft's previous design
 * first.
 *
 * Kind template rows never set `defaultForKinds`: that column carries the
 * club's pack choice, and `clearDefaultKinds` ignores `source` (KTD5).
 */
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  db,
  adminsTable,
  cardTemplatesTable,
  libraryTemplatesTable,
  libraryTemplateVersionsTable,
  socialDraftsTable,
  type CardTemplateRow,
  type DraftTemplateRefColumn,
  type SocialDraftRow,
  type TemplateFitReportColumn,
  type TemplateFitStatus,
} from "@workspace/db";
import {
  emptySizes,
  isRetiredPack,
  isSetDocument,
  kindFields,
  setTypeOfKind,
  lazyDefaultSlugs,
  lookTemplateSlug,
  starterLookForPack,
  templateDocumentErrors,
  type StarterDocument,
} from "@workspace/scorecard/kind-templates";
import { TEMPLATE_BUNDLES } from "@workspace/template-bundles";
import { recordDraftRevision } from "./draft-revisions";

export const KIND_SOURCE = "kind";

/** The base every templated draft renders on (ADR-001). */
export const BLANK_PACK_ID = "blank";

/** Draft statuses a template apply may change (R18: never posted). */
export const UNPOSTED_STATUSES = ["awaiting_review", "ready"] as const;

/** The most layers a template may hold; keeps a document from growing without bound. */
export const MAX_TEMPLATE_LAYERS = 300;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class KindTemplateError extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    readonly body: Record<string, unknown>,
  ) {
    super(String(body.error ?? "kind template error"));
  }
}

/** Whether a kind is one templates support: a card kind, or a set's (`set:<type>`). */
export function isTemplateKind(kind: string): boolean {
  return kindFields(kind) !== null || setTypeOfKind(kind) !== null;
}

/** Unposted drafts of a kind, per kind, for one tenant. */
export async function waitingDraftCounts(tenantId: number): Promise<Map<string, number>> {
  const kindExpr = sql<string>`${socialDraftsTable.cardInput}->>'kind'`;
  const rows = await db
    .select({ kind: kindExpr, n: sql<number>`count(*)::int` })
    .from(socialDraftsTable)
    .where(
      and(
        eq(socialDraftsTable.tenantId, tenantId),
        inArray(socialDraftsTable.status, [...UNPOSTED_STATUSES]),
        // Queued carousels and set designs keep their own design (applyTemplateToDrafts).
        sql`NOT (${socialDraftsTable.cardInput} ? 'weekendCarousel')`,
        // A set design names its set type (a pack draft's `set` is its options object).
        sql`coalesce(jsonb_typeof(${socialDraftsTable.adjustments} -> 'set'), '') <> 'string'`,
      ),
    )
    .groupBy(kindExpr);
  return new Map(rows.map((r) => [r.kind, Number(r.n)]));
}

/** A tenant's default template for a kind, or null when it has none yet. */
export async function loadKindTemplate(
  tenantId: number,
  kind: string,
  tx: typeof db | Tx = db,
): Promise<CardTemplateRow | null> {
  const [row] = await tx
    .select()
    .from(cardTemplatesTable)
    .where(
      and(
        eq(cardTemplatesTable.tenantId, tenantId),
        eq(cardTemplatesTable.source, KIND_SOURCE),
        eq(cardTemplatesTable.baseKind, kind),
        eq(cardTemplatesTable.isKindDefault, true),
      ),
    );
  return row ?? null;
}

/** The display name of the admin who last saved, if any. */
export async function updatedByName(row: CardTemplateRow): Promise<string | null> {
  if (row.updatedByAdminId === null) return null;
  const [admin] = await db
    .select({ displayName: adminsTable.displayName, username: adminsTable.username })
    .from(adminsTable)
    .where(and(eq(adminsTable.id, row.updatedByAdminId), eq(adminsTable.tenantId, row.tenantId)));
  return admin ? admin.displayName?.trim() || admin.username : null;
}

/**
 * Reject a document the template can't hold: a strictly checked shape (only
 * known settings, finite in-range numbers, bounded text, this kind's own
 * fields — security review 2026-10-08), at most MAX_TEMPLATE_LAYERS elements,
 * and no empty size (KTD15).
 */
export function validateDocument(document: unknown, kind: string): StarterDocument {
  const problems = templateDocumentErrors(document, kind);
  if (problems.length > 0) {
    throw new KindTemplateError(400, {
      error: problems[0],
      problems: problems.slice(0, 20),
    });
  }
  const doc = document as StarterDocument;
  const empty = emptySizes(doc);
  if (empty.length > 0) {
    throw new KindTemplateError(400, {
      error: `Add at least one element to every size before saving (empty: ${empty.join(", ")}).`,
      emptySizes: empty,
    });
  }
  return doc;
}

/**
 * What a club's lazy default for a kind is copied from: its pack's look's
 * template for the kind (Club Kit's when that look lacks the kind) once that
 * template is listed, else its pack's starter look (L4-B's starter bundles),
 * at the template's current version. A library without those (a database the
 * bundles haven't synced to yet) gets the starter bundle's own file, with no
 * origin.
 */
async function lazyDefaultSource(
  kind: string,
  currentPackId: string | null,
): Promise<{
  name: string;
  document: unknown;
  originTemplateId: number | null;
  originVersion: number | null;
  fitStatus: TemplateFitStatus;
  fitReport: TemplateFitReportColumn | null;
}> {
  const slugs = lazyDefaultSlugs(currentPackId, kind);
  const found = await db
    .select({
      id: libraryTemplatesTable.id,
      slug: libraryTemplatesTable.slug,
      name: libraryTemplatesTable.name,
      listed: libraryTemplatesTable.listed,
      version: libraryTemplateVersionsTable.version,
      document: libraryTemplateVersionsTable.document,
      fitStatus: libraryTemplateVersionsTable.fitStatus,
      fitReport: libraryTemplateVersionsTable.fitReport,
    })
    .from(libraryTemplatesTable)
    .innerJoin(
      libraryTemplateVersionsTable,
      and(
        eq(libraryTemplateVersionsTable.templateId, libraryTemplatesTable.id),
        eq(libraryTemplateVersionsTable.version, libraryTemplatesTable.currentVersion),
      ),
    )
    .where(inArray(libraryTemplatesTable.slug, slugs));
  // A converted look counts once it is listed (polished, signed off and past
  // its fit check); until then the pack's starter look, today's design, stands
  // in, listed or not, so no club starts from a raw conversion.
  const starterSlug = lookTemplateSlug(starterLookForPack(currentPackId), kind);
  const pick = slugs
    .map((slug) => found.find((f) => f.slug === slug))
    .find((f) => f && ((f.listed && f.fitStatus === "pass") || f.slug === starterSlug));
  if (pick) {
    return {
      name: pick.name,
      document: structuredClone(pick.document),
      originTemplateId: pick.id,
      originVersion: pick.version,
      fitStatus: pick.fitStatus,
      fitReport: pick.fitReport,
    };
  }
  return {
    name: `${kind} template`,
    document: structuredClone(starterBundleDocument(currentPackId, kind)),
    originTemplateId: null,
    originVersion: null,
    fitStatus: "pass",
    fitReport: null,
  };
}

/** The starter bundle file's document for a kind: the pack's starter look, else Club Kit's. */
function starterBundleDocument(currentPackId: string | null, kind: string): unknown {
  const fileFor = (look: string) =>
    TEMPLATE_BUNDLES.find((b) => b.slug === look)?.templates.find((t) => t.kind === kind)?.file;
  const file = fileFor(starterLookForPack(currentPackId)) ?? fileFor(starterLookForPack(null));
  if (!file) throw new Error(`no starter bundle has a ${kind} template`);
  return file.document;
}

/**
 * The tenant's default template for a kind (ADR-011 §3 "Lazy default"),
 * created when it has none by copying its pack's look (`PACK_TO_LOOK`).
 *
 * A kind with pre-library rows (no origin) but no default promotes the oldest
 * of them instead of seeding a new one, so the pilot keeps its own designs
 * even if the release's data step was missed (T3.15). Insert-or-ignore on the
 * one-default-per-kind index makes concurrent callers converge on one row. A
 * template replacing a retired pack records it so the Studio can say so (R19).
 */
export async function ensureKindTemplate(
  tenantId: number,
  kind: string,
  currentPackId: string | null,
): Promise<CardTemplateRow> {
  const existing = await loadKindTemplate(tenantId, kind);
  if (existing) return existing;
  const [orphan] = await db
    .select({ id: cardTemplatesTable.id })
    .from(cardTemplatesTable)
    .where(
      and(
        eq(cardTemplatesTable.tenantId, tenantId),
        eq(cardTemplatesTable.source, KIND_SOURCE),
        eq(cardTemplatesTable.baseKind, kind),
        isNull(cardTemplatesTable.originTemplateId),
      ),
    )
    .orderBy(asc(cardTemplatesTable.id))
    .limit(1);
  if (orphan) {
    try {
      await db
        .update(cardTemplatesTable)
        .set({ isKindDefault: true })
        .where(eq(cardTemplatesTable.id, orphan.id));
    } catch (err) {
      // Another caller made a default first.
      if ((err as { code?: string }).code !== "23505") throw err;
    }
  } else {
    const source = await lazyDefaultSource(kind, currentPackId);
    await db
      .insert(cardTemplatesTable)
      .values({
        tenantId,
        name: source.name,
        source: KIND_SOURCE,
        baseKind: kind,
        cardKinds: [kind],
        isKindDefault: true,
        adjustments: source.document,
        version: 1,
        updatedAt: new Date(),
        replacedPackId: isRetiredPack(currentPackId) ? currentPackId : null,
        originTemplateId: source.originTemplateId,
        originVersion: source.originVersion,
        fitStatus: source.fitStatus,
        fitReport: source.fitReport,
      })
      .onConflictDoNothing();
  }
  const row = await loadKindTemplate(tenantId, kind);
  if (!row) throw new Error(`kind template for ${kind} vanished after insert`);
  return row;
}

/** The kind a draft renders, from its card input. */
const draftKind = (draft: Pick<SocialDraftRow, "cardInput">): string | null => {
  const input = draft.cardInput as { kind?: unknown } | null;
  return typeof input?.kind === "string" ? input.kind : null;
};

/**
 * Copy a club template's current document into the unposted drafts of its
 * kind, inside `tx` (the caller has checked the version the admin saw). Each
 * draft records the template it came from (`template_ref`, ADR-011).
 */
export async function applyTemplateToDrafts(
  tx: Tx,
  template: CardTemplateRow,
  expectedDrafts?: number,
): Promise<{ changed: number; skipped: number }> {
  const tenantId = template.tenantId;
  const kind = template.baseKind ?? "";
  // Lock the unposted drafts: a publish racing this apply waits for it, and
  // a draft already posted is simply not selected (R18).
  const candidates = await tx
    .select()
    .from(socialDraftsTable)
    .where(
      and(
        eq(socialDraftsTable.tenantId, tenantId),
        inArray(socialDraftsTable.status, [...UNPOSTED_STATUSES]),
        sql`${socialDraftsTable.cardInput}->>'kind' = ${kind}`,
        // A queued carousel (all `kind: matchDay`) is drawn with its own set
        // design, not the kind's card: applying Match Day must not replace it.
        sql`NOT (${socialDraftsTable.cardInput} ? 'weekendCarousel')`,
      ),
    )
    .for("update");
  let changed = 0;
  for (const draft of candidates) {
    if (draftKind(draft) !== kind) continue;
    // A draft with a set design (a Round Team Lists set edited as one) keeps it.
    if (isSetDocument(draft.adjustments)) continue;
    await recordDraftRevision(draft, "template", tx);
    await tx
      .update(socialDraftsTable)
      .set({
        adjustments: structuredClone(template.adjustments ?? { layers: [] }),
        packId: "blank",
        templateVersion: template.version,
        templateRef: { copyId: template.id, version: template.version },
        designEditedAt: null,
        layoutWarnings: null,
        layoutCheckPending: true,
      })
      .where(eq(socialDraftsTable.id, draft.id));
    changed += 1;
  }
  const skipped = expectedDrafts === undefined ? 0 : Math.max(0, expectedDrafts - changed);
  return { changed, skipped };
}

/** The design columns a new draft takes from a template. */
export type TemplatedDesign = {
  packId: typeof BLANK_PACK_ID;
  adjustments: unknown;
  templateVersion: number;
  templateRef: DraftTemplateRefColumn;
  layoutCheckPending: true;
};

/** A draft's design copied from one of the club's templates (ADR-002). */
export function designFromCopy(template: CardTemplateRow): TemplatedDesign {
  return {
    packId: BLANK_PACK_ID,
    adjustments: structuredClone(template.adjustments ?? { layers: [] }),
    templateVersion: template.version,
    templateRef: { copyId: template.id, version: template.version },
    layoutCheckPending: true,
  };
}

/**
 * The design a new draft of `kind` starts with (ADR-011: every club, no
 * switch): a copy of the kind's default template, created from the club's
 * pack look if it doesn't exist yet. The draft owes a layout check before
 * automation can touch it (ADR-003). Null for a kind templates don't cover —
 * the draft keeps its pack.
 */
export async function templatedDesignFor(
  tenantId: number,
  kind: unknown,
  currentPackId: string | null,
): Promise<TemplatedDesign | null> {
  if (typeof kind !== "string" || !isTemplateKind(kind)) return null;
  return designFromCopy(await ensureKindTemplate(tenantId, kind, currentPackId));
}
