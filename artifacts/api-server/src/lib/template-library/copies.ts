/**
 * A club's own templates ("copies", ADR-011 §2–3, T3.6, T3.7).
 *
 * Copies are `card_templates` rows with `source = 'kind'`: many per kind, one
 * of them the kind's default (`is_kind_default`). Every read and write here is
 * filtered by tenant. A copy taken from the library records its origin
 * template and version; the club's first saved change to the document sets
 * `edited_at`, after which the copy is standalone. Using a template, setting
 * a default or adopting a look never counts as an edit.
 */
import { and, asc, eq, inArray, isNull, notLike, sql } from "drizzle-orm";
import {
  db,
  cardTemplatesTable,
  libraryTemplatesTable,
  libraryTemplateVersionsTable,
  templateLooksTable,
  tenantsTable,
  type CardTemplateRow,
  type TemplateCoverageColumn,
  type TemplateFitReportColumn,
  type TemplateFitStatus,
} from "@workspace/db";
import {
  isDocumentV2,
  SET_KIND_PREFIX,
  setTypeOfKind,
  templateDocumentErrors,
} from "@workspace/scorecard/kind-templates";
import {
  applyTemplateToDrafts,
  isTemplateKind,
  KIND_SOURCE,
  updatedByName,
  validateDocument,
  waitingDraftCounts,
} from "../kind-templates";
import { documentCoverage } from "./coverage";
import { copyNotFound, TemplateLibraryError } from "./errors";
import { initialFit, requestFit } from "./fit";
import { loadLibraryVersion, lookTemplates, OVATION_AUTHOR } from "./store";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The longest name a club may give a template. */
export const MAX_TEMPLATE_NAME = 80;

export type ClubTemplateOrigin = {
  templateId: number;
  version: number;
  name: string;
  authorName: string;
  look: { id: number; slug: string; name: string } | null;
};

/** The origin's current version, for working out "update available". */
type OriginRow = ClubTemplateOrigin & { currentVersion: number };

export type ClubTemplateView = {
  id: number;
  kind: string;
  name: string;
  version: number;
  isDefault: boolean;
  /** The library template it came from, while that template exists. */
  basedOn: ClubTemplateOrigin | null;
  /** Saved changes made it the club's own: no update prompts. */
  edited: boolean;
  /**
   * A newer version of the library template it came from (listed or not), for
   * an unedited copy (ADR-011 §3 "Update available", T6.1); null otherwise.
   */
  updateAvailable: { version: number } | null;
  fitStatus: TemplateFitStatus;
  fitReport: TemplateFitReportColumn | null;
  coverage: TemplateCoverageColumn;
  updatedAt: string | null;
  waitingDrafts: number;
  document?: unknown;
  updatedByName?: string | null;
};

const kindRows = (tenantId: number) =>
  and(eq(cardTemplatesTable.tenantId, tenantId), eq(cardTemplatesTable.source, KIND_SOURCE));

/** Origins of the given copies, keyed by library template id. */
async function originsFor(rows: CardTemplateRow[]): Promise<Map<number, OriginRow>> {
  const ids = [
    ...new Set(rows.map((r) => r.originTemplateId).filter((id): id is number => id !== null)),
  ];
  if (ids.length === 0) return new Map();
  const found = await db
    .select({
      id: libraryTemplatesTable.id,
      name: libraryTemplatesTable.name,
      currentVersion: libraryTemplatesTable.currentVersion,
      lookId: templateLooksTable.id,
      lookSlug: templateLooksTable.slug,
      lookName: templateLooksTable.name,
      authorName: tenantsTable.name,
    })
    .from(libraryTemplatesTable)
    .leftJoin(templateLooksTable, eq(templateLooksTable.id, libraryTemplatesTable.lookId))
    .leftJoin(tenantsTable, eq(tenantsTable.id, libraryTemplatesTable.authorTenantId))
    .where(inArray(libraryTemplatesTable.id, ids));
  return new Map(
    found.map((t) => [
      t.id,
      {
        templateId: t.id,
        version: 0,
        currentVersion: t.currentVersion,
        name: t.name,
        authorName: t.authorName ?? OVATION_AUTHOR,
        look:
          t.lookId !== null && t.lookSlug !== null && t.lookName !== null
            ? { id: t.lookId, slug: t.lookSlug, name: t.lookName }
            : null,
      },
    ]),
  );
}

function present(
  row: CardTemplateRow,
  origins: Map<number, OriginRow>,
  waiting: Map<string, number>,
  opts: { withDocument?: boolean; updatedByName?: string | null } = {},
): ClubTemplateView {
  const kind = row.baseKind ?? "";
  const origin = row.originTemplateId !== null ? origins.get(row.originTemplateId) : undefined;
  const view: ClubTemplateView = {
    id: row.id,
    kind,
    name: row.name,
    version: row.version,
    isDefault: row.isKindDefault,
    basedOn: origin
      ? {
          templateId: origin.templateId,
          version: row.originVersion ?? 0,
          name: origin.name,
          authorName: origin.authorName,
          look: origin.look,
        }
      : null,
    edited: row.editedAt !== null,
    updateAvailable:
      origin && row.editedAt === null && origin.currentVersion > (row.originVersion ?? 0)
        ? { version: origin.currentVersion }
        : null,
    fitStatus: row.fitStatus,
    fitReport: row.fitReport,
    coverage: documentCoverage(row.adjustments, kind),
    updatedAt: (row.updatedAt ?? row.createdAt)?.toISOString() ?? null,
    waitingDrafts: row.isKindDefault ? (waiting.get(kind) ?? 0) : 0,
  };
  if (opts.withDocument) {
    view.document = row.adjustments ?? { layers: [] };
    view.updatedByName = opts.updatedByName ?? null;
  }
  return view;
}

/**
 * A tenant's copies, defaults first within each kind. Set templates
 * (`set:<type>`) list only when asked for by kind or with `includeSets`.
 */
export async function listClubTemplates(
  tenantId: number,
  kind?: string,
  opts: { includeSets?: boolean } = {},
): Promise<ClubTemplateView[]> {
  const rows = await db
    .select()
    .from(cardTemplatesTable)
    .where(
      and(
        kindRows(tenantId),
        kind
          ? eq(cardTemplatesTable.baseKind, kind)
          : opts.includeSets
            ? undefined
            : notLike(cardTemplatesTable.baseKind, `${SET_KIND_PREFIX}%`),
      ),
    )
    .orderBy(
      asc(cardTemplatesTable.baseKind),
      sql`${cardTemplatesTable.isKindDefault} desc`,
      asc(cardTemplatesTable.id),
    );
  const [origins, waiting] = await Promise.all([originsFor(rows), waitingDraftCounts(tenantId)]);
  return rows.map((r) => present(r, origins, waiting));
}

/** One of the tenant's copies (any tenant's id answers 404). */
export async function loadCopy(
  tenantId: number,
  id: number,
  tx: typeof db | Tx = db,
): Promise<CardTemplateRow> {
  const [row] = await tx
    .select()
    .from(cardTemplatesTable)
    .where(and(kindRows(tenantId), eq(cardTemplatesTable.id, id)));
  if (!row) throw copyNotFound();
  return row;
}

export async function presentCopy(row: CardTemplateRow): Promise<ClubTemplateView> {
  const [origins, waiting, byName] = await Promise.all([
    originsFor([row]),
    waitingDraftCounts(row.tenantId),
    updatedByName(row),
  ]);
  return present(row, origins, waiting, { withDocument: true, updatedByName: byName });
}

/**
 * Make `copyId` the default for its kind, inside `tx`. The tenant's rows of
 * the kind are locked first so concurrent switches serialise; the old default
 * is cleared before the new one is set, as the partial unique index requires.
 */
async function makeDefault(tx: Tx, tenantId: number, kind: string, copyId: number): Promise<void> {
  await tx
    .select({ id: cardTemplatesTable.id })
    .from(cardTemplatesTable)
    .where(and(kindRows(tenantId), eq(cardTemplatesTable.baseKind, kind)))
    .for("update");
  await tx
    .update(cardTemplatesTable)
    .set({ isKindDefault: false })
    .where(
      and(
        kindRows(tenantId),
        eq(cardTemplatesTable.baseKind, kind),
        eq(cardTemplatesTable.isKindDefault, true),
      ),
    );
  await tx
    .update(cardTemplatesTable)
    .set({ isKindDefault: true })
    .where(and(kindRows(tenantId), eq(cardTemplatesTable.id, copyId)));
}

/** Insert a copy of a library version for the tenant, inside `tx`. */
async function insertLibraryCopy(
  tx: Tx,
  tenantId: number,
  source: Awaited<ReturnType<typeof loadLibraryVersion>>,
  adminId: number | null,
): Promise<CardTemplateRow> {
  const kind = source.template.kind;
  const [row] = await tx
    .insert(cardTemplatesTable)
    .values({
      tenantId,
      name: source.template.name.slice(0, MAX_TEMPLATE_NAME),
      source: KIND_SOURCE,
      baseKind: kind,
      cardKinds: [kind],
      adjustments: structuredClone(source.document),
      version: 1,
      updatedAt: new Date(),
      updatedByAdminId: adminId,
      isKindDefault: false,
      originTemplateId: source.template.id,
      originVersion: source.version,
      // A copy inherits the version's fit result; it is the same document.
      fitStatus: source.fitStatus,
      fitReport: source.fitReport,
    })
    .returning();
  return row!;
}

/**
 * Use a library template: copy one of its versions (the current one by
 * default) into a new club template. `makeDefault` also makes it the kind's
 * default, in the same transaction ("Use as default").
 */
export async function createCopy(
  tenantId: number,
  body: { libraryTemplateId: number; version?: number; makeDefault?: boolean },
  adminId: number | null,
): Promise<CardTemplateRow> {
  const source = await loadLibraryVersion(body.libraryTemplateId, body.version);
  if (!isTemplateKind(source.template.kind)) {
    throw new TemplateLibraryError(400, { error: "That template's card kind isn't supported." });
  }
  return db.transaction(async (tx) => {
    const row = await insertLibraryCopy(tx, tenantId, source, adminId);
    if (body.makeDefault) {
      if (row.fitStatus === "pending") throw pendingDefault();
      await makeDefault(tx, tenantId, row.baseKind ?? "", row.id);
    }
    return loadCopy(tenantId, row.id, tx);
  });
}

/** Duplicate one of the club's templates. The duplicate keeps the credit and edit state; it is never the default. */
export async function duplicateCopy(
  tenantId: number,
  id: number,
  adminId: number | null,
): Promise<CardTemplateRow> {
  const src = await loadCopy(tenantId, id);
  const [row] = await db
    .insert(cardTemplatesTable)
    .values({
      tenantId,
      name: `${src.name} (copy)`.slice(0, MAX_TEMPLATE_NAME),
      source: KIND_SOURCE,
      baseKind: src.baseKind,
      cardKinds: src.cardKinds,
      adjustments: structuredClone(src.adjustments),
      version: 1,
      updatedAt: new Date(),
      updatedByAdminId: adminId,
      isKindDefault: false,
      originTemplateId: src.originTemplateId,
      originVersion: src.originVersion,
      editedAt: src.editedAt,
      fitStatus: src.fitStatus,
      fitReport: src.fitReport,
    })
    .returning();
  return row!;
}

const conflict = async (row: CardTemplateRow) =>
  new TemplateLibraryError(409, {
    error: "Someone else changed this template since you opened it.",
    currentVersion: row.version,
    updatedAt: (row.updatedAt ?? row.createdAt)?.toISOString() ?? null,
    updatedByName: await updatedByName(row),
  });

const pendingDefault = () =>
  new TemplateLibraryError(409, {
    error: "This template's layout check is still running. Try again when it has finished.",
  });

/** Check a document a club saves: the v1 rules as today, or the format's own rules for v2. */
function validateCopyDocument(document: unknown, kind: string): unknown {
  if (!isDocumentV2(document) && !setTypeOfKind(kind)) return validateDocument(document, kind);
  const problems = templateDocumentErrors(document, kind);
  if (problems.length > 0) {
    throw new TemplateLibraryError(400, { error: problems[0], problems: problems.slice(0, 20) });
  }
  if (documentCoverage(document, kind).pages.length === 0) {
    throw new TemplateLibraryError(400, { error: "Add at least one element before saving." });
  }
  return document;
}

/**
 * Save one of the club's templates, unless someone saved since `baseVersion`
 * (409). A new document is the club's edit: the first one sets `edited_at`,
 * and every one asks for a fit check. A rename alone is neither.
 */
export async function saveCopy(
  tenantId: number,
  id: number,
  body: { baseVersion: number; document?: unknown; name?: string },
  adminId: number | null,
): Promise<CardTemplateRow> {
  const row = await loadCopy(tenantId, id);
  const kind = row.baseKind ?? "";
  const name = body.name?.trim();
  if (body.name !== undefined && (!name || name.length > MAX_TEMPLATE_NAME)) {
    throw new TemplateLibraryError(400, {
      error: `A template name needs 1 to ${MAX_TEMPLATE_NAME} characters.`,
    });
  }
  const document =
    body.document === undefined ? undefined : validateCopyDocument(body.document, kind);
  if (row.version !== body.baseVersion) throw await conflict(row);
  const fit = document === undefined ? null : initialFit();
  const [saved] = await db
    .update(cardTemplatesTable)
    .set({
      ...(name ? { name } : {}),
      ...(document === undefined
        ? {}
        : { adjustments: document, editedAt: row.editedAt ?? new Date(), ...fit }),
      version: row.version + 1,
      updatedAt: new Date(),
      updatedByAdminId: adminId,
    })
    .where(
      and(
        kindRows(tenantId),
        eq(cardTemplatesTable.id, id),
        eq(cardTemplatesTable.version, row.version),
      ),
    )
    .returning();
  if (!saved) throw await conflict(await loadCopy(tenantId, id));
  if (document !== undefined) {
    requestFit(
      { kind: "copy", tenantId, copyId: saved.id, version: saved.version },
      document,
      kind,
    );
  }
  return saved;
}

/** Delete one of the club's templates; never the kind's default. */
export async function deleteCopy(tenantId: number, id: number): Promise<void> {
  const row = await loadCopy(tenantId, id);
  if (row.isKindDefault) {
    throw new TemplateLibraryError(400, {
      error: "This is the default for its card kind. Choose another default before deleting it.",
    });
  }
  await db
    .delete(cardTemplatesTable)
    .where(
      and(
        kindRows(tenantId),
        eq(cardTemplatesTable.id, id),
        eq(cardTemplatesTable.isKindDefault, false),
      ),
    );
}

/** Make one of the club's templates its kind's default; refused while its fit check is pending. */
export async function setDefaultCopy(tenantId: number, id: number): Promise<CardTemplateRow> {
  return db.transaction(async (tx) => {
    const row = await loadCopy(tenantId, id, tx);
    if (row.fitStatus === "pending") throw pendingDefault();
    if (!row.isKindDefault) await makeDefault(tx, tenantId, row.baseKind ?? "", row.id);
    return loadCopy(tenantId, id, tx);
  });
}

export type AdoptLookResult = {
  look: { id: number; slug: string; name: string };
  /** The kinds whose default is now the look's template. */
  changed: Array<{ kind: string; copyId: number; created: boolean }>;
  /** Kinds the look covers whose default already was that template. */
  unchanged: Array<{ kind: string; copyId: number }>;
};

/**
 * Adopt a look: for every kind it covers, reuse the club's unedited copy of
 * that template at its current version, or create one, and make it the
 * default — all in one transaction. Kinds the look doesn't cover keep theirs.
 */
export async function adoptLook(
  tenantId: number,
  lookId: number,
  adminId: number | null,
): Promise<AdoptLookResult> {
  const [look] = await db
    .select({
      id: templateLooksTable.id,
      slug: templateLooksTable.slug,
      name: templateLooksTable.name,
    })
    .from(templateLooksTable)
    .where(eq(templateLooksTable.id, lookId));
  const templates = look ? (await lookTemplates(lookId)).filter((t) => isTemplateKind(t.kind)) : [];
  if (!look || templates.length === 0) {
    throw new TemplateLibraryError(404, { error: "That look isn't in the library." });
  }
  return db.transaction(async (tx) => {
    const result: AdoptLookResult = { look, changed: [], unchanged: [] };
    for (const t of templates) {
      const [reuse] = await tx
        .select()
        .from(cardTemplatesTable)
        .where(
          and(
            kindRows(tenantId),
            eq(cardTemplatesTable.baseKind, t.kind),
            eq(cardTemplatesTable.originTemplateId, t.id),
            eq(cardTemplatesTable.originVersion, t.version),
            isNull(cardTemplatesTable.editedAt),
          ),
        )
        .orderBy(sql`${cardTemplatesTable.isKindDefault} desc`, asc(cardTemplatesTable.id))
        .limit(1);
      if (reuse?.isKindDefault) {
        result.unchanged.push({ kind: t.kind, copyId: reuse.id });
        continue;
      }
      const copy =
        reuse ??
        (await insertLibraryCopy(
          tx,
          tenantId,
          {
            template: t,
            version: t.version,
            document: t.document,
            fitStatus: t.fitStatus,
            fitReport: t.fitReport,
          },
          adminId,
        ));
      await makeDefault(tx, tenantId, t.kind, copy.id);
      result.changed.push({ kind: t.kind, copyId: copy.id, created: !reuse });
    }
    return result;
  });
}

/**
 * Apply one of the club's templates, at `version`, to the unposted drafts of
 * its kind ("apply to waiting drafts").
 */
export async function applyCopy(
  tenantId: number,
  id: number,
  version: number,
  expectedDrafts?: number,
): Promise<{ changed: number; skipped: number }> {
  return db.transaction(async (tx) => {
    const row = await loadCopy(tenantId, id, tx);
    if (row.version !== version) throw await conflict(row);
    return applyTemplateToDrafts(tx, row, expectedDrafts);
  });
}

/**
 * Take the library's newer version into an unedited copy (ADR-011 §3, T6.1):
 * the document is replaced, `origin_version` moves to the new version and the
 * copy's own `version` goes up. The copy stays unedited, so it keeps being
 * offered updates. An edited copy is the club's own and is refused.
 */
export async function takeUpdate(
  tenantId: number,
  id: number,
  baseVersion: number,
  adminId: number | null,
): Promise<CardTemplateRow> {
  const row = await loadCopy(tenantId, id);
  if (row.editedAt !== null) {
    throw new TemplateLibraryError(409, {
      error: "This template has your own changes, so it doesn't take updates.",
    });
  }
  if (row.originTemplateId === null) {
    throw new TemplateLibraryError(409, { error: "This template didn't come from the library." });
  }
  const [origin] = await db
    .select({
      currentVersion: libraryTemplatesTable.currentVersion,
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
    .where(eq(libraryTemplatesTable.id, row.originTemplateId));
  if (!origin || origin.currentVersion <= (row.originVersion ?? 0)) {
    throw new TemplateLibraryError(409, { error: "There is no newer version to take." });
  }
  if (row.version !== baseVersion) throw await conflict(row);
  const [saved] = await db
    .update(cardTemplatesTable)
    .set({
      adjustments: structuredClone(origin.document),
      originVersion: origin.currentVersion,
      version: row.version + 1,
      fitStatus: origin.fitStatus,
      fitReport: origin.fitReport,
      updatedAt: new Date(),
      updatedByAdminId: adminId,
    })
    .where(
      and(
        kindRows(tenantId),
        eq(cardTemplatesTable.id, id),
        eq(cardTemplatesTable.version, row.version),
        isNull(cardTemplatesTable.editedAt),
      ),
    )
    .returning();
  if (!saved) throw await conflict(await loadCopy(tenantId, id));
  return saved;
}
