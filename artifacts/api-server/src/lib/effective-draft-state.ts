import { and, eq, isNotNull, lte } from "drizzle-orm";
import { db, socialDraftsTable, socialSettingsTable } from "@workspace/db";
import { normalizeDraftStatus, type DraftStatus } from "./draft-status";

/**
 * Auto-post deadlines (Social Studio KTD4). An auto-draft stores
 * `autoReadyAt` (its import time plus the club's window). While auto-post is
 * on, a draft still awaiting review at that moment already *reads* as ready —
 * the sweep only makes it permanent. Manual actions clear `autoReadyAt`, so
 * they always stick.
 */
export type AutoPost = { enabled: boolean };

export function effectiveDraftStatus(
  draft: { status: string; autoReadyAt: Date | string | null },
  autoPost: AutoPost,
  now: Date = new Date(),
): DraftStatus {
  const stored = normalizeDraftStatus(draft.status);
  if (
    stored === "awaiting_review" &&
    autoPost.enabled &&
    draft.autoReadyAt != null &&
    new Date(draft.autoReadyAt).getTime() <= now.getTime()
  ) {
    return "ready";
  }
  return stored;
}

export async function loadAutoPost(tenantId: number): Promise<AutoPost> {
  const [row] = await db
    .select({ enabled: socialSettingsTable.autoPostEnabled })
    .from(socialSettingsTable)
    .where(eq(socialSettingsTable.tenantId, tenantId));
  return { enabled: row?.enabled ?? false };
}

/** The deadline for a new auto-draft, from the club's window. */
export async function autoReadyAtFor(tenantId: number, importedAt: Date): Promise<Date> {
  const [row] = await db
    .select({ hours: socialSettingsTable.autoPostWindowHours })
    .from(socialSettingsTable)
    .where(eq(socialSettingsTable.tenantId, tenantId));
  const hours = row?.hours ?? 12;
  return new Date(importedAt.getTime() + hours * 60 * 60 * 1000);
}

/**
 * Store every draft that reads as ready. The WHERE clause re-checks the
 * stored state, so two concurrent sweeps can never promote the same draft
 * twice — the second finds nothing to update. Returns the promoted ids.
 */
export async function persistDueDrafts(
  tenantId: number,
  now: Date = new Date(),
): Promise<number[]> {
  const rows = await db
    .update(socialDraftsTable)
    .set({ status: "ready" })
    .where(
      and(
        eq(socialDraftsTable.tenantId, tenantId),
        eq(socialDraftsTable.status, "awaiting_review"),
        isNotNull(socialDraftsTable.autoReadyAt),
        lte(socialDraftsTable.autoReadyAt, now),
      ),
    )
    .returning({ id: socialDraftsTable.id });
  return rows.map((r) => r.id);
}
