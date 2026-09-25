import { and, desc, eq } from "drizzle-orm";
import { db, matchesTable, socialSettingsTable } from "@workspace/db";
import { notEmptyFixture } from "./grades-helpers";
import {
  runPostCommitSocial,
  runBatchPostCommitSocial,
  type PostCommitSocialOpts,
  type BatchPostCommitSocialOpts,
  type Logger as PostCommitLogger,
} from "./post-commit-social";

import { generateMatchSummaryDrafts, type MatchSummarySource } from "./match-summary-drafter";
import { generateMatchDayDrafts } from "./engines/match-day";
import { generateTeamListDrafts } from "./engines/team-list";
import { ensureSettings } from "./social-cards-helpers";
import { familyAllows, resolveFamilyConfig } from "./social-families";
import { generateRoundUpDrafts } from "./roundup";
import { tenantIsCentral, getTenantCentralClubId, NATIVE_STATS_TENANT_ID } from "./tenant";
import { loadAutoPost, persistDueDrafts } from "./effective-draft-state";
import { notifyDraftsReady } from "./draft-notifications";
import { fillMissingDraftPhotos } from "./draft-enrich";

type Logger = PostCommitLogger & {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
};

/**
 * One drafting sweep for every club type (Social Studio, KTD10).
 *
 * - `import` / `batch`: a native import just committed — the post-commit
 *   engines run against the tenant's own tables.
 * - `scheduled`: the periodic job. A central-data club drafts match summaries
 *   for central matches past its watermark; every club gets its match-day and
 *   team-list cards.
 * - `fixtures`: the fixtures projection just refreshed a tenant's schedule —
 *   only the fixture-driven engines run.
 *
 * Every engine writes through source keys, so running a sweep twice drafts
 * nothing new.
 */
export type SweepScope =
  | ({ kind: "import" } & Omit<PostCommitSocialOpts, "tenantId" | "logger">)
  | ({ kind: "batch" } & Omit<BatchPostCommitSocialOpts, "tenantId" | "logger">)
  | { kind: "scheduled"; now?: Date }
  | { kind: "fixtures"; now?: Date };

export type SweepSummary = {
  centralMatches: number;
  matchSummaries: number;
  matchDay: number;
  teamLists: number;
  /** Drafts moved to ready because their auto-post deadline passed. */
  promoted: number;
};

/** Most central matches drafted in one sweep. */
export const CENTRAL_SWEEP_LIMIT = 40;

/**
 * A central match dated further back than this is history, not news — even if
 * its id is past the watermark (e.g. a reload of the central dataset).
 */
export const CENTRAL_RECENT_MS = 21 * 24 * 60 * 60 * 1000;

export async function runDraftSweep(
  tenantId: number,
  scope: SweepScope,
  logger: Logger,
): Promise<SweepSummary> {
  const summary: SweepSummary = {
    centralMatches: 0,
    matchSummaries: 0,
    matchDay: 0,
    teamLists: 0,
    promoted: 0,
  };

  if (scope.kind === "import") {
    const { kind: _kind, ...opts } = scope;
    await runPostCommitSocial({ ...opts, tenantId, logger });
    return summary;
  }
  if (scope.kind === "batch") {
    const { kind: _kind, ...opts } = scope;
    await runBatchPostCommitSocial({ ...opts, tenantId, logger });
    return summary;
  }

  const now = scope.now ?? new Date();
  if (scope.kind === "scheduled" && (await tenantIsCentral(tenantId))) {
    try {
      const central = await sweepCentralMatches(tenantId, now, logger);
      summary.centralMatches = central.seen;
      summary.matchSummaries = central.drafted;
    } catch (err) {
      logger.error({ err, tenantId }, "central draft sweep failed");
    }
  }

  try {
    summary.matchDay = (await generateMatchDayDrafts(tenantId, now)).drafted;
  } catch (err) {
    logger.error({ err, tenantId }, "match-day drafts failed");
  }
  try {
    summary.teamLists = (await generateTeamListDrafts(tenantId, now)).drafted;
  } catch (err) {
    logger.error({ err, tenantId }, "team-list drafts failed");
  }

  try {
    await fillMissingDraftPhotos(tenantId);
  } catch (err) {
    logger.error({ err, tenantId }, "draft photo fill failed");
  }

  if (scope.kind === "scheduled") {
    // Auto-post (KTD4): store what already reads as ready, then tell the club
    // once for the whole batch.
    try {
      if ((await loadAutoPost(tenantId)).enabled) {
        const promoted = await persistDueDrafts(tenantId, now);
        summary.promoted = promoted.length;
        await notifyDraftsReady(tenantId, promoted, logger);
      }
    } catch (err) {
      logger.error({ err, tenantId }, "auto-post promotion failed");
    }
    await db
      .update(socialSettingsTable)
      .set({ lastSweepAt: now })
      .where(eq(socialSettingsTable.tenantId, tenantId));
  }
  return summary;
}

/**
 * Draft match summaries for a central-data club's matches past its watermark,
 * then advance the watermark. The first sweep only records the club's newest
 * match, so switching drafting on never floods the queue with history.
 */
export async function sweepCentralMatches(
  tenantId: number,
  now: Date,
  logger: Logger,
): Promise<{ seen: number; drafted: number }> {
  const { centralClubMaxMatchId, centralClubMatchesAfter } =
    await import("@workspace/db/central-queries");
  const settings = await ensureSettings(tenantId);
  const clubId = await getTenantCentralClubId(tenantId);

  if (settings.centralSweepWatermark == null) {
    await setWatermark(tenantId, await centralClubMaxMatchId(clubId));
    return { seen: 0, drafted: 0 };
  }

  const { matches, lastSeenId } = await centralClubMatchesAfter(
    clubId,
    settings.centralSweepWatermark,
    CENTRAL_SWEEP_LIMIT,
  );
  if (lastSeenId == null) return { seen: 0, drafted: 0 };

  const recent = matches.filter((m) => {
    const t = m.matchDate ? Date.parse(m.matchDate) : NaN;
    return Number.isNaN(t) || now.getTime() - t <= CENTRAL_RECENT_MS;
  });
  if (recent.length < matches.length) {
    logger.info(
      { tenantId, skipped: matches.length - recent.length },
      "central sweep skipped matches dated outside the recent window",
    );
  }

  const result = await generateMatchSummaryDrafts(
    tenantId,
    recent.map((m) => m.matchId),
    { kind: "central", clubId, seenAt: now },
  );
  if (result.errors.length > 0) {
    logger.warn({ tenantId, errors: result.errors }, "central match summary drafts had errors");
  }
  await draftCentralRoundUps(tenantId, settings, recent, logger);
  await setWatermark(tenantId, lastSeenId);
  return { seen: matches.length, drafted: result.drafted };
}

/**
 * The weekly round-up for a central-data club: once per (grade, season) that
 * just had a new match, exactly as a native import triggers one per affected
 * grade. Gated by the round-up family; keyed by the latest round, so the same
 * round refreshes its cards and the next round gets its own.
 */
async function draftCentralRoundUps(
  tenantId: number,
  settings: Parameters<typeof resolveFamilyConfig>[0],
  recent: { grade: string; season: number | null }[],
  logger: Logger,
): Promise<void> {
  const families = resolveFamilyConfig(settings);
  if (!families.roundup.enabled) return;
  const pairs = new Map<string, { grade: string; season: number }>();
  for (const m of recent) {
    if (m.season != null) pairs.set(`${m.season}|${m.grade}`, { grade: m.grade, season: m.season });
  }
  for (const { grade, season } of pairs.values()) {
    if (!familyAllows(families, "roundup", grade, false)) continue;
    try {
      await generateRoundUpDrafts(tenantId, grade, season, null);
    } catch (err) {
      logger.error({ err, tenantId, grade, season }, "central round-up drafts failed");
    }
  }
}

/** Most past matches drafted by one backfill call. */
export const BACKFILL_MATCH_LIMIT = 60;

export type BackfillMatchesInput = {
  /** Season start year (2024 = 2024/25). */
  season: number;
  grade?: string;
  /** Only these matches — still limited to the club's own senior matches in the season. */
  matchIds?: number[];
};

export type BackfillMatchesResult = {
  considered: number;
  drafted: number;
  skipped: number;
  capped: boolean;
  errors: string[];
};

/**
 * Draft Match Result cards for a club's PAST matches, on demand (the sweep only
 * ever drafts what's new). Candidates are the club's own senior matches for the
 * season (and grade), newest first:
 *   - a central-data club: its central matches — junior / pathway grades never
 *     map, so they never appear (juniors isolation); explicit `matchIds` are
 *     intersected with that list, so another club's match id drafts nothing;
 *   - the native club (tenant #1): its own match tables;
 *   - any other tenant: nothing (the native tables aren't theirs).
 * Drafting goes through the same engine and source keys as the sweep, so a
 * re-run refreshes nothing and adds nothing. The sweep watermark is never read
 * or moved.
 */
export async function backfillMatchDrafts(
  tenantId: number,
  input: BackfillMatchesInput,
  now: Date = new Date(),
): Promise<BackfillMatchesResult> {
  const pick = (ids: number[]) => {
    const wanted = input.matchIds ? new Set(input.matchIds) : null;
    const chosen = wanted ? ids.filter((id) => wanted.has(id)) : ids;
    return {
      ids: chosen.slice(0, BACKFILL_MATCH_LIMIT),
      capped: chosen.length > BACKFILL_MATCH_LIMIT,
    };
  };

  let ids: number[];
  let capped: boolean;
  let source: MatchSummarySource;
  if (await tenantIsCentral(tenantId)) {
    const { centralClubMatches } = await import("@workspace/db/central-queries");
    const clubId = await getTenantCentralClubId(tenantId);
    const rows = await centralClubMatches(clubId, { grade: input.grade, season: input.season });
    ({ ids, capped } = pick(rows.map((r) => r.id)));
    source = { kind: "central", clubId, seenAt: now };
  } else if (tenantId === NATIVE_STATS_TENANT_ID) {
    const conditions = [eq(matchesTable.season, input.season), notEmptyFixture];
    if (input.grade) conditions.push(eq(matchesTable.grade, input.grade));
    const rows = await db
      .select({ id: matchesTable.id })
      .from(matchesTable)
      .where(and(...conditions))
      .orderBy(desc(matchesTable.id));
    ({ ids, capped } = pick(rows.map((r) => r.id)));
    source = { kind: "native" };
  } else {
    return { considered: 0, drafted: 0, skipped: 0, capped: false, errors: [] };
  }

  const result = await generateMatchSummaryDrafts(tenantId, ids, source);
  return { considered: ids.length, ...result, capped };
}

async function setWatermark(tenantId: number, matchId: number): Promise<void> {
  await db
    .update(socialSettingsTable)
    .set({ centralSweepWatermark: matchId })
    .where(eq(socialSettingsTable.tenantId, tenantId));
}
