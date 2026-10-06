import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import { db, socialDraftsTable } from "@workspace/db";
import { renderDraftCaption } from "./draft-enrich";

export type RecaptionResult = { recaptioned: number; unchanged: number; keptEdited: number };

/** Queue states whose caption may still change; posted and dismissed never do. */
const QUEUED = ["awaiting_review", "ready"];

/**
 * Rebuild the caption of every queued auto-draft from the club's current
 * templates and variations. A draft's caption is otherwise written once, at
 * creation (KTD8), and only rewritten when its card data changes, so a
 * template change never reaches the drafts already waiting.
 *
 * - A draft someone has edited keeps its caption, as a data refresh does.
 * - Ad-hoc cards are made by hand and start with no caption, so they are left
 *   alone.
 * - The caption is seeded by the source key, exactly as at creation, so a
 *   draft keeps the variation it would have been drafted with.
 */
export async function recaptionQueuedDrafts(tenantId: number): Promise<RecaptionResult> {
  const result: RecaptionResult = { recaptioned: 0, unchanged: 0, keptEdited: 0 };
  const drafts = await db
    .select()
    .from(socialDraftsTable)
    .where(
      and(
        eq(socialDraftsTable.tenantId, tenantId),
        inArray(socialDraftsTable.status, QUEUED),
        ne(socialDraftsTable.engine, "adhoc"),
      ),
    );

  for (const draft of drafts) {
    if (draft.editedAt != null) {
      result.keptEdited++;
      continue;
    }
    const caption = await renderDraftCaption(
      tenantId,
      draft.engine,
      (draft.cardInput ?? {}) as Record<string, unknown>,
      draft.appPath ?? "",
      draft.sourceKey ?? `draft:${draft.id}`,
    );
    if (caption === draft.caption) {
      result.unchanged++;
      continue;
    }
    // Guarded on editedAt: an edit landing mid-run keeps the admin's words.
    const updated = await db
      .update(socialDraftsTable)
      .set({ caption })
      .where(
        and(
          eq(socialDraftsTable.id, draft.id),
          eq(socialDraftsTable.tenantId, tenantId),
          isNull(socialDraftsTable.editedAt),
        ),
      )
      .returning({ id: socialDraftsTable.id });
    if (updated.length > 0) result.recaptioned++;
    else result.keptEdited++;
  }
  return result;
}
