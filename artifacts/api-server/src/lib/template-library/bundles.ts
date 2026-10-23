/**
 * Loading Ovation's template bundles into the library at server start
 * (ADR-011 §2 "Bundles", T3.4).
 *
 * For each look in `@workspace/template-bundles`: upsert the look and its
 * templates by slug (origin `bundle`), insert any version that isn't there yet
 * (insert-or-ignore, so parallel boots converge), and point the template at
 * the bundle's version. A new version starts its fit check; a bundle template
 * marked `listed` shows in the library once its current version passes (the
 * library reads apply that gate). Versions are immutable: a bundle file edited
 * without raising its version is reported and left alone.
 *
 * Bundle-owned rows are read-only to the console (its "Edit" makes a console
 * duplicate), so this sync never overwrites a designer's work.
 */
import { createHash } from "node:crypto";
import { and, eq, inArray, isNotNull, notInArray, sql } from "drizzle-orm";
import {
  db,
  libraryTemplatesTable,
  libraryTemplateVersionsTable,
  templateLooksTable,
} from "@workspace/db";
import {
  assembleSetDocument,
  kindFields,
  setTemplateKind,
  setTypeOfKind,
  SET_TYPE_LABELS,
  templateDocumentErrors,
  type DataSetType,
} from "@workspace/scorecard/kind-templates";
import {
  TEMPLATE_BUNDLES,
  type BundleTemplate,
  type TemplateBundle,
} from "@workspace/template-bundles";
import { logger } from "../logger";
import { libraryAssetPolicyErrors } from "./assets";
import { documentCoverage } from "./coverage";
import { syncElementBundles } from "./element-bundles";
import { initialFit, requestFit } from "./fit";

export type BundleSyncSummary = {
  looks: number;
  templates: number;
  /** Versions inserted by this sync (new templates or raised versions). */
  versionsAdded: number;
  /** Templates removed from the bundles since the last sync, now unlisted. */
  retired: number;
  skipped: Array<{ slug: string; reason: string }>;
};

/** Why a bundle template can't be synced, or null when it can. */
function bundleTemplateProblem(
  kind: string,
  file: TemplateBundle["templates"][number]["file"],
): string | null {
  if (!kindFields(kind) && !setTypeOfKind(kind))
    return `"${kind}" isn't a card kind templates support`;
  if (!Number.isInteger(file.version) || file.version < 1)
    return "version must be a whole number from 1";
  if (typeof file.name !== "string" || !file.name.trim()) return "the template needs a name";
  const errors = [
    ...templateDocumentErrors(file.document, kind),
    ...libraryAssetPolicyErrors(file.document),
  ];
  return errors.length > 0 ? errors.slice(0, 3).join(" ") : null;
}

/** The data sets every look gets a set template for (part 1). */
export const BUNDLE_SET_TYPES: readonly DataSetType[] = [
  "teamLists",
  "matchDay",
  "results",
  "matchSummary",
];

/**
 * Bump to re-version every assembled set template (a change to how sets are
 * assembled from the same kind bundles).
 */
export const SET_ASSEMBLY_REVISION = 1;

/**
 * A look's set templates (carousel set editor plan, part 1), assembled from
 * its kind bundles. Nothing new is committed: a set is exactly its kinds'
 * pages. Its version is the sum of the versions it is made of plus the
 * assembly revision, so raising any part's version (or the revision) raises
 * the set's; its hash is over the parts' hashes. Every set asks to be listed
 * and shows in the library once it passes its own fit check, as any template
 * does (a part unlisted as a single card, like the starters' Team List, is
 * still a fine set page).
 */
export function bundleSetTemplates(bundle: TemplateBundle): BundleTemplate[] {
  const byKind = new Map(bundle.templates.map((t) => [t.kind, t]));
  const out: BundleTemplate[] = [];
  for (const type of BUNDLE_SET_TYPES) {
    const used = new Set<string>();
    const built = assembleSetDocument(type, (kind) => {
      const t = byKind.get(kind);
      return t?.file.document;
    });
    if (!built) continue;
    for (const source of built.sources) used.add(source.split(".")[0]!);
    const parts = [...used].sort().map((k) => byKind.get(k)!);
    out.push({
      kind: setTemplateKind(type),
      hash: createHash("sha256")
        .update(`set:${SET_ASSEMBLY_REVISION}:` + parts.map((p) => `${p.kind}=${p.hash}`).join(","))
        .digest("hex"),
      file: {
        name: `${bundle.look.name} ${SET_TYPE_LABELS[type].toLowerCase()} set`,
        version: SET_ASSEMBLY_REVISION + parts.reduce((n, p) => n + p.file.version, 0),
        listed: true,
        document: built.document,
      },
    });
  }
  return out;
}

export async function syncBundles(
  bundles: readonly TemplateBundle[] = TEMPLATE_BUNDLES,
): Promise<BundleSyncSummary> {
  const summary: BundleSyncSummary = {
    looks: 0,
    templates: 0,
    versionsAdded: 0,
    retired: 0,
    skipped: [],
  };
  const seen: string[] = [];

  for (const [order, bundle] of bundles.entries()) {
    const [look] = await db
      .insert(templateLooksTable)
      .values({
        slug: bundle.slug,
        name: bundle.look.name,
        description: bundle.look.description ?? null,
        origin: "bundle",
        displayOrder: bundle.look.displayOrder ?? order,
      })
      .onConflictDoUpdate({
        target: templateLooksTable.slug,
        set: {
          name: bundle.look.name,
          description: bundle.look.description ?? null,
          displayOrder: bundle.look.displayOrder ?? order,
          updatedAt: new Date(),
        },
        setWhere: eq(templateLooksTable.origin, "bundle"),
      })
      .returning({ id: templateLooksTable.id });
    if (!look) {
      summary.skipped.push({
        slug: bundle.slug,
        reason: "a look that isn't a bundle look already uses this slug",
      });
      continue;
    }
    summary.looks += 1;

    for (const t of [...bundle.templates, ...bundleSetTemplates(bundle)]) {
      const slug = `${bundle.slug}/${t.kind}`;
      seen.push(slug);
      const problem = bundleTemplateProblem(t.kind, t.file);
      if (problem) {
        summary.skipped.push({ slug, reason: problem });
        continue;
      }
      const [template] = await db
        .insert(libraryTemplatesTable)
        .values({
          slug,
          lookId: look.id,
          kind: t.kind,
          name: t.file.name,
          origin: "bundle",
          currentVersion: t.file.version,
          listed: t.file.listed,
          listedAt: t.file.listed ? new Date() : null,
        })
        .onConflictDoUpdate({
          target: libraryTemplatesTable.slug,
          set: {
            lookId: look.id,
            kind: t.kind,
            name: t.file.name,
            currentVersion: t.file.version,
            // Ovation's own unlisting (console) wins over the bundle's flag.
            listed: sql`case when ${libraryTemplatesTable.unlistedBy} = 'ovation' then false else ${t.file.listed} end`,
            listedAt: sql`case when ${t.file.listed} and ${libraryTemplatesTable.unlistedBy} is distinct from 'ovation' then coalesce(${libraryTemplatesTable.listedAt}, now()) else ${libraryTemplatesTable.listedAt} end`,
            updatedAt: new Date(),
          },
          setWhere: eq(libraryTemplatesTable.origin, "bundle"),
        })
        .returning({ id: libraryTemplatesTable.id });
      if (!template) {
        summary.skipped.push({
          slug,
          reason: "a template that isn't a bundle template already uses this slug",
        });
        continue;
      }
      summary.templates += 1;

      const fit = initialFit();
      const inserted = await db
        .insert(libraryTemplateVersionsTable)
        .values({
          templateId: template.id,
          version: t.file.version,
          document: t.file.document,
          coverage: documentCoverage(t.file.document, t.kind),
          bundleHash: t.hash,
          ...fit,
        })
        .onConflictDoNothing()
        .returning({ version: libraryTemplateVersionsTable.version });
      if (inserted.length > 0) {
        summary.versionsAdded += 1;
        requestFit(
          { kind: "libraryVersion", templateId: template.id, version: t.file.version },
          t.file.document,
          t.kind,
        );
        continue;
      }
      const [existing] = await db
        .select({ bundleHash: libraryTemplateVersionsTable.bundleHash })
        .from(libraryTemplateVersionsTable)
        .where(
          and(
            eq(libraryTemplateVersionsTable.templateId, template.id),
            eq(libraryTemplateVersionsTable.version, t.file.version),
          ),
        );
      if (existing && existing.bundleHash !== t.hash) {
        summary.skipped.push({
          slug,
          reason: `version ${t.file.version} changed without a version bump; the synced version is kept`,
        });
      }
    }
  }

  // Bundle templates no longer in the bundles stop being listed. Their rows
  // and versions stay: club copies may point at them.
  const retired = await db
    .update(libraryTemplatesTable)
    // No `unlistedBy`: that marks a deliberate unlisting, which a bundle that
    // brings the template back would not override.
    .set({ listed: false, unlistedAt: new Date(), unlistReason: "Removed from the bundles." })
    .where(
      and(
        eq(libraryTemplatesTable.origin, "bundle"),
        eq(libraryTemplatesTable.listed, true),
        isNotNull(libraryTemplatesTable.slug),
        seen.length > 0 ? notInArray(libraryTemplatesTable.slug, seen) : sql`true`,
      ),
    )
    .returning({ id: libraryTemplatesTable.id });
  summary.retired = retired.length;
  return summary;
}

/** Boot hook: sync, log the outcome, never throw (a bad bundle mustn't stop the server). */
export async function syncBundlesAtBoot(): Promise<void> {
  try {
    const summary = await syncBundles();
    if (summary.skipped.length > 0) {
      logger.warn({ skipped: summary.skipped }, "template bundles: some templates were not synced");
    }
    logger.info(
      {
        looks: summary.looks,
        templates: summary.templates,
        versionsAdded: summary.versionsAdded,
        retired: summary.retired,
      },
      "template bundles synced",
    );
  } catch (err) {
    logger.error({ err }, "template bundles: sync failed");
  }
  // After the looks, which the elements are credited to.
  try {
    const summary = await syncElementBundles();
    if (summary.skipped.length > 0) {
      logger.warn({ skipped: summary.skipped }, "element bundles: some elements were not synced");
    }
    logger.info(
      { elements: summary.elements, changed: summary.changed, removed: summary.removed },
      "element bundles synced",
    );
  } catch (err) {
    logger.error({ err }, "element bundles: sync failed");
  }
}

/** Ids of the given bundle template slugs (tests and tools). */
export async function bundleTemplateIds(slugs: string[]): Promise<Map<string, number>> {
  if (slugs.length === 0) return new Map();
  const rows = await db
    .select({ id: libraryTemplatesTable.id, slug: libraryTemplatesTable.slug })
    .from(libraryTemplatesTable)
    .where(inArray(libraryTemplatesTable.slug, slugs));
  return new Map(rows.map((r) => [r.slug ?? "", r.id]));
}
