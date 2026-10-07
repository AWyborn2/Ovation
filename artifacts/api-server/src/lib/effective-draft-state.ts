import { and, eq, isNotNull, lte, sql, type SQL } from "drizzle-orm";
import { db, socialDraftsTable, socialSettingsTable } from "@workspace/db";
import { layoutBlocksAutomation } from "@workspace/scorecard/kind-templates";
import { normalizeDraftStatus, type DraftStatus } from "./draft-status";

/**
 * Auto-post deadlines (Social Studio KTD4). An auto-draft stores
 * `autoReadyAt` (its import time plus the club's window). While auto-post is
 * on, a draft still awaiting review at that moment already *reads* as ready —
 * the sweep only makes it permanent. Manual actions clear `autoReadyAt`, so
 * they always stick.
 */
export type AutoPost = { enabled: boolean };

/** The layout fields a templated draft carries (card kind templates, KTD10). */
type LayoutFields = {
  templateVersion?: number | null;
  layoutCheckPending?: boolean;
  layoutWarnings?: unknown;
};

/**
 * SQL for "automation may touch this draft": a pack draft always, a templated
 * draft only once its layout check has run and found nothing (KTD10). Mirrors
 * `layoutBlocksAutomation`; every automated promotion and auto-post query uses
 * it so a card that needs a look is never posted unseen.
 */
export const layoutClear: SQL = sql`(${socialDraftsTable.templateVersion} is null or (${socialDraftsTable.layoutCheckPending} = false and not coalesce((select bool_or(jsonb_typeof(w.value) = 'array' and jsonb_array_length(w.value) > 0) from jsonb_each(coalesce(${socialDraftsTable.layoutWarnings}, '{}'::jsonb)) w), false)))`;

export function effectiveDraftStatus(
  draft: { status: string; autoReadyAt: Date | string | null } & LayoutFields,
  autoPost: AutoPost,
  now: Date = new Date(),
): DraftStatus {
  const stored = normalizeDraftStatus(draft.status);
  if (
    stored === "awaiting_review" &&
    autoPost.enabled &&
    draft.autoReadyAt != null &&
    new Date(draft.autoReadyAt).getTime() <= now.getTime() &&
    !layoutBlocksAutomation({
      templateVersion: draft.templateVersion ?? null,
      layoutCheckPending: draft.layoutCheckPending ?? false,
      layoutWarnings: (draft.layoutWarnings ?? null) as Partial<Record<string, unknown[]>> | null,
    })
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
 * twice — the second finds nothing to update. A templated draft that needs a
 * look (or hasn't been checked) stays awaiting review. Returns the promoted ids.
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
        layoutClear,
      ),
    )
    .returning({ id: socialDraftsTable.id });
  return rows.map((r) => r.id);
}
