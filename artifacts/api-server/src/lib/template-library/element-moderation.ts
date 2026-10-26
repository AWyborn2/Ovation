/**
 * Element moderation in the platform console (editable-elements plan, D5;
 * decision E1): every element listed or not, with its author and its open
 * reports; Ovation's unlisting (which resolves the open reports), listing
 * again, and dismissing reports. Platform admins only.
 */
import { and, desc, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import {
  db,
  libraryElementReportsTable,
  libraryElementsTable,
  templateLooksTable,
  tenantsTable,
  type LibraryElementCategory,
  type TemplateOrigin,
} from "@workspace/db";
import { TemplateLibraryError } from "./errors";
import { lookRef, OVATION_AUTHOR, type LibraryLookRef } from "./store";

/** Elements per console page. */
export const CONSOLE_ELEMENT_PAGE_SIZE = 100;

export type ConsoleElementView = {
  id: number;
  slug: string | null;
  name: string;
  category: LibraryElementCategory;
  tags: string[];
  origin: TemplateOrigin;
  authorName: string;
  authorTenantId: number | null;
  look: LibraryLookRef | null;
  listed: boolean;
  unlistedBy: "author" | "ovation" | null;
  unlistReason: string | null;
  unlistedAt: string | null;
  openReports: number;
  document: unknown;
  createdAt: string;
};

const notFound = () => new TemplateLibraryError(404, { error: "No such element." });

/** Open reports per element, as a correlated count. */
const openReports = sql<number>`(
  select count(*)::int from ${libraryElementReportsTable}
  where ${libraryElementReportsTable.elementId} = ${libraryElementsTable.id}
    and ${libraryElementReportsTable.resolvedAt} is null
)`;

function viewQuery() {
  return db
    .select({
      id: libraryElementsTable.id,
      slug: libraryElementsTable.slug,
      name: libraryElementsTable.name,
      category: libraryElementsTable.category,
      tags: libraryElementsTable.tags,
      origin: libraryElementsTable.origin,
      authorTenantId: libraryElementsTable.authorTenantId,
      authorName: tenantsTable.name,
      lookId: templateLooksTable.id,
      lookSlug: templateLooksTable.slug,
      lookName: templateLooksTable.name,
      listed: libraryElementsTable.listed,
      unlistedBy: libraryElementsTable.unlistedBy,
      unlistReason: libraryElementsTable.unlistReason,
      unlistedAt: libraryElementsTable.unlistedAt,
      openReports,
      document: libraryElementsTable.document,
      createdAt: libraryElementsTable.createdAt,
    })
    .from(libraryElementsTable)
    .leftJoin(templateLooksTable, eq(templateLooksTable.id, libraryElementsTable.lookId))
    .leftJoin(tenantsTable, eq(tenantsTable.id, libraryElementsTable.authorTenantId));
}

type ViewRow = Awaited<ReturnType<typeof viewQuery>>[number];

function present(row: ViewRow): ConsoleElementView {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    tags: row.tags,
    origin: row.origin,
    authorName: row.authorName ?? OVATION_AUTHOR,
    authorTenantId: row.authorTenantId,
    look:
      row.lookId !== null && row.lookSlug !== null && row.lookName !== null
        ? lookRef(row.lookId, row.lookSlug, row.lookName)
        : null,
    listed: row.listed,
    unlistedBy: row.unlistedBy ?? null,
    unlistReason: row.unlistReason,
    unlistedAt: row.unlistedAt?.toISOString() ?? null,
    openReports: Number(row.openReports),
    document: row.document,
    createdAt: row.createdAt.toISOString(),
  };
}

/** `%` and `_` match themselves in a search, not any text. */
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export type ConsoleElementQuery = {
  q?: string;
  origin?: TemplateOrigin;
  /** Only elements with an open report. */
  reported?: boolean;
  listed?: boolean;
  /** From 1. */
  page?: number;
};

export async function listConsoleElements(q: ConsoleElementQuery): Promise<{
  elements: ConsoleElementView[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const where: SQL[] = [];
  if (q.origin) where.push(eq(libraryElementsTable.origin, q.origin));
  if (q.listed !== undefined) where.push(eq(libraryElementsTable.listed, q.listed));
  if (q.reported) where.push(sql`${openReports} > 0`);
  for (const word of (q.q ?? "").toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6)) {
    const pattern = `%${likeEscape(word)}%`;
    where.push(
      or(
        ilike(libraryElementsTable.name, pattern),
        sql`exists (select 1 from unnest(${libraryElementsTable.tags}) t where t ilike ${pattern})`,
      )!,
    );
  }
  const page = Math.max(1, Math.floor(q.page ?? 1));
  const filter = where.length > 0 ? and(...where) : undefined;
  const [{ total }] = (await db
    .select({ total: sql<number>`count(*)::int` })
    .from(libraryElementsTable)
    .where(filter)) as [{ total: number }];
  const rows = await viewQuery()
    .where(filter)
    .orderBy(desc(openReports), desc(libraryElementsTable.createdAt), desc(libraryElementsTable.id))
    .limit(CONSOLE_ELEMENT_PAGE_SIZE)
    .offset((page - 1) * CONSOLE_ELEMENT_PAGE_SIZE);
  return {
    elements: rows.map(present),
    total: Number(total),
    page,
    pageSize: CONSOLE_ELEMENT_PAGE_SIZE,
  };
}

export async function getConsoleElement(id: number): Promise<ConsoleElementView> {
  const [row] = await viewQuery().where(eq(libraryElementsTable.id, id)).limit(1);
  if (!row) throw notFound();
  return present(row);
}

export async function listElementReports(id: number) {
  await getConsoleElement(id);
  const rows = await db
    .select({
      id: libraryElementReportsTable.id,
      clubName: tenantsTable.name,
      reason: libraryElementReportsTable.reason,
      createdAt: libraryElementReportsTable.createdAt,
      resolvedAt: libraryElementReportsTable.resolvedAt,
    })
    .from(libraryElementReportsTable)
    .innerJoin(tenantsTable, eq(tenantsTable.id, libraryElementReportsTable.tenantId))
    .where(eq(libraryElementReportsTable.elementId, id))
    .orderBy(
      sql`${libraryElementReportsTable.resolvedAt} is not null`,
      desc(libraryElementReportsTable.createdAt),
    );
  return rows.map((r) => ({
    id: r.id,
    clubName: r.clubName,
    reason: r.reason,
    createdAt: r.createdAt.toISOString(),
    resolvedAt: r.resolvedAt?.toISOString() ?? null,
  }));
}

const resolveOpenReports = (id: number) =>
  db
    .update(libraryElementReportsTable)
    .set({ resolvedAt: new Date() })
    .where(
      and(
        eq(libraryElementReportsTable.elementId, id),
        isNull(libraryElementReportsTable.resolvedAt),
      ),
    );

/** Ovation takes an element out of the library; its open reports are dealt with. */
export async function unlistElementAsOvation(
  id: number,
  reason: string | undefined,
): Promise<ConsoleElementView> {
  const [row] = await db
    .update(libraryElementsTable)
    .set({
      listed: false,
      unlistedBy: "ovation",
      unlistReason: reason?.trim() || null,
      unlistedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(libraryElementsTable.id, id))
    .returning({ id: libraryElementsTable.id });
  if (!row) throw notFound();
  await resolveOpenReports(id);
  return getConsoleElement(id);
}

/** Back in the library, whoever unlisted it. */
export async function relistElement(id: number): Promise<ConsoleElementView> {
  const [row] = await db
    .update(libraryElementsTable)
    .set({
      listed: true,
      unlistedBy: null,
      unlistReason: null,
      unlistedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(libraryElementsTable.id, id))
    .returning({ id: libraryElementsTable.id });
  if (!row) throw notFound();
  return getConsoleElement(id);
}

/** The reports were looked at and the element stays. */
export async function dismissElementReports(id: number): Promise<ConsoleElementView> {
  await getConsoleElement(id);
  await resolveOpenReports(id);
  return getConsoleElement(id);
}
