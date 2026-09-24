import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  socialDraftsTable,
  socialDraftRevisionsTable,
  type SocialDraftRow,
  type SocialDraftRevisionRow,
} from "@workspace/db";

/** Revisions kept per draft; the oldest are dropped beyond this (KTD2). */
export const MAX_DRAFT_REVISIONS = 20;

export type RevisionReason = "refresh" | "edit" | "revert";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | Tx;

/**
 * Snapshot a draft's current content into its revision history, then trim the
 * history to the newest MAX_DRAFT_REVISIONS. Call before changing the content.
 */
export async function recordDraftRevision(
  draft: SocialDraftRow,
  reason: RevisionReason,
  tx: Executor = db,
): Promise<void> {
  await tx.insert(socialDraftRevisionsTable).values({
    tenantId: draft.tenantId,
    draftId: draft.id,
    cardInput: draft.cardInput,
    caption: draft.caption,
    photoUrl: draft.photoUrl,
    photoSource: draft.photoSource,
    adjustments: draft.adjustments,
    reason,
  });
  const kept = await tx
    .select({ id: socialDraftRevisionsTable.id })
    .from(socialDraftRevisionsTable)
    .where(eq(socialDraftRevisionsTable.draftId, draft.id))
    .orderBy(sql`${socialDraftRevisionsTable.createdAt} desc, ${socialDraftRevisionsTable.id} desc`)
    .limit(MAX_DRAFT_REVISIONS);
  const keepIds = kept.map((r) => r.id);
  if (keepIds.length === MAX_DRAFT_REVISIONS) {
    await tx.delete(socialDraftRevisionsTable).where(
      and(
        eq(socialDraftRevisionsTable.draftId, draft.id),
        sql`${socialDraftRevisionsTable.id} NOT IN (${sql.join(
          keepIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      ),
    );
  }
}

export async function listDraftRevisions(
  tenantId: number,
  draftId: number,
): Promise<SocialDraftRevisionRow[]> {
  return db
    .select()
    .from(socialDraftRevisionsTable)
    .where(
      and(
        eq(socialDraftRevisionsTable.tenantId, tenantId),
        eq(socialDraftRevisionsTable.draftId, draftId),
      ),
    )
    .orderBy(
      sql`${socialDraftRevisionsTable.createdAt} desc, ${socialDraftRevisionsTable.id} desc`,
    );
}

/**
 * Restore a revision's content onto its draft. The draft's current content is
 * recorded first (reason "revert"), so the revert itself can be undone.
 * Returns null when the draft or revision doesn't belong to the tenant.
 */
export async function revertDraftToRevision(
  tenantId: number,
  draftId: number,
  revisionId: number,
): Promise<SocialDraftRow | null> {
  return db.transaction(async (tx) => {
    const [draft] = await tx
      .select()
      .from(socialDraftsTable)
      .where(and(eq(socialDraftsTable.id, draftId), eq(socialDraftsTable.tenantId, tenantId)));
    if (!draft) return null;
    const [rev] = await tx
      .select()
      .from(socialDraftRevisionsTable)
      .where(
        and(
          eq(socialDraftRevisionsTable.id, revisionId),
          eq(socialDraftRevisionsTable.draftId, draftId),
          eq(socialDraftRevisionsTable.tenantId, tenantId),
        ),
      );
    if (!rev) return null;
    await recordDraftRevision(draft, "revert", tx);
    const [updated] = await tx
      .update(socialDraftsTable)
      .set({
        cardInput: rev.cardInput,
        caption: rev.caption,
        photoUrl: rev.photoUrl,
        photoSource: rev.photoSource,
        adjustments: rev.adjustments,
        editedAt: new Date(),
        // A manual action: stop any pending auto-promotion (KTD4).
        autoReadyAt: null,
      })
      .where(eq(socialDraftsTable.id, draftId))
      .returning();
    return updated ?? null;
  });
}

/** Test helper: revision ids for a draft, oldest first. */
export async function draftRevisionIds(draftId: number): Promise<number[]> {
  const rows = await db
    .select({ id: socialDraftRevisionsTable.id })
    .from(socialDraftRevisionsTable)
    .where(inArray(socialDraftRevisionsTable.draftId, [draftId]))
    .orderBy(asc(socialDraftRevisionsTable.id));
  return rows.map((r) => r.id);
}
