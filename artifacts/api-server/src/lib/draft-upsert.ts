import { and, desc, eq, like, ne, sql } from "drizzle-orm";
import {
  db,
  playerIdMapTable,
  playerPrivacyOverridesTable,
  shirtNumbersTable,
  socialDraftsTable,
  socialDraftRevisionsTable,
  type SocialDraftRow,
} from "@workspace/db";
import { seasonStartYearFor } from "@workspace/db/seasons";
import { getShirtNumberSettings } from "@workspace/db/shirt-numbers";
import { logger } from "./logger";
import { normalizeDraftStatus } from "./draft-status";
import { recordDraftRevision } from "./draft-revisions";
import { enrichDraft, isAutoPhoto } from "./draft-enrich";
import { autoReadyAtFor } from "./effective-draft-state";
import { templatedDesignFor } from "./kind-templates";

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
  /**
   * The season (start year) the card's event belongs to, for the player's
   * shirt number (season shirt numbers, KTD11). Player-centric callers set it
   * from their match, so a June match processed in August shows the number
   * worn that season; without it the season of "now" is used.
   */
  season?: number | null;
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

// ---------------------------------------------------------------------------
// Season shirt numbers (docs/plans/2026-10-06-001-feat-season-shirt-numbers-plan.md,
// U8 / KTD11)
// ---------------------------------------------------------------------------

/**
 * Card kinds that show the player's season shirt number. `debut` is NOT here:
 * it is the A Grade cap card and shows the cap number only (AE4).
 */
export const SHIRT_NUMBER_DRAFT_KINDS: ReadonlySet<string> = new Set([
  "century",
  "fiveFor",
  "milestone",
  "player",
  "tradingCard",
]);

/** What the register says about a draft's player, for stamping. */
export type DraftShirtNumberFacts = {
  /** The tenant's shirt-number feature switch (R1). */
  enabled: boolean;
  /** The player's linked entry number for the season, or null (R15). */
  number: string | null;
  /** Private players never get a number on a draft. */
  isPrivate: boolean;
};

/** True when a draft could carry a shirt number, so the register is worth reading. */
export function needsShirtNumberLookup(
  cardInput: Record<string, unknown>,
  playerId: number | null | undefined,
): boolean {
  return playerId != null && SHIRT_NUMBER_DRAFT_KINDS.has(String(cardInput.kind));
}

/** The season a draft's shirt number comes from: the caller's match season, else now's. */
export function shirtNumberSeasonFor(season: number | null | undefined, now: Date): number {
  return season ?? seasonStartYearFor(now);
}

/**
 * The card input with `shirtNumber` stamped or removed — pure, never mutates.
 * Stamped only for a player-centric kind with the feature on, a number, and a
 * public player; in EVERY other case the key is absent (feature switched off,
 * number cleared, a debut card), so a refresh drops a stale number rather than
 * keeping it. `facts` is null when there is no player or the lookup failed.
 */
export function stampShirtNumber(
  cardInput: Record<string, unknown>,
  facts: DraftShirtNumberFacts | null,
): Record<string, unknown> {
  const { shirtNumber: _previous, ...rest } = cardInput;
  void _previous;
  if (
    !facts ||
    !facts.enabled ||
    facts.isPrivate ||
    !facts.number ||
    !SHIRT_NUMBER_DRAFT_KINDS.has(String(cardInput.kind))
  ) {
    return rest;
  }
  return { ...rest, shirtNumber: facts.number };
}

/**
 * A register lookup for a draft: the facts, null when there is nothing to look up
 * (no player, or a kind that shows no number), or `"failed"` when the read threw.
 */
export type DraftShirtNumberLookup = DraftShirtNumberFacts | null | "failed";

/**
 * {@link stampShirtNumber} for an upsert, telling a failed lookup apart from "no
 * number". A failed lookup (e.g. the central privacy read unreachable) keeps
 * whatever the existing draft already carried, so a transient outage is never a
 * content change: no refresh revision, no stale flag on a posted card, no caption
 * churn. With no existing draft it omits the number (fail closed). Pure.
 */
export function stampShirtNumberForUpsert(
  cardInput: Record<string, unknown>,
  lookup: DraftShirtNumberLookup,
  existingCardInput: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (lookup !== "failed") return stampShirtNumber(cardInput, lookup);
  const rest = stampShirtNumber(cardInput, null);
  const kept = existingCardInput?.shirtNumber;
  if (
    (typeof kept !== "string" && typeof kept !== "number") ||
    kept === "" ||
    !SHIRT_NUMBER_DRAFT_KINDS.has(String(cardInput.kind))
  ) {
    return rest;
  }
  return { ...rest, shirtNumber: kept };
}

/**
 * Whether a player is private for public output. A platform privacy override
 * (tenant DB) wins; otherwise the crosswalk's central participant decides
 * (`central.players.is_private`). A native player with no crosswalk row has
 * no privacy flag. Read-only on central.
 */
async function draftPlayerIsPrivate(tenantId: number, playerId: number): Promise<boolean> {
  const mapped = await db
    .select({ participantId: playerIdMapTable.participantId })
    .from(playerIdMapTable)
    .where(and(eq(playerIdMapTable.tenantId, tenantId), eq(playerIdMapTable.playerId, playerId)));
  const ids = mapped.map((m) => m.participantId);
  if (ids.length === 0) return false;
  const overrides = await db
    .select({ isPrivate: playerPrivacyOverridesTable.isPrivate })
    .from(playerPrivacyOverridesTable)
    .where(eq(playerPrivacyOverridesTable.participantId, ids[0]!));
  if (overrides.length > 0) return overrides[0]!.isPrivate === true;
  const { isPrivateGroup } = await import("@workspace/db/central-queries");
  return isPrivateGroup(ids);
}

/**
 * The register facts for a draft's player and season. Only a LINKED entry
 * counts (held entries have no playerId, R16). Never throws: a failed read
 * (e.g. the central DB unreachable for the privacy check) returns `"failed"`;
 * see {@link stampShirtNumberForUpsert} for what the upsert does with it.
 */
async function loadDraftShirtNumberFacts(
  tenantId: number,
  playerId: number,
  season: number,
): Promise<DraftShirtNumberFacts | "failed"> {
  try {
    const settings = await getShirtNumberSettings(db, tenantId);
    if (!settings.enabled) return { enabled: false, number: null, isPrivate: false };
    const [entry] = await db
      .select({ number: shirtNumbersTable.number })
      .from(shirtNumbersTable)
      .where(
        and(
          eq(shirtNumbersTable.tenantId, tenantId),
          eq(shirtNumbersTable.season, season),
          eq(shirtNumbersTable.playerId, playerId),
        ),
      )
      .limit(1);
    const number = entry?.number ?? null;
    if (!number) return { enabled: true, number: null, isPrivate: false };
    return { enabled: true, number, isPrivate: await draftPlayerIsPrivate(tenantId, playerId) };
  } catch (err) {
    logger.warn({ err, tenantId, playerId, season }, "draft shirt-number lookup failed");
    return "failed";
  }
}

/** The register lookup for a draft (KTD11); null when the card cannot show a number. */
async function lookupShirtNumber(input: DraftUpsert): Promise<DraftShirtNumberLookup> {
  if (!needsShirtNumberLookup(input.cardInput, input.playerId)) return null;
  const season = shirtNumberSeasonFor(input.season, new Date());
  return loadDraftShirtNumberFacts(input.tenantId, input.playerId!, season);
}

/** `raw` with its card input stamped (or cleared) per KTD11, against the existing draft. */
const stampedFor = (
  raw: DraftUpsert,
  lookup: DraftShirtNumberLookup,
  existing: { cardInput: unknown } | null | undefined,
): DraftUpsert => ({
  ...raw,
  cardInput: stampShirtNumberForUpsert(
    raw.cardInput,
    lookup,
    existing?.cardInput as Record<string, unknown> | null | undefined,
  ),
});

export async function upsertDraftByKey(raw: DraftUpsert): Promise<DraftUpsertResult> {
  // Stamp the season shirt number on every call, BEFORE the change comparison:
  // an unposted draft picks up a newly assigned number on its next
  // sweep, a posted one goes stale, and an unchanged event stays unchanged. A
  // failed lookup keeps the existing draft's number (stampShirtNumberForUpsert).
  const lookup = await lookupShirtNumber(raw);
  let existing = await findDraftByKey(raw.tenantId, raw.sourceKey);
  if (!existing && raw.findLegacy) {
    const legacy = await raw.findLegacy();
    if (legacy) {
      const [keyed] = await db
        .update(socialDraftsTable)
        .set({ sourceKey: raw.sourceKey, family: legacy.family ?? raw.family })
        .where(eq(socialDraftsTable.id, legacy.id))
        .returning();
      existing = keyed;
    }
  }
  let input = stampedFor(raw, lookup, existing);

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
    // With card kind templates on, the draft copies its kind's template
    // instead of using a pack (ADR-002).
    const templated = await templatedDesignFor(input.tenantId, input.cardInput.kind, e.packId);
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
          ...(templated ?? {}),
        })
        .returning();
      return { action: "inserted", draft: row };
    } catch (err) {
      // A concurrent sweep inserted the same key first: fall through to update.
      if ((err as { code?: string }).code !== "23505") throw err;
      existing = await findDraftByKey(input.tenantId, input.sourceKey);
      if (!existing) throw err;
      input = stampedFor(raw, lookup, existing);
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
  // A refresh keeps the draft's pack or template copy. It regenerates the caption only if no
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
    // New data can change how a templated card lays out: it owes a fresh
    // layout check before automation can touch it again (KTD10).
    ...(current.templateVersion !== null ? { layoutCheckPending: true } : {}),
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
  /** The "Stumps, Day 1" card of a two-day game in progress (one per match). */
  centralStumps: (centralMatchId: number) => `stumps:central:${centralMatchId}:day1`,
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
