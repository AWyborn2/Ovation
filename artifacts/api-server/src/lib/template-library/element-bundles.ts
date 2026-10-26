/**
 * Loading the element library's bundle files into `library_elements` at
 * server start (editable-elements plan, D2), after the looks are synced.
 *
 * Each element is upserted by slug (origin `bundle`, credited to its look).
 * A changed element (its hash differs) is rewritten in place: inserting an
 * element copies its layers (E2), so no card depends on a row's document.
 * Ovation's own unlisting (console, D5) survives a sync. Bundle elements no
 * longer in the files are deleted, with any reports of them.
 */
import { createHash } from "node:crypto";
import { and, eq, inArray, isNotNull, notInArray, sql } from "drizzle-orm";
import { db, libraryElementsTable, templateLooksTable } from "@workspace/db";
import { isElementCategory } from "@workspace/scorecard/kind-templates";
import { ELEMENT_BUNDLES, type ElementBundle } from "@workspace/template-bundles";
import { elementSaveErrors, normaliseTags } from "./elements";

export type ElementSyncSummary = {
  elements: number;
  /** Inserted or rewritten by this sync. */
  changed: number;
  removed: number;
  skipped: Array<{ slug: string; reason: string }>;
};

/** One element's hash: what tells the sync it changed. */
const elementHash = (element: unknown): string =>
  createHash("sha256").update(JSON.stringify(element)).digest("hex");

export async function syncElementBundles(
  bundles: readonly ElementBundle[] = ELEMENT_BUNDLES,
): Promise<ElementSyncSummary> {
  const summary: ElementSyncSummary = { elements: 0, changed: 0, removed: 0, skipped: [] };
  const looks = await db
    .select({ id: templateLooksTable.id, slug: templateLooksTable.slug })
    .from(templateLooksTable)
    .where(
      inArray(
        templateLooksTable.slug,
        bundles.map((b) => b.look),
      ),
    );
  const lookIds = new Map(looks.map((l) => [l.slug, l.id]));
  const seen: string[] = [];
  for (const bundle of bundles) {
    const lookId = lookIds.get(bundle.look) ?? null;
    for (const element of bundle.file.elements) {
      const { slug } = element;
      seen.push(slug);
      const problem = !isElementCategory(element.category)
        ? `"${element.category}" isn't an element category`
        : !element.name?.trim()
          ? "the element needs a name"
          : elementSaveErrors(element.document).slice(0, 3).join(" ") || null;
      if (problem) {
        summary.skipped.push({ slug, reason: problem });
        continue;
      }
      const hash = elementHash(element);
      const values = {
        name: element.name.trim(),
        category: element.category as never,
        tags: normaliseTags(element.tags),
        lookId,
        document: element.document,
        signature: element.signature,
        bundleHash: hash,
      };
      const rows = await db
        .insert(libraryElementsTable)
        .values({ slug, origin: "bundle", listed: true, ...values })
        .onConflictDoUpdate({
          target: libraryElementsTable.slug,
          set: { ...values, updatedAt: new Date() },
          // Only bundle rows, and only when the element changed.
          setWhere: and(
            eq(libraryElementsTable.origin, "bundle"),
            sql`${libraryElementsTable.bundleHash} is distinct from ${hash}`,
          ),
        })
        .returning({ id: libraryElementsTable.id });
      summary.elements += 1;
      summary.changed += rows.length;
    }
  }
  const removed = await db
    .delete(libraryElementsTable)
    .where(
      and(
        eq(libraryElementsTable.origin, "bundle"),
        isNotNull(libraryElementsTable.slug),
        seen.length > 0 ? notInArray(libraryElementsTable.slug, seen) : sql`true`,
      ),
    )
    .returning({ id: libraryElementsTable.id });
  summary.removed = removed.length;
  return summary;
}
