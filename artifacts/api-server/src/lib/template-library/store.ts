/**
 * Library reads (ADR-011 §3 "Browse", T3.5).
 *
 * A template shows in the library while it is listed AND its current version
 * passed the fit check. Library reads touch only the library tables: they never
 * return `card_templates` rows, so no club's copy is visible to another club.
 * The one tenant-aware read is `getLibraryTemplate`, which also lets a club
 * open an unlisted template it already holds a copy of (to see its credit and,
 * from L6, an update).
 */
import { and, asc, eq, gt, inArray, sql, type SQL } from "drizzle-orm";
import {
  db,
  cardTemplatesTable,
  libraryTemplatesTable,
  libraryTemplateVersionsTable,
  templateLooksTable,
  tenantsTable,
  type TemplateCoverageColumn,
  type TemplateFitReportColumn,
  type TemplateFitStatus,
  type TemplateOrigin,
} from "@workspace/db";
import { libraryNotFound } from "./errors";

/** Templates per library page (PM: 24 a page). */
export const LIBRARY_PAGE_SIZE = 24;

export type LibraryLookRef = { id: number; slug: string; name: string };

export type LibraryTemplateView = {
  id: number;
  slug: string | null;
  kind: string;
  name: string;
  origin: TemplateOrigin;
  /** Null = Ovation. */
  authorName: string;
  look: LibraryLookRef | null;
  version: number;
  coverage: TemplateCoverageColumn;
  fitStatus: TemplateFitStatus;
  fitReport: TemplateFitReportColumn | null;
  listed: boolean;
  document: unknown;
};

export const OVATION_AUTHOR = "Ovation";

/** The columns every library read selects: template, its current version, look and author. */
const viewColumns = {
  id: libraryTemplatesTable.id,
  slug: libraryTemplatesTable.slug,
  kind: libraryTemplatesTable.kind,
  name: libraryTemplatesTable.name,
  origin: libraryTemplatesTable.origin,
  listed: libraryTemplatesTable.listed,
  version: libraryTemplatesTable.currentVersion,
  lookId: templateLooksTable.id,
  lookSlug: templateLooksTable.slug,
  lookName: templateLooksTable.name,
  authorName: tenantsTable.name,
  coverage: libraryTemplateVersionsTable.coverage,
  fitStatus: libraryTemplateVersionsTable.fitStatus,
  fitReport: libraryTemplateVersionsTable.fitReport,
  document: libraryTemplateVersionsTable.document,
};

function viewQuery() {
  return db
    .select(viewColumns)
    .from(libraryTemplatesTable)
    .innerJoin(
      libraryTemplateVersionsTable,
      and(
        eq(libraryTemplateVersionsTable.templateId, libraryTemplatesTable.id),
        eq(libraryTemplateVersionsTable.version, libraryTemplatesTable.currentVersion),
      ),
    )
    .leftJoin(templateLooksTable, eq(templateLooksTable.id, libraryTemplatesTable.lookId))
    .leftJoin(tenantsTable, eq(tenantsTable.id, libraryTemplatesTable.authorTenantId));
}

type ViewRow = Awaited<ReturnType<typeof viewQuery>>[number];

function present(row: ViewRow): LibraryTemplateView {
  return {
    id: row.id,
    slug: row.slug,
    kind: row.kind,
    name: row.name,
    origin: row.origin,
    authorName: row.authorName ?? OVATION_AUTHOR,
    look:
      row.lookId !== null && row.lookSlug !== null && row.lookName !== null
        ? { id: row.lookId, slug: row.lookSlug, name: row.lookName }
        : null,
    version: row.version,
    coverage: row.coverage ?? { pages: [], sizes: [] },
    fitStatus: row.fitStatus,
    fitReport: row.fitReport,
    listed: row.listed,
    document: row.document,
  };
}

/** Listed, and its current version passed the fit check: what clubs see. */
const visible = (): SQL =>
  and(eq(libraryTemplatesTable.listed, true), eq(libraryTemplateVersionsTable.fitStatus, "pass"))!;

export type LibraryListQuery = {
  kind?: string;
  size?: string;
  /** A look's slug. */
  look?: string;
  /** The last template id of the previous page. */
  cursor?: number;
};

export async function listLibraryTemplates(
  q: LibraryListQuery,
): Promise<{ templates: LibraryTemplateView[]; nextCursor: number | null }> {
  const where: SQL[] = [visible()];
  if (q.kind) where.push(eq(libraryTemplatesTable.kind, q.kind));
  if (q.size) where.push(sql`${libraryTemplateVersionsTable.coverage}->'sizes' ? ${q.size}`);
  if (q.look) where.push(eq(templateLooksTable.slug, q.look));
  if (q.cursor !== undefined) where.push(gt(libraryTemplatesTable.id, q.cursor));
  const rows = await viewQuery()
    .where(and(...where))
    .orderBy(asc(libraryTemplatesTable.id))
    .limit(LIBRARY_PAGE_SIZE + 1);
  const page = rows.slice(0, LIBRARY_PAGE_SIZE).map(present);
  return {
    templates: page,
    nextCursor: rows.length > LIBRARY_PAGE_SIZE ? (page[page.length - 1]?.id ?? null) : null,
  };
}

/**
 * One library template at its current version: a visible one, or one the
 * tenant holds a copy of (listed or not).
 */
export async function getLibraryTemplate(
  tenantId: number,
  id: number,
): Promise<LibraryTemplateView> {
  const [row] = await viewQuery().where(eq(libraryTemplatesTable.id, id));
  if (!row) throw libraryNotFound();
  const view = present(row);
  if (view.listed && view.fitStatus === "pass") return view;
  const [copy] = await db
    .select({ id: cardTemplatesTable.id })
    .from(cardTemplatesTable)
    .where(
      and(
        eq(cardTemplatesTable.tenantId, tenantId),
        eq(cardTemplatesTable.source, "kind"),
        eq(cardTemplatesTable.originTemplateId, id),
      ),
    )
    .limit(1);
  if (!copy) throw libraryNotFound();
  return view;
}

/** A library version's document and fit, for copying (any version of a visible template). */
export async function loadLibraryVersion(
  id: number,
  version?: number,
): Promise<{
  template: LibraryTemplateView;
  version: number;
  document: unknown;
  fitStatus: TemplateFitStatus;
  fitReport: TemplateFitReportColumn | null;
}> {
  const [row] = await viewQuery().where(and(eq(libraryTemplatesTable.id, id), visible()));
  if (!row) throw libraryNotFound();
  const template = present(row);
  if (version === undefined || version === template.version) {
    return {
      template,
      version: template.version,
      document: template.document,
      fitStatus: template.fitStatus,
      fitReport: template.fitReport,
    };
  }
  const [v] = await db
    .select()
    .from(libraryTemplateVersionsTable)
    .where(
      and(
        eq(libraryTemplateVersionsTable.templateId, id),
        eq(libraryTemplateVersionsTable.version, version),
      ),
    );
  if (!v) throw libraryNotFound("That version of the template doesn't exist.");
  return {
    template,
    version: v.version,
    document: v.document,
    fitStatus: v.fitStatus,
    fitReport: v.fitReport,
  };
}

export type LibraryLookView = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  authorName: string;
  /** The look's visible templates, one per kind. */
  templates: Array<{
    id: number;
    kind: string;
    name: string;
    version: number;
    coverage: TemplateCoverageColumn;
  }>;
};

/** Looks with at least one visible template, in display order. */
export async function listLibraryLooks(): Promise<LibraryLookView[]> {
  const looks = await db
    .select({
      id: templateLooksTable.id,
      slug: templateLooksTable.slug,
      name: templateLooksTable.name,
      description: templateLooksTable.description,
      authorName: tenantsTable.name,
    })
    .from(templateLooksTable)
    .leftJoin(tenantsTable, eq(tenantsTable.id, templateLooksTable.authorTenantId))
    .orderBy(asc(templateLooksTable.displayOrder), asc(templateLooksTable.id));
  if (looks.length === 0) return [];
  const templates = await viewQuery()
    .where(
      and(
        visible(),
        inArray(
          libraryTemplatesTable.lookId,
          looks.map((l) => l.id),
        ),
      ),
    )
    .orderBy(asc(libraryTemplatesTable.kind), asc(libraryTemplatesTable.id));
  return looks
    .map((look) => ({
      id: look.id,
      slug: look.slug,
      name: look.name,
      description: look.description,
      authorName: look.authorName ?? OVATION_AUTHOR,
      templates: templates
        .filter((t) => t.lookId === look.id)
        .map((t) => ({
          id: t.id,
          kind: t.kind,
          name: t.name,
          version: t.version,
          coverage: t.coverage ?? { pages: [], sizes: [] },
        })),
    }))
    .filter((look) => look.templates.length > 0);
}

/** One look's visible templates, one per kind (the first listed wins). */
export async function lookTemplates(lookId: number): Promise<LibraryTemplateView[]> {
  const rows = await viewQuery()
    .where(and(visible(), eq(libraryTemplatesTable.lookId, lookId)))
    .orderBy(asc(libraryTemplatesTable.id));
  const byKind = new Map<string, LibraryTemplateView>();
  for (const row of rows) {
    const view = present(row);
    if (!byKind.has(view.kind)) byKind.set(view.kind, view);
  }
  return [...byKind.values()];
}
