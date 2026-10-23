/**
 * The element library (editable-elements plan, Stream D1).
 *
 * Library elements are shared: every listed element is visible to every club,
 * and a club's save is public at once (decision E1). Reads touch only
 * `library_elements` and the looks and tenant names it credits. A club also
 * sees its own unlisted elements, so it can find what it saved. Inserting an
 * element copies its layers into the card (E2), so the server never tracks
 * where an element was used.
 */
import { and, asc, eq, gt, ilike, or, sql, type SQL } from "drizzle-orm";
import {
  db,
  libraryElementReportsTable,
  libraryElementsTable,
  templateLooksTable,
  tenantsTable,
  type LibraryElementCategory,
  type TemplateOrigin,
} from "@workspace/db";
import { elementDocumentErrors } from "@workspace/scorecard/kind-templates";
import { libraryAssetPolicyErrors } from "./assets";
import { TemplateLibraryError } from "./errors";
import { lookRef, OVATION_AUTHOR, type LibraryLookRef } from "./store";

/** Elements per page: the panel shows small tiles, so twice a template page. */
export const ELEMENT_PAGE_SIZE = 48;

export type LibraryElementView = {
  id: number;
  slug: string | null;
  name: string;
  category: LibraryElementCategory;
  tags: string[];
  origin: TemplateOrigin;
  authorName: string;
  mine: boolean;
  look: LibraryLookRef | null;
  listed: boolean;
  document: unknown;
  thumbnailUrl: string | null;
  createdAt: string;
};

const notFound = () => new TemplateLibraryError(404, { error: "Not in the library." });

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
      document: libraryElementsTable.document,
      thumbnailUrl: libraryElementsTable.thumbnailUrl,
      createdAt: libraryElementsTable.createdAt,
    })
    .from(libraryElementsTable)
    .leftJoin(templateLooksTable, eq(templateLooksTable.id, libraryElementsTable.lookId))
    .leftJoin(tenantsTable, eq(tenantsTable.id, libraryElementsTable.authorTenantId));
}

type ViewRow = Awaited<ReturnType<typeof viewQuery>>[number];

function present(row: ViewRow, tenantId: number): LibraryElementView {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    tags: row.tags,
    origin: row.origin,
    authorName: row.authorName ?? OVATION_AUTHOR,
    mine: row.authorTenantId === tenantId,
    look:
      row.lookId !== null && row.lookSlug !== null && row.lookName !== null
        ? lookRef(row.lookId, row.lookSlug, row.lookName)
        : null,
    listed: row.listed,
    document: row.document,
    thumbnailUrl: row.thumbnailUrl,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Listed, or saved by this club: what a club can see and insert. */
const visibleTo = (tenantId: number): SQL =>
  or(eq(libraryElementsTable.listed, true), eq(libraryElementsTable.authorTenantId, tenantId))!;

/** `%` and `_` match themselves in a search, not any text. */
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export type ElementListQuery = {
  /** Words that must each appear in the name or a tag. */
  q?: string;
  category?: LibraryElementCategory;
  /** A look's slug. */
  look?: string;
  /** Only this club's own elements, listed or not. */
  mine?: boolean;
  /** The last element id of the previous page. */
  cursor?: number;
};

export async function listLibraryElements(
  tenantId: number,
  q: ElementListQuery,
): Promise<{ elements: LibraryElementView[]; nextCursor: number | null }> {
  const where: SQL[] = [
    q.mine ? eq(libraryElementsTable.authorTenantId, tenantId) : visibleTo(tenantId),
  ];
  if (q.category) where.push(eq(libraryElementsTable.category, q.category));
  if (q.look) where.push(eq(templateLooksTable.slug, q.look));
  for (const word of (q.q ?? "").toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6)) {
    const pattern = `%${likeEscape(word)}%`;
    where.push(
      or(
        ilike(libraryElementsTable.name, pattern),
        sql`exists (select 1 from unnest(${libraryElementsTable.tags}) t where t ilike ${pattern})`,
      )!,
    );
  }
  if (q.cursor !== undefined) where.push(gt(libraryElementsTable.id, q.cursor));
  const rows = await viewQuery()
    .where(and(...where))
    .orderBy(asc(libraryElementsTable.id))
    .limit(ELEMENT_PAGE_SIZE + 1);
  const page = rows.slice(0, ELEMENT_PAGE_SIZE).map((r) => present(r, tenantId));
  return {
    elements: page,
    nextCursor: rows.length > ELEMENT_PAGE_SIZE ? (page[page.length - 1]?.id ?? null) : null,
  };
}

/** One element the club can see, or a 404. */
export async function getLibraryElement(tenantId: number, id: number): Promise<LibraryElementView> {
  const [row] = await viewQuery()
    .where(and(eq(libraryElementsTable.id, id), visibleTo(tenantId)))
    .limit(1);
  if (!row) throw notFound();
  return present(row, tenantId);
}

export type SaveElementInput = {
  name: string;
  category: LibraryElementCategory;
  tags?: string[];
  document: unknown;
};

/** Tags as the panel searches them: trimmed, lower case, once each. */
export const normaliseTags = (tags: string[] = []): string[] => [
  ...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean)),
];

/**
 * Every reason a document can't be published as an element: the v2 layer
 * rules, and the library's asset policy (tokens, slots and library images
 * only, so no club's upload, photo or sponsor art is shared).
 */
export function elementSaveErrors(document: unknown): string[] {
  return [...elementDocumentErrors(document), ...libraryAssetPolicyErrors(document)];
}

/** A club's save: public at once, credited to the club (E1). */
export async function saveClubElement(
  tenantId: number,
  adminId: number | null,
  input: SaveElementInput,
): Promise<LibraryElementView> {
  const errors = elementSaveErrors(input.document);
  if (errors.length > 0) {
    throw new TemplateLibraryError(400, { error: "This element can't be saved.", errors });
  }
  const name = input.name.trim();
  if (!name) throw new TemplateLibraryError(400, { error: "Give the element a name." });
  const [row] = await db
    .insert(libraryElementsTable)
    .values({
      name,
      category: input.category,
      tags: normaliseTags(input.tags),
      origin: "club",
      authorTenantId: tenantId,
      createdByAdminId: adminId,
      document: input.document,
      listed: true,
    })
    .returning({ id: libraryElementsTable.id });
  return getLibraryElement(tenantId, row!.id);
}

/** The author club takes its element out of the library. */
export async function unlistOwnElement(tenantId: number, id: number): Promise<LibraryElementView> {
  const [row] = await db
    .update(libraryElementsTable)
    .set({ listed: false, unlistedAt: new Date(), unlistedBy: "author", updatedAt: new Date() })
    .where(and(eq(libraryElementsTable.id, id), eq(libraryElementsTable.authorTenantId, tenantId)))
    .returning({ id: libraryElementsTable.id });
  if (!row) throw new TemplateLibraryError(404, { error: "Not an element your club saved." });
  return getLibraryElement(tenantId, id);
}

/** A club reports another club's (or Ovation's) element; again replaces the reason. */
export async function reportElement(
  tenantId: number,
  adminId: number | null,
  id: number,
  reason: string,
): Promise<void> {
  const element = await getLibraryElement(tenantId, id);
  if (element.mine) {
    throw new TemplateLibraryError(400, {
      error: "This is your club's element: unlist it instead.",
    });
  }
  const text = reason.trim();
  if (!text) throw new TemplateLibraryError(400, { error: "Say what's wrong with it." });
  await db
    .insert(libraryElementReportsTable)
    .values({ elementId: id, tenantId, adminId, reason: text })
    .onConflictDoUpdate({
      target: [libraryElementReportsTable.elementId, libraryElementReportsTable.tenantId],
      set: { reason: text, adminId, createdAt: new Date(), resolvedAt: null },
    });
}
