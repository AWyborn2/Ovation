import { and, eq, like, ne, sql } from "drizzle-orm";
import { db, socialDraftsTable, type SocialDraftRow } from "@workspace/db";
import { normalizeDraftStatus } from "./draft-status";
import { recordDraftRevision } from "./draft-revisions";

/**
 * One draft per event (Social Studio automation, KTD3).
 *
 * Every engine identifies the event a card celebrates with a deterministic
 * source key. Re-running an engine for the same data is then idempotent, and a
 * corrected import updates the existing card instead of adding a second one:
 *
 *  - no undismissed draft holds the key → insert
 *  - the draft is not posted and its input changed → refresh, keeping the
 *    previous version as a revision (so A1 can revert)
 *  - the draft is posted and its input changed → mark it stale only; what was
 *    shared is never rewritten
 *  - input unchanged → nothing
 */
export type DraftUpsertResult = {
  action: "inserted" | "refreshed" | "stale" | "unchanged";
  draft: SocialDraftRow;
};

export type DraftUpsert = {
  tenantId: number;
  engine: string;
  family: string;
  sourceKey: string;
  cardInput: Record<string, unknown>;
  appPath: string;
  sourceImportId?: number | null;
  milestoneEventId?: number | null;
  sourceKind?: string | null;
  sourceMatchId?: number | null;
  sourceMatchIsJunior?: boolean;
  /** When the import behind this draft landed; defaults to now. */
  sourceImportedAt?: Date;
  /**
   * Finds a pre-key draft for the same event (drafts created before source keys
   * existed). The match returned gets the key backfilled.
   */
  findLegacy?: () => Promise<SocialDraftRow | null>;
};

/** Key-order-independent JSON equality for card inputs. */
export function sameCardInput(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

export async function findDraftByKey(
  tenantId: number,
  sourceKey: string,
): Promise<SocialDraftRow | null> {
  const [row] = await db
    .select()
    .from(socialDraftsTable)
    .where(
      and(
        eq(socialDraftsTable.tenantId, tenantId),
        eq(socialDraftsTable.sourceKey, sourceKey),
        ne(socialDraftsTable.status, "dismissed"),
      ),
    );
  return row ?? null;
}

export async function upsertDraftByKey(input: DraftUpsert): Promise<DraftUpsertResult> {
  let existing = await findDraftByKey(input.tenantId, input.sourceKey);
  if (!existing && input.findLegacy) {
    const legacy = await input.findLegacy();
    if (legacy) {
      const [keyed] = await db
        .update(socialDraftsTable)
        .set({ sourceKey: input.sourceKey, family: legacy.family ?? input.family })
        .where(eq(socialDraftsTable.id, legacy.id))
        .returning();
      existing = keyed;
    }
  }

  if (!existing) {
    try {
      const [row] = await db
        .insert(socialDraftsTable)
        .values({
          tenantId: input.tenantId,
          engine: input.engine,
          family: input.family,
          sourceKey: input.sourceKey,
          status: "awaiting_review",
          cardInput: input.cardInput,
          appPath: input.appPath,
          sourceImportId: input.sourceImportId ?? null,
          milestoneEventId: input.milestoneEventId ?? null,
          sourceKind: input.sourceKind ?? null,
          sourceMatchId: input.sourceMatchId ?? null,
          sourceMatchIsJunior: input.sourceMatchIsJunior ?? false,
          sourceImportedAt: input.sourceImportedAt ?? new Date(),
        })
        .returning();
      return { action: "inserted", draft: row };
    } catch (err) {
      // A concurrent sweep inserted the same key first: fall through to update.
      if ((err as { code?: string }).code !== "23505") throw err;
      existing = await findDraftByKey(input.tenantId, input.sourceKey);
      if (!existing) throw err;
    }
  }

  if (sameCardInput(existing.cardInput, input.cardInput)) {
    return { action: "unchanged", draft: existing };
  }

  if (normalizeDraftStatus(existing.status) === "posted") {
    const [row] = await db
      .update(socialDraftsTable)
      .set({ staleSince: existing.staleSince ?? new Date() })
      .where(eq(socialDraftsTable.id, existing.id))
      .returning();
    return { action: "stale", draft: row };
  }

  const current = existing;
  const row = await db.transaction(async (tx) => {
    await recordDraftRevision(current, "refresh", tx);
    const [updated] = await tx
      .update(socialDraftsTable)
      .set({ cardInput: input.cardInput, appPath: input.appPath })
      .where(eq(socialDraftsTable.id, current.id))
      .returning();
    return updated;
  });
  return { action: "refreshed", draft: row };
}

/**
 * The event behind a key no longer holds (e.g. a century corrected to 98):
 * dismiss the unposted draft, or mark a posted one stale.
 */
export async function withdrawDraft(draft: SocialDraftRow): Promise<"dismissed" | "stale"> {
  if (normalizeDraftStatus(draft.status) === "posted") {
    await db
      .update(socialDraftsTable)
      .set({ staleSince: draft.staleSince ?? new Date() })
      .where(eq(socialDraftsTable.id, draft.id));
    return "stale";
  }
  await db
    .update(socialDraftsTable)
    .set({ status: "dismissed", reviewedAt: new Date() })
    .where(eq(socialDraftsTable.id, draft.id));
  return "dismissed";
}

/** Undismissed drafts whose key starts with `prefix`. */
export async function draftsWithKeyPrefix(
  tenantId: number,
  prefix: string,
): Promise<SocialDraftRow[]> {
  return db
    .select()
    .from(socialDraftsTable)
    .where(
      and(
        eq(socialDraftsTable.tenantId, tenantId),
        like(socialDraftsTable.sourceKey, `${prefix.replace(/[%_\\]/g, "\\$&")}%`),
        ne(socialDraftsTable.status, "dismissed"),
        sql`${socialDraftsTable.sourceKey} IS NOT NULL`,
      ),
    );
}

/** Stable key builders, one per engine. */
export const draftKeys = {
  matchSummary: (matchId: number, junior: boolean) =>
    `matchSummary:${junior ? "junior" : "senior"}:${matchId}`,
  centralMatchSummary: (centralMatchId: number) => `matchSummary:central:${centralMatchId}`,
  careerMilestone: (playerId: number, boardKey: string, tierIndex: number) =>
    `milestone:${playerId}:${boardKey}:${tierIndex}`,
  matchFeat: (
    boardKey: "century" | "fiveFor",
    playerId: number,
    grade: string,
    season: number,
    round: number | null,
  ) => `feat:${boardKey}:${grade}:${season}:${round ?? "none"}:${playerId}`,
  matchFeatPrefix: (
    boardKey: "century" | "fiveFor",
    grade: string,
    season: number,
    round: number | null,
  ) => `feat:${boardKey}:${grade}:${season}:${round ?? "none"}:`,
  debut: (playerId: number, grade: string) => `debut:${grade}:${playerId}`,
  roundUp: (season: number, grade: string, round: number | null, category: string) =>
    `roundup:${season}:${grade}:${round ?? "none"}:${category}`,
  recap: (season: number, grade: string, category: string) =>
    `recap:${season}:${grade}:${category}`,
};
