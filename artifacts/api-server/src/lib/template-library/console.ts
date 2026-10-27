/**
 * The platform console's library (ADR-011 §12 "Platform admin", L7-A,
 * T7.1–T7.2).
 *
 * Ovation's designers see every library template, listed or not, and make
 * console-origin ones: new, duplicated from any template (a bundle template's
 * "Edit" is a duplicate, so boot sync never overwrites their work), or saved
 * as a new version. Every version is validated like a bundle (the format's
 * rules and the library asset policy) and sent to the fit job. A template is
 * listed only when its current version passed a real fit check, which draws
 * every page, size and preset; one recorded while no fit job ran doesn't count.
 */
import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";
import {
  db,
  libraryTemplatesTable,
  libraryTemplateVersionsTable,
  templateLooksTable,
  tenantsTable,
  type TemplateOrigin,
} from "@workspace/db";
import { kindFields, templateDocumentErrors } from "@workspace/scorecard/kind-templates";
import { TEMPLATE_BUNDLES } from "@workspace/template-bundles";
import { libraryAssetPolicyErrors } from "./assets";
import { documentCoverage } from "./coverage";
import { TemplateLibraryError, libraryNotFound } from "./errors";
import { initialFit, requestFit } from "./fit";
import { lookRef, OVATION_AUTHOR, type LibraryTemplateView } from "./store";
import { openTemplateReports, resolveTemplateReports } from "./template-moderation";

export const MAX_LIBRARY_NAME = 80;
export const MAX_UNLIST_REASON = 300;
/** The most templates one console list returns. */
export const CONSOLE_LIST_LIMIT = 500;

export type ConsoleTemplateView = LibraryTemplateView & {
  /** Bundle templates change only with a deploy; the console duplicates them. */
  readOnly: boolean;
  unlistedBy: "author" | "ovation" | null;
  unlistReason: string | null;
  updatedAt: string;
  /** Clubs' reports not yet resolved (release 2). */
  openReports: number;
};

const columns = {
  id: libraryTemplatesTable.id,
  slug: libraryTemplatesTable.slug,
  kind: libraryTemplatesTable.kind,
  name: libraryTemplatesTable.name,
  origin: libraryTemplatesTable.origin,
  listed: libraryTemplatesTable.listed,
  unlistedBy: libraryTemplatesTable.unlistedBy,
  unlistReason: libraryTemplatesTable.unlistReason,
  updatedAt: libraryTemplatesTable.updatedAt,
  version: libraryTemplatesTable.currentVersion,
  lookId: templateLooksTable.id,
  lookSlug: templateLooksTable.slug,
  lookName: templateLooksTable.name,
  authorName: tenantsTable.name,
  coverage: libraryTemplateVersionsTable.coverage,
  fitStatus: libraryTemplateVersionsTable.fitStatus,
  fitReport: libraryTemplateVersionsTable.fitReport,
  document: libraryTemplateVersionsTable.document,
  openReports: openTemplateReports,
};

function consoleQuery() {
  return db
    .select(columns)
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

type Row = Awaited<ReturnType<typeof consoleQuery>>[number];

function present(row: Row): ConsoleTemplateView {
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
    readOnly: row.origin === "bundle",
    unlistedBy: row.unlistedBy,
    unlistReason: row.unlistReason,
    updatedAt: row.updatedAt.toISOString(),
    openReports: Number(row.openReports),
  };
}

export type ConsoleListQuery = {
  kind?: string;
  origin?: TemplateOrigin;
  listed?: boolean;
  /** Only templates with an open report, most-reported first (release 2). */
  reported?: boolean;
};

/** Every library template (listed or not), by kind then id; reported ones by report count. */
export async function listConsoleTemplates(q: ConsoleListQuery): Promise<ConsoleTemplateView[]> {
  const where: SQL[] = [];
  if (q.kind) where.push(eq(libraryTemplatesTable.kind, q.kind));
  if (q.origin) where.push(eq(libraryTemplatesTable.origin, q.origin));
  if (q.listed !== undefined) where.push(eq(libraryTemplatesTable.listed, q.listed));
  if (q.reported) where.push(sql`${openTemplateReports} > 0`);
  const rows = await consoleQuery()
    .where(where.length ? and(...where) : undefined)
    .orderBy(
      ...(q.reported ? [desc(openTemplateReports)] : []),
      asc(libraryTemplatesTable.kind),
      asc(libraryTemplatesTable.id),
    )
    .limit(CONSOLE_LIST_LIMIT);
  return rows.map(present);
}

export async function getConsoleTemplate(id: number): Promise<ConsoleTemplateView> {
  const [row] = await consoleQuery().where(eq(libraryTemplatesTable.id, id));
  if (!row) throw libraryNotFound();
  return present(row);
}

const bad = (error: string, problems?: string[]) =>
  new TemplateLibraryError(400, problems ? { error, problems } : { error });

function checkName(name: unknown): string {
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed || trimmed.length > MAX_LIBRARY_NAME) {
    throw bad(`A template name needs 1 to ${MAX_LIBRARY_NAME} characters.`);
  }
  return trimmed;
}

/** A library version's document: the format's rules, the asset policy, and something on it. */
function checkDocument(document: unknown, kind: string): void {
  const problems = [
    ...templateDocumentErrors(document, kind),
    ...libraryAssetPolicyErrors(document),
  ];
  if (problems.length > 0) throw bad(problems[0]!, problems.slice(0, 20));
  if (documentCoverage(document, kind).pages.length === 0) {
    throw bad("Add at least one element before saving.");
  }
}

async function checkLook(lookId: number | null | undefined): Promise<number | null> {
  if (lookId === undefined || lookId === null) return null;
  const [look] = await db
    .select({ id: templateLooksTable.id })
    .from(templateLooksTable)
    .where(eq(templateLooksTable.id, lookId));
  if (!look) throw bad("That look doesn't exist.");
  return look.id;
}

/** Writes version `version` of `templateId` and starts its fit check. */
async function insertVersion(
  tx: Pick<typeof db, "insert">,
  templateId: number,
  version: number,
  kind: string,
  document: unknown,
  adminId: number | null,
): Promise<void> {
  await tx.insert(libraryTemplateVersionsTable).values({
    templateId,
    version,
    document,
    coverage: documentCoverage(document, kind),
    createdByAdminId: adminId,
    ...initialFit(),
  });
}

/** A new, unlisted console template at version 1. */
export async function createConsoleTemplate(
  body: { kind: string; name: string; lookId?: number | null; document: unknown },
  adminId: number | null,
): Promise<ConsoleTemplateView> {
  if (!kindFields(body.kind)) throw bad(`"${body.kind}" isn't a card kind templates support.`);
  const name = checkName(body.name);
  checkDocument(body.document, body.kind);
  const lookId = await checkLook(body.lookId);
  const id = await db.transaction(async (tx) => {
    const [t] = await tx
      .insert(libraryTemplatesTable)
      .values({ kind: body.kind, name, lookId, origin: "console", currentVersion: 1 })
      .returning({ id: libraryTemplatesTable.id });
    await insertVersion(tx, t!.id, 1, body.kind, body.document, adminId);
    return t!.id;
  });
  requestFit({ kind: "libraryVersion", templateId: id, version: 1 }, body.document, body.kind);
  return getConsoleTemplate(id);
}

/** A console copy of any template's current version (how a bundle template is edited). */
export async function duplicateLibraryTemplate(
  id: number,
  body: { name?: string },
  adminId: number | null,
): Promise<ConsoleTemplateView> {
  const source = await getConsoleTemplate(id);
  return createConsoleTemplate(
    {
      kind: source.kind,
      name: body.name ?? `${source.name} (copy)`.slice(0, MAX_LIBRARY_NAME),
      lookId: source.look?.id ?? null,
      document: source.document,
    },
    adminId,
  );
}

const versionConflict = (current: ConsoleTemplateView) =>
  new TemplateLibraryError(409, {
    error: "Someone saved this template after you opened it.",
    currentVersion: current.version,
    updatedAt: current.updatedAt,
    updatedByName: null,
  });

/**
 * Save a console template: a new document is a new version (older versions
 * stay, so club copies keep theirs and see an update); a name alone renames.
 * Bundle templates are refused.
 */
export async function saveConsoleTemplate(
  id: number,
  body: { baseVersion: number; document?: unknown; name?: string; lookId?: number | null },
  adminId: number | null,
): Promise<ConsoleTemplateView> {
  const current = await getConsoleTemplate(id);
  if (current.readOnly) {
    throw new TemplateLibraryError(403, {
      error: "Bundle templates change with a deploy. Duplicate it to edit a copy.",
    });
  }
  if (current.version !== body.baseVersion) throw versionConflict(current);
  const name = body.name === undefined ? undefined : checkName(body.name);
  if (body.document !== undefined) checkDocument(body.document, current.kind);
  const lookId = body.lookId === undefined ? undefined : await checkLook(body.lookId);
  const next = body.document === undefined ? current.version : current.version + 1;
  const saved = await db.transaction(async (tx) => {
    const [t] = await tx
      .update(libraryTemplatesTable)
      .set({
        ...(name === undefined ? {} : { name }),
        ...(lookId === undefined ? {} : { lookId }),
        currentVersion: next,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(libraryTemplatesTable.id, id),
          eq(libraryTemplatesTable.currentVersion, current.version),
        ),
      )
      .returning({ id: libraryTemplatesTable.id });
    if (!t) return false;
    if (body.document !== undefined) {
      await insertVersion(tx, id, next, current.kind, body.document, adminId);
    }
    return true;
  });
  if (!saved) throw versionConflict(await getConsoleTemplate(id));
  if (body.document !== undefined) {
    requestFit(
      { kind: "libraryVersion", templateId: id, version: next },
      body.document,
      current.kind,
    );
  }
  return getConsoleTemplate(id);
}

/** Whether a bundle template's own file leaves it unlisted (false when it isn't a known bundle). */
function bundleFileUnlists(slug: string | null): boolean {
  for (const bundle of TEMPLATE_BUNDLES) {
    for (const t of bundle.templates) {
      if (`${bundle.slug}/${t.kind}` === slug) return t.file.listed !== true;
    }
  }
  return false;
}

/**
 * List a template in the library. Its current version must have passed a
 * real fit check (every page, size and preset). A bundle template follows its
 * bundle file, so listing one only undoes an Ovation unlisting.
 */
export async function listTemplate(id: number): Promise<ConsoleTemplateView> {
  const t = await getConsoleTemplate(id);
  if (t.fitStatus === "pending") {
    throw new TemplateLibraryError(409, {
      error: "The layout check is still running. List it once it has passed.",
    });
  }
  const skipped = (t.fitReport as { skipped?: boolean } | null)?.skipped === true;
  if (t.fitStatus !== "pass" || skipped) {
    throw new TemplateLibraryError(409, {
      error: skipped
        ? "This version hasn't had a layout check yet, so it can't be listed."
        : "This version failed the layout check. Fix it and save a new version first.",
    });
  }
  // A club's own unlisting stands: the club lists it again by publishing (ADR-012).
  if (t.origin === "club" && t.unlistedBy === "author") {
    throw new TemplateLibraryError(409, {
      error: "The club that made this template unlisted it. It lists again when they publish it.",
    });
  }
  // Boot sync lists a bundle template from its file; the console can only undo its own unlisting.
  if (t.readOnly && (t.unlistedBy !== "ovation" || bundleFileUnlists(t.slug))) {
    throw new TemplateLibraryError(409, {
      error: t.listed
        ? "This template is already listed."
        : "This bundle template is unlisted in its bundle file. Duplicate it to list a copy.",
    });
  }
  await db
    .update(libraryTemplatesTable)
    .set({
      listed: true,
      listedAt: sql`coalesce(${libraryTemplatesTable.listedAt}, now())`,
      unlistedAt: null,
      unlistedBy: null,
      unlistReason: null,
      updatedAt: new Date(),
    })
    .where(eq(libraryTemplatesTable.id, id));
  return getConsoleTemplate(id);
}

/**
 * Take a template out of the library. Clubs' copies keep their documents and
 * still see updates. An Ovation unlisting of a bundle template survives boot
 * sync, and it deals with the template's open reports (release 2).
 */
export async function unlistTemplate(
  id: number,
  body: { reason?: string | null },
): Promise<ConsoleTemplateView> {
  await getConsoleTemplate(id);
  const reason = body.reason?.trim() || null;
  if (reason && reason.length > MAX_UNLIST_REASON) {
    throw bad(`Keep the reason under ${MAX_UNLIST_REASON} characters.`);
  }
  await db
    .update(libraryTemplatesTable)
    .set({
      listed: false,
      unlistedAt: new Date(),
      unlistedBy: "ovation",
      unlistReason: reason,
      updatedAt: new Date(),
    })
    .where(eq(libraryTemplatesTable.id, id));
  await resolveTemplateReports(id);
  return getConsoleTemplate(id);
}

export type ConsoleLookView = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  origin: TemplateOrigin;
  displayOrder: number;
  templates: number;
};

export async function listConsoleLooks(): Promise<ConsoleLookView[]> {
  return db
    .select({
      id: templateLooksTable.id,
      slug: templateLooksTable.slug,
      name: templateLooksTable.name,
      description: templateLooksTable.description,
      origin: templateLooksTable.origin,
      displayOrder: templateLooksTable.displayOrder,
      templates: sql<number>`count(${libraryTemplatesTable.id})::int`,
    })
    .from(templateLooksTable)
    .leftJoin(libraryTemplatesTable, eq(libraryTemplatesTable.lookId, templateLooksTable.id))
    .groupBy(templateLooksTable.id)
    .orderBy(asc(templateLooksTable.displayOrder), asc(templateLooksTable.id));
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** A new console look. Slugs are shared with bundle looks, so one can't take a bundle's. */
export async function createLook(body: {
  slug: string;
  name: string;
  description?: string | null;
}): Promise<ConsoleLookView> {
  const slug = body.slug.trim();
  if (!SLUG.test(slug) || slug.length > 60) {
    throw bad("A look's slug is lowercase letters, numbers and dashes, up to 60 characters.");
  }
  const name = body.name.trim();
  if (!name || name.length > MAX_LIBRARY_NAME) {
    throw bad(`A look name needs 1 to ${MAX_LIBRARY_NAME} characters.`);
  }
  if (TEMPLATE_BUNDLES.some((b) => b.slug === slug)) {
    throw new TemplateLibraryError(409, { error: "A bundle look already uses that slug." });
  }
  const [look] = await db
    .insert(templateLooksTable)
    .values({
      slug,
      name,
      description: body.description?.trim() || null,
      origin: "console",
      displayOrder: 1000,
    })
    .onConflictDoNothing({ target: templateLooksTable.slug })
    .returning({ id: templateLooksTable.id });
  if (!look) throw new TemplateLibraryError(409, { error: "A look already uses that slug." });
  const all = await listConsoleLooks();
  return all.find((l) => l.id === look.id)!;
}
