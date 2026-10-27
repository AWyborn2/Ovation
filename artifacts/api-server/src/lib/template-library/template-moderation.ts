/**
 * Library template reports and favourites (release 2, ADR-012 R2-C), as for
 * elements: any club admin can report a listed template once (reporting again
 * replaces the reason); the platform console reads the reports, and Ovation's
 * unlisting resolves them. Favourites are each club's own list.
 */
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  db,
  libraryTemplateFavouritesTable,
  libraryTemplateReportsTable,
  libraryTemplatesTable,
  libraryTemplateVersionsTable,
  tenantsTable,
} from "@workspace/db";
import { libraryNotFound, TemplateLibraryError } from "./errors";

/** The longest reason a report keeps (the spec's limit). */
export const MAX_REPORT_REASON = 500;

/** Open reports per library template, as a correlated count. */
export const openTemplateReports = sql<number>`(
  select count(*)::int from ${libraryTemplateReportsTable}
  where ${libraryTemplateReportsTable.templateId} = ${libraryTemplatesTable.id}
    and ${libraryTemplateReportsTable.resolvedAt} is null
)`;

/** A template clubs can see (listed, current version passed), with its author. */
async function visibleTemplate(id: number): Promise<{ authorTenantId: number | null }> {
  const [row] = await db
    .select({ authorTenantId: libraryTemplatesTable.authorTenantId })
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
        eq(libraryTemplatesTable.id, id),
        eq(libraryTemplatesTable.listed, true),
        eq(libraryTemplateVersionsTable.fitStatus, "pass"),
      ),
    );
  if (!row) throw libraryNotFound();
  return row;
}

/** A club reports a listed template to Ovation; once per club, the latest reason wins. */
export async function reportTemplate(
  tenantId: number,
  adminId: number | null,
  id: number,
  reason: string,
): Promise<void> {
  const template = await visibleTemplate(id);
  if (template.authorTenantId === tenantId) {
    throw new TemplateLibraryError(400, {
      error: "This is your club's template: unlist it instead.",
    });
  }
  const text = reason.trim().slice(0, MAX_REPORT_REASON);
  if (!text) throw new TemplateLibraryError(400, { error: "Say what's wrong with it." });
  await db
    .insert(libraryTemplateReportsTable)
    .values({ templateId: id, tenantId, adminId, reason: text })
    .onConflictDoUpdate({
      target: [libraryTemplateReportsTable.templateId, libraryTemplateReportsTable.tenantId],
      set: { reason: text, adminId, createdAt: new Date(), resolvedAt: null },
    });
}

/** Add a listed template to the club's favourites (already there is fine). */
export async function favouriteTemplate(tenantId: number, id: number): Promise<void> {
  await visibleTemplate(id);
  await db
    .insert(libraryTemplateFavouritesTable)
    .values({ tenantId, templateId: id })
    .onConflictDoNothing();
}

/** Take a template off the club's favourites (not there is fine, listed or not). */
export async function unfavouriteTemplate(tenantId: number, id: number): Promise<void> {
  await db
    .delete(libraryTemplateFavouritesTable)
    .where(
      and(
        eq(libraryTemplateFavouritesTable.tenantId, tenantId),
        eq(libraryTemplateFavouritesTable.templateId, id),
      ),
    );
}

/** Which of these templates the club has favourited. */
export async function favouriteIds(tenantId: number, ids: readonly number[]): Promise<Set<number>> {
  if (ids.length === 0) return new Set();
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

async function templateExists(id: number): Promise<void> {
  const [row] = await db
    .select({ id: libraryTemplatesTable.id })
    .from(libraryTemplatesTable)
    .where(eq(libraryTemplatesTable.id, id));
  if (!row) throw libraryNotFound();
}

/** A template's reports for the console, open first, with the club that sent each. */
export async function listTemplateReports(id: number) {
  await templateExists(id);
  const rows = await db
    .select({
      id: libraryTemplateReportsTable.id,
      clubName: tenantsTable.name,
      reason: libraryTemplateReportsTable.reason,
      createdAt: libraryTemplateReportsTable.createdAt,
      resolvedAt: libraryTemplateReportsTable.resolvedAt,
    })
    .from(libraryTemplateReportsTable)
    .innerJoin(tenantsTable, eq(tenantsTable.id, libraryTemplateReportsTable.tenantId))
    .where(eq(libraryTemplateReportsTable.templateId, id))
    .orderBy(
      sql`${libraryTemplateReportsTable.resolvedAt} is not null`,
      desc(libraryTemplateReportsTable.createdAt),
    );
  return rows.map((r) => ({
    id: r.id,
    clubName: r.clubName,
    reason: r.reason,
    createdAt: r.createdAt.toISOString(),
    resolvedAt: r.resolvedAt?.toISOString() ?? null,
  }));
}

/** Mark a template's open reports dealt with. */
export const resolveTemplateReports = (id: number) =>
  db
    .update(libraryTemplateReportsTable)
    .set({ resolvedAt: new Date() })
    .where(
      and(
        eq(libraryTemplateReportsTable.templateId, id),
        isNull(libraryTemplateReportsTable.resolvedAt),
      ),
    );

/** The reports were looked at and the template stays. */
export async function dismissTemplateReports(id: number): Promise<void> {
  await templateExists(id);
  await resolveTemplateReports(id);
}
