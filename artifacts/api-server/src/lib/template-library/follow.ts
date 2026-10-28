/**
 * Unedited copies follow the library (28 Oct 2026). A club's copy that nobody
 * has changed is still Ovation's design, so when the library template it came
 * from gets a newer version that has passed its fit check, the copy takes it
 * by itself, as "Take update" would. So do the club's queued cards drawn from
 * that copy, unless their design was edited by hand. A copy with the club's
 * own changes (`edited_at`) never changes here.
 */
import { and, eq, inArray, isNull, lt, or } from "drizzle-orm";
import {
  db,
  cardTemplatesTable,
  libraryTemplatesTable,
  libraryTemplateVersionsTable,
} from "@workspace/db";
import { applyTemplateToDrafts, KIND_SOURCE } from "../kind-templates";
import { logger } from "../logger";

export type FollowSummary = { copies: number; drafts: number };

/**
 * Brings the unedited copies of the given library templates (all of them when
 * omitted) up to each template's current version, when that version passed
 * its fit check. Safe to run again: a copy already on the current version is
 * not selected.
 */
export async function followLibraryUpdates(
  templateIds?: readonly number[],
): Promise<FollowSummary> {
  const summary: FollowSummary = { copies: 0, drafts: 0 };
  if (templateIds && templateIds.length === 0) return summary;
  const origins = await db
    .select({
      templateId: libraryTemplatesTable.id,
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
    .where(
      and(
        eq(libraryTemplateVersionsTable.fitStatus, "pass"),
        templateIds ? inArray(libraryTemplatesTable.id, [...templateIds]) : undefined,
      ),
    );
  for (const origin of origins) {
    const behind = await db
      .select()
      .from(cardTemplatesTable)
      .where(
        and(
          eq(cardTemplatesTable.source, KIND_SOURCE),
          eq(cardTemplatesTable.originTemplateId, origin.templateId),
          isNull(cardTemplatesTable.editedAt),
          or(
            isNull(cardTemplatesTable.originVersion),
            lt(cardTemplatesTable.originVersion, origin.currentVersion),
          ),
        ),
      );
    for (const copy of behind) {
      const drafts = await db.transaction(async (tx) => {
        // Same guard as an admin's save: a copy saved or edited since the
        // read keeps what it has.
        const [saved] = await tx
          .update(cardTemplatesTable)
          .set({
            adjustments: structuredClone(origin.document),
            originVersion: origin.currentVersion,
            version: copy.version + 1,
            fitStatus: origin.fitStatus,
            fitReport: origin.fitReport,
            updatedAt: new Date(),
            updatedByAdminId: null,
          })
          .where(
            and(
              eq(cardTemplatesTable.id, copy.id),
              eq(cardTemplatesTable.tenantId, copy.tenantId),
              eq(cardTemplatesTable.version, copy.version),
              isNull(cardTemplatesTable.editedAt),
            ),
          )
          .returning();
        if (!saved) return null;
        const { changed } = await applyTemplateToDrafts(tx, saved, undefined, {
          onlyFromThisCopy: true,
        });
        return changed;
      });
      if (drafts === null) continue;
      summary.copies += 1;
      summary.drafts += drafts;
    }
  }
  return summary;
}

/** As `followLibraryUpdates`, logging the outcome; never throws (a fit result or boot must not fail on it). */
export async function followLibraryUpdatesQuietly(templateIds?: readonly number[]): Promise<void> {
  try {
    const summary = await followLibraryUpdates(templateIds);
    if (summary.copies > 0)
      logger.info({ ...summary, templateIds }, "club copies took a library update");
  } catch (err) {
    logger.error({ err, templateIds }, "club copies could not take a library update");
  }
}
