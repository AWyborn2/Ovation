import { and, eq, isNotNull, isNull, lte, sql, type SQL } from "drizzle-orm";
import { db, socialDraftsTable, socialSettingsTable } from "@workspace/db";
// From the schema subpath so suites that vi.mock("@workspace/db") keep loading this module.
import { JUNIOR_SYNC_ID_START } from "@workspace/db/schema";
import { layoutBlocksAutomation } from "@workspace/scorecard/kind-templates";
import { normalizeDraftStatus, type DraftStatus } from "./draft-status";
import { isSyncedJuniorDraft } from "./junior-publishing";

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
  /** Posting calendar: an expired card never auto-promotes. */
  expiredAt?: Date | string | null;
};

/**
 * SQL for "automation may touch this draft": a pack draft always, a templated
 * draft only once its layout check has run and found nothing (KTD10). Mirrors
 * `layoutBlocksAutomation`; every automated promotion and auto-post query uses
 * it so a card that needs a look is never posted unseen.
 */
export const layoutClear: SQL = sql`(${socialDraftsTable.templateVersion} is null or (${socialDraftsTable.layoutCheckPending} = false and not coalesce((select bool_or(jsonb_typeof(w.value) = 'array' and jsonb_array_length(w.value) > 0) from jsonb_each(coalesce(${socialDraftsTable.layoutWarnings}, '{}'::jsonb)) w), false)))`;

/**
 * SQL for "this is one of the junior sync's own drafts": a junior team-list card
 * (`juniorteamlist:<id>`) or the result card of a junior match in the sync id band
 * (`matchSummary:junior:<id>`, `id >= JUNIOR_SYNC_ID_START`). Mirrors
 * `isSyncedJuniorDraft`. Never null.
 */
export const syncedJuniorDraft: SQL = sql`coalesce((${socialDraftsTable.sourceKey} ~ '^juniorteamlist:[0-9]+$' or (${socialDraftsTable.sourceKey} ~ '^matchSummary:junior:[0-9]{1,18}$' and substr(${socialDraftsTable.sourceKey}, 21)::bigint >= ${JUNIOR_SYNC_ID_START})), false)`;

/**
 * SQL for "the junior publishing rule lets automation touch this draft" (junior PlayHQ
 * sync plan KTD14): any draft that is not a synced junior draft (senior drafts,
 * loader-era junior summaries and junior round sets keep their previous behaviour at
 * every club); a synced junior draft only when its team — resolved through its junior
 * team-list fixture (`juniorteamlist:<id>`) or its junior match — is explicitly `auto` in
 * the club's `team_publishing`. A synced junior draft whose team cannot be resolved never
 * qualifies. Mirrors `juniorDraftMayAutoPost`.
 * Correlated on the outer `social_drafts` row, so it is only valid in a statement whose
 * target is `social_drafts` with no alias.
 */
export const juniorAutoPostClear: SQL = sql`(not ${syncedJuniorDraft} or exists (
  select 1
  from junior_match_display_settings s
  join (
    select f.tenant_id, f.age_group, f.team_name
    from junior_fixtures f
    where f.tenant_id = "social_drafts"."tenant_id"
      and f.id = case when "social_drafts"."source_key" ~ '^juniorteamlist:(0|[1-9][0-9]{0,17})$'
                      then substr("social_drafts"."source_key", 16)::bigint end
    union all
    select m.tenant_id, m.age_group, m.team_name
    from junior_matches m
    where "social_drafts"."source_kind" = 'matchSummary'
      and "social_drafts"."source_match_is_junior" = true
      and "social_drafts"."source_match_id" = m.id
  ) t on t.tenant_id = s.tenant_id
  where s.tenant_id = "social_drafts"."tenant_id"
    and t.age_group is not null
    and t.team_name is not null
    and s.team_publishing -> t.age_group ->> t.team_name = 'auto'
))`;

/** Whether automation may auto-post this draft under the junior publishing rule. */
export async function draftMayAutoPost(tenantId: number, draftId: number): Promise<boolean> {
  const rows = await db
    .select({ id: socialDraftsTable.id })
    .from(socialDraftsTable)
    .where(
      and(
        eq(socialDraftsTable.tenantId, tenantId),
        eq(socialDraftsTable.id, draftId),
        juniorAutoPostClear,
      ),
    );
  return rows.length > 0;
}

/**
 * The status a draft reads as. A synced junior draft never reads as ready ahead of the
 * sweep: whether it may be promoted depends on its team's publishing mode, which only
 * `persistDueDrafts` (via `juniorAutoPostClear`) resolves, so the read model waits for
 * the stored status rather than show a card as ready that promotion will refuse.
 */
export function effectiveDraftStatus(
  draft: {
    status: string;
    autoReadyAt: Date | string | null;
    sourceKey: string | null;
  } & LayoutFields,
  autoPost: AutoPost,
  now: Date = new Date(),
): DraftStatus {
  const stored = normalizeDraftStatus(draft.status);
  if (
    stored === "awaiting_review" &&
    !isSyncedJuniorDraft(draft) &&
    autoPost.enabled &&
    draft.expiredAt == null &&
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
 * look (or hasn't been checked) stays awaiting review, and so does a junior draft
 * whose team is not set to auto-post. Returns the promoted ids.
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
        // An expired card (posting calendar) never comes back by itself.
        isNull(socialDraftsTable.expiredAt),
        layoutClear,
        // A junior draft is promoted only for a team set to auto-post, even if a stray
        // auto-ready time slipped through (KTD14).
        juniorAutoPostClear,
      ),
    )
    .returning({ id: socialDraftsTable.id });
  return rows.map((r) => r.id);
}
