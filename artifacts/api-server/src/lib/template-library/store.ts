/**
 * Library reads (ADR-011 §3 "Browse", T3.5).
 *
 * A template shows in the library while it is listed AND its current version
 * passed the fit check. Library reads touch only the library tables: they never
 * return `card_templates` rows, so no club's copy is visible to another club.
 * The one tenant-aware read is `getLibraryTemplate`, which also lets a club
 * open an unlisted template it already holds a copy of (to see its credit and,
 * from L6, an update).
 *
 * Release 2 (ADR-012, R2-C): a club reports a template to Ovation (one report
 * per club, replaced when sent again), keeps favourites, and sorts the library
 * by popularity, newness or who made it.
 */
import {
  and,
  arrayContains,
  asc,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  notLike,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { SET_KIND_PREFIX } from "@workspace/scorecard/kind-templates";
import { TEMPLATE_BUNDLES } from "@workspace/template-bundles";
import {
  db,
  cardTemplatesTable,
  libraryTemplateFavouritesTable,
  libraryTemplateReportsTable,
  libraryTemplatesTable,
  libraryTemplateVersionsTable,
  templateLooksTable,
  tenantsTable,
  type TemplateCoverageColumn,
  type TemplateFitReportColumn,
  type TemplateFitStatus,
  type TemplateOrigin,
} from "@workspace/db";
import { TemplateLibraryError, libraryNotFound } from "./errors";

/** Templates per library page (PM: 24 a page). */
export const LIBRARY_PAGE_SIZE = 24;

export type LibraryLookRef = {
  id: number;
  slug: string;
  name: string;
  /** The design system a bundle look belongs to (`look.json` `family`), when it has one. */
  family?: string;
};

/** Each bundle look's family, from its `look.json` (Ovation's own looks only). */
const LOOK_FAMILIES = new Map(
  TEMPLATE_BUNDLES.flatMap((b) => (b.look.family ? [[b.slug, b.look.family] as const] : [])),
);

/** The family a look belongs to, or null. */
export const lookFamily = (slug: string): string | null => LOOK_FAMILIES.get(slug) ?? null;

/** A look reference, with its family when it has one. */
export function lookRef(id: number, slug: string, name: string): LibraryLookRef {
  const family = lookFamily(slug);
  return { id, slug, name, ...(family ? { family } : {}) };
}

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
  /** Style tags (release 2). */
  tags?: string[];
  /** How many clubs other than the author hold a copy (release 2). */
  usedBy?: number;
  /** The asking club published it, so it can unlist it (release 2). */
  ownedByClub?: boolean;
  /** In the asking club's favourites (release 2). */
  favourite?: boolean;
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
  tags: libraryTemplatesTable.tags,
  authorTenantId: libraryTemplatesTable.authorTenantId,
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
        ? lookRef(row.lookId, row.lookSlug, row.lookName)
        : null,
    version: row.version,
    coverage: row.coverage ?? { pages: [], sizes: [] },
    fitStatus: row.fitStatus,
    fitReport: row.fitReport,
    listed: row.listed,
    document: row.document,
    tags: row.tags,
  };
}

/**
 * How many clubs other than the author hold a copy of each template ("used
 * by N clubs", on `card_templates_origin_template_idx`).
 */
export async function usedByCounts(ids: readonly number[]): Promise<Map<number, number>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({
      id: cardTemplatesTable.originTemplateId,
      clubs: sql<number>`count(distinct ${cardTemplatesTable.tenantId})::int`,
    })
    .from(cardTemplatesTable)
    .innerJoin(
      libraryTemplatesTable,
      eq(libraryTemplatesTable.id, cardTemplatesTable.originTemplateId),
    )
    .where(
      and(
        inArray(cardTemplatesTable.originTemplateId, [...ids]),
        eq(cardTemplatesTable.source, "kind"),
        sql`${cardTemplatesTable.tenantId} is distinct from ${libraryTemplatesTable.authorTenantId}`,
      ),
    )
    .groupBy(cardTemplatesTable.originTemplateId);
  return new Map(rows.map((r) => [r.id!, r.clubs]));
}

/** Which of `ids` are in the club's favourites. */
async function favouriteIds(tenantId: number | null, ids: readonly number[]): Promise<Set<number>> {
  if (tenantId === null || ids.length === 0) return new Set();
  const rows = await db
    .select({ id: libraryTemplateFavouritesTable.templateId })
    .from(libraryTemplateFavouritesTable)
    .where(
      and(
        eq(libraryTemplateFavouritesTable.tenantId, tenantId),
        inArray(libraryTemplateFavouritesTable.templateId, [...ids]),
      ),
    );
  return new Set(rows.map((r) => r.id));
}

/** Views with the release 2 counts, ownership and favourites for the asking club. */
async function withClubFields(
  rows: ViewRow[],
  tenantId: number | null,
): Promise<LibraryTemplateView[]> {
  const ids = rows.map((r) => r.id);
  const [used, favourites] = await Promise.all([usedByCounts(ids), favouriteIds(tenantId, ids)]);
  return rows.map((row) => ({
    ...present(row),
    usedBy: used.get(row.id) ?? 0,
    ownedByClub: tenantId !== null && row.origin === "club" && row.authorTenantId === tenantId,
    favourite: favourites.has(row.id),
  }));
}

/** Other clubs holding a copy, per template (the `popular` sort; as `usedByCounts`). */
const usedByCount = sql<number>`(
  select count(distinct ${cardTemplatesTable.tenantId})::int from ${cardTemplatesTable}
  where ${cardTemplatesTable.originTemplateId} = ${libraryTemplatesTable.id}
    and ${cardTemplatesTable.source} = 'kind'
    and ${cardTemplatesTable.tenantId} is distinct from ${libraryTemplatesTable.authorTenantId}
)`;

const clubMade = sql`(${libraryTemplatesTable.origin} = 'club')`;

/** The library's sort orders (release 2); none is the library's own order, by id. */
export type LibrarySort = "popular" | "new" | "ovation" | "club";

const SORT_ORDER: Record<LibrarySort, SQL[]> = {
  popular: [desc(usedByCount), asc(libraryTemplatesTable.id)],
  new: [sql`${libraryTemplatesTable.listedAt} desc nulls last`, desc(libraryTemplatesTable.id)],
  ovation: [asc(clubMade), asc(libraryTemplatesTable.id)],
  club: [desc(clubMade), asc(libraryTemplatesTable.id)],
};

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Listed, and its current version passed the fit check: what clubs see. */
const visible = (): SQL =>
  and(eq(libraryTemplatesTable.listed, true), eq(libraryTemplateVersionsTable.fitStatus, "pass"))!;

export type LibraryListQuery = {
  /** Words that must each appear in the name, the kind or the look's name. */
  q?: string;
  kind?: string;
  size?: string;
  /** A look's slug. */
  look?: string;
  /** Style tags, comma-separated; a template must carry every one. */
  tags?: string;
  sort?: LibrarySort;
  /** Only the asking club's favourites. */
  favourites?: boolean;
  /**
   * The previous page's `nextCursor`: the last template id in the library's
   * own order, or how many templates were already shown with a sort.
   */
  cursor?: number;
};

export async function listLibraryTemplates(
  q: LibraryListQuery,
  tenantId: number | null = null,
): Promise<{ templates: LibraryTemplateView[]; nextCursor: number | null }> {
  const where: SQL[] = [visible()];
  // Set templates (`set:<type>`) list only when asked for by kind: the library's
  // card browser shows card kinds, the set picker asks for its set type.
  if (q.kind) where.push(eq(libraryTemplatesTable.kind, q.kind));
  else where.push(notLike(libraryTemplatesTable.kind, `${SET_KIND_PREFIX}%`));
  if (q.size) where.push(sql`${libraryTemplateVersionsTable.coverage}->'sizes' ? ${q.size}`);
  if (q.look) where.push(eq(templateLooksTable.slug, q.look));
  const tags = (q.tags ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 8);
  if (tags.length > 0) {
    where.push(arrayContains(libraryTemplatesTable.tags, tags));
  }
  for (const word of (q.q ?? "").toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6)) {
    const pattern = `%${likeEscape(word)}%`;
    where.push(
      or(
        ilike(libraryTemplatesTable.name, pattern),
        ilike(libraryTemplatesTable.kind, pattern),
        ilike(templateLooksTable.name, pattern),
      )!,
    );
  }
  if (q.favourites) {
    if (tenantId === null) return { templates: [], nextCursor: null };
    where.push(
      sql`exists (select 1 from ${libraryTemplateFavouritesTable}
        where ${libraryTemplateFavouritesTable.tenantId} = ${tenantId}
          and ${libraryTemplateFavouritesTable.templateId} = ${libraryTemplatesTable.id})`,
    );
  }
  // A sort pages by offset; the library's own order by id (stable while templates are added).
  const offset = q.sort ? Math.max(0, Math.floor(q.cursor ?? 0)) : 0;
  if (!q.sort && q.cursor !== undefined) where.push(gt(libraryTemplatesTable.id, q.cursor));
  const rows = await viewQuery()
    .where(and(...where))
    .orderBy(...(q.sort ? SORT_ORDER[q.sort] : [asc(libraryTemplatesTable.id)]))
    .limit(LIBRARY_PAGE_SIZE + 1)
    .offset(offset);
  const page = await withClubFields(rows.slice(0, LIBRARY_PAGE_SIZE), tenantId);
  const more = rows.length > LIBRARY_PAGE_SIZE;
  return {
    templates: page,
    nextCursor: !more
      ? null
      : q.sort
        ? offset + LIBRARY_PAGE_SIZE
        : (page[page.length - 1]?.id ?? null),
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
  const [view] = await withClubFields([row], tenantId);
  if (!view) throw libraryNotFound();
  if (view.listed && view.fitStatus === "pass") return view;
  // The author always sees its own, listed or not.
  if (view.ownedByClub) return view;
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

/**
 * Report a template to Ovation. One report per club and template: sending
 * again replaces the reason and reopens it. A club's own template is unlisted,
 * not reported.
 */
export async function reportLibraryTemplate(
  tenantId: number,
  adminId: number | null,
  id: number,
  reason: string,
): Promise<void> {
  const template = await getLibraryTemplate(tenantId, id);
  if (template.ownedByClub) {
    throw new TemplateLibraryError(400, {
      error: "This is your club's template: unlist it instead.",
    });
  }
  const text = reason.trim();
  if (!text) throw new TemplateLibraryError(400, { error: "Say what's wrong with it." });
  await db
    .insert(libraryTemplateReportsTable)
    .values({ templateId: id, tenantId, adminId, reason: text })
    .onConflictDoUpdate({
      target: [libraryTemplateReportsTable.templateId, libraryTemplateReportsTable.tenantId],
      set: { reason: text, adminId, createdAt: new Date(), resolvedAt: null },
    });
}

/** Add a template the club can see to its favourites (again is fine). */
export async function favouriteLibraryTemplate(tenantId: number, id: number): Promise<void> {
  await getLibraryTemplate(tenantId, id);
  await db
    .insert(libraryTemplateFavouritesTable)
    .values({ tenantId, templateId: id })
    .onConflictDoNothing();
}

/** Take a template out of the club's favourites (whether or not it was in them). */
export async function unfavouriteLibraryTemplate(tenantId: number, id: number): Promise<void> {
  await db
    .delete(libraryTemplateFavouritesTable)
    .where(
      and(
        eq(libraryTemplateFavouritesTable.tenantId, tenantId),
        eq(libraryTemplateFavouritesTable.templateId, id),
      ),
    );
}

/** A template this club published, listed or not (404 for anyone else's). */
export async function getOwnLibraryTemplate(
  tenantId: number,
  id: number,
): Promise<LibraryTemplateView> {
  const [row] = await viewQuery().where(
    and(
      eq(libraryTemplatesTable.id, id),
      eq(libraryTemplatesTable.authorTenantId, tenantId),
      eq(libraryTemplatesTable.origin, "club"),
    ),
  );
  if (!row) throw libraryNotFound("That isn't a template your club published.");
  const [view] = await withClubFields([row], tenantId);
  return view!;
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
  /** The design system the look belongs to, when it has one ("Ovation Match Graphics"). */
  family?: string;
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
      ...(lookFamily(look.slug) ? { family: lookFamily(look.slug)! } : {}),
      // A look's card templates; its set templates open from the set picker.
      templates: templates
        .filter((t) => t.lookId === look.id && !t.kind.startsWith(SET_KIND_PREFIX))
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
