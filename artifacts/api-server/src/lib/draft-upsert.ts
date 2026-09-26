import { and, desc, eq, like, ne, sql } from "drizzle-orm";
import {
  db,
  socialDraftsTable,
  socialDraftRevisionsTable,
  type SocialDraftRow,
} from "@workspace/db";
import { normalizeDraftStatus } from "./draft-status";
import { recordDraftRevision } from "./draft-revisions";
import { enrichDraft, isAutoPhoto } from "./draft-enrich";
import { autoReadyAtFor } from "./effective-draft-state";

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
  /** The player the card celebrates, for the photo pick (R5). */
  playerId?: number | null;
  /** The grade, for a grade photo when no player photo exists (R5). */
  grade?: string | null;
  /**
   * The card's featured player for a "player" card photo rule, when it is not
   * `playerId` (a match result features the club's top performer). Only a
   * rule uses it; the automatic photo order is unchanged.
   */
  featuredPlayerId?: number | null;
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

  const enrichment = () =>
    enrichDraft({
      tenantId: input.tenantId,
      engine: input.engine,
      cardInput: input.cardInput,
      appPath: input.appPath,
      playerId: input.playerId,
      grade: input.grade,
      junior: input.sourceMatchIsJunior === true,
      // A random photo rule is seeded by the event key, so a refresh keeps it.
      seed: input.sourceKey,
      featuredPlayerId: input.featuredPlayerId,
    });

  if (!existing) {
    const e = await enrichment();
    const importedAt = input.sourceImportedAt ?? new Date();
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
          sourceImportedAt: importedAt,
          // The auto-post deadline, fixed at creation from the club's window
          // (KTD4); only read while auto-post is on.
          autoReadyAt: await autoReadyAtFor(input.tenantId, importedAt),
          // Pack and caption resolve at creation (KTD8); the photo is a
          // snapshot so library edits never change the draft (KTD6).
          packId: e.packId,
          caption: e.caption,
          photoUrl: e.photoUrl,
          photoSource: e.photoSource,
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
    // What was shared is never rewritten. The corrected data is kept as a
    // "refresh" revision, so the admin can apply it with a revert (R31) —
    // recorded once per distinct correction, not on every sweep.
    const posted = existing;
    const row = await db.transaction(async (tx) => {
      const [latest] = await tx
        .select({ cardInput: socialDraftRevisionsTable.cardInput })
        .from(socialDraftRevisionsTable)
        .where(eq(socialDraftRevisionsTable.draftId, posted.id))
        .orderBy(desc(socialDraftRevisionsTable.createdAt), desc(socialDraftRevisionsTable.id))
        .limit(1);
      if (!latest || !sameCardInput(latest.cardInput, input.cardInput)) {
        await recordDraftRevision({ ...posted, cardInput: input.cardInput }, "refresh", tx);
      }
      const [updated] = await tx
        .update(socialDraftsTable)
        .set({ staleSince: posted.staleSince ?? new Date() })
        .where(eq(socialDraftsTable.id, posted.id))
        .returning();
      return updated;
    });
    return { action: "stale", draft: row };
  }

  const current = existing;
  // A refresh keeps the draft's pack. It regenerates the caption only if no
  // one has edited the draft, and re-picks the photo only if the current one
  // was picked automatically (KTD6).
  const e = await enrichment();
  const refreshed = {
    cardInput: input.cardInput,
    appPath: input.appPath,
    ...(current.editedAt == null ? { caption: e.caption } : {}),
    ...(isAutoPhoto(current.photoSource)
      ? { photoUrl: e.photoUrl, photoSource: e.photoSource }
      : {}),
  };
  const row = await db.transaction(async (tx) => {
    await recordDraftRevision(current, "refresh", tx);
    const [updated] = await tx
      .update(socialDraftsTable)
      .set(refreshed)
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

/**
 * Who a player card is about, in a source key: the app player id, or — for a
 * central-data player with no crosswalk row — an opaque token for their
 * participant GUID (`centralPlayerKey`), so the card still dedupes.
 */
export type PlayerKeyRef = number | string;

/** Stable key builders, one per engine. */
export const draftKeys = {
  matchSummary: (matchId: number, junior: boolean) =>
    `matchSummary:${junior ? "junior" : "senior"}:${matchId}`,
  centralMatchSummary: (centralMatchId: number) => `matchSummary:central:${centralMatchId}`,
  careerMilestone: (playerId: PlayerKeyRef, boardKey: string, tierIndex: number) =>
    `milestone:${playerId}:${boardKey}:${tierIndex}`,
  matchFeat: (
    boardKey: "century" | "fiveFor",
    playerId: PlayerKeyRef,
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
  debut: (playerId: PlayerKeyRef, grade: string) => `debut:${grade}:${playerId}`,
  roundUp: (season: number, grade: string, round: number | null, category: string) =>
    `roundup:${season}:${grade}:${round ?? "none"}:${category}`,
  recap: (season: number, grade: string, category: string) =>
    `recap:${season}:${grade}:${category}`,
};
